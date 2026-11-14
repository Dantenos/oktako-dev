// La ville derrière la vitre, en trois dimensions (lot portfolio-ville-nuit, 29/10) : les maillages et l'atlas cuits
// par tools/blender/ville.py, vus avec LA caméra de la pièce. Plus d'image plate collée sur un plan à 12 m : chaque
// façade est à sa vraie distance (la place à 60 m, le quartier de 130 à 460 m, le beffroi à 900 m), si bien que la
// parallaxe, les verticales et la taille des fenêtres sont justes depuis n'importe quel cadrage.
// Par-dessus la lumière cuite, en temps réel : la brume de l'air (qui étage les plans et fond le lointain dans
// l'horizon), le ciel (dégradé de l'ambiance, nuages, lune), les halos des réverbères, et la météo (ciel.js / meteo.js).
import * as THREE from 'three';

const TYPES = { u16: Uint16Array, u32: Uint32Array };
const tableau = (bin, { decalage, type, nombre }) => new TYPES[type](bin, decalage, nombre);

// Réglages de chaque ambiance, appliqués en temps réel : densité de la brume (par mètre), force des halos des
// réverbères, des feux d'obstacle. Le jour, l'air est clair et les réverbères éteints. La nuit, une brume légère :
// plus épaisse, elle tirait les tours (700 m) vers l'horizon éclairé, plus clair que le ciel derrière elles, et leurs
// silhouettes s'y fondaient (écart de luminance mesuré : 3 sur 255, tests/ville.mjs).
export const AIR = {
  nuit: { brume: 0.00022, halos: 1, balises: 1 },
  crepuscule: { brume: 0.0003, halos: 0.85, balises: 1 },
  doree: { brume: 0.00062, halos: 0, balises: 0.6 },
  jour: { brume: 0.00034, halos: 0, balises: 0.5 },
};
const vecteurAir = (amb) => { const a = AIR[amb] || AIR.nuit; return new THREE.Vector4(a.brume, a.halos, a.balises, 0); };

export async function chargerVille(base) {
  const desc = await (await fetch(base + 'ville.json')).json();
  const [bin, ciel] = await Promise.all([
    fetch(base + 'ville.bin').then((r) => { if (!r.ok) throw Error('ville.bin : ' + r.status); return r.arrayBuffer(); }),
    new THREE.TextureLoader().loadAsync(base + desc.ciel.image),
  ]);
  // La rampe du ciel (une ligne par ambiance) : lue telle quelle, sans mipmaps ni répétition.
  ciel.colorSpace = THREE.SRGBColorSpace; ciel.generateMipmaps = false; ciel.minFilter = ciel.magFilter = THREE.LinearFilter;
  ciel.wrapS = ciel.wrapT = THREE.ClampToEdgeWrapping;
  return { desc, bin, ciel };
}

const BRUIT = /* glsl */`
  float h1(vec2 p) { p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
  float bruit(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * bruit(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;

// Le ciel de l'ambiance (et de la suivante pendant un fondu) à une élévation donnée, en degrés : la rampe va de −10° à
// +90°, une ligne par ambiance.
const CIEL = /* glsl */`
  uniform sampler2D tCiel; uniform float uRang, uRangSuivant, uFondu, uLignes;
  vec3 cielA(float el) {
    float p = clamp((el + 10.0) / 100.0, 0.0, 1.0);
    vec3 a = texture2D(tCiel, vec2(p, 1.0 - (uRang + 0.5) / uLignes)).rgb;
    if (uFondu > 0.0) a = mix(a, texture2D(tCiel, vec2(p, 1.0 - (uRangSuivant + 0.5) / uLignes)).rgb, uFondu);
    return a;
  }`;

// La météo par-dessus : brouillard, nuages bas qui mangent le haut des immeubles, ombres des nuages au sol (jour),
// ciel couvert, éclair. Mêmes réglages qu'avant (meteo.js), désormais posés sur des distances et des hauteurs vraies.
const METEO = /* glsl */`
  uniform float uTemps, uNuages, uBas, uBrouillard, uCouvert, uOmbres, uEclair; uniform vec3 uBrume, uNuage;
  uniform vec4 uAir, uAirSuivant;
  vec4 air() { return uFondu > 0.0 ? mix(uAir, uAirSuivant, uFondu) : uAir; }`;

function uniformesCommuns(ville, atlas) {
  return {
    tVille: { value: atlas }, tSuivante: { value: null }, uFondu: { value: 0 },
    tCiel: { value: ville.ciel }, uRang: { value: 0 }, uRangSuivant: { value: 0 }, uLignes: { value: ville.desc.ciel.ordre.length },
    uAir: { value: vecteurAir('nuit') }, uAirSuivant: { value: vecteurAir('nuit') },
    uTemps: { value: 0 }, uNuages: { value: 0 }, uBas: { value: 0 }, uBrouillard: { value: 0 }, uCouvert: { value: 0 }, uOmbres: { value: 0 }, uEclair: { value: 0 },
    uBrume: { value: new THREE.Color() }, uNuage: { value: new THREE.Color() },
    // La lune : direction (monde), puis visible (w) ; phase (éclairée, sens).
    uLune: { value: new THREE.Vector4(0, 0.3, -1, 0) }, uPhase: { value: new THREE.Vector2(1, 1) },
    uRue: { value: ville.desc.rue },
  };
}

// Les façades cuites, sous la brume et la météo. Le brouillard garde un halo aux lumières (fenêtres, réverbères).
function materiauFacades(u, side = THREE.FrontSide) {
  return new THREE.ShaderMaterial({
    uniforms: u, fog: false, side,
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vMonde;
      void main() { vUv = uv; vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tVille, tSuivante; uniform float uRue; varying vec2 vUv; varying vec3 vMonde;
      ${CIEL} ${METEO} ${BRUIT}
      void main() {
        vec3 c = texture2D(tVille, vUv).rgb;
        if (uFondu > 0.0) c = mix(c, texture2D(tSuivante, vUv).rgb, uFondu);
        float d = distance(cameraPosition, vMonde), h = vMonde.y - uRue;
        vec4 a = air();
        // Ombres des nuages qui passent sur la ville (jour clair).
        c *= 1.0 - uOmbres * smoothstep(0.45, 0.8, fbm(vMonde.xz * 0.004 + vec2(uTemps * 0.012, 0.0))) * 0.3;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, vec3(l), uCouvert * 0.3) * (1.0 - uCouvert * 0.22);
        // Brume : le lointain se fond dans l'horizon de l'ambiance (perspective aérienne) ; le brouillard la renforce.
        vec3 horizon = cielA(1.5);
        float f = 1.0 - exp(-d * (a.x + uBrouillard * 0.009));
        vec3 voile = mix(horizon, uBrume, clamp(uBrouillard * 1.6, 0.0, 1.0));
        c = mix(c, voile, f) + max(c - 0.55, 0.0) * f * 0.55;
        // Nuages bas : une nappe qui mange le haut des tours, du clocher et du beffroi (au-dessus de ~30 m).
        float nappe = uBas * smoothstep(28.0, 62.0, h + (fbm(vMonde.xz * 0.01 + uTemps * 0.01) - 0.5) * 24.0);
        c = mix(c, uNuage * 0.85, nappe);
        c += uEclair * vec3(0.75, 0.8, 1.0) * 0.22;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Le ciel : une sphère autour de la caméra, peinte par direction (dégradé de l'ambiance, nuages en perspective, lune).
function materiauCiel(u) {
  return new THREE.ShaderMaterial({
    uniforms: u, fog: false, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`varying vec3 vMonde;
      void main() { vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: /* glsl */`
      uniform vec4 uLune; uniform vec2 uPhase; varying vec3 vMonde;
      ${CIEL} ${METEO} ${BRUIT}
      void main() {
        vec3 dir = normalize(vMonde - cameraPosition);
        float el = degrees(asin(clamp(dir.y, -1.0, 1.0)));
        vec3 c = cielA(el);
        // Nuages : une couche plane au-dessus de la ville, vue en perspective ; ils s'effacent vers l'horizon.
        vec2 q = dir.xz / max(dir.y, 0.03) * 0.9;
        float n = fbm(q + vec2(uTemps * 0.006, 0.0));
        float nuage = smoothstep(0.62 - uNuages * 0.32, 0.8, n) * min(1.0, uNuages * 1.3) * smoothstep(0.0, 0.08, dir.y);
        if (uLune.w > 0.0) {
          vec3 L = normalize(uLune.xyz), droite = normalize(cross(L, vec3(0.0, 1.0, 0.0))), haut = cross(droite, L);
          vec2 d = vec2(dot(dir, droite), dot(dir, haut)) / 0.0085;
          float r = length(d) * step(0.0, dot(dir, L));
          float term = uPhase.x * sqrt(max(0.0, 1.0 - d.y * d.y));
          float allume = smoothstep(-0.05, 0.05, (uPhase.y > 0.0 ? d.x : -d.x) - term);
          float mers = 0.82 + 0.18 * fbm(d * 2.2 + 4.0);
          float disque = smoothstep(1.0, 0.9, r) * (1.0 - nuage * 0.85) * uLune.w;
          c = mix(c, vec3(0.86, 0.88, 0.92) * (allume * mers * 0.9 + 0.03), disque);
          c += vec3(0.35, 0.42, 0.6) * 0.03 * exp(-r * r * 0.02) * (1.0 - nuage) * uLune.w;
        }
        c = mix(c, uNuage * (0.75 + 0.35 * n), nuage);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, vec3(l), uCouvert * 0.3) * (1.0 - uCouvert * 0.22);
        c = mix(c, uBrume, uBrouillard * 0.85);
        c += uEclair * vec3(0.75, 0.8, 1.0) * 0.6;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Le sol, au-delà de ce qui est cuit : sombre, il disparaît dans la brume à l'horizon.
function materiauSol(u) {
  return new THREE.ShaderMaterial({
    uniforms: u, fog: false,
    vertexShader: /* glsl */`varying vec3 vMonde;
      void main() { vec4 m = modelMatrix * vec4(position, 1.0); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: /* glsl */`varying vec3 vMonde;
      ${CIEL} ${METEO}
      void main() {
        vec4 a = air(); float d = distance(cameraPosition, vMonde);
        vec3 horizon = cielA(1.5), c = horizon * 0.18;
        float f = 1.0 - exp(-d * (a.x + uBrouillard * 0.009));
        c = mix(c, mix(horizon, uBrume, clamp(uBrouillard * 1.6, 0.0, 1.0)), f);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Halos des réverbères et feux d'obstacle des tours : des points doux, à leur place, à la taille d'un globe de verre
// vu à cette distance (jamais moins de quelques pixels, pour qu'un feu rouge à 900 m reste un point).
function points(liste, u, texDoux, { taille, minPx, canal, teinte }) {
  const P = new Float32Array(liste.length * 3), C = new Float32Array(liste.length * 3);
  liste.forEach((l, i) => { P.set(l.p, i * 3); C.set(teinte(l), i * 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('teinte', new THREE.BufferAttribute(C, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...u, tPoint: { value: texDoux }, uEchelle: { value: 1 } },
    vertexShader: /* glsl */`attribute vec3 teinte; uniform float uEchelle, uFondu, uBrouillard; uniform vec4 uAir, uAirSuivant; varying vec3 vC; varying float vA;
      void main() {
        vec4 a = uFondu > 0.0 ? mix(uAir, uAirSuivant, uFondu) : uAir;
        vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vC = teinte * a.${canal} * exp(-d * (a.x + uBrouillard * 0.009) * 0.6);
        float px = ${taille.toFixed(2)} * uEchelle / d;
        vA = min(1.0, px / ${minPx.toFixed(1)});
        gl_PointSize = max(px, ${minPx.toFixed(1)}); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform sampler2D tPoint; varying vec3 vC; varying float vA;
      void main() { gl_FragColor = vec4(vC * texture2D(tPoint, gl_PointCoord).r * vA, 1.0); }`,
  });
  const o = new THREE.Points(g, m); o.frustumCulled = false; return o;
}

export function creerVille({ ville, atlas, texDoux, couche }) {
  const { desc, bin } = ville;
  const u = uniformesCommuns(ville, atlas);
  const groupe = new THREE.Group(); groupe.name = 'ville';
  const facades = materiauFacades(u);
  const maillages = desc.maillages.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(tableau(bin, m.positions), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(tableau(bin, m.uv), 2, true));
    g.setIndex(new THREE.BufferAttribute(tableau(bin, m.indices), 1));
    g.computeBoundingSphere();
    const o = new THREE.Mesh(g, facades); o.name = 'ville-' + m.nom;
    o.position.fromArray(m.min); o.scale.fromArray(m.echelle); o.matrixAutoUpdate = false; o.updateMatrix();
    groupe.add(o); return o;
  });
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), materiauCiel(u)); ciel.renderOrder = -1; ciel.frustumCulled = false; ciel.name = 'ville-ciel';
  // Le ciel suit la caméra : il est toujours « à l'infini ».
  ciel.onBeforeRender = (r, s, cam) => { ciel.position.copy(cam.position); ciel.updateMatrixWorld(); };
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), materiauSol(u)); sol.rotation.x = -Math.PI / 2; sol.position.y = desc.rue - 0.15; sol.name = 'ville-sol';
  // Le halo d'une lanterne dans l'air humide : ~1,4 m à sa distance, doux, sans couvrir la façade derrière.
  const halos = points(desc.lampes, u, texDoux, { taille: 1400, minPx: 2.5, canal: 'y', teinte: (l) => (l.froid ? [0.22, 0.26, 0.32] : [0.4, 0.25, 0.12]) });
  const balises = points(desc.balises, u, texDoux, { taille: 1500, minPx: 3.0, canal: 'z', teinte: () => [1.0, 0.12, 0.06] });
  groupe.add(ciel, sol, ...[halos, balises]);
  groupe.traverse((o) => o.layers.set(couche));
  const ordre = desc.ciel.ordre;
  const rang = (amb) => Math.max(0, ordre.indexOf(amb));
  // Pour les essais (tests/ville.mjs) : une mire à vraie distance, rendue par LE MÊME programme que les façades (une
  // ville aplatie sur un plan ou une sphère l'aplatirait aussi), blanche, sans brume ni météo. Des poteaux verticaux à
  // 60, 250 et 900 m de l'œil (arêtes et parallaxe), et au-dessus, des fenêtres identiques de 4 × 6 m sur un plan à 60 m,
  // de part et d'autre du meneau (taille d'un carreau à l'autre).
  let mireGroupe = null, mireItems = null;
  function construireMire() {
    const E = new THREE.Vector3().fromArray(desc.oeil), blanc = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blanc.needsUpdate = true;
    const um = { ...u, tVille: { value: blanc }, uFondu: { value: 0 }, uAir: { value: new THREE.Vector4() }, uAirSuivant: { value: new THREE.Vector4() },
      uBrouillard: { value: 0 }, uBas: { value: 0 }, uOmbres: { value: 0 }, uCouvert: { value: 0 }, uEclair: { value: 0 } };
    const mat = materiauFacades(um, THREE.DoubleSide), P = [], I = [], items = { poteaux: [], fenetres: [], oeil: desc.oeil };
    const quad = (a, b, c, d) => { const n = P.length / 3; P.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()); I.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    const rad = THREE.MathUtils.degToRad;
        // Les poteaux montent de la rue à +4° ; les fenêtres sont au-dessus (de +6° à +18°) : rien ne se recouvre, quelle
    // que soit la pose.
    for (const [d, azs] of [[60, [-15, -3, 9]], [250, [-11, 1, 13]], [900, [-7, 5, 17]]]) for (const az of azs) {
      const pied = new THREE.Vector3(E.x + d * Math.sin(rad(az)), desc.rue, E.z - d * Math.cos(rad(az)));
      const vers = E.clone().sub(pied).setY(0).normalize(), cote = new THREE.Vector3(vers.z, 0, -vers.x), w = d * Math.tan(rad(0.15)) / 2;
      const haut = pied.clone().setY(E.y + d * Math.tan(rad(4)));
      quad(pied.clone().addScaledVector(cote, -w), pied.clone().addScaledVector(cote, w), haut.clone().addScaledVector(cote, w), haut.clone().addScaledVector(cote, -w));
      items.poteaux.push({ d, az, bas: pied.toArray(), haut: haut.toArray() });
    }
    for (const az of [-16, -8, 8, 16]) for (const el of [9, 15]) {
      const c = new THREE.Vector3(E.x + 60 * Math.tan(rad(az)), E.y + 60 * Math.tan(rad(el)), E.z - 60), dx = 2, dy = 3;
      quad(new THREE.Vector3(c.x - dx, c.y - dy, c.z), new THREE.Vector3(c.x + dx, c.y - dy, c.z), new THREE.Vector3(c.x + dx, c.y + dy, c.z), new THREE.Vector3(c.x - dx, c.y + dy, c.z));
      items.fenetres.push({ az, el, centre: c.toArray(), largeur: 4, hauteur: 6 });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(P.length / 3 * 2).fill(0.5), 2)); g.setIndex(I);
    mireGroupe = new THREE.Mesh(g, mat); mireGroupe.frustumCulled = false; mireGroupe.layers.set(couche); mireGroupe.visible = false; groupe.add(mireGroupe);
    mireItems = items;
  }
  return {
    groupe, uniforms: u, maillages, desc,
    // Taille des halos en pixels : elle suit la hauteur de l'image (une même lanterne paraît plus grosse en plein écran).
    regler({ hauteurPx, fov }) { const k = hauteurPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / 1000; for (const p of [halos, balises]) p.material.uniforms.uEchelle.value = k; },
    ambiance(amb) { u.uRang.value = rang(amb); u.uAir.value.copy(vecteurAir(amb)); },
    suivante(amb) { u.uRangSuivant.value = rang(amb); u.uAirSuivant.value.copy(vecteurAir(amb)); },
    // Direction de l'œil vers un point du monde : azimut (degrés, à droite positif) et élévation, et la ligne des toits.
    toits(az) {
      const p = desc.profil, i = (az - p.az0) / p.pas, i0 = Math.floor(i), k = i - i0;
      const v = (j) => p.elevation[Math.max(0, Math.min(p.elevation.length - 1, j))] ?? -6;
      return v(i0) * (1 - k) + v(i0 + 1) * k;
    },
    mire(actif) {
      if (!mireGroupe) construireMire();
      mireGroupe.visible = actif; for (const o of [...maillages, ciel, sol, halos, balises]) o.visible = !actif;
      return actif ? mireItems : null;
    },
    halos, balises, ciel, sol,
  };
}

// Azimut (degrés, vers la droite) et élévation d'une direction du monde three.js : la fenêtre regarde vers −Z.
export function azimutElevation(dir) {
  const n = dir.clone().normalize();
  return { az: THREE.MathUtils.radToDeg(Math.atan2(n.x, -n.z)), el: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(n.y, -1, 1))) };
}
