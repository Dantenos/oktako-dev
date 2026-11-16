// Application : un modèle d'état unique (vue, objet, panneau, mouvement, effets), un routeur par ancre,
// et la scène 3D en option. Sans scène, tout reste utilisable : menu, présentation, liens directs.
import { creerPlongee } from './plongee.js';
import { creerTasse } from './tasse.js';
import { creerFilmCafe } from './film-cafe.js';
import { creerTiroir } from './tiroir.js';
import { creerGrandAngle } from './grand-angle.js';
import { creerConsolePoche } from './console.js';
import { creerSon } from './son.js';
import { monterNotes, viderEnAttente } from './notes.js';
import { creerAmbiance } from './ambiance.js';
import { creerBulle } from './pieuvre-bulle.js';
import { creerPsst } from './pieuvre-psst.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const DESTINATIONS = ['qui-suis-je', 'parcours', 'competences', 'creations', 'services', 'carnet', 'jouer', 'contact'];
const OBJET_PAR_DESTINATION = { 'qui-suis-je': 'ecran', parcours: 'parcours', competences: 'competences', creations: 'dossiers', carnet: 'carnet', jouer: 'terminal', contact: 'lettre' };
const NOM_OBJET = {};

const etat = {
  vue: 'accueil', // accueil | exploration | panneau
  objet: null,
  destination: null,
  fiche: null,
  mouvementReduit: html.classList.contains('mouvement-reduit'),
  effets: true,
  son: false, // jamais actif au chargement
  scene: 'absente', // absente | chargement | prete | panne
};
let scene = null;
let retourFocus = null;
let historiqueInterne = 0; // nombre d'entrées poussées par nous : Échap peut alors revenir en arrière.

const panneau = $('#panneau'), corps = $('#panneau-corps'), titreObjet = $('#panneau-objet');
// Une fois entré, le panneau ne rejoue pas son animation quand la mise en page bascule (rotation du téléphone :
// feuille du bas ↔ feuille latérale changent le nom d'animation, ce qui la relancerait).
panneau.addEventListener('animationend', (e) => { if (e.target === panneau) panneau.classList.add('panneau--pose'); });
const annonce = (t) => { $('#annonce').textContent = t; };
// La bulle de la mini-pieuvre : un lien de réponse ouvre sa rubrique, et le retour du panneau rend le focus à ce qui l'avait ouverte.
const bulle = creerBulle({ annoncer: annonce, surLien: (declencheur) => { if (declencheur?.isConnected) retourFocus = declencheur; }, vue: () => scene?.vueCourante?.(),
  // Vers elle depuis l'accueil et l'atelier ; depuis une rubrique, la question s'ouvre sans quitter la lecture.
  approcher: () => {
    psst.retirer();
    if (etat.vue === 'panneau') return null;
    document.body.classList.add('pieuvre-proche');
    return scene?.entrerPieuvre?.();
  },
  eloigner: () => {
    document.body.classList.remove('pieuvre-proche');
    if ((scene?.etatPieuvreZoom?.() ?? 'repos') !== 'repos') scene.sortirTiroir().then(() => cadrerScene());
  },
  // La rencontre (lot mascotte-offre-demo) : une seule entrée d'historique, comme la tasse ; Précédent la referme et rend l'accueil.
  rencontre: {
    avant: () => {
      psst.retirer();
      // Depuis la fiche du cas d'étude : le panneau se ferme, sans laisser son ancre derrière lui.
      if (etat.vue === 'panneau') { history.replaceState(null, '', location.pathname + location.search); fermerPanneau({ focus: false }); }
      if (!history.state?.mtRencontre) history.pushState({ mtRencontre: true }, '');
    },
    quitter: ({ accueil, historique }) => {
      if (!historique && history.state?.mtRencontre) {
        // Rendre l'accueil retire l'entrée ; un lien vers une rubrique la remplace, et la rubrique pousse la sienne.
        if (accueil) { ignorerPop = true; history.back(); } else history.replaceState(null, '', location.pathname + location.search);
      }
      if (accueil && etat.vue !== 'accueil') { etat.vue = 'accueil'; etat.objet = null; appliquer(); }
    },
    filmVu: () => filmCafe.etat().vu === true,
    mouvementReduit: () => etat.mouvementReduit,
  } });
// Au téléphone debout, elle est sous la carte d'accueil : le Psst attend qu'elle soit là pour de bon, sinon il appellerait dans le vide.
const psst = creerPsst({ bouton: $('#pieuvre-psst'), rect: () => { const r = scene?.rectPieuvre?.(); return r && !sousAccueil((r.gauche + r.droite) / 2, (r.haut + r.bas) / 2) ? r : null; }, ouvrir: () => scene?.pieuvre?.()?.clic(),
  // Ce qu'il couvrirait à cette place ; hors de l'écran, tout : ce coin ne sera pas choisi.
  gens: (b) => {
    const toutes = $$('.point__etiquette, .zone').filter((e) => (+getComputedStyle(e).opacity >= 0.1 || (e.closest('.point') || e).dataset.psst) && e.closest('.point')?.dataset.cache !== 'true');
    if (b.gauche < 4 || b.droite > document.documentElement.clientWidth - 4 || b.haut < 4) return toutes;
    return toutes.filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.left < b.droite + 2 && b.gauche < r.right + 2 && r.top < b.bas + 2 && b.haut < r.bottom + 2; }).map((e) => e.closest('.point') || e);
  } });
const estTelephone = () => matchMedia('(max-width: 760px)').matches;
const plongee = creerPlongee({scene:()=>scene,mouvementReduit:()=>etat.mouvementReduit,annoncer:annonce,
  auRetour:()=>{history.replaceState(null,'',location.pathname+location.search);etat.vue=etat.scene==='prete'?'exploration':'accueil';etat.objet=null;etat.destination=null;appliquer();cadrerScene();}});
function entrerRouille() {
  if(etat.vue==='panneau')fermerPanneau({focus:false});
  etat.vue='exploration';etat.objet=null;appliquer();window.scrollTo(0,0);
  if(location.hash!=='#jouer')history.pushState({mtPlongee:true},'','#jouer');
  plongee.entrer();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-entrer-rouille]')){e.preventDefault();entrerRouille();}});
// La tasse de café : clic ou Entrée sur elle, la caméra plonge jusqu'à la vue du dessus (js/tasse.js).
const tasse = creerTasse({ scene: () => scene, mouvementReduit: () => etat.mouvementReduit, annoncer: annonce, son: () => (etat.son ? son : null),
  // Sortie par Échap ou par le bouton : on retire l'entrée d'historique posée à l'entrée, pour que « Retour »
  // ne tombe pas ensuite sur une étape morte. Sortie par « Retour » : l'entrée est déjà consommée.
  auRetour: () => { if (history.state?.mtTasse) { ignorerPop = true; history.back(); } etat.vue = etat.scene === 'prete' ? 'exploration' : 'accueil'; appliquer(); cadrerScene(); },
  film: () => filmCafe });
// Le film ne se charge qu'à la demande explicite du visiteur (js/tasse.js) ; le gabarit du café en annonce les durées sans rien télécharger.
// L'adaptateur sonore est appelé plus tard, après l'initialisation du son.
const filmCafe = creerFilmCafe({ adresse: document.getElementById('cafe-propositions')?.dataset.film, annonce: document.getElementById('cafe-propositions')?.dataset,
  scene: () => scene, mouvementReduit: () => etat.mouvementReduit,
  annoncer: annonce, sons: { couper: () => sonsFilm.couper(), rendre: () => sonsFilm.rendre(), autorise: () => etat.son } });
let ignorerPop = false;
const tiroir = creerTiroir({ scene: () => scene, lire: (id) => window.__MT_CONTENU?.[id === 'tiroir:objectifs2' ? 'objectifs2' : 'objectifs'] || [], mouvementReduit: () => etat.mouvementReduit, annoncer: annonce, son: () => (etat.son ? son : null),
  auRetour: () => { etat.vue = etat.scene === 'prete' ? 'exploration' : 'accueil'; appliquer(); cadrerScene(); } });
// L'objectif du tiroir à clé : la vue zoome dans son verre, le retour rend le tiroir tel qu'il était, sa clé comprise.
const grandAngle = creerGrandAngle({ scene: () => scene, mouvementReduit: () => etat.mouvementReduit, annoncer: annonce, son: () => (etat.son ? son : null), auRetour: () => {} });
// La console de poche : au téléphone (même critère que la scène), son interface prend tout l'écran du visiteur.
const consolePoche = creerConsolePoche({ scene: () => scene, mouvementReduit: () => etat.mouvementReduit, annoncer: annonce, auRetour: () => {},
  telephone: () => Math.min(innerWidth, innerHeight) < 600 || matchMedia('(pointer: coarse)').matches });
// Un petit mot posé sur la pièce (la radio, le tiroir secret) : quelques secondes, et lu par les lecteurs d'écran.
let clinMinuteur = null;
function clin(texte) {
  const c = $('#clin'); c.textContent = texte; c.hidden = !texte; clearTimeout(clinMinuteur);
  if (texte) clinMinuteur = setTimeout(() => { c.hidden = true; }, 5000);
}
let radioOccupee = false;
const ACTIONS = {
  // La radio est une PLAYLIST (lo-fi d'atelier puis sa bascule sur boss 1, piano 1, piano 2, boss 1, boss 2, retour au début) : les morceaux
  // s'enchaînent à leur fin, sans boucle ; un clic passe au suivant. Son coupé : ce premier clic l'active (geste du visiteur) et annonce la musique
  // de départ. Le silence est le bouton Son, pas une station. La station est annoncée (clin et lecteur d'écran).
  // POURQUOI ne pas toucher à la position de la radio : elle sera déplacée à la cuisson d'après le film.
  radio: async () => {
    if (radioOccupee) return; radioOccupee = true;
    // L'annonce passe AVANT le téléchargement et le décodage de la musique : nommer la station ne doit pas attendre (lecteurs d'écran, essai).
    const dire = (station) => { const texte = station ? 'Radio : ' + station.nom + '.' : 'La radio ne capte rien pour l\u2019instant.'; clin(texte); annonce(texte); };
    try {
      if (!etat.son) {
        etat.son = true; son ??= creerSon({ observerRadio: observerLecteurRadio }); son.activer(); appliquer();
        dire(await son.stationDeDepart());
        await son.prete;
      } else {
        const prochaine = son.prochaineStation();
        if (prochaine) dire(prochaine);
        const station = await son.changerStation();
        if (!prochaine) dire(station);
      }
    } finally { radioOccupee = false; }
  },
  tiroir: () => tiroir.entrer('tiroir:objectifs'),
  tiroir2: () => tiroir.entrer('tiroir:objectifs2'),
  secret: () => { const ouvert = scene?.basculerSecret(); if (ouvert && etat.son) son?.evenement('cle-serrure-laiton'); clin(ouvert ? 'Une petite clé. Elle doit bien ouvrir quelque chose\u2026' : ''); },
  fisheye: () => { clin(''); grandAngle.entrer(); },
  console: () => { clin(''); consolePoche.entrer(); },
  // Le tiroir surprise : ses légendes viennent de content/site.json ; vide, il le dit sans bruit.
  surprise: () => {
    const legendes = (window.__MT_CONTENU?.cadres || []).filter((c) => /^surprise-/.test(c.id) && c.image).map((c) => c.legende).filter(Boolean);
    clin(scene?.basculerSurprise() ? legendes.join(' · ') || 'Rien ici pour l\u2019instant. Repassez.' : '');
  },
  // Le caisson est sous le plateau, hors de la vue d'entrée : on y descend, le focus suit sur le premier tiroir.
  caisson: () => {
    if (etat.vue === 'accueil') { etat.vue = 'exploration'; appliquer(); }
    scene?.entrerCaisson(); annonce('Sous le bureau : deux tiroirs. Le premier range d\u2019autres objectifs, le second a une serrure. Échap pour remonter.');
    requestAnimationFrame(() => requestAnimationFrame(() => points['tiroir:objectifs2']?.focus({ preventScroll: true })));
  },
};
// Le ciel derrière la fenêtre : heure, météo, dates (js/ambiance.js). Calculé avant la scène : elle ne charge que
// le jeu de textures de l'ambiance du moment.
const ambiance = creerAmbiance({ annoncer: annonce, son: () => (etat.son ? son : null), mouvementReduit: () => etat.mouvementReduit });
function entrerTasse() {
  if (etat.scene !== 'prete' || plongee.active || tasse.active || !tasse.disponible) return;
  if (etat.vue === 'panneau') fermerPanneau({ focus: false });
  etat.vue = 'exploration'; etat.objet = null; appliquer(); window.scrollTo(0, 0);
  history.pushState({ mtTasse: true }, '');
  tasse.entrer();
}


// --- Lecture de l'adresse : #creations, #creations-factarena, #contact… ---
function lireAncre() {
  // Un lien tronqué ou bricolé (#%E0%A4%A) fait lever decodeURIComponent : on l'ignore, la scène ne doit pas tomber.
  let a = ''; try { a = decodeURIComponent(location.hash.slice(1)); } catch { /* jeton illisible : traité comme une ancre inconnue */ }
  if (DESTINATIONS.includes(a)) return { destination: a, fiche: null };
  // Les preuves de la bulle citent aussi une offre : son lien doit retrouver la feuille Services.
  const m = /^(creations|carnet|services)-(.+)$/.exec(a);
  if (m && document.getElementById(a)) return { destination: m[1], fiche: m[2] };
  return { destination: null, fiche: null };
}

// --- Rendu de l'état ---
function appliquer() {
  const vuePrecedente = appliquer.vue; appliquer.vue = etat.vue;
  document.body.classList.toggle('exploration', etat.vue !== 'accueil');
  document.body.classList.toggle('panneau-ouvert', etat.vue === 'panneau');
  document.body.classList.toggle('etiquettes', etat.vue === 'exploration' && matchMedia('(pointer: coarse)').matches);
  $('#aide').hidden = etat.vue !== 'exploration';
  $('#retour-intro').hidden = etat.vue !== 'exploration';
  $('#recentrer').hidden = etat.vue !== 'exploration';
  $('#montrer').hidden = etat.vue !== 'exploration';
  $$('[data-destination]').forEach((a) => { if (a.tagName === 'A') a.setAttribute('aria-current', String(a.dataset.destination === etat.destination && etat.vue === 'panneau')); });
  $$('.reglage[data-reglage]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.reglage === 'mouvement' ? !etat.mouvementReduit : b.dataset.reglage === 'son' ? etat.son : etat.effets)));
  html.classList.toggle('mouvement-reduit', etat.mouvementReduit);
  html.classList.toggle('panneau-ouvert', etat.vue === 'panneau');
  if (vuePrecedente !== etat.vue && etat.vue !== 'panneau' && vuePrecedente !== 'panneau') cadrerScene();
}

function ouvrirPanneau(destination, fiche, objet) {
  const source = document.getElementById(destination);
  if (!source) return;
  const dejaOuvert = etat.vue === 'panneau';
  etat.vue = 'panneau'; etat.destination = destination; etat.fiche = fiche;
  etat.objet = objet || OBJET_PAR_DESTINATION[destination];
  // Le panneau reçoit une copie de la rubrique : la présentation classique reste intacte en dessous.
  const copie = source.cloneNode(true);
  copie.removeAttribute('id');
  copie.querySelectorAll('[id]').forEach((n) => { n.id = 'p-' + n.id; });
  copie.querySelectorAll('[aria-labelledby]').forEach((n) => n.setAttribute('aria-labelledby', 'p-' + n.getAttribute('aria-labelledby')));
  // Même chose pour le bloc-notes : nouvelle vue branchée sur le magasin partagé (mêmes notes que la présentation).
  copie.querySelectorAll('[data-notes]').forEach((d) => { d.querySelector('.notes__app')?.remove(); monterNotes(d); });
  liberer();
  // Pied de panneau : contact toujours à portée, et rubrique suivante pour feuilleter sans revenir au bureau.
  const pied = $('#pied-panneau').content.cloneNode(true);
  const suivante = DESTINATIONS[(DESTINATIONS.indexOf(destination) + 1) % DESTINATIONS.length];
  const lienSuivant = pied.querySelector('[data-suivant]');
  lienSuivant.href = '#' + suivante; lienSuivant.textContent = `${$(`#${suivante} h2`).textContent} →`;
  lienSuivant.setAttribute('aria-label', `Rubrique suivante : ${$(`#${suivante} h2`).textContent}`);
  corps.replaceChildren(copie, pied);
  if (fiche) corps.dataset.fiche = fiche; else delete corps.dataset.fiche;
  corps.dataset.destination = destination;
  const h2 = copie.querySelector('h2'); h2.id = 'panneau-titre'; h2.tabIndex = -1;
  titreObjet.textContent = NOM_OBJET[etat.objet] || '';
  if (panneau.hidden) panneau.classList.remove('panneau--pose');
  // Au téléphone, le panneau de questions ne reste jamais devant une rubrique : il se replie en bouton.
  if (estTelephone() || (scene?.etatPieuvreZoom?.() ?? 'repos') !== 'repos') bulle.fermer({ focus: false });
  panneau.hidden = false;
  // Sur téléphone le tiroir couvre l'essentiel de l'écran : il devient modal (focus piégé, Échap ou glisser pour fermer).
  panneau.setAttribute('aria-modal', estTelephone() ? 'true' : 'false');
  panneau.style.transform = '';
  appliquer();
  cadrerScene();
  let cibleFocus = h2;
  corps.scrollTop = 0;
  if (fiche) {
    const art = corps.querySelector(`#p-${destination}-${CSS.escape(fiche)}`);
    if (art) {
      art.dataset.ciblee = 'true'; cibleFocus = art.querySelector('h3') || h2; cibleFocus.tabIndex = -1;
      // Une fiche projet s'affiche seule (les autres sont masquées) ; une entrée du carnet est mise en évidence dans la liste.
      if (destination === 'carnet' || destination === 'services') art.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }
  cibleFocus.focus({ preventScroll: true });
  annonce(fiche && cibleFocus !== h2 ? `Fiche ${cibleFocus.textContent} ouverte.` : dejaOuvert ? `${h2.textContent}.` : `${h2.textContent} ouvert. Échap pour revenir au bureau.`);
}

// Les vues du bloc-notes retirées du panneau se désabonnent du magasin.
function liberer() { corps.querySelectorAll('[data-notes]').forEach((d) => d.__notes?.detruire()); }
function fermerPanneau({ focus = true } = {}) {
  if (etat.vue !== 'panneau') return;
  panneau.hidden = true; liberer(); corps.replaceChildren();
  etat.vue = 'exploration'; etat.destination = null; etat.fiche = null;
  const objet = etat.objet; etat.objet = null;
  appliquer(); cadrerScene();
  annonce('Retour au bureau.');
  setTimeout(vague, 600);
  if (focus) {
    const cible = retourFocus && document.contains(retourFocus) ? retourFocus : $(`.point[data-objet="${objet}"]`) || $('#explorer');
    cible?.focus({ preventScroll: true });
  }
}

function cadrerScene() {
  if (!scene) return;
  const ouvert = etat.vue === 'panneau';
  const tel = estTelephone();
  const r = panneau.getBoundingClientRect();
  const carte = $('#intro').getBoundingClientRect();
  let decalageX = 0, decalageY = 0;
  // Ce qui couvre l'écran (panneau ou carte d'accueil) décale l'image vers l'espace libre, sans bouger la caméra.
  if (ouvert) { if (tel) decalageY = r.height / 2; else decalageX = r.width / 2; }
  // L'accueil ne couvre plus la pièce (invitation posée en bas, sans carte) : pas de décalage, sauf sur téléphone.
  else if (etat.vue === 'accueil' && tel) decalageY = carte.height * 0.3;
  scene.cadrer(etat.objet && ouvert ? etat.objet : null, { panneau: ouvert, decalageX, decalageY });
}

// --- Navigation : chaque ouverture devient une entrée d'historique (précédent/suivant fonctionnent) ---
function naviguer(destination, { fiche = null, objet = null } = {}) {
  if(destination==='jouer'&&!estTelephone()){entrerRouille();return;}
  const ancre = fiche ? `${destination}-${fiche}` : destination;
  if (etat.scene !== 'prete') { // Sans scène : comportement de page classique, défilement vers la rubrique.
    location.hash = ancre; return;
  }
  if (location.hash !== '#' + ancre) { history.pushState({ mt: true }, '', '#' + ancre); historiqueInterne++; }
  window.scrollTo({ top: 0, behavior: 'auto' });
  ouvrirPanneau(destination, fiche, objet);
}
function revenir() {
  if (etat.vue !== 'panneau') return;
  if (historiqueInterne > 0 && history.state?.mt) { history.back(); return; }
  history.replaceState(null, '', location.pathname + location.search);
  fermerPanneau();
}
window.addEventListener('popstate', (e) => {
  if (ignorerPop) { ignorerPop = false; return; }
  if (bulle.enRencontre) { bulle.fermer({ accueil: true, historique: true }); return; }
  if(plongee.active){plongee.revenir();return;}
  if (tasse.active) { tasse.revenir(); return; }
  if (tiroir.active) { tiroir.revenir(); return; }
  if (historiqueInterne > 0) historiqueInterne--;
  // Retour arrière dans la lecture classique (ancre de la présentation, sans panneau) : le navigateur défile seul.
  if (!e.state?.mt && etat.vue !== 'panneau' && location.hash && !document.body.classList.contains('exploration') && scrollY > innerHeight / 2) return;
  syncAdresse();
});
// Panneau ouvert, page verrouillée : tout défilement restant vient du navigateur qui vise l'ancre ; on le neutralise.
window.addEventListener('scroll', () => { if (etat.vue === 'panneau' && scrollY) window.scrollTo(0, 0); }, { passive: true });
let lectureClassique = false;
window.addEventListener('hashchange', () => {
  if (lectureClassique) { lectureClassique = false; return; }
  if (etat.scene === 'prete') syncAdresse();
});
function syncAdresse() {
  const { destination, fiche } = lireAncre();
  if (etat.scene !== 'prete') return;
  if (destination) { window.scrollTo({ top: 0 }); ouvrirPanneau(destination, fiche, null); }
  else fermerPanneau();
}

// --- Liens internes : menu, onglets, liens « Mes créations » de l'intro ---
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = a.getAttribute('href').slice(1);
  if (etat.scene !== 'prete') return; // laisser le navigateur faire défiler.
  // Dans la présentation classique, les liens internes défilent comme sur une page ordinaire : pas de panneau.
  if (a.closest('main') && !panneau.contains(a)) { lectureClassique = true; return; }
  const fiche = /^(creations|carnet|services)-(.+)$/.exec(id);
  if (DESTINATIONS.includes(id)) { e.preventDefault(); if (!panneau.contains(a)) retourFocus = a; naviguer(id, { objet: id === etat.destination ? etat.objet : null }); }
  else if (fiche && document.getElementById(id)) { e.preventDefault(); if (!panneau.contains(a)) retourFocus = a; naviguer(fiche[1], { fiche: fiche[2], objet: fiche[1] === etat.destination ? etat.objet : null }); }
  else if (id === 'accueil') { e.preventDefault(); revenir(); etat.vue = 'accueil'; appliquer(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (id === 'presentation') { if (etat.vue === 'panneau') { history.replaceState(null, '', location.pathname); fermerPanneau({ focus: false }); } }
});
$('#explorer').addEventListener('click', () => { etat.vue = 'exploration'; appliquer(); $('.point')?.focus({ preventScroll: true }); annonce(`Exploration du bureau : ${$$('.point').length} objets, parcourables avec Tab.`); setTimeout(vague, 500); });
$('#montrer').addEventListener('click', () => { vague({ rejouer: true }); annonce('Les objets du bureau se signalent, de gauche à droite.'); });
$('#retour-intro').addEventListener('click', () => { etat.vue = 'accueil'; appliquer(); $('#explorer').focus(); });
// Recentrer : la vue revient au bureau (aussi par double-clic sur la pièce, ou Échap quand la vue en est partie).
const recentre = () => annonce('Vue recentrée sur le bureau.');
$('#recentrer').addEventListener('click', () => { scene?.recentrer(); recentre(); });
$('#remonter').addEventListener('click', () => { scene?.recentrer(); });
$('#panneau-fermer').addEventListener('click', revenir);
$('#voir-presentation').addEventListener('click', (e) => { e.preventDefault(); const m = $('#presentation'); m.scrollIntoView({ behavior: etat.mouvementReduit ? 'auto' : 'smooth' }); m.focus({ preventScroll: true }); });
// Piège à focus du tiroir mobile : Tab et Maj+Tab bouclent dans le panneau tant qu'il est modal.
function focusables(racine) {
  return [...racine.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((n) => n.offsetParent !== null || n === document.activeElement);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || etat.vue !== 'panneau' || panneau.getAttribute('aria-modal') !== 'true') return;
  const f = focusables(panneau); if (!f.length) return;
  const premier = f[0], dernier = f[f.length - 1], ici = document.activeElement;
  if (!panneau.contains(ici)) { e.preventDefault(); premier.focus(); }
  else if (e.shiftKey && (ici === premier || ici === $('#panneau-titre'))) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && ici === dernier) { e.preventDefault(); premier.focus(); }
});
// Glisser vers le bas sur l'en-tête du tiroir pour le fermer ; le bouton « Retour au bureau » fait la même chose.
{
  const tete = $('.panneau__tete'); let depart = null, dy = 0;
  tete.addEventListener('pointerdown', (e) => {
    if (!estTelephone() || e.target.closest('button, a')) return;
    depart = e.clientY; dy = 0; try { tete.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché : le glisser continue sans capture */ } panneau.classList.add('panneau--glisse');
  });
  tete.addEventListener('pointermove', (e) => {
    if (depart === null) return;
    dy = Math.max(0, e.clientY - depart); panneau.style.transform = `translateY(${dy}px)`;
  });
  const fin = () => {
    if (depart === null) return;
    depart = null; panneau.classList.remove('panneau--glisse');
    if (dy > 90) { annonce('Tiroir fermé.'); revenir(); } else panneau.style.transform = '';
  };
  tete.addEventListener('pointerup', fin); tete.addEventListener('pointercancel', fin);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || plongee.active || tasse.active || tiroir.active || grandAngle.active || consolePoche.active) return;
  if (etat.vue === 'panneau') { e.preventDefault(); revenir(); }
  else if (etat.vue === 'exploration') {
    // Une vue tournée revient d'abord au bureau ; Échap sur une vue déjà au bureau rend l'accueil.
    if (scene?.recentrer()) { e.preventDefault(); recentre(); return; }
    etat.vue = 'accueil'; appliquer(); $('#explorer').focus();
  }
});
// Le dernier état survit au chargement de la scène et aux pauses de sa boucle.
let instantRadio = { station: '', lecture: false }, filmRadio = false;
function publierRadio() { scene?.observerRadio({ ...instantRadio, film: filmRadio, visible: !document.hidden }); }
function observerLecteurRadio(etat) { instantRadio = etat; publierRadio(); }
// Son : coupé par défaut ; le moteur audio n'existe qu'après ce clic explicite.
let son = null;
// Le contrat du lecteur du film du café (claude-19, creerFilmCafe({ ..., sons })) : `couper()` rend une promesse, attendue avant la
// PREMIÈRE image du film ; `rendre()` ramène le son au retour vers la scène. Les deux fondent la musique du site, les sons de la scène
// et la pluie (puissance constante, sans clic). Son coupé par le visiteur : couper() est déjà résolue et rendre() ne fait rien.
// (Le nom `couper` n'est pas celui de `son.couper()`, qui coupe tout : d'où cet adaptateur plutôt qu'un alias.)
export const sonsFilm = {
  couper: () => { filmRadio = true; publierRadio(); return etat.son && son ? son.fondre() : Promise.resolve(); },
  rendre: () => { filmRadio = false; publierRadio(); if (etat.son && son) son.reprendre(); },
};
$$('.reglage[data-reglage]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.reglage === 'son') { etat.son = !etat.son; son ??= creerSon({ observerRadio: observerLecteurRadio }); if (etat.son) son.activer(); else son.couper(); filmCafe.reglerSon(); appliquer(); annonce(etat.son ? 'Son d\'ambiance activé.' : 'Son coupé.'); return; }
  if (b.dataset.reglage === 'mouvement') etat.mouvementReduit = !etat.mouvementReduit; else etat.effets = !etat.effets;
  appliquer(); scene?.reglages({ mouvementReduit: etat.mouvementReduit, effets: etat.effets }); tasse.reglerMouvement();
}));
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { etat.mouvementReduit = e.matches; appliquer(); scene?.reglages({ mouvementReduit: etat.mouvementReduit }); tasse.reglerMouvement(); });

// --- Points d'intérêt (boutons au-dessus des objets) ---
$$('.point').forEach((p) => {
  NOM_OBJET[p.dataset.objet] = p.querySelector('.point__etiquette span').textContent;
  p.addEventListener('click', () => { retourFocus = p; if (p.dataset.lien !== undefined) return; if (p.dataset.action) { ACTIONS[p.dataset.action](); return; } if (p.dataset.tasse !== undefined) { entrerTasse(); return; } if (etat.vue === 'accueil') { etat.vue = 'exploration'; } naviguer(p.dataset.destination, { fiche: p.dataset.fiche || null, objet: p.dataset.objet }); });
  p.addEventListener('focus', () => scene?.survolerDepuisClavier(p.dataset.objet,true));
  p.addEventListener('blur', () => scene?.survolerDepuisClavier(null));
  // Un vrai survol prend la main : la vague s'arrête là, sans rejouer plus tard.
  p.addEventListener('pointerenter', () => { arreterVague(); scene?.survolerDepuisClavier(p.dataset.objet); });
  p.addEventListener('pointerleave', () => scene?.survolerDepuisClavier(null));
});
const points = Object.fromEntries($$('.point').map((p) => [p.dataset.objet, p]));
// La vague d'entrée : chaque objet public joue une fois son survol, de gauche à droite, pour montrer ce qui se clique. Le tiroir surprise, le tiroir à clé et son
// objectif en restent dehors : ils sont secrets. Ce que le panneau d'accueil cache attend sa sortie ; un objet déjà montré ne revient pas, sauf sur demande.
const SECRETS = new Set(['tiroir:surprise', 'tiroir:secret', 'fisheye']), DUREE_VAGUE = 1500, TENUE = 420;
const montres = new Set(), journalVague = [];
let minuteursVague = [];
// L'étiquette part sans fondu : pendant un fondu, sa seconde ligne reviendrait et le texte visible ne serait plus celui du nom accessible.
function finVague(p) {
  const e = p.querySelector('.point__etiquette'); e.style.transition = 'none';
  p.classList.remove('point--vague');
  requestAnimationFrame(() => { e.style.transition = ''; });
}
function arreterVague() {
  minuteursVague.forEach(clearTimeout); minuteursVague = [];
  $$('.point--vague').forEach(finVague);
  scene?.finirSursauts();
}
function vague({ rejouer = false } = {}) {
  if (!scene || etat.scene !== 'prete' || etat.vue === 'panneau' || plongee.active || tasse.active || tiroir.active || grandAngle.active || consolePoche.active) return;
  if (rejouer) { arreterVague(); montres.clear(); }
  // Sorti de l'accueil, un point encore marqué couvert compte déjà : sa prochaine image le découvre, sur une machine lente elle tarde.
  const visible = (p) => p.dataset.cache === 'false' || (etat.vue !== 'accueil' && p.dataset.couvert === 'true');
  const cibles = Object.entries(points).filter(([id, p]) => !SECRETS.has(id) && !montres.has(id) && visible(p))
    .map(([id, p]) => ({ id, p, x: p.getBoundingClientRect().left })).sort((a, b) => a.x - b.x);
  const pas = cibles.length > 1 ? (DUREE_VAGUE - TENUE) / (cibles.length - 1) : 0;
  cibles.forEach(({ id, p }, i) => {
    montres.add(id);
    minuteursVague.push(setTimeout(() => {
      journalVague.push({ id, prevu: Math.round(i * pas), t: Math.round(performance.now()) });
      p.classList.add('point--vague');
      // Mouvement réduit : rien ne bouge, seul le point s'illumine en fondu.
      if (!etat.mouvementReduit) scene?.sursaut(id, TENUE);
      minuteursVague.push(setTimeout(() => finVague(p), TENUE));
    }, i * pas));
  });
}
// Une étiquette près du bord de l'écran (la fiche « Mon parcours » en portrait) glisse vers l'intérieur au lieu d'être
// coupée. Largeur mesurée une fois, décalage écrit seulement quand il change (cette fonction tourne à chaque image).
const largeurEtiquette = {}, decalageEtiquette = {}, evitement = {};
// Tant que le panneau d'accueil est là, un point qu'il recouvre ne s'active pas, et aucune étiquette ne passe dessous (retour du 31/10 :
// « Carnet de fabrication » glissait sous les boutons). Son rectangle se relit quand il change, pas à chaque image.
let rectIntro = null;
new ResizeObserver(() => { rectIntro = null; }).observe($('#intro'));
addEventListener('resize', () => { rectIntro = null; });
const MARGE_INTRO = 8;
function sousAccueil(x, y) {
  if (etat.vue !== 'accueil') return false;
  // Sans carte d'accueil, rien à éviter. Lever ici tuerait la boucle de rendu : image() ne se relance qu'en fin de course.
  const r = rectIntro ??= $('#intro')?.getBoundingClientRect();
  if (!r) return false;
  return x + 22 > r.left - MARGE_INTRO && x - 22 < r.right + MARGE_INTRO && y + 22 > r.top - MARGE_INTRO && y - 22 < r.bottom + MARGE_INTRO;
}
function placerPoints(liste) {
  for (const { id, x, y, visible: vu } of liste) {
    const p = points[id]; if (!p) continue;
    const couvert = sousAccueil(x, y), visible = vu && !couvert;
    p.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    p.dataset.cache = String(!visible);
    if (couvert !== (p.dataset.couvert === 'true')) { p.dataset.couvert = String(couvert); if (!id.startsWith('tiroir:')) p.tabIndex = couvert ? -1 : 0; }
    // Un tiroir n'est au clavier que devant le caisson : au bureau, Tab n'atterrit pas sur un point qu'on ne voit pas.
    if ((id.startsWith('tiroir:') || id === 'fisheye') && p.tabIndex !== (visible ? 0 : -1)) p.tabIndex = visible ? 0 : -1;
    const demi = (largeurEtiquette[id] ||= p.querySelector('.point__etiquette')?.offsetWidth || 0) / 2;
    let d = Math.round(Math.max(0, 8 - (x - demi)) + Math.min(0, document.documentElement.clientWidth - 8 - (x + demi)));
    // Une étiquette qui toucherait le panneau d'accueil glisse à sa droite.
    if (etat.vue === 'accueil' && rectIntro && !couvert && x - demi < rectIntro.right + MARGE_INTRO && y - 86 < rectIntro.bottom && y > rectIntro.top - MARGE_INTRO) d = Math.max(d, Math.round(rectIntro.right + MARGE_INTRO - (x - demi)));
    d += evitement[id] || 0;
    if (d !== decalageEtiquette[id]) { decalageEtiquette[id] = d; p.style.setProperty('--decalage', `${d}px`); }
  }
  pointsVus = liste.filter((p) => p.visible && points[p.id]);
  // Au doigt, chaque point montre son étiquette en permanence : celles qui en chevaucheraient une autre se replient, le point
  // reste. On ne lit pas le DOM à chaque image pour cela : seulement quand l'ordre des points a pu changer.
  orienterEtiquettes(liste);
  if (document.body.classList.contains('etiquettes')) replierEtiquettes(liste);
}
// Une étiquette se pose au-dessus de son point ; si elle cacherait un point voisin ou le bouton pour remonter, elle passe dessous. Relu seulement quand les points ont bougé.
let dernierSens = '';
function orienterEtiquettes(liste) {
  // Au doigt, les étiquettes restent affichées : celle du tiroir du casier couvrait la pieuvre, qui se tient juste au-dessus de son point.
  const elle = document.body.classList.contains('etiquettes') ? scene?.rectPieuvre?.() : null;
  const cle = liste.map((p) => `${Math.round(p.x / 8)},${Math.round(p.y / 8)},${p.visible}`).join(';') + (elle ? `;${Math.round(elle.gauche / 8)},${Math.round(elle.haut / 8)}` : '');
  if (cle === dernierSens) return;
  dernierSens = cle;
  const vus = liste.filter((p) => p.visible && points[p.id]), bouton = $('#remonter');
  // Le bouton ne suit pas la scène : c'est la hauteur de la fenêtre qui y amène un point, pas sa largeur.
  const obstacles = bouton.hidden ? [] : [bouton.getBoundingClientRect()];
  // L'objectif : son point est au sommet du verre, une étiquette voisine couvrirait le reste. Au téléphone, c'était « Tiens, une serrure ».
  const lentille = vus.find((p) => p.id === 'fisheye');
  if (lentille) obstacles.push({ left: lentille.x - 60, right: lentille.x + 60, top: lentille.y, bottom: lentille.y + 80 });
  for (const { id, x, y } of vus) {
    const e = points[id].querySelector('.point__etiquette'), demi = (largeurEtiquette[id] ||= e.offsetWidth) / 2, h = e.offsetHeight || 48, cx = x + (decalageEtiquette[id] || 0);
    const cache = (haut) => vus.some((o) => o.id !== id && Math.abs(o.x - x) < demi + 14 && o.y > haut - 14 && o.y < haut + h + 14);
    const gene = (haut) => obstacles.some((o) => o.left < cx + demi + 8 && cx - demi - 8 < o.right && o.top < haut + h + 8 && haut - 8 < o.bottom);
    points[id].dataset.sous = String((cache(y - 46 - h) || gene(y - 46 - h)) && !cache(y + 46) && !gene(y + 46));
    // Elle a un haut et un bas de page à elle : pas de bascule possible sous le point, trop de voisins. L'étiquette glisse de côté, du côté qui a la place.
    const place = cx - (evitement[id] || 0);
    let ecart = 0;
    if (elle && points[id].dataset.sous !== 'true' && place - demi < elle.droite + 8 && elle.gauche - 8 < place + demi && y - 46 - h < elle.bas && elle.haut - 16 < y - 46) {
      const gauche = elle.gauche - 8 - (place + demi), droite = elle.droite + 8 - (place - demi);
      ecart = place + gauche - demi >= 8 ? gauche : droite;
    }
    // Écrit ici et pas à l'image suivante : en mouvement réduit, il n'y en aura peut-être pas.
    if (ecart !== (evitement[id] || 0)) { decalageEtiquette[id] = (decalageEtiquette[id] || 0) - (evitement[id] || 0) + ecart; evitement[id] = ecart; points[id].style.setProperty('--decalage', `${decalageEtiquette[id]}px`); }
  }
}
let derniereDisposition = '';
function replierEtiquettes(liste) {
  // Au clavier, l'étiquette de l'objet périphérique visé passe avant ses voisines au téléphone.
  const objetVise = ['console', 'radio'].find(id => document.activeElement === points[id]);
  const ordre = objetVise ? [...liste].sort((a, b) => Number(b.id === objetVise) - Number(a.id === objetVise)) : liste;
  const cle = String(objetVise) + liste.map((p) => `${Math.round(p.x / 6)},${Math.round(p.y / 6)},${p.visible}`).join(';') + cleObstacles + boitesZones.map((z) => Math.round(z.h / 6)).join();
  if (cle === derniereDisposition) return;
  derniereDisposition = cle;
  // Les libellés et les commandes passent avant : une étiquette qui les toucherait se replie, son point reste.
  const fixes = [...boitesZones, ...obstaclesFixes().map((b) => ({ g: b.left, d: b.right, h: b.top, b: b.bottom }))];
  const pris = [], H = 34;
  for (const { id, x, y, visible } of ordre) {
    const p = points[id]; if (!p || !visible || id === 'tiroir:surprise') continue;
    // Sa place réelle : près d'un bord, l'étiquette a glissé vers l'intérieur (decalageEtiquette).
    const demi = largeurEtiquette[id] / 2, cx = x + (decalageEtiquette[id] || 0), boite = { g: cx - demi, d: cx + demi, h: y - 40 - H, b: y - 40 };
    // Contre ce qui ne bouge pas, sa vraie boîte : selon les voisins, l'étiquette se pose au-dessus ou au-dessous de son point.
    const vraie = p.querySelector('.point__etiquette').getBoundingClientRect();
    const touche = (a, x) => a.g < x.d && x.g < a.d && a.h < x.b && x.h < a.b;
    const gene = pris.some((a) => touche(a, boite)) || (id !== 'caisson' && fixes.some((a) => touche(a, { g: vraie.left, d: vraie.right, h: vraie.top, b: vraie.bottom })));
    p.dataset.replie = String(gene);
    if (!gene) pris.push(boite);
  }
}
const zones = Object.fromEntries($$('.zone').map((z) => [z.dataset.zone, z]));
// Les libellés suivent le plateau, tout au bas de l'image : ils contournent ce qui ne bouge pas (commandes du bas, choix du ciel, appel
// des tiroirs), en remontant. Ces boîtes se relisent quand la disposition change, pas à chaque image.
let cleObstacles = '', boitesFixes = [], pointsVus = [], boitesZones = [];
const FIXES = ['.ciel-choix', '#retour-intro', '#recentrer', '#montrer', '.barre__reglages', '.piece__remonter', '.point[data-objet="caisson"] .point__etiquette'];
function obstaclesFixes() {
  // L'étiquette de l'appel glisse en transition à l'entrée : c'est sa boîte du moment qui compte, pas celle de la vue.
  const p = points.caisson, e = p?.querySelector('.point__etiquette')?.getBoundingClientRect();
  const cle = [innerWidth, innerHeight, etat.vue, document.body.className, p?.dataset.cache, Math.round(e?.left || 0), Math.round(e?.top || 0)].join();
  if (cle === cleObstacles) return boitesFixes;
  cleObstacles = cle;
  boitesFixes = FIXES.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .filter((e) => !(e.closest('.point') && e.closest('.point').dataset.cache !== 'false')).map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.height);
  return boitesFixes;
}
function placerZones(liste) {
  // Sur un écran étroit, deux zones voisines se gêneraient : la seconde monte d'une ligne au lieu de recouvrir la première.
  const posees = [], L = document.documentElement.clientWidth;
  // Les points aussi : un libellé posé sur un point empêcherait de le viser.
  const obstacles = [...obstaclesFixes(), ...pointsVus.map((p) => ({ left: p.x - 12, right: p.x + 12, top: p.y - 12, bottom: p.y + 12 }))];
  for (const { id, x, y, visible } of [...liste].sort((a, b) => a.x - b.x)) {
    const z = zones[id]; if (!z) continue;
    const l = z.offsetWidth, h = z.offsetHeight, g = Math.max(6, Math.min(L - l - 6, x - l / 2));
    // La place libre la plus proche de son objet, au-dessus ou au-dessous d'un obstacle : il ne s'éloigne que du nécessaire.
    const devant = [...posees.map((p) => ({ left: p.g, right: p.d, top: p.y, bottom: p.y + h })), ...obstacles].filter((b) => b.left < g + l + 4 && g - 4 < b.right);
    const libre = (v) => !devant.some((b) => b.top < v + h + 2 && v - 2 < b.bottom);
    const yb = [y, ...devant.flatMap((b) => [b.top - h - 3, b.bottom + 3])].filter((v) => v >= 0 && v + h <= innerHeight - 4 && libre(v)).sort((u, v) => Math.abs(u - y) - Math.abs(v - y))[0] ?? y;
    posees.push({ g, d: g + l, y: yb });
    z.style.transform = `translate3d(${g.toFixed(1)}px, ${yb.toFixed(1)}px, 0)`;
    z.dataset.cache = String(!visible);
  }
  boitesZones = posees.map((p) => ({ g: p.g, d: p.d, h: p.y, b: p.y + 22 }));
}

// --- Démarrage de la scène : chargé après la présentation, jamais bloquant ---
async function demarrerScene() {
  const conteneur = $('#scene');
  // Pas de WebGL : on reste sur le repli peint en CSS.
  const essai = document.createElement('canvas');
  if (!(essai.getContext('webgl2') || essai.getContext('webgl'))) return panne('WebGL indisponible');
  etat.scene = 'chargement';
  try {
    // Contenu injecté par js/scene-contenu.js (fonctionne en file://) ; fetch seulement en secours.
    const contenu = window.__MT_CONTENU || await (await fetch('js/scene-contenu.json')).json();
    const { creerScene } = await import('./scene/scene.js');
    scene = await creerScene({
      conteneur, contenu, ciel: ambiance.etat(),
      rappels: {
        survol: (id) => { if (id === 'pieuvre') psst.retirer(); if (id) arreterVague(); $$('.point').forEach((p) => { p.dataset.actif = String(p.dataset.objet === id); }); },
        choix: (id) => { if (id === 'tasse') { retourFocus = points.tasse || null; entrerTasse(); return; } const p = points[id]; if (!p) return; retourFocus = p; if (p.dataset.lien !== undefined) { p.click(); return; } if (p.dataset.action) { ACTIONS[p.dataset.action](); return; } if (etat.vue === 'accueil') etat.vue = 'exploration'; naviguer(p.dataset.destination, { fiche: p.dataset.fiche || null, objet: id }); },
        points: placerPoints, zones: placerZones,
        vueCaisson: (oui) => {
          document.body.classList.toggle('vue-caisson', oui); $('#remonter').hidden = !oui;
          // Un panneau ouvert depuis le menu garde son focus ; sinon, on revient là d'où l'on est descendu.
          if (!oui && etat.vue !== 'panneau') { annonce('Retour au bureau.'); points.caisson?.focus({ preventScroll: true }); }
        },
        pieuvre: (p) => { bulle.brancher(p); p.surEntree(() => psst.montrer()); },
        imagePieuvre: () => psst.placer(),
        recentre,
        panne: (raison) => panne(raison),
        retabli: () => { html.classList.remove('sans-scene'); html.classList.add('scene-prete'); etat.scene = 'prete'; window.__atelier = { etat, scene, plongee, tasse, ambiance }; cadrerScene(); },
      },
    });
    publierRadio();
    scene.reglages({ mouvementReduit: etat.mouvementReduit, effets: etat.effets });
    if (!tasse.disponible) scene.tasseInerte();
    etat.scene = 'prete';
    html.classList.add('scene-prete');
    cadrerScene();
    setTimeout(vague, 400);
    window.__atelier = { etat, scene, plongee, tasse, tiroir, grandAngle, consolePoche, ambiance, journalVague, bulle, filmCafe }; // point d'accès pour les essais automatisés
    // Le tonnerre suit l'éclair, seulement si le son est activé.
    scene.surTonnerre(() => { if (etat.son) son?.tonnerre(); });
    ambiance.brancher(scene);
    // La mousse se peint dès que le navigateur respire, jamais au moment du clic.
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => tasse.preparer());
    if (new URLSearchParams(location.search).has('ips')) monterCompteur();
    // Rendu en pause quand l'onglet est caché ou que l'accueil n'est plus visible (lecture de la présentation).
    let visible = true;
    document.addEventListener('visibilitychange', () => scene.pause(document.hidden || !visible || plongee.etat().phase==='dedans'));
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; scene.pause(document.hidden || !visible || plongee.etat().phase==='dedans'); }).observe($('#accueil'));
    addEventListener('resize', () => { if (etat.vue === 'panneau') cadrerScene(); });
    syncAdresse();
  } catch (err) {
    console.warn('Scène indisponible :', err);
    panne(String(err && err.message || err));
  }
}
// ?ips dans l'adresse : compteur d'images discret, pour lire le vrai rendu sur son propre poste.
// Les mesures restent dans la page ; rien n'est enregistré ni envoyé.
function monterCompteur() {
  const el = document.createElement('p'); el.className = 'ips'; el.setAttribute('aria-hidden', 'true'); document.body.append(el);
  setInterval(() => {
    const m = scene?.mesureIps(); if (!m) return;
    if (m.pause) { el.textContent = plongee.etat().phase === 'dedans' ? 'scène 3D en pause · Rouille au premier plan' : 'scène 3D en pause'; return; }
    const d = m.durees.slice(-60); if (d.length < 5) { el.textContent = 'mesure…'; return; }
    const tri = [...d].sort((a, b) => a - b), mediane = tri[tri.length >> 1], p95 = tri[Math.floor(tri.length * 0.95)];
    el.textContent = `${(1000 / mediane).toFixed(0)} i/s · médiane ${mediane.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · ${m.niveau} · DPR ${m.dpr.toFixed(2)}`;
  }, 500);
}
function panne(raison) {
  etat.scene = 'panne';
  if(plongee.active)plongee.revenir({sansTravelling:true});
  if (tasse.active) tasse.revenir({ sansTravelling: true });
  if (tiroir.active) tiroir.revenir({ sansTravelling: true });
  if (grandAngle.active) grandAngle.revenir({ sansTravelling: true });
  if (consolePoche.active) consolePoche.revenir({ sansTravelling: true });
  html.classList.add('sans-scene'); html.classList.remove('scene-prete');
  if (etat.vue === 'panneau') { panneau.hidden = true; etat.vue = 'accueil'; }
  etat.vue = 'accueil'; appliquer();
  $('#scene-description').dataset.raison = raison;
  // Message visible (pas seulement un attribut) : le visiteur sans 3D doit savoir pourquoi, et où est le contenu.
  if (!$('[data-repli-webgl]')) {
    const m = document.createElement('p'); m.className = 'tako-bandeau'; m.setAttribute('role', 'status'); m.dataset.repliWebgl = '';
    m.innerHTML = (/webgl/i.test(raison) ? 'L’atelier 3D a besoin de WebGL, indisponible dans ce navigateur. ' : 'L’atelier 3D n’a pas pu démarrer (WebGL ou mémoire graphique). ')
      + 'Tout le contenu est dans <a href="#presentation">la présentation</a>, ci-dessous.';
    $('#intro').prepend(m);
  }
  // On garde la scène (si elle existe) : un contexte graphique perdu peut être rendu par le navigateur.
  window.__atelier = { etat, scene: scene || null, plongee, tasse, ambiance, raison };
  // Si une ancre était demandée, la présentation classique la montre directement.
  const { destination, fiche } = lireAncre();
  if (destination) document.getElementById(fiche ? `${destination}-${fiche}` : destination)?.scrollIntoView();
}

// Onglet caché : le son se suspend aussi (le réglage choisi est conservé).
document.addEventListener('visibilitychange', () => { publierRadio(); son?.suspendre(document.hidden); });

$$('main [data-notes]').forEach((d) => monterNotes(d));
appliquer();
demarrerScene();

// --- Hors ligne : service worker (fichiers publics du site seulement) et avis de mise à jour ---
// Pourquoi un avis plutôt qu'un rechargement automatique : l'utilisateur peut être en train d'écrire une note.
// En file:// (double-clic), ni manifeste ni service worker : le navigateur les refuse, le site marche sans.
if (/^https?:$/.test(location.protocol)) {
  const m = document.createElement('link'); m.rel = 'manifest'; m.href = 'manifest.webmanifest'; document.head.append(m);
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const avis = $('#maj');
  // Une nouvelle version vient de prendre la main (elle le fait seule, sw-modele.js). Tant que le visiteur n'a rien touché, UN rechargement
  // automatique lui donne la nouvelle version, y compris dans un onglet repris après des heures. S'il a commencé, jamais rien sous ses doigts :
  // l'avis le dit, et le prochain chargement sera neuf de toute façon.
  const CLE_RECHARGE = 'mt-maj-recharge', GARDE_RECHARGE = 60000;
  let interaction = false;
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, () => { interaction = true; }, { capture: true, passive: true, once: true });
  const occupee = () => interaction || document.activeElement?.matches('input, textarea, select, [contenteditable]') || plongee.active || tasse.active || tiroir.active || consolePoche.active;
  // La garde anti-boucle : un seul rechargement automatique par minute dans cet onglet. Sans sessionStorage, pas de garde possible : on ne
  // recharge pas tout seul, l'avis suffit.
  const rechargementPermis = () => {
    try {
      const dernier = Number(sessionStorage.getItem(CLE_RECHARGE));
      if (dernier && Date.now() - dernier < GARDE_RECHARGE) return false;
      sessionStorage.setItem(CLE_RECHARGE, String(Date.now()));
      return true;
    } catch { return false; }
  };
  let dejaControlee = !!navigator.serviceWorker.controller, rechargement = false;
  const recharger = () => { if (rechargement) return; rechargement = true; viderEnAttente(); location.reload(); };
  $('#maj-ok').addEventListener('click', recharger);
  $('#maj-plus-tard').addEventListener('click', () => { avis.hidden = true; });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // La toute première installation prend la page sans rien changer à ce qu'elle a chargé.
    if (!dejaControlee) { dejaControlee = true; return; }
    if (!occupee() && rechargementPermis()) recharger(); else avis.hidden = false;
  });
  navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
    // Un onglet resté ouvert regarde aussi s'il y a du neuf quand on y revient.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => { /* hors ligne : on réessaiera */ }); });
    window.__pwa = { reg };
  }).catch(() => { /* sans service worker, le site marche en ligne comme avant */ });
}
