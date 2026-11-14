// Le tiroir des objectifs, côté page : un dialogue par-dessus la scène, comme la tasse. Chaque objectif porte un vrai bouton
// posé sur son verre : focusable, lu par les lecteurs d'écran. Survol ou focus : la vidéo passe dans le verre ; au doigt, un
// premier toucher la lance, un second ouvre. Clic : la vidéo en grand, sa légende et son lien. Échap, « Retour au bureau » ou
// un clic hors des objectifs referment. Les vidéos viennent de content/objectifs.json et ne se chargent qu'à la demande.
import { creerBas, texteEchap } from './fermer.js';
export function creerTiroir({ scene, lire, mouvementReduit, annoncer, son, auRetour }) {
  let objectifs = [], phase = 'repos', racine = null, retour = null, boutons = [], focusAvant = null, grand = null;
  const inerties = new Map();
  function placer() {
    const rects = scene()?.rectanglesObjectifs() || [];
    boutons.forEach((b, i) => {
      const r = rects[i]; if (!r) return;
      Object.assign(b.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    });
  }
  function fermerGrand() {
    if (!grand) return;
    const { el, bouton } = grand; el.querySelector('video')?.pause(); el.remove(); grand = null; bouton?.focus({ preventScroll: true });
  }
  function ouvrirGrand(i) {
    const o = objectifs[i], el = document.createElement('div');
    el.className = 'visionneuse'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', o.nom);
    const figure = document.createElement('figure'); figure.className = 'visionneuse__figure';
    if (o.video) {
      const v = document.createElement('video');
      v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.poster = o.poster || ''; v.src = o.video;
      // Mouvement réduit : rien ne démarre seul, le bouton de lecture du lecteur reste au visiteur.
      if (!mouvementReduit()) v.autoplay = true;
      figure.append(v);
    } else if (o.poster) {
      const im = document.createElement('img'); im.src = o.poster; im.alt = ''; figure.append(im);
    }
    const legende = document.createElement('figcaption'); legende.className = 'visionneuse__legende';
    const t = document.createElement('strong'); t.textContent = o.nom;
    const p = document.createElement('span'); p.textContent = o.legende;
    legende.append(t, ' ', p);
    if (o.lien) { const a = document.createElement('a'); a.href = o.lien; a.textContent = o.lien_libelle || 'En savoir plus'; if (/^https:/.test(o.lien)) a.rel = 'noopener';
      // Une rubrique du site : le tiroir se referme d'abord, le routeur ne déplace pas une caméra déjà en plongée.
      else a.addEventListener('click', async (e) => { e.preventDefault(); await revenir(); location.hash = o.lien; });
      legende.append(' ', a); }
    figure.append(legende);
    const f = document.createElement('button'); f.type = 'button'; f.className = 'tako-bouton visionneuse__fermer'; f.textContent = texteEchap('Fermer · Échap'); f.addEventListener('click', fermerGrand);
    el.append(f, figure); racine.append(el);
    grand = { el, bouton: boutons[i] }; f.focus({ preventScroll: true });
  }
  function creerBouton(o, i) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tiroir__objectif'; b.hidden = true;
    b.setAttribute('aria-label', `${o.nom} : ${o.legende}`);
    const bulle = document.createElement('span'); bulle.className = 'tiroir__bulle'; bulle.textContent = o.nom; bulle.setAttribute('aria-hidden', 'true'); b.append(bulle);
    let tactile = false;
    b.addEventListener('pointerdown', (e) => { tactile = e.pointerType === 'touch'; });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') scene()?.viserObjectif(i); });
    b.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && document.activeElement !== b) scene()?.viserObjectif(null); });
    b.addEventListener('focus', () => { if (!tactile) scene()?.viserObjectif(i); });
    b.addEventListener('blur', () => scene()?.viserObjectif(null));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      // Au doigt, il n'y a pas de survol : le premier toucher lance la vidéo dans le verre, le second l'ouvre en grand.
      if (tactile && !b.dataset.vu) { for (const x of boutons) delete x.dataset.vu; b.dataset.vu = '1'; scene()?.viserObjectif(i); tactile = false; return; }
      tactile = false; ouvrirGrand(i);
    });
    return b;
  }
  // id : lequel des deux tiroirs à objectifs ; chacun lit sa liste du contenu.
  async function entrer(id = 'tiroir:objectifs') {
    objectifs = lire(id);
    if (phase !== 'repos' || !scene() || !objectifs.length) return;
    phase = 'aller'; focusAvant = document.activeElement;
    racine = document.createElement('section'); racine.className = 'tiroir'; racine.dataset.phase = phase;
    racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-modal', 'true'); racine.setAttribute('aria-labelledby', 'tiroir-titre');
    const titre = document.createElement('h2'); titre.id = 'tiroir-titre'; titre.className = 'tiroir__titre'; titre.textContent = 'Le tiroir des objectifs';
    retour = document.createElement('button'); retour.type = 'button'; retour.className = 'tako-bouton tiroir__retour';
    retour.textContent = texteEchap('← Recentrer · Échap'); retour.addEventListener('click', () => revenir());
    boutons = objectifs.map(creerBouton);
    const aide = document.createElement('p'); aide.className = 'tiroir__aide'; aide.setAttribute('aria-hidden', 'true');
    aide.textContent = 'Survolez un objectif pour voir à travers · cliquez pour agrandir · Échap pour revenir';
    racine.append(titre, retour, ...boutons, creerBas(aide, () => revenir()));
    racine.addEventListener('click', (e) => { if (e.target === racine && phase === 'arrivee') revenir(); });
    document.body.append(racine);
    for (const e of document.body.children) if (e !== racine && e.id !== 'annonce') { inerties.set(e, e.inert); e.inert = true; }
    document.body.classList.add('tiroir-actif'); retour.focus({ preventScroll: true });
    if (!son()?.evenement?.('tiroir-bois-lourd')) son()?.cuillere?.();
    annoncer('Le tiroir s’ouvre.');
    await scene().entrerTiroir(id);
    if (phase !== 'aller') return;
    phase = 'arrivee'; racine.dataset.phase = phase;
    placer(); for (const b of boutons) b.hidden = false;
    annoncer(`${boutons.length} objectifs rangés sur la mousse. Tab pour les parcourir, Échap pour revenir.`);
  }
  async function revenir({ sansTravelling = false } = {}) {
    if (phase === 'repos' || phase === 'retour') return;
    fermerGrand();
    phase = 'retour'; racine.dataset.phase = phase; retour.disabled = true;
    for (const b of boutons) b.hidden = true;
    scene()?.viserObjectif(null);
    if (!sansTravelling) await scene()?.sortirTiroir();
    racine.remove(); racine = retour = null; boutons = [];
    for (const [e, inert] of inerties) e.inert = inert; inerties.clear();
    document.body.classList.remove('tiroir-actif'); phase = 'repos';
    auRetour(); focusAvant?.focus({ preventScroll: true }); annoncer('Tiroir refermé, retour au bureau.');
  }
  document.addEventListener('keydown', (e) => {
    if (phase === 'repos') return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (grand) fermerGrand(); else revenir(); return; }
    if (e.key !== 'Tab' || grand) return;
    e.preventDefault();
    const ordre = [retour, ...boutons.filter((b) => !b.hidden)].filter(Boolean);
    const j = ordre.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1);
    ordre[(j + ordre.length) % ordre.length]?.focus();
  }, true);
  addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(placer)));
  return { entrer, revenir, get active() { return phase !== 'repos'; }, etat: () => ({ phase, grand: !!grand, boutons: boutons.map((b) => ({ cache: b.hidden, rect: b.getBoundingClientRect().toJSON() })) }) };
}
