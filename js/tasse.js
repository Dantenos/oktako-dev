// La plongée dans la tasse, côté page : un dialogue par-dessus la scène. Les phrases écrites dans la mousse SONT
// les boutons : chacune porte un vrai lien HTML posé exactement sur elle, transparent, focusable, lu par les
// lecteurs d'écran, avec un contour de focus visible. En mouvement réduit, le texte du lien devient visible et net.
// Les liens viennent du build (config) : rien n'est chargé de la plateforme, ni script, ni widget, ni traceur.
// Le sucre (lot portfolio-sucre) : un vrai bouton posé sur le morceau, à côté de la tasse. Avant lui, la mousse
// n'écrit que le rendez-vous ; il tombe, fond, et la mousse écrit en plus le pourboire (ou « Merci ! » sans lien).
import { creerFinFilm } from './film-cafe-fin.js';
import { creerBas, texteEchap } from './fermer.js';
export function creerTasse({ scene, mouvementReduit, annoncer, son, auRetour, film = () => null }) {
  let phase = 'repos', racine = null, retour = null, liens = [], boutonSucre = null, focusAvant = null, prepare = false, sucre = false;
  let lienCarte = null, finFilm = null;
  const inerties = new Map();
  const modele = document.getElementById('cafe-propositions');
  const toutes = () => (modele ? [...modele.content.querySelectorAll('[data-proposition]')] : []);
  // Ce que la mousse écrit maintenant : avant le sucre, seulement ce qui ne l'attend pas.
  const propositions = () => toutes().filter((p) => sucre || !p.hasAttribute('data-apres-sucre'));
  const texte = (p) => p.textContent.trim();
  // Le sucre n'a de sens que s'il fait apparaître quelque chose.
  const avecSucre = () => !sucre && toutes().some((p) => p.hasAttribute('data-apres-sucre'));
  // La mousse est peinte une fois, hors du clic : dès que la scène est prête, ou au plus tard à l'entrée.
  function preparer() {
    if (prepare || !scene()) return;
    scene().preparerCafe(propositions().map(texte)); prepare = true;
  }
  // Chaque lien recouvre sa phrase de mousse dans la vue d'arrivée (rectangles calculés par la scène, sans rendu) ;
  // le bouton du sucre recouvre le morceau (48 px au moins : un doigt doit pouvoir le prendre).
  function placer() {
    if (!racine) return;
    const rects = scene()?.rectanglesCafe() || [];
    liens.forEach((a, i) => {
      const r = rects[i]; if (!r) return;
      Object.assign(a.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: `${Math.min(30, r.height / (r.lignes * 1.3))}px` });
    });
    placerCarte();
    const s = boutonSucre && scene()?.rectangleSucre();
    if (s) {
      const l = Math.max(48, s.width), h = Math.max(48, s.height);
      Object.assign(boutonSucre.style, { left: `${s.left + s.width / 2 - l / 2}px`, top: `${s.top + s.height / 2 - h / 2}px`, width: `${l}px`, height: `${h}px` });
    }
  }
  // La carte de visite : le lien recouvre la carte dans la vue d'arrivée. Écran trop étroit pour la voir sans recadrer : le même lien, écrit, au bas de l'image.
  function placerCarte() {
    if (!lienCarte) return;
    const r = scene()?.rectangleCarte();
    lienCarte.classList.toggle('tasse__carte--ecrite', !r);
    if (r) Object.assign(lienCarte.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    else for (const k of ['left', 'top', 'width', 'height']) lienCarte.style[k] = '';
  }
  function creerCarte() {
    const a = document.createElement('a'); a.className = 'tasse__carte'; a.href = '#contact'; a.hidden = true; a.textContent = 'Me contacter';
    a.setAttribute('aria-label', 'Me contacter : la carte de visite posée sur le plateau');
    // Le plateau se quitte d'abord : le routeur ne déplace pas une caméra déjà en plongée.
    // Le retour rend l'entrée d'historique de la tasse par history.back(), asynchrone : poser l'ancre avant sa fin la ferait annuler aussitôt.
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const rendue = history.state?.mtTasse ? new Promise((ok) => addEventListener('popstate', ok, { once: true })) : null;
      await revenir(); await rendue; location.hash = 'contact';
    });
    return a;
  }
  function survoler(i) { scene()?.survolCafe(i); }
  function cloner(m, i) {
    const a = m.cloneNode(true);
    if (a.tagName === 'A') {
      a.addEventListener('pointerenter', () => survoler(i)); a.addEventListener('focus', () => survoler(i));
      a.addEventListener('pointerleave', () => { if (document.activeElement !== a) survoler(null); });
      a.addEventListener('blur', () => survoler(null));
    }
    return a;
  }
  // --- Le sucre : clic, clavier (le bouton), ou glisser jusqu'au café ---
  function creerSucre() {
    const m = modele.dataset;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tasse__sucre'; b.hidden = true;
    b.setAttribute('aria-label', m.sucreLibelle);
    const bulle = document.createElement('span'); bulle.className = 'tasse__sucre-bulle'; bulle.setAttribute('aria-hidden', 'true'); bulle.textContent = m.sucreInvite;
    const lueur = document.createElement('span'); lueur.className = 'tasse__sucre-lueur'; lueur.setAttribute('aria-hidden', 'true');
    b.append(lueur, bulle);
    let appui = null, glisse = false;
    b.addEventListener('pointerenter', () => scene()?.survolSucre(true));
    b.addEventListener('pointerleave', () => { if (document.activeElement !== b) scene()?.survolSucre(false); });
    b.addEventListener('focus', () => scene()?.survolSucre(true));
    b.addEventListener('blur', () => scene()?.survolSucre(false));
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || phase !== 'arrivee') return;
      appui = { x: e.clientX, y: e.clientY }; glisse = false;
      try { b.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché : le clic suffit */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!appui) return;
      if (!glisse && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 7) { glisse = scene()?.saisirSucre(); b.classList.add('tasse__sucre--tenu'); }
      if (glisse) { scene()?.porterSucre(e.clientX, e.clientY); placer(); }
    });
    const fin = (e, annule) => {
      if (!appui) return;
      appui = null; b.classList.remove('tasse__sucre--tenu');
      if (!glisse) return;
      // Le clic qui suit un glisser ne doit pas faire tomber le sucre une seconde fois.
      b.dataset.glisse = '1'; setTimeout(() => delete b.dataset.glisse, 0);
      // Lâché hors du café (ou geste annulé) : il retourne sur l'établi.
      const chute = annule ? (scene()?.reposerSucre(), null) : scene()?.lacherSucre(e.clientX, e.clientY, { phrases: toutes().map(texte), direct: mouvementReduit() });
      if (chute) tomber(chute); else { suivreRetour(); annoncer('Le sucre reste à côté de la tasse : lâchez-le au-dessus du café.'); }
    };
    // Reposé, le sucre regagne l'établi en quelques images : le bouton le suit jusqu'au bout, sinon le geste suivant
    // tomberait à côté de lui.
    const suivreRetour = () => requestAnimationFrame(() => { placer(); if (boutonSucre === b && scene()?.etatSucre().phase === 'retour') suivreRetour(); });
    b.addEventListener('pointerup', (e) => fin(e, false));
    b.addEventListener('pointercancel', (e) => fin(e, true));
    b.addEventListener('click', () => {
      if (b.dataset.glisse || phase !== 'arrivee') return;
      tomber(scene()?.ajouterSucre({ phrases: toutes().map(texte), direct: mouvementReduit() }));
    });
    return b;
  }
  // Le sucre est parti vers le café ; à l'impact, la mousse se réarrange et la nouvelle proposition se pose.
  async function tomber(chute) {
    if (!boutonSucre || !chute) return;
    // Le sucre part : le film du café renversé écoute cet événement sur document. Ce code ne tourne que dans la vue du dessus (phase « arrivee ») : depuis la vue
    // large, un clic sur le sucre ou la tasse ne fait qu'y amener, il ne lance jamais le film.
    document.dispatchEvent(new CustomEvent('mt:sucre', { detail: { direct: mouvementReduit() } }));
    const avaitFocus = document.activeElement === boutonSucre;
    boutonSucre.remove(); boutonSucre = null;
    son()?.cuillere();
    const r = await chute;
    sucre = true; prepare = true;
    if (!r || !racine || phase !== 'arrivee') return;
    // Le film prend la suite (site/js/film-cafe.js) : la proposition s'écrira dans la flaque de la scène finale. Sans film, s'il tarde ou si
    // la lecture est refusée, elle s'écrit dans la mousse, comme avant.
    const f = film();
    if (f?.actif) {
      // La carte de visite aussi : son lien recouvre la carte de la pièce, que le film ne montre plus.
      const carteVue = lienCarte && !lienCarte.hidden;
      for (const a of liens) a.hidden = true;
      if (lienCarte) lienCarte.hidden = true;
      if (await f.jouer({ hote: racine, direct: mouvementReduit() })) return;
      if (!racine || phase !== 'arrivee') return;
      for (const a of liens) a.hidden = false;
      if (carteVue) lienCarte.hidden = false;
    }
    const nouvelles = toutes().slice(liens.length).map((m, k) => cloner(m, liens.length + k));
    liens.push(...nouvelles);
    for (const a of nouvelles) racine.insertBefore(a, racine.querySelector('.vue-bas'));
    placer(); for (const a of liens) a.hidden = false;
    const t = nouvelles.map(texte).join(', ');
    racine.querySelector('.tasse__aide').textContent = texteEchap('Choisissez une phrase de mousse · Échap pour revenir');
    annoncer(`Le sucre fond dans le café. La mousse écrit aussi : ${t}.`);
    // Le focus suit le geste : sur la nouvelle proposition si c'est un lien, sinon sur la première.
    if (avaitFocus) (nouvelles.find((a) => a.tagName === 'A') || liens.find((a) => a.tagName === 'A') || retour)?.focus({ preventScroll: true });
  }
  async function entrer() {
    if (phase !== 'repos' || !scene() || !(propositions().length || avecSucre())) return;
    preparer();
    phase = 'aller'; focusAvant = document.activeElement;
    racine = document.createElement('section'); racine.className = 'tasse'; racine.dataset.phase = phase;
    racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-modal', 'true'); racine.setAttribute('aria-labelledby', 'tasse-titre');
    reglerMouvement();
    const titre = document.createElement('h2'); titre.id = 'tasse-titre'; titre.className = 'tasse__titre'; titre.textContent = 'Un café ?';
    retour = document.createElement('button'); retour.type = 'button'; retour.className = 'tako-bouton tasse__retour';
    retour.textContent = texteEchap('← Retour au bureau · Échap'); retour.addEventListener('click', () => revenir());
    liens = propositions().map(cloner);
    boutonSucre = avecSucre() ? creerSucre() : null;
    lienCarte = creerCarte();
    const aide = document.createElement('p'); aide.className = 'tasse__aide'; aide.setAttribute('aria-hidden', 'true');
    aide.textContent = texteEchap(boutonSucre ? 'Choisissez une phrase de mousse · un sucre ? · Échap pour revenir' : 'Choisissez une phrase de mousse · Échap pour revenir');
    racine.append(titre, retour, ...liens, ...(boutonSucre ? [boutonSucre] : []), lienCarte, creerBas(aide, () => revenir()));
    // Les ronds suivent la souris ou le doigt, partout sur le café.
    racine.addEventListener('pointermove', (e) => scene()?.pointeurCafe(e.clientX, e.clientY), { passive: true });
    racine.addEventListener('pointerdown', (e) => scene()?.pointeurCafe(e.clientX, e.clientY), { passive: true });
    document.body.append(racine);
    for (const e of document.body.children) if (e !== racine && e.id !== 'annonce') { inerties.set(e, e.inert); e.inert = true; }
    document.body.classList.add('tasse-active'); retour.focus({ preventScroll: true });
    son()?.cuillere();
    annoncer('Plongée dans la tasse de café.');
    placer();
    await scene().entrerTasse();
    if (phase !== 'aller') return;
    phase = 'arrivee'; racine.dataset.phase = phase;
    placer(); for (const a of liens) a.hidden = false;
    if (boutonSucre) {
      boutonSucre.hidden = false; boutonSucre.classList.add('tasse__sucre--sursaut');
      // Il rejoue son sursaut à l'arrivée, le vrai morceau compris ; en mouvement réduit, la lueur seule.
      if (!mouvementReduit()) { scene()?.survolSucre(true); setTimeout(() => { if (boutonSucre && !boutonSucre.matches(':hover, :focus')) scene()?.survolSucre(false); }, 700); }
    }
    lienCarte.hidden = false;
    const dits = liens.map(texte), sucreDit = boutonSucre ? ' Un sucre est posé à côté de la tasse.' : '';
    annoncer(dits.length > 1 ? `Deux propositions écrites dans la mousse : ${dits.join(', puis ')}.${sucreDit} Tab pour les atteindre, Échap pour revenir.`
      : dits.length ? `Une proposition écrite dans la mousse : ${dits[0]}.${sucreDit} Tab pour l'atteindre, Échap pour revenir.`
        : `La mousse attend.${sucreDit} Tab pour l'atteindre, Échap pour revenir.`);
  }
  async function revenir({ sansTravelling = false } = {}) {
    if (phase === 'repos' || phase === 'retour') return;
    phase = 'retour'; racine.dataset.phase = phase; retour.disabled = true;
    finFilm?.fermer(); finFilm = null;
    film()?.arreter();
    for (const a of liens) a.hidden = true;
    if (boutonSucre) boutonSucre.hidden = true;
    if (lienCarte) lienCarte.hidden = true;
    survoler(null);
    // Sans contexte graphique (panne), la scène ne joue plus d'image : on ne l'attend pas.
    if (!sansTravelling) await scene()?.sortirTasse();
    racine.remove(); racine = retour = boutonSucre = null; liens = [];
    for (const [e, inert] of inerties) e.inert = inert; inerties.clear();
    document.body.classList.remove('tasse-active'); phase = 'repos';
    // Après le sucre, la prochaine visite verse les deux propositions : la mousse se repeint quand le navigateur respire.
    if (sucre && prepare) { prepare = false; (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => preparer()); }
    auRetour(); focusAvant?.focus({ preventScroll: true }); annoncer('Retour au bureau.');
  }
  document.addEventListener('mt:film-fin', ({ detail }) => {
    if (!racine || phase !== 'arrivee' || !detail.format?.ecriture) return;
    finFilm?.fermer();
    finFilm = creerFinFilm({ hote: racine, image: detail.image, format: detail.format, propositions: toutes(), libelleRendezVous: modele.dataset.rendezVousLibelle, immediat: detail.passe });
    racine.dataset.film = 'fin';
    racine.querySelector('.tasse__aide').textContent = texteEchap('Choisissez une phrase dans la flaque · Échap pour revenir');
    // L'image décodée est déjà posée : le compositeur peut rendre la pièce derrière elle sans changer le fond final.
    scene()?.film?.cacher();
    retour.focus({ preventScroll: true });
    annoncer('Le café est renversé. Choisissez une phrase dans la flaque.');
  });
  document.addEventListener('keydown', (e) => {
    if (phase === 'repos') return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      // Pendant le film, Échap le passe (sa dernière image) ; un second Échap revient au bureau.
      if (!film()?.presser() && !finFilm?.presser()) revenir();
      return;
    }
    if (e.key !== 'Tab') return;
    // Boucle courte dans le dialogue : retour, puis les propositions une fois écrites, puis le sucre.
    e.preventDefault();
    const ordre = [retour, ...(finFilm?.liens || []).filter((a) => a.tagName === 'A'), ...liens.filter((a) => !a.hidden && a.tagName === 'A'), ...(boutonSucre && !boutonSucre.hidden ? [boutonSucre] : [])].filter(Boolean);
    const j = ordre.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1);
    ordre[(j + ordre.length) % ordre.length]?.focus();
  }, true);
  // Deux images d'attente : la scène prend sa nouvelle taille dans un ResizeObserver, servi après les rappels rAF.
  addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(placer)));
  // Mouvement réduit basculé pendant la visite : le texte des liens devient net (ou repasse sous la mousse) aussitôt.
  function reglerMouvement() { racine?.classList.toggle('tasse--net', mouvementReduit()); }
  return {
    entrer, revenir, preparer, reglerMouvement,
    // Sans proposition servie (rendez-vous non publié, pourboire vide), la tasse n'est qu'un objet du décor.
    get disponible() { return toutes().some((p) => p.tagName === 'A'); },
    etat: () => ({ phase, sucre, boutonSucre: boutonSucre ? { cache: boutonSucre.hidden, rect: boutonSucre.getBoundingClientRect().toJSON() } : null,
      liens: liens.map((a) => ({ href: a.href || null, balise: a.tagName, texte: a.textContent, cache: a.hidden, rect: a.getBoundingClientRect().toJSON() })) }),
    get active() { return phase !== 'repos'; },
  };
}
