// La console de poche « Takito SYSTEM » (lot portfolio-console-poche, 02/11/2026), posée sur le coin avant gauche du plateau
// (précision de l'utilisateur, 12 h 45). L'utilisateur a choisi la MAQUETTE (13 h 07) : l'objet la reprend fidèlement, au
// pixel près converti en mètres (GABARIT, relevé sur son CSS). Rien n'est cuit (consigne : aucune cuisson tant que le film du
// café n'est pas validé) : géométrie three.js posée par raycasting sur ce qui est dessous, éclairée par la lumière cuite d'un
// objet voisin de même nature (le papier du carnet), comme la fiche « Mon parcours ». Inspirée des consoles grises des
// années 90 sans en copier aucune : ni marque, ni logo, ni typographie maison.
import * as THREE from 'three';
import { MIROIR_VERRE } from './objectifs.js';
import { NOM_CONSOLE, TOUCHES, ECRAN } from '../console-donnees.js';

// La maquette (vers-poste/2026-11-02-console-poche-pistes/maquette), en pixels CSS : coque de 340 px de large, origine en haut à
// gauche, y vers le bas. Chaque nombre vient d'une règle de son CSS (padding, taille, position, rotation).
export const GABARIT = {
  coque: { l: 340, h: 835.7, r: [22, 22, 70, 22] },
  cadre: { x: 22, y: 22, l: 296, h: 663.7, r: [12, 12, 36, 12] },
  ecran: { x: 38, y: 38, l: 264, h: 572, r: 10 },
  // « Takito » 26 px gras, « SYSTEM » 10 px espacé et souligné : la ligne du nom, centrée sous l'écran.
  nom: { x: 170, y: 641, l: 230, h: 36 },
  croix: { x: 78, y: 743.7, bras: 72, epaisseur: 24 },
  // Les deux boutons ronds (38 px) : le cadre de 110 × 70 tourné de −25°, les ronds à ses coins.
  boutons: [{ x: 210.9, y: 767.4 }, { x: 266.8, y: 717.0 }], rBouton: 19,
  pilules: [{ x: 135, y: 806.2 }, { x: 187, y: 806.2 }], pilule: { l: 34, h: 9 }, rotation: -25,
  // Six fentes de 5 × 48, espacées de 12, tournées de −30°. Dans la maquette elles débordent du coin arrondi (un dessin CSS
  // peut déborder, une coque non) : leur centre remonte de 14 px pour qu'elles restent sur la coque.
  fentes: { x: 254, y: 803, n: 6, pas: 12, l: 5, h: 48, rotation: -30 },
};
// La coque mesure 7,5 cm de large : un téléphone. Tout le reste suit l'échelle.
const LARGEUR = 0.075, S = LARGEUR / GABARIT.coque.l, EPAISSEUR = 0.021;
// Couleurs de la maquette : coque crème grisée, cadre du thème ambre, rainures des fentes.
const COULEURS = { coque: '#c8c1b2', cadre: '#1c1b1f', fente: '#4a4640' };
// Le verre : bombé de 4 mm, à peine teinté.
const VERRE = { fleche: 0.004, fume: 0.08, teinte: '#e8d9c0' };
// La place : le coin avant gauche du plateau, la console tournée vers le visiteur. Le plateau va de x = −1,08 au bord avant
// z = 0,26 (chanfrein de 8 mm) ; les dossiers commencent à x = −0,935 : l'emprise tient entre les deux (tests/console-poche.mjs).
export const PLACE = { centre: [-0.99, 0.145], lacet: 0.42 };
// Le papier du carnet, lu à ce niveau de mip FIXE : il efface les lignes écrites, garde la lumière de l'ambiance.
const FLOU = 3;
// Ce que vaut le papier du carnet en albédo (crème) : la lumière reçue = sa couleur cuite / cet albédo.
const PAPIER = 0.8;

// Pixel de la maquette → repère de la console (x à droite, z vers le bas de l'écran, donc vers le visiteur).
const px = (x, y) => [(x - GABARIT.coque.l / 2) * S, (y - GABARIT.coque.h / 2) * S];

// L'écran de verrouillage du faux téléphone, peint comme l'interface vivante (site/js/console.js, même mise en page en pixels
// CSS × k) : c'est lui qu'on voit posé sur le bureau, et c'est sur lui que l'interface s'ouvre ; le relais ne se voit pas.
export function peindreVerrou(maintenant = new Date(), k = 2) {
  const L = GABARIT.ecran.l, H = GABARIT.ecran.h, c = document.createElement('canvas'); c.width = L * k; c.height = H * k;
  const g = c.getContext('2d'), T = ECRAN.theme, MONO = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';
  g.scale(k, k); g.fillStyle = T.fond; g.fillRect(0, 0, L, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // Heure (58 px), date (13 px) centrées comme la colonne flex de l'interface ; l'invite à 42 px du bas.
  g.fillStyle = T.vif; g.font = `700 58px ${MONO}`; g.fillText(maintenant.toTimeString().slice(0, 5), L / 2, 273.6);
  g.fillStyle = T.encre; g.font = `400 13px ${MONO}`; g.fillText(maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), L / 2, 318);
  g.globalAlpha = 0.85; g.font = `400 12px ${MONO}`; g.fillText('⌃ glisser pour ouvrir', L / 2, 521.3); g.globalAlpha = 1;
  return c;
}

// « Takito SYSTEM » comme la maquette : « Takito » romain gras 26 px, 9 px d'écart, « SYSTEM » 10 px à 0,42 em d'espacement,
// souligné de 2 px, sur la même ligne de base. Transparent hors de l'encre.
export function peindreNom(k = 8) {
  const { l, h } = GABARIT.nom, c = document.createElement('canvas'); c.width = l * k; c.height = h * k;
  const g = c.getContext('2d'); g.scale(k, k); g.fillStyle = NOM_CONSOLE.encre; g.textBaseline = 'alphabetic';
  const SERIF = '700 26px Georgia, "DejaVu Serif", "Times New Roman", serif', SANS = '600 10px "DejaVu Sans", Verdana, Arial, sans-serif';
  g.font = SERIF; const lm = g.measureText(NOM_CONSOLE.marque).width;
  g.font = SANS; const esp = 4.2, lettres = [...NOM_CONSOLE.gamme], lg = lettres.reduce((s, ch) => s + g.measureText(ch).width + esp, 0);
  const x0 = (l - (lm + 9 + lg)) / 2, base = h * 0.7;
  g.font = SERIF; g.fillText(NOM_CONSOLE.marque, x0, base);
  g.font = SANS; let x = x0 + lm + 9;
  for (const ch of lettres) { g.fillText(ch, x, base); x += g.measureText(ch).width + esp; }
  g.fillRect(x0 + lm + 9, base + 1, lg, 2);
  return c;
}

// Un rectangle arrondi, chaque coin son rayon (haut gauche, haut droit, bas droit, bas gauche), centré en (dx, dy) ; y vers le haut.
function forme(l, h, [hg, hd, bd, bg], dx = 0, dy = 0) {
  const s = new THREE.Shape(), x0 = dx - l / 2, x1 = dx + l / 2, y0 = dy - h / 2, y1 = dy + h / 2;
  s.moveTo(x0 + bg, y0); s.lineTo(x1 - bd, y0); s.quadraticCurveTo(x1, y0, x1, y0 + bd);
  s.lineTo(x1, y1 - hd); s.quadraticCurveTo(x1, y1, x1 - hd, y1); s.lineTo(x0 + hg, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - hg); s.lineTo(x0, y0 + bg); s.quadraticCurveTo(x0, y0, x0 + bg, y0);
  return s;
}
// Un rectangle de la maquette (x, y, l, h et arrondis des coins, en px) en forme dans le repère de la console.
function formePx({ x, y, l, h, r }) { const [cx, cz] = px(x + l / 2, y + h / 2), R = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => v * S); return forme(l * S, h * S, R, cx, -cz); }
// Extrudée vers le haut (y), le haut de la forme vers le fond (−z) : la console couchée, l'écran vers le haut.
function plaque(s, e, biseau) {
  const g = new THREE.ExtrudeGeometry(s, { depth: e - 2 * biseau, bevelEnabled: biseau > 0, bevelThickness: biseau, bevelSize: biseau, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, biseau); g.rotateX(-Math.PI / 2); return g;
}

// Le plastique et le caoutchouc : un albédo sous la lumière cuite du papier du carnet (fondu des ambiances compris), modelé par
// la direction de la lampe et un peu de reflet de la pièce. Aucune lumière three.js : la pièce n'en a pas. uSurvol réchauffe
// comme les autres objets (même gain que leur surlignage).
function materiauSolide(couleur, lumiere, { brillant = 0.05 } = {}) {
  const a = new THREE.Color(couleur);
  return new THREE.ShaderMaterial({
    uniforms: { ...lumiere, uAlbedo: { value: new THREE.Vector3(a.r, a.g, a.b) }, uBrillant: { value: brillant } },
    vertexShader: `varying vec3 vN, vMonde; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 m = modelMatrix * vec4(position, 1.); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: `uniform sampler2D tPapier, tPapierSuivant; uniform vec2 uUvPapier[4]; uniform samplerCube tEnv; uniform vec3 uAlbedo, uPosLampe; uniform float uBrillant, uLampe, uSurvol, uFonduPapier;
      varying vec3 vN, vMonde;
      ${MIROIR_VERRE}
      vec3 papier(vec2 uv){ vec3 c = textureLod(tPapier, uv, ${FLOU}.).rgb; return uFonduPapier > 0. ? mix(c, textureLod(tPapierSuivant, uv, ${FLOU}.).rgb, uFonduPapier) : c; }
      void main(){
        vec3 recu = (papier(uUvPapier[0]) + papier(uUvPapier[1]) + papier(uUvPapier[2]) + papier(uUvPapier[3])) * (.25 / ${PAPIER.toFixed(2)});
        vec3 n = normalize(vN), l = normalize(uPosLampe - vMonde), v = normalize(cameraPosition - vMonde);
        // Le papier cuit est à plat : un flanc reçoit moins, le côté de la lampe un peu plus quand elle est allumée.
        float modele = (.55 + .45 * max(n.y, 0.)) * mix(1., .78 + .5 * max(dot(n, l), 0.), uLampe);
        float f; vec3 piece = miroirVerre(tEnv, n, v, f);
        vec3 col = uAlbedo * recu * modele + piece * f * uBrillant * 2.;
        // Le reflet de l'ampoule, petit et chaud, sur le plastique satiné.
        col += vec3(1., .82, .6) * pow(max(dot(reflect(-l, n), v), 0.), 40.) * uBrillant * 1.6 * uLampe * recu;
        col *= mix(vec3(1.), vec3(1.14, 1.06, .94), uSurvol);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
}
// L'encre du nom sur le cadre : elle prend la même lumière que lui (même modelé), elle ne brille pas.
function materiauSerigraphie(toile, lumiere) {
  const t = new THREE.CanvasTexture(toile); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = materiauSolide(NOM_CONSOLE.encre, lumiere, { brillant: 0.03 });
  m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
  m.uniforms.tNom = { value: t };
  m.vertexShader = m.vertexShader.replace('varying vec3 vN, vMonde;', 'varying vec3 vN, vMonde; varying vec2 vUv;').replace('void main(){', 'void main(){ vUv = uv;');
  m.fragmentShader = m.fragmentShader.replace('varying vec3 vN, vMonde;', 'varying vec3 vN, vMonde; varying vec2 vUv; uniform sampler2D tNom;')
    .replace('gl_FragColor = vec4(col, 1.);', 'gl_FragColor = vec4(col, texture2D(tNom, vUv).a);');
  return m;
}

// La dalle sous le verre : l'image du faux téléphone, lumineuse par elle-même, avec son tonneau, son balayage, son vignettage.
// uRelais descend à 0 quand l'interface vivante prend sa place : la dalle rend alors l'image telle quelle.
function materiauDalle(texture) {
  return new THREE.ShaderMaterial({
    uniforms: { tUI: { value: texture }, uTemps: { value: 0 }, uRelais: { value: 1 }, uLignes: { value: GABARIT.ecran.h / 3 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D tUI; uniform float uTemps, uRelais, uLignes; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2. - 1.; float r2 = dot(p * vec2(1., .5), p * vec2(1., .5)), k = .09 * uRelais;
        vec2 q = .5 + .5 * p * (1. - k + k * r2);
        if (any(lessThan(q, vec2(0.))) || any(greaterThan(q, vec2(1.)))) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
        vec3 c = texture2D(tUI, q).rgb;
        // Le balayage de la maquette (un trait sombre toutes les trois lignes), effacé sous le pixel pour ne pas moirer.
        float densite = fwidth(q.y) * uLignes * 2.;
        c *= 1. - .4 * step(.667, fract(q.y * uLignes)) * uRelais * (1. - smoothstep(.35, .7, densite));
        c *= 1. - .55 * smoothstep(.36, 1.1, r2) * uRelais;
        c *= .985 + .015 * sin(uTemps * 7.) * uRelais;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
}

// Le verre bombé, translucide : reflet de la pièce (le cube du café), ampoule, une fumée légère et le halo de la dalle.
function materiauVerre(lumiere) {
  const t = new THREE.Color(VERRE.teinte), h = new THREE.Color(ECRAN.theme.encre);
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tEnv: lumiere.tEnv, uPosLampe: lumiere.uPosLampe, uLampe: lumiere.uLampe, uFume: { value: VERRE.fume }, uVoile: { value: 1 }, uTeinte: { value: new THREE.Vector3(t.r, t.g, t.b) }, uHalo: { value: new THREE.Vector3(h.r, h.g, h.b) } },
    vertexShader: `varying vec3 vN, vMonde; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 m = modelMatrix * vec4(position, 1.); vMonde = m.xyz; gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: `uniform samplerCube tEnv; uniform vec3 uPosLampe, uTeinte, uHalo; uniform float uFume, uLampe, uVoile; varying vec3 vN, vMonde; varying vec2 vUv;
      ${MIROIR_VERRE}
      void main(){
        vec3 n = normalize(vN), v = normalize(cameraPosition - vMonde), l = normalize(uPosLampe - vMonde);
        float f; vec3 piece = miroirVerre(tEnv, n, v, f);
        float spec = pow(max(dot(reflect(-l, n), v), 0.), 220.) * 2.2 * uLampe + pow(max(dot(reflect(-l, n), v), 0.), 18.) * .12 * uLampe;
        vec2 p = vUv * 2. - 1.; float bord = smoothstep(.55, 1., max(abs(p.x), abs(p.y)));
        float a = clamp(uFume + f * .85 + spec, 0., .96) * uVoile;
        vec3 c = uTeinte * uFume * .25 + piece * f * .85 + vec3(1., .9, .75) * spec + uHalo * bord * .18;
        gl_FragColor = vec4(c / max(a, 1e-3) * uVoile, a);
      }`,
  });
}

// Le dôme : une plaque fine dont le milieu monte de `fleche`, comme la face d'un tube (bombée sur les deux axes).
function dome(l, h, fleche) {
  const g = new THREE.PlaneGeometry(l, h, 40, 80); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / (l / 2), w = p.getZ(i) / (h / 2); p.setY(i, fleche * (1 - u * u) * (1 - w * w)); }
  g.computeVertexNormals(); return g;
}

// L'ombre de contact : franche et serrée sous ce qui touche, plus un voile doux (leçon de la mini-pieuvre : c'est l'ombre, pas
// la hauteur au millimètre, qui pose un objet).
function ombreContact(l, h, r, opacite, flou) {
  const n = 256, marge = 0.22, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); g.filter = `blur(${n * flou}px)`; g.fillStyle = '#000';
  g.beginPath(); g.roundRect(n * marge / 2, n * marge / 2, n * (1 - marge), n * (1 - marge), n * r / Math.max(l, h)); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(l / (1 - marge), h / (1 - marge)).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, opacity: opacite, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.name = 'console-ombre'; m.raycast = () => {}; return m;
}

// sol : ce sur quoi elle se pose (décor fixe et objets) ; carnet : le groupe du carnet (lumière) ; env : le cube du café.
export function creerConsole({ scene, sol, carnet, posLampe, env }) {
  const lumiere = { tPapier: { value: null }, tPapierSuivant: { value: null }, uFonduPapier: { value: 0 }, uUvPapier: { value: [] }, tEnv: { value: env }, uPosLampe: { value: posLampe.clone() }, uLampe: { value: 1 }, uSurvol: { value: 0 } };
  // La lumière : le papier du carnet, sur ses pages loin des lignes et du stylo, à quatre points.
  const r = new THREE.Raycaster(), bas = new THREE.Vector3(0, -1, 0), bc = new THREE.Box3().setFromObject(carnet);
  const pts = [[0.2, 0.25], [0.35, 0.75], [0.7, 0.3], [0.8, 0.7]].map(([a, b]) => {
    r.set(new THREE.Vector3(THREE.MathUtils.lerp(bc.min.x, bc.max.x, a), 0.5, THREE.MathUtils.lerp(bc.min.z, bc.max.z, b)), bas);
    return r.intersectObject(carnet, true)[0];
  }).filter((h) => h?.uv && h.object.material?.map);
  if (!pts.length) throw new Error('console : papier du carnet introuvable');
  while (pts.length < 4) pts.push(pts[0]);
  const matPapier = pts[0].object.material;
  lumiere.tPapier.value = matPapier.map; lumiere.uUvPapier.value = pts.map((h) => h.uv.clone());

  // Le groupe visé reste à l'origine, comme ceux des autres objets : la scène le soulève de 6 mm au survol et projette sa
  // pastille dans son repère. La pose (place, lacet, hauteur) est celle du corps qu'il contient.
  const G = GABARIT, groupe = new THREE.Group(), corps = new THREE.Group(); groupe.name = 'console-poche'; corps.name = 'console-corps'; groupe.add(corps);
  const mat = (c, o) => materiauSolide(c, lumiere, o);
  // La coque : coin bas droit plus arrondi (70 px contre 22).
  corps.add(new THREE.Mesh(plaque(formePx({ x: 0, y: 0, ...G.coque }), EPAISSEUR, 0.0022), mat(COULEURS.coque, { brillant: 0.05 })));
  // Le cadre sombre, percé à la taille de l'écran : la dalle, posée plus bas que son dessus, y paraît enfoncée.
  const formeCadre = formePx(G.cadre), [ex, ez] = px(G.ecran.x + G.ecran.l / 2, G.ecran.y + G.ecran.h / 2);
  formeCadre.holes.push(new THREE.Path(formePx(G.ecran).getPoints(10)));
  const haut = EPAISSEUR, cadre = new THREE.Mesh(plaque(formeCadre, 0.0009, 0.0002), mat(COULEURS.cadre, { brillant: 0.08 }));
  cadre.position.y = haut - 0.0001; corps.add(cadre);
  const dessusCadre = haut + 0.0008;
  const nom = new THREE.Mesh(new THREE.PlaneGeometry(G.nom.l * S, G.nom.h * S).rotateX(-Math.PI / 2), materiauSerigraphie(peindreNom(), lumiere));
  const [nx, nz] = px(G.nom.x, G.nom.y); nom.position.set(nx, dessusCadre + 0.00004, nz); corps.add(nom);
  // La dalle et son verre.
  let toile = peindreVerrou(); const tUI = new THREE.CanvasTexture(toile); tUI.colorSpace = THREE.SRGBColorSpace; tUI.anisotropy = 8;
  const dalle = new THREE.Mesh(new THREE.PlaneGeometry(G.ecran.l * S, G.ecran.h * S).rotateX(-Math.PI / 2), materiauDalle(tUI));
  dalle.position.set(ex, haut + 0.0001, ez); dalle.name = 'console-dalle'; corps.add(dalle);
  const verre = new THREE.Mesh(dome(G.ecran.l * S + 0.002, G.ecran.h * S + 0.002, VERRE.fleche), materiauVerre(lumiere));
  verre.position.set(ex, dessusCadre + 0.0002, ez); verre.renderOrder = 2; verre.name = 'console-verre'; corps.add(verre);
  // La croix : deux barres de 72 × 24 px qui se croisent, en relief comme l'ombre portée de 3 px de la maquette.
  const C = G.croix, croixS = new THREE.Shape(), b = C.epaisseur / 2 * S, a = C.bras / 2 * S;
  croixS.moveTo(-b, a); croixS.lineTo(b, a); croixS.lineTo(b, b); croixS.lineTo(a, b); croixS.lineTo(a, -b); croixS.lineTo(b, -b); croixS.lineTo(b, -a);
  croixS.lineTo(-b, -a); croixS.lineTo(-b, -b); croixS.lineTo(-a, -b); croixS.lineTo(-a, b); croixS.lineTo(-b, b); croixS.closePath();
  const croix = new THREE.Mesh(plaque(croixS, 0.0034, 0.0005), mat(TOUCHES.croix, { brillant: 0.1 }));
  const [cx, cz] = px(C.x, C.y); croix.position.set(cx, haut - 0.0008, cz); corps.add(croix);
  const matBouton = mat(TOUCHES.boutons, { brillant: 0.14 });
  for (const B of G.boutons) {
    const bt = new THREE.Mesh(new THREE.CylinderGeometry(G.rBouton * S, G.rBouton * S * 1.03, 0.0034, 32), matBouton);
    const [x, z] = px(B.x, B.y); bt.position.set(x, haut + 0.0009, z); corps.add(bt);
  }
  // Select et Start : des pilules de 34 × 9 px tournées de −25° (une rotation CSS de −θ est un lacet de +θ vu d'en haut).
  const matPilule = mat(TOUCHES.pilules, { brillant: 0.06 });
  for (const P of G.pilules) {
    const pl = new THREE.Mesh(new THREE.CapsuleGeometry(G.pilule.h / 2 * S, (G.pilule.l - G.pilule.h) * S, 4, 12).rotateZ(Math.PI / 2), matPilule);
    const [x, z] = px(P.x, P.y); pl.scale.y = 0.55; pl.rotation.y = -THREE.MathUtils.degToRad(G.rotation); pl.position.set(x, haut + 0.0004, z); corps.add(pl);
  }
  // Les fentes du haut-parleur, alignées le long de leur cadre tourné.
  const F = G.fentes, matFente = mat(COULEURS.fente, { brillant: 0 }), th = THREE.MathUtils.degToRad(F.rotation);
  for (let i = 0; i < F.n; i++) {
    const d = (i - (F.n - 1) / 2) * F.pas, [x, z] = px(F.x + d * Math.cos(th), F.y + d * Math.sin(th));
    const f = new THREE.Mesh(new THREE.BoxGeometry(F.l * S, 0.0002, F.h * S), matFente); f.rotation.y = -th; f.position.set(x, haut + 0.00003, z); corps.add(f);
  }

  // La pose : à plat sur le plateau, sa hauteur est le point le plus haut sous ses quatre coins et son centre.
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PLACE.lacet);
  const versMonde = (x, z) => new THREE.Vector3(x, 0, z).applyQuaternion(rot).add(new THREE.Vector3(PLACE.centre[0], 0, PLACE.centre[1]));
  const demi = [LARGEUR / 2, G.coque.h * S / 2], coins = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const sous = (x, z) => { r.set(new THREE.Vector3(x, 0.5, z), bas); return r.intersectObjects(sol, true)[0] || null; };
  let solY = -Infinity;
  for (const [sx, sz] of coins) { const p = versMonde(sx * demi[0], sz * demi[1]), h = sous(p.x, p.z); if (!h) throw new Error('console : pas de plateau sous la console'); solY = Math.max(solY, h.point.y); }
  corps.position.set(PLACE.centre[0], solY, PLACE.centre[1]); corps.quaternion.copy(rot);
  groupe.traverse((m) => { if (m.isMesh) m.userData.objet = 'console'; });
  scene.add(groupe); groupe.updateMatrixWorld(true);
  // L'ombre de contact, à l'aplomb de l'emprise, 0,1 mm au-dessus du plateau, poussée un rien à l'opposé de la lampe.
  const versLampe = new THREE.Vector3(posLampe.x - PLACE.centre[0], 0, posLampe.z - PLACE.centre[1]).normalize(), ombres = [];
  for (const [l, h, rr, op, fl] of [[LARGEUR, G.coque.h * S, 22 * S, 0.7, 0.02], [LARGEUR * 1.15, G.coque.h * S * 1.08, 44 * S, 0.32, 0.07]]) {
    const o = ombreContact(l, h, rr, op, fl); o.position.set(PLACE.centre[0] - versLampe.x * 0.002, solY + 0.0001, PLACE.centre[1] - versLampe.z * 0.002); o.quaternion.copy(rot); scene.add(o); ombres.push(o);
  }
  const uv = verre.material.uniforms, ud = dalle.material.uniforms;

  return {
    groupe, ombres,
    get toile() { return toile; },
    // Le centre de l'écran, sa normale et son « haut » (monde), sa taille : la caméra s'y pose au clic.
    ecran() {
      const q = corps.getWorldQuaternion(new THREE.Quaternion());
      // À sa pose de repos : survolée, la scène soulève le groupe de 6 mm, et la vue d'arrivée ne doit pas en dépendre.
      return { centre: dalle.getWorldPosition(new THREE.Vector3()).sub(groupe.position), normale: new THREE.Vector3(0, 1, 0).applyQuaternion(q), haut: new THREE.Vector3(0, 0, -1).applyQuaternion(q), l: G.ecran.l * S, h: G.ecran.h * S, dessus: dessusCadre - haut };
    },
    // Les quatre coins de la dalle (monde, pose de repos) : haut gauche, haut droit, bas droit, bas gauche. L'interface s'y pose.
    coins() { const l = G.ecran.l * S / 2, h = G.ecran.h * S / 2; return [[-l, -h], [l, -h], [l, h], [-l, h]].map(([x, z]) => dalle.localToWorld(new THREE.Vector3(x, 0, z)).sub(groupe.position)); },
    // À chaque image : textures de l'ambiance du moment (fondu compris), survol, lampe, relais vers l'interface vivante (0 = la
    // dalle rend l'image telle quelle, sans verre ni balayage).
    mettreAJour(temps, { survol = 0, lampe = 1, relais = 1 } = {}) {
      const fp = matPapier.userData.fondu;
      lumiere.tPapier.value = matPapier.map; lumiere.tPapierSuivant.value = fp?.tSuivante.value || null; lumiere.uFonduPapier.value = fp?.tSuivante.value ? fp.uFondu.value : 0;
      lumiere.uSurvol.value = survol; lumiere.uLampe.value = lampe; ud.uTemps.value = temps; ud.uRelais.value = relais; uv.uVoile.value = relais;
    },
    // Le reflet de la pièce (le cube du café), prêt après la console : plastique et verre le partagent.
    reflets(cube) { lumiere.tEnv.value = cube; },
    // L'heure de la dalle suit l'horloge réelle : repeinte quand la minute change.
    repeindre(maintenant = new Date()) { toile = peindreVerrou(maintenant); tUI.image = toile; tUI.needsUpdate = true; },
    // Une boîte mondiale recouvre aussi le vide autour d'une console tournée : les dossiers semblaient la toucher.
    // Les triangles voisins sont donc éprouvés dans sa boîte locale, qui contient toute la coque et ses touches.
    touche(objet) {
      corps.updateWorldMatrix(true, true);
      const inverse = corps.matrixWorld.clone().invert(), boite = new THREE.Box3(), matrice = new THREE.Matrix4();
      corps.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        matrice.multiplyMatrices(inverse, m.matrixWorld);
        boite.union(m.geometry.boundingBox.clone().applyMatrix4(matrice));
      });
      const triangle = new THREE.Triangle(); let contact = false;
      objet.traverse((m) => {
        if (contact || !m.isMesh || !m.geometry.attributes.position) return;
        m.updateWorldMatrix(true, false); matrice.multiplyMatrices(inverse, m.matrixWorld);
        const positions = m.geometry.attributes.position, indices = m.geometry.index;
        for (let i = 0; i < (indices ? indices.count : positions.count); i += 3) {
          for (const [sommet, j] of [[triangle.a, 0], [triangle.b, 1], [triangle.c, 2]])
            sommet.fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(matrice);
          if (boite.intersectsTriangle(triangle)) { contact = true; break; }
        }
      });
      return contact;
    },
    // Pour les essais : ce qu'il y a sous l'emprise (hauteur et objet), l'écart du dessous au plateau, la boîte, le papier.
    etat() {
      groupe.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(groupe), dessous = coins.map(([sx, sz]) => { const p = versMonde(sx * demi[0], sz * demi[1]), h = sous(p.x, p.z); return h ? { y: +h.point.y.toFixed(5), objet: h.object.userData.objet || h.object.name } : null; });
      return { solY: +solY.toFixed(5), bas: +(b.min.y - solY).toFixed(5), dessous, boite: { min: b.min.toArray(), max: b.max.toArray() }, papier: pts.map((h) => h.object.name), ombres: ombres.map((o) => +(o.position.y - solY).toFixed(5)) };
    },
  };
}
