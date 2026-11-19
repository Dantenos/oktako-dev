// La console de poche « Takito SYSTEM », côté page (lot portfolio-console-poche, 02/11/2026) : au clic, la vue s'approche de son
// écran (scene.entrerConsole) et l'interface vivante du faux téléphone se pose exactement sur la dalle ; au téléphone, l'écran du
// visiteur DEVIENT celui de la console. L'interface est la maquette choisie par l'utilisateur (13 h 07), thème ambre : écran de
// verrouillage, accueil (barre d'état, grille, dock, barre de geste), applis qui s'ouvrent depuis leur icône. Chaque appli est un
// de ses jeux (console-donnees.js) ; celle qui ne tourne pas dans le navigateur ouvre une fiche, jamais un écran vide.
// Un jeu jouable ici (champ jeu, lot octosnake-portfolio du 16/11/2026) se lance pour de vrai : sa page statique, servie par le
// site, s'ouvre dans un cadre posé sur l'écran de la console, au pixel réel (hors de l'interface mise à l'échelle : le jeu voit
// un écran de téléphone, pas 264 px agrandis). La scène 3D se met en pause tant qu'il tourne ; Échap revient au bureau de la
// console et le cadre est retiré (le jeu s'arrête, son et calcul compris).
// Clavier : Entrée ouvre, flèches dans la grille, Échap revient d'un cran (appli, puis console reposée). Mouvement réduit : rien
// ne s'anime. Lecteurs d'écran : un dialogue nommé, des boutons nommés, chaque changement annoncé.
import { APPLIS, DOCK, DESSINS, ECRAN } from './console-donnees.js';
import { creerBas, texteEchap } from './fermer.js';

// L'interface est dessinée pour la dalle de la maquette (264 px de large) puis mise à l'échelle de la dalle réelle.
const LARGEUR_UI = 264;
// Au téléphone, la bande du haut garde le bouton « Reposer la console » hors de l'interface.
const BANDE = 56;
const icone = (d) => `<svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${DESSINS[d].flatMap((l, j) => [...l].map((c, i) => (c === '#' ? `<rect x="${i}" y="${j}" width="1" height="1"/>` : ''))).join('')}</svg>`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const heure = (m) => m.toTimeString().slice(0, 5);
const date = (m) => m.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// Le corps d'une appli : statut, citation de sa source, texte, captures, lien. Rien d'autre.
function corps(a) {
  if (a.galerie) return `<div class="tk-vignettes">${APPLIS.flatMap((x) => x.medias || []).map((m) => `<img src="console/${esc(m.src)}" alt="${esc(m.alt)}" loading="lazy">`).join('')}</div>`;
  if (a.reglages) return `<p>Le tube de la console :</p><div class="tk-choix"><button type="button" class="tk-bascule" data-reglage="balayage" aria-pressed="true">Lignes de balayage</button></div><p>Les animations suivent le réglage « Animations » de la pièce.</p>`;
  const lien = a.lien ? `<a class="tk-action" href="${esc(a.lien.href)}"${a.lien.externe ? ' target="_blank" rel="noopener"' : ''}>${esc(a.lien.libelle)}</a>` : '';
  const grand = !a.medias?.length && a.icone ? `<div class="tk-grand-icone">${icone(a.icone)}</div>` : '';
  const [premier, ...autres] = a.medias || [];
  return `${a.statut ? `<p class="tk-statut">${esc(a.statut)}</p>` : ''}${a.citation ? `<blockquote>« ${esc(a.citation)} »</blockquote>` : ''}${grand}`
    + `${premier ? `<img src="console/${esc(premier.src)}" alt="${esc(premier.alt)}" loading="lazy">` : ''}${(a.texte || []).map((t) => `<p>${esc(t)}</p>`).join('')}`
    + `${autres.length ? `<div class="tk-vignettes">${autres.map((m) => `<img src="console/${esc(m.src)}" alt="${esc(m.alt)}" loading="lazy">`).join('')}</div>` : ''}${lien}`;
}

export function creerConsolePoche({ scene, mouvementReduit, annoncer, telephone, auRetour }) {
  let phase = 'repos', racine = null, ui = null, ouverte = null, depuis = null, focusAvant = null, minuteur = null, y0 = null, jeu = null;
  const inerties = new Map();
  const $ = (s) => racine.querySelector(s);

  function construire() {
    racine = document.createElement('section'); racine.className = 'tiroir console-poche'; racine.dataset.phase = phase;
    for (const [nom, couleur] of Object.entries(ECRAN.theme)) racine.style.setProperty(`--tk-${nom}`, couleur);
    racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-modal', 'true'); racine.setAttribute('aria-labelledby', 'tk-titre');
    const bouton = (a) => `<button type="button" class="tk-appli" data-appli="${a.id}"><span class="tk-tuile">${icone(a.icone)}</span><small>${esc(a.nom)}</small></button>`;
    racine.innerHTML = `<h2 class="tk-sr" id="tk-titre">La console de poche : mes jeux</h2>
      <button type="button" class="tako-bouton tiroir__retour tk-reposer">${esc(texteEchap('← Reposer la console · Échap'))}</button>
      <div class="tk-ecran" data-balayage="oui">
        <div class="tk-vue tk-verrou" data-vue="verrou">
          <div class="tk-heure" data-heure></div><div class="tk-date" data-date></div>
          <div class="tk-invite" aria-hidden="true">⌃ glisser pour ouvrir</div>
          <button type="button" class="tk-deverrouiller">Déverrouiller</button>
        </div>
        <div class="tk-vue tk-accueil" data-vue="accueil" hidden>
          <div class="tk-etat"><span data-heure></span><span class="tk-pile">ENCRE <svg viewBox="0 0 24 12" aria-hidden="true" focusable="false"><rect x="1" y="1" width="19" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="21" y="4" width="2" height="4"/><rect x="3" y="3" width="4" height="6"/><rect x="8" y="3" width="4" height="6"/><rect x="13" y="3" width="4" height="6"/></svg><span class="tk-sr">batterie : trois crans d’encre</span></span></div>
          <div class="tk-horloge" aria-hidden="true"><b data-heure></b><div data-date></div></div>
          <ul class="tk-grille" aria-label="Mes jeux">${APPLIS.map((a) => `<li>${bouton(a)}</li>`).join('')}</ul>
          <div class="tk-dock" role="group" aria-label="Dock">${DOCK.map(bouton).join('')}</div>
          <button type="button" class="tk-geste" aria-label="Verrouiller la console" data-geste="verrou"></button>
        </div>
        <div class="tk-vue tk-appli-ouverte" data-vue="appli" hidden>
          <div class="tk-entete"><button type="button" class="tk-retour">‹ Retour</button><h3 id="tk-titre-appli" tabindex="-1"></h3></div>
          <div class="tk-corps"></div>
          <button type="button" class="tk-geste" aria-label="Revenir à l’accueil" data-geste="accueil"></button>
        </div>
      </div>`;
    const aide = document.createElement('p'); aide.className = 'tiroir__aide'; aide.setAttribute('aria-hidden', 'true'); aide.textContent = 'Échap pour revenir';
    racine.append(creerBas(aide, () => revenir()));
    ui = $('.tk-ecran');
    racine.addEventListener('click', clic);
    ui.addEventListener('pointerdown', (e) => { const r = ui.getBoundingClientRect(); y0 = !$('.tk-verrou').hidden || e.clientY > r.bottom - r.height * 0.3 ? e.clientY : null; });
    ui.addEventListener('pointerup', (e) => {
      if (y0 === null) return; const d = y0 - e.clientY; y0 = null;
      if (d < 40 * echelle()) return;
      if (!$('.tk-verrou').hidden) deverrouiller(); else if (ouverte) fermer();
    });
    horloge(); minuteur = setInterval(horloge, 15000);
  }
  const echelle = () => ui ? ui.getBoundingClientRect().width / LARGEUR_UI : 1;
  function horloge() { const m = new Date(); racine?.querySelectorAll('[data-heure]').forEach((e) => { e.textContent = heure(m); }); racine?.querySelectorAll('[data-date]').forEach((e) => { e.textContent = date(m); }); }

  // L'interface sur la dalle : même rectangle que l'écran 3D à l'arrivée, mise à l'échelle depuis ses 264 px de large. Au
  // téléphone, elle remplit l'écran du visiteur : même largeur logique, la hauteur suit l'écran.
  function poser() {
    if (!ui) return;
    if (telephone()) {
      // Sous la bande du bouton « Reposer » (BANDE px), tout l'écran du visiteur.
      const k = innerWidth / LARGEUR_UI;
      Object.assign(ui.style, { left: '0px', top: `${BANDE}px`, width: `${LARGEUR_UI}px`, height: `${(innerHeight - BANDE) / k}px`, transform: `scale(${k})` });
      racine.dataset.plein = 'oui'; poserJeu(); return;
    }
    const r = scene().rectangleConsole(), k = r.l / LARGEUR_UI;
    Object.assign(ui.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${LARGEUR_UI}px`, height: `${r.h / k}px`, transform: `scale(${k})` });
    racine.dataset.plein = 'non';
    poserJeu();
  }
  // Le cadre du jeu : exactement le rectangle affiché de l'écran, en pixels réels.
  function poserJeu() {
    if (!jeu || !ui) return;
    const r = ui.getBoundingClientRect();
    Object.assign(jeu.cadre.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  // Au redimensionnement, la scène recadre d'abord sa caméra (format, pose d'arrivée) : l'interface se repose à l'image suivante.
  const poserApres = () => requestAnimationFrame(poser);

  function montrer(vue) { racine.querySelectorAll('.tk-vue').forEach((v) => { v.hidden = !(v.dataset.vue === vue || (vue === 'appli' && v.dataset.vue === 'accueil')); }); $('.tk-accueil').inert = vue === 'appli'; }
  function deverrouiller() { montrer('accueil'); annoncer('Accueil de la console : six applis et un dock.'); $('.tk-grille button').focus({ preventScroll: true }); }
  function verrouiller() { fermer(true); montrer('verrou'); annoncer('Console verrouillée.'); $('.tk-deverrouiller').focus({ preventScroll: true }); }

  function ouvrir(id, source) {
    const a = [...APPLIS, ...DOCK].find((x) => x.id === id); if (!a) return;
    if (a.jeu) return lancer(a, source);
    ouverte = a; depuis = source;
    // L'appli grandit depuis son icône : l'origine de l'animation est le centre de l'icône, dans le repère de l'interface.
    const e = ui.getBoundingClientRect(), r = source.getBoundingClientRect(), k = echelle(), vue = $('.tk-appli-ouverte');
    vue.style.transformOrigin = `${(r.left + r.width / 2 - e.left) / k}px ${(r.top + r.height / 2 - e.top) / k}px`;
    $('#tk-titre-appli').textContent = a.nom; $('.tk-corps').innerHTML = corps(a); vue.scrollTop = 0;
    montrer('appli'); vue.classList.remove('tk-ferme'); if (!mouvementReduit()) vue.classList.add('tk-ouvre');
    $('#tk-titre-appli').focus({ preventScroll: true }); annoncer(`${a.nom} ouvert.`);
  }
  // Le jeu : l'écran de l'appli annonce le chargement, le cadre se charge par-dessus et ne se montre qu'une fois la page du jeu
  // lue (son menu présent). Une page absente, coupée ou trop lente rend la fiche du jeu avec la raison : jamais un écran vide.
  function lancer(a, source) {
    ouverte = a; depuis = source;
    const vue = $('.tk-appli-ouverte'); vue.classList.remove('tk-ouvre', 'tk-ferme'); vue.scrollTop = 0;
    $('#tk-titre-appli').textContent = a.nom;
    $('.tk-corps').innerHTML = `<p class="tk-statut">${esc(a.statut)}</p><p class="tk-chargement" role="status">Chargement de ${esc(a.nom)}…</p>`;
    montrer('appli');
    const cadre = document.createElement('iframe'), jeton = {};
    cadre.className = 'tk-jeu'; cadre.title = a.jeu.titre; cadre.allow = 'autoplay; fullscreen';
    jeu = { cadre, jeton, pret: false, delai: setTimeout(() => { if (jeu?.jeton === jeton && !jeu.pret) echec(a, `${a.nom} ne répond pas.`); }, 30000) };
    cadre.addEventListener('load', () => {
      if (jeu?.jeton !== jeton) return;
      try {
        const w = cadre.contentWindow;
        if (!w.document.getElementById('menu')) throw new Error('page du jeu absente');
        // Échap tombe dans le document du jeu, qui a le focus : il revient au bureau de la console. Une répétition d'Échap
        // tenu n'y fait rien d'autre, pour ne pas reposer aussi la console.
        w.document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) fermer(); } }, true);
        clearTimeout(jeu.delai); jeu.pret = true; cadre.dataset.pret = 'oui';
        cadre.focus({ preventScroll: true }); w.focus();
        annoncer(`${a.nom} lancé. Échap pour revenir au bureau de la console.`);
      } catch { echec(a, `${a.nom} n’a pas pu se charger.`); }
    }, { once: true });
    cadre.src = a.jeu.src + (mouvementReduit() ? '?reduit=1' : '');
    racine.append(cadre); poserJeu();
    $('.tk-reposer').textContent = texteEchap('← Quitter le jeu · Échap');
    scene()?.pause(true);
    annoncer(`Lancement de ${a.nom}…`);
  }
  function arreterJeu() {
    if (!jeu) return;
    clearTimeout(jeu.delai); jeu.cadre.remove(); jeu = null;
    $('.tk-reposer').textContent = texteEchap('← Reposer la console · Échap');
    scene()?.pause(false);
  }
  function echec(a, raison) {
    arreterJeu();
    $('.tk-corps').innerHTML = `<p class="tk-chargement" role="alert">${esc(raison)} Vérifiez la connexion, puis relancez-le depuis le bureau.</p>${corps(a)}`;
    annoncer(raison);
  }
  function fermer(sansFocus) {
    if (!ouverte) return;
    arreterJeu();
    const vue = $('.tk-appli-ouverte'), nom = ouverte.nom, source = depuis; ouverte = null;
    const fin = () => { vue.classList.remove('tk-ouvre', 'tk-ferme'); if (!ouverte) { montrer('accueil'); if (!sansFocus) source?.focus({ preventScroll: true }); } };
    annoncer(`${nom} fermé.`);
    if (mouvementReduit()) fin(); else { vue.classList.remove('tk-ouvre'); vue.classList.add('tk-ferme'); vue.addEventListener('animationend', fin, { once: true }); }
  }

  function clic(e) {
    const b = e.target.closest('button, a'); if (!b || !racine.contains(b)) return;
    if (b.matches('.tk-reposer')) return jeu ? fermer() : revenir();
    if (b.matches('.tk-deverrouiller')) return deverrouiller();
    if (b.matches('.tk-retour')) return fermer();
    if (b.dataset.geste) return b.dataset.geste === 'verrou' ? verrouiller() : fermer();
    if (b.dataset.appli) return ouvrir(b.dataset.appli, b);
    if (b.dataset.reglage === 'balayage') { const oui = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(oui)); ui.dataset.balayage = oui ? 'oui' : 'non'; return; }
    // Un lien vers une rubrique du site : la console se repose d'abord, puis la rubrique s'ouvre.
    if (b.matches('a[href^="#"]')) { e.preventDefault(); const h = b.getAttribute('href'); revenir().then(() => { location.hash = h; }); }
  }

  async function entrer() {
    if (phase !== 'repos' || !scene()) return;
    phase = 'aller'; focusAvant = document.activeElement; construire(); racine.dataset.phase = phase;
    document.body.append(racine);
    for (const e of document.body.children) if (e !== racine && e.id !== 'annonce') { inerties.set(e, e.inert); e.inert = true; }
    document.body.classList.add('tiroir-actif'); $('.tk-reposer').focus({ preventScroll: true });
    annoncer('La vue s’approche de la console de poche.');
    await scene().entrerConsole();
    if (phase !== 'aller') return;
    // Arrivée : l'interface se pose sur la dalle, puis la dalle 3D cède sa place (son verre et son balayage s'effacent).
    poser(); phase = 'arrivee'; racine.dataset.phase = phase; scene().relaisConsole(0);
    addEventListener('resize', poserApres);
    $('.tk-deverrouiller').focus({ preventScroll: true });
    annoncer('La console : écran verrouillé. Entrée pour l’ouvrir, Échap pour la reposer.');
  }
  async function revenir({ sansTravelling = false } = {}) {
    if (phase === 'repos' || phase === 'retour') return;
    arreterJeu();
    phase = 'retour'; racine.dataset.phase = phase; removeEventListener('resize', poserApres); clearInterval(minuteur);
    scene()?.relaisConsole(1);
    if (!sansTravelling) await scene()?.sortirTiroir();
    racine.remove(); racine = ui = null; ouverte = null;
    for (const [e, inert] of inerties) e.inert = inert; inerties.clear();
    document.body.classList.remove('tiroir-actif'); phase = 'repos';
    auRetour(); focusAvant?.focus({ preventScroll: true }); annoncer('Console reposée.');
  }

  document.addEventListener('keydown', (e) => {
    if (phase === 'repos') return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (ouverte) fermer(); else revenir(); return; }
    // Les flèches : dans la grille de trois colonnes, puis le dock.
    const tous = [...racine.querySelectorAll('.tk-grille button, .tk-dock button')], i = tous.indexOf(document.activeElement);
    const pas = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (pas && i >= 0 && !ouverte) { e.preventDefault(); tous[Math.max(0, Math.min(tous.length - 1, i + pas))].focus({ preventScroll: true }); return; }
    if (e.key !== 'Tab') return;
    // Le focus tourne dans le dialogue : ce qui se voit et se clique, rien derrière.
    const ordre = [...racine.querySelectorAll('button, a[href], [tabindex="0"]')].filter((x) => !x.closest('[hidden], [inert]') && x.offsetParent !== null);
    if (!ordre.length) return; e.preventDefault();
    const j = ordre.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1); ordre[(j + ordre.length) % ordre.length].focus({ preventScroll: true });
  }, true);
  return { entrer, revenir, get active() { return phase !== 'repos'; }, get enJeu() { return !!jeu; }, etat: () => ({ phase, vue: racine ? [...racine.querySelectorAll('.tk-vue')].filter((v) => !v.hidden).map((v) => v.dataset.vue) : [], appli: ouverte?.id || null, jeu: jeu ? (jeu.pret ? 'pret' : 'charge') : null, plein: racine?.dataset.plein || null, rect: ui ? (({ x, y, width, height }) => ({ x, y, l: width, h: height }))(ui.getBoundingClientRect()) : null }) };
}
