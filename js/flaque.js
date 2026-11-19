// La flaque vivante (lot flaque-vivante, 15/11/2026), côté page : sur la dernière image du film, seule la surface du café s'anime,
// à la manière du café de la tasse (scene/cafe.js). Le rendu (flaque-moteur.js) tourne dans un worker sur un OffscreenCanvas
// (flaque-travail.js) : le fil de la page ne fait que poser le canevas, placer les liens et transmettre le pointeur. Sans
// OffscreenCanvas WebGL, le même moteur tourne ici, en étapes. Sans WebGL du tout : creerFlaque rend null, la fin garde son repli.
//
// Rides au survol et au toucher, onde au clic, éclat chaud de la lanterne, houle presque immobile ; la proposition du
// rendez-vous s'écrit DANS le café et vit avec les rides (le pourboire n'est pas dans la fin, 16/11). Les vrais liens HTML sont posés sur le texte peint (film-cafe-fin.js).
// Mouvement réduit : ni houle ni rides, l'écriture posée d'un coup. Rien de lourd : un shader, trois textures, aucune vidéo.
import { mettreEnPageFlaque } from './flaque-ecriture.js';
import { AMPLITUDES, CARTE, CREME, GARDES, couverture, densite, moteur } from './flaque-moteur.js';

export { AMPLITUDES, CREME, GARDES, couverture };

const precharges = new Map();
// Après la demande du film, une fois la vidéo prête : la description et le masque du format joué. null si absent ou en panne
// (la fin garde alors son repli) ; un échec laisse réessayer à la visite suivante.
export function prechargerFlaque(adresse, cle) {
  if (!adresse || !cle) return Promise.resolve(null);
  const k = `${adresse}#${cle}`;
  if (!precharges.has(k)) {
    const p = (async () => {
      const r = await fetch(adresse); if (!r.ok) throw new Error(String(r.status));
      const donnees = (await r.json())[cle]; if (!donnees?.masque) return null;
      const masque = new Image(); masque.decoding = 'async'; masque.src = new URL(donnees.masque, adresse).href;
      await masque.decode();
      return { donnees, masque };
    })().catch(() => { precharges.delete(k); return null; });
    precharges.set(k, p);
  }
  return precharges.get(k);
}

const nouveauCanevas = () => {
  const c = document.createElement('canvas'); c.className = 'film-fin__flaque'; c.setAttribute('aria-hidden', 'true'); return c;
};
const OPTIONS_GL = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };

// Le canal vers le moteur : envoyer(ordre, ...args) rend une promesse tenue une fois l'image rendue ; lire() l'état du moteur.
async function parTravail({ image, masque, d, phrases, reduit, immediat, L, H, dpr, ferme, surEcrit }) {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function' || !HTMLCanvasElement.prototype.transferControlToOffscreen) return null;
  const canvas = nouveauCanevas(), hors = canvas.transferControlToOffscreen();
  // Le décodage en ImageBitmap se fait hors du fil de la page ; le masque est une donnée, sans conversion de couleur.
  const [bi, bm] = await Promise.all([createImageBitmap(image), createImageBitmap(masque, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })]);
  const travail = new Worker(new URL('./flaque-travail.js', import.meta.url), { type: 'module' });
  const pret = new Promise((ok) => {
    // Écriture passée (Échap pendant le film) : « écrit » part avant « prêt ».
    travail.onmessage = ({ data }) => { if (data.type === 'ecrit') surEcrit(); else ok(data); };
    travail.onerror = () => ok({ type: 'echec' });
  });
  travail.postMessage({ type: 'init', canvas: hors, image: bi, masque: bm, donnees: d, phrases, reduit, immediat, L, H, dpr }, [hors, bi, bm]);
  const r = await pret;
  if (r.type !== 'pret' || ferme()) { travail.terminate(); return r.type === 'pret' ? { ferme: true } : null; }
  let n = 0; const attentes = new Map();
  travail.onmessage = ({ data }) => {
    if (data.type === 'ecrit') surEcrit();
    else if (data.type === 'reponse') { attentes.get(data.id)?.(data.valeur); attentes.delete(data.id); }
  };
  const envoyer = (type, ...args) => new Promise((ok) => { const id = ++n; attentes.set(id, ok); travail.postMessage({ type, args, id }); });
  return { mode: 'travail', canvas, carte: r.carte, envoyer, lire: () => envoyer('lire'),
    fermer() { travail.postMessage({ type: 'fermer' }); setTimeout(() => travail.terminate(), 500); for (const ok of attentes.values()) ok(); } };
}
async function surFilPrincipal({ image, masque, d, phrases, reduit, immediat, L, H, dpr, ferme, surEcrit }) {
  const canvas = nouveauCanevas(), gl = canvas.getContext('webgl', OPTIONS_GL);
  if (!gl) return null;
  const m = await moteur({ canvas, gl, image, masque, donnees: d, phrases, reduit, immediat, surEcrit, ferme,
    toile: (l, h) => Object.assign(document.createElement('canvas'), { width: l, height: h }),
    pause: () => new Promise((ok) => setTimeout(ok, 0)), raf: (f) => requestAnimationFrame(f), annulerRaf: (id) => cancelAnimationFrame(id) });
  if (!m) return null;
  if (ferme()) { m.fermer(); return { ferme: true }; }
  m.taille(L, H, dpr); m.demarrer();
  return { mode: 'principal', canvas, carte: m.carte, envoyer: async (type, ...args) => { m[type](...args); }, lire: async () => m.lire(), fermer: () => m.fermer() };
}

// Les boîtes des phrases peintes, en px CSS dans l'hôte (L × H) : la mise en page de la flaque projetée par son recadrage « cover ».
// Une seule source pour le repli à plat (film-cafe-fin.js) et la flaque vivante : les liens ne bougent pas quand l'une remplace l'autre.
export function boitesFlaque(d, page, L, H) {
  const q = couverture(d, L, H);
  return page.boites.map((b) => ({ left: q.x + b.gauche * q.s, top: q.y + b.haut * q.s, width: (b.droite - b.gauche) * q.s, height: (b.bas - b.haut) * q.s }));
}
export const pageFlaque = (phrases, d) => mettreEnPageFlaque(phrases, d.ecriture, { tailleMin: d.taille_min });

// Deux images de la page : l'image rendue par le moteur est alors à l'écran (essais et captures).
const deuxImages = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));

export async function creerFlaque({ hote, image, donnees: d, masque, phrases, mouvementReduit = () => false, immediat = false, ferme = () => false }) {
  // La même mise en page que le moteur (déterministe) : les liens se posent sans attendre le worker.
  const page = pageFlaque(phrases, d);
  let ecrit = immediat || mouvementReduit(), reduit = mouvementReduit();
  const L = hote.clientWidth, H = hote.clientHeight;
  const o = { image, masque, d, phrases, reduit, immediat, L, H, dpr: densite(devicePixelRatio, L, H), ferme, surEcrit: () => { ecrit = true; } };
  let canal = null;
  try { canal = await parTravail(o); } catch { canal = null; }
  if (!canal && !ferme()) { try { canal = await surFilPrincipal(o); } catch { canal = null; } }
  if (!canal || canal.ferme) return null;
  const { canvas, carte } = canal;
  let cover = couverture(d, L, H);
  const dimensionner = () => {
    const l = hote.clientWidth, h = hote.clientHeight;
    cover = couverture(d, l, h); canal.envoyer('taille', l, h, densite(devicePixelRatio, l, h));
  };
  addEventListener('resize', dimensionner);
  hote.append(canvas);
  // La carte du café, au quart : une ride ne naît que là où le masque est assez profond.
  const dansCafe = (x, y) => x >= 0 && y >= 0 && x < d.largeur && y < d.hauteur && carte.donnees[Math.floor(y / CARTE) * carte.largeur + Math.floor(x / CARTE)] > 40;
  const garde = { dernier: 0, xy: null };
  return {
    canvas, page, mode: canal.mode,
    // Les boîtes des phrases peintes, en px CSS dans l'hôte : les vrais liens s'y posent. Le recadrage est relu ici : au redimensionnement,
    // la fin replace ses liens sans attendre que la flaque ait reçu l'événement.
    boites: () => boitesFlaque(d, page, hote.clientWidth, hote.clientHeight),
    // Le pointeur (souris ou doigt, px client) : une ride là où il passe sur le café, au plus toutes les 220 ms ; fort = clic.
    pointeur(cx, cy, { fort = false } = {}) {
      if (reduit) return false;
      const r = hote.getBoundingClientRect(), x = (cx - r.left - cover.x) / cover.s, y = (cy - r.top - cover.y) / cover.s;
      if (!dansCafe(x, y)) return false;
      const ms = performance.now();
      if (!fort && (ms - garde.dernier < GARDES.ondeMinMs || (garde.xy && Math.hypot(x - garde.xy[0], y - garde.xy[1]) < 10))) return false;
      garde.dernier = ms; garde.xy = [x, y];
      canal.envoyer('onde', x, y, fort ? AMPLITUDES.clic : AMPLITUDES.pointeur); return true;
    },
    survol(i) { canal.envoyer('survol', i); },
    // Échap pendant l'écriture : elle se pose d'un coup (true : la touche est prise).
    presser() { if (ecrit) return false; ecrit = true; canal.envoyer('presser'); return true; },
    get ecrit() { return ecrit; },
    // Mouvement réduit basculé pendant la fin : l'animation s'arrête (ou reprend), l'écriture reste posée.
    regler() { reduit = mouvementReduit(); if (reduit) ecrit = true; return canal.envoyer('regler', reduit); },
    // Essais : chaque ordre rend une promesse tenue quand son image est à l'écran.
    figer: (t) => canal.envoyer('figer', t).then(deuxImages),
    onde: (x, y, a = AMPLITUDES.clic) => canal.envoyer('onde', x, y, a).then(deuxImages),
    essai(opts = {}) {
      if (opts.reecrire) ecrit = false; else if (opts.ecrit != null) ecrit = opts.ecrit >= 1.02;
      return canal.envoyer('essai', { creme: CREME, ...opts }).then(deuxImages);
    },
    lire: () => canal.lire().then((e) => ({ ...e, mode: canal.mode, cover: { ...cover } })),
    fermer() { removeEventListener('resize', dimensionner); canal.fermer(); canvas.remove(); },
  };
}
