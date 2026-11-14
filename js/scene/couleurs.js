// Lecture des teintes de la scène depuis les jetons CSS (theme.css → charte.css).
// Pourquoi : une seule source de couleurs ; le moteur 3D n'écrit aucun hexadécimal.
import * as THREE from 'three';

const sonde = document.createElement('span');
let pret = false;
function prepare() {
  if (pret) return;
  sonde.style.display = 'none';
  document.body.appendChild(sonde);
  pret = true;
}
const cache = new Map();
// Renvoie la valeur CSS résolue (var() en cascade comprise) sous forme rgb() normalisée par le navigateur.
export function css(nom) {
  if (cache.has(nom)) return cache.get(nom);
  prepare();
  sonde.style.color = `var(${nom})`;
  const v = getComputedStyle(sonde).color;
  if (!v || v === 'rgba(0, 0, 0, 0)') throw new Error(`jeton absent : ${nom}`);
  cache.set(nom, v);
  return v;
}
export function couleur(nom) {
  const m = css(nom).match(/[\d.]+/g).map(Number);
  return new THREE.Color().setRGB(m[0] / 255, m[1] / 255, m[2] / 255, THREE.SRGBColorSpace);
}
// Variante pour le canvas 2D : chaîne rgba() avec opacité.
export function rgba(nom, a = 1) {
  const m = css(nom).match(/[\d.]+/g).map(Number);
  return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
}
// Mélange de deux jetons, pour les dégradés du décor.
export function melange(a, b, t, alpha = 1) {
  const x = css(a).match(/[\d.]+/g).map(Number), y = css(b).match(/[\d.]+/g).map(Number);
  const c = x.slice(0, 3).map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
