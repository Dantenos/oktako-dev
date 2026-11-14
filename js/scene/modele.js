// Lecture de l'atelier cuit dans Blender (tools/blender/atelier.py) : un JSON qui décrit, un binaire qui porte
// les sommets, et des textures où la lumière est déjà calculée. Format maison, sans chargeur ajouté :
// positions et UV sur 16 bits normalisés, indices sur 16 ou 32 bits, lus directement en BufferGeometry.
// Plusieurs ambiances (nuit, jour, doree, crepuscule) partagent la même géométrie et les mêmes UV : seul un jeu de
// textures change. Un SEUL jeu se télécharge au premier affichage ; les autres, quand on y passe (chargerJeu).
import * as THREE from 'three';
import { chargerVille } from './ville.js';

const TYPES = { u16: Uint16Array, u32: Uint32Array };

function tableau(bin, { decalage, type, nombre }) {
  return new TYPES[type](bin, decalage, nombre);
}

// Les textures cuites sont déjà passées par la courbe filmique de Blender : elles s'affichent telles quelles,
// sans éclairage ni tone mapping. Le téléphone reçoit la variante à demi-résolution.
async function texture(url) {
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Le jeu de textures d'une ambiance : « nuit » est la cuisson de référence (racine de modele/), les autres sont
// décrites par ambiances.json. Chaque appel ne demande QUE les fichiers de cette ambiance. Son « dehors » est l'atlas
// cuit de la ville de cette ambiance (tools/blender/ville.py), posé sur la géométrie commune de ville.bin.
export function fichiersDuJeu(desc, nom, leger) {
  const cle = leger ? 'telephone' : 'ordinateur';
  const jeu = nom === 'nuit' || !desc.ambiances?.[nom] ? { atlas: desc.atlas, dehors: desc.dehors } : desc.ambiances[nom];
  return { atlas: Object.fromEntries(Object.entries(jeu.atlas).map(([k, a]) => [k, a[cle]])), dehors: jeu.dehors[cle] };
}
export async function chargerJeu(base, desc, nom, { leger = false } = {}) {
  const f = fichiersDuJeu(desc, nom, leger);
  const noms = Object.keys(f.atlas);
  const textures = await Promise.all([...noms.map((k) => texture(base + f.atlas[k])), texture(base + f.dehors)]);
  return { nom, atlas: Object.fromEntries(noms.map((k, i) => [k, textures[i]])), dehors: textures[noms.length] };
}

// Fondu d'une ambiance à l'autre : la matière cuite mélange deux textures, la courante et la suivante.
// Un seul programme pour toutes les matières de la pièce (même clé de cache).
export function fondre(materiau) {
  const u = { tSuivante: { value: null }, uFondu: { value: 0 } };
  materiau.userData.fondu = u;
  materiau.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = 'uniform sampler2D tSuivante; uniform float uFondu;\n' + s.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        if ( uFondu > 0.0 ) sampledDiffuseColor = mix( sampledDiffuseColor, texture2D( tSuivante, vMapUv ), uFondu );
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  materiau.customProgramCacheKey = () => 'atelier-fondu';
  return materiau;
}

export async function chargerAtelier(base, { leger = false, ambiance = 'nuit' } = {}) {
  const desc = await (await fetch(base + 'atelier.json')).json();
  // Description des ambiances (quelques centaines d'octets) : absente, seule la nuit existe.
  const amb = await fetch(base + 'ambiances.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (amb) desc.ambiances = amb.ambiances;
  const nom = ambiance === 'nuit' || desc.ambiances?.[ambiance] ? ambiance : 'nuit';
  // La ville (géométrie commune et rampe du ciel) se charge avec la pièce ; son atlas vient avec le jeu d'ambiance.
  const [bin, jeu, ville] = await Promise.all([
    fetch(base + 'atelier.bin').then((r) => { if (!r.ok) throw Error('atelier.bin : ' + r.status); return r.arrayBuffer(); }),
    chargerJeu(base, desc, nom, { leger }),
    chargerVille(base),
  ]);
  const maillages = desc.maillages.map((m) => {
    const g = new THREE.BufferGeometry();
    // Positions quantifiées dans la boîte du maillage : le maillage porte la boîte (position + échelle).
    g.setAttribute('position', new THREE.BufferAttribute(tableau(bin, m.positions), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(tableau(bin, m.uv), 2, true));
    g.setIndex(new THREE.BufferAttribute(tableau(bin, m.indices), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, fondre(new THREE.MeshBasicMaterial({ map: jeu.atlas[m.atlas] })));
    mesh.position.fromArray(m.min); mesh.scale.fromArray(m.echelle);
    mesh.name = m.nom; mesh.userData.objet = m.objet; mesh.userData.atlas = m.atlas;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  });
  return { desc, maillages, jeu, atlas: jeu.atlas, dehors: jeu.dehors, ville };
}
