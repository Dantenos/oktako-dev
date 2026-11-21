// La mini-pieuvre du bureau (variantes et actions : docs/MINI-PIEUVRE.md). Un glTF vivant, jamais cuit : Blender écrit
// le modèle et ses actions (tools/blender/personnages/exporter.py), ce module les joue, et pieuvre-cerveau.js décide
// quoi jouer. Elle se charge APRÈS la pièce et n'est jamais indispensable : sans elle, rien ne manque.
//
// Sa lumière vient de la cuisson elle-même, comme pour le sucre : l'émail blanc de la tasse dit quelle couleur prend un
// objet clair ici, dans l'ambiance du moment, fondu compris. Rien n'est donc à recuire. Son ombre non plus n'est pas cuite :
// sa propre silhouette, écrasée sur le casier le long de la lumière, est redessinée dans une petite cible à chaque image.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { creerCerveau } from './pieuvre-cerveau.js';
import { creerSaut } from './pieuvre-saut.js';

// Son lacet et sa zone de clic ; sa place, elle, est lue dans la pièce par scene.js (le dessus du casier).
export const PIEUVRE = { lacet: -0.24, boite: [0.1, 0.07, 0.08] };
// Blender compose ses angles d'Euler « XYZ » en Rz·Ry·Rx : pour three.js, c'est l'ordre 'ZYX'.
const ORDRE_BLENDER = 'ZYX';
// Le pointeur vu par ses yeux : le plan vertical qu'il balaie, à cette distance devant elle (mètres).
const PLAN_POINTEUR = 0.35;
// Une boucle de l'ondulation dure ce temps (secondes). Elle ne dépend d'aucune action : ses phases ne se répètent pas.
const PERIODE_ONDE = 3.4;
// La tache de contact, sous elle : l'occlusion. L'ombre portée fait le reste, elle n'a plus à tout dire.
const OMBRE = 0.42;
// L'ombre portée : taille de sa cible (pixels), côté du carré de casier qu'elle couvre (mètres), force, et hauteur minimale de
// la lumière (une lampe presque à l'horizontale l'allongerait au-delà du casier).
// 256 : à 128 px pour 34 cm, le contact sous une pointe se lisait en flou dans la vue rapprochée (lot pieuvre-au-sol).
const OMBRE_PX = 256, OMBRE_COTE = 0.34, OMBRE_FORCE = 0.62, LUMIERE_MIN = 0.5;
// L'assombrissement de contact, au pied des bras.
// Le contact franc (lot pieuvre-au-sol, 2 novembre 2026) : c'est lui, et non la hauteur, qui la pose sur le casier. Essayé à l'image : descendre l'objet de 2 ou 3 mm ne change
// presque rien à l'œil et enfonce les bras ; une ombre sombre et serrée sous ce qui touche l'ancre. Avant : force 0,88, contact jusqu'à 22 mm, flou 0,005.
const CONTACT_FORCE = 1;
// Le contact : jusqu'à quelle hauteur une partie du corps compte comme touchant (m), et son flou (en part de la cible).
const CONTACT_HAUT = 0.006, CONTACT_FLOU = 0.0015;
// Le trait, en fraction de l'épaisseur du modèle : à pleine épaisseur, il la découpait sur la pièce ; sous 0,7, il passe
// sous le pixel à cette distance et crépite le long de la silhouette.
const TRAIT = 0.75;
// Les couvre-chefs, dans l'ordre du choix (un clic passe au suivant) ; « sans » n'a pas de maillage. Le béret est celui
// de la marque : c'est lui qu'on porte quand rien n'est mémorisé, ou que le navigateur refuse le stockage.
export const CHAPEAUX = [['beret', 'béret', 'son béret'], ['cowboy', 'cow-boy', 'son chapeau de cow-boy'], ['chantier', 'chantier', 'son casque de chantier'], ['marin', 'marin', 'son bonnet de marin'], ['sans', 'tête nue', 'rien sur la tête']];
const CLE_CHAPEAU = 'mt-pieuvre-chapeau', PAR_DEFAUT = 'beret';
// Le casque audio et le bonnet de nuit se mettent à la place du chapeau : il rentre le temps de l'action, sinon ils
// se superposent. Vitesse de cet escamotage (par seconde), et échelle d'un os rangé, comme dans pieuvre.py.
const VIF_CHAPEAU = 12, RANGE = 1e-4;
// Le contact au sol : à partir de quel os d'un bras commence la pointe ; à partir de quel os on la baisse (mesure du 2 novembre : les os de l'enroulement, 6 et 7, ne la descendent
// presque pas, c'est le bras qui doit se courber avant elle) ; la hauteur visée sous la pointe et sous le bras (mm, avant l'échelle du téléphone) ; jusqu'où le bras peut passer
// sous la surface du casier sans se voir (mm) ; l'angle le plus grand permis par os (rad).
const SOL = { pointe: 6, depuis: 4, pointe_mm: 0.6, tolerance_mm: 0.4, angle_max: 0.5 };
const REPOS_SOL = 'repos_respire';
// Deux réglages de goût, indépendants. POINTES_AU_SOL : 0, les pointes du dessin d'origine, recourbées en l'air ; 1, posées au contact ; entre les deux, au prorata de l'angle.
// DESCENTE_MM : de combien tout l'objet descend depuis sa place d'origine (mm, avant l'échelle du téléphone).
// Choix de l'utilisateur, 2 novembre 2026 : « ne change pas les boucles », puis, devant l'image des descentes, « celui c'est le mieux » pour 2 mm. À 2 mm, le dessous des bras
// passe d'environ 1 mm sous la surface du casier, ce qu'il a accepté à l'œil ; l'ombre de contact franche fait le reste (tests/pieuvre-sol.mjs, tolérance 1,2 mm).
export const POINTES_AU_SOL = 0;
export const DESCENTE_MM = 2;
// La force du liseré clair, en lumière ajoutée. Un filet : plus large, il délave le rouge et grise le béret.
const LISERE = 0.8;
// L'apparition sans saut, en mouvement réduit (s) : un fondu, sans déplacement.
const FONDU_ENTREE = 0.7;
// Sa couleur qui rejaillit sur le chêne, en lumière ajoutée.
const REBOND = new THREE.Color(0.06, 0.008, 0.005);
// Après sa réception, le temps où elle regarde le visiteur avant de lui faire signe (s).
const REGARD_AVANT_SALUT = 0.9;
// Le bond de la rencontre (m) : le saut d'entrée rejoué sur place, assez bas pour rester dans le cadre du gros plan.
const BOND_SUR_PLACE = 0.025;
// La plus petite cible acceptable sous le doigt (pixels).
const ZONE_MINI = 44;
// Une couche qu'aucun lancer ne regarde.
const COUCHE_ABSENTE = 31;
function lireChapeau() {
  try { const n = localStorage.getItem(CLE_CHAPEAU); return CHAPEAUX.some(([c]) => c === n) ? n : PAR_DEFAUT; } catch { return PAR_DEFAUT; }
}
function ecrireChapeau(n) { try { localStorage.setItem(CLE_CHAPEAU, n); } catch { /* le choix vaut pour cette visite */ } }
// Vitesse à laquelle les yeux rejoignent ou quittent leur cible : assez vive pour paraître une attention.
const VIF_REGARD = 9;
// La toute petite tasse du pourboire (lot pourboire-mini-pieuvre, 16 novembre 2026) : tenue au bout du bras que tend `guide_montrer`.
// Le geste existait dans la bibliothèque Blender ; l'objet est modelé ici, par révolution d'un profil, sans réexport du GLB : il ne
// touche ni au squelette ni aux actions, et sa matière est celle de la pieuvre (la lumière lue dans l'émail de la vraie tasse).
// Cotes en mètres, à l'échelle de la pieuvre : 1 cm de haut, de quoi rester une tasse de poupée à côté de celle de 9,3 cm.
const TASSE = {
  os: 'bras_1.G', // le bras qui se tend (AVANT_G dans actions.py)
  // Entre l'avant-dernière et la dernière articulation, et posée au-dessus du bras : la pointe, libre, s'enroule.
  le_long: 0.55, au_dessus: 0.0022,
  // Quand elle paraît et repart, en secondes de l'action (24 i/s) : le bras est tendu de l'image 20 à l'image 64.
  parait: [0.5, 0.82], repart: [2.42, 2.66],
  // Les couleurs portent le linéaire du glTF (COLOR_0) : un émail à peine crème, et le café.
  email: [0.86, 0.82, 0.74], cafe: [0.045, 0.018, 0.007],
};
// Un profil tourné, et une anse : un seul maillage, non indexé, couleur par sommet. L'alpha (l'épaisseur du trait) reste nul : la
// coque n'en dessine pas, à cette taille elle ne ferait qu'un liseré qui crépite.
function geometrieTasse() {
  const P = (x, y) => new THREE.Vector2(x, y);
  const corps = new THREE.LatheGeometry([P(0, 0), P(0.0040, 0), P(0.0046, 0.0007), P(0.0058, 0.0080), P(0.0061, 0.0100), P(0.0055, 0.0100), P(0.0052, 0.0080)], 20);
  const cafe = new THREE.CircleGeometry(0.0052, 20).rotateX(-Math.PI / 2).translate(0, 0.0080, 0);
  const anse = new THREE.TorusGeometry(0.0024, 0.0007, 6, 10, Math.PI * 1.25).rotateZ(-Math.PI * 0.625).translate(0.0062, 0.0052, 0);
  const pos = [], nor = [], col = [];
  for (const [g, c] of [[corps, TASSE.email], [anse, TASSE.email], [cafe, TASSE.cafe]]) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array);
    for (let i = 0; i < n.attributes.position.count; i++) col.push(...c, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  // Quatre composantes : la matière lit color.a (le trait), et three.js ne déclare vec4 que pour un attribut à quatre.
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return geo;
}
// Elle paraît d'un petit rebond (dépasse puis revient) et repart en douceur : une taille qui change, jamais une lumière qui clignote.
const rebondir = (u) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
const lisser = (u) => u * u * (3 - 2 * u);
function tailleTasse(t) {
  const [a0, a1] = TASSE.parait, [r0, r1] = TASSE.repart;
  if (t <= a0 || t >= r1) return 0;
  if (t < a1) return rebondir((t - a0) / (a1 - a0));
  if (t > r0) return 1 - lisser((t - r0) / (r1 - r0));
  return 1;
}

const SOMMET = `
  #include <common>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  uniform float uPousse;
  varying vec3 vN, vMonde, vCouleur; varying float vHauteur;
  void main(){
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    // La coque du trait : poussée le long de la normale AVANT la peau. Elle suit donc les os, et disparaît avec un
    // accessoire rangé (échelle quasi nulle), là où une épaisseur en espace monde laisserait une boule d'encre.
    transformed += normal * color.a * uPousse;
    #include <skinning_vertex>
    vec4 m = modelMatrix * vec4(transformed, 1.);
    vMonde = m.xyz; vN = normalize(mat3(modelMatrix) * objectNormal); vCouleur = color.rgb; vHauteur = m.y;
    gl_Position = projectionMatrix * viewMatrix * m;
  }`;

const FRAGMENT = `
  uniform sampler2D tEmail, tEmailSuivant; uniform vec2 uUvHaut, uUvCote; uniform vec3 uPosLampe;
  uniform float uFondu, uLampe, uSol, uSurvol, uTrait, uApparition, uLisere; varying vec3 vN, vMonde, vCouleur; varying float vHauteur;
  vec3 email(vec2 uv){ vec3 c = texture2D(tEmail, uv).rgb; return uFondu > 0. ? mix(c, texture2D(tEmailSuivant, uv).rgb, uFondu) : c; }
  void main(){
    // Un fondu par trame plutôt que par transparence : le corps et sa coque se trieraient mal, et la matière garde son écriture en profondeur.
    if (uApparition < 1. && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) >= uApparition) discard;
    vec3 n = normalize(vN), v = normalize(cameraPosition - vMonde), lL = normalize(uPosLampe - vMonde), lF = normalize(vec3(0., .35, -1.));
    // La lumière de l'endroit : l'émail vu d'en haut pour les faces tournées vers le plafond, sa paroi pour les côtés.
    vec3 lumiere = mix(email(uUvCote), email(uUvHaut), smoothstep(-.2, .9, n.y));
    // La pièce a traversé la courbe filmique de Blender, qui éteint les rouges purs ; un rouge d'écran y paraîtrait collé.
    vec3 matiere = mix(vCouleur, vec3(dot(vCouleur, vec3(.2126, .7152, .0722))), .3) + .006;
    // Le trait n'est plus de l'encre : une ombre de sa propre couleur, qui se fond dans la pièce au lieu de la découper.
    if (uTrait > .5) { gl_FragColor = vec4(matiere * .3 * lumiere, 1.); return; }
    // Ce qu'elle reçoit : un fond doux, la lampe (allumée) ou la fenêtre (de jour) d'un côté, l'autre côté dans l'ombre. C'est
    // ce contraste, absent d'un aplat, qui lui donne un volume dans la même lumière que le reste.
    float lampe = smoothstep(-.25, .95, dot(n, lL)), fenetre = smoothstep(-.3, .95, dot(n, lF));
    float recu = .5 + .78 * uLampe * lampe + .52 * (1. - uLampe) * fenetre;
    // Le dessous et le bas des flancs prennent le rebond chaud du chêne, plutôt que de tomber au noir.
    vec3 rebond = vec3(.5, .27, .13) * pow(.5 - .5 * n.y, 2.) * .75;
    vec3 col = matiere * lumiere * (vec3(recu) + rebond);
    // Contre le casier, le pied s'assombrit : l'occlusion que la cuisson ne connaît pas.
    col *= mix(.5, 1., smoothstep(0., .03, vHauteur - uSol));
    // Le vinyle : un reflet étroit de la source, et un liseré clair qui lit la lumière de l'endroit. Son rouge et le chêne ont presque la même clarté (1,5:1 mesuré) :
    // sans ce bord lumineux, elle ne se détache que par la teinte, et on ne la voit pas.
    vec3 h = normalize(lL + v);
    col += vec3(1., .94, .86) * pow(max(dot(n, h), 0.), 64.) * .16 * uLampe * dot(vCouleur, vec3(.33));
    col += vec3(1., .78, .6) * pow(1. - max(dot(n, v), 0.), 6.) * uLisere;
    col *= mix(vec3(1.), vec3(1.14, 1.06, .94), uSurvol);
    gl_FragColor = vec4(col, 1.);
  }`;

function matiere(uniformes, trait) {
  return new THREE.ShaderMaterial({ uniforms: uniformes, vertexShader: SOMMET, fragmentShader: FRAGMENT, vertexColors: true, side: trait ? THREE.BackSide : THREE.FrontSide });
}

// La tache sous elle : plus large que haute, jamais dans le plan du casier.
function creerTache(position, sol) {
  const toile = document.createElement('canvas'); toile.width = toile.height = 128;
  const g = toile.getContext('2d'), d = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  d.addColorStop(0, 'rgba(0,0,0,.95)'); d.addColorStop(.6, 'rgba(0,0,0,.75)'); d.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = d; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(toile); tex.colorSpace = THREE.NoColorSpace;
  const tache = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: OMBRE, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  tache.position.set(position.x, sol + 0.0003, position.z); tache.name = 'pieuvre-ombre';
  return tache;
}

// L'ombre portée : sa silhouette, écrasée sur le plan du casier le long de la lumière, dans une petite cible qu'un plan
// relit, flouée. La couleur MAX évite qu'un bras passant sur un autre ne double l'ombre.
function creerOmbrePortee(sol) {
  const cible = new THREE.WebGLRenderTarget(OMBRE_PX, OMBRE_PX, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const uProjette = { uL: { value: new THREE.Vector3(0, 1, 0) }, uSol: { value: sol }, uCentre: { value: new THREE.Vector2() }, uCote: { value: OMBRE_COTE }, uContactHaut: { value: CONTACT_HAUT } };
  const projette = new THREE.ShaderMaterial({
    uniforms: uProjette, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `#include <common>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      uniform vec3 uL; uniform float uSol, uCote, uContactHaut; uniform vec2 uCentre; varying float vH;
      void main(){
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        vec4 m = modelMatrix * vec4(transformed, 1.);
        vH = max(m.y - uSol, 0.);
        vec3 p = m.xyz - uL * (vH / uL.y);
        gl_Position = vec4((p.x - uCentre.x) / uCote * 2., (p.z - uCentre.y) / uCote * 2., 0., 1.);
      }`,
    // Rouge : l'ombre, d'autant plus pâle qu'elle vient de haut. Vert : le contact, ce qui touche presque le casier. Vu de
    // très biais, le dessus s'écrase et une grande ombre ne se lit pas : c'est ce trait sombre au pied des bras qui la pose.
    fragmentShader: `uniform float uContactHaut; varying float vH; void main(){ gl_FragColor = vec4(1. - .6 * smoothstep(0., .1, vH), 1. - smoothstep(.003, uContactHaut, vH), 0., 1.); }`,
  });
  const u = { tOmbre: { value: cible.texture }, uForce: { value: OMBRE_FORCE }, uContact: { value: CONTACT_FORCE }, uFlou: { value: CONTACT_FLOU }, uRebond: { value: REBOND.clone() } };
  const plan = new THREE.Mesh(new THREE.PlaneGeometry(OMBRE_COTE, OMBRE_COTE).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D tOmbre; uniform float uForce, uContact, uFlou; uniform vec3 uRebond; varying vec2 vUv;
      void main(){
        // V inversé : la cible regarde le casier d'en bas, le plan d'en haut.
        vec2 p = vec2(vUv.x, 1. - vUv.y); float a = 0.;
        for (int i = 0; i < 8; i++) { float t = float(i) * .7854; a += textureLod(tOmbre, p + vec2(cos(t), sin(t)) * .016, 1.5).r; }
        a = a / 8. * smoothstep(.5, .36, length(vUv - .5));
        // Le contact reste net : pas de flou large, un simple adoucissement.
        float c = 0.;
        for (int i = 0; i < 4; i++) { float t = float(i) * 1.5708 + .4; c += textureLod(tOmbre, p + vec2(cos(t), sin(t)) * uFlou, .5).g; }
        c = min(1., c / 4. * 1.6) * smoothstep(.5, .36, length(vUv - .5));
        // Sa couleur rejaillit un peu sur le chêne autour d'elle : prémultiplié, c'est du rouge ajouté sous le noir de l'ombre.
        gl_FragColor = vec4(uRebond * a, max(a * uForce, c * uContact));
      }`,
  }));
  plan.position.y = sol + 0.0005; plan.name = 'pieuvre-ombre-portee';
  return { cible, projette, uProjette, plan, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

// options : scene, renderer, camera, base (dossier modele/), place (x, z, sol : le dessus du casier), email (le blanc de
// référence, celui de la tasse), posLampe, demarrer. Rend l'objet que scene.js appelle à chaque image, ou lève : à lui de se taire.
export async function creerPieuvre({ scene, renderer, camera, base, place, email, posLampe, demarrer }) {
  const [gltf, catalogue] = await Promise.all([
    new GLTFLoader().loadAsync(base + 'pieuvre.glb'),
    fetch(base + 'pieuvre-actions.json').then((r) => { if (!r.ok) throw Error('pieuvre-actions.json : ' + r.status); return r.json(); }),
  ]);

  const groupe = new THREE.Group(); groupe.name = 'pieuvre';
  const sol = place.sol, E = place.echelle || 1;
  groupe.position.set(place.x, sol, place.z); groupe.rotation.y = PIEUVRE.lacet;
  groupe.add(gltf.scene);

  const uCommun = {
    tEmail: { value: email.materiau.map }, tEmailSuivant: { value: null }, uFondu: { value: 0 }, uUvHaut: { value: email.haut.clone() }, uUvCote: { value: email.cote.clone() },
    uPosLampe: { value: posLampe.clone() }, uLampe: { value: 1 }, uSol: { value: sol }, uSurvol: { value: 0 },
    uPousse: { value: 0 }, uTrait: { value: 0 }, uApparition: { value: 1 }, uLisere: { value: LISERE },
  };
  // Deux matières qui partagent leurs uniformes, sauf l'épaisseur et le drapeau : une seule mise à jour par image.
  const uCoque = { ...uCommun, uPousse: { value: TRAIT * catalogue.trait.plafond_m / catalogue.trait.echelle }, uTrait: { value: 1 } };
  const peau = matiere(uCommun, false), coque = matiere(uCoque, true);
  let visage = null; const os = {};
  gltf.scene.traverse((o) => {
    if (o.isBone) os[o.name] = o;
    if (!o.isMesh) return;
    const trait = o.material.name === 'trait';
    o.material.dispose(); o.material = trait ? coque : peau;
    // Les positions du fichier sont quantifiées, décodées par les matrices de liaison : leur sphère ne dit rien.
    o.frustumCulled = false;
    if (o.morphTargetInfluences) visage = o;
  });

  // Les couvre-chefs : un maillage et sa coque chacun, tous portés par l'os du béret, qu'aucune action n'anime.
  const chapeaux = Object.fromEntries(CHAPEAUX.filter(([n]) => n !== 'sans').map(([n]) => {
    const meshes = []; gltf.scene.getObjectByName('chapeau_' + n).traverse((o) => { if (o.isMesh) meshes.push(o); });
    return [n, meshes];
  }));
  const osChapeau = os[THREE.PropertyBinding.sanitizeNodeName(catalogue.chapeaux.os)];
  // Les actions qui mettent quelque chose à la place du chapeau.
  const sansChapeau = new Set(catalogue.actions.filter((a) => a.accessoires.includes('casque') || a.accessoires.includes('bonnet')).map((a) => a.nom));
  let chapeau = PAR_DEFAUT, tailleChapeau = 1, surChapeau = null;
  function porter(n, { garder = false } = {}) {
    chapeau = n;
    for (const [c, meshes] of Object.entries(chapeaux)) for (const m of meshes) m.visible = c === n;
    if (garder) ecrireChapeau(n);
    const [, court, phrase] = CHAPEAUX.find(([c]) => c === n);
    surChapeau?.(court, phrase, garder);
  }
  porter(lireChapeau());

  // Un couvre-chef hors du squelette, pour qui veut l'employer ailleurs : droit, posé à l'origine, en mètres, un maillage
  // par couleur. Le fichier porte la couleur par sommet et des positions quantifiées, inutilisables telles quelles.
  function maillageChapeau(n = chapeau) {
    if (!chapeaux[n]) return null;
    const { centre, echelle, biais } = catalogue.chapeaux, { attributes: A, index } = chapeaux[n].find((m) => m.material === peau).geometry;
    const droit = new THREE.Quaternion().fromArray(biais[n]).invert(), p = new THREE.Vector3(), no = new THREE.Vector3();
    const parCouleur = new Map(), bas = new THREE.Vector3(Infinity, Infinity, Infinity), haut = bas.clone().negate();
    for (let i = 0; i < index.count; i += 3) {
      const c0 = index.getX(i), cle = [A.color.getX(c0), A.color.getY(c0), A.color.getZ(c0)].join();
      if (!parCouleur.has(cle)) parCouleur.set(cle, { couleur: [A.color.getX(c0), A.color.getY(c0), A.color.getZ(c0)], pos: [], nor: [] });
      const g = parCouleur.get(cle);
      for (let k = 0; k < 3; k++) {
        const v = index.getX(i + k);
        p.fromBufferAttribute(A.position, v).multiplyScalar(echelle).add(no.fromArray(centre)).applyQuaternion(droit);
        g.pos.push(p.x, p.y, p.z); bas.min(p); haut.max(p);
        no.fromBufferAttribute(A.normal, v).applyQuaternion(droit); g.nor.push(no.x, no.y, no.z);
      }
    }
    const g = new THREE.Group(); g.name = 'chapeau-' + n;
    for (const { couleur, pos, nor } of parCouleur.values()) {
      const geo = new THREE.BufferGeometry();
      // À l'origine : centré sur son axe, posé sur le plan y = 0.
      for (let i = 0; i < pos.length; i += 3) { pos[i] -= (bas.x + haut.x) / 2; pos[i + 1] -= bas.y; pos[i + 2] -= (bas.z + haut.z) / 2; }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...couleur), roughness: 0.7 })));
    }
    return g;
  }

  // Les pistes : une AnimationAction par action du catalogue, créée une fois pour toutes.
  const melangeur = new THREE.AnimationMixer(gltf.scene);
  const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, melangeur.clipAction(c)]));
  let courante = null;
  function jouer(nom, { boucle, fondu }) {
    const a = actions[nom]; if (!a) return;
    a.reset(); a.setLoop(boucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.enabled = true; a.play();
    if (courante && courante !== a) courante.crossFadeTo(a, fondu, false);
    courante = a;
  }

  // Les os que le navigateur retouche après les pistes. Avant chaque image, chacun retrouve sa dernière valeur PURE,
  // celle du mixeur (« pur ») : sans cela, un os sans piste cumulerait ses retouches. Et jamais le repos à la place : le
  // mixeur n'écrit une valeur que si elle a changé, donc un bras tenu immobile retomberait au repos pendant sa pose.
  // GLTFLoader nettoie les noms de nœuds (« oeil.G » devient « oeilG ») : le point sépare les propriétés dans une piste.
  const nomOs = THREE.PropertyBinding.sanitizeNodeName;
  const O = catalogue.onde, vivants = [];
  O.bras.forEach((nom, k) => {
    for (let j = 0; j < O.hauteur.length; j++) {
      const b = os[nomOs(`${nom}.${j}`)]; if (!b) continue;
      vivants.push({ b, k, j, pur: b.quaternion.clone(), h: O.hauteur[j], c: O.cote[j], ph: k * O.phase_bras - j * O.phase_os, courbe: 0 });
    }
  });
  // Le contact avec le casier (lot pieuvre-au-sol, 2 novembre 2026). Mesure de départ : le dessous des bras à 1,5-2,4 mm du casier, et les pointes, recourbées par le dessin,
  // à 11-14 mm ; en vue rapprochée, 30 à 50 px d'air sous chaque bout. Retour de l'utilisateur : « elle flotte légèrement dans les airs ». Au chargement, on lit dans le
  // maillage de combien abaisser la pointe de chaque bras pour qu'elle touche (réglage POINTES_AU_SOL), et la hauteur du dessous des bras, que les essais comparent à la descente.
  let corps = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && o.material === peau && (!corps || o.geometry.attributes.position.count > corps.geometry.attributes.position.count)) corps = o; });
  const parOs = new Map(vivants.map((v) => [v.b, v])), sommetsBras = vivants.length ? [] : null, sommetsPointe = [];
  if (corps) {
    const { skinIndex: si, skinWeight: sw } = corps.geometry.attributes, osCorps = corps.skeleton.bones;
    for (let i = 0; i < si.count; i++) {
      let m = 0, d = 0; for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > m) { m = w; d = si.getComponent(i, c); } }
      const v = parOs.get(osCorps[d]); if (!v) continue;
      (sommetsBras[v.k] ||= []).push(i);
      if (v.j >= SOL.pointe) (sommetsPointe[v.k] ||= []).push(i);
    }
  }
  const w = new THREE.Vector3();
  // Le point le plus bas de ces sommets, au-dessus du dessus du casier (m), dans la pose du moment.
  const bas = new THREE.Vector3();
  function plusBas(liste) { let h = Infinity; for (const i of liste || []) { corps.getVertexPosition(i, w); corps.localToWorld(w); if (w.y - sol < h) { h = w.y - sol; bas.copy(w); } } return h; }
  function courber(k, a) { for (const v of vivants) if (v.k === k && v.j >= SOL.depuis) v.b.quaternion.copy(v.pose).multiply(q.setFromEuler(e.set(-a, 0, 0, ORDRE_BLENDER))); groupe.updateMatrixWorld(true); }
  // Pour une pose de départ (v.pose), l'angle de chaque bras qui pose sa pointe, et le dessous de bras le plus bas une fois les pointes posées.
  function poser(E) {
    groupe.scale.setScalar(E); groupe.updateMatrixWorld(true);
    const angles = new Map();
    for (let k = 0; k < sommetsPointe.length; k++) {
      courber(k, 0);
      const cible = SOL.pointe_mm / 1000 * E, h0 = plusBas(sommetsPointe[k]);
      if (!(h0 > cible)) continue;
      // Le sens de l'axe se lit aussi : « baisser » est l'angle qui fait descendre la pointe.
      courber(k, 0.1); const sens = plusBas(sommetsPointe[k]) < h0 ? 1 : -1;
      let bas = 0, haut = SOL.angle_max;
      for (let n = 0; n < 14; n++) { const a = (bas + haut) / 2; courber(k, sens * a); if (plusBas(sommetsPointe[k]) > cible && plusBas(sommetsBras[k]) > -SOL.tolerance_mm / 1000 * E) bas = a; else haut = a; }
      angles.set(k, sens * bas); courber(k, sens * bas);
    }
    let m = Infinity; for (const l of sommetsBras) m = Math.min(m, plusBas(l));
    return { angles, bras: m };
  }
  // Deux poses à poser : celle qu'elle tient vivante au repos, et la pose fixe du mouvement réduit, qui est celle de liaison. Réglée sur l'une, la pointe s'enfonçait de 8 à 10 mm
  // dans l'autre (mesure du 2 novembre). Pour chaque réglage des pointes, on garde le dessous de bras le plus bas des deux poses.
  const dessousPour = new Map();
  function etalonner(E) {
    if (!corps) return;
    const repos = actions[REPOS_SOL]; repos?.reset().play(); melangeur.update(0);
    const poseVive = new Map(vivants.map((v) => [v, v.b.quaternion.clone()]));
    for (const v of vivants) v.pose = poseVive.get(v);
    const vive = poser(E);
    melangeur.stopAllAction();
    for (const v of vivants) { v.b.quaternion.copy(v.pur); v.pose = v.pur.clone(); }
    const figee = poser(E);
    groupe.scale.setScalar(E);
    for (const t of new Set([0, 0.5, 1, POINTES_AU_SOL])) {
      let m = Infinity;
      for (const [pose, angles] of [[poseVive, vive.angles], [null, figee.angles]]) {
        for (const v of vivants) v.pose = pose ? pose.get(v) : v.pur;
        for (let k = 0; k < sommetsBras.length; k++) courber(k, (angles.get(k) || 0) * t);
        for (const l of sommetsBras) m = Math.min(m, plusBas(l));
      }
      dessousPour.set(t, m);
    }
    for (const v of vivants) {
      if (v.j >= SOL.depuis) { v.courbeVive = vive.angles.get(v.k) || 0; v.courbeFigee = figee.angles.get(v.k) || 0; }
      v.b.quaternion.copy(v.pur); delete v.pose;
    }
    groupe.scale.setScalar(1); groupe.updateMatrixWorld(true);
  }
  // De combien descendre l'objet pour que le dessous des bras soit à `mm` du casier, au réglage des pointes `t` (le plus proche de ceux étalonnés) : la mesure du contact exact.
  function descentePour(t, mm, E) {
    if (!dessousPour.size) return 0;
    const proche = [...dessousPour.keys()].reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
    const m = dessousPour.get(proche);
    return Number.isFinite(m) ? m - mm / 1000 * E : 0;
  }
  let reglage = POINTES_AU_SOL;
  function regler(t) { reglage = t; for (const v of vivants) { v.courbe = (v.courbeVive || 0) * t; v.courbeFixe = (v.courbeFigee || 0) * t; } }
  const yeux = ['oeil.G', 'oeil.D'].map((n) => ({ b: os[nomOs(n)], pur: os[nomOs(n)].quaternion.clone(), axes: new THREE.Quaternion().fromArray(catalogue.yeux_repos[n]) }));
  const bornes = catalogue.bornes_regard_degres, RAD = Math.PI / 180;

  // Le regard : un point du monde (une cible, le pointeur), en rotation locale de l'os de l'œil, bornée comme dans
  // Blender (Limit Rotation, axes X et Z). Le regard au repos, écrit dans les actions, reprend quand le poids retombe.
  const e = new THREE.Euler(), q = new THREE.Quaternion(), qp = new THREE.Quaternion(), vp = new THREE.Vector3(), vise = new THREE.Vector3(), qVise = new THREE.Quaternion();
  let poidsRegard = 0, aCible = false;
  const planPointeur = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(place.z + PLAN_POINTEUR));
  function regarder(oeil) {
    const b = oeil.b;
    b.parent.getWorldQuaternion(qp);
    b.getWorldPosition(vp);
    // La direction vers la cible, dans le repère de repos de l'œil (qui regarde vers -Y, voir pieuvre.py).
    vp.subVectors(vise, vp).normalize().applyQuaternion(qp.invert()).applyQuaternion(q.copy(oeil.axes).invert());
    const rx = THREE.MathUtils.clamp(Math.atan2(-vp.z, -vp.y), -bornes.haut * RAD, bornes.bas * RAD);
    const rz = THREE.MathUtils.clamp(Math.atan2(vp.x, -vp.y), -bornes.cote * RAD, bornes.cote * RAD);
    qVise.copy(oeil.axes).multiply(q.setFromEuler(e.set(rx, 0, rz, ORDRE_BLENDER)));
    b.quaternion.slerp(qVise, poidsRegard);
  }

  const cerveau = creerCerveau({ catalogue, jouer });
  const ombre = creerTache(groupe.position, sol), portee = creerOmbrePortee(sol);
  ombre.scale.setScalar(E);
  const lumiereDir = new THREE.Vector3(), fenetreDir = new THREE.Vector3(0, .6, -1).normalize(), couleurFond = new THREE.Color();
  // L'ombre suit la silhouette : c'est elle qui l'ancre dans la pièce. Une image sur deux suffit.
  function peindreOmbre(lampe) {
    const c = groupe.position;
    lumiereDir.copy(posLampe).sub(c).normalize().lerp(fenetreDir, 1 - lampe).normalize();
    if (lumiereDir.y < LUMIERE_MIN) { lumiereDir.y = LUMIERE_MIN; lumiereDir.normalize(); }
    portee.uProjette.uL.value.copy(lumiereDir);
    portee.plan.position.x = c.x; portee.plan.position.z = c.z; portee.uProjette.uCentre.value.set(c.x, c.z);
    const etats = [];
    groupe.traverse((o) => { if (o.isMesh) { etats.push(o, o.material, o.visible); if (o.material === coque || o === zone) o.visible = false; o.material = portee.projette; } });
    const alpha = renderer.getClearAlpha(); renderer.getClearColor(couleurFond);
    renderer.setRenderTarget(portee.cible); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(groupe, portee.camera);
    renderer.setRenderTarget(null); renderer.setClearColor(couleurFond, alpha);
    for (let i = 0; i < etats.length; i += 3) { etats[i].material = etats[i + 1]; etats[i].visible = etats[i + 2]; }
  }
  // La zone de clic : une boîte invisible, unique. Le maillage à peau se déforme : le viser à chaque image serait
  // ruineux. Il ne faut qu'une cible, stable, qui ne déborde pas sur la tasse ni les tiroirs.
  const zone = new THREE.Mesh(new THREE.BoxGeometry(...PIEUVRE.boite), new THREE.MeshBasicMaterial({ visible: false }));
  zone.position.y = PIEUVRE.boite[1] / 2; zone.userData.objet = 'pieuvre'; zone.name = 'pieuvre-zone'; groupe.add(zone);

  // La tasse du pourboire : dans le groupe dès le chargement, réduite à rien. Elle se compile donc avec le reste (aucun programme au
  // premier clic), disparaît avec la pieuvre (film, cachée) et porte son ombre.
  const tasse = new THREE.Mesh(geometrieTasse(), peau); tasse.name = 'pieuvre-tasse'; tasse.frustumCulled = false;
  tasse.scale.setScalar(RANGE); groupe.add(tasse);
  const osTasse = [6, 7].map((j) => os[nomOs(`${TASSE.os}.${j}`)]);
  const pTasse = new THREE.Vector3(), p2Tasse = new THREE.Vector3(), lacetTasse = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), PIEUVRE.lacet);
  let tailleT = 0;
  // Au bout du bras tendu, droite dans le monde quelle que soit la pente du bras, l'anse du côté de la pieuvre où elle regarde.
  function poserTasse(dt) {
    const tient = !fige && cerveau.tient() === 'tasse' && cerveau.action() === 'guide_montrer';
    // Un geste coupé (masquée, figée, autre réaction) : elle range la tasse vite, sans la laisser flotter.
    tailleT = tient ? tailleTasse(actions.guide_montrer?.time ?? 0) : Math.max(0, tailleT - dt * 6);
    tasse.visible = tailleT > 0;
    if (!tasse.visible) { tasse.scale.setScalar(RANGE); return; }
    osTasse[0].getWorldPosition(pTasse); osTasse[1].getWorldPosition(p2Tasse);
    pTasse.lerp(p2Tasse, TASSE.le_long); pTasse.y += TASSE.au_dessus * groupe.scale.y;
    tasse.position.copy(groupe.worldToLocal(pTasse));
    tasse.quaternion.copy(groupe.quaternion).invert().multiply(lacetTasse);
    tasse.scale.setScalar(Math.max(RANGE, tailleT));
  }

  // Les programmes se compilent avant d'entrer en scène : pas d'à-coup la première fois qu'elle paraît.
  await renderer.compileAsync(groupe, camera, scene);
  // Le flash : elle entrait en scène d'un coup, à sa place, sur une pièce déjà immobile. Elle y entre désormais cachée, et n'en sort que par son entrée.
  function cacher(oui) { groupe.visible = ombre.visible = portee.plan.visible = !oui; zone.layers.set(oui ? COUCHE_ABSENTE : 0); }
  cacher(true);
  scene.add(ombre); scene.add(portee.plan); scene.add(groupe); groupe.updateMatrixWorld(true);
  let temps = 0, fige = false, survol = 0, survolBut = 0, images = 0, masquee = false, ombreSale = true, bras = 0;
  // Une seule fois par chargement : ce module ne se crée qu'une fois, et entree ne repasse jamais de null à autre chose.
  etalonner(E);
  regler(POINTES_AU_SOL);
  let descente = DESCENTE_MM, abaisse = descente / 1000 * E;
  const saut = creerSaut(place.derriere, { x: place.x, y: sol - abaisse, z: place.z });
  let entree = { phase: 'attend', t: 0 }, apresEntree = null, salut = 0;
  function teinterOmbre(k) { ombre.material.opacity = OMBRE * k; const u = portee.plan.material.uniforms; u.uForce.value = OMBRE_FORCE * k; u.uContact.value = CONTACT_FORCE * k; u.uRebond.value.copy(REBOND).multiplyScalar(k); }
  function poserSaut(p) {
    groupe.position.set(p.x, p.y, p.z); groupe.scale.set(p.sx * E, p.sy * E, p.sx * E); groupe.rotation.x = p.pente; bras = p.bras;
    teinterOmbre(p.ombre); ombreSale = true;
  }
  function finirEntree({ saluer = true } = {}) {
    entree = null; poserSaut(saut.pose(saut.duree)); uCommun.uApparition.value = 1; cacher(false); groupe.updateMatrixWorld(true);
    if (!saluer) return;
    // Elle regarde le visiteur, puis lui fait signe : pendant un geste, le regard n'est plus libre, d'où cet ordre.
    vise.copy(camera.position); aCible = true; cerveau.viser(true);
    salut = fige ? 0 : REGARD_AVANT_SALUT;
    if (fige) cerveau.evenement('arrivee');
    apresEntree?.();
  }
  // La rencontre : elle reconnaît le visiteur, puis le regarde. Pas de salut ici : il viendra de son appui à lui.
  function regarderVisiteur() { vise.copy(camera.position); aCible = true; cerveau.viser(true); }
  function finirBond() { const p = entree.bond.pose(entree.bond.duree); entree = null; poserSaut({ ...p, ombre: 1 }); regarderVisiteur(); }
  function avancerEntree(dt, anime, enVue, lampe) {
    if (entree.phase === 'essai') return;
    // L'ombre reste pleine : sur place, elle ne quitte jamais le casier, contrairement au saut d'entrée qui part de derrière.
    if (entree.phase === 'bond') {
      if (!anime) { finirBond(); return; }
      entree.t += dt;
      const p = entree.bond.pose(entree.t);
      if (p.fini) finirBond(); else poserSaut({ ...p, ombre: 1 });
      return;
    }
    if (entree.phase === 'attend') {
      if (!enVue) return;
      // L'ombre compile son programme à sa première peinture, et groupe caché ne peint rien : ce blocage tombe ici, invisible, pas au décollage.
      groupe.visible = true; peindreOmbre(lampe); groupe.visible = false;
      entree = { phase: anime ? 'saut' : 'fondu', t: 0 };
      poserSaut(saut.pose(anime ? 0 : saut.duree));
      if (!anime) { uCommun.uApparition.value = 0; teinterOmbre(0); }
      cacher(false); return;
    }
    // Les animations coupées en plein vol : on ne laisse pas une pieuvre suspendue.
    if (entree.phase === 'saut' && !anime) { finirEntree(); return; }
    entree.t += dt;
    if (entree.phase === 'saut') { const p = saut.pose(entree.t); if (p.fini) finirEntree(); else poserSaut(p); return; }
    const k = entree.t / FONDU_ENTREE;
    if (k >= 1) finirEntree(); else { uCommun.uApparition.value = k; teinterOmbre(k); }
  }
  demarrer();

  function retablir() { for (const v of vivants) v.b.quaternion.copy(v.pur); for (const y of yeux) y.b.quaternion.copy(y.pur); }
  function retenir() { for (const v of vivants) v.pur.copy(v.b.quaternion); for (const y of yeux) y.pur.copy(y.b.quaternion); }
  function figer(oui) {
    if (oui === fige) return;
    fige = oui;
    // Le mixeur rend à chaque os son état d'origine en s'arrêtant : c'est cette pose fixe qu'on retient.
    if (oui) {
      retablir(); melangeur.stopAllAction(); retenir(); courante = null; poidsRegard = 0; aCible = false; ombreSale = true;
      // La pose fixe touche le casier comme la pose vivante : la pointe abaissée, sans l'onde.
      for (const v of vivants) if (v.courbeFixe) v.b.quaternion.multiply(q.setFromEuler(e.set(-v.courbeFixe, 0, 0, ORDRE_BLENDER)));
    }
    cerveau.figer(oui);
  }

  return {
    groupe, zone, os, actions, melangeur, visage, cerveau,
    get fige() { return fige; },
    // À chaque image, dans cet ordre : rétablir, décider, jouer, retoucher. Inversé, le mixeur enregistrerait comme
    // « état d'origine » un os déjà ondulé au moment où une action s'active.
    mettreAJour(dt, { anime, lampe, enVue = true, proche = 0 }) {
      // De près, le filet n'a plus rien à détacher, et il se lirait en pointillé.
      uCommun.uLisere.value = LISERE * (1 - 0.8 * proche);
      const f = email.materiau.userData.fondu;
      uCommun.tEmail.value = email.materiau.map; uCommun.tEmailSuivant.value = f?.tSuivante.value || null; uCommun.uFondu.value = f?.tSuivante.value ? f.uFondu.value : 0;
      uCommun.uLampe.value = lampe;
      survol += (survolBut - survol) * (anime ? Math.min(1, dt * 8) : 1); uCommun.uSurvol.value = survol;
      if (masquee) return;
      figer(!anime);
      // L'os n'a aucune piste : le mixeur n'y touche jamais, et la pose fixe garde le chapeau sur la tête.
      tailleChapeau += ((!fige && sansChapeau.has(cerveau.action()) ? 0 : 1) - tailleChapeau) * (anime ? Math.min(1, dt * VIF_CHAPEAU) : 1);
      osChapeau.scale.setScalar(Math.max(RANGE, tailleChapeau));
      if (entree) { avancerEntree(dt, anime, enVue, lampe); demarrer(); if (entree?.phase === 'attend') return; }
      if (fige) { if (tasse.visible) { tailleT = 0; tasse.visible = false; ombreSale = true; } if (ombreSale) { groupe.updateMatrixWorld(true); peindreOmbre(lampe); ombreSale = false; } return; }
      if (!enVue) return;
      images++;
      retablir();
      if (salut > 0 && (salut -= dt) <= 0) cerveau.evenement('arrivee');
      cerveau.pas(dt);
      melangeur.update(dt);
      retenir();
      temps += dt;
      const w = temps * Math.PI * 2 / PERIODE_ONDE;
      for (const v of vivants) {
        // La même formule que les pilotes de pieuvre.py : l'onde en hauteur ne fait que soulever, jamais enfoncer.
        const x = v.h * (0.5 + 0.5 * Math.sin(w + v.ph) + 2.4 * bras) - v.courbe, z = v.c * Math.sin(w + v.ph + O.decalage_cote);
        v.b.quaternion.multiply(q.setFromEuler(e.set(x, 0, z, ORDRE_BLENDER)));
      }
      const libre = cerveau.regardLibre() && aCible;
      poidsRegard += ((libre ? 1 : 0) - poidsRegard) * Math.min(1, dt * VIF_REGARD);
      if (poidsRegard > 1e-3) { groupe.updateMatrixWorld(true); for (const y of yeux) regarder(y); }
      // Après l'onde : la tasse suit le bras tel qu'on le voit, pas tel que le mixeur l'a laissé.
      if (tasse.visible || cerveau.tient()) { groupe.updateMatrixWorld(true); poserTasse(dt); }
      if (images % 2 === 0 || ombreSale) { groupe.updateMatrixWorld(true); peindreOmbre(lampe); ombreSale = false; }
    },
    // Le pointeur a bougé : ses yeux vont à l'objet survolé, sinon là où pointe le visiteur. Le sommeil compte ce geste.
    pointeur(rayon, cible, surElle) {
      survolBut = surElle ? 1 : 0;
      // Rayon absent : le pointeur a quitté la pièce.
      if (!rayon) return;
      cerveau.activite();
      if (fige) return;
      if (cible) vise.copy(cible);
      else if (!rayon.intersectPlane(planPointeur, vise)) return;
      aCible = true; cerveau.viser(true);
    },
    // La rencontre (js/pieuvre-bulle.js) : un petit bond, puis le regard vers le visiteur. Faux : elle n'a pas pu (entrée en cours, cachée, ou figée en
    // mouvement réduit, où seul le regard est permis : il ne bouge rien que ses yeux, et la pose fixe les tient).
    sautiller() {
      if (masquee || entree || fige) return false;
      // Le bond prend la place du salut d'arrivée, encore en attente ou déjà parti : un geste à la réception, le regard ne serait plus libre.
      salut = 0; cerveau.calmer({ salut: true });
      const ici = { x: groupe.position.x, y: groupe.position.y, z: groupe.position.z };
      entree = { phase: 'bond', t: 0, bond: creerSaut(ici, ici, { bond: BOND_SUR_PLACE }) };
      demarrer(); return true;
    },
    regarderVisiteur() { if (masquee || entree || fige) return false; cerveau.calmer({ salut: true }); regarderVisiteur(); demarrer(); return true; },
    // Pendant son entrée, elle ne réagit à rien : le salut vient à la réception, et elle n'a pas à ouvrir un parapluie derrière le casier.
    evenement(ev) { if (masquee || entree) return; cerveau.evenement(ev); demarrer(); },
    // Hors de la pièce, pour un temps (le film du café) : ni corps, ni ombre, ni zone de clic, ni cerveau. La couche
    // écarte la zone du lancer de toucher(), que « visible » n'arrête pas. Au retour, elle est au repos, coiffée.
    masquer(oui) {
      if (oui === masquee) return;
      // Le film du café peut partir pendant son entrée : elle reviendra à sa place, sans rejouer le saut.
      if (oui && entree) finirEntree({ saluer: false });
      masquee = oui; cacher(oui);
      if (!oui && !fige) { figer(true); figer(false); tailleChapeau = 1; osChapeau.scale.setScalar(1); }
      ombreSale = true;
      demarrer();
    },
    maillageChapeau,
    // Un clic sur elle : elle salue ; la bulle remplace clic() pour s'ouvrir aussi. Le choix du couvre-chef reste pour la prochaine visite.
    changerChapeau() { porter(CHAPEAUX[(CHAPEAUX.findIndex(([c]) => c === chapeau) + 1) % CHAPEAUX.length][0], { garder: true }); ombreSale = true; demarrer(); },
    // La liste et le choix direct, pour la bulle (js/pieuvre-bulle.js) : c'est là que le visiteur choisit.
    chapeaux: CHAPEAUX.map(([id, court, phrase]) => ({ id, court, phrase })),
    choisirChapeau(n) { porter(n, { garder: true }); ombreSale = true; demarrer(); },
    clic() { this.changerChapeau(); this.evenement('caresse'); },
    surChapeau(fn) { surChapeau = fn; porter(chapeau); },
    chapeau: () => chapeau,
    ambiance(a) { cerveau.ambiance(a); },
    // Pour les essais : la part de sa cible d'ombre qui est peinte, et celle du contact.
    couvertureOmbre() {
      const px = new Uint8Array(4 * OMBRE_PX * OMBRE_PX); renderer.readRenderTargetPixels(portee.cible, 0, 0, OMBRE_PX, OMBRE_PX, px);
      let ombre = 0, contact = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 8) ombre++; if (px[i + 1] > 128) contact++; }
      const n = OMBRE_PX * OMBRE_PX; return { ombre: ombre / n, contact: contact / n };
    },
    // Une cible de doigt tient 44 px même là où elle n'en mesure que 30 : seule sa zone grandit, jamais elle. À appeler quand le format change, au doigt seulement.
    ajusterZone(cam, L, H) {
      zone.scale.set(1, 1, 1); zone.position.y = PIEUVRE.boite[1] / 2; zone.updateMatrixWorld(true);
      // Plusieurs passes : vue de biais, la boîte ne grandit pas à l'écran dans la proportion de son échelle.
      let sx = 1, sy = 1;
      for (let i = 0; i < 3; i++) {
        const r = this.rectangle(cam, L, H);
        sx *= Math.max(1, ZONE_MINI / (r.droite - r.gauche)); sy *= Math.max(1, ZONE_MINI / (r.bas - r.haut));
        zone.scale.set(sx, sy, sx); zone.position.y = PIEUVRE.boite[1] * sy / 2; zone.updateMatrixWorld(true);
      }
    },
    // Pour les essais : la tasse du pourboire à l'écran, null tant qu'elle est rangée.
    rectTasse(cam, L, H) { if (!tasse.visible) return null; tasse.updateMatrixWorld(true); return this.rectangle(cam, L, H, new THREE.Box3().setFromObject(tasse)); },
    // Pour les essais : ce qui joue, et la zone de clic à l'écran.
    // Sa silhouette à l'écran, pas sa cible : au doigt, la cible déborde exprès, et rien ne doit s'écarter de ce débord.
    silhouette(cam, L, H) {
      const [l, h, p] = PIEUVRE.boite, c = groupe.position;
      return this.rectangle(cam, L, H, new THREE.Box3(new THREE.Vector3(c.x - l * E / 2, c.y, c.z - p * E / 2), new THREE.Vector3(c.x + l * E / 2, c.y + h * E, c.z + p * E / 2)));
    },
    rectangle(cam, L, H, boite) {
      const b = boite || new THREE.Box3().setFromObject(zone), r = { gauche: Infinity, droite: -Infinity, haut: Infinity, bas: -Infinity }, p = new THREE.Vector3();
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        p.set(x, y, z).project(cam); const X = (p.x * .5 + .5) * L, Y = (-p.y * .5 + .5) * H;
        r.gauche = Math.min(r.gauche, X); r.droite = Math.max(r.droite, X); r.haut = Math.min(r.haut, Y); r.bas = Math.max(r.bas, Y);
      }
      return r;
    },
    // Pour les essais : sous le point le plus bas de chaque bras, ce que la cible d'ombre a peint de contact (0 à 255), relu dans la cible elle-même. Les pointes gardent
    // leur boucle : c'est le dessous du bras qui touche.
    contactSous() {
      groupe.updateMatrixWorld(true); peindreOmbre(uCommun.uLampe.value);
      // Cinq texels de côté, 2,7 mm de part et d'autre : la pointe est fine, son point le plus bas tombe au bord de ce qu'elle peint.
      const px = new Uint8Array(4 * 25), C = portee.uProjette.uCentre.value, cote = portee.uProjette.uCote.value;
      return sommetsBras.map((l) => {
        plusBas(l);
        const u = Math.round(((bas.x - C.x) / cote + 0.5) * OMBRE_PX), v = Math.round(((bas.z - C.y) / cote + 0.5) * OMBRE_PX);
        renderer.readRenderTargetPixels(portee.cible, Math.max(0, u - 2), Math.max(0, v - 2), 5, 5, px);
        let m = 0; for (let i = 1; i < px.length; i += 4) m = Math.max(m, px[i]);
        return m;
      });
    },
    // Pour les essais : par bras, le point le plus bas du bras et de sa pointe au-dessus du casier (m), dans la pose affichée, et ce qu'a réglé l'étalonnage.
    // Pour les captures de goût : le même réglage, à la volée.
    // Pour les captures de goût : l'ombre de contact, à la volée (force, hauteur de contact en m, flou).
    reglerOmbre({ force, haut, flou } = {}) { const u = portee.plan.material.uniforms; if (force != null) u.uContact.value = force; if (flou != null) u.uFlou.value = flou; if (haut != null) portee.uProjette.uContactHaut.value = haut; ombreSale = true; demarrer(); },
    // Pour les captures de goût : la hauteur sous les bras, à la volée ; posée, elle se place tout de suite.
    reglerDescente(mm) { descente = mm; abaisse = mm / 1000 * E; if (!entree) { groupe.position.y = sol - abaisse; groupe.updateMatrixWorld(true); ombreSale = true; demarrer(); } },
    reglerPointes(t) { regler(t); if (fige) { retablir(); for (const v of vivants) if (v.courbeFixe) v.b.quaternion.multiply(q.setFromEuler(e.set(-v.courbeFixe, 0, 0, ORDRE_BLENDER))); } ombreSale = true; demarrer(); },
    hauteurs() { groupe.updateMatrixWorld(true); return { points: sommetsBras.map((l) => { plusBas(l); return bas.toArray(); }), bras: sommetsBras.map(plusBas), pointes: sommetsPointe.map(plusBas), abaisse, reglage, descente, contact: descentePour(reglage, 0, 1) * 1000, courbes: vivants.filter((v) => v.courbe).map((v) => +v.courbe.toFixed(3)), fixes: vivants.filter((v) => v.courbeFixe).map((v) => +v.courbeFixe.toFixed(3)) }; },
    // fn est appelée une fois arrivée, tout de suite si elle l'est déjà.
    surEntree(fn) { if (entree) apresEntree = fn; else fn(); },
    // Pour les essais : les réglages de sa matière.
    uniformes: uCommun,
    // Pour les essais : une pose du saut, tenue ; null la relâche, à sa place.
    tenirSaut(t) { if (t === null) { finirEntree({ saluer: false }); return; } entree = { phase: 'essai', t }; poserSaut(saut.pose(t)); cacher(false); peindreOmbre(1); demarrer(); },
    get dureeSaut() { return saut.duree; },
    etat() { return { ...cerveau.etat(), tasse: +tailleT.toFixed(3), entree: entree?.phase ?? null, apparition: uCommun.uApparition.value, chapeau, fige, images, poidsRegard: +poidsRegard.toFixed(3), onde: +temps.toFixed(3) }; },
  };
}
