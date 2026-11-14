// Le ciel vivant derrière la vitre (lot portfolio-ciel-vivant, 28/10) : l'ambiance cuite du moment (nuit, jour,
// dorée, crépuscule) et, par-dessus, la météo et les dates, en temps réel, sans recuire.
// La ville est en trois dimensions (ville.js) : nuages et lune sont peints sur le ciel, derrière elle ; les feux
// d'artifice partent au loin, cachés par les toits comme le reste. Assis, l'œil ne voit presque que des façades : ce qui doit se voir d'emblée
// (brouillard, nuages bas, pluie, neige, guirlandes, éclairs) se joue sur la ville et la vitre ; le ciel se découvre
// en levant le regard.
// Garde-fous : en mouvement réduit, rien ne tombe ni ne clignote (ambiance fixe) ; un éclair est un voile doux, au
// plus un toutes les ECLAIR.ecart secondes (ciel.js) ; le téléphone n'a qu'un seul effet.
import * as THREE from 'three';
import { planEclairs, eclat, ECLAIR } from '../ciel.js';
import { azimutElevation } from './ville.js';

// Ce qui bouge (interdit en mouvement réduit) et ce qui reste fixe.
export const ANIMES = ['pluie', 'neige', 'feuilles', 'feux', 'eclairs', 'soleil'];
// Teintes par ambiance, en linéaire : brouillard, nuages, neige au rebord, pluie, voile de la pièce, halo des sources.
const TEINTES = {
  nuit: { brume: [0.06, 0.075, 0.11], nuage: [0.05, 0.06, 0.085], neige: 0.3, pluie: [0.09, 0.11, 0.16], voile: 0.13, bloom: 0.42 },
  crepuscule: { brume: [0.2, 0.17, 0.25], nuage: [0.3, 0.21, 0.27], neige: 0.45, pluie: [0.14, 0.13, 0.18], voile: 0.11, bloom: 0.4 },
  doree: { brume: [0.62, 0.45, 0.3], nuage: [0.86, 0.6, 0.4], neige: 0.85, pluie: [0.3, 0.26, 0.22], voile: 0.1, bloom: 0.34 },
  jour: { brume: [0.55, 0.58, 0.62], nuage: [0.78, 0.8, 0.83], neige: 1, pluie: [0.3, 0.32, 0.36], voile: 0.05, bloom: 0.26 },
};
// Une météo, en réglages : couvert du ciel, nuages bas, brouillard, pluie (densité, vitesse, gouttes sur la vitre).
const METEO = {
  degage: { nuages: 0.12, bas: 0, brouillard: 0, couvert: 0, ombres: 0.25, pluie: null, vitre: 0.08 },
  nuages: { nuages: 0.75, bas: 0.35, brouillard: 0.05, couvert: 0.35, ombres: 0.5, pluie: null, vitre: 0.18 },
  pluie: { nuages: 0.9, bas: 0.3, brouillard: 0.12, couvert: 0.55, ombres: 0, pluie: [0.55, 1], vitre: 1 },
  averse: { nuages: 1, bas: 0.55, brouillard: 0.22, couvert: 0.8, ombres: 0, pluie: [1, 1.35], vitre: 1.45 },
  orage: { nuages: 1, bas: 0.5, brouillard: 0.15, couvert: 0.9, ombres: 0, pluie: [0.9, 1.25], vitre: 1.25 },
  brouillard: { nuages: 0.5, bas: 0.6, brouillard: 0.72, couvert: 0.4, ombres: 0, pluie: null, vitre: 0.3 },
  neige: { nuages: 0.85, bas: 0.35, brouillard: 0.2, couvert: 0.45, ombres: 0, pluie: null, vitre: 0.2 },
};
// Le premier effet de la liste est le seul que garde le téléphone.
export function effetsDe(etat, { telephone = false, mouvementReduit = false } = {}) {
  const nuitee = etat.ambiance === 'nuit' || etat.ambiance === 'crepuscule';
  const l = [];
  if (etat.speciales.feux && nuitee) l.push('feux');
  l.push({ pluie: 'pluie', averse: 'pluie', orage: 'pluie', neige: 'neige', brouillard: 'brouillard', nuages: 'nuages' }[etat.meteo]
    || (etat.ambiance === 'jour' || etat.ambiance === 'doree' ? 'soleil' : 'nuages'));
  if (etat.meteo === 'orage') l.push('eclairs');
  if (etat.meteo === 'neige') l.push('rebord');
  if (etat.saison === 'automne' && etat.meteo !== 'neige') l.push('feuilles');
  if (etat.saison === 'hiver') l.push('buee');
  if (etat.speciales.decembre) l.push('guirlandes');
  if (etat.speciales.braderie) l.push('braderie');
  if (etat.lune.visible) l.push('lune');
  let r = [...new Set(l)];
  if (mouvementReduit) r = r.filter((e) => !ANIMES.includes(e));
  return telephone ? r.slice(0, 1) : r;
}

// Un point du plan du dehors (u, v ∈ [0, 1]) en coordonnées du monde, avancé de `avance` mètres vers la pièce.
function surPlan(plan, D) {
  const X = new THREE.Vector3().setFromMatrixColumn(plan.matrixWorld, 0).normalize();
  const Y = new THREE.Vector3().setFromMatrixColumn(plan.matrixWorld, 1).normalize();
  const N = new THREE.Vector3().fromArray(D.dehors.normale).normalize(), C = new THREE.Vector3().fromArray(D.dehors.centre);
  return (u, v, avance = 0.08) => C.clone().addScaledVector(X, (u - 0.5) * D.dehors.largeur).addScaledVector(Y, (v - 0.5) * D.dehors.hauteur).addScaledVector(N, avance);
}

function toile(l, h, dessin) { const c = document.createElement('canvas'); c.width = l; c.height = h; dessin(c.getContext('2d'), l, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// Des points lumineux sur une chaînette (guirlandes de décembre, ampoules de la Braderie).
function chapelet(pos, texDoux, fils, couleurs, taille) {
  const P = [], C = [], G = [];
  for (const [u0, u1, v, creux, n] of fils) for (let i = 0; i <= n; i++) {
    const k = i / n; P.push(...pos(u0 + (u1 - u0) * k, v - creux * 4 * k * (1 - k)).toArray());
    const c = couleurs[(i + Math.round(v * 100)) % couleurs.length]; C.push(...c); G.push(Math.random());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('teinte', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('graine', new THREE.Float32BufferAttribute(G, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tPoint: { value: texDoux }, uTemps: { value: 0 }, uForce: { value: 1 }, uScintille: { value: 1 }, uTaille: { value: taille } },
    vertexShader: /* glsl */`attribute vec3 teinte; attribute float graine; uniform float uTemps, uScintille, uTaille; varying vec3 vC; varying float vA;
      void main() { vC = teinte; vA = 1.0 - uScintille * 0.45 * (0.5 + 0.5 * sin(uTemps * (1.2 + graine * 2.0) + graine * 40.0));
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uTaille * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform sampler2D tPoint; uniform float uForce; varying vec3 vC; varying float vA;
      void main() { gl_FragColor = vec4(vC * texture2D(tPoint, gl_PointCoord).r * vA * uForce, 1.0); }`,
  });
  return new THREE.Points(g, m);
}

export function creerCiel({ scene, D, atelier, ville, loin, telephone, texDoux, DEHORS }) {
  const pos = surPlan(loin, D);
  // Les réglages du dehors (fondu des atlas, ciel, brume, météo) sont ceux de la ville : un seul jeu d'uniformes.
  const dehors = { uniforms: ville.uniforms };
  ville.ambiance(atelier.jeu.nom);
  const oeil = new THREE.Vector3().fromArray(D.camera.position);
  // Un point (u, v) du plan de repère : sa direction depuis l'œil, et s'il est dans le ciel (au-dessus des toits).
  const direction = (u, v) => pos(u, v, 0).sub(oeil).normalize();
  const auCiel = (u, v, marge = 0.3) => { const { az, el } = azimutElevation(direction(u, v)); return el > ville.toits(az) + marge; };
  const ajouter = (o, couche = DEHORS) => { o.layers.set(couche); o.visible = false; scene.add(o); return o; };

  // --- Neige : flocons lents qui dérivent, derrière la vitre ---
  const nF = telephone ? 260 : 700, pf = new Float32Array(nF * 3), gf = new Float32Array(nF);
  for (let i = 0; i < nF; i++) { pf.set([(Math.random() - 0.5) * 6, Math.random() * 5 - 1, -1.6 - Math.random() * 5], i * 3); gf[i] = Math.random(); }
  const geoF = new THREE.BufferGeometry(); geoF.setAttribute('position', new THREE.BufferAttribute(pf, 3)); geoF.setAttribute('graine', new THREE.BufferAttribute(gf, 1));
  const flocons = ajouter(new THREE.Points(geoF, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tPoint: { value: texDoux }, uTemps: { value: 0 }, uLumiere: { value: 1 } },
    vertexShader: /* glsl */`attribute float graine; uniform float uTemps; varying float vA;
      void main() { vec3 p = position; float v = 0.35 + graine * 0.4;
        p.y = mod(p.y - uTemps * v + 1.0, 5.0) - 1.0; p.x += sin(uTemps * (0.5 + graine) + graine * 30.0) * 0.12;
        vA = 0.35 + graine * 0.5; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (1.4 + graine * 2.6) * 6.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform sampler2D tPoint; uniform float uLumiere; varying float vA;
      void main() { gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * texture2D(tPoint, gl_PointCoord).r * vA * uLumiere, 1.0); }`,
  })));

  // --- Feuilles d'automne : quelques-unes passent derrière la vitre, en tournoyant ---
  const feuille = toile(64, 64, (g) => {
    g.translate(32, 32); g.rotate(0.6); g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(18, -14, 16, 14, 0, 26); g.bezierCurveTo(-16, 14, -18, -14, 0, -26); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 30); g.stroke();
  });
  const nL = 16, pl = new Float32Array(nL * 3), gl = new Float32Array(nL), cl = new Float32Array(nL * 3);
  const teintesF = [[0.55, 0.22, 0.06], [0.62, 0.36, 0.08], [0.42, 0.16, 0.05], [0.5, 0.4, 0.12]];
  for (let i = 0; i < nL; i++) { pl.set([(Math.random() - 0.5) * 3, Math.random() * 3, -1.25 - Math.random() * 1.6], i * 3); gl[i] = Math.random(); cl.set(teintesF[i % 4], i * 3); }
  const geoL = new THREE.BufferGeometry(); geoL.setAttribute('position', new THREE.BufferAttribute(pl, 3)); geoL.setAttribute('graine', new THREE.BufferAttribute(gl, 1)); geoL.setAttribute('teinte', new THREE.BufferAttribute(cl, 3));
  const feuilles = ajouter(new THREE.Points(geoL, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tFeuille: { value: feuille }, uTemps: { value: 0 }, uLumiere: { value: 1 } },
    vertexShader: /* glsl */`attribute float graine; attribute vec3 teinte; uniform float uTemps; varying float vR; varying vec3 vC;
      void main() { vec3 p = position; float t = uTemps * (0.06 + graine * 0.05) + graine;
        p.y = 2.4 - mod(t * 3.0, 3.6); p.x += -mod(t * 1.6, 2.4) + 1.2 + sin(uTemps * (0.9 + graine) + graine * 9.0) * 0.18;
        vR = uTemps * (1.0 + graine * 2.0) + graine * 6.0; vC = teinte;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (0.045 + graine * 0.03) * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform sampler2D tFeuille; uniform float uLumiere; varying float vR; varying vec3 vC;
      void main() { vec2 q = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); q = mat2(c, -s, s, c) * q * vec2(1.0, 1.0 + 0.6 * sin(vR * 1.7));
        vec4 f = texture2D(tFeuille, q + 0.5); if (f.a < 0.4) discard; gl_FragColor = vec4(vC * f.r * uLumiere, 1.0);
        #include <colorspace_fragment>
      }`,
  })));

  // --- Guirlandes de décembre, en travers de la place ; ampoules de la Braderie et sa banderole ---
  const blanc = [1, 0.78, 0.45], ambre = [1, 0.55, 0.2];
  const guirlandes = ajouter(chapelet(pos, texDoux, [[0.27, 0.5, 0.47, 0.025, 22], [0.5, 0.73, 0.45, 0.022, 22], [0.33, 0.67, 0.5, 0.03, 30]], [blanc, ambre, blanc, [1, 0.35, 0.18]], 0.2));
  const braderie = ajouter(new THREE.Group());
  braderie.add(chapelet(pos, texDoux, [[0.3, 0.7, 0.47, 0.03, 34]], [[1, 0.2, 0.12], [1, 0.8, 0.15], [0.25, 0.55, 1], [0.3, 0.9, 0.35]], 0.24));
  const banderole = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ fog: false, transparent: true, map: toile(512, 128, (g, l, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 10, l, h - 20); g.fillStyle = '#c0392b'; g.fillRect(0, 10, l, 10); g.fillRect(0, h - 20, l, 10);
    g.fillStyle = '#2a1a12'; g.font = '700 58px Georgia, "DejaVu Serif", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BRADERIE', l / 2, h / 2 + 2);
  }) }));
  // Dans le carreau gauche, au-dessus de la plante : au milieu, le meneau la coupait.
  banderole.position.copy(pos(0.405, 0.56, 0.12)); banderole.lookAt(banderole.position.clone().add(new THREE.Vector3().fromArray(D.dehors.normale)));
  banderole.layers.set(DEHORS); braderie.add(banderole);
  braderie.traverse((o) => o.layers.set(DEHORS));

  // --- Feux d'artifice au loin (31 décembre et 1er janvier, le soir) : gerbes au-dessus des toits ---
  const GERBES = 3, ETINCELLES = 56, nE = GERBES * ETINCELLES;
  const pe = new Float32Array(nE * 3), de = new Float32Array(nE * 3);
  for (let g = 0; g < GERBES; g++) for (let i = 0; i < ETINCELLES; i++) {
    const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z), k = g * ETINCELLES + i;
    de.set([Math.cos(a) * r, Math.sin(a) * r, 0.7 + Math.random() * 0.3], k * 3); pe.set([g, 0, 0], k * 3);
  }
  const geoE = new THREE.BufferGeometry(); geoE.setAttribute('position', new THREE.BufferAttribute(pe, 3)); geoE.setAttribute('dir', new THREE.BufferAttribute(de, 3));
  const C0 = new THREE.Vector3().fromArray(D.dehors.centre), X0 = new THREE.Vector3().setFromMatrixColumn(loin.matrixWorld, 0).normalize(), Y0 = new THREE.Vector3().setFromMatrixColumn(loin.matrixWorld, 1).normalize();
  const N0 = new THREE.Vector3().fromArray(D.dehors.normale).normalize();
  const feux = ajouter(new THREE.Points(geoE, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tPoint: { value: texDoux }, uTemps: { value: 0 }, uOeil: { value: oeil },
      uGerbes: { value: Array.from({ length: GERBES }, () => new THREE.Vector4(0.5, 0.85, -99, 0)) }, uCouleurs: { value: Array.from({ length: GERBES }, () => new THREE.Color()) },
      uC: { value: C0 }, uX: { value: X0 }, uY: { value: Y0 }, uN: { value: N0 }, uDim: { value: new THREE.Vector2(D.dehors.largeur, D.dehors.hauteur) } },
    vertexShader: /* glsl */`attribute vec3 dir; uniform float uTemps; uniform vec4 uGerbes[${GERBES}]; uniform vec3 uCouleurs[${GERBES}];
      uniform vec3 uC, uX, uY, uN, uOeil; uniform vec2 uDim; varying vec3 vC; varying float vA;
      void main() { int g = int(position.x + 0.5); vec4 G = uGerbes[g]; float age = uTemps - G.z;
        vec2 uv = G.xy + dir.xy * dir.z * G.w * (1.0 - exp(-age * 2.2)) * vec2(1.0 / 1.6, 1.0) - vec2(0.0, 0.006 * age * age);
        vC = uCouleurs[g]; vA = (age < 0.0 || age > 2.6) ? 0.0 : (1.0 - age / 2.6) * (0.6 + 0.4 * sin(age * 30.0 + dir.x * 50.0));
        // La gerbe éclate à 70 fois la distance du plan de repère (≈ 840 m) : derrière les toits, qui la cachent.
        vec3 w = uOeil + (uC + uX * (uv.x - 0.5) * uDim.x + uY * (uv.y - 0.5) * uDim.y - uOeil) * 70.0;
        vec4 mv = modelViewMatrix * vec4(w, 1.0); gl_PointSize = 0.16 * 70.0 * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform sampler2D tPoint; varying vec3 vC; varying float vA;
      void main() { gl_FragColor = vec4(vC * texture2D(tPoint, gl_PointCoord).r * vA, 1.0); }`,
  })));
  // Le ciel qu'on voit vraiment par la fenêtre : assis, le haut des carreaux monte à 28° (v ≈ 0,88 sur le plan de
  // repère) et la fenêtre couvre u ∈ [0,32 ; 0,68]. Au-dessus des toits, il ne reste qu'une bande étroite : lune et
  // gerbes s'y placent, d'après la ligne des toits cuite avec la ville (ville.json), sinon on ne les verrait jamais.
  const FENETRE = { u0: 0.32, u1: 0.68, vMax: 0.88 };
  const { placesCiel, lune: placeLune } = (() => {
    const l = []; let lune = null;
    {
      const W = 128, H = 80;
      const v = (y) => 1 - (y + 0.5) / H, u = (x) => (x + 0.5) / W, ciel = (x, y) => auCiel(u(x), v(y));
      let meilleur = null;
      for (let x = Math.ceil(FENETRE.u0 * W) + 3; x < FENETRE.u1 * W - 3; x++) {
        // Toit le plus haut de la colonne (et de ses voisines, pour que le disque entier soit dans le ciel).
        // Balayage depuis le HAUT de l'image : le premier pixel qui n'est plus du ciel est le sommet des immeubles.
        let toit = 0; for (let dx = -3; dx <= 3; dx++) for (let y = 0; y < H; y++) if (!ciel(x + dx, y)) { toit = Math.max(toit, v(y)); break; }
        for (let y = 0; y < H; y++) if (ciel(x, y) && v(y) > toit + 0.015 && v(y) < FENETRE.vMax - 0.01) l.push([u(x), v(y)]);
        if (!meilleur || toit < meilleur.toit) meilleur = { toit, x };
      }
      // La lune : au-dessus du toit le plus bas, à mi-chemin du haut des carreaux.
      if (meilleur && meilleur.toit < FENETRE.vMax - 0.05) lune = [u(meilleur.x), Math.min(FENETRE.vMax - 0.03, meilleur.toit + 0.045)];
    }
    return { placesCiel: l.length ? l : [[0.45, 0.84], [0.55, 0.85]], lune: lune || [0.45, 0.84] };
  })();
  { const d = direction(...placeLune); dehors.uniforms.uLune.value.set(d.x, d.y, d.z, 0); }

  // --- Lames de soleil dans la poussière (ciel dégagé, jour ou heure dorée) : trois lames de lumière par la baie ---
  const soleil = ajouter(new THREE.Group(), 0);
  const matSoleil = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uForce: { value: 0 }, uCouleur: { value: new THREE.Color(1, 0.9, 0.75) }, uTemps: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform float uForce, uTemps; uniform vec3 uCouleur; varying vec2 vUv;
      void main() { float bord = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float long_ = smoothstep(1.0, 0.75, vUv.y) * smoothstep(0.0, 0.5, vUv.y);
        gl_FragColor = vec4(uCouleur * bord * long_ * uForce * (0.85 + 0.15 * sin(vUv.y * 9.0 + uTemps * 0.3)), 1.0); }`,
  });
  const lames = [[-0.42, 0.22], [0.05, 0.16], [0.38, 0.2]].map(([x, l]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(l, 2.2), matSoleil); m.userData.x = x; soleil.add(m); return m; });
  const nP = telephone ? 40 : 110, pp = new Float32Array(nP * 3);
  for (let i = 0; i < nP; i++) pp.set([(Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.12], i * 3);
  const geoP = new THREE.BufferGeometry(); geoP.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const poussiere = new THREE.Points(geoP, new THREE.PointsMaterial({ map: texDoux, size: 0.004, color: 0xffe2b0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  lames[1].add(poussiere);
  // Le soleil des cuissons (tools/blender/atelier.py, AMB) : azimut et hauteur, pour orienter les lames.
  const SOLEILS = { jour: [28, 40, [1, 0.93, 0.8]], doree: [38, 12, [1, 0.7, 0.42]] };
  function orienterSoleil(amb) {
    const [az, el, c] = SOLEILS[amb] || SOLEILS.jour; const a = az * Math.PI / 180, e = el * Math.PI / 180;
    // La lumière voyage du dehors vers la pièce : (x, y, z)_three = (x, z, −y)_blender, sens opposé au soleil.
    const dir = new THREE.Vector3(-Math.sin(a) * Math.cos(e), -Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
    const v = D.vitre.centre;
    for (const m of lames) {
      const depart = new THREE.Vector3(v[0] + m.userData.x * D.vitre.largeur, v[1] + 0.1, v[2]);
      m.position.copy(depart).addScaledVector(dir, 1.1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      // La lame tourne autour de son axe pour faire face au regard (un panneau, pas une lame de couteau).
      m.rotateY(0.6);
    }
    matSoleil.uniforms.uCouleur.value.setRGB(...c);
  }

  // --- État ---
  // Réglages approchés en douceur : la météo change seule toutes les 260 s (js/ciel.js), toujours en fondu.
  // pluie, vitre, buee, neigeVitre : densité de la pluie et état de la vitre, approchés comme le ciel.
  const cible = { nuages: 0, bas: 0, brouillard: 0, couvert: 0, ombres: 0, pluie: 0, vitre: 0, buee: 0, neigeVitre: 0 };
  const courant = { ...cible };
  let pluieVue = null, vitreVue = null;
  let etat = null, effets = [], reglages = { mouvementReduit: false, effets: true }, debutOrage = 0, graineOrage = 1, eclairs = [], tonnerre = null, dernierEclair = -1;
  const journal = [];
  const fondu = { de: 0, duree: 0, jeu: null, fin: null };

  function appliquer(e, r = reglages) {
    etat = e; reglages = r;
    effets = reglages.effets ? effetsDe(e, { telephone, mouvementReduit: r.mouvementReduit }) : [];
    const M = METEO[e.meteo], T = TEINTES[e.ambiance];
    const a = (nom) => effets.includes(nom);
    cible.nuages = a('nuages') || a('pluie') || a('neige') || a('brouillard') || a('soleil') ? M.nuages : 0;
    cible.bas = a('nuages') || a('pluie') || a('brouillard') || a('neige') ? M.bas : 0;
    cible.brouillard = a('brouillard') || a('pluie') || a('neige') ? M.brouillard : 0;
    cible.couvert = cible.nuages ? M.couvert : 0;
    cible.ombres = a('soleil') || a('nuages') ? M.ombres * (e.ambiance === 'jour' || e.ambiance === 'doree' ? 1 : 0) : 0;
    const u = dehors.uniforms; u.uBrume.value.setRGB(...T.brume); u.uNuage.value.setRGB(...T.nuage);
    u.uLune.value.w = a('lune') ? 1 : 0;
    u.uPhase.value.set(Math.cos(2 * Math.PI * e.lune.age / 29.530588853), e.lune.croissante ? 1 : -1);
    flocons.visible = a('neige'); flocons.material.uniforms.uLumiere.value = T.neige * 0.9;
    feuilles.visible = a('feuilles'); feuilles.material.uniforms.uLumiere.value = 0.25 + T.neige * 0.6;
    guirlandes.visible = a('guirlandes'); guirlandes.material.uniforms.uForce.value = e.ambiance === 'jour' ? 0.25 : e.ambiance === 'doree' ? 0.5 : 1;
    braderie.visible = a('braderie');
    feux.visible = a('feux');
    soleil.visible = a('soleil'); if (soleil.visible) orienterSoleil(e.ambiance);
    matSoleil.uniforms.uForce.value = e.ambiance === 'doree' ? 0.07 : 0.045;
    if (a('eclairs') && !eclairs.length) { debutOrage = performance.now() / 1000; graineOrage = e.local.jour * 31 + e.local.heure; eclairs = planEclairs(graineOrage, 3600); dernierEclair = -1; }
    if (!a('eclairs')) eclairs = [];
    return effets;
  }

  // Une image : approche douce des réglages, animation, éclairs. Renvoie l'éclair courant (0 à ECLAIR.max).
  function image(dt, temps, anime) {
    const k = anime ? Math.min(1, dt * 0.6) : 1;
    for (const c in cible) courant[c] += (cible[c] - courant[c]) * k;
    if (pluieVue) { pluieVue.material.uniforms.uDensite.value = courant.pluie; pluieVue.visible = courant.pluie > 0.002; }
    if (vitreVue) { const v = vitreVue.uniforms; v.uPluie.value = courant.vitre; v.uBuee.value = courant.buee; v.uNeige.value = courant.neigeVitre; }
    const u = dehors.uniforms;
    u.uTemps.value = temps; u.uNuages.value = courant.nuages; u.uBas.value = courant.bas; u.uBrouillard.value = courant.brouillard; u.uCouvert.value = courant.couvert; u.uOmbres.value = courant.ombres;
    flocons.material.uniforms.uTemps.value = temps; feuilles.material.uniforms.uTemps.value = temps; matSoleil.uniforms.uTemps.value = temps;
    for (const o of [guirlandes, ...braderie.children]) if (o.isPoints) { o.material.uniforms.uTemps.value = temps; o.material.uniforms.uScintille.value = anime ? 1 : 0; }
    if (soleil.visible) poussiere.position.y = anime ? ((temps * 0.02) % 0.4) - 0.2 : 0;
    // Feux d'artifice : une gerbe repart quand la précédente s'est éteinte, à une place du ciel au hasard.
    if (feux.visible && anime) {
      const F = feux.material.uniforms; F.uTemps.value = temps;
      F.uGerbes.value.forEach((g, i) => {
        if (temps - g.z > 2.6 + i * 0.7) {
          const [x, y] = placesCiel[Math.floor(Math.random() * placesCiel.length)];
          g.set(x, y, temps + Math.random() * 1.5, 0.035 + Math.random() * 0.03);
          F.uCouleurs.value[i].setHSL(Math.random(), 0.75, 0.6).multiplyScalar(2.2);
        }
      });
    }
    // Éclairs : planifiés à l'avance (écart minimum garanti), joués en voile doux, jamais en mouvement réduit.
    let e = 0;
    if (eclairs.length && anime && !reglages.mouvementReduit) {
      const t = performance.now() / 1000 - debutOrage;
      let i = 0; while (i + 1 < eclairs.length && eclairs[i + 1] <= t) i++;
      if (eclairs[i] <= t) {
        e = eclat(t, eclairs[i]);
        if (i !== dernierEclair) { dernierEclair = i; journal.push({ t: performance.now(), instant: eclairs[i] }); if (journal.length > 50) journal.shift(); tonnerre?.(); }
      }
    }
    e = Math.min(e, ECLAIR.max);
    u.uEclair.value = e;
    // Fondu entre deux jeux cuits (pièce et ville).
    if (fondu.jeu) {
      const f = fondu.duree > 0 ? Math.min(1, (performance.now() - fondu.de) / fondu.duree) : 1;
      const lisse = f * f * (3 - 2 * f);
      u.uFondu.value = lisse; for (const m of materiaux()) m.userData.fondu.uFondu.value = lisse;
      if (f >= 1) terminerFondu();
    }
    return e;
  }

  const materiaux = () => { const l = []; scene.traverse((o) => { if (o.isMesh && o.material?.userData?.fondu) l.push(o.material); }); return l; };
  let jeuCourant = atelier.jeu;
  function fondreVers(jeu, duree) {
    if (fondu.jeu) terminerFondu();
    fondu.jeu = jeu; fondu.de = performance.now(); fondu.duree = duree;
    dehors.uniforms.tSuivante.value = jeu.dehors; ville.suivante(jeu.nom);
    scene.traverse((o) => { if (o.isMesh && o.material?.userData?.fondu) o.material.userData.fondu.tSuivante.value = jeu.atlas[o.userData.atlas] || o.material.map; });
    return new Promise((ok) => { fondu.fin = ok; });
  }
  function terminerFondu() {
    const jeu = fondu.jeu; if (!jeu) return;
    dehors.uniforms.tVille.value = jeu.dehors; dehors.uniforms.uFondu.value = 0; dehors.uniforms.tSuivante.value = null; ville.ambiance(jeu.nom);
    scene.traverse((o) => { if (o.isMesh && o.material?.userData?.fondu) { const f = o.material.userData.fondu; o.material.map = jeu.atlas[o.userData.atlas] || o.material.map; f.uFondu.value = 0; f.tSuivante.value = null; } });
    // L'ancien jeu quitte la mémoire graphique (il reste dans le cache HTTP si l'on y revient).
    if (jeuCourant && jeuCourant !== jeu) { for (const t of Object.values(jeuCourant.atlas)) t.dispose(); jeuCourant.dehors.dispose(); }
    jeuCourant = jeu; fondu.jeu = null; const fin = fondu.fin; fondu.fin = null; fin?.();
  }

  return {
    appliquer, image, fondreVers,
    get effets() { return effets; },
    get enFondu() { return !!fondu.jeu; },
    get jeu() { return jeuCourant?.nom; },
    teintes: (amb) => TEINTES[amb],
    reglerPluie(pluie, materiauVitre, ambiance) {
      const M = METEO[etat?.meteo || 'pluie'], actif = effets.includes('pluie');
      pluieVue = pluie; vitreVue = materiauVitre;
      cible.pluie = actif ? M.pluie[0] : 0; if (actif) pluie.material.uniforms.uVitesse.value = M.pluie?.[1] || 1;
      pluie.material.uniforms.uCouleur.value.setRGB(...TEINTES[ambiance].pluie);
      cible.vitre = reglages.effets ? M.vitre : 0;
      cible.buee = effets.includes('buee') ? 0.9 : 0;
      cible.neigeVitre = effets.includes('rebord') ? 1 : 0; materiauVitre.uniforms.uNeigeLumiere.value = TEINTES[ambiance].neige * 0.85 + 0.1;
      // Premier réglage (chargement) : la pièce s'affiche directement dans son temps, sans fondu depuis rien.
      if (!this.regle) { this.regle = true; for (const c of ['pluie', 'vitre', 'buee', 'neigeVitre']) courant[c] = cible[c]; }
    },
    surTonnerre(fn) { tonnerre = fn; },
    journalEclairs: () => [...journal],
    eclairsPrevus: () => [...eclairs],
    placeLune: () => [...placeLune], placesFeux: () => placesCiel.length,
    // Pour les essais : un point de l'image de la ville (u, v) en coordonnées du monde.
    surPlan: (u, v) => pos(u, v, 0.08),
    anime: () => effets.some((x) => ANIMES.includes(x)),
  };
}
