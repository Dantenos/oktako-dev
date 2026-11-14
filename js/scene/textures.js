// Textures vivantes calculées en canevas 2D : les pages des deux écrans et le point doux des effets.
// Le décor, lui, est cuit dans Blender (tools/blender/atelier.py) et lu par modele.js.
import * as THREE from 'three';
import { rgba } from './couleurs.js';

function toile(l, h) { const c = document.createElement('canvas'); c.width = l; c.height = h; return [c, c.getContext('2d')]; }
function texture(c, { srgb = true, repete = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
const PROSE = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';

// Écran principal : nom, marque, invitation. Décor seulement : le vrai contenu est en HTML.
// Phosphore ambré sur fond brun : l'écran éclaire la pièce dans sa teinte, le vermillon de la marque reste le seul accent.
// heure : l'heure locale du visiteur (« 21:42 »), l'horloge de la pièce, en haut à droite de l'écran.
export function ecran(contenu, curseur = true, heure = '') {
  const [c, g] = toile(1024, 768);
  g.fillStyle = rgba('--mt-scene-ecran'); g.fillRect(0, 0, 1024, 768);
  const v = g.createRadialGradient(512, 384, 100, 512, 384, 640); v.addColorStop(0, rgba('--mt-scene-ecran-lueur', 0.9)); v.addColorStop(1, rgba('--mt-scene-ecran', 0)); g.fillStyle = v; g.fillRect(0, 0, 1024, 768);
  g.fillStyle = rgba('--mt-scene-ambre', 0.75); g.font = `500 26px ${MONO}`; g.fillText('MAJORTAKITO · ATELIER · LILLE', 84, 120);
  if (heure) { g.textAlign = 'right'; g.fillText(heure, 940, 120); g.textAlign = 'left'; }
  g.fillStyle = rgba('--mt-scene-ambre', 0.35); g.fillRect(84, 140, 856, 2);
  g.fillStyle = rgba('--mt-scene-papier'); g.font = `400 84px ${PROSE}`; g.fillText('Édouard', 80, 268); g.fillText('Lantenois', 80, 360);
  g.fillStyle = rgba('--mt-scene-vermillon'); g.font = `italic 400 56px ${PROSE}`; g.fillText('MajorTakito', 84, 446);
  g.fillStyle = rgba('--mt-scene-papier', 0.8); g.font = `400 28px ${MONO}`;
  g.fillText(`${contenu.metier.toLowerCase()} · ${contenu.lieu.toLowerCase()}`, 84, 520);
  g.fillText('formé à l’École 42', 84, 560);
  g.fillStyle = rgba('--mt-scene-ambre', 0.95); g.font = `500 28px ${MONO}`;
  g.fillText('> qui suis-je ?' + (curseur ? ' █' : ''), 84, 660);
  return texture(c, { aniso: 4 });
}
// Petit terminal Rouille : texte phosphore ambre. Mention « démo locale » : rien n'est connecté.
// Pendant la plongée, le même canevas affiche le vrai journal série du noyau qui démarre.
export function terminal(curseur = true) {
  const [c] = toile(512, 384);
  dessinerTerminal(c, { curseur });
  return texture(c, { aniso: 4 });
}
export function dessinerTerminal(c, { curseur = true, journal = null } = {}) {
  const g = c.getContext('2d');
  g.fillStyle = rgba('--mt-scene-ecran'); g.fillRect(0, 0, 512, 384);
  g.fillStyle = rgba('--mt-scene-ambre', 0.95); g.font = `600 30px ${MONO}`; g.fillText('ROUILLE 0.1', 30, 62);
  if (journal) {
    // Les dernières lignes reçues sur le port série, sans réécriture : la page ne raconte que ce qui arrive.
    g.font = `400 19px ${MONO}`; g.fillStyle = rgba('--mt-scene-ambre', 0.78);
    journal.slice(-9).forEach((l, i) => g.fillText(l.slice(0, 38), 30, 104 + i * 26));
    g.fillStyle = rgba('--mt-scene-ambre', 1); g.font = `600 22px ${MONO}`;
    g.fillText('démarrage' + (curseur ? ' █' : ''), 30, 352);
    return;
  }
  g.font = `400 22px ${MONO}`; g.fillStyle = rgba('--mt-scene-ambre', 0.7);
  ['noyau i686 · rust', 'bureau · notes · jeux', 'DOONT_Rouille', 'démo locale, hors ligne'].forEach((l, i) => g.fillText(l, 30, 110 + i * 34));
  g.fillStyle = rgba('--mt-scene-ambre', 1); g.font = `600 26px ${MONO}`; g.fillText('> démarrer' + (curseur ? ' █' : ''), 30, 330);
}


// Points lumineux doux (pluie éclairée, poussière, vapeur).
export function pointDoux() {
  const [c, g] = toile(64, 64);
  const d = g.createRadialGradient(32, 32, 0, 32, 32, 32); d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(0.35, 'rgba(255,255,255,0.35)'); d.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = d; g.fillRect(0, 0, 64, 64);
  return texture(c, { srgb: false });
}

