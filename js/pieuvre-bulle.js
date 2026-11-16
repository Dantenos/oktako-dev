// La bulle de la mini-pieuvre : le visiteur dit qui il est, pose sa question, et elle répond avec des passages du site adaptés
// à ce profil, chacun avec son lien (docs/PIEUVRE-REPONSES.md). Tout se passe ici, dans le navigateur : la mémoire se charge au premier clic, une fois,
// et plus rien ne part ensuite. La voie B (une question à l'IA, docs/PIEUVRE-CONTRAT-IA.md) n'existe que si le build l'a mise dans la
// page, et toute panne y rend la main à la voie A, sans un mot : le serveur peut tomber, rien n'en dépend.
const $ = (s, r = document) => r.querySelector(s);
const INDEX = new URL('../modele/pieuvre-index.json', import.meta.url);
// La mémoire de l'essai ne fait pas foi (le serveur compte) : elle évite seulement de montrer un bouton qui sera refusé.
const CLE_ESSAI = 'mt-pieuvre-ia-essai';
const DELAI_ETAT = 2000, DELAI_QUESTION = 15000, QUESTION_MAX = 300, REPONSE_MAX = 800;
const ANCRE = /^[a-z0-9-]+$/;
// L'écart avec la pieuvre et le bord de l'écran (px).
const MARGE = 8;

function essaiPris() { try { return localStorage.getItem(CLE_ESSAI) === '1'; } catch { return false; } }
function noterEssai() { try { localStorage.setItem(CLE_ESSAI, '1'); } catch { /* le serveur compte de toute façon */ } }
async function appeler(url, delai, options = {}) {
  const coupe = new AbortController(), t = setTimeout(() => coupe.abort(), delai);
  try { return await fetch(url, { ...options, signal: coupe.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }); } finally { clearTimeout(t); }
}

// La rencontre (lot mascotte-offre-demo) : « Rencontrer la mascotte » ouvre la même bulle sur ce qui la prouve, pas sur une question. Elle
// réagit à trois gestes du visiteur (un bond puis un regard à l'arrivée, un salut quand on la touche, un bras tendu vers la lettre), dit qui
// l'a faite, et garde la question pour après. rencontre : { avant(), quitter({ accueil, historique }), filmVu(), mouvementReduit() }, le
// raccord avec la page (js/app.js) : c'est elle qui sait fermer un panneau, tenir l'historique et rendre l'accueil.
export function creerBulle({ annoncer, surLien, vue, approcher, eloigner, rencontre: page = {} }) {
  const el = $('#bulle');
  const titre = $('#bulle-titre'), champ = $('#bulle-question'), zone = $('#bulle-reponse');
  const boiteChapeaux = $('#bulle-chapeaux'), listeChapeaux = $('#bulle-chapeaux-liste');
  const suite = $('#bulle-suite'), profils = el.querySelectorAll('[data-profil]'), groupes = el.querySelectorAll('[data-groupe]');
  const blocIa = $('#bulle-ia-bloc'), boutonIa = $('#bulle-ia'), finIa = $('#bulle-ia-fin');
  const passerelle = el.dataset.passerelle;
  // Le lien de la bulle vers la rencontre n'est pas un déclencheur : il est DANS la bulle, et ne l'ouvre ni ne la ferme.
  const declencheurs = () => document.querySelectorAll('[data-pieuvre-question], [data-rencontre]:not(.bulle__rencontrer)');
  const blocRencontre = $('#bulle-rencontre'), phrase = $('#bulle-rencontre-phrase'), repli = $('#bulle-repli'), reactions = $('#bulle-reactions');
  const aide = reactions.querySelector('.bulle__aide'), fige = $('#bulle-fige'), ligneReactions = reactions.querySelector('.bulle__ligne-reactions'), offre = $('#bulle-offre');
  const essayer = el.querySelector('[data-rencontre-action="essayer"]'), boutonOffre = el.querySelector('[data-rencontre-action="offre"]');
  const titreQuestion = titre.textContent, aideSouris = aide.textContent;
  let memoire = null, retour = null, tour = 0, demande = 0, iaSondee = false, pieuvre = null, profil = null;
  // La rencontre dure jusqu'à la fermeture, même si le visiteur passe à sa question : Échap rend alors l'accueil, d'une seule touche.
  let enRencontre = false;

  // Le panneau recopie la rubrique Contact (et la fiche du cas d'étude) : ses boutons sont nés visibles, puisqu'on les montre avant toute copie.
  for (const b of declencheurs()) { b.hidden = false; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'bulle'); }
  for (const b of el.querySelectorAll('.bulle__rencontrer')) b.hidden = false;

  // Une seule fois : l'échec, lui, ne se mémorise pas, le prochain essai retentera.
  const charger = () => (memoire ??= Promise.all([
    import('./pieuvre-recherche.js'),
    fetch(INDEX).then((r) => { if (!r.ok) throw new Error(`index ${r.status}`); return r.json(); }),
  ]).then(([m, ix]) => { if (ix.version !== m.VERSION_INDEX) throw new Error('index d’une autre version'); return { chercher: m.chercher, ix }; })
    .catch((e) => { memoire = null; throw e; }));

  const texte = (balise, classe, contenu) => { const n = document.createElement(balise); n.className = classe; n.textContent = contenu; return n; };
  const lien = (ancre, libelle) => { const a = document.createElement('a'); a.href = '#' + ancre; a.textContent = libelle; return a; };
  function occupe(oui) { zone.setAttribute('aria-busy', String(oui)); }
  // Le passage n'est jamais du HTML : textContent, et une balise dans un passage reste du texte.
  function montrerPassages(phrase, passages) {
    const liste = document.createElement('ol'); liste.className = 'bulle__passages';
    for (const p of passages) {
      const li = document.createElement('li'), source = texte('p', 'bulle__source', `${zone.dataset.source} `);
      source.append(lien(p.a, p.l));
      li.append(texte('strong', 'bulle__passage-titre', p.t), texte('blockquote', 'bulle__passage', p.x), source);
      liste.append(li);
    }
    const autres = texte('button', 'bulle__autres', zone.dataset.autres);
    autres.type = 'button';
    zone.replaceChildren(texte('p', 'bulle__ton', phrase), liste, autres);
    // Une réponse tient la place : les suggestions se replient, sinon la bulle couvrirait la pièce.
    el.classList.add('bulle--repondue');
  }
  async function repondre(question) {
    const n = ++demande; occupe(true);
    el.classList.remove('bulle--repondue');
    zone.replaceChildren(texte('p', 'bulle__ton', zone.dataset.cherche));
    let m;
    try { m = await charger(); } catch (e) {
      console.warn('pieuvre : mémoire indisponible :', e.message);
      if (n === demande) { zone.replaceChildren(texte('p', 'bulle__ton', zone.dataset.panne)); occupe(false); }
      return;
    }
    if (n !== demande) return;
    const { passages, raison } = m.chercher(m.ix, question, { profil }), ton = m.ix.ton;
    // Ni la question ni un mot de la question ne sont répétés : elle n'a rien à faire dans la réponse.
    if (passages.length) montrerPassages(ton.trouve[tour++ % ton.trouve.length], passages);
    else zone.replaceChildren(texte('p', 'bulle__ton', raison === 'vide' ? ton.vide : ton.rien));
    occupe(false);
  }

  // Le profil vient d'abord : il décide des suggestions et des rubriques lues en premier. Changer d'avis efface la réponse.
  function choisirProfil(id) {
    ++demande; profil = id;
    for (const b of profils) b.setAttribute('aria-pressed', String(b.dataset.profil === id));
    for (const g of groupes) g.hidden = g.dataset.groupe !== id;
    suite.hidden = false;
    el.classList.remove('bulle--repondue'); zone.replaceChildren(); occupe(false);
    annoncer($(`[data-profil="${id}"]`, el).textContent + ' : la bulle vous propose ses questions.');
    if (!matchMedia('(pointer: coarse)').matches) champ.focus({ preventScroll: true });
  }

  // --- La voie B : présente seulement si le build l'a écrite dans la page. ---
  function fermerIa(utilisee) {
    if (blocIa) blocIa.hidden = true;
    if (finIa) finIa.hidden = !utilisee;
  }
  async function sonderIa() {
    if (!passerelle || iaSondee) return;
    iaSondee = true;
    if (essaiPris()) { fermerIa(true); return; }
    try {
      const r = await appeler(`${passerelle}/etat`, DELAI_ETAT), j = await r.json();
      if (r.ok && j.version === 1 && j.ouvert === true) blocIa.hidden = false;
    } catch { /* passerelle absente : le bouton reste caché */ }
  }
  // Une source vaut si elle mène quelque part ici : l'adresse vient d'un serveur, la page ne lui fait pas confiance.
  const sourcesValides = (l) => (Array.isArray(l) ? l : []).filter((s) => typeof s?.titre === 'string' && s.titre && typeof s.ancre === 'string' && ANCRE.test(s.ancre)
    && document.getElementById(s.ancre)).slice(0, 3);
  function montrerIa(reponse, sources) {
    const liste = document.createElement('ul'); liste.className = 'bulle__liste bulle__sources';
    for (const s of sources) {
      const li = document.createElement('li');
      li.append(lien(s.ancre, s.titre));
      liste.append(li);
    }
    zone.replaceChildren(texte('p', 'bulle__passage', reponse), texte('p', 'bulle__mention', finIa.dataset.avertissement), liste);
  }
  async function consulter() {
    const question = champ.value.trim().slice(0, QUESTION_MAX);
    if (!question) { champ.focus(); return repondre(''); }
    boutonIa.disabled = true; occupe(true); ++demande;
    zone.replaceChildren(texte('p', 'bulle__ton', zone.dataset.cherche));
    let r = null, j = null;
    try {
      r = await appeler(`${passerelle}/question`, DELAI_QUESTION, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, profil }) });
      j = await r.json();
    } catch { /* hors contrat : la voie A répond */ }
    boutonIa.disabled = false;
    const sources = r?.ok && j?.version === 1 ? sourcesValides(j.sources) : [];
    const reponse = typeof j?.reponse === 'string' ? j.reponse.trim().slice(0, REPONSE_MAX) : '';
    // Le 200 consomme l'essai, avec ou sans réponse montrable : le serveur l'a compté.
    if (r?.ok && j?.version === 1) noterEssai();
    if (r?.status === 429 && j?.raison === 'deja-pose') noterEssai();
    if (reponse && sources.length) { fermerIa(true); occupe(false); montrerIa(reponse, sources); champ.value = ''; return undefined; }
    fermerIa(false);
    return repondre(question);
  }

  // --- Ouvrir, fermer ---
  const estOuverte = () => !el.hidden;
  // Une bulle sort de la pieuvre, elle ne la couvre pas : à sa droite si la place y est, sinon à sa gauche. Sur téléphone,
  // sans pieuvre, ou sans la vue de la scène, elle garde sa place de feuille d'angle.
  function ancrer() {
    el.style.removeProperty('left'); el.style.removeProperty('right');
    const v = pieuvre && vue?.();
    if (!v || !pieuvre.rectangle || matchMedia('(max-width: 760px)').matches) return;
    const z = pieuvre.rectangle(v.camera, v.L, v.Hh), l = el.offsetWidth, L = document.documentElement.clientWidth;
    el.style.left = `${Math.max(MARGE, z.droite + MARGE + l <= L - MARGE ? z.droite + MARGE : z.gauche - MARGE - l)}px`;
    el.style.right = 'auto';
  }
  function ouvrir(ici = document.activeElement) {
    if (estOuverte()) return;
    retour = ici && ici !== document.body ? ici : null;
    el.hidden = false;
    ancrer();
    for (const b of declencheurs()) b.setAttribute('aria-expanded', 'true');
    // La rencontre ne charge pas la mémoire : elle ne sert qu'à la question, qui peut ne jamais venir.
    if (el.dataset.mode !== 'rencontre') preparerQuestion();
    // Au doigt, le champ ferait surgir le clavier sur les suggestions : le visiteur choisit, il n'écrit pas forcément.
    // Sinon : la première action de la rencontre, le premier choix de profil, ou le champ si le profil est déjà dit.
    (matchMedia('(pointer: coarse)').matches ? titre : el.dataset.mode === 'rencontre' ? el.querySelector('.bulle__action:not([hidden])') : profil ? champ : profils[0]).focus({ preventScroll: true });
  }
  function preparerQuestion() { charger().catch(() => { /* la réponse le dira, si question il y a */ }); sonderIa(); }
  // Deux contenus pour une bulle : la rencontre, ou la question (profils, champ, couvre-chefs). Le titre suit.
  function montrerMode(m) {
    el.dataset.mode = m; blocRencontre.hidden = m !== 'rencontre';
    titre.textContent = m === 'rencontre' ? blocRencontre.dataset.titre : titreQuestion;
  }
  // Vivante : la pièce et son personnage sont là. Sinon (ni WebGL, ni modèle, ou pas encore chargée), une image et les mêmes suites.
  const vivante = () => !!pieuvre && !!vue?.();
  function preparerRencontre() {
    phrase.textContent = page.filmVu?.() ? blocRencontre.dataset.phraseFilm : phrase.dataset.phrase;
    const v = vivante();
    repli.hidden = v; essayer.hidden = !v;
    for (const [b, bloc] of [[essayer, reactions], [boutonOffre, offre]]) { b.setAttribute('aria-expanded', 'false'); bloc.hidden = true; }
  }
  async function rencontrer(ici = document.activeElement) {
    // Depuis la bulle de question (lot mascotte-entree-bulle) : le focus reviendra à ce qui avait ouvert la question.
    const depuisBulle = estOuverte(), depart = depuisBulle ? retour : ici && ici !== document.body ? ici : null;
    // Déjà ouverte devant la pieuvre : la question devient la rencontre sur place, sans refermer puis rouvrir la vue.
    if (depuisBulle && document.body.classList.contains('pieuvre-proche')) {
      page.avant?.();
      enRencontre = true; montrerMode('rencontre'); preparerRencontre(); ancrer();
      (matchMedia('(pointer: coarse)').matches ? titre : el.querySelector('.bulle__action:not([hidden])')).focus({ preventScroll: true });
      reconnaitre();
      return;
    }
    if (depuisBulle) fermer({ focus: false });
    page.avant?.();
    enRencontre = true; montrerMode('rencontre'); preparerRencontre();
    await approcher?.();
    // Fermée pendant l'approche (retour du navigateur) : rien à ouvrir.
    if (!enRencontre) return;
    ouvrir(depart);
    reconnaitre();
  }
  // À l'arrivée, elle reconnaît le visiteur : un petit bond, puis elle le regarde. En mouvement réduit, rien ne bouge : sa pose fixe reste.
  function reconnaitre() { if (vivante() && !page.mouvementReduit?.()) pieuvre.sautiller?.() || pieuvre.regarderVisiteur?.(); }
  // Une réaction : toujours causée par un geste, et dite au lecteur d'écran, qui ne la voit pas.
  const DIT = { regard: 'Elle vous regarde.', salut: 'Elle vous salue.', montrer: 'Elle vous montre où écrire à Édouard.' };
  function reagir(r) {
    if (!vivante() || page.mouvementReduit?.()) return;
    if (r === 'regard') pieuvre.sautiller?.() || pieuvre.regarderVisiteur?.();
    else pieuvre.evenement(r === 'salut' ? 'caresse' : 'montrer');
    annoncer(DIT[r]);
  }
  function deplier(bouton, bloc) {
    const ouvert = bloc.hidden;
    bloc.hidden = !ouvert; bouton.setAttribute('aria-expanded', String(ouvert));
    if (bloc === reactions && ouvert) {
      // Au doigt, pas de pointeur à suivre ; mouvement réduit : elle garde sa pose, et le bouton ne promet rien qu'elle ne fera pas.
      const reduit = !!page.mouvementReduit?.();
      aide.textContent = matchMedia('(hover: none)').matches ? aide.dataset.tactile : aideSouris;
      aide.hidden = reduit; ligneReactions.hidden = reduit; fige.hidden = !reduit;
    }
    // Le choix d'une mascotte pour son site : elle tend le bras vers la lettre, là où l'on écrit, et la bulle donne l'offre et le contact.
    if (bloc === offre && ouvert) reagir('montrer');
    return ouvert;
  }
  // accueil : fermer la rencontre ET rendre l'accueil (Échap, la croix, « Retour à l'accueil ») ; historique : la page vient de
  // reculer d'elle-même (bouton Précédent), elle n'a plus d'entrée à retirer.
  function fermer({ focus = true, accueil = false, historique = false } = {}) {
    // Encore en approche : la rencontre s'arrête là, et rencontrer() n'ouvrira rien.
    if (!estOuverte()) { if (enRencontre) { enRencontre = false; montrerMode('question'); eloigner?.(); page.quitter?.({ accueil, historique }); } return; }
    el.hidden = true;
    const etaitRencontre = enRencontre; enRencontre = false; montrerMode('question');
    eloigner?.();
    for (const b of declencheurs()) b.setAttribute('aria-expanded', 'false');
    if (etaitRencontre) page.quitter?.({ accueil, historique });
    if (focus) (retour?.isConnected && retour.offsetParent !== null ? retour : $(etaitRencontre ? '.intro__rencontre' : '#pieuvre-question'))?.focus({ preventScroll: true });
  }
  // La vue s'approche d'abord, la bulle s'ouvre à l'arrivée : ancrée sur elle, elle ne saute pas. Le focus d'avant se relève ici, avant que le travelling ne le perde.
  async function aller() {
    const ici = document.activeElement;
    await approcher?.();
    ouvrir(ici);
  }
  const basculer = () => (estOuverte() ? fermer() : aller());

  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-rencontre]')) { e.preventDefault(); rencontrer(e.target.closest('[data-rencontre]')); return; }
    if (e.target.closest?.('[data-pieuvre-question]')) basculer();
  });
  $('#bulle-fermer').addEventListener('click', () => fermer({ accueil: enRencontre }));
  $('#bulle-accueil').addEventListener('click', () => fermer({ accueil: true }));
  $('#bulle-form').addEventListener('submit', (e) => { e.preventDefault(); repondre(champ.value); });
  el.addEventListener('click', (e) => {
    const action = e.target.closest('[data-rencontre-action]'), reaction = e.target.closest('[data-reaction]');
    if (action?.dataset.rencontreAction === 'essayer') { deplier(action, reactions); return; }
    if (action?.dataset.rencontreAction === 'offre') { deplier(action, offre); return; }
    // La question, après la rencontre : le choix du profil vient maintenant, et la mémoire se charge.
    if (action?.dataset.rencontreAction === 'question') { montrerMode('question'); preparerQuestion(); (matchMedia('(pointer: coarse)').matches ? titre : profils[0]).focus({ preventScroll: true }); return; }
    if (reaction) { reagir(reaction.dataset.reaction); return; }
    // Le cas d'étude et l'offre : la page les ouvre, comme le lien d'une réponse ; la rencontre se ferme sans rendre l'accueil.
    if (e.target.closest('[data-rencontre-lien]')) { const d = retour; fermer({ focus: false }); setTimeout(() => surLien(d), 0); return; }
    if (e.target.closest('.bulle__autres')) { el.classList.remove('bulle--repondue'); e.target.remove(); el.querySelector('.bulle__suggestion')?.focus(); return; }
    const p = e.target.closest('[data-profil]'), s = e.target.closest('[data-bulle-question]');
    if (p) { choisirProfil(p.dataset.profil); return; }
    if (s) { champ.value = s.dataset.bulleQuestion; repondre(champ.value); return; }
    // Le lien ouvre sa rubrique par le routeur de la page, qui passe après ce clic : la bulle s'efface, et le retour du
    // panneau vise ce qui l'avait ouverte, pas un lien devenu invisible.
    if (e.target.closest('.bulle__reponse a')) { const d = retour; fermer({ focus: false }); setTimeout(() => surLien(d), 0); }
  });
  boutonIa?.addEventListener('click', consulter);
  // Au doigt, un toucher ailleurs replie la bulle, sauf sur la scène, où toucher la pieuvre la bascule déjà.
  document.addEventListener('pointerdown', (e) => {
    if (estOuverte() && matchMedia('(max-width: 760px)').matches && !el.contains(e.target) && !e.target.closest?.('[data-pieuvre-question], [data-rencontre], canvas')) fermer({ focus: false, accueil: enRencontre });
  });
  // Comme le panneau du ciel : en capture, Échap ferme la bulle et rien d'autre (ni le panneau dessous, ni la vue). Exception voulue :
  // la rencontre, qui a déplacé la vue, rend l'accueil avec la même touche ; le visiteur n'a pas à deviner un second appui.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && estOuverte()) { e.preventDefault(); e.stopPropagation(); fermer({ accueil: enRencontre }); } }, true);
  // Le clavier du téléphone couvre le bas de l'écran : la bulle remonte d'autant.
  const ecran = window.visualViewport;
  ecran?.addEventListener('resize', () => el.style.setProperty('--bulle-clavier', `${Math.max(0, Math.round(innerHeight - ecran.height - ecran.offsetTop))}px`));

  return {
    ouvrir: aller, fermer, basculer, rencontrer,
    get ouverte() { return estOuverte(); },
    get enRencontre() { return enRencontre; },
    // La pieuvre du bureau, une fois chargée (js/scene/pieuvre.js) : son clic ouvre la bulle, et le couvre-chef s'y choisit.
    // Sans elle, la bulle marche : les boutons de la page l'ouvrent.
    brancher(p) {
      pieuvre = p;
      // Pendant la rencontre, la toucher est l'une de ses réactions : elle salue, et la bulle reste.
      p.clic = () => { p.evenement('caresse'); if (enRencontre && estOuverte()) { annoncer(DIT.salut); return; } basculer(); };
      if (!p.chapeaux || !p.choisirChapeau) return;
      listeChapeaux.replaceChildren(...p.chapeaux.map(({ id, court }) => {
        const b = texte('button', 'bulle__chapeau', court);
        b.type = 'button'; b.dataset.chapeau = id; b.addEventListener('click', () => p.choisirChapeau(id));
        return b;
      }));
      const marquer = () => { for (const b of listeChapeaux.children) b.setAttribute('aria-pressed', String(b.dataset.chapeau === p.chapeau())); };
      p.surChapeau((court, phrase, garde) => { marquer(); if (garde) annoncer('La pieuvre porte ' + phrase); });
      boiteChapeaux.hidden = false;
    },
  };
}
