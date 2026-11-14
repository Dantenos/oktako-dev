// Le morceau de sucre (lot portfolio-sucre, 29/10). La pièce cuite n'a pas de soucoupe : le sucre est posé sur
// l'établi, contre la tasse, là où la vue du dessus le montre en bas à gauche. Rien n'est cuit pour lui, rien n'est
// recuit : sa lumière est lue dans la cuisson elle-même, sur l'émail blanc de la tasse juste à côté (même lumière,
// même ambiance, fondu d'une ambiance à l'autre compris), modelée par la lampe et la fenêtre, avec un léger reflet
// de cristaux.
// Le geste : le glisser jusqu'au café, ou le cliquer ; il tombe, éclabousse un peu, fond, et la mousse se réarrange.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Un petit morceau (mètres) et sa place autour de la tasse : 5,5 cm à gauche, 5 cm vers le visiteur, à peine tourné.
// Sur le plat de l'établi (son chanfrein avant commence 1 cm plus loin) et assez loin de la tasse pour que, vu d'en
// haut en paysage, le bord de la tasse ne cache pas son dessus. Sur un téléphone en portrait, la vue du dessus
// s'élargit juste assez pour le montrer entier (scene.js, poseTasse) ; tests/sucre.mjs le vérifie à plusieurs formats.
export const SUCRE = { largeur: 0.0125, hauteur: 0.0096, profondeur: 0.012, decalage: [-0.055, 0.05], lacet: 0.1,
  // La chute : 1 s, un arc qui passe 2,5 cm au-dessus du bord ; le point de chute reste à 45 % du rayon du café,
  // pour que les éclaboussures retombent dans la tasse. Plus vive, le sucre (proche de l'œil au sommet de l'arc)
  // changerait trop de pixels d'une image à l'autre : 1,4 % de l'écran au pire, pour un seuil de 2 %.
  duree: 1, survolBord: 0.025, rayonChute: 0.45 };
// Point de chute par défaut (unités du disque de café, y vers le fond de l'établi) : en bas à gauche, côté sucre.
// À gauche du texte de la mousse, côté sucre : il ne tombe pas dans les lettres.
export const CHUTE = [-0.41, -0.18];
// Opacité de l'ombre de contact, sucre posé.
const OMBRE = 0.62;

export function creerSucre({ scene, centre, rayon, bord, rayonBord, sol, posLampe, env, goutte, telephone }) {
  const demi = new THREE.Vector3(SUCRE.largeur / 2, SUCRE.hauteur / 2, SUCRE.profondeur / 2);
  // Porté ou reposé, le sucre ne passe jamais la paroi : tant que son pied est sous le bord, son centre reste à cette
  // distance de l'axe de la tasse (bord, plus sa demi-diagonale au sol, plus 1 mm).
  const horsTasse = rayonBord + Math.hypot(demi.x, demi.z) + 0.001;
  const geo = new RoundedBoxGeometry(SUCRE.largeur, SUCRE.hauteur, SUCRE.profondeur, 2, 0.0011);
  const email = sol.email;
  const u = {
    tEmail: { value: email.materiau.map }, tEmailSuivant: { value: null }, uFondu: { value: 0 }, uUvHaut: { value: email.haut.clone() }, uUvCote: { value: email.cote.clone() },
    uDemiHauteur: { value: SUCRE.hauteur / 2 },
    tEnv: { value: env }, uPosLampe: { value: posLampe.clone() }, uLampe: { value: 1 }, uSurvol: { value: 0 },
  };
  const materiau = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec3 vN, vMonde, vLocal;
      void main(){ vLocal = position; vN = normalize(mat3(modelMatrix) * normal); vec4 m = modelMatrix * vec4(position, 1.); vMonde = m.xyz;
        gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: `uniform sampler2D tEmail, tEmailSuivant; uniform samplerCube tEnv; uniform vec2 uUvHaut, uUvCote; uniform vec3 uPosLampe;
      uniform float uFondu, uLampe, uSurvol, uDemiHauteur; varying vec3 vN, vMonde, vLocal;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      vec3 email(vec2 uv){ vec3 c = texture2D(tEmail, uv).rgb; return uFondu > 0. ? mix(c, texture2D(tEmailSuivant, uv).rgb, uFondu) : c; }
      void main(){
        // L'émail blanc de la tasse cuite, à deux pas, dit quelle lumière arrive ici dans l'ambiance du moment : son
        // bord (tourné vers le haut) éclaire le dessus du sucre, sa paroi (tournée vers le sucre) ses côtés. Le sucre
        // est un peu plus blanc que le grès, un peu plus froid. La lampe (allumée) ou la fenêtre (de jour) modèlent
        // ensuite les faces qui les regardent.
        vec3 n = normalize(vN), v = normalize(vMonde - cameraPosition), lL = normalize(uPosLampe - vMonde), lF = normalize(vec3(0., .35, -1.));
        vec3 base = mix(email(uUvCote), email(uUvHaut), smoothstep(-.2, .9, n.y));
        float forme = (.86 + .28 * uLampe * max(dot(n, lL), 0.) + .16 * (1. - uLampe) * max(dot(n, lF), 0.)) * mix(.8, 1., smoothstep(.3, .95, n.y));
        // Contre l'établi, le pied du sucre s'assombrit un peu (l'ombre de contact que la cuisson ne connaît pas).
        forme *= mix(.72, 1., smoothstep(-uDemiHauteur, -.2 * uDemiHauteur, vLocal.y));
        vec3 col = base * 1.12 * forme * vec3(.99, 1., 1.02) + textureCube(tEnv, n).rgb * .03;
        // Grain des cristaux, puis quelques facettes qui renvoient la lampe : un reflet léger, fixe tant que l'œil
        // ne bouge pas (rien ne scintille de lui-même).
        col *= .88 + .12 * h(floor(vLocal * 1100.));
        vec3 cel = floor(vLocal * 1500.), nc = normalize(n + (vec3(h(cel + 1.), h(cel + 2.), h(cel + 3.)) - .5) * 1.3);
        float facette = step(.84, h(cel)) * pow(max(dot(reflect(v, nc), lL), 0.), 24.);
        col += vec3(1., .93, .82) * facette * (.25 + .35 * uLampe) * (1. + uSurvol) * clamp(dot(base, vec3(1.)), .15, 1.2);
        // Survolé, il se réchauffe comme les autres objets (même gain que leur surlignage).
        col *= mix(vec3(1.), vec3(1.14, 1.06, .94), uSurvol);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const maillage = new THREE.Mesh(geo, materiau); maillage.name = 'sucre';
  const repos = new THREE.Vector3(centre.x + SUCRE.decalage[0], sol.y + demi.y + 0.0002, centre.z + SUCRE.decalage[1]);
  const rotRepos = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SUCRE.lacet);
  maillage.position.copy(repos); maillage.quaternion.copy(rotRepos);
  scene.add(maillage); maillage.updateMatrixWorld(true);
  // Les sommets du sucre posé (monde) : la vue du dessus les cadre tous.
  const coins = (() => { const b = new THREE.Box3().setFromObject(maillage), p = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) p.push(new THREE.Vector3(x, y, z));
    return p; })();

  // L'ombre de contact : la cuisson ignore le sucre, rien ne le poserait sans elle. Une tache douce, poussée à
  // l'opposé de la lampe, 0,3 mm au-dessus de l'établi (jamais dans son plan) et décalée en profondeur.
  const toile = document.createElement('canvas'); toile.width = toile.height = 64;
  { const g = toile.getContext('2d'), d = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    d.addColorStop(0, 'rgba(0,0,0,.85)'); d.addColorStop(.45, 'rgba(0,0,0,.5)'); d.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = d; g.fillRect(0, 0, 64, 64); }
  const texOmbre = new THREE.CanvasTexture(toile); texOmbre.colorSpace = THREE.NoColorSpace;
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(SUCRE.largeur * 2.1, SUCRE.profondeur * 2.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texOmbre, color: 0x000000, transparent: true, opacity: OMBRE, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const versLampe = new THREE.Vector3(posLampe.x - repos.x, 0, posLampe.z - repos.z).normalize();
  ombre.position.set(repos.x - versLampe.x * 0.0025, sol.y + 0.0003, repos.z - versLampe.z * 0.0025); ombre.name = 'sucre-ombre';
  scene.add(ombre);

  // Les éclaboussures : quelques perles du café (même matière que la goutte), lancées doucement et qui retombent.
  const perles = Array.from({ length: telephone ? 4 : 6 }, () => {
    const m = new THREE.Mesh(goutte.geometry, goutte.material); m.scale.setScalar(1e-5); m.name = 'sucre-perle'; scene.add(m);
    return { m, v: new THREE.Vector3(), r: 0, vie: 0 };
  });

  // État : pose (sur l'établi), tenu (au doigt), retour (reposé), chute, fond (sous la surface), parti.
  const etat = { phase: 'pose', t: 0, depart: new THREE.Vector3(), arrivee: new THREE.Vector3(), controle: new THREE.Vector3(), cible: new THREE.Vector3(), surface: centre.y, impact: null, survol: 0, survolBut: 0, rotDepart: new THREE.Quaternion() };
  const rotChute = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 1).normalize(), 1.1);
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion();
  // Point de chute (disque → monde), borné pour que rien ne passe la paroi.
  function versMonde([x, y]) {
    const r = Math.hypot(x, y), k = r > SUCRE.rayonChute ? SUCRE.rayonChute / r : 1;
    return new THREE.Vector3(centre.x + x * k * rayon, centre.y, centre.z - y * k * rayon);
  }
  const versDisque = (p) => [(p.x - centre.x) / rayon, -(p.z - centre.z) / rayon];
  // L'arc de la chute : de là où il est, par-dessus le bord, jusqu'au café (une parabole : la vitesse croît en tombant).
  function preparerChute(point) {
    etat.depart.copy(maillage.position); etat.arrivee.copy(versMonde(point)); etat.arrivee.y = centre.y + 0.002;
    etat.controle.lerpVectors(etat.depart, etat.arrivee, 0.35);
    // Assez haut pour que tout le sucre passe au-dessus du bord : tests/sucre.mjs échantillonne l'arc.
    etat.controle.y = Math.max(etat.depart.y, bord + SUCRE.survolBord) * 2 - (etat.depart.y + etat.arrivee.y) / 2 + 0.006;
    etat.rotDepart.copy(maillage.quaternion);
  }
  function placerChute(s, cible = maillage.position) {
    const a = 1 - s;
    cible.set(0, 0, 0).addScaledVector(etat.depart, a * a).addScaledVector(etat.controle, 2 * a * s).addScaledVector(etat.arrivee, s * s);
    return cible;
  }
  let surImpact = null;
  function impact(direct) {
    const point = versDisque(etat.arrivee);
    etat.phase = direct ? 'parti' : 'fond'; etat.t = 0;
    ombre.visible = false;
    if (direct) { maillage.visible = false; for (const p of perles) { p.vie = 0; p.m.scale.setScalar(1e-5); } }
    else perles.forEach((p, i) => {
      // Elles jaillissent du cercle où le sucre entre (pas de son dessus : posées sur lui, elles en feraient un dé).
      const a = i / perles.length * Math.PI * 2 + 0.4, h = 0.02 + 0.015 * ((i * 7) % 5) / 4;
      p.m.position.copy(etat.arrivee).setY(centre.y + 0.001).add(tmp.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.0085));
      p.v.set(Math.cos(a) * h, 0.17 + 0.06 * ((i * 3) % 4) / 3, Math.sin(a) * h);
      p.r = 0.0006 + 0.0004 * ((i * 5) % 3) / 2; p.vie = 1;
    });
    const f = surImpact; surImpact = null; f?.({ x: point[0], y: point[1], direct });
  }
  return {
    maillage, ombre, perles: perles.map((p) => p.m), repos, coins,
    // Ce que le reflet du café ne doit pas voir (le sucre lit lui-même ce reflet).
    get masques() { return [maillage, ombre, ...perles.map((p) => p.m)]; },
    get phase() { return etat.phase; },
    get anime() { return ['tenu', 'retour', 'chute', 'fond'].includes(etat.phase) || perles.some((p) => p.vie > 0) || Math.abs(etat.survol - etat.survolBut) > 0.01; },
    survol(oui) { etat.survolBut = oui ? 1 : 0; },
    // Le doigt prend le sucre : il quitte l'établi et suit le geste au-dessus du bord de la tasse.
    saisir() { if (etat.phase === 'pose' || etat.phase === 'retour') { etat.phase = 'tenu'; etat.cible.copy(maillage.position); } },
    porter(p) { if (etat.phase === 'tenu') etat.cible.set(p.x, Math.max(p.y, bord + demi.y + 0.008), p.z); },
    hauteurPortee: () => bord + demi.y + 0.008,
    reposer() { if (etat.phase === 'tenu') { etat.phase = 'retour'; etat.cible.copy(repos); } },
    // Lâché (ou cliqué) : il tombe vers ce point du café ; surImpact reçoit le point de chute (unités du disque).
    lacher(point = CHUTE, { direct = false, auImpact } = {}) {
      if (!['pose', 'tenu', 'retour'].includes(etat.phase)) return false;
      surImpact = auImpact;
      preparerChute(point);
      if (direct) { impact(true); return true; }
      etat.phase = 'chute'; etat.t = 0; return true;
    },
    // Une visite quittée en pleine chute : le sucre a fondu, la mousse est posée d'un coup.
    terminer() { if (etat.phase === 'chute') impact(true); else if (etat.phase === 'fond') { etat.phase = 'parti'; maillage.visible = false; } for (const p of perles) { p.vie = 0; p.m.scale.setScalar(1e-5); } },
    // La lumière : la texture cuite de l'établi sous le sucre (et la suivante pendant un fondu d'ambiance).
    mettreAJour(dt, { anime, lampe, onde }) {
      const f = email.materiau.userData.fondu;
      u.tEmail.value = email.materiau.map; u.tEmailSuivant.value = f?.tSuivante.value || null; u.uFondu.value = f?.tSuivante.value ? f.uFondu.value : 0;
      u.uLampe.value = lampe;
      etat.survol += (etat.survolBut - etat.survol) * (anime ? Math.min(1, dt * 8) : 1); u.uSurvol.value = etat.survol;
      if (etat.phase === 'tenu' || etat.phase === 'retour') {
        const p = maillage.position, k = anime ? 1 - Math.exp(-dt * 18) : 1;
        tmp.copy(p).lerp(etat.cible, k);
        // Pris, il monte plus vite qu'il n'avance ; reposé, il sort de la tasse avant de redescendre (jamais à travers).
        tmp.y = p.y + (etat.cible.y - p.y) * Math.min(1, k * (etat.phase === 'tenu' ? 1.8 : 0.6));
        const d = Math.hypot(tmp.x - centre.x, tmp.z - centre.z), dessus = bord + demi.y + 0.001;
        if (tmp.y < dessus && d < horsTasse) {
          if (p.y >= dessus) tmp.y = dessus;
          else { const s = horsTasse / Math.max(d, 1e-6); tmp.x = centre.x + (tmp.x - centre.x) * s; tmp.z = centre.z + (tmp.z - centre.z) * s; }
        }
        p.copy(tmp);
        // L'ombre pâlit à mesure qu'il quitte l'établi.
        ombre.material.opacity = OMBRE * Math.max(0, 1 - (maillage.position.y - repos.y) / 0.02);
        if (etat.phase === 'retour' && maillage.position.distanceTo(repos) < 1e-4) { maillage.position.copy(repos); etat.phase = 'pose'; ombre.material.opacity = OMBRE; }
      } else if (etat.phase === 'chute') {
        etat.t += dt / SUCRE.duree;
        const s = Math.min(1, etat.t);
        placerChute(s); maillage.quaternion.slerpQuaternions(etat.rotDepart, q.copy(rotRepos).multiply(rotChute), s);
        ombre.material.opacity = OMBRE * Math.max(0, 1 - (maillage.position.y - repos.y) / 0.02);
        if (s >= 1) { onde?.(versDisque(etat.arrivee), 0.0055); impact(false); }
      } else if (etat.phase === 'fond') {
        // Il s'enfonce sous la surface (le café, opaque, le cache) en rapetissant, puis il n'est plus.
        etat.t += dt / 0.6;
        maillage.position.y = centre.y - demi.y * 1.2 * Math.min(1, etat.t); maillage.scale.setScalar(Math.max(0.3, 1 - 0.7 * etat.t));
        if (etat.t >= 1) { etat.phase = 'parti'; maillage.visible = false; }
      }
      for (const p of perles) {
        if (p.vie <= 0) continue;
        // Gravité ralentie, comme la goutte : à la vraie vitesse, l'œil ne verrait pas ces perles.
        p.v.y -= 1.7 * dt; p.m.position.addScaledVector(p.v, dt);
        if (p.m.position.y <= centre.y && p.v.y < 0) { p.vie = 0; p.m.scale.setScalar(1e-5); onde?.(versDisque(p.m.position), 0.0012); }
        else p.m.scale.setScalar(p.r);
      }
    },
    // Pour les essais : l'arc de la chute échantillonné (centre du sucre), depuis l'établi vers le point par défaut.
    trajet(n = 40, point = CHUTE) {
      const avant = { phase: etat.phase, pos: maillage.position.clone() };
      maillage.position.copy(repos); preparerChute(point);
      const pts = Array.from({ length: n + 1 }, (_, i) => placerChute(i / n, new THREE.Vector3()).toArray());
      maillage.position.copy(avant.pos);
      return { points: pts, demi: demi.toArray(), centre: centre.toArray(), rayon, bord };
    },
    // Pour les essais : le sucre est-il dans la paroi de la tasse (pied sous le bord, ni dehors ni dans le café) ?
    dansLaParoi() {
      if (!maillage.visible || etat.phase === 'fond') return false;
      const p = maillage.position, d = Math.hypot(p.x - centre.x, p.z - centre.z), hd = Math.hypot(demi.x, demi.z);
      return p.y - demi.y < bord && d - hd < rayonBord && d + hd > rayon;
    },
    // Pour les essais : boîte du sucre au repos et hauteur de l'établi sous lui.
    boite() { maillage.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(maillage); return { min: b.min.toArray(), max: b.max.toArray(), sol: sol.y, visible: maillage.visible }; },
    // Rectangle du sucre posé, à l'écran (px) pour la caméra donnée : le vrai bouton s'y pose.
    rectangle(camera, L, H) {
      if (etat.phase !== 'pose' && etat.phase !== 'tenu' && etat.phase !== 'retour') return null;
      maillage.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(maillage), xs = [], ys = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        tmp.set(x, y, z).project(camera); xs.push((tmp.x + 1) / 2 * L); ys.push((1 - tmp.y) / 2 * H);
      }
      return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    },
  };
}
