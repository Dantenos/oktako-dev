// Le café de la tasse, calculé en direct : rien n'est cuit pour lui. La surface est un miroir sombre qui reflète la
// pièce (cube capturé au-dessus de la tasse par le navigateur, la face de la fenêtre rafraîchie pour que la pluie et la
// ville vivent), des ondes concentriques analytiques (une goutte, puis le doigt ou la souris) et la mousse qui écrit
// les propositions (mousse.js). Le disque se pose 0,4 mm au-dessus du café cuit : jamais deux faces dans le même plan.
import * as THREE from 'three';
import { mettreEnPage, peindre } from './mousse.js';

// Garde-fous de photosensibilité, tenus par construction et relus par tests/tasse.mjs :
// - une crête d'onde passe sur un point moins de 3 fois par seconde (VITESSE × K / 2π ≈ 2,4 Hz) ;
// - les ondes sont faibles (pente ≤ ~11° au choc de la goutte, ~5° sous le pointeur) : un reflet glisse, il ne clignote pas ;
// - l'éclat du survol monte et descend en ~300 ms, jamais d'un coup ;
// - une nouvelle onde suit le pointeur au plus toutes les 220 ms.
export const GARDES = { vitesse: 0.5, k: 30, amortissement: 0.9, survolTau: 0.1, ondeMinMs: 220, eclatSurvol: 0.32 };
// Largeur du paquet d'ondes : trois ou quatre ronds visibles à la fois, comme après une vraie goutte.
const SIGMA = 0.32;

export function creerCafe({ renderer, scene, centre, rayon, posLampe, cafe, creme, telephone, masquer }) {
  const N_ONDES = telephone ? 4 : 8;
  // --- Le reflet : la pièce vue d'au-dessus de la tasse, capturée par le navigateur au chargement ---
  const cube = new THREE.WebGLCubeRenderTarget(telephone ? 64 : 160, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter });
  const camCube = new THREE.CubeCamera(0.02, 30, cube);
  // Le reflet est pris 25 cm au-dessus du café, au-dessus des écrans : depuis la tasse elle-même, l'écran posé
  // derrière cacherait la fenêtre. La lampe et la fenêtre y entrent, la ville bleue avec elles.
  camCube.position.copy(centre).add(new THREE.Vector3(0, 0.25, 0));
  // Le dehors (couche 1) est vu directement : la vitre lit un rendu à l'échelle de l'écran, faux dans un cube.
  for (const c of camCube.children) c.layers.enable(1);
  scene.add(camCube);

  // --- La mousse : un canevas peint une fois (masques + instant de versement), révélé par le shader ---
  // Deux toiles : celle qu'on lit, et l'ancienne mise en page qui fond quand le sucre fait réarranger la mousse.
  const toiles = [0, 1].map(() => {
    const toile = document.createElement('canvas'); toile.width = toile.height = telephone ? 512 : 1024;
    const tex = new THREE.CanvasTexture(toile);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    // Tant que rien n'est peint : un fond « jamais versé » (bleu plein) ; les propositions arrivent avec preparer().
    const c = toile.getContext('2d'); c.fillStyle = 'rgb(0,0,255)'; c.fillRect(0, 0, toile.width, toile.height);
    return { toile, tex };
  });
  let courante = 0;

  const u = {
    tEnv: { value: cube.texture }, tMousse: { value: toiles[0].tex }, tAncienne: { value: toiles[1].tex },
    // Le sucre : uFondu mène de l'ancienne mise en page (0) à la nouvelle (1) ; uVerseAncien fige ce que l'ancienne
    // avait déjà écrit ; uSucre = point de chute (disque), instant, force du nuage de sucre qui fond.
    uFondu: { value: 1 }, uVerseAncien: { value: 0 }, uSucre: { value: new THREE.Vector4(0, 0, -99, 0) },
    uOndes: { value: Array.from({ length: N_ONDES }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uTemps: { value: 0 }, uVerse: { value: 0 }, uMousse: { value: 1 }, uBombe: { value: 0 }, uSurvol: { value: new THREE.Vector2() },
    uTete: { value: new THREE.Vector3(0, 0, 0) }, uCafe: { value: cafe }, uCreme: { value: creme }, uPosLampe: { value: posLampe.clone() },
    uHoule: { value: 1 },
  };
  const materiau = new THREE.ShaderMaterial({
    uniforms: u, defines: { N_ONDES, VITESSE: GARDES.vitesse.toFixed(3), K: GARDES.k.toFixed(3), AMORTI: GARDES.amortissement.toFixed(3), SIGMA: SIGMA.toFixed(3) },
    vertexShader: `varying vec2 vUv; varying vec3 vMonde;
      void main(){ vUv = uv; vec4 m = modelMatrix * vec4(position, 1.); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: `uniform samplerCube tEnv; uniform sampler2D tMousse, tAncienne; uniform vec4 uOndes[N_ONDES], uSucre;
      uniform float uTemps, uVerse, uMousse, uBombe, uHoule, uFondu, uVerseAncien; uniform vec2 uSurvol; uniform vec3 uTete, uCafe, uCreme, uPosLampe;
      varying vec2 vUv; varying vec3 vMonde;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 p = vUv * 2. - 1.; float r = length(p);
        // Ondes : des paquets qui s'élargissent depuis leur point de chute et s'amortissent en s'étalant.
        vec2 g = vec2(0.);
        for (int i = 0; i < N_ONDES; i++) {
          vec4 o = uOndes[i]; float age = uTemps - o.z;
          if (age <= 0. || o.w <= 0.) continue;
          vec2 d = p - o.xy; float dist = length(d) + 1e-4, x = dist - age * VITESSE;
          float env = o.w * exp(-age * AMORTI) * exp(-x * x / (SIGMA * SIGMA)) / (1. + age * VITESSE * 3.);
          g += env * (-K * sin(K * x)) * d / dist;
        }
        // Une houle presque immobile : le reflet de la ville respire sans bouger vraiment.
        g += uHoule * .006 * vec2(sin(p.y * 5. + uTemps * .35), cos(p.x * 4.5 - uTemps * .3));
        // Normale : disque x → monde x, disque y → monde −z. uBombe courbe le miroir vers les bords pendant la plongée,
        // pour que la lampe et la fenêtre, basses sur l'horizon de la tasse, entrent dans le reflet vu du dessus ;
        // le ménisque relève le bord contre la paroi.
        vec2 pente = -g + p * uBombe - p * .35 * smoothstep(.9, 1., r);
        vec3 n = normalize(vec3(pente.x, 1., -pente.y));
        vec3 v = normalize(vMonde - cameraPosition), rf = reflect(v, n);
        float fresnel = .04 + .96 * pow(1. - max(dot(n, -v), 0.), 5.);
        vec3 env = textureCube(tEnv, rf).rgb;
        // Miroir SOMBRE : le café absorbe presque tout ; les murs éclairés s'y devinent à peine, les sources (lampe,
        // fenêtres de la ville, écrans) ressortent, davantage en lumière rasante.
        vec3 col = uCafe * (.55 + .45 * (1. - r * r)) + env * (.05 + .35 * fresnel) + max(env - .5, 0.) * .45;
        // Le modelé des ondes : leurs pentes tournées vers la lampe s'éclairent, les autres s'éteignent. Sans lui, un
        // rond ne se verrait que là où le reflet a du dessin. Borné : un liseré doux, jamais un éclair.
        col += vec3(.55, .42, .3) * clamp(dot(g, vec2(-.7, .7)) * .35, -.03, .05);
        // L'éclat de l'ampoule, net, qui glisse sur les ondes.
        vec3 l = normalize(uPosLampe - vMonde);
        col += vec3(1., .82, .6) * pow(max(dot(rf, l), 0.), 700.) * .8;
        // Le sucre fond : un nuage de crème pâle, très doux, qui s'élargit depuis le point de chute puis s'efface.
        if (uSucre.w > 0.) {
          float as = uTemps - uSucre.z, rs = length(p - uSucre.xy), R = .07 + .3 * (1. - exp(-as * .8));
          float nuage = uSucre.w * smoothstep(0., .35, as) * exp(-as * .42) * (1. - smoothstep(R * .35, R, rs));
          nuage *= .88 + .12 * sin(atan(p.y - uSucre.y, p.x - uSucre.x) * 3. + rs * 14. - as * .5);
          col = mix(col, uCreme * vec3(.7, .55, .4) * .42, clamp(nuage, 0., 1.) * .5);
        }
        // La mousse flotte : les ondes la déforment à peine.
        vec2 um = vUv + g * .0035;
        vec4 m = texture2D(tMousse, um);
        // B = 255 : déjà écrite (réarrangée après le sucre), elle se pose avec uFondu au lieu d'être versée.
        float instant = m.b * 255. / 254., age = uVerse - instant, deja = step(254.5 / 255., m.b) * step(.2, m.r + m.g);
        // Le fondu se fait en deux temps (l'ancienne s'efface, puis la nouvelle se pose) : jamais deux textes superposés.
        float pose = smoothstep(.45, 1., uFondu), efface = 1. - smoothstep(0., .55, uFondu);
        float masque = smoothstep(.2, .8, m.r + m.g) * mix(smoothstep(0., .006, age), pose, deja);
        // La crème s'étale : un halo doux, plus clair que le café, autour de chaque trait versé (le même canevas lu
        // flou, par ses mipmaps). C'est lui qui fait lire de la mousse et non des lettres peintes.
        vec4 mf = texture2D(tMousse, um, 2.6);
        float dejaF = step(254.5 / 255., mf.b);
        float halo = smoothstep(.04, .45, mf.r + mf.g) * mix(smoothstep(0., .02, uVerse - mf.b * 255. / 254.), pose, dejaF);
        // L'ancienne mise en page fond pendant que la nouvelle se pose : ses lettres s'élargissent et pâlissent.
        if (efface > 0.) {
          vec4 a = texture2D(tAncienne, um, 2.5 * (1. - efface)), af = texture2D(tAncienne, um, 2.6 + 1.5 * (1. - efface));
          masque = max(masque, smoothstep(.2, .8, a.r + a.g) * smoothstep(0., .006, uVerseAncien - a.b * 255. / 254.) * efface * efface);
          halo = max(halo, smoothstep(.04, .45, af.r + af.g) * smoothstep(0., .02, uVerseAncien - af.b * 255. / 254.) * efface);
        }
        col = mix(col, uCreme * vec3(.62, .44, .28) * .32, halo * .75 * uMousse);
        // La tache de crème qui suit le geste du versement.
        if (uTete.z > 0.) masque = max(masque, smoothstep(uTete.z, uTete.z * .35, length(p - uTete.xy)));
        float qui = (m.r * uSurvol.x + m.g * uSurvol.y) / max(m.r + m.g, .001);
        float grain = h(floor(vUv * 900.)) * .5 + h(floor(vUv * 300.) + 7.) * .5;
        vec3 mousse = uCreme * vec3(1., .93, .8) * (.66 + .08 * grain) * (1. + ${GARDES.eclatSurvol.toFixed(2)} * qui) * (1. + .12 * (1. - smoothstep(0., .03, age)));
        col = mix(col, mousse, masque * uMousse);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const geo = new THREE.CircleGeometry(rayon, telephone ? 48 : 96); geo.rotateX(-Math.PI / 2);
  const maillage = new THREE.Mesh(geo, materiau);
  maillage.position.copy(centre); maillage.name = 'cafe-vivant';
  scene.add(maillage);

  // --- La goutte : une perle du même miroir, qui tombe pendant la fin de l'approche ---
  const goutte = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: cafe.clone().multiplyScalar(2), envMap: cube.texture, combine: THREE.MixOperation, reflectivity: 0.75 }));
  goutte.scale.setScalar(1e-5); goutte.position.copy(centre); goutte.name = 'cafe-goutte';
  scene.add(goutte);

  // État de la séquence, sur sa propre horloge (figeable pour les essais).
  const etat = { t: 0, fige: null, actif: false, chute: null, verse: null, dureeVerse: 5.2, ondes: 0, dernierPointeur: 0, dernier: null, survolBut: [0, 0], page: null, versement: null, fondu: null, sucre: false };
  let prochaine = 0;
  function onde(x, y, amplitude) {
    const o = u.uOndes.value[prochaine]; prochaine = (prochaine + 1) % N_ONDES;
    o.set(x, y, etat.t, amplitude); etat.ondes++;
  }

  const masques = () => masquer().concat([maillage, goutte]);
  function rendreCube(faces) {
    const caches = masques().filter((o) => o.visible);
    for (const o of caches) o.visible = false;
    const avant = renderer.getRenderTarget(), auto = renderer.autoClear;
    renderer.autoClear = true;
    if (faces === 'tout') camCube.update(renderer, scene);
    else { camCube.updateMatrixWorld(); renderer.setRenderTarget(cube, 5); renderer.render(scene, camCube.children[5]); }
    renderer.setRenderTarget(avant); renderer.autoClear = auto;
    for (const o of caches) o.visible = true;
  }
  let imagesCafe = 0;

  return {
    maillage, goutte, env: cube.texture,
    // Mise en page et peinture de la mousse, une fois, hors du clic (au repos, dès que la scène est prête).
    preparer(phrases) {
      etat.page = phrases.length ? mettreEnPage(phrases) : null;
      const { toile, tex } = toiles[courante];
      const c = toile.getContext('2d'); c.fillStyle = 'rgb(0,0,255)'; c.fillRect(0, 0, toile.width, toile.height);
      etat.versement = etat.page ? peindre(toile, etat.page) : null;
      tex.needsUpdate = true; renderer.initTexture(tex);
      u.tMousse.value = tex; u.tAncienne.value = toiles[1 - courante].tex; u.uFondu.value = 1; etat.fondu = null; etat.dureeVerse = 5.2;
      // L'autre toile est envoyée au GPU dès maintenant : au sucre, rien ne se téléverse que la nouvelle page.
      renderer.initTexture(toiles[1 - courante].tex);
      return etat.page;
    },
    // Le sucre est tombé en (x, y) (unités du disque) : il fond en nuage, et la mousse se réarrange pour écrire en
    // plus la proposition suivante (la première reparaît à sa nouvelle place, la seconde est versée).
    // direct (mouvement réduit) : ni nuage, ni fondu, ni versement ; tout est posé d'un coup.
    sucre(phrases, { x = 0, y = 0, direct = false } = {}) {
      etat.sucre = true;
      const ancienne = toiles[courante]; courante = 1 - courante;
      const { toile, tex } = toiles[courante];
      u.uVerseAncien.value = u.uVerse.value; u.tAncienne.value = ancienne.tex;
      etat.page = mettreEnPage(phrases);
      const c = toile.getContext('2d'); c.fillStyle = 'rgb(0,0,255)'; c.fillRect(0, 0, toile.width, toile.height);
      etat.versement = peindre(toile, etat.page, { deja: [0] });
      tex.needsUpdate = true; u.tMousse.value = tex; u.uTete.value.z = 0;
      if (direct || !etat.actif) { u.uFondu.value = 1; u.uVerse.value = 1; etat.fondu = null; etat.verse = null; return etat.page; }
      u.uSucre.value.set(x, y, etat.t, 1);
      // L'ancienne mise en page fond (0,8 s), la première proposition se repose à sa nouvelle place (0,8 s), puis la
      // nouvelle est versée, plus vite (une phrase).
      u.uFondu.value = 0; etat.fondu = { debut: etat.t + 0.35, duree: 1.6 };
      u.uVerse.value = 0; etat.verse = etat.t + 1.85; etat.dureeVerse = 2.6;
      return etat.page;
    },
    capturer() { rendreCube('tout'); },
    // Une séquence : goutte (si le travelling la montre), ronds, puis versement des propositions.
    commencer({ direct, chuteA = 1.45 }) {
      etat.actif = true; etat.t = 0; u.uTemps.value = 0;
      for (const o of u.uOndes.value) o.set(0, 0, -99, 0);
      etat.chute = direct ? null : chuteA; etat.verse = direct ? 0 : chuteA + 1.05;
      u.uVerse.value = direct ? 1 : 0;
    },
    // Au repos, l'horloge du café s'arrête : des ondes restées en cours y seraient figées. La mousse, elle, reste.
    finir() {
      etat.actif = false; etat.chute = null; goutte.scale.setScalar(1e-5); u.uTete.value.z = 0; for (const o of u.uOndes.value) o.w = 0;
      // Une visite quittée pendant le fondu : la nouvelle mise en page est posée, le nuage effacé.
      u.uSucre.value.w = 0; u.uFondu.value = 1; etat.fondu = null;
    },
    // Le pointeur dessine des ronds là où il passe (au plus un toutes les 220 ms, jamais en mouvement réduit).
    pointeur(ndc, camera, maintenant) {
      if (!etat.actif || maintenant - etat.dernierPointeur < GARDES.ondeMinMs) return false;
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), -centre.y), q = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plan, q)) return false;
      const x = (q.x - centre.x) / rayon, y = -(q.z - centre.z) / rayon;
      if (x * x + y * y > 0.95) return false;
      if (etat.dernier && Math.hypot(x - etat.dernier[0], y - etat.dernier[1]) < 0.08) return false;
      etat.dernier = [x, y]; etat.dernierPointeur = maintenant;
      onde(x, y, 0.0028); return true;
    },
    survol(i) { etat.survolBut = [i === 0 ? 1 : 0, i === 1 ? 1 : 0]; },
    // Une image : horloge, chute, versement. anime = faux en mouvement réduit (tout est posé, rien ne bouge).
    mettreAJour(dt, { anime, bombe, mousse, enVue }) {
      // Horloge figée (essais) : l'éclat du survol suit le pas de l'horloge du café, pas celui du navigateur, pour
      // que la mesure de photosensibilité soit la même sur une carte graphique et sur un rendu logiciel lent.
      const avant = etat.t;
      if (etat.fige != null) etat.t = etat.fige; else if (etat.actif) etat.t += dt;
      const pas = etat.fige != null ? Math.max(0, etat.t - avant) : dt;
      u.uTemps.value = etat.t; u.uBombe.value = bombe; u.uMousse.value = mousse; u.uHoule.value = anime ? 1 : 0;
      const s = u.uSurvol.value, k = anime ? 1 - Math.exp(-pas / GARDES.survolTau) : 1;
      s.x += (etat.survolBut[0] - s.x) * k; s.y += (etat.survolBut[1] - s.y) * k;
      if (!etat.actif) return;
      if (etat.fondu) {
        const f = THREE.MathUtils.clamp((etat.t - etat.fondu.debut) / etat.fondu.duree, 0, 1);
        u.uFondu.value = anime ? Math.max(u.uFondu.value, f) : 1;
        if (u.uFondu.value >= 1) etat.fondu = null;
      }
      // Le départ reste à 10 cm du café : à 14 cm, la goutte passait très près de l'œil dans la vue d'arrivée.
      // Une horloge du café retardée par la faible cadence peut encore la montrer pendant la chute du sucre.
      if (etat.chute != null) {
        const c = (etat.t - etat.chute) / 0.5;
        if (c < 0) goutte.scale.setScalar(1e-5);
        else if (c < 1) { goutte.position.set(centre.x + 0.006, centre.y + 0.10 * (1 - c * c), centre.z - 0.004); goutte.scale.set(0.0022, 0.0022 * (1.2 + 0.4 * c), 0.0022); }
        else { goutte.scale.setScalar(1e-5); onde(0.17, 0.11, 0.0065); etat.chute = null; }
      }
      if (etat.verse != null && etat.page) {
        const v = THREE.MathUtils.clamp((etat.t - etat.verse) / etat.dureeVerse, 0, 1);
        // Jamais en arrière : repasser du mouvement réduit (tout versé) à l'animation ne refait pas couler la mousse.
        if (anime) u.uVerse.value = Math.max(u.uVerse.value, v);
        const tete = anime && v > 0 && v < 1 ? etat.versement.tete(v) : null;
        if (tete) u.uTete.value.set(tete[0], tete[1], 0.024); else u.uTete.value.z = 0;
      }
      // La pluie vit aussi dans le reflet : la face de la fenêtre est rendue de nouveau, une image sur trois.
      if (enVue && anime && !telephone && ++imagesCafe % 3 === 0) rendreCube('fenetre');
    },
    // Rectangles des propositions à l'écran (px), pour y poser exactement les vrais liens.
    rectangles(camera, L, H) {
      if (!etat.page) return [];
      return etat.page.boites.map((b, k) => {
        const coins = [[b.gauche, b.haut], [b.droite, b.haut], [b.gauche, b.bas], [b.droite, b.bas]].map(([x, y]) =>
          new THREE.Vector3(centre.x + x * rayon, centre.y, centre.z - y * rayon).project(camera));
        const xs = coins.map((c) => (c.x + 1) / 2 * L), ys = coins.map((c) => (1 - c.y) / 2 * H);
        return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), lignes: etat.page.lignes.filter((l) => l.phrase === k).length };
      });
    },
    // Essais et captures : fige l'horloge du café (null la rend), lit l'état.
    figer(t) { etat.fige = t; },
    lire() { return { t: etat.t, verse: u.uVerse.value, mousse: u.uMousse.value, bombe: u.uBombe.value, ondes: etat.ondes, actif: etat.actif, survol: [u.uSurvol.value.x, u.uSurvol.value.y], page: etat.page && { taille: etat.page.taille, lignes: etat.page.lignes.map((l) => l.texte), phrases: etat.page.boites.length }, fins: etat.versement?.fins || null, deja: etat.versement?.deja || [], fondu: u.uFondu.value, sucre: etat.sucre, nuage: u.uSucre.value.w }; },
    // Pour les essais de photosensibilité : poser une onde comme le ferait le pointeur.
    onde,
  };
}
