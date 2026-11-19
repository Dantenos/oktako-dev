// Le worker de la flaque vivante (lot flaque-vivante) : tout le rendu WebGL tourne ici, sur l'OffscreenCanvas transféré par la
// page (flaque.js). Créer un contexte WebGL, compiler le shader, téléverser les textures et dimensionner le tampon coûtaient
// plus de 250 ms d'un bloc sur un téléphone moyen (essai tests/flaque.mjs, processeur ÷ 4) : ici, le fil de la page n'attend rien.
// La page n'envoie que des ordres (taille, onde, survol, Échap, mouvement réduit) ; chacun est acquitté une fois l'image rendue.
import { moteur } from './flaque-moteur.js';

let m = null;
const raf = self.requestAnimationFrame ? (f) => self.requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 16);
const annulerRaf = (id) => (self.cancelAnimationFrame ? self.cancelAnimationFrame(id) : clearTimeout(id));

self.onmessage = async ({ data: q }) => {
  if (q.type === 'init') {
    const gl = q.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    try {
      m = gl && await moteur({ canvas: q.canvas, gl, image: q.image, masque: q.masque, donnees: q.donnees, phrases: q.phrases, reduit: q.reduit, immediat: q.immediat,
        toile: (l, h) => new OffscreenCanvas(l, h), pause: () => new Promise((ok) => setTimeout(ok, 0)), raf, annulerRaf,
        surEcrit: () => self.postMessage({ type: 'ecrit' }) });
    } catch { m = null; }
    // Les images décodées ont servi : leur mémoire est rendue tout de suite.
    q.image.close?.(); q.masque.close?.();
    if (!m) { self.postMessage({ type: 'echec' }); return; }
    m.taille(q.L, q.H, q.dpr); m.demarrer();
    self.postMessage({ type: 'pret', page: m.page, carte: m.carte }, [m.carte.donnees.buffer]);
    return;
  }
  if (!m) return;
  const r = q.type === 'lire' ? m.lire() : (m[q.type]?.(...(q.args || [])), undefined);
  if (q.type === 'fermer') { m = null; self.close(); return; }
  if (q.id != null) self.postMessage({ type: 'reponse', id: q.id, valeur: r });
};
