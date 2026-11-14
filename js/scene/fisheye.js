// L'objectif ultra grand angle du tiroir à clé (lot portfolio-bureau-2). Rien ici ne se charge avant le clic sur le tiroir : ce module, fisheye.glb.
// Un petit lecteur de glb suffit (positions, normales, indices) : le chargeur complet de three.js pèserait plus lourd que l'objet, et il lit les images par des
// adresses blob: que la CSP refuse. Le verre reflète la pièce comme les six objectifs du tiroir
// (idée de l'utilisateur, 1er novembre 2026) : le même cube, celui du café, et la même formule (objectifs.js). Pas de panorama plaqué sur le dôme : il en faisait une boule à neige.
// Pas de traitement magenta et vert non plus : sur ce grand verre, il se lisait comme une tache. Le vrai reflet, cuit à la position de la lentille, viendra après.
import * as THREE from 'three';
import { MIROIR_VERRE } from './objectifs.js';

// Parcourt un fichier glb : un maillage par nœud, positions et normales en flottants.
async function lireGlb(url) {
  const r = await fetch(url); if (!r.ok) throw Error('fisheye.glb : HTTP ' + r.status);
  const b = await r.arrayBuffer(), d = new DataView(b);
  if (d.getUint32(0, true) !== 0x46546c67) throw Error('fisheye.glb illisible');
  const lj = d.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 20, lj))), debut = 20 + lj + 8;
  const lire = (i) => {
    const a = j.accessors[i], v = j.bufferViews[a.bufferView], o = debut + (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * { SCALAR: 1, VEC3: 3 }[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    return new T(b.slice(o, o + n * T.BYTES_PER_ELEMENT));
  };
  return j.nodes.filter((n) => n.mesh !== undefined).map((n) => {
    const p = j.meshes[n.mesh].primitives[0], g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(lire(p.attributes.POSITION), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(lire(p.attributes.NORMAL), 3));
    g.setIndex(new THREE.BufferAttribute(lire(p.indices), 1));
    return { nom: n.name, geometrie: g };
  });
}

// Ce qu'on devine d'un vrai objectif sombre : des bagues et un diaphragme à différentes profondeurs, qui glissent les uns sur les autres quand le regard bouge.
// La lumière ne vient que de taches floues : une tache nette se lirait comme une fenêtre, donc comme une fausse pièce.
function materiauVerre(rayon, env) {
  return new THREE.ShaderMaterial({
    uniforms: { tEnv: { value: env }, uRayon: { value: rayon }, uSouris: { value: new THREE.Vector2() } },
    vertexShader: `
      varying vec3 vLocal; varying vec3 vN; varying vec3 vV; varying vec3 vVue;
      void main() {
        vLocal = position; vec4 p = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-p.xyz);
        vVue = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position; // le regard dans le repère de l'objet : le tiroir glisse et l'objet est posé de biais
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      uniform samplerCube tEnv; uniform float uRayon; uniform vec2 uSouris;
      varying vec3 vLocal; varying vec3 vN; varying vec3 vV; varying vec3 vVue;
      const float PI = 3.14159265; const float LAMES = 7.0;
      // Le verre est dix fois plus grand que ceux des six objectifs : à la même force, c'est une assiette grise. On doit deviner le reflet, pas le voir d'abord.
      const float ASSOMBRI = 0.9;
      const vec2 CAP = vec2(0.0, 0.6);
      ${MIROIR_VERRE}
      float bague(float r, float c, float e) { float d = (r - c) / e; return exp(-d * d); }
      float tache(vec2 p, vec2 c, vec2 e) { vec2 d = (p - c) / e; return exp(-dot(d, d)); }
      void main() {
        vec2 q = vLocal.xz / uRayon; float r = min(length(q), 1.0);
        vec3 w = normalize(vVue); vec2 fuite = w.xz / max(w.y, 0.25);
        // Trois profondeurs : un rayon qui descend sous le dôme ressort d'autant plus loin que l'élément est profond.
        float ra = length(q - fuite * 0.10), rb = length(q - fuite * 0.24);
        vec2 dia = q - fuite * 0.42; float rd = length(dia), ph = atan(dia.y, dia.x);
        vec3 col = vec3(0.004, 0.005, 0.008);
        col += vec3(0.030, 0.032, 0.036) * bague(ra, 0.80, 0.030) + vec3(0.018, 0.020, 0.024) * bague(rb, 0.56, 0.025);
        // Le diaphragme : un polygone à sept lames, sombre, à peine plus clair que le fond qui l'entoure.
        float pan = 2.0 * PI / LAMES, poly = rd * cos(mod(ph, pan) - pan * 0.5) / cos(pan * 0.5);
        col += vec3(0.012, 0.013, 0.016) * smoothstep(0.20, 0.24, poly) * (1.0 - smoothstep(0.44, 0.50, rd)) * (0.7 + 0.3 * sin(ph * LAMES + rd * 14.0));
        col *= 0.03 + 0.97 * smoothstep(0.20, 0.225, poly);
        // Le reflet : la formule des six objectifs, dans le repère de l'objet, où le verre regarde vers le haut. En vrai repère, ce verre couché verrait le dessous de la
        // pièce, que le cube ne montre pas ; et le bombement reste celui d'un ménisque, pas le dôme du maillage, qui serrerait toute la pièce dans une bille.
        // Vu de face, ce repère ne montrerait que le plafond, un gris plat : CAP tourne le verre vers le haut de la fenêtre, et le carré du miroir creuse le contraste, la lumière reste où elle est.
        vec2 s = uSouris * 0.12, t = q + s + CAP;
        float fm; vec3 miroir = miroirVerre(tEnv, normalize(vec3(t.x * 0.55, 1.0, -t.y * 0.55)), w, fm);
        col += miroir * miroir * mix(vec3(1.0), vec3(0.86, 0.88, 0.92), smoothstep(0.1, 0.95, r)) * (0.13 + fm * 0.7) * ASSOMBRI;
        float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.6);
        col += f * vec3(0.16, 0.18, 0.20) * 0.2;
        // Le seul reflet de surface : petit et blanc, comme une lampe lointaine.
        col += vec3(0.5, 0.5, 0.5) * tache(q, vec2(-0.34, 0.42) + s, vec2(0.06, 0.04)) * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Le métal sans environnement est noir. Un dégradé sans motif, clair en haut, sombre en bas, lui donne un volume sans lui prêter de reflet de la pièce.
function environnementNeutre(renderer) {
  const L = 32, H = 16, d = new Uint8Array(L * H * 4), pmrem = new THREE.PMREMGenerator(renderer);
  for (let y = 0; y < H; y++) {
    const v = Math.round(36 + 219 * THREE.MathUtils.smoothstep(y / (H - 1), 0.5, 1));
    for (let x = 0; x < L; x++) d.set([v, v, v, 255], (y * L + x) * 4);
  }
  const t = new THREE.DataTexture(d, L, H); t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  const env = pmrem.fromEquirectangular(t).texture;
  t.dispose(); pmrem.dispose();
  return env;
}

// Droit sur sa baïonnette, il se lisait à l'envers : un dôme sur un socle. Couché, le verre s'écrasait. Calé dans sa bague de cuir, il tourne son verre rond vers la caméra du tiroir,
// sa bague claire en haut, comme un objectif qu'on présente. DIRECTION : la caméra vue du dessus ; ELEVATION : sa hauteur au-dessus du feutre, un peu moins que les 59° de la caméra
// pour que le fût reste visible. Plus bas, la vue dans le verre tomberait dans la boîte de collision du tiroir (horsDecor) et se décentrerait.
const DIRECTION = [-0.81, 0.59];
const ELEVATION = 55 * Math.PI / 180;
// L'objet n'est pas cuit : sans ce contact sombre, il flotterait au-dessus du feutre.
function creerContact(parent, x, y, z, lacet) {
  const toile = document.createElement('canvas'); toile.width = toile.height = 96;
  const g = toile.getContext('2d'), d = g.createRadialGradient(48, 48, 12, 48, 48, 48);
  d.addColorStop(0, 'rgba(0,0,0,.85)'); d.addColorStop(.55, 'rgba(0,0,0,.6)'); d.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = d; g.fillRect(0, 0, 96, 96);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.13).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(toile), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(x, y, z); m.rotation.y = lacet; m.raycast = () => {}; parent.add(m);
}

// parent : le groupe du tiroir, l'objet glisse avec lui ; position : le dessus du feutre sous son centre, tiroir fermé.
export async function creerFisheye({ parent, position, url, renderer, env: cube }) {
  const morceaux = await lireGlb(url), groupe = new THREE.Group(); parent.add(groupe);
  const env = environnementNeutre(renderer), metal = { envMap: env, envMapIntensity: 2.2 };
  const corps = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.82, roughness: 0.42, ...metal });
  const cran = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.55, ...metal });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc4bdae, metalness: 1, roughness: 0.2, ...metal });
  const boite = new THREE.Box3(); let verre = null;
  for (const { nom, geometrie } of morceaux) {
    geometrie.computeBoundingBox(); boite.union(geometrie.boundingBox);
    if (nom !== 'verre') { const m = new THREE.Mesh(geometrie, { corps, chrome, cran }[nom] || corps); m.userData.objet = 'fisheye'; groupe.add(m); continue; }
    verre = new THREE.Mesh(geometrie, materiauVerre(Math.max(geometrie.boundingBox.max.x, geometrie.boundingBox.max.z), cube)); verre.userData.objet = 'fisheye'; groupe.add(verre);
  }
  const u = verre.material.uniforms, R = boite.max.x, H = boite.max.y, [dx, dz] = DIRECTION, c = Math.cos(ELEVATION), haut = new THREE.Vector3(0, 1, 0);
  const axe = new THREE.Vector3(dx * c, Math.sin(ELEVATION), dz * c).normalize(), sol = new THREE.Vector3().fromArray(position);
  groupe.quaternion.setFromUnitVectors(haut, axe);
  // Son arrière est au centre de la bague, le bas de son bord sur le feutre : vu de la caméra, il est assis dedans. Centré sur son milieu, il flottait à côté d'elle.
  groupe.position.set(sol.x, sol.y + R * Math.sqrt(1 - axe.y * axe.y), sol.z);
  creerContact(parent, sol.x, sol.y + 0.0058, sol.z, Math.atan2(dx, dz));
  return {
    groupe,
    rayon: u.uRayon.value, axe,
    // Dans le repère du tiroir : le sommet du verre, et le point à viser, sur le haut de la bague pour que son étiquette ne couvre pas le verre.
    avant: groupe.position.clone().addScaledVector(axe, H),
    ancre: groupe.position.clone().addScaledVector(axe, H * 0.8).addScaledVector(haut.clone().addScaledVector(axe, -axe.y).normalize(), R * 1.25),
    souris(x, y) { u.uSouris.value.set(x, y); },
    etat: () => ({ souris: u.uSouris.value.toArray(), triangles: morceaux.reduce((s, m) => s + m.geometrie.index.count / 3, 0) }),
  };
}
