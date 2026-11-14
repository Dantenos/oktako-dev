// Scène de l'atelier : la pièce cuite dans Blender (lumière globale, occlusion et reflets déjà calculés, voir
// tools/blender/atelier.py), la ville sous la pluie derrière la vitre, la caméra et la sélection d'objets.
// Le navigateur n'éclaire plus rien : il affiche des textures et anime ce qui vit (écrans, pluie, vapeur, lampe).
// Le rendu est un bonus : toute la navigation et le contenu vivent dans le HTML (app.js) et survivent à une erreur
// de chargement ou à une perte de contexte WebGL.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { couleur } from './couleurs.js';
import * as T from './textures.js';
import * as O from './objets.js';
import { chargerAtelier, chargerJeu, fondre } from './modele.js';
import { creerCiel } from './meteo.js';
import { materiauVitre, pluieDehors } from './verre.js';
import { creerVille, azimutElevation } from './ville.js';
import { creerCafe } from './cafe.js';
import { creerSucre, SUCRE } from './sucre.js';
import { creerFiche } from './fiche.js';
import { creerPenseBete } from './pensebete.js';
import { creerConsole } from './console-poche.js';
import { creerCadres } from './cadres.js';
import { creerObjectifs } from './objectifs.js';

// La carte « Toutes mes compétences » est cuite à plat devant la tasse comme un objet à part (lot ciel-vivant) :
// elle se vise et s'ouvre sans recuisson. La fiche « Mon parcours » n'est pas cuite du tout : décalcomanie en temps
// réel posée à gauche de la tasse (fiche.js).
const OBJETS = ['ecran', 'dossiers', 'carnet', 'terminal', 'lettre', 'appareil', 'competences', 'parcours', 'radio', 'console', 'tiroir:objectifs', 'tiroir:objectifs2', 'tiroir:secret', 'tiroir:surprise'];
// Hauteur de champ d'accueil, en paysage : le format 16:9 voit juste les quatre zones ; plus étroit, on élargit le champ plutôt
// que de couper la lettre et la lampe aux bords.
const FORMAT_REFERENCE = 16 / 9;
// Le café cuit (tools/blender/atelier.py, « tasse_cafe ») : cylindre de 35,5 mm de rayon dont le dessus est à 75 mm
// du pied de la tasse ; le bord de la tasse culmine à 93 mm, 42 mm de rayon. Le café vivant se pose 0,4 mm au-dessus.
const CAFE = { rayon: 0.0355, dessus: 0.075, ecart: 0.0004, bord: 0.093, rayonBord: 0.042 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Plongée : part du trajet consacrée à l'approche ; le reste est la poussée à travers le verre.
const SEUIL = 0.78;
// Grain de pellicule (amplitude dans les demi-teintes) ; « Animations » coupé, il s'arrête avec le reste.
const GRAIN = 0.045;
// Part de la vue occupée par la dalle du tube : au seuil, puis une fois entré. La bordure du terminal
// reste visible autour du bureau Rouille, cadré dans son tube plutôt qu'étalé bord à bord.
const REMPLI = { seuil: 0.5, arrivee: 0.86 };
// Regarder autour de soi, borné (retour de l'utilisateur, 29/10 : tourné vers le coin du mur et le plafond, il a cru le
// site cassé). Lacet de part et d'autre, tangage vers le haut et vers le bas (radians) : aux bornes, le bureau occupe
// encore au moins PART_BUREAU de l'image, en paysage comme en portrait (verifierRegard, tests/regard.mjs). Mesuré le
// 29/10 : 55 % au centre en paysage, 33 % en portrait ; aux bornes, 15 % au pire (portrait, à gauche, où l'établi
// s'arrête plus tôt) ; les anciennes bornes (±1,12 ; ±0,5) tombaient à 0 %. Vers le haut, la borne est une ellipse :
// 0,22 rad en regardant droit devant (la lune passe sous la barre du menu, ~150 px plus bas à 1280 × 900), 0,12 sur
// les côtés, où l'établi s'arrête plus tôt.
// En portrait, la vue large du 30/10 voit tout le bureau, mais son regard reste plus court : plus bas, elle ne verrait que le sol.
const BORNES = { paysage: { lacet: 0.6, haut: 0.12, hautCentre: 0.22, bas: 0.32 }, portrait: { lacet: 0.42, haut: 0.12, hautCentre: 0.22, bas: 0.16 } };
let REGARD = BORNES.paysage;
const PART_BUREAU = 0.15;
// D'où l'on regarde le caisson : devant le bureau, un peu à gauche et à hauteur du plateau (coordonnées three.js, normé).
const DIR_CAISSON = new THREE.Vector3(-0.3, 0.42, 0.86).normalize();
// Le caisson tombe à droite, hors du cadre d'entrée : son appel longe le bord du plateau jusqu'à cette limite de l'image (−1 à 1), pour rester à l'écran.
const BORD_APPEL = 0.84;
const hautMax = (x) => REGARD.haut + (REGARD.hautCentre - REGARD.haut) * (1 - Math.min(1, Math.abs(x) / REGARD.lacet));
// Sans geste pendant RETOUR ms, la vue revient doucement au bureau (d'un coup en mouvement réduit).
const RETOUR = 4500;
// La mini-pieuvre se charge passé ce délai après la première image (ms), une fois l'entrée jouée.
const DELAI_PIEUVRE = 4000;
// Ce qu'il faut garder libre autour de son centre (mètres) : ses bras posés, et son bras tendu quand elle montre la lettre.
const EMPRISE_PIEUVRE = 0.075;
// Où elle attend, cachée, par rapport à sa place et à l'arrière du casier (m). tests/pieuvre-saut.mjs reprend ces deux valeurs.
const DERRIERE_PIEUVRE = { x: 0.08, y: 0.06, z: 0.15 };
// Sur téléphone, à sa taille d'ordinateur, elle tenait 27 × 20 px : assez grande pour se voir et se toucher, pas au point de manger l'appareil photo.
const ECHELLE_TEL_PIEUVRE = 1.35;
// Sa hauteur (m) et l'approche : distance à elle, hausse du regard, et de quelle part de l'image elle s'écarte du centre pour laisser la place à la bulle.
const PIEUVRE_HAUT = 0.09;
const PIEUVRE_ZOOM = { distance: 0.36, debout: 0.62, hausse: 0.2, vers_la_gauche: 0.2, vers_le_haut: 0.28, echelle: (d) => (d === 'portrait' ? ECHELLE_TEL_PIEUVRE : 1) };
// Une butée arrête l'élan du glisser : sinon la vitesse restante continue de pousser contre la borne et une flèche vers
// le centre semble sans effet le temps que l'inertie s'éteigne.
const borner = (r) => {
  const x = THREE.MathUtils.clamp(r.x, -REGARD.lacet, REGARD.lacet), y = THREE.MathUtils.clamp(r.y, -REGARD.bas, hautMax(x));
  if (x !== r.x) r.vx = 0; if (y !== r.y) r.vy = 0; r.x = x; r.y = y;
};

// ciel : l'état initial du ciel (js/ciel.js) ; seul le jeu de textures de son ambiance se télécharge ici.
export async function creerScene({ conteneur, contenu, rappels, ciel: cielInitial }) {
  // Un tableau muni d'un lien se vise comme un objet ; la tasse aussi, mais on plonge dedans au lieu d'ouvrir une rubrique.
  const INTERACTIFS = [...OBJETS, ...(contenu.cadres || []).filter((c) => c.lien).map((c) => 'cadre:' + c.id)];
  const CLIQUABLES = [...INTERACTIFS, 'tasse'];
  // Ceux vers qui la caméra va vraiment : un tableau ouvre son lien, le tiroir des objectifs et la console ont leur plongée.
  const CADRABLES = [...INTERACTIFS.filter((id) => !/^tiroir:objectifs|^cadre:|^console$/.test(id)), 'caisson'];
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  const telephone = Math.min(innerWidth, innerHeight) < 600 || matchMedia('(pointer: coarse)').matches;
  // Résolution adaptative : moins de pixels sur téléphone, où la densité d'écran coûte cher.
  const dprMax = telephone ? 1.5 : 2;
  // Trois niveaux de qualité. On démarre au plus haut et on descend si les images sont trop lentes
  // (jamais l'inverse : remonter ferait osciller la qualité sous les yeux du visiteur).
  // ?qualite=haute|moyenne|basse fige le niveau (utile pour comparer, ou sur une machine capricieuse).
  const NIVEAUX = {
    haute: { dpr: dprMax, bloom: true, flou: true },
    moyenne: { dpr: Math.min(1.25, dprMax), bloom: true, flou: false },
    basse: { dpr: telephone ? 0.75 : 0.85, bloom: false, flou: false },
  };
  const ORDRE = ['haute', 'moyenne', 'basse'];
  const parametres = new URLSearchParams(location.search);
  const demande = parametres.get('qualite');
  const qualiteFixe = ORDRE.includes(demande) ? demande : null;
  const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  const logiciel = debug && /swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  let niveau = qualiteFixe || (logiciel || telephone ? 'basse' : 'haute');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, NIVEAUX[niveau].dpr));
  // Les textures cuites portent déjà la courbe filmique de Blender (AgX) : aucun tone mapping ici, sinon on la
  // jouerait deux fois.
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-describedby', 'scene-description');
  canvas.setAttribute('aria-label', "L'atelier MajorTakito, la nuit, après la pluie");
  conteneur.appendChild(canvas);

  // Le téléphone (et ?textures=legeres) reçoit les textures à demi-résolution : quatre fois moins d'octets.
  const leger = telephone || parametres.get('textures') === 'legeres';
  const baseModele = new URL('modele/', document.baseURI).href;
  const atelier = await chargerAtelier(baseModele, { leger, ambiance: cielInitial?.ambiance || 'nuit' });
  const D = atelier.desc;

  const scene = new THREE.Scene();
  scene.background = couleur('--mt-scene-ecran');
  const camera = new THREE.PerspectiveCamera(D.camera.fov, 1, 0.01, 60);
  const cible = new THREE.Vector3();

  // --- La pièce : un maillage par atlas pour le décor, un groupe par objet qu'on peut viser ---
  const statiques = new THREE.Group(); scene.add(statiques);
  const groupes = {}, rabats = [];
  for (const m of atelier.maillages) {
    const id = m.userData.objet;
    if (!id) { statiques.add(m); continue; }
    // Le rabat de la lettre : il se vise et s'ouvre comme la lettre, mais tourne à part (il s'entrouvre au survol).
    const rabat = id === 'lettre:rabat';
    if (rabat) rabats.push(m);
    const cle = rabat ? 'lettre' : id.replace(/^decor:/, '');
    // Chaque objet interactif a sa propre matière : le survol la réchauffe sans toucher les autres.
    if (CLIQUABLES.includes(cle)) m.material = fondre(m.material.clone());
    m.userData.objet = CLIQUABLES.includes(cle) ? cle : null;
    (groupes[cle] ??= new THREE.Group()).add(m);
  }
  for (const g of Object.values(groupes)) scene.add(g);
  scene.updateMatrixWorld(true);
  const boiteDe = (o) => new THREE.Box3().setFromObject(o);
  // Les tableaux : une image du contenu, multipliée par la lumière cuite de leur feuille (cadres.js).
  const cadres = creerCadres({ groupes, reperes: D.cadres || {}, cadres: contenu.cadres || [], base: document.baseURI, demarrer: () => demarrer(), telephone });
  // Les deux feuilles du tiroir surprise sont des tableaux qui glissent : elles suivent le tiroir, et un clic sur elles est un clic sur lui.
  for (const k of ['cadre:surprise-0', 'cadre:surprise-1']) if (groupes[k]) { groupes[k].traverse((m) => { m.userData.objet = 'tiroir:surprise'; }); groupes['tiroir:surprise'].add(groupes[k]); }
  // La fiche « Mon parcours » : posée sur l'établi cuit, éclairée par la cuisson (fiche.js). Elle rejoint les objets
  // qu'on vise, survole, ouvre, et dont la caméra ne traverse jamais la boîte.
  const fiche = creerFiche({ scene, sol: statiques, carte: groupes.competences, contenu: contenu.parcours, posLampe: new THREE.Vector3().fromArray(D.lampe) });
  groupes.parcours = fiche.groupe;
  // Le pense-bête de l'écran recouvert du nom du jeu, DOONT (pensebete.js) : décalcomanie sur le papillon cuit.
  const penseBete = creerPenseBete({ scene, statiques });
  // La console de poche « Takito SYSTEM », au coin avant gauche du plateau (console-poche.js) : comme la fiche, rien n'est
  // cuit ; elle rejoint les objets qu'on vise et survole. Son verre reçoit le reflet de la pièce une fois le café prêt.
  const consolePoche = creerConsole({ scene, sol: [statiques, ...Object.values(groupes)], carnet: groupes.carnet, posLampe: new THREE.Vector3().fromArray(D.lampe), env: null });
  groupes.console = consolePoche.groupe;
  let relaisConsole = 1, minuteConsole = Math.floor(Date.now() / 60000);

  // --- Surfaces vivantes : l'écran « Qui suis-je » et le tube Rouille, posés sur les cadres exportés ---
  function surface(cadre, materiau, parent) {
    const m = new THREE.Mesh(O.tubeCathodique(cadre.largeur, cadre.hauteur, cadre.bombe), materiau);
    const x = new THREE.Vector3().fromArray(cadre.droite), y = new THREE.Vector3().fromArray(cadre.haut), z = new THREE.Vector3().fromArray(cadre.normale);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    m.position.fromArray(cadre.centre);
    parent.add(m); m.updateMatrixWorld(true);
    return m;
  }
  // L'écran porte l'heure locale du visiteur (l'horloge de la pièce), redessinée à chaque minute.
  let heureEcran = cielInitial?.heure || '';
  const texEcran = T.ecran(contenu.site, true, heureEcran);
  const ecransRepos = [texEcran, T.ecran(contenu.site, false, heureEcran)];
  const materiauEcran = O.materiauEcran(texEcran);
  // Sans tone mapping, le gain d'origine (pensé pour ACES) brûlerait la page : on le tempère.
  materiauEcran.uniforms.uLueur.value = 0.72;
  const dalleEcran = surface(D.vivants.dalle_ecran, materiauEcran, groupes.ecran);
  dalleEcran.userData.objet = 'ecran';
  const texTerminal = T.terminal();
  const dalleTerminal = surface(D.vivants.dalle_terminal, O.materiauTube(texTerminal), groupes.terminal);
  dalleTerminal.userData.objet = 'terminal';
  dalleTerminal.layers.enable(2);
  const cadreTerminal = D.vivants.dalle_terminal;

  // Ce que chaque objet interactif expose : son groupe, son point accessible, son centre et sa distance de cadrage.
  const objets = {};
  for (const id of INTERACTIFS) {
    const g = groupes[id], b = boiteDe(g), c = b.getCenter(new THREE.Vector3()), t = b.getSize(new THREE.Vector3());
    // La pastille de la lettre se pose SUR l'enveloppe (retour de l'utilisateur, 28/10), celles des cartes à plat sur la
    // carte (au-dessus, elles flotteraient devant le clavier) ; les autres, au-dessus de l'objet.
    // Celle d'un tiroir, sur sa façade, à côté de la tirette (Blender la donne : son corps se cache dans le caisson) ; celle d'un
    // tableau, au milieu de l'image.
    // Les tiroirs à clé et à surprise se regardent ouverts, de haut : le rebord de leur façade cacherait ce qu'ils gardent.
    const R = id.startsWith('tiroir:') ? D.tiroirs[id.split(':')[1]] : null;
    if (R?.cle) c.fromArray(R.cle).addScaledVector(new THREE.Vector3().fromArray(R.axe), R.course);
    const ancre = R ? new THREE.Vector3().fromArray(R.facade) : id.startsWith('cadre:') ? c.clone() : ['lettre', 'competences', 'parcours'].includes(id) ? c.clone() : new THREE.Vector3(c.x, b.max.y + 0.035, c.z);
    objets[id] = { groupe: g, ancre, centre: c, distance: id === 'tiroir:secret' ? 0.6 : id === 'tiroir:surprise' ? 0.5 : Math.max(0.36, Math.hypot(t.x, t.y, t.z) * 1.15), angle: id === 'terminal' ? 0.3 : id === 'tiroir:secret' ? 1.15 : id === 'tiroir:surprise' ? 1.0 : 0.45 };
  }
  // Le caisson n'est pas dans la vue d'entrée : son appel se pose sur le bord du plateau, juste au-dessus des deux tiroirs.
  const centreCaisson = new THREE.Vector3().fromArray(D.caisson.centre);
  objets.caisson = { groupe: statiques, ancre: new THREE.Vector3().fromArray(D.caisson.bord) };
  objets.fisheye = { groupe: groupes['tiroir:secret'], ancre: new THREE.Vector3().fromArray(D.tiroirs.secret.fisheye) };
  objets.terminal.ecran = dalleTerminal; objets.terminal.tex = texTerminal;
  // Charnière du rabat de la lettre (exportée par Blender) : le rabat tourne autour, ses matrices d'origine gardées.
  const charniere = D.charniere_lettre && rabats.length ? (() => {
    const p = new THREE.Vector3().fromArray(D.charniere_lettre.point), axe = new THREE.Vector3().fromArray(D.charniere_lettre.axe).normalize();
    return { aller: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), retour: new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z), axe, angle: 0,
      bases: rabats.map((m) => m.matrix.clone()), rot: new THREE.Matrix4() };
  })() : null;
  function ouvrirRabat(h) {
    // Entrouvert de 24° au plus, la pointe et son cachet vers le visiteur.
    const a = -h * 0.42; if (!charniere || Math.abs(a - charniere.angle) < 1e-4) return;
    charniere.angle = a; charniere.rot.makeRotationAxis(charniere.axe, a);
    rabats.forEach((m, i) => { m.matrix.copy(charniere.aller).multiply(charniere.rot).multiply(charniere.retour).multiply(charniere.bases[i]); m.matrixWorldNeedsUpdate = true; });
  }
  // La tasse : son point accessible sur le grès, à mi-hauteur côté visiteur (au-dessus du bord, il tombait sur le tiroir derrière elle), et le centre de son café.
  const boiteTasse = boiteDe(groupes.tasse);
  const posCafe = new THREE.Vector3(D.tasse[0], D.tasse[1] + CAFE.dessus + CAFE.ecart, D.tasse[2]);
  objets.tasse = { groupe: groupes.tasse, ancre: new THREE.Vector3(posCafe.x, (boiteTasse.min.y + boiteTasse.max.y) / 2, posCafe.z + CAFE.rayonBord) };

  // --- Dehors (couche 1) : la ville en trois dimensions (tools/blender/ville.py), la pluie qui tombe, vus à travers la vitre ---
  const DEHORS = 1;
  const de = D.dehors;
  // Le plan du dehors à 12 m ne porte plus la ville (une image plate, juste depuis un seul point : elle glissait dès que
  // la caméra bougeait). Il reste un repère invisible : guirlandes et banderole s'accrochent au-dessus de la place à
  // cette distance, et la mire des essais de la vitre s'y pose.
  const loin = new THREE.Mesh(new THREE.PlaneGeometry(de.largeur, de.hauteur), new THREE.MeshBasicMaterial({ fog: false }));
  loin.position.fromArray(de.centre); loin.lookAt(new THREE.Vector3().fromArray(de.centre).add(new THREE.Vector3().fromArray(de.normale)));
  loin.layers.set(DEHORS); loin.visible = false; scene.add(loin); loin.updateMatrixWorld(true);
  const texDoux = T.pointDoux();
  const ville = creerVille({ ville: atelier.ville, atlas: atelier.dehors, texDoux, couche: DEHORS });
  scene.add(ville.groupe);
  const pluie = pluieDehors(telephone ? 500 : 1100); pluie.layers.set(DEHORS);
  pluie.material.uniforms.uCouleur.value = couleur('--mt-scene-ville').multiplyScalar(0.3); scene.add(pluie);
  const cibleDehors = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.LinearSRGBColorSpace });
  const vitreMat = materiauVitre(cibleDehors);
  // Ville nette : un léger voile de buée seulement (la cuisson du dehors n'a plus de flou de mise au point).
  vitreMat.uniforms.uTeinte.value = couleur('--mt-scene-ciel-bas'); vitreMat.uniforms.uFlou.value = 0.45;
  const vitre = new THREE.Mesh(new THREE.PlaneGeometry(D.vitre.largeur, D.vitre.hauteur), vitreMat);
  vitre.position.fromArray(D.vitre.centre); scene.add(vitre);

  // --- Effets vivants, par-dessus la lumière cuite ---
  const lampeCouleur = couleur('--mt-scene-lampe');
  const halo = (couleurHalo, taille, opacite) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texDoux, color: couleurHalo, transparent: true, opacity: opacite, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(taille); scene.add(s); return s;
  };
  // L'ampoule : un halo qui respire et vacille à peine, comme un filament sur un vieux secteur.
  const posLampe = new THREE.Vector3().fromArray(D.lampe);
  const haloLampe = halo(lampeCouleur, 0.32, 0.22); haloLampe.position.copy(posLampe);
  const coeurLampe = halo(new THREE.Color(1, 0.93, 0.8), 0.08, 0.55); coeurLampe.position.copy(posLampe);
  // Lueurs des écrans sur ce qui les entoure : un voile additif devant chaque tube.
  const lueurDevant = (dalle, couleurLueur, taille, opacite) => {
    const s = halo(couleurLueur, taille, opacite); s.position.copy(dalle.localToWorld(new THREE.Vector3(0, 0, 0.03))); return s;
  };
  const lueurEcran = lueurDevant(dalleEcran, couleur('--mt-scene-ambre'), 0.5, 0.08);
  const lueurTerminal = lueurDevant(dalleTerminal, couleur('--mt-scene-ambre'), 0.32, 0.05);
  // Poussière dans le faisceau de la lampe.
  const nP = telephone ? 50 : 120, pp = new Float32Array(nP * 3);
  for (let i = 0; i < nP; i++) pp.set([(Math.random() - 0.5) * 0.36, -Math.random() * 0.34, (Math.random() - 0.5) * 0.3], i * 3);
  const poussiereGeo = new THREE.BufferGeometry(); poussiereGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const poussiere = new THREE.Points(poussiereGeo, new THREE.PointsMaterial({ map: texDoux, size: 0.005, color: lampeCouleur, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  poussiere.position.copy(posLampe); scene.add(poussiere);
  // Le ciel vivant : ville de l'ambiance, météo, dates (meteo.js). Il prend la place de la matière simple du dehors.
  const ciel = creerCiel({ scene, D, atelier, ville, loin, telephone, texDoux, DEHORS });
  // La pièce répond au ciel : lampe allumée ou non, écran plus lumineux la nuit, vapeur plus visible en hiver.
  const piece = { lampe: 1, ecran: 1, vapeur: 1, cible: { lampe: 1, ecran: 1, vapeur: 1 } };
  let etatCiel = null, eclairCourant = 0, demandeCiel = 0;
  // Vapeur du café : quelques volutes douces qui montent et s'effacent.
  const posTasse = new THREE.Vector3().fromArray(D.tasse);
  const vapeurs = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texDoux, color: couleur('--mt-scene-papier'), transparent: true, opacity: 0, depthWrite: false }));
    sp.userData.phase = i / 8; scene.add(sp); vapeurs.push(sp);
  }
  // Le café vivant : miroir de la pièce, ondes et mousse (cafe.js). Le reflet est capturé depuis la tasse, sans
  // elle, sans sa vapeur ni la vitre (qui lit un rendu à l'échelle de l'écran).
  let sucre = null, vitrines = {}, pieuvre = null;
  // La console lit ce cube : la masquer pendant sa capture évite de lire la texture en train d’être écrite.
  const cafe = creerCafe({ renderer, scene, centre: posCafe, rayon: CAFE.rayon, posLampe, telephone,
    cafe: couleur('--mt-scene-ecran').multiplyScalar(0.35), creme: couleur('--mt-scene-papier'),
    masquer: () => [groupes.tasse, groupes.console, vitre, ...vapeurs, ...(sucre ? sucre.masques : []), ...Object.values(vitrines).flatMap((v) => v.verres)] });
  consolePoche.reflets(cafe.env);
  // Le sucre (sucre.js), posé sur l'établi cuit : sa hauteur est le point le plus haut sous ses quatre coins et son
  // centre (jamais dans le papier ni le bois), sa lumière la texture cuite lue sous son centre.
  const solSucre = (() => {
    const r = new THREE.Raycaster(), bas = new THREE.Vector3(0, -1, 0), demi = Math.hypot(SUCRE.largeur, SUCRE.profondeur) / 2;
    let y = -Infinity, centre = null;
    for (const [dx, dz] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      r.set(new THREE.Vector3(D.tasse[0] + SUCRE.decalage[0] + dx * demi, 0.5, D.tasse[2] + SUCRE.decalage[1] + dz * demi), bas);
      const h = r.intersectObject(statiques, true)[0]; if (!h) continue;
      y = Math.max(y, h.point.y); if (!dx && !dz) centre = h;
    }
    // La référence du blanc : l'émail de la tasse cuite, sous la même lumière, lu côté sucre sur le dessus du bord
    // (une face tournée vers le ciel, comme le dessus du sucre) et sur la paroi qui le regarde (comme ses côtés).
    const vers = new THREE.Vector3(SUCRE.decalage[0], 0, SUCRE.decalage[1]).normalize();
    r.set(new THREE.Vector3(D.tasse[0] + vers.x * 0.04, 0.5, D.tasse[2] + vers.z * 0.04), bas);
    const haut = r.intersectObject(groupes.tasse, true)[0];
    r.set(new THREE.Vector3(D.tasse[0] + SUCRE.decalage[0], 0.03, D.tasse[2] + SUCRE.decalage[1]), vers.clone().negate());
    const cote = r.intersectObject(groupes.tasse, true)[0];
    return { y, uv: centre.uv, materiau: centre.object.material, email: { haut: haut.uv, cote: cote.uv, materiau: haut.object.material } };
  })();
  sucre = creerSucre({ scene, centre: posCafe, rayon: CAFE.rayon, bord: D.tasse[1] + CAFE.bord, rayonBord: CAFE.rayonBord, sol: solSucre, posLampe, env: cafe.env, goutte: cafe.goutte, telephone });
  // Au bureau, le sucre fait partie de la tasse : le viser, c'est viser la tasse.
  sucre.maillage.userData.objet = 'tasse';

  // Les objectifs du tiroir (objectifs.js) : leurs verres glissent avec lui et reflètent la pièce capturée pour le café.
  for (const [id, cle] of [['tiroir:objectifs', 'objectifs'], ['tiroir:objectifs2', 'objectifs2']]) vitrines[id] = creerObjectifs({ parent: groupes[id], reperes: D.tiroirs[cle].objectifs, liste: contenu[cle] || [], env: cafe.env, base: document.baseURI, demarrer: () => demarrer(), mouvementReduit: () => reglages.mouvementReduit });
  // Les quatre zones du bureau : un mot posé devant chacune, au ras du plateau (content/scene.json).
  const zones = (contenu.scene.zones || []).map((z) => {
    const b = new THREE.Box3(); for (const id of z.objets) if (groupes[id]) b.expandByObject(groupes[id]);
    const c = b.getCenter(new THREE.Vector3());
    return { id: z.id, ancre: new THREE.Vector3(c.x, 0.004, b.max.z + 0.012) };
  });
  // --- Post-traitement : halo des sources, profondeur de champ, puis voile ambré, vignette et grain filmique ---
  const composer = new EffectComposer(renderer);
  for (const c of [composer.renderTarget1, composer.renderTarget2]) c.depthTexture = new THREE.DepthTexture(4, 4);
  const renduPiece = new RenderPass(scene, camera); composer.addPass(renduPiece);
  // Seuil assez haut pour que seules les sources (ampoule, écrans, fenêtres d'en face, rideaux éclairés) débordent,
  // rayon large : un halo de pellicule qui baigne les alentours plutôt qu'une auréole nette.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.72, 0.72); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finition = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTemps: { value: 0 }, uGrain: { value: GRAIN }, uVignette: { value: 0.8 }, tProfondeur: { value: null }, uFocus: { value: 1.6 }, uOuverture: { value: 0.0018 }, uImmersion: { value: 0 }, uAspect: { value: 1 },
      uVoile: { value: 0.13 }, uVoileCouleur: { value: couleur('--mt-scene-voile') }, uEclair: { value: 0 }, uFilm: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse, tProfondeur; uniform float uTemps, uGrain, uVignette, uFocus, uOuverture, uImmersion, uAspect, uVoile, uEclair, uFilm; uniform vec3 uVoileCouleur; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float lin(float z){ return .01 * 60. / (60. - z * (60. - .01)); }
      void main(){ vec2 c = vUv - 0.5; vec3 col;
        col.r = texture2D(tDiffuse, vUv + c * 0.0012).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv - c * 0.0012).b;
        // Le film porte sa propre profondeur de champ, et la profondeur lue ici serait celle de la dernière image de la pièce.
        if(uOuverture > 0. && uFilm < .5) {
          float distance = lin(texture2D(tProfondeur, vUv).x);
          float coc = clamp(abs(distance-uFocus)/max(distance,.01),0.,1.) * uOuverture;
          // Disque de 12 prises en spirale d'or : un flou rond, sans la croix d'un noyau en plus.
          vec3 somme = col; float poids = 1.;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996, r = sqrt((float(i) + .5) / 12.);
            vec2 o = vec2(cos(a), sin(a) * uAspect) * r * coc;
            float di = lin(texture2D(tProfondeur, vUv + o).x);
            // Un voisin net et plus proche que le point ne déborde pas sur un fond flou.
            float w = di < distance - .05 ? clamp(abs(di-uFocus)/max(di,.01) * uOuverture / max(coc, 1e-5), 0., 1.) : 1.;
            somme += texture2D(tDiffuse, vUv + o).rgb * w; poids += w;
          }
          col = somme / poids;
        }
        // Voile atmosphérique ambré : l'air de la pièce, chargé de la lumière de la lampe et de la ville. Présent
        // partout (les noirs ne sont jamais noirs), plus dense avec la distance ; fondu en mode écran pour ne pas
        // éteindre les hautes lumières. Il disparaît avec la pièce pendant la plongée.
        // Pendant le film, une distance fixe : sous 50 cm, le voile vaut sa moitié, celle de la vue du dessus au départ du film.
        float loin = uFilm > .5 ? .3 : lin(texture2D(tProfondeur, vUv).x);
        float brume = uVoile * (0.5 + 0.5 * (1. - exp(-max(loin - .5, 0.) * .8))) * (1. - uImmersion);
        // Le voile est l'air de la PIÈCE : il épargne ce qui est froid (la nuit bleue derrière la vitre), sinon il le
        // repeindrait en ambre et le contraste froid dehors / chaud dedans disparaîtrait.
        brume *= 1. - .85 * smoothstep(.0, .06, col.b - col.r);
        col += uVoileCouleur * brume * (1. - col);
        // Un éclair dehors : la pièce bleuit un instant, en voile (jamais un blanc plein écran).
        col += vec3(.62, .68, .85) * uEclair * .55 * (1. - col);
        // Vignette de pellicule, qui brunit les bords au lieu de les noircir.
        float v = dot(c, c);
        col *= mix(vec3(1.), vec3(1., .88, .74), clamp(v * 2.2, 0., 1.));
        col *= (1.0 - v * (uVignette + uImmersion * 1.2)) * (1. - uImmersion);
        // Grain filmique : en grappes d'un pixel et demi, distribution triangulaire, plus fort dans les demi-teintes
        // (comme l'argent d'une émulsion), presque absent des noirs et des blancs.
        vec2 gp = floor(gl_FragCoord.xy / 1.5);
        float n = h(gp + fract(uTemps) * 91.7) + h(gp * 1.37 + fract(uTemps * 1.31) * 37.1) - 1.;
        float lum = dot(col, vec3(.2126, .7152, .0722));
        col += n * uGrain * (.35 + 2.6 * lum * (1. - lum));
        gl_FragColor = vec4(col, 1.0); }`,
  });
  composer.addPass(finition);
  // --- Le film du café renversé (site/js/film-cafe.js) ---
  // Il remplace le rendu de la pièce DANS le composer : la vidéo passe une seule fois par le même halo, la même sortie sRGB et la même
  // finition que la pièce cuite, et raccorde au pixel à son départ (le film sort d'AgX en pixels d'affichage, décodés ici comme les atlas
  // cuits). Il s'affiche dans un rectangle à l'échelle exacte de la vue du dessus, centré sur le café projeté : en paysage il prend toute
  // la hauteur ; en portrait, une bande, et la pièce s'éteint autour en une demi-seconde.
  const passeFilm = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tFilm: { value: null }, uCentre: { value: new THREE.Vector2(0.5, 0.5) }, uTaille: { value: new THREE.Vector2(1, 1) }, uNoir: { value: 0 },
      uMelange: { value: 0 }, uVideo: { value: 0 }, uTeinte: { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    // uMelange : le fondu enchaîné de la pièce vers le film, sur l'image fixe du départ (même cadrage, même café) ; il absorbe ce qui reste d'écart entre le rendu du
    // film et les atlas cuits du site. uTeinte : la correction de couleur de l'ambiance, mesurée sur ce raccord (tests/film-cafe-raccord.mjs), en linéaire.
    fragmentShader: `uniform sampler2D tDiffuse, tFilm; uniform vec2 uCentre, uTaille; uniform float uNoir, uMelange, uVideo; uniform vec3 uTeinte; varying vec2 vUv;
      void main(){ vec2 f = (vUv - uCentre) / uTaille + .5; vec3 piece = texture2D(tDiffuse, vUv).rgb;
        bool dedans = f.x >= 0. && f.x <= 1. && f.y >= 0. && f.y <= 1.;
        vec3 couleurFilm = texture2D(tFilm, f).rgb;
        // Les samplers vidéo personnalisés ne passent pas par map_fragment de three.js ; leur sRGB se décode ici, une fois.
        if (uVideo > .5) couleurFilm = mix(pow((couleurFilm + .055) / 1.055, vec3(2.4)), couleurFilm / 12.92, vec3(lessThanEqual(couleurFilm, vec3(.04045))));
        gl_FragColor = vec4(dedans ? mix(piece, couleurFilm * uTeinte, uMelange) : piece * (1. - uNoir), 1.); }`,
  });
  passeFilm.enabled = false; composer.insertPass(passeFilm, 1);
  const film = { video: null, texture: null, debut: 0, noir: 0.5, fondu: 8 / 24, distance: 0, champ: 34, rapport: 2.4 };
  // Le rectangle du film : sa hauteur à l'écran est le rapport des étendues vues au plan du café (film / site), son centre le café projeté.
  // En paysage, la vue du dessus du site et l'image 0 du film ont même distance et même champ : le film prend toute la hauteur.
  function placerFilm() {
    camera.updateMatrixWorld(true);
    const c = posCafe.clone().project(camera), d = camera.position.distanceTo(posCafe);
    const s = (film.distance * Math.tan(THREE.MathUtils.degToRad(film.champ / 2))) / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    passeFilm.uniforms.uTaille.value.set(s * film.rapport * Hh / L, s); passeFilm.uniforms.uCentre.value.set((c.x + 1) / 2, (c.y + 1) / 2);
  }
  const rendrePiece = renduPiece.render.bind(renduPiece);
  renduPiece.render = (r, w, lecture, dt, masque) => { finition.uniforms.tProfondeur.value = lecture.depthTexture; rendrePiece(r, w, lecture, dt, masque); };

  // --- Cadrage : la place du visiteur est celle d'où Blender a cuit les reflets ---
  // Paysage : la caméra de la cuisson. Portrait (téléphone) : on recule et on élargit, sans déplacer les objets
  // (leurs ombres sont cuites dans l'établi), pour garder l'écran, la lampe et le terminal dans le cadre.
  const DISPOSITIONS = {
    paysage: { pos: D.camera.position, cible: D.camera.cible, fov: D.camera.fov },
    // Portrait : pose absolue, celle de la recette téléphone (indépendante de la caméra d'accueil, plus serrée).
    portrait: { pos: [-0.03, 1.02, 1.72], cible: [-0.03, 0.56, -0.12], fov: 78 },
  };
  let disposition = null;
  const base = { pos: new THREE.Vector3(), cible: new THREE.Vector3(), fov: D.camera.fov };
  function disposer(nom) {
    if (disposition === nom) return; disposition = nom; REGARD = BORNES[nom];
    const P = DISPOSITIONS[nom];
    base.pos.fromArray(P.pos); base.cible.fromArray(P.cible); base.fov = P.fov;
    pose.depuis = null; pose.actuelle = null;
    calculerBoites();
  }

  // --- Boîtes de collision : la caméra ne doit jamais entrer dans un objet ni traverser un mur ---
  const miseAuPoint = [statiques, ...Object.values(groupes), vitre];
  const boites = [];
  const MARGE = 0.06; // plus que le plan proche : aucune face ne peut être tranchée
  const PIECE = D.boite_piece;
  function calculerBoites() {
    boites.length = 0;
    for (const [id, g] of Object.entries(groupes)) {
      const b = boiteDe(g); boites.push({ id, b, large: b.clone().expandByScalar(MARGE) });
    }
    if (sucre.phase === 'pose') { const b = boiteDe(sucre.maillage); boites.push({ id: 'sucre', b, large: b.clone().expandByScalar(MARGE) }); }
  }
  // Correction douce : on remonte le point au-dessus de l'objet plutôt que de le traverser.
  function horsDecor(p) {
    p.x = Math.min(PIECE.xMax, Math.max(PIECE.xMin, p.x)); p.y = Math.max(PIECE.yMin, p.y); p.z = Math.max(PIECE.zMin, p.z);
    // Pendant la plongée, la caméra finit dans le tube, et passe à 3 cm au-dessus de la lettre du premier plan : leurs
    // boîtes élargies (alignées sur les axes, 6 cm de marge, objet tourné) ne la repoussent pas, sinon le cadre sauterait
    // au relais. tests/lettre.mjs vérifie sur une vraie plongée que la caméra ne traverse jamais la lettre elle-même.
    const plonge = plongee.phase !== 'repos';
    for (const { id, large } of boites) if (!((id === 'terminal' && plonge && plongee.t > .7) || (id === 'lettre' && plonge)) && large.containsPoint(p)) p.y = large.max.y + 0.001;
    return p;
  }
  const dansDecor = (p) => {
    if (p.x < PIECE.xMin || p.x > PIECE.xMax || p.y < PIECE.yMin || p.z < PIECE.zMin) return 'pièce';
    const b = boites.find(({ large }) => large.containsPoint(p)); return b ? b.id : null;
  };

  // --- Caméra : une seule pose animée, interruptible à tout moment ---
  const pose = { actuelle: null, depuis: null, vers: null, t: 1, duree: 1.1, decalage: new THREE.Vector2(), decalageVers: new THREE.Vector2(), decalageDepuis: new THREE.Vector2() };
  let reglages = { mouvementReduit: false, effets: true };
  const plongee = { phase: 'repos', t: 0, depuis: 0, debut: 0, texture: null, fin: null, finEntree: null, plonger: false, depart: null, seuil: null, arrivee: null };
  // Plongée dans la tasse : aller (travelling), arrivee (vue du dessus), retour (travelling inverse).
  const tasse = { phase: 'repos', t: 0, depuis: 0, debut: 0, fin: null, depart: null, arrivee: null, fige: null, direct: false };
  // Le tiroir des objectifs : même mécanique que la tasse, le tiroir glisse pendant le trajet.
  const tiroir = { id: 'tiroir:objectifs', phase: 'repos', t: 0, depuis: 0, debut: 0, fin: null, depart: null, arrivee: null, fige: null, direct: false };
  // Les deux tiroirs qu'on ouvre sans plongée : un seul à la fois.
  const petits = { 'tiroir:secret': { ouvert: false, k: 0 }, 'tiroir:surprise': { ouvert: false, k: 0 } };
  const petitOuvert = () => Object.keys(petits).find((id) => petits[id].ouvert) || null;
  // La vue des tiroirs : on est descendu devant le caisson. Un tiroir refermé y ramène ; « Recentrer » et Échap remontent au bureau.
  let vueCaisson = false;
  function poserVueCaisson(oui) { if (oui !== vueCaisson) { vueCaisson = oui; rappels.vueCaisson?.(oui); } }
  const occupe = () => plongee.phase !== 'repos' || tasse.phase !== 'repos' || tiroir.phase !== 'repos';
  const regard = { lacet: 0, tangage: 0, x: 0, y: 0, vx: 0, vy: 0, dernier: 0, glisse: false };
  const touches = new Set();
  const rotationRegard = new THREE.Euler(0, 0, 0, 'YXZ');
  let focus = null, panneauOuvert = false, dernierDecalage = [0, 0], reveilRegard = null;
  // Recentrer : la vue revient au bureau (en douceur ; d'un coup en mouvement réduit). Vrai si elle en était partie.
  function recentrer() {
    const parti = Math.abs(regard.lacet) > 0.02 || Math.abs(regard.tangage) > 0.02 || Math.abs(regard.x) > 0.02 || Math.abs(regard.y) > 0.02;
    regard.x = regard.y = regard.vx = regard.vy = 0; regard.fige = false; regard.dernier = performance.now(); touches.clear();
    if (reglages.mouvementReduit) regard.lacet = regard.tangage = 0;
    if (petitOuvert()) { basculer(petitOuvert()); demarrer(); return true; }
    if (vueCaisson) { poserVueCaisson(false); cadrer(null); return true; }
    demarrer(); return parti;
  }
  // Part de l'image occupée par le bureau (l'établi et ce qui est posé dessus, pas les murs, le plafond, les rideaux ni
  // la fenêtre), regard tourné de (lacet, tangage) depuis la place du visiteur, au format actuel.
  const PIECE_SEULE = new Set(['piece', 'rideaux']);
  function partBureau(lacet, tangage) {
    const cam = new THREE.PerspectiveCamera(base.fov, camera.aspect, 0.01, 60);
    cam.position.copy(base.pos); cam.lookAt(base.cible);
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); e.y += lacet; e.x += tangage; e.z = 0;
    cam.quaternion.setFromEuler(e); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const r = new THREE.Raycaster(), n = new THREE.Vector2(), cibles = [statiques, ...Object.values(groupes)]; let bureau = 0, total = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 16; j++) {
      n.set((i + 0.5) / 24 * 2 - 1, (j + 0.5) / 16 * 2 - 1); r.setFromCamera(n, cam); r.far = 8;
      const h = r.intersectObjects(cibles, true)[0]; total++;
      if (h && !PIECE_SEULE.has(h.object.userData.atlas)) bureau++;
    }
    return bureau / total;
  }
  // Pour les essais : les directions que la vitre laisse voir depuis une caméra (azimut à droite positif, élévation, en
  // degrés), et si elles restent dans l'étendue bâtie de la ville (là où ses toits dépassent l'horizon, autour de l'axe).
  const etendueVille = (() => {
    const p = ville.desc.profil, bati = (i) => (p.elevation[i] ?? -6) >= 1, i0 = Math.round(-p.az0 / p.pas);
    let a = i0, b = i0; while (a > 0 && bati(a - 1)) a--; while (b < p.elevation.length - 1 && bati(b + 1)) b++;
    return [p.az0 + a * p.pas, p.az0 + b * p.pas];
  })();
  function champDehors(cam) {
    cam.updateMatrixWorld(true); vitre.updateMatrixWorld(true);
    let a0 = Infinity, a1 = -Infinity, e0 = Infinity, e1 = -Infinity, vus = 0;
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const p = vitre.localToWorld(new THREE.Vector3((i / 20 - 0.5) * D.vitre.largeur, (j / 20 - 0.5) * D.vitre.hauteur, 0));
      const n = p.clone().project(cam); if (n.z > 1 || Math.abs(n.x) > 1 || Math.abs(n.y) > 1) continue;
      const { az, el } = azimutElevation(p.clone().sub(cam.position));
      vus++; a0 = Math.min(a0, az); a1 = Math.max(a1, az); e0 = Math.min(e0, el); e1 = Math.max(e1, el);
    }
    const r = (x) => +x.toFixed(2);
    return { vus, az: [r(a0), r(a1)], el: [r(e0), r(e1)], ok: !vus || (a0 >= etendueVille[0] && a1 <= etendueVille[1]) };
  }
  function poseDe(id) {
    if (!id) return { pos: base.pos.clone(), cible: base.cible.clone(), fov: base.fov };
    if (id === 'caisson') {
      // Accroupi devant le bureau, un peu à gauche, comme quand on cherche ce qui est sous le plateau : les deux façades entières,
      // le bord du plateau en haut pour rester dans la pièce. Sur écran étroit, on recule pour que la largeur tienne.
      const fov = disposition === 'portrait' ? 50 : 36, d = Math.max(1.05, 0.56 / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect));
      return { pos: centreCaisson.clone().addScaledVector(DIR_CAISSON, d), cible: centreCaisson.clone(), fov };
    }
    const o = objets[id]; const c = o.centre.clone();
    const dir = base.pos.clone().sub(c); dir.y = 0; dir.normalize();
    const d = o.distance * (disposition === 'portrait' ? 1.5 : 1.0);
    // Un objet rangé derrière un autre (la lettre derrière le terminal) se regarde de plus haut : on relève
    // l'angle jusqu'à ce que la caméra sorte du décor.
    let pos;
    for (let a = o.angle; a < 1.35; a += 0.08) {
      pos = c.clone().addScaledVector(dir, Math.cos(a) * d); pos.y += Math.sin(a) * d;
      if (!dansDecor(pos)) break;
    }
    return { pos, cible: c, fov: disposition === 'portrait' ? 50 : 36 };
  }
  function cadrer(id, { panneau = false, decalageX = 0, decalageY = 0 } = {}) {
    if (occupe()) return;
    // Un panneau ouvert depuis le menu quitte la vue des tiroirs ; sinon le retour au bureau d'un tiroir refermé y reste.
    if (panneau) poserVueCaisson(false);
    else if (!id && vueCaisson) id = 'caisson';
    regard.x = regard.y = regard.lacet = regard.tangage = regard.vx = regard.vy = 0;
    focus = id; panneauOuvert = panneau; dernierDecalage = [decalageX, decalageY];
    if (id === 'lettre') pieuvre?.evenement('lettre');
    const vers = poseDe(id);
    pose.depuis = pose.actuelle ? { pos: pose.actuelle.pos.clone(), cible: pose.actuelle.cible.clone(), fov: pose.actuelle.fov } : vers;
    pose.vers = vers; pose.t = reglages.mouvementReduit ? 1 : 0;
    pose.decalageDepuis.copy(pose.decalage);
    // Décalage de cadrage : le panneau occupe une partie de l'écran ; on recentre l'image dans l'espace libre
    // sans bouger la caméra, par un décalage de projection.
    pose.decalageVers.set(decalageX, decalageY);
    if (reglages.mouvementReduit) pose.decalage.copy(pose.decalageVers);
    // Durée proportionnelle au trajet, bornée : jamais plus d'1,2 s.
    const trajet = pose.depuis.pos.distanceTo(vers.pos);
    pose.duree = Math.min(1.2, Math.max(0.55, trajet * 1.4)); pose.debut = performance.now();
    demarrer();
  }

  // La tête tourne autour d'un point fixe ; le glisser garde son état jusqu'au clic synthétique.
  const pointeur = new THREE.Vector2(0, 0), ndc = new THREE.Vector2(9, 9);
  const rayon = new THREE.Raycaster();
  let survol = null, survolClavier = null, pointeurBouge = false, appui = null, glissement = false;
  const centreVue = new THREE.Vector2(0, 0); let distanceVisee = 1.6;
  function surMouvement(e) {
    const r = canvas.getBoundingClientRect();
    pointeur.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    // La dernière main gagne : la souris qui bouge sur la pièce reprend le survol au focus clavier (après « Entrer »,
    // le focus reste sur la première pastille ; sans cela, la souris n'éclairait plus rien, ni n'ouvrait la lettre).
    ndc.copy(pointeur); pointeurBouge = true; survolClavier = null;
    if (!appui || panneauOuvert || occupe()) return;
    if (!glissement && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 7) {
      // Au doigt, un glisser surtout vertical est un défilement de la page : il ne tourne jamais la caméra (le
      // navigateur le prend, touch-action: pan-y), même pour les premiers mouvements qui nous parviennent avant lui.
      if (appui.tactile && Math.abs(e.clientY - appui.y) > Math.abs(e.clientX - appui.x)) { appui = null; return; }
      glissement = true;
    }
    if (!glissement) return;
    if (!regard.glisse) try { surface_.setPointerCapture(e.pointerId); } catch (x) { /* pointeur relâché entre deux événements */ }
    // Au doigt, on regarde de côté seulement : la verticale reste au défilement.
    const dx = e.clientX - appui.px, dy = appui.tactile ? 0 : e.clientY - appui.py;
    regard.x -= dx * .003; regard.y -= dy * .0025;
    borner(regard);
    regard.vx = -dx * .003; regard.vy = -dy * .0025; regard.dernier = performance.now(); regard.glisse = true;
    appui.px = e.clientX; appui.py = e.clientY;
    if (reglages.mouvementReduit) { regard.lacet = regard.x; regard.tangage = regard.y; }
    demarrer();
  }
  const cibles = INTERACTIFS.map((id) => objets[id].groupe);
  function toucher() {
    if (occupe() || glissement) return null;
    rayon.setFromCamera(ndc, camera);
    // Le décor fixe peut cacher un objet (la lampe devant le carnet) : on lance contre tout, et le premier
    // obstacle décide.
    const hits = rayon.intersectObjects([statiques, ...Object.values(groupes), ...(sucre.phase === 'pose' ? [sucre.maillage] : []), ...(pieuvre ? [pieuvre.zone] : [])], true);
    const id = hits.length ? hits[0].object.userData.objet || null : null;
    // Devant le caisson, le bord du bureau reste dans l'image : seuls les tiroirs s'y cliquent, comme seuls ils y ont un point.
    return vueCaisson && id && !/^tiroir:|^fisheye$/.test(id) ? null : id;
  }
  // Les boutons projetés partagent le geste avec le canevas : glisser SUR un objet n'ouvre rien.
  const surface_ = conteneur.parentElement;
  surface_.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.intro, .piece__retour-intro, .piece__recentrer') || panneauOuvert || occupe()) return;
    appui = { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, tactile: e.pointerType === 'touch' }; glissement = false;
    regard.vx = regard.vy = 0;
  });
  surface_.addEventListener('pointermove', surMouvement, { passive: true });
  const relacher = () => { appui = null; regard.glisse = false; demarrer(); };
  surface_.addEventListener('pointerup', relacher); surface_.addEventListener('pointercancel', () => { glissement = true; relacher(); });
  surface_.addEventListener('click', (e) => { if (glissement) { e.preventDefault(); e.stopImmediatePropagation(); glissement = false; } }, true);
  canvas.addEventListener('pointerleave', () => { ndc.set(9, 9); pointeur.set(0, 0); pointeurBouge = true; });
  canvas.addEventListener('click', (e) => { if (occupe()) return; surMouvement(e); const id = toucher(); if (id === 'pieuvre') pieuvre.clic(); else if (id) rappels.choix(id); });
  // Double-clic sur la pièce : la vue revient au bureau.
  surface_.addEventListener('dblclick', (e) => { if (e.target.closest('.point, button, a, .intro') || panneauOuvert || occupe()) return; e.preventDefault(); if (recentrer()) rappels.recentre?.(); });
  document.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || panneauOuvert || occupe()
      || !document.body.classList.contains('exploration') || e.target.closest('input,textarea,select,[data-demineur]')) return;
    const premierAppui = !touches.has(e.key);
    e.preventDefault(); touches.add(e.key); regard.dernier = performance.now();
    // Un appui bref doit déplacer la cible même si aucune image ne tombe avant keyup. Le clavier
    // reprend aussi la main sur l'inertie du glisser ; sinon celle-ci peut annuler le geste à la borne.
    if (reglages.mouvementReduit || (premierAppui && !focus)) {
      regard.vx = regard.vy = 0;
      regard.x += e.key === 'ArrowLeft' ? .09 : e.key === 'ArrowRight' ? -.09 : 0;
      regard.y += e.key === 'ArrowUp' ? .07 : e.key === 'ArrowDown' ? -.07 : 0;
      borner(regard);
      if (reglages.mouvementReduit) { regard.lacet = regard.x; regard.tangage = regard.y; }
    } demarrer();
  });
  document.addEventListener('keyup', (e) => touches.delete(e.key));
  window.addEventListener('blur', () => { touches.clear(); relacher(); });

  // Le même tube porte l'image vivante jusqu'au relais DOM. Le retour parcourt le même trajet.
  function poseTerminal(rempli = REMPLI.arrivee, cam = camera) {
    scene.updateMatrixWorld(true);
    const centre = dalleTerminal.getWorldPosition(new THREE.Vector3());
    // La normale vient du cadre exporté, pas de la dalle : en fin de plongée la dalle est aplatie (échelle z nulle)
    // et sa matrice ne porte plus de direction.
    const normale = new THREE.Vector3().fromArray(cadreTerminal.normale).transformDirection(groupes.terminal.matrixWorld);
    const hauteur = cadreTerminal.hauteur, largeur = cadreTerminal.largeur;
    const d = Math.max(hauteur / 2, largeur / (2 * cam.aspect)) / rempli / Math.tan(THREE.MathUtils.degToRad(34 / 2));
    const pos = centre.clone().addScaledVector(normale, d);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, centre, new THREE.Vector3(0, 1, 0)));
    return { pos, cible: centre, fov: 34, quaternion: q, normale };
  }
  // Trajet de la plongée, paramétré par u : une courbe qui monte au-dessus de l'établi et vient se
  // placer dans l'axe du tube (u ≤ SEUIL), puis une poussée droite dans le verre jusqu'au cadrage final.
  const bez = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  function placerTrajet(u) {
    const A = plongee.depart, S = plongee.seuil, R = plongee.arrivee;
    if (u <= SEUIL) {
      const k = u / SEUIL, recul = S.pos.distanceTo(S.cible);
      bez.v0.copy(A.pos); bez.v3.copy(S.pos);
      bez.v1.copy(A.pos).lerp(S.pos, .28); bez.v1.y += .08;
      bez.v2.copy(S.pos).addScaledVector(S.normale, recul * .55); bez.v2.y += .03;
      bez.getPoint(k, camera.position);
      camera.quaternion.slerpQuaternions(A.quaternion, S.quaternion, THREE.MathUtils.smootherstep(k, 0, .8));
      camera.fov = A.fov + (S.fov - A.fov) * k;
    } else {
      camera.position.lerpVectors(S.pos, R.pos, (u - SEUIL) / (1 - SEUIL));
      camera.quaternion.copy(R.quaternion); camera.fov = R.fov;
    }
  }
  function entrerTerminal() {
    if (occupe()) return Promise.resolve();
    // La cible de départ suit le regard du moment : au retour, la caméra retrouve exactement ce cadrage.
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    plongee.depart = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
      cible: camera.position.clone().addScaledVector(direction, camera.position.distanceTo(pose.actuelle.cible)), decalage: pose.decalage.clone() };
    plongee.seuil = poseTerminal(REMPLI.seuil); plongee.arrivee = poseTerminal();
    plongee.phase = 'aller'; plongee.t = plongee.depuis = 0; plongee.debut = performance.now(); plongee.plonger = false;
    regard.x = regard.y = regard.vx = regard.vy = regard.lacet = regard.tangage = 0; touches.clear();
    pose.decalage.set(0, 0); pose.decalageVers.set(0, 0); pose.decalageDepuis.set(0, 0);
    const attente = new Promise((ok) => plongee.fin = ok);
    demarrer(); return attente;
  }
  // Rouille est prêt : la caméra traverse le verre. Si l'approche n'est pas finie, la poussée suit sans arrêt.
  function plongerTerminal() {
    if (!['aller', 'seuil', 'entree'].includes(plongee.phase)) return Promise.resolve();
    plongee.plonger = true;
    if (plongee.phase === 'seuil') { plongee.phase = 'entree'; plongee.depuis = plongee.t; plongee.debut = performance.now(); }
    const attente = new Promise((ok) => { const avant = plongee.finEntree; plongee.finEntree = () => { avant?.(); ok(); }; });
    demarrer(); return attente;
  }
  function sortirTerminal() {
    if (plongee.phase === 'repos') return Promise.resolve();
    // Un retour pendant l'approche repart de la progression actuelle, sans saut.
    plongee.phase = 'retour'; plongee.debut = performance.now(); plongee.depuis = plongee.t;
    // Pendant la visite, elle écoutait DOONT : le visiteur la retrouve sous son casque.
    pieuvre?.evenement('doont');
    plongee.finEntree?.(); plongee.finEntree = null;
    const attente = new Promise((ok) => { plongee.fin?.(); plongee.fin = ok; });
    demarrer(); return attente;
  }
  function textureTerminal(c) {
    plongee.texturePeinte = false;
    if (plongee.texture) { plongee.texture.dispose(); plongee.texture = null; }
    const u = dalleTerminal.material.uniforms;
    u.map.value = texTerminal;
    if (c) {
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      plongee.texture = t; u.map.value = t;
    }
    demarrer();
  }
  // Journal série du noyau sur le tube, tant que son écran graphique n'existe pas.
  function journalTerminal(lignes) {
    T.dessinerTerminal(texTerminal.image, lignes ? { journal: lignes, curseur: Math.floor(temps * 1.6) % 2 === 0 } : {});
    texTerminal.needsUpdate = true; demarrer();
  }
  // --- Plongée dans la tasse : un travelling continu jusqu'à la vue du dessus ---
  // Durée de l'aller : plus courte sur téléphone, où l'on veut la même chose en plus léger.
  const DUREE_TASSE = telephone ? 1.7 : 2.2;
  function poseTasse(cam = camera) {
    // Le cercle du bord tient entier dans la vue, avec 4 % de marge : on ne voit plus que la tasse et son café.
    const t = Math.tan(THREE.MathUtils.degToRad(34 / 2)), demi = t * Math.min(1, cam.aspect);
    let y = D.tasse[1] + CAFE.bord + CAFE.rayonBord / 0.96 / demi;
    // Le sucre posé à côté aussi, avec 2 % de marge : en paysage il y tient déjà ; sur un téléphone en portrait, la
    // vue monte un peu pour lui (la mousse y perd environ un dixième de sa taille). Toujours le même cadre, sucre
    // fondu ou non : les liens restent posés sur leur mousse.
    for (const p of sucre.coins) y = Math.max(y, p.y + Math.abs(p.x - posCafe.x) / (t * cam.aspect * 0.98), p.y + Math.abs(p.z - posCafe.z) / (t * 0.98));
    const pos = new THREE.Vector3(posCafe.x, y, posCafe.z);
    // Le haut de l'image regarde le fond de l'établi (−z) : les lettres de mousse se lisent droites.
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, posCafe, new THREE.Vector3(0, 0, -1)));
    return { pos, cible: posCafe.clone(), fov: 34, quaternion: q };
  }
  const bezTasse = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  const vHaut = new THREE.Vector3(), vFond = new THREE.Vector3(0, 0, -1), mVise = new THREE.Matrix4(), qVise = new THREE.Quaternion();
  function placerTasse(u, A = tasse.depart, T = tasse.arrivee, cam = camera) {
    bezTasse.v0.copy(A.pos); bezTasse.v3.copy(T.pos);
    bezTasse.v1.copy(A.pos).lerp(T.pos, .3); bezTasse.v1.y += .05;
    // On arrive par l'avant et d'en haut : la fin du geste descend presque droit sur le café.
    bezTasse.v2.copy(T.pos); bezTasse.v2.y += .1; bezTasse.v2.z += .09;
    bezTasse.getPoint(u, cam.position);
    // Le regard quitte le cadrage de départ pour s'accrocher au café, et n'en décroche plus : la tasse reste au
    // centre pendant tout le trajet. Le haut de l'image bascule vers le fond de l'établi à mesure qu'on surplombe.
    vHaut.set(0, 1, 0).lerp(T.haut || vFond, THREE.MathUtils.smoothstep(u, .35, .95)).normalize();
    qVise.setFromRotationMatrix(mVise.lookAt(cam.position, T.cible, vHaut));
    cam.quaternion.slerpQuaternions(A.quaternion, qVise, THREE.MathUtils.smoothstep(u, 0, .3));
    cam.fov = A.fov + (T.fov - A.fov) * THREE.MathUtils.smoothstep(u, 0, .8);
  }
  // --- Le tiroir des objectifs : il glisse, la caméra plonge au-dessus, comme au-dessus du café ---
  const DUREE_TIROIR = telephone ? 1.5 : 1.9;
  // Deux tiroirs à objectifs, sur le casier et dans le caisson : même plongée, chacun sa liste. tiroir.id dit lequel est en jeu.
  const axeTiroir = new THREE.Vector3().fromArray(D.tiroirs.objectifs.axe);
  const reperesTiroir = (id = tiroir.id) => D.tiroirs[id.split(':')[1]];
  const centreTiroir = (id = tiroir.id) => { const R = reperesTiroir(id); return new THREE.Vector3().fromArray(R.plateau.centre).addScaledVector(axeTiroir, R.course); };
  function glisser(id, k) { const R = D.tiroirs[id.split(':')[1]]; groupes[id].position.copy(axeTiroir).multiplyScalar(R.course * k); groupes[id].updateMatrixWorld(true); }
  function poseTiroir(cam = camera, id = tiroir.id) {
    // La mousse entière dans l'image, avec 4 % de marge ; le haut de l'image regarde le fond de l'établi, comme la tasse. Le corps
    // du tiroir, plus profond, reste en partie dans le caisson : il ne compte pas.
    const t = Math.tan(THREE.MathUtils.degToRad(34 / 2)), P = reperesTiroir(id).plateau;
    const y = P.dessus + Math.max(P.largeur / 2 / (t * cam.aspect), P.profondeur / 2 / t) / 0.96;
    const c = centreTiroir(id), pos = new THREE.Vector3(c.x, y, c.z);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, c, new THREE.Vector3(0, 0, -1)));
    return { pos, cible: c, fov: 34, quaternion: q };
  }
  function entrerTiroir(id = 'tiroir:objectifs') {
    if (occupe() || !pose.actuelle) return Promise.resolve();
    tiroir.id = id; tiroir.fisheye = false; tiroir.poseur = null; tiroir.pieuvre = false;
    // Le tiroir surprise est juste au-dessus de celui des objectifs : resté tiré, il cacherait la mousse. Il se referme seul, sans cadrage : la plongée a déjà la main.
    for (const p of Object.values(petits)) p.ouvert = false;
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    tiroir.depart = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
      cible: camera.position.clone().addScaledVector(direction, camera.position.distanceTo(pose.actuelle.cible)), decalage: pose.decalage.clone() };
    tiroir.arrivee = poseTiroir(); tiroir.direct = reglages.mouvementReduit;
    tiroir.phase = 'aller'; tiroir.t = tiroir.depuis = 0; tiroir.debut = performance.now();
    regard.x = regard.y = regard.vx = regard.vy = regard.lacet = regard.tangage = 0; touches.clear();
    pose.decalage.set(0, 0); pose.decalageVers.set(0, 0); pose.decalageDepuis.set(0, 0);
    vitrines[id].preparer();
    const attente = new Promise((ok) => tiroir.fin = ok);
    demarrer(); return attente;
  }
  function sortirTiroir() {
    if (tiroir.phase === 'repos') return Promise.resolve();
    tiroir.phase = 'retour'; tiroir.debut = performance.now(); tiroir.depuis = tiroir.t; if (!tiroir.fisheye) vitrines[tiroir.id].viser(null);
    const attente = new Promise((ok) => { tiroir.fin?.(); tiroir.fin = ok; });
    demarrer(); return attente;
  }
  // Le tiroir secret : il s'ouvre, la vue se penche sur la clé ; il se referme au second clic, à Échap ou à « Recentrer ».
  // L'objectif ultra grand angle : son module et son maillage attendent qu'on ouvre le tiroir à clé. Rien avant, rien sans WebGL.
  const fisheye = { inst: null, charge: null };
  function chargerFisheye() {
    fisheye.charge ??= import('./fisheye.js').then((m) => m.creerFisheye({ parent: groupes['tiroir:secret'], position: D.tiroirs.secret.fisheye, url: new URL('fisheye.glb', baseModele).href, renderer, env: cafe.env }))
      .then((f) => { fisheye.inst = f; objets.fisheye.ancre.copy(f.ancre); demarrer(); return f; })
      .catch((e) => { console.warn('Objectif grand angle indisponible :', e); fisheye.charge = null; return null; });
    return fisheye.charge;
  }
  function poseFisheye(cam = camera) {
    // La lentille remplit presque l'écran : 92 % du petit côté. La vue arrive dans l'axe de l'objectif couché, l'horizon à l'horizontale.
    const F = fisheye.inst, t = Math.tan(THREE.MathUtils.degToRad(34 / 2)), c = lentille(), pos = c.clone().addScaledVector(F.axe, F.rayon / (0.92 * t * Math.min(1, cam.aspect)));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, c, new THREE.Vector3(0, 1, 0)));
    return { pos, cible: c, fov: 34, quaternion: q };
  }
  const lentille = () => fisheye.inst.avant.clone().addScaledVector(axeTiroir, D.tiroirs.secret.course);
  function entrerFisheye() {
    if (occupe() || !pose.actuelle || !fisheye.inst) return Promise.resolve();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    tiroir.id = 'tiroir:secret'; tiroir.fisheye = true; tiroir.poseur = poseFisheye; tiroir.pieuvre = false; tiroir.direct = reglages.mouvementReduit;
    tiroir.depart = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
      cible: camera.position.clone().addScaledVector(direction, camera.position.distanceTo(pose.actuelle.cible)), decalage: pose.decalage.clone() };
    tiroir.arrivee = tiroir.poseur(); tiroir.phase = 'aller'; tiroir.t = tiroir.depuis = 0; tiroir.debut = performance.now();
    regard.x = regard.y = regard.vx = regard.vy = regard.lacet = regard.tangage = 0; touches.clear();
    const attente = new Promise((ok) => tiroir.fin = ok);
    demarrer(); return attente;
  }
  // La vue vers la mini-pieuvre : le travelling de la tasse. Elle reste vivante et se place à l'écart du centre, pour laisser sa place à la bulle : à gauche, ou en haut au téléphone debout.
  function posePieuvre(cam = camera) {
    const P = pieuvre.groupe.position, H = PIEUVRE_HAUT * PIEUVRE_ZOOM.echelle(disposition), c = new THREE.Vector3(P.x, P.y + H / 2, P.z), t = Math.tan(THREE.MathUtils.degToRad(34 / 2));
    const debout = disposition === 'portrait', d = debout ? PIEUVRE_ZOOM.debout : PIEUVRE_ZOOM.distance;
    const vers = new THREE.Vector3().subVectors(cam === camera && tiroir.depart ? tiroir.depart.pos : cam.position, c).setY(0).normalize().setY(PIEUVRE_ZOOM.hausse).normalize();
    const droite = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), vers).normalize(), cible = c.clone();
    if (debout) cible.y -= 2 * d * t * PIEUVRE_ZOOM.vers_le_haut; else cible.addScaledVector(droite, 2 * d * t * cam.aspect * PIEUVRE_ZOOM.vers_la_gauche);
    return { pos: c.clone().addScaledVector(vers, d), cible, fov: 34, haut: new THREE.Vector3(0, 1, 0), quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(c.clone().addScaledVector(vers, d), cible, new THREE.Vector3(0, 1, 0))) };
  }
  const enZoomPieuvre = () => tiroir.pieuvre && tiroir.phase !== 'repos';
  function entrerPieuvre() {
    if (occupe() || !pose.actuelle || !pieuvre || !pieuvre.groupe.visible) return Promise.resolve();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    tiroir.fisheye = true; tiroir.pieuvre = true; tiroir.poseur = posePieuvre; tiroir.direct = reglages.mouvementReduit;
    tiroir.depart = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
      cible: camera.position.clone().addScaledVector(direction, camera.position.distanceTo(pose.actuelle.cible)), decalage: pose.decalage.clone() };
    tiroir.arrivee = tiroir.poseur(); tiroir.phase = 'aller'; tiroir.t = tiroir.depuis = 0; tiroir.debut = performance.now();
    regard.x = regard.y = regard.vx = regard.vy = regard.lacet = regard.tangage = 0; touches.clear();
    const attente = new Promise((ok) => tiroir.fin = ok);
    demarrer(); return attente;
  }
  // La vue vers la console de poche : dans l'axe de son écran, le haut de l'écran en haut de l'image, la dalle à 92 % de la
  // hauteur de la vue (ou de sa largeur, si l'écran du visiteur est plus étroit qu'elle). Elle arrive en face, jamais de biais :
  // l'interface vivante (console.js) se pose sur ce rectangle sans déformation.
  const REMPLI_CONSOLE = 0.92;
  function poseConsole(cam = camera) {
    const E = consolePoche.ecran(), t = Math.tan(THREE.MathUtils.degToRad(34 / 2));
    const d = Math.max(E.h / 2 / t, E.l / 2 / (t * cam.aspect)) / REMPLI_CONSOLE;
    const c = E.centre.clone().addScaledVector(E.normale, E.dessus), pos = c.clone().addScaledVector(E.normale, d);
    return { pos, cible: c, fov: 34, haut: E.haut, quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, c, E.haut)) };
  }
  function entrerConsole() {
    if (occupe() || !pose.actuelle) return Promise.resolve();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    tiroir.fisheye = true; tiroir.pieuvre = false; tiroir.poseur = poseConsole; tiroir.direct = reglages.mouvementReduit;
    tiroir.depart = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
      cible: camera.position.clone().addScaledVector(direction, camera.position.distanceTo(pose.actuelle.cible)), decalage: pose.decalage.clone() };
    tiroir.arrivee = tiroir.poseur(); tiroir.phase = 'aller'; tiroir.t = tiroir.depuis = 0; tiroir.debut = performance.now();
    regard.x = regard.y = regard.vx = regard.vy = regard.lacet = regard.tangage = 0; touches.clear();
    const attente = new Promise((ok) => tiroir.fin = ok);
    demarrer(); return attente;
  }
  // Le rectangle de la dalle dans la vue d'arrivée (pixels CSS du canevas), calculé sans rendu : l'interface s'y pose dès l'arrivée.
  function rectangleConsole() {
    camTiroir.aspect = camera.aspect; camTiroir.updateProjectionMatrix();
    const P = poseConsole(camTiroir); camTiroir.position.copy(P.pos); camTiroir.quaternion.copy(P.quaternion); camTiroir.updateMatrixWorld(true);
    const pts = consolePoche.coins().map((p) => p.project(camTiroir)), xs = pts.map((p) => (p.x * 0.5 + 0.5) * L), ys = pts.map((p) => (-p.y * 0.5 + 0.5) * Hh);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + Math.min(...xs), y: r.top + Math.min(...ys), l: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), vue: [L, Hh] };
  }
  function basculer(id) {
    const T = petits[id], ouvrir = !T.ouvert;
    for (const p of Object.values(petits)) p.ouvert = false;
    T.ouvert = ouvrir; if (ouvrir && id === 'tiroir:secret') { poserVueCaisson(true); chargerFisheye(); }
    // Ouvert, le corps du tiroir à clé ne se clique plus : il entoure l'objectif, deux zones l'une dans l'autre. Sa façade et son point le referment.
    if (id === 'tiroir:secret') groupes[id].traverse((m) => { if (m.userData.atlas === 'secret') m.userData.objet = ouvrir ? null : id; });
    cadrer(ouvrir ? id : null); demarrer();
    return ouvrir;
  }
  // Descendre vers le caisson ; recentrer() remonte.
  function entrerCaisson() { if (occupe()) return; poserVueCaisson(true); cadrer('caisson'); }
  const camTiroir = new THREE.PerspectiveCamera(34, 1, 0.01, 60);
  // Rectangles des verres dans la vue d'arrivée, calculés sans rendu : les boutons s'y posent dès l'arrivée.
  function rectanglesObjectifs() {
    camTiroir.aspect = camera.aspect; camTiroir.updateProjectionMatrix();
    const T = poseTiroir(camTiroir); camTiroir.position.copy(T.pos); camTiroir.quaternion.copy(T.quaternion); camTiroir.updateMatrixWorld(true);
    const R = reperesTiroir();
    return R.objectifs.map((o) => {
      const c = new THREE.Vector3().fromArray(o.centre).addScaledVector(axeTiroir, R.course), a = c.clone().project(camTiroir), b = c.clone().add(new THREE.Vector3(o.rayon, 0, 0)).project(camTiroir);
      const x = (a.x + 1) * L / 2, y = (1 - a.y) * Hh / 2, r = Math.max(24, (b.x - a.x) * L / 2);
      return { left: x - r, top: y - r, width: 2 * r, height: 2 * r };
    });
  }
  function entrerTasse() {
    if (occupe() || !pose.actuelle) return Promise.resolve();
    // Comme pour le terminal : le départ suit le regard du moment, que le retour retrouvera exactement.
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    tasse.depart = { pos: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov,
      cible: camera.position.clone().addScaledVector(direction, camera.position.distanceTo(pose.actuelle.cible)), decalage: pose.decalage.clone() };
    tasse.arrivee = poseTasse(); tasse.direct = reglages.mouvementReduit;
    tasse.phase = 'aller'; tasse.t = tasse.depuis = 0; tasse.debut = performance.now();
    regard.x = regard.y = regard.vx = regard.vy = regard.lacet = regard.tangage = 0; touches.clear();
    pose.decalage.set(0, 0); pose.decalageVers.set(0, 0); pose.decalageDepuis.set(0, 0);
    // La goutte tombe pendant la fin de l'approche, quand la tasse remplit déjà l'image.
    cafe.commencer({ direct: tasse.direct, chuteA: DUREE_TASSE * 0.66 });
    const attente = new Promise((ok) => tasse.fin = ok);
    demarrer(); return attente;
  }
  function sortirTasse() {
    if (tasse.phase === 'repos') return Promise.resolve();
    // Un retour pendant l'approche repart de la progression actuelle, sans saut.
    tasse.phase = 'retour'; tasse.debut = performance.now(); tasse.depuis = tasse.t; cafe.survol(null);
    // Un sucre en l'air au départ : il est tombé, la mousse est posée (aucune animation ne survit à la visite).
    sucre.reposer(); sucre.terminer(); sucre.survol(false);
    const attente = new Promise((ok) => { tasse.fin?.(); tasse.fin = ok; });
    demarrer(); return attente;
  }
  // Rectangles des propositions dans la vue d'arrivée, calculés sans rendu : les liens s'y posent même au
  // premier instant, et se recalent au redimensionnement.
  const camTasse = new THREE.PerspectiveCamera(34, 1, 0.01, 60);
  function rectanglesCafe() {
    camTasse.aspect = camera.aspect; camTasse.updateProjectionMatrix();
    const T = poseTasse(camTasse); camTasse.position.copy(T.pos); camTasse.quaternion.copy(T.quaternion); camTasse.updateMatrixWorld(true);
    return cafe.rectangles(camTasse, L, Hh);
  }

  // Rectangle du bureau Rouille une fois entré, calculé sans rendu : le cadre DOM s'y pose même scène en pause.
  const camArrivee = new THREE.PerspectiveCamera(34, 1, 0.01, 60);
  function cadreArrivee() {
    camArrivee.aspect = camera.aspect; camArrivee.updateProjectionMatrix();
    const R = poseTerminal(REMPLI.arrivee, camArrivee);
    camArrivee.position.copy(R.pos); camArrivee.quaternion.copy(R.quaternion); camArrivee.updateMatrixWorld(true);
    return projeterDalle(camArrivee);
  }
  function projeterDalle(cam) {
    dalleTerminal.updateMatrixWorld(true);
    const l = cadreTerminal.largeur / 2, h = cadreTerminal.hauteur / 2;
    const a = new THREE.Vector3(-l, h, 0).applyMatrix4(dalleTerminal.matrixWorld).project(cam);
    const b = new THREE.Vector3(l, -h, 0).applyMatrix4(dalleTerminal.matrixWorld).project(cam);
    const r = { left: (a.x + 1) * L / 2, top: (1 - a.y) * Hh / 2, width: (b.x - a.x) * L / 2, height: (a.y - b.y) * Hh / 2 };
    return { ...r, arrondi: r.height * O.ARRONDI_TUBE };
  }

  // La ville va de la place (60 m) au beffroi (900 m) et à l'horizon : la passe du dehors a ses propres plans de coupe
  // (la pluie la plus proche est à plus de 2 m de l'œil). Même caméra, même cadrage, même décalage de vue.
  function rendreDehors(cible, cam = camera) {
    const { near, far } = cam;
    cam.near = 1; cam.far = 6000; cam.updateProjectionMatrix(); cam.layers.set(DEHORS);
    ville.regler({ hauteurPx: cible ? cible.height : Hh * renderer.getPixelRatio(), fov: cam.fov });
    renderer.setRenderTarget(cible); renderer.render(scene, cam);
    cam.near = near; cam.far = far; cam.updateProjectionMatrix(); cam.layers.set(0);
  }

  // Une caméra d'essai : la pose donnée (position, cible, champ vertical), sans roulis, au format demandé.
  function camEssai(pose, l, h) {
    const c = new THREE.PerspectiveCamera(pose.fov, l / h, 0.01, 60); c.position.fromArray(pose.pos); c.lookAt(new THREE.Vector3().fromArray(pose.cible));
    c.updateMatrixWorld(true); c.updateProjectionMatrix(); return c;
  }

  // --- Taille ---
  let L = 1, Hh = 1;
  function redimensionner() {
    const r = conteneur.getBoundingClientRect(); L = Math.max(1, r.width); Hh = Math.max(1, r.height);
    const pr = renderer.getPixelRatio();
    // Le compositeur ne relit pas la densité du moteur après sa création : sans ceci, ses images gardaient l'ancienne
    // résolution quand la qualité adaptative la baisse.
    renderer.setSize(L, Hh, false); composer.setPixelRatio(pr); composer.setSize(L, Hh);
    if (film.video) placerFilm();
    // Pleine résolution : la ville se lit fenêtre par fenêtre (à demi-résolution, elle redevenait floue).
    cibleDehors.setSize(Math.ceil(L * pr), Math.ceil(Hh * pr));
    bloom.resolution.set(L * 0.5, Hh * 0.5);
    camera.aspect = L / Hh;
    disposer(L / Hh < 0.85 ? 'portrait' : 'paysage');
    if (plongee.phase !== 'repos' && plongee.arrivee) { plongee.seuil = poseTerminal(REMPLI.seuil); plongee.arrivee = poseTerminal(); }
    if (tasse.phase !== 'repos') tasse.arrivee = poseTasse();
    if (tiroir.phase !== 'repos') tiroir.arrivee = tiroir.poseur ? tiroir.poseur() : poseTiroir();
    if (telephone && pieuvre && !enZoomPieuvre()) pieuvre.ajusterZone(camera, L, Hh);
    if (disposition === 'paysage') base.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(D.camera.fov / 2)) * Math.max(1, FORMAT_REFERENCE / camera.aspect)));
    cadrer(focus, { panneau: panneauOuvert, decalageX: dernierDecalage[0], decalageY: dernierDecalage[1] });
    pose.t = 1; pose.decalage.copy(pose.decalageVers);
    demarrer();
  }
  const ro = new ResizeObserver(redimensionner); ro.observe(conteneur);

  // Surlignage : la matière de l'objet visé se réchauffe un peu (couleur > 1 sur une texture cuite).
  const chaud = new THREE.Color(1.14, 1.06, 0.94), neutre = new THREE.Color(1, 1, 1);
  const surlignage = Object.fromEntries(CLIQUABLES.map((id) => {
    const mats = []; objets[id].groupe.traverse((m) => { if (m.isMesh && m.material.isMeshBasicMaterial) mats.push(m.material); });
    return [id, { mats, h: 0, but: 0 }];
  }));

  // Le sursaut d'entrée : le survol de chaque objet, joué une fois par la page (app.js), sans toucher au vrai survol.
  const sursauts = new Map(), sursautes = new Set();

  // --- Boucle ---
  const horloge = new THREE.Clock();
  let enPause = false, boucle = null, temps = 0, dernierCurseur = -1, perdu = false;
  const tmp = new THREE.Vector3();
  let images = 0;
  const dernieresDurees = [];
  function image() {
    boucle = null;
    if (enPause || perdu) return;
    images++;
    const brut = horloge.getDelta();
    dernieresDurees.push(brut * 1000); if (dernieresDurees.length > 120) dernieresDurees.shift();
    const vraiDt = Math.min(brut, .5);
    const dt = Math.min(brut, 0.05);
    surveillerQualite(brut);
    const anime = !reglages.mouvementReduit;
    if (anime) temps += dt;
    // La transition suit l'horloge réelle (et non dt plafonné) : sa durée reste bornée même si les images ralentissent.
    if (pose.t < 1) pose.t = Math.min(1, (performance.now() - pose.debut) / (pose.duree * 1000));
    const k = ease(pose.t);
    if (!pose.actuelle) pose.actuelle = { pos: new THREE.Vector3(), cible: new THREE.Vector3(), fov: base.fov };
    const dep = pose.depuis || pose.vers, ve = pose.vers;
    pose.actuelle.pos.lerpVectors(dep.pos, ve.pos, k); pose.actuelle.cible.lerpVectors(dep.cible, ve.cible, k); pose.actuelle.fov = dep.fov + (ve.fov - dep.fov) * k;
    pose.decalage.lerpVectors(pose.decalageDepuis, pose.decalageVers, k);
    const enPlongee = plongee.phase !== 'repos', enTasse = tasse.phase !== 'repos', enTiroir = tiroir.phase !== 'repos';
    if (enPlongee) {
      const maintenant = performance.now(), ecoule = (maintenant - plongee.debut) / 1000, direct = reglages.mouvementReduit;
      if (plongee.phase === 'aller') {
        const av = direct ? 1 : Math.min(1, ecoule / 2.4);
        plongee.t = SEUIL * ease(av);
        if (av === 1) {
          plongee.fin?.(); plongee.fin = null;
          plongee.phase = plongee.plonger ? 'entree' : 'seuil'; plongee.depuis = plongee.t; plongee.debut = maintenant;
        }
      } else if (plongee.phase === 'seuil') {
        // En attendant Rouille, la caméra continue d'avancer, de moins en moins : le geste ne s'arrête pas net.
        plongee.t = SEUIL + .05 * (1 - Math.exp(-ecoule / 2.5));
      } else if (plongee.phase === 'entree') {
        const av = direct ? 1 : Math.min(1, ecoule / 1.05);
        plongee.t = plongee.depuis + (1 - plongee.depuis) * ease(av);
        if (av === 1) { plongee.phase = 'arrivee'; plongee.t = 1; }
      } else if (plongee.phase === 'arrivee') {
        plongee.t = 1;
      } else if (plongee.phase === 'retour') {
        const av = direct ? 1 : Math.min(1, ecoule / Math.max(.6, 2.4 * plongee.depuis));
        plongee.t = plongee.depuis * (1 - ease(av));
        if (av === 1) plongee.t = 0;
      }
      // Captures et essais : une étape de la traversée peut être figée pour être photographiée.
      if (plongee.fige != null) plongee.t = plongee.fige;
      const u = plongee.t, dp = plongee.depart;
      placerTrajet(u);
      horsDecor(camera.position);
      const kk = Math.min(1, u / SEUIL);
      if (dp.decalage.lengthSq() > .25 && kk < 1) camera.setViewOffset(L, Hh, dp.decalage.x * (1 - kk), dp.decalage.y * (1 - kk), L, Hh);
      else camera.clearViewOffset();
      // La pièce s'assombrit pendant que la lumière du tube envahit le cadre ; elle reste devinable autour.
      finition.uniforms.uImmersion.value = THREE.MathUtils.smoothstep(u, .3, 1) * .66;
      const tube = dalleTerminal.material.uniforms;
      tube.uEffet.value = 1 - THREE.MathUtils.smoothstep(u, SEUIL + .06, 1);
      tube.uAttente.value = plongee.texture ? 0 : Math.min(1, u / SEUIL);
      lueurTerminal.material.opacity = .05 + .2 * THREE.MathUtils.smoothstep(u, .25, .7) * (1 - THREE.MathUtils.smoothstep(u, .8, 1));
      dalleTerminal.scale.z = 1 - THREE.MathUtils.smoothstep(u, SEUIL, 1);
      if (plongee.texture) plongee.texture.needsUpdate = true;
      if (plongee.phase === 'arrivee' && plongee.finEntree && plongee.texturePeinte) { plongee.finEntree(); plongee.finEntree = null; }
      if (plongee.phase === 'retour' && plongee.t === 0) {
        pose.actuelle = { pos: camera.position.clone(), cible: dp.cible.clone(), fov: dp.fov };
        pose.depuis = pose.vers = { pos: camera.position.clone(), cible: dp.cible.clone(), fov: dp.fov }; pose.t = 1;
        pose.decalage.copy(dp.decalage); pose.decalageVers.copy(dp.decalage); pose.decalageDepuis.copy(dp.decalage);
        tube.uEffet.value = 1; tube.uAttente.value = 0; lueurTerminal.material.opacity = .05;
        plongee.phase = 'repos'; plongee.t = 0; plongee.fin?.(); plongee.fin = null;
      }
    } else if (enTasse) {
      const ecoule = (performance.now() - tasse.debut) / 1000, direct = tasse.direct || reglages.mouvementReduit;
      if (tasse.phase === 'aller') {
        const av = direct ? 1 : Math.min(1, ecoule / DUREE_TASSE);
        tasse.t = ease(av);
        if (av === 1) { tasse.phase = 'arrivee'; tasse.t = 1; tasse.fin?.(); tasse.fin = null; }
      } else if (tasse.phase === 'arrivee') tasse.t = 1;
      else if (tasse.phase === 'retour') {
        const av = direct ? 1 : Math.min(1, ecoule / Math.max(.6, 1.6 * tasse.depuis));
        tasse.t = av === 1 ? 0 : tasse.depuis * (1 - ease(av));
      }
      if (tasse.fige != null) tasse.t = tasse.fige;
      const u = tasse.t, dp = tasse.depart;
      placerTasse(u); horsDecor(camera.position);
      if (dp.decalage.lengthSq() > .25 && u < 1) camera.setViewOffset(L, Hh, dp.decalage.x * (1 - u), dp.decalage.y * (1 - u), L, Hh);
      else camera.clearViewOffset();
      // La pièce se tait un peu autour de la tasse, sans assombrir le café ni la mousse.
      finition.uniforms.uImmersion.value = THREE.MathUtils.smoothstep(u, .45, 1) * .1;
      if (tasse.phase === 'retour' && tasse.t === 0) {
        pose.actuelle = { pos: camera.position.clone(), cible: dp.cible.clone(), fov: dp.fov };
        pose.depuis = pose.vers = { pos: camera.position.clone(), cible: dp.cible.clone(), fov: dp.fov }; pose.t = 1;
        pose.decalage.copy(dp.decalage); pose.decalageVers.copy(dp.decalage); pose.decalageDepuis.copy(dp.decalage);
        tasse.phase = 'repos'; cafe.finir(); tasse.fin?.(); tasse.fin = null;
      }
    } else if (enTiroir) {
      const ecoule = (performance.now() - tiroir.debut) / 1000, direct = tiroir.direct || reglages.mouvementReduit;
      if (tiroir.phase === 'aller') {
        const av = direct ? 1 : Math.min(1, ecoule / DUREE_TIROIR);
        tiroir.t = ease(av);
        if (av === 1) { tiroir.phase = 'arrivee'; tiroir.t = 1; tiroir.fin?.(); tiroir.fin = null; }
      } else if (tiroir.phase === 'arrivee') tiroir.t = 1;
      else if (tiroir.phase === 'retour') {
        const av = direct ? 1 : Math.min(1, ecoule / Math.max(.6, 1.5 * tiroir.depuis));
        tiroir.t = av === 1 ? 0 : tiroir.depuis * (1 - ease(av));
      }
      if (tiroir.fige != null) tiroir.t = tiroir.fige;
      const u = tiroir.t, dp = tiroir.depart;
      // Le tiroir sort d'abord, la vue monte ensuite : on voit le geste avant d'en voir l'intérieur.
      if (!tiroir.fisheye) glisser(tiroir.id, THREE.MathUtils.smoothstep(u, 0, .55));
      placerTasse(u, tiroir.depart, tiroir.arrivee); horsDecor(camera.position);
      if (dp.decalage.lengthSq() > .25 && u < 1) camera.setViewOffset(L, Hh, dp.decalage.x * (1 - u), dp.decalage.y * (1 - u), L, Hh);
      else camera.clearViewOffset();
      finition.uniforms.uImmersion.value = THREE.MathUtils.smoothstep(u, .45, 1) * .1;
      if (tiroir.phase === 'retour' && tiroir.t === 0) {
        pose.actuelle = { pos: camera.position.clone(), cible: dp.cible.clone(), fov: dp.fov };
        pose.depuis = pose.vers = { pos: camera.position.clone(), cible: dp.cible.clone(), fov: dp.fov }; pose.t = 1;
        pose.decalage.copy(dp.decalage); pose.decalageVers.copy(dp.decalage); pose.decalageDepuis.copy(dp.decalage);
        tiroir.phase = 'repos'; tiroir.fin?.(); tiroir.fin = null;
      }
    } else {
      dalleTerminal.scale.z = 1;
      const actif = !focus && !panneauOuvert;
      const maintenant = performance.now();
      if (actif && !reglages.mouvementReduit) {
        const dx = (touches.has('ArrowLeft') ? 1 : 0) - (touches.has('ArrowRight') ? 1 : 0), dy = (touches.has('ArrowUp') ? 1 : 0) - (touches.has('ArrowDown') ? 1 : 0);
        if (dx || dy) { regard.x += dx * dt * .85; regard.y += dy * dt * .65; regard.dernier = maintenant; }
        if (!regard.glisse) { regard.x += regard.vx * dt * 25; regard.y += regard.vy * dt * 25; regard.vx *= Math.exp(-dt * 10); regard.vy *= Math.exp(-dt * 10); }
      }
      // Le retour doux au bureau, sans geste depuis RETOUR ms ; en mouvement réduit, d'un coup (la boucle dort : un
      // minuteur la réveille à l'échéance).
      if (actif && !regard.glisse && !regard.fige && survolClavier !== 'console' && (regard.x || regard.y)) {
        if (maintenant - regard.dernier > RETOUR) {
          if (reglages.mouvementReduit) regard.x = regard.y = 0;
          else { regard.x *= Math.exp(-vraiDt * 1.8); regard.y *= Math.exp(-vraiDt * 1.8); if (Math.hypot(regard.x, regard.y) < 1e-3) regard.x = regard.y = 0; }
        } else if (reglages.mouvementReduit && !reveilRegard) reveilRegard = setTimeout(() => { reveilRegard = null; demarrer(); }, RETOUR - (maintenant - regard.dernier) + 50);
      }
      borner(regard);
      const lissage = reglages.mouvementReduit ? 1 : 1 - Math.exp(-vraiDt * 12);
      regard.lacet += (regard.x - regard.lacet) * lissage; regard.tangage += (regard.y - regard.tangage) * lissage;
      camera.position.copy(pose.actuelle.pos); horsDecor(camera.position); cible.copy(pose.actuelle.cible); camera.lookAt(cible);
      if (actif) {
        rotationRegard.setFromQuaternion(camera.quaternion, 'YXZ');
        rotationRegard.y += regard.lacet; rotationRegard.x += regard.tangage; rotationRegard.z = 0;
        // Respiration de la tête, à peine perceptible : un plan fixe qui reste vivant.
        if (anime) { rotationRegard.y += Math.sin(temps * .23 + 1) * .0024; rotationRegard.x += Math.sin(temps * .31) * .0018; }
        camera.quaternion.setFromEuler(rotationRegard);
      }
      camera.fov = pose.actuelle.fov;
      if (pose.decalage.lengthSq() > .25) camera.setViewOffset(L, Hh, pose.decalage.x, pose.decalage.y, L, Hh); else camera.clearViewOffset();
      finition.uniforms.uImmersion.value = 0;
    }
    camera.updateProjectionMatrix();
    // Profondeur de champ portée par le mouvement : objet cadré, centre du regard, puis le tube pendant la plongée.
    let mise = 1.6, ouverture = 0;
    if (enTiroir) mise = camera.position.distanceTo(tiroir.poseur ? tiroir.arrivee.cible : centreTiroir());
    else if (enTasse) {
      mise = camera.position.distanceTo(posCafe);
      ouverture = (niveau !== 'basse' && !telephone) ? .0012 + .0024 * Math.sin(Math.PI * tasse.t) : 0;
    } else if (enPlongee) {
      mise = camera.position.distanceTo(plongee.arrivee.cible);
      ouverture = (niveau !== 'basse' && !telephone) ? .0012 + .0055 * THREE.MathUtils.smoothstep(plongee.t, .12, .9) : 0;
    } else if (NIVEAUX[niveau].flou && !telephone) {
      ouverture = .0016;
      if (focus) mise = camera.position.distanceTo(pose.actuelle.cible);
      else {
        if (images % 6 === 0) { rayon.setFromCamera(centreVue, camera); rayon.far = 8; const h = rayon.intersectObjects(miseAuPoint, true)[0]; distanceVisee = h ? h.distance : 3; }
        mise = distanceVisee;
      }
    }
    const fu = finition.uniforms;
    fu.uFocus.value += (mise - fu.uFocus.value) * (anime && !enPlongee && !enTasse ? Math.min(1, dt * 7) : 1);
    fu.uOuverture.value = reglages.effets ? ouverture : 0; fu.uAspect.value = L / Hh;
    // Survol (souris) ou focus clavier.
    if (pointeurBouge && !panneauOuvert) {
      const s = toucher(); if (s !== survol) { survol = s; rappels.survol(s); if (s === 'lettre') pieuvre?.evenement('lettre'); } canvas.style.cursor = s ? 'pointer' : ''; pointeurBouge = false;
      // Elle lève les yeux vers ce que vise le visiteur. Le rayon est celui que toucher() vient de lancer.
      pieuvre?.pointeur(ndc.x < 2 ? rayon.ray : null, objets[s]?.ancre ?? null, s === 'pieuvre');
    }
    const vise = panneauOuvert || enPlongee || enTasse || enTiroir ? null : (survolClavier || survol);
    for (const id of CLIQUABLES) {
      const S = surlignage[id], e = sursauts.get(id);
      S.but = id === vise || (e && (e.fin > performance.now() || !e.vu)) ? 1 : 0; S.h += (S.but - S.h) * (anime ? Math.min(1, dt * 8) : 1);
      // Au moins une image pour chacun, même sur une machine lente qui n'en rend que deux par seconde.
      if (e) { e.vu = true; sursautes.add(id); }
      for (const m of S.mats) m.color.copy(neutre).lerp(chaud, S.h);
      // Le tube garde sa position pendant le trajet : sa montée au survol décalerait le relais DOM.
      // La tasse ne se soulève pas : son café vivant resterait en place et s'enfoncerait dans le grès.
      // Un tiroir ne se soulève pas : il frotterait contre le casier ; un tableau reste accroché.
      if (!enPlongee && id !== 'tasse' && !/^(tiroir|cadre):/.test(id)) objets[id].groupe.position.y += (S.h * .006 - objets[id].groupe.position.y) * (anime ? Math.min(1, dt * 10) : 1);
    }
    materiauEcran.uniforms.uSurvol.value = surlignage.ecran.h;
    fiche.mettreAJour({ survol: surlignage.parcours.h, lampe: piece.lampe });
    pieuvre?.mettreAJour(dt, { anime, lampe: piece.lampe, enVue: !enPlongee && !enTasse && (!enTiroir || tiroir.pieuvre), proche: enTiroir && tiroir.pieuvre ? tiroir.t : 0 });
    penseBete?.mettreAJour();
    ouvrirRabat(surlignage.lettre.h);
    for (const [id, T] of Object.entries(petits)) {
      const avant = T.k, but = T.ouvert ? 1 : 0;
      T.k += (but - T.k) * (anime ? Math.min(1, dt * 6) : 1);
      if (Math.abs(T.k - but) < 1e-3) T.k = but;
      if (T.k !== avant) glisser(id, T.k);
    }
    const objectifsBougent = Object.values(vitrines).map((v) => v.mettreAJour(dt, anime)).some(Boolean);
    // Animations.
    materiauEcran.uniforms.uTemps.value = temps;
    const curseur = Math.floor(temps * 1.6) % 2;
    if (curseur !== dernierCurseur && anime && !enPlongee) { dernierCurseur = curseur; materiauEcran.uniforms.tEcran.value = ecransRepos[curseur]; }
    vitreMat.uniforms.uTemps.value = temps;
    dalleTerminal.material.uniforms.uTemps.value = temps;
    pluie.material.uniforms.uTemps.value = temps;
    // Les approches douces (ciel, lampe, écran) suivent le temps réel : leur durée ne dépend pas de la cadence.
    eclairCourant = ciel.image(vraiDt, temps, anime);
    vitreMat.uniforms.uEclair.value = eclairCourant; finition.uniforms.uEclair.value = eclairCourant;
    for (const k of ['lampe', 'ecran', 'vapeur']) piece[k] += (piece.cible[k] - piece[k]) * (anime ? Math.min(1, vraiDt * 1.5) : 1);
    materiauEcran.uniforms.uLueur.value = 0.72 * piece.ecran;
    finition.uniforms.uTemps.value = temps; finition.uniforms.uGrain.value = reglages.effets ? GRAIN : 0;
    // La lampe : un filament sur un vieux secteur, presque immobile, qui frémit parfois.
    const frisson = anime ? Math.sin(temps * 2.1) * 0.02 + Math.sin(temps * 13.7) * Math.max(0, Math.sin(temps * 0.37)) * 0.03 : 0;
    haloLampe.material.opacity = 0.22 * (1 + frisson) * piece.lampe; coeurLampe.material.opacity = 0.55 * (1 + frisson * 1.5) * piece.lampe;
    poussiere.material.opacity = 0.5 * piece.lampe;
    lueurEcran.material.opacity = 0.08 * (0.96 + 0.04 * Math.sin(temps * 9.1)) * piece.ecran;
    for (const sp of vapeurs) {
      const ph = (temps * 0.11 + sp.userData.phase) % 1;
      sp.position.set(posTasse.x + Math.sin(ph * 6 + sp.userData.phase * 9) * 0.012, posTasse.y + 0.1 + ph * 0.17, posTasse.z + Math.cos(ph * 5) * 0.006);
      // La vapeur s'écarte quand on plonge : la caméra passe dans sa colonne.
      sp.scale.setScalar(0.03 + ph * 0.08); sp.material.opacity = Math.sin(ph * Math.PI) * 0.06 * piece.vapeur * (reglages.effets ? 1 : 0) * (enTasse ? 1 - THREE.MathUtils.smoothstep(tasse.t, 0, .4) : 1);
    }
    if (!sucreFige) sucre.mettreAJour(dt, { anime, lampe: piece.lampe, onde: ondeSucre });
    if (sucre.dansLaParoi()) paroiVue++;
    // Le café : miroir bombé à l'arrivée seulement ; en mouvement réduit, la mousse s'efface devant le texte net.
    cafe.mettreAJour(dt, { anime, bombe: enTasse ? 1.05 * THREE.MathUtils.smoothstep(tasse.t, .3, 1) : 0, mousse: reglages.mouvementReduit ? 0 : 1, enVue: enTasse && tasse.t > .5 });
    poussiere.rotation.y = temps * 0.05;
    // La console : survol, lampe, relais vers l'interface vivante ; sa dalle suit l'heure réelle, à la minute.
    consolePoche.mettreAJour(temps, { survol: surlignage.console.h, lampe: piece.lampe, relais: relaisConsole });
    const minute = Math.floor(Date.now() / 60000); if (minute !== minuteConsole) { minuteConsole = minute; consolePoche.repeindre(); }
    // Rendu : d'abord le dehors (pour la vitre), puis la pièce et le post-traitement.
    // Le film : la pièce s'éteint autour de lui, puis n'est plus rendue du tout (ni elle, ni le dehors de la vitre).
    if (film.video) {
      const e = performance.now() - film.debut, k = Math.min(1, e / (film.noir * 1000)), m = film.fondu > 0 ? Math.min(1, e / (film.fondu * 1000)) : 1;
      passeFilm.uniforms.uNoir.value = k; passeFilm.uniforms.uMelange.value = m * m * (3 - 2 * m); renduPiece.enabled = k < 1 || m < 1;
    }
    if (renduPiece.enabled) rendreDehors(cibleDehors);
    renderer.setRenderTarget(null);
    composer.render(dt);
    if (enPlongee && plongee.texture) {
      // Cette passe sans grain ni bloom est identique au canevas natif lors du relais.
      const auto = renderer.autoClear, fond = scene.background;
      // Un fond Color force un effacement chez three.js, même avec autoClear=false.
      scene.background = null; renderer.autoClear = false; renderer.clearDepth(); camera.layers.set(2);
      renderer.render(scene, camera); camera.layers.set(0); renderer.autoClear = auto; scene.background = fond;
      if (plongee.t === 1 && plongee.phase === 'arrivee') plongee.texturePeinte = true;
    }
    // Points accessibles : projection des ancres à l'écran.
    // Devant le caisson, seuls les deux tiroirs ont un point ; au bureau, seul l'appel parle d'eux (vus d'en haut ou de biais, leurs
    // façades passeraient sous d'autres objets) : jamais deux façons de cliquer le même endroit.
    const pourLaVue = (id) => {
      if (id === 'caisson') return !focus && !panneauOuvert;
      if (id === 'tiroir:objectifs2') return focus === 'caisson';
      // En portrait, sa cible de 44 px mordrait sur l'appareil et la radio : pas de point, le tiroir s'ouvre par un clic sur lui-même (consigne de l'utilisateur, 31/10).
      if (id === 'tiroir:surprise' && disposition === 'portrait') return false;
      // L'objectif ne se vise qu'une fois le tiroir ouvert et l'objet arrivé.
      if (id === 'fisheye') return focus === 'tiroir:secret' && !!fisheye.inst && petits['tiroir:secret'].k > 0.9;
      if (id === 'tiroir:secret') return focus === 'caisson' || focus === 'tiroir:secret';
      return focus !== 'caisson' && focus !== 'tiroir:secret';
    };
    const pts = [...CLIQUABLES, 'caisson', 'fisheye'].map((id) => { tmp.copy(objets[id].ancre); if (id !== 'tasse' && id !== 'caisson') objets[id].groupe.localToWorld(tmp); tmp.project(camera); if (id === 'caisson') tmp.x = Math.min(tmp.x, BORD_APPEL); return { id, x: (tmp.x * 0.5 + 0.5) * L, y: (-tmp.y * 0.5 + 0.5) * Hh, visible: tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && !enPlongee && !enTasse && !enTiroir && pourLaVue(id) }; });
    rappels.points(pts);
    rappels.imagePieuvre?.();
    rappels.zones?.(zones.map((z) => { tmp.copy(z.ancre).project(camera); return { id: z.id, x: (tmp.x * 0.5 + 0.5) * L, y: (-tmp.y * 0.5 + 0.5) * Hh, visible: tmp.z < 1 && Math.abs(tmp.y) < 1 && !focus && !panneauOuvert && !enPlongee && !enTasse && !enTiroir }; }));
    // En mouvement réduit et sans transition en cours, on ne redessine qu'à la demande.
    const doitContinuer = anime || objectifsBougent || Object.values(petits).some((T) => T.k !== (T.ouvert ? 1 : 0)) || (enTiroir && tiroir.phase !== 'arrivee') || sucre.anime || ciel.enFondu || ['lampe', 'ecran', 'vapeur'].some((k) => Math.abs(piece[k] - piece.cible[k]) > 0.01) || enPlongee || (enTasse && tasse.phase !== 'arrivee') || pose.t < 1 || CLIQUABLES.some((id) => Math.abs(surlignage[id].h - surlignage[id].but) > 0.01);
    for (const [id, e] of sursauts) if (e.vu && e.fin <= performance.now()) sursauts.delete(id);
    if (doitContinuer || sursauts.size) demarrer();
  }
  // Les ronds du sucre dans le café (sa chute, puis ses perles qui retombent).
  const ondeSucre = ([x, y], a) => cafe.onde(x, y, a);
  let sucreFige = false, paroiVue = 0;
  // Le sucre tombe (clic, clavier, ou lâché sur le café) : la promesse se tient à l'impact, quand la mousse se
  // réarrange. direct (mouvement réduit) : ni chute ni fondu, la proposition paraît d'un coup.
  function lacherSucre(point, { phrases, direct }) {
    return new Promise((ok) => {
      const parti = sucre.lacher(point, { direct, auImpact: ({ x, y, direct: d }) => { cafe.sucre(phrases, { x, y, direct: d }); pieuvre?.evenement('sucre'); demarrer(); ok({ x, y, direct: d }); } });
      if (!parti) ok(null);
      calculerBoites(); demarrer();
    });
  }
  // Le pointeur (px) sur le plan où le sucre est porté, au-dessus du bord de la tasse.
  const ndcSucre = new THREE.Vector2(), raySucre = new THREE.Raycaster();
  function pointPorte(x, y) {
    const r = canvas.getBoundingClientRect(); ndcSucre.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    raySucre.setFromCamera(ndcSucre, camera);
    return raySucre.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -sucre.hauteurPortee()), new THREE.Vector3());
  }
  // --- Qualité adaptative ---
  // Fenêtre glissante de 90 images ; on ne juge qu'en animation continue, hors transition et après
  // un temps de chauffe, pour ne pas punir la compilation des shaders ou un onglet qui revient.
  const durees = []; let chauffe = 1.5, dernierChangement = 0, lenteurEssai = 0;
  function surveillerQualite(brut) {
    if (qualiteFixe || reglages.mouvementReduit || brut <= 0 || brut > 1) return;
    if (chauffe > 0) { chauffe -= brut; return; }
    durees.push(brut * 1000 + lenteurEssai); if (durees.length > 90) durees.shift();
    if (durees.length === 12 && Math.min(...durees) > 70 && niveau !== 'basse') { appliquerQualite('basse'); return; }
    if (durees.length < 90 || performance.now() - dernierChangement < 3000) return;
    const tri = [...durees].sort((a, b) => a - b); const mediane = tri[45];
    if (mediane > 22 && niveau !== 'basse') appliquerQualite(ORDRE[ORDRE.indexOf(niveau) + 1]);
  }
  function appliquerQualite(n) {
    niveau = n; const N = NIVEAUX[n];
    dernierChangement = performance.now(); durees.length = 0; chauffe = 0.5;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, N.dpr));
    bloom.enabled = N.bloom;
    redimensionner();
    conteneur.dataset.qualite = n;
  }
  function demarrer() { if (!boucle && !enPause && !perdu) { boucle = requestAnimationFrame(image); } }

  // Perte de contexte : on prévient l'application, qui bascule sur le repli sans perdre la navigation.
  let perteExt = null;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); perdu = true; if (boucle) cancelAnimationFrame(boucle); boucle = null; plongee.fin?.(); plongee.fin = null; plongee.phase = 'repos'; tasse.fin?.(); tasse.fin = null; tasse.phase = 'repos'; tiroir.fin?.(); tiroir.fin = null; tiroir.phase = 'repos'; sucre.terminer(); cafe.finir(); rappels.panne('contexte graphique perdu'); });
  canvas.addEventListener('webglcontextrestored', () => {
    // Textures, maillages et cibles sont renvoyés au GPU par three.js : rien à recalculer, la lumière est cuite.
    // Seul le reflet du café, rendu dans une cible que three.js recrée vide, doit être capturé de nouveau.
    perdu = false; dernierCurseur = -1; chauffe = 1.5; cafe.capturer();
    rappels.retabli(); demarrer();
  });

  // --- Le ciel : ambiance cuite, météo, dates (état calculé par js/ciel.js, côté page) ---
  const NOMS = { nuit: 'la nuit', jour: 'en plein jour', doree: 'en fin d\u2019après-midi dorée', crepuscule: 'au crépuscule' };
  const METEOS = { degage: 'sous un ciel dégagé', nuages: 'sous les nuages', pluie: 'sous la pluie', averse: 'sous une averse', orage: 'pendant un orage', brouillard: 'dans le brouillard', neige: 'sous la neige' };
  function appliquerCiel(e) {
    etatCiel = e;
    const amb = ciel.jeu || e.ambiance, T = ciel.teintes(amb);
    ciel.appliquer({ ...e, ambiance: amb }, reglages); ciel.reglerPluie(pluie, vitreMat, amb);
    piece.cible.lampe = amb === 'nuit' || amb === 'crepuscule' ? 1 : 0;
    pieuvre?.ambiance(amb);
    piece.cible.ecran = e.piece.ecran; piece.cible.vapeur = e.piece.vapeur;
    finition.uniforms.uVoile.value = T.voile; bloom.strength = T.bloom;
    canvas.setAttribute('aria-label', `L'atelier MajorTakito, ${NOMS[amb]}, ${METEOS[e.meteo]}`);
    demarrer();
  }
  // Change le ciel. Une autre ambiance télécharge SON jeu de textures, maintenant et pas avant, puis se fond dans
  // la pièce (duree en ms ; 0 : d'un coup, toujours en mouvement réduit).
  async function ambiance(e, { duree = 1200 } = {}) {
    const n = ++demandeCiel;
    if (e.ambiance !== ciel.jeu) {
      const jeu = await chargerJeu(baseModele, D, e.ambiance, { leger });
      if (n !== demandeCiel) { for (const t of Object.values(jeu.atlas)) t.dispose(); jeu.dehors.dispose(); return etatDuCiel(); }
      const fin = ciel.fondreVers(jeu, reglages.mouvementReduit ? 0 : duree);
      demarrer(); appliquerCiel(e);
      await fin;
    }
    appliquerCiel(e);
    return etatDuCiel();
  }
  function reglerHorloge(h) {
    if (h === heureEcran) return;
    heureEcran = h;
    const anciens = [...ecransRepos];
    ecransRepos[0] = T.ecran(contenu.site, true, h); ecransRepos[1] = T.ecran(contenu.site, false, h);
    materiauEcran.uniforms.tEcran.value = ecransRepos[Math.max(0, dernierCurseur)];
    for (const t of anciens) t.dispose();
    demarrer();
  }
  function etatDuCiel() {
    return { ambiance: ciel.jeu, demandee: etatCiel?.ambiance, meteo: etatCiel?.meteo, effets: [...ciel.effets], enFondu: ciel.enFondu, eclair: eclairCourant,
      lampe: +piece.lampe.toFixed(3), ecran: +piece.ecran.toFixed(3), vapeur: +piece.vapeur.toFixed(3), heure: heureEcran,
      journalEclairs: ciel.journalEclairs(), eclairsPrevus: ciel.eclairsPrevus().slice(0, 12), images, lune: projeterCiel(...ciel.placeLune()) };
  }
  // Pour les essais : où tombe à l'écran un point de l'image de la ville (la lune, une gerbe), et ce qui le cache.
  function projeterCiel(u, v) {
    const p = ciel.surPlan(u, v).project(camera), x = (p.x * 0.5 + 0.5) * L, y = (-p.y * 0.5 + 0.5) * Hh;
    ndc.set(p.x, p.y); rayon.setFromCamera(ndc, camera); rayon.far = 8;
    const h = rayon.intersectObjects([statiques, ...Object.values(groupes), vitre], true)[0]; ndc.set(9, 9);
    // Vue par la fenêtre : le premier objet touché est la vitre (rien de la pièce devant).
    return { u, v, x: +x.toFixed(1), y: +y.toFixed(1), dansCadre: Math.abs(p.x) < 1 && Math.abs(p.y) < 1, parLaVitre: h?.object === vitre };
  }
  if (cielInitial) appliquerCiel(cielInitial);

  redimensionner();
  if (niveau !== 'haute') appliquerQualite(niveau);
  conteneur.dataset.qualite = niveau;
  cadrer(null);
  pose.t = 1;
  // Le reflet du café est capturé maintenant, et tous les programmes (café, goutte, mousse) sont compilés avant la
  // première image : rien ne se compile au moment du clic sur la tasse.
  cafe.capturer(); renderer.compile(scene, camera);
  // Première image synchrone : la scène apparaît d'un coup, sans écran de chargement.
  horloge.getDelta(); image();
  // Sa place se lit dans la pièce, jamais à la main : sur le casier, juste à gauche de l'appareil photo. S'ils bougent, elle
  // suit. Sa hauteur est celle du dessus du casier, sous son centre.
  const placePieuvre = () => {
    const casier = boiteDe(groupes.casier), appareil = boiteDe(groupes.appareil), x = appareil.min.x - EMPRISE_PIEUVRE, z = (casier.min.z + casier.max.z) / 2;
    const h = new THREE.Raycaster(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0, -1, 0)).intersectObject(groupes.casier, true)[0];
    // Son entrée part de derrière le casier : DERRIERE_PIEUVRE, un pas de côté pour ne pas partir du serveur, juste à sa gauche, et sous le niveau du plateau : au téléphone,
    // plus grande et vue de plus haut, son chapeau dépasserait du casier avant le saut.
    return { x, z, sol: h ? h.point.y : casier.max.y, echelle: disposition === 'portrait' ? ECHELLE_TEL_PIEUVRE : 1, derriere: { x: x + DERRIERE_PIEUVRE.x, y: casier.min.y - DERRIERE_PIEUVRE.y, z: casier.min.z - DERRIERE_PIEUVRE.z } };
  };
  // La mini-pieuvre vient bien après la première image : sans KHR_parallel_shader_compile (rendu logiciel), compiler ses
  // programmes bloque le fil principal 2 à 3 s. Elle attend donc la fin de l'entrée, puis une caméra au repos : ce blocage
  // ne tombe jamais sur le premier clic ni sur un trajet. ?pieuvre=non l'écarte (comparaisons au pixel) ; une panne de
  // chargement ne se voit pas, elle n'est qu'un plus.
  if (parametres.get('pieuvre') !== 'non') {
    const charger = () => import('./pieuvre.js').then(({ creerPieuvre }) => creerPieuvre({ scene, renderer, camera, base: baseModele, place: placePieuvre(), email: solSucre.email, posLampe, demarrer }))
      .then((p) => { pieuvre = p; if (telephone) p.ajusterZone(camera, L, Hh); if (etatCiel) p.ambiance(ciel.jeu || etatCiel.ambiance); rappels.pieuvre?.(p); demarrer(); })
      .catch((e) => console.warn('mini-pieuvre absente :', e.message));
    const auCalme = () => { if (occupe() || pose.t < 1) setTimeout(auCalme, 500); else charger(); };
    setTimeout(auCalme, DELAI_PIEUVRE);
  }

  const ndcCafe = new THREE.Vector2();
  return {
    cadrer,
    entrerTasse, sortirTasse, rectanglesCafe,
    // La carte de visite, posée sur le plateau, dans la vue d'arrivée sans rendu : le lien s'y pose. Sans recadrer : hors champ, null (écran étroit).
    rectangleCarte() {
      camTasse.aspect = camera.aspect; camTasse.updateProjectionMatrix();
      const T = poseTasse(camTasse); camTasse.position.copy(T.pos); camTasse.quaternion.copy(T.quaternion); camTasse.updateMatrixWorld(true);
      const b = boiteDe(groupes.visite), xs = [], ys = [];
      for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) { const p = new THREE.Vector3(x, b.max.y, z).project(camTasse); xs.push((p.x + 1) * L / 2); ys.push((1 - p.y) * Hh / 2); }
      const r = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      return r.left >= 0 && r.top >= 0 && r.left + r.width <= L && r.top + r.height <= Hh ? r : null;
    },
    // Aucune proposition servie : la tasse ne se vise plus (ni main, ni survol, ni clic).
    tasseInerte() { groupes.tasse.traverse((m) => { if (m.isMesh) m.userData.objet = null; }); sucre.maillage.userData.objet = null; },
    // Le sucre, depuis la vue du dessus. Clic ou clavier : il tombe de l'établi. Glisser : saisir, porter, lâcher.
    ajouterSucre({ phrases, direct = reglages.mouvementReduit }) { return tasse.phase === 'arrivee' ? lacherSucre(undefined, { phrases, direct }) : Promise.resolve(null); },
    saisirSucre() { if (tasse.phase !== 'arrivee') return false; sucre.saisir(); demarrer(); return true; },
    porterSucre(x, y) { const p = pointPorte(x, y); if (p) { sucre.porter(p); demarrer(); } return !!p; },
    // Lâché au-dessus du café : il y tombe, là ; ailleurs, il retourne sur l'établi (null).
    lacherSucre(x, y, { phrases, direct = reglages.mouvementReduit }) {
      const p = pointPorte(x, y);
      if (!p || Math.hypot(p.x - posCafe.x, p.z - posCafe.z) > CAFE.rayon * 0.95) { sucre.reposer(); demarrer(); return null; }
      return lacherSucre([(p.x - posCafe.x) / CAFE.rayon, -(p.z - posCafe.z) / CAFE.rayon], { phrases, direct });
    },
    reposerSucre() { sucre.reposer(); demarrer(); },
    survolSucre(oui) { sucre.survol(oui); demarrer(); },
    // Rectangle du sucre posé dans la vue d'arrivée, sans rendu (le bouton s'y pose dès l'arrivée).
    rectangleSucre() {
      if (sucre.phase === 'tenu' || sucre.phase === 'retour') return sucre.rectangle(camera, L, Hh);
      camTasse.aspect = camera.aspect; camTasse.updateProjectionMatrix();
      const T = poseTasse(camTasse); camTasse.position.copy(T.pos); camTasse.quaternion.copy(T.quaternion); camTasse.updateMatrixWorld(true);
      return sucre.rectangle(camTasse, L, Hh);
    },
    etatSucre() { return { phase: sucre.phase, boite: sucre.boite(), rectangle: this.rectangleSucre(), paroi: sucre.dansLaParoi() }; },
    // Pour les essais : à chaque image, le sucre est-il passé dans la paroi ? (compteur remis à zéro à la lecture)
    paroiSucre() { const n = paroiVue; paroiVue = 0; return n; },
    trajetSucre() { return sucre.trajet(); },
    // Pour les essais : le sucre posé repose à plat sur l'établi (sous chaque coin, la même hauteur, la sienne) et
    // ne touche aucun objet.
    contactsSucre() {
      const m = sucre.maillage; m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m), r = new THREE.Raycaster(), bas = new THREE.Vector3(0, -1, 0), sous = [];
      for (const [x, z] of [[b.min.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]]) {
        r.set(new THREE.Vector3(x, 0.5, z), bas); const h = r.intersectObject(statiques, true)[0]; sous.push(h ? +h.point.y.toFixed(5) : null);
      }
      return { bas: +b.min.y.toFixed(5), sous, touche: Object.entries(groupes).filter(([, g]) => boiteDe(g).intersectsBox(b)).map(([id]) => id), phase: sucre.phase };
    },
    // Pour les essais : dans la vue d'arrivée (format actuel), chaque sommet du sucre posé est-il dans l'image, et
    // vu sans que la tasse le cache ? (Le sucre n'est jamais recouvert par le bord, quel que soit l'écran.)
    verifierSucre() {
      camTasse.aspect = camera.aspect; camTasse.updateProjectionMatrix();
      const T = poseTasse(camTasse); camTasse.position.copy(T.pos); camTasse.quaternion.copy(T.quaternion); camTasse.updateMatrixWorld(true);
      const m = sucre.maillage; m.updateMatrixWorld(true);
      const pos = m.geometry.attributes.position, p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Raycaster();
      // Le dessus doit être vu entier ; sur le flanc tourné vers la tasse, le bord peut en masquer une bande (comme en
      // vrai, vu d'en haut), jamais le dessus.
      let hors = 0, caches = 0, cachesFlanc = 0, marge = Infinity;
      const dessus = SUCRE.hauteur / 2 * 0.95;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        const flanc = p.y < dessus;
        p.applyMatrix4(m.matrixWorld);
        q.copy(p).project(camTasse); marge = Math.min(marge, 1 - Math.abs(q.x), 1 - Math.abs(q.y));
        if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1) hors++;
        const d = p.clone().sub(camTasse.position), l = d.length(); r.set(camTasse.position, d.normalize()); r.far = l - 1e-4;
        if (r.intersectObject(groupes.tasse, true).length) { if (flanc) cachesFlanc++; else caches++; }
      }
      return { sommets: pos.count, hors, caches, cachesFlanc, marge: +marge.toFixed(4), aspect: +camera.aspect.toFixed(3), hauteur: +T.pos.y.toFixed(4) };
    },
    // Captures : arrête l'horloge du sucre (vrai) ; avancerSucre(dt) la fait avancer d'un pas exact.
    figerSucre(oui) { sucreFige = oui; },
    avancerSucre(dt) { sucre.mettreAJour(dt, { anime: !reglages.mouvementReduit, lampe: piece.lampe, onde: ondeSucre }); demarrer(); },
    etatTasse() { return { phase: tasse.phase, t: tasse.t, cafe: cafe.lire() }; },
    // Pour les essais : l'ouverture du rabat de la lettre (radians) et la position de son cachet à l'écran.
    // Pour les essais : la fiche « Mon parcours » repose à plat sur l'établi, ne touche aucun objet ni le sucre, et
    // chaque point de sa face est vu depuis la place du visiteur (rien ne la cache).
    contactsFiche() {
      const c = fiche.contacts(), b = new THREE.Box3(new THREE.Vector3().fromArray(c.boite.min), new THREE.Vector3().fromArray(c.boite.max));
      const touche = Object.entries(groupes).filter(([id, g]) => id !== 'parcours' && boiteDe(g).intersectsBox(b)).map(([id]) => id);
      if (sucre.phase === 'pose' && boiteDe(sucre.maillage).intersectsBox(b)) touche.push('sucre');
      const cam = new THREE.PerspectiveCamera(D.camera.fov, camera.aspect, 0.01, 60); const P = poseDe(null); cam.position.copy(P.pos); cam.lookAt(P.cible); cam.updateMatrixWorld(true);
      const r = new THREE.Raycaster(), m = fiche.maillage, pos = m.geometry.attributes.position, p = new THREE.Vector3(); let vus = 0, caches = 0;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i); if (p.y <= 0) continue; p.applyMatrix4(m.matrixWorld);
        const d = p.clone().sub(cam.position), l = d.length(); r.set(cam.position, d.normalize()); r.far = l - 1e-4;
        if (r.intersectObjects([statiques, ...Object.entries(groupes).filter(([id]) => id !== 'parcours').map(([, g]) => g)], true).length) caches++; else vus++;
      }
      return { ...c, touche, vus, caches };
    },
    // Pour les essais : le papillon recouvert (null : introuvable dans la cuisson).
    penseBete() { return penseBete ? penseBete.lire() : null; },
    etatLettre() { return { rabat: charniere?.angle ?? null, survol: surlignage.lettre.h }; },
    // Pour les essais : la boîte exacte d'un objet (sans marge), en coordonnées du monde.
    boiteObjet(id) { const b = boiteDe(groupes[id]); return { min: b.min.toArray(), max: b.max.toArray() }; },
    // Les propositions arrivent du HTML (liens servis par le build) : la mousse écrit exactement ce que lisent les liens.
    preparerCafe(phrases) { const p = cafe.preparer(phrases); demarrer(); return p; },
    survolCafe(i) { cafe.survol(i); demarrer(); },
    // Le doigt ou la souris sur le café : des ronds là où il passe (jamais en mouvement réduit).
    pointeurCafe(x, y) {
      if (reglages.mouvementReduit || tasse.phase !== 'arrivee') return false;
      const r = canvas.getBoundingClientRect(); ndcCafe.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
      const ok = cafe.pointeur(ndcCafe, camera, performance.now()); if (ok) demarrer(); return ok;
    },
    // Captures et essais : fige le travelling (u ∈ [0, 1]) ou l'horloge du café (secondes) ; null les rend.
    figerTasse(u) { tasse.fige = u; demarrer(); },
    figerCafe(t) { cafe.figer(t); demarrer(); },
    ondeCafe(x, y, a) { cafe.onde(x, y, a); demarrer(); },
    // Pour les essais : le travelling, du plan d'accueil au-dessus de la tasse, ne traverse aucun objet.
    // Départs possibles : le plan d'accueil et le gros plan de chaque objet (un panneau ouvert, puis clic sur la tasse).
    verifierTasse() {
      const cam = new THREE.PerspectiveCamera(D.camera.fov, camera.aspect, 0.01, 60), problemes = [];
      cam.position.copy(base.pos); cam.lookAt(base.cible); cam.updateMatrixWorld(true);
      const arrivee = poseTasse(cam);
      for (const id of [null, ...CADRABLES]) {
        const A = poseDe(id); cam.position.copy(A.pos); cam.lookAt(A.cible);
        const depart = { pos: A.pos.clone(), quaternion: cam.quaternion.clone(), fov: A.fov };
        for (let i = 0; i <= 40; i++) { placerTasse(i / 40, depart, arrivee, cam); const o = dansDecor(cam.position); if (o) problemes.push(`${id || 'accueil'}, u=${(i / 40).toFixed(3)} : ${o}`); }
      }
      return { ok: !problemes.length, problemes, departs: CADRABLES.length + 1, arrivee: arrivee.pos.toArray() };
    },
    entrerTiroir, sortirTiroir, rectanglesObjectifs, entrerCaisson, entrerFisheye,
    // Pour les essais : le morceau de sucre à l'écran, dans la vue actuelle.
    pixelSucre() { const b = new THREE.Box3().setFromObject(sucre.maillage).getCenter(new THREE.Vector3()).project(camera); return [(b.x + 1) * L / 2, (1 - b.y) * Hh / 2]; },
    sursaut(id, ms = 420) { if (surlignage[id]) { sursauts.set(id, { fin: performance.now() + ms, vu: false }); demarrer(); } },
    finirSursauts() { sursauts.clear(); demarrer(); },
    // Pour les essais : les objets dont le survol a vraiment joué.
    etatSursauts() { return [...sursautes]; },
    sourisFisheye(x, y) { fisheye.inst?.souris(x, y); demarrer(); },
    // Pour les essais : l'objectif chargé, ce qu'il a demandé, et la part du petit côté de l'écran que la lentille occupe dans la vue actuelle.
    etatFisheye() {
      const F = fisheye.inst; if (!F) return { charge: false };
      const c = lentille().project(camera), b = lentille().add(new THREE.Vector3(0, 1, 0).cross(F.axe).setLength(F.rayon)).project(camera);
      return { charge: true, axe: F.axe.toArray(), verre: lentille().toArray(), remplissage: +(2 * Math.hypot((b.x - c.x) * L / 2, (b.y - c.y) * Hh / 2) / Math.min(L, Hh)).toFixed(3), ...F.etat() };
    },
    basculerSecret: () => basculer('tiroir:secret'), basculerSurprise: () => basculer('tiroir:surprise'),
    get vueCaisson() { return vueCaisson; },
    // Pour les essais : depuis la vue d'arrivée (format actuel), chaque verre est-il dans l'image, et vu sans que le plateau le cache ?
    verifierTiroir(id) {
      camTiroir.aspect = camera.aspect; camTiroir.updateProjectionMatrix();
      const T = poseTiroir(camTiroir, id), R = reperesTiroir(id); camTiroir.position.copy(T.pos); camTiroir.quaternion.copy(T.quaternion); camTiroir.updateMatrixWorld(true);
      const r = new THREE.Raycaster(), hors = [], caches = [];
      for (const [i, o] of R.objectifs.entries()) {
        const c = new THREE.Vector3().fromArray(o.centre).addScaledVector(axeTiroir, R.course), n = c.clone().project(camTiroir);
        if (Math.abs(n.x) > 1 || Math.abs(n.y) > 1) hors.push(i);
        const d = c.clone().sub(camTiroir.position), l = d.length(); r.set(camTiroir.position, d.normalize()); r.far = l - 0.002;
        // Le groupe du tiroir est fermé ici : le décor fixe (plateau, ceinture, caisson, casier) ou un autre tiroir resté tiré peuvent cacher le verre.
        if (r.intersectObjects([statiques, ...(groupes.casier ? [groupes.casier] : []), ...Object.keys(petits).map((k) => groupes[k])], true).length) caches.push(i);
      }
      return { hors, caches, hauteur: +T.pos.y.toFixed(3), aspect: +camera.aspect.toFixed(3) };
    },
    viserObjectif(i) { vitrines[tiroir.id]?.viser(i); demarrer(); },
    figerTiroir(u) { tiroir.fige = u; demarrer(); },
    etatTiroir() { return { id: tiroir.id, phase: tiroir.phase, t: tiroir.t, position: groupes[tiroir.id].position.toArray(), course: reperesTiroir().course, objectifs: vitrines[tiroir.id]?.etat(), secret: { ...petits['tiroir:secret'] }, surprise: { ...petits['tiroir:surprise'] } }; },
    etatCadres() { return cadres.etat(); },
    entrerTerminal, plongerTerminal, sortirTerminal, textureTerminal, journalTerminal, cadreArrivee,
    // La console de poche : la vue s'approche de son écran (et en revient par sortirTiroir) ; le rectangle de sa dalle à
    // l'arrivée, en pixels CSS, calculé sans rendu ; le relais (1 = la dalle peinte sous son verre, 0 = l'interface vivante
    // posée dessus, la dalle sans effet).
    entrerConsole, rectangleConsole, relaisConsole(v) { relaisConsole = v; demarrer(); },
    // Pour les essais : le centre de la console et un point de sa coque (bas de la console, sous l'écran) à l'écran, dans la vue actuelle.
    pixelsConsole() { const r = canvas.getBoundingClientRect(), E = consolePoche.ecran(), en = (p) => { p.project(camera); return [r.left + (p.x + 1) * L / 2, r.top + (1 - p.y) * Hh / 2]; };
      return { coins: consolePoche.coins().map(en), centre: en(E.centre.clone()), coque: en(E.centre.clone().addScaledVector(E.haut, -E.h * 0.72)) }; },
    // Pour les essais : la pose de la console (dessous, écart, boîte), ce qu'elle touche, et son zoom.
    etatConsole() {
      const e = consolePoche.etat(), b = new THREE.Box3(new THREE.Vector3().fromArray(e.boite.min), new THREE.Vector3().fromArray(e.boite.max));
      const touche = Object.entries(groupes).filter(([id, g]) => id !== 'console' && boiteDe(g).intersectsBox(b) && consolePoche.touche(g)).map(([id]) => id);
      if (sucre.phase === 'pose' && boiteDe(sucre.maillage).intersectsBox(b) && consolePoche.touche(sucre.maillage)) touche.push('sucre');
      return { ...e, touche, zoom: tiroir.poseur === poseConsole ? tiroir.phase : 'repos', relais: relaisConsole };
    },
    // Pour les captures : pose le regard (lacet, tangage) sans retour au repos, ou le rend avec null.
    figerRegard(x, y) { if (x === null) { regard.dernier = performance.now(); regard.fige = false; } else { regard.x = regard.lacet = x; regard.y = regard.tangage = y; regard.fige = true; } demarrer(); },
    // Pour les captures : fige la traversée à u ∈ [0, 1] (null la rend au temps réel).
    figerPlongee(u) { plongee.fige = u; demarrer(); },
    etatPlongee() { return { phase: plongee.phase, t: plongee.t, texture: !!plongee.texture, texturePeinte: !!plongee.texturePeinte }; },
    cadreTerminal() { return projeterDalle(camera); },
    // Une image, même en pause : après un redimensionnement, le terminal se recadre sous le bureau Rouille.
    rafraichir() { if (perdu) return; const p = enPause; enPause = false; if (boucle) { cancelAnimationFrame(boucle); boucle = null; } image(); enPause = p; if (p && boucle) { cancelAnimationFrame(boucle); boucle = null; } },
    // Compteur ?ips : durées réelles entre images rendues, gardées seulement en mémoire de la page.
    mesureIps() { return { durees: [...dernieresDurees], niveau, dpr: renderer.getPixelRatio(), pause: enPause }; },
    etatRegard() { return { lacet: regard.lacet, tangage: regard.tangage, x: regard.x, y: regard.y, positionFixe: !focus && !occupe(), limites: { ...REGARD }, retour: RETOUR }; },
    recentrer,
    // Pour les essais : le long des bornes du regard (coins, haut de l'ellipse, centre), la part de l'image occupée par le bureau.
    verifierRegard() {
      const coins = [[0, 0], [0, REGARD.hautCentre], [REGARD.lacet / 2, hautMax(REGARD.lacet / 2)], [-REGARD.lacet / 2, hautMax(REGARD.lacet / 2)],
        [REGARD.lacet, REGARD.haut], [-REGARD.lacet, REGARD.haut], [REGARD.lacet, -REGARD.bas], [-REGARD.lacet, -REGARD.bas]]
        .map(([l, t]) => ({ lacet: l, tangage: t, part: +partBureau(l, t).toFixed(3) }));
      return { ok: coins.every((x) => x.part >= PART_BUREAU), seuil: PART_BUREAU, aspect: +camera.aspect.toFixed(3), disposition, coins };
    },
    partBureau,
    // Pour les essais : le champ du dehors vu par la vitre, depuis le plan d'accueil aux bornes du regard et depuis le
    // gros plan de chaque objet (azimut et élévation ; ok s'il reste dans l'étendue bâtie de la ville).
    verifierDehors() {
      const cam = new THREE.PerspectiveCamera(base.fov, camera.aspect, 0.01, 60), poses = [];
      for (const [l, t] of [[0, 0], [0, REGARD.hautCentre], [REGARD.lacet, REGARD.haut], [-REGARD.lacet, REGARD.haut], [REGARD.lacet, -REGARD.bas], [-REGARD.lacet, -REGARD.bas]]) {
        cam.fov = base.fov; cam.position.copy(base.pos); cam.lookAt(base.cible);
        const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); e.y += l; e.x += t; e.z = 0;
        cam.quaternion.setFromEuler(e); cam.updateProjectionMatrix(); poses.push({ pose: `regard ${l} ${t}`, ...champDehors(cam) });
      }
      for (const id of CADRABLES) {
        const P = poseDe(id); cam.fov = P.fov; cam.position.copy(P.pos); cam.lookAt(P.cible); cam.updateProjectionMatrix();
        poses.push({ pose: id, ...champDehors(cam) });
      }
      return { ok: poses.every((p) => p.ok), disposition, etendue: etendueVille, poses };
    },
    // Pour les essais : une mire (des ronds de 0,4 m tous les mètres, sur fond noir) à la place de la ville, et où la
    // caméra courante doit voir chaque rond à travers la vitre (centre et demi-axes en pixels CSS, null s'il est caché).
    motifDehors(actif) {
      if (!actif) { if (loin.userData.vraie) { loin.material.dispose(); loin.material = loin.userData.vraie; loin.userData.vraie = null; } loin.visible = false; ville.groupe.visible = true; demarrer(); return null; }
      const c = document.createElement('canvas'); c.width = Math.round(de.largeur * 100); c.height = Math.round(de.hauteur * 100);
      const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff';
      const ronds = [];
      for (let x = 0.5; x < de.largeur; x += 1) for (let y = 0.5; y < de.hauteur; y += 1) {
        g.beginPath(); g.arc(x * 100, c.height - y * 100, 20, 0, Math.PI * 2); g.fill(); ronds.push([x / de.largeur, y / de.hauteur]);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      if (!loin.userData.vraie) loin.userData.vraie = loin.material;
      loin.material = new THREE.MeshBasicMaterial({ map: t, fog: false }); loin.visible = true; ville.groupe.visible = false; demarrer();
      const r = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(), cibles = [statiques, ...Object.values(groupes), vitre];
      const ecran = (p) => { const n = p.clone().project(camera); return [(n.x + 1) / 2 * r.width, (1 - n.y) / 2 * r.height]; };
      const monde = (u, v) => loin.localToWorld(new THREE.Vector3((u - 0.5) * de.largeur, (v - 0.5) * de.hauteur, 0));
      camera.updateMatrixWorld(true);
      return ronds.map(([u, v]) => {
        const du = 0.2 / de.largeur, dv = 0.2 / de.hauteur;
        const bords = [[u - du, v], [u + du, v], [u, v - dv], [u, v + dv], [u, v]].map(([a, b]) => monde(a, b));
        // Visible si le rayon vers chaque bord et le centre touche d'abord la vitre (ni cadre, ni objet devant).
        const libre = bords.every((p) => { ray.set(camera.position, p.clone().sub(camera.position).normalize()); return ray.intersectObjects(cibles, true)[0]?.object === vitre; });
        const [g0, d0, b0, h0, c0] = bords.map(ecran);
        if (!libre || [g0, d0, b0, h0].some(([x, y]) => x < 0 || y < 0 || x > r.width || y > r.height)) return null;
        return { u, v, x: c0[0], y: c0[1], rx: Math.abs(d0[0] - g0[0]) / 2, ry: Math.abs(b0[1] - h0[1]) / 2 };
      });
    },
    // Pour les essais (tests/ville.mjs) : la ville vue depuis une pose quelconque. image() rend le dehors SEUL hors écran
    // (sans la pièce, la vitre ni le post-traitement), `sur` fois plus large au même cadrage (une arête verticale se
    // mesure alors au quart de pixel, pas en escalier) et garde ses pixels dans window.__imageVille (lignes du bas vers le
    // haut) ; projeter() donne le pixel d'un point du monde ; distance() la distance de la ville sous un pixel.
    villeEssai: {
      desc: () => ({ oeil: ville.desc.oeil, rue: ville.desc.rue, profil: ville.desc.profil, fenetres: ville.desc.fenetres, reperes: ville.desc.reperes,
        base: { pos: base.pos.toArray(), cible: base.cible.toArray(), fov: base.fov }, disposition }),
      mire: (actif) => { const m = ville.mire(actif); demarrer(); return m; },
      image(pose, { l = 1280, h = 900, sur = 1, halos = true } = {}) {
        const cam = camEssai(pose, l, h), rt = new THREE.WebGLRenderTarget(l * sur, h), caches = [], fond = scene.background;
        // La ville seule (ou la mire seule, sur du noir) : ni pluie, ni neige, ni guirlandes.
        for (const o of scene.children) if (o.layers.mask === 1 << DEHORS && o !== ville.groupe && o.visible) { o.visible = false; caches.push(o); }
        if (!halos) for (const o of [ville.halos, ville.balises]) if (o.visible) { o.visible = false; caches.push(o); }
        scene.background = new THREE.Color(0);
        rendreDehors(rt, cam);
        const px = new Uint8Array(l * sur * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, l * sur, h, px);
        scene.background = fond; for (const o of caches) o.visible = true; rt.dispose(); renderer.setRenderTarget(null);
        window.__imageVille = { l, h, sur, px };
        return { l, h, sur };
      },
      projeter(pose, p, { l = 1280, h = 900 } = {}) {
        const v = new THREE.Vector3().fromArray(p).project(camEssai(pose, l, h));
        return [(v.x + 1) / 2 * l, (1 - v.y) / 2 * h, v.z];
      },
      distance(pose, x, y, { l = 1280, h = 900 } = {}) {
        const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(x / l * 2 - 1, 1 - y / h * 2), camEssai(pose, l, h)); r.far = 6000; r.layers.set(DEHORS);
        const t = r.intersectObjects(ville.maillages, false)[0]; return t ? t.distance : null;
      },
    },
    // Pour le film du café renversé (tools/film-cafe-site.mjs) : le café vivant, son sucre et ses perles SEULS, vus d'une
    // caméra du film, hors écran, sans post-traitement, sur fond transparent. Le film les incruste à son départ : son café
    // est alors celui du site par construction (mousse écrite, nuage, ondes, reflet), au lieu d'une copie de ce shader.
    // Rendu `sur` fois plus grand en flottants, puis réduit et encodé en sRGB comme l'OutputPass le ferait : le café sombre
    // ne passe jamais par 8 bits linéaires (bandes). Rend une image PNG non prémultipliée (couleur, couverture en alpha).
    cafeEssai: {
      image({ pos, vise, haut, fov }, { l = 1920, h = 800, sur = 2 } = {}) {
        const cam = new THREE.PerspectiveCamera(fov, l / h, 0.001, 10); cam.position.fromArray(pos); cam.up.fromArray(haut);
        cam.lookAt(new THREE.Vector3().fromArray(vise)); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
        const grand = new THREE.WebGLRenderTarget(l * sur, h * sur, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        const petit = new THREE.WebGLRenderTarget(l, h, { type: THREE.UnsignedByteType });
        // Le café prend son horloge figée (figerCafe) sans rendre toute la page : mousse, nuage et ondes à l'instant voulu. Un rendu complet par image coûtait des
        // secondes au format du film, sous rendu logiciel.
        const l_ = cafe.lire(); cafe.mettreAJour(0, { anime: !reglages.mouvementReduit, bombe: l_.bombe, mousse: l_.mousse, enVue: true });
        const gardes = new Set([cafe.maillage, sucre.maillage, ...sucre.perles]), caches = [], fond = scene.background, brume = scene.fog;
        scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !gardes.has(o)) { o.visible = false; caches.push(o); } });
        scene.background = null; scene.fog = null;
        const clair = renderer.getClearColor(new THREE.Color()), clairA = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(grand); renderer.clear(); renderer.render(scene, cam);
        // Réduction : moyenne des couleurs couvertes (alpha 1 : tous ces matériaux sont opaques), puis encodage sRGB.
        const reduire = new THREE.ShaderMaterial({ uniforms: { t: { value: grand.texture }, n: { value: sur }, px: { value: new THREE.Vector2(1 / (l * sur), 1 / (h * sur)) } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
          fragmentShader: `uniform sampler2D t; uniform int n; uniform vec2 px; varying vec2 vUv;
            vec3 enc(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
            void main(){ vec4 s = vec4(0.); vec2 o = vUv - px * float(n - 1) * .5;
              for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) if (i < n && j < n) s += texture2D(t, o + px * vec2(float(i), float(j)));
              s /= float(n * n); gl_FragColor = s.a > 0. ? vec4(enc(clamp(s.rgb / s.a, 0., 1.)), s.a) : vec4(0.); }`, depthTest: false, depthWrite: false });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), reduire), sc = new THREE.Scene(); sc.add(quad);
        renderer.setRenderTarget(petit); renderer.clear(); renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
        const px = new Uint8Array(l * h * 4); renderer.readRenderTargetPixels(petit, 0, 0, l, h, px);
        renderer.setRenderTarget(null); renderer.setClearColor(clair, clairA); scene.background = fond; scene.fog = brume;
        for (const o of caches) o.visible = true;
        grand.dispose(); petit.dispose(); reduire.dispose(); quad.geometry.dispose();
        // Lignes du bas vers le haut en WebGL : retournées pour l'image.
        const toile = document.createElement('canvas'); toile.width = l; toile.height = h; const c2 = toile.getContext('2d'), im = c2.createImageData(l, h);
        for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * l * 4, (h - y) * l * 4), y * l * 4);
        c2.putImageData(im, 0, 0); demarrer();
        return toile.toDataURL('image/png');
      },
      // Où le sucre touche le café (unités du disque) et le centre du disque dans le monde : le film y pose son onde.
      repere: () => ({ centre: posCafe.toArray(), rayon: CAFE.rayon }),
    },
    // Le film du café renversé (site/js/film-cafe.js). video : un <video> déjà décodé ; distance et champ : la caméra du film à son image 0
    // (film.json, depart) ; rapport : largeur / hauteur du film. La caméra du site doit être sur la vue du dessus.
    film: {
      montrer(video, { distance, champ, rapport, teinte = [1, 1, 1], fondu = 8 / 24 }) {
        if (perdu) return false;
        Object.assign(film, { video, distance, champ, rapport, fondu, debut: performance.now() }); passeFilm.uniforms.uTeinte.value.fromArray(teinte);
        passeFilm.uniforms.uMelange.value = fondu > 0 ? 0 : 1;
        passeFilm.uniforms.uVideo.value = 1;
        film.texture = new THREE.VideoTexture(video); film.texture.colorSpace = THREE.SRGBColorSpace; film.texture.generateMipmaps = false;
        film.texture.minFilter = film.texture.magFilter = THREE.LinearFilter;
        passeFilm.uniforms.tFilm.value = film.texture; passeFilm.uniforms.uNoir.value = 0; placerFilm();
        passeFilm.enabled = true; finition.uniforms.uFilm.value = 1; demarrer();
        return true;
      },
      // La dernière image du film, en image fixe (encoder.py, fin-large.webp) : à la fin ou quand on passe le film, sans dépendre d'une recherche
      // dans la vidéo (un hôte sans plages d'octets la laisse à 0, et la fin d'une vidéo peut rendre une image noire).
      figer(image) {
        if (!film.video || !image) return false;
        const t = new THREE.Texture(image); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
        passeFilm.uniforms.uVideo.value = 0;
        film.texture?.dispose(); film.texture = t; passeFilm.uniforms.tFilm.value = t; demarrer(); return true;
      },
      cacher() {
        passeFilm.enabled = false; renduPiece.enabled = true; finition.uniforms.uFilm.value = 0;
        film.texture?.dispose(); film.texture = null; film.video = null; passeFilm.uniforms.tFilm.value = null; demarrer();
      },
      get actif() { return !!film.video; },
      get source() { return film.texture?.isVideoTexture ? 'video' : film.texture ? 'image' : null; },
      // Pour les essais : le rectangle du film à l'écran (fractions de l'écran, origine en bas à gauche, comme le shader).
      rectangle: () => ({ centre: passeFilm.uniforms.uCentre.value.toArray(), taille: passeFilm.uniforms.uTaille.value.toArray() }),
    },
    // Pour les essais : le rectangle de la vitre à l'écran, tel que le voit la caméra.
    rectangleVitre() {
      camera.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(vitre), v = new THREE.Vector3(); let g = Infinity, d = -Infinity, h = Infinity, bas = -Infinity;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) { v.set(x, y, b.min.z).project(camera); const px = (v.x + 1) / 2 * L, py = (1 - v.y) / 2 * Hh; g = Math.min(g, px); d = Math.max(d, px); h = Math.min(h, py); bas = Math.max(bas, py); }
      return { g, d, h, b: bas };
    },
    rendu() { return { appels: renderer.info.render.calls, triangles: renderer.info.render.triangles, programmes: renderer.info.programs?.length ?? null }; },
    // Ce que pèse la pièce cuite : atlas choisis (ordinateur ou téléphone), géométrie.
    modele() { return { leger, atlas: D.atlas, octetsGeometrie: D.octets_geometrie, echantillons: D.echantillons, triangles: D.maillages.reduce((s, m) => s + m.triangles, 0) }; },
    reglages(r) { reglages = { ...reglages, ...r }; if (reglages.mouvementReduit) { pose.t = 1; pose.decalage.copy(pose.decalageVers); } if (etatCiel) appliquerCiel(etatCiel); demarrer(); },
    ambiance, horloge: reglerHorloge, etatDuCiel,
    surTonnerre: (fn) => ciel.surTonnerre(() => { pieuvre?.evenement('tonnerre'); fn(); }),
    // Pour les essais : la pieuvre (null tant qu'elle n'est pas chargée, ou si son chargement a échoué).
    pieuvre: () => pieuvre,
    // Où elle est à l'écran, null tant qu'elle n'y paraît pas : les étiquettes s'écartent d'elle.
    rectPieuvre: () => (pieuvre?.groupe.visible ? pieuvre.silhouette(camera, L, Hh) : null),
    entrerPieuvre,
    // Où en est la vue vers elle : repos, aller, arrivee, retour.
    etatPieuvreZoom: () => (tiroir.pieuvre ? tiroir.phase : 'repos'),
    vueCourante: () => ({ camera, L, Hh }),
    // Le film du café la retire de la pièce et lui emprunte son couvre-chef. Tous deux muets tant qu'elle n'est pas là.
    masquerPieuvre(oui) { pieuvre?.masquer(oui); },
    maillageChapeau: () => pieuvre?.maillageChapeau() ?? null,
    chapeau: () => pieuvre?.chapeau() ?? null,
    survolerDepuisClavier(id, recentrer = false) {
      survolClavier = id;
      if (id && recentrer) {
        regard.x = regard.y = regard.vx = regard.vy = 0;
        // Au coin gauche, revenir au centre ferait disparaître la console qu'on vient d'atteindre avec Tab.
        if (id === 'console') {
          const orientation = (cible) => new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().lookAt(base.pos, cible, new THREE.Vector3(0, 1, 0)), 'YXZ');
          const a = orientation(base.cible), b = orientation(objets.console.ancre);
          regard.x = b.y - a.y; regard.y = b.x - a.x; borner(regard);
        }
      }
      demarrer();
    },
    // En pause, on annule aussi l'image déjà demandée : aucun rendu tant que l'onglet est caché.
    pause(p) { enPause = p; if (p && boucle) { cancelAnimationFrame(boucle); boucle = null; } if (!p) { horloge.getDelta(); chauffe = Math.max(chauffe, 1); demarrer(); } },
    get canvas() { return canvas; },
    // Pour les essais : progression de la transition et nombre d'images rendues.
    etatCamera() { return { t: pose.t, images, position: camera.position.toArray(), decalage: camera.view?.enabled ? [camera.view.offsetX, camera.view.offsetY] : [0, 0] }; },
    // Pour les essais : quel objet se trouve sous ce point de l'écran (même lancer de rayon que le clic).
    objetA(x, y) { const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)); const id = toucher(); ndc.set(9, 9); return id; },
    // Pour les essais : la carte des clics de la vue en cours, une grille de pas px lancée comme un vrai clic. Par objet : les points
    // de la grille où un clic l'atteint (coordonnées de la page).
    // La page respire entre deux lignes : sur le rendu logiciel, tout lancer d'un bloc la figerait une minute.
    async zonesClic(pas = 12) {
      const r = canvas.getBoundingClientRect(), z = {}, bas = Math.min(r.bottom, innerHeight);
      for (let y = Math.max(0, r.top) + pas / 2; y < bas; y += pas) {
        for (let x = pas / 2; x < r.right; x += pas) { const id = this.objetA(x, y); if (id) (z[id] ??= []).push([x, y]); }
        await new Promise((ok) => setTimeout(ok));
      }
      return z;
    },
    // Pour les essais : forcer la perte de contexte (simulation de panne graphique).
    simulerPanne() { perteExt = renderer.getContext().getExtension('WEBGL_lose_context'); if (perteExt) perteExt.loseContext(); },
    // Pour les essais : le navigateur rend le contexte (comme après un changement de carte graphique).
    simulerRetour() { perteExt?.restoreContext(); },
    // Qualité en cours. lenteur (ms) : essais seulement, ajoute un retard fictif à chaque image mesurée.
    qualite({ lenteur, resolution } = {}) {
      if (lenteur !== undefined) { lenteurEssai = lenteur; chauffe = 0; dernierChangement = 0; }
      // La recette peut comparer deux versions au même nombre de pixels, hors adaptation.
      if (qualiteFixe && Number.isFinite(resolution)) { renderer.setPixelRatio(THREE.MathUtils.clamp(resolution, .5, 2)); redimensionner(); }
      // cibles : largeur du tampon du compositeur et du canevas, égales tant que le compositeur suit la densité.
      return { niveau, fixe: !!qualiteFixe, dpr: renderer.getPixelRatio(), bloom: bloom.enabled, ombres: 'cuites', reflets: 'cuits', cibles: [composer.renderTarget1.width, canvas.width] };
    },
    // Pour les essais : chaque pose de cadrage et chaque trajet entre deux poses reste hors du décor,
    // et l'objet visé n'est caché par aucun autre.
    verifierCamera() {
      const ids = [null, ...CADRABLES], problemes = []; let poses = 0;
      const p = new THREE.Vector3(), r = new THREE.Raycaster();
      for (const a of ids) {
        const A = poseDe(a); poses++;
        const ou = dansDecor(A.pos); if (ou) problemes.push(`${a || 'accueil'} : caméra dans ${ou}`);
        if (a && a !== 'caisson') {
          const d = A.cible.clone().sub(A.pos); const dist = d.length(); r.set(A.pos, d.normalize()); r.far = dist;
          const h = r.intersectObjects(Object.values(groupes), true)[0];
          if (h && h.object.userData.objet !== a && !objets[a].groupe.getObjectById(h.object.id)) problemes.push(`${a} : masqué par ${h.object.userData.objet || 'décor'}`);
        }
        for (const b of ids) {
          if (a === b) continue; const B = poseDe(b);
          for (let i = 1; i < 20; i++) { const k = ease(i / 20); p.lerpVectors(A.pos, B.pos, k); p.y += Math.sin(k * Math.PI) * 0.05; const o = dansDecor(p); if (o) { problemes.push(`${a || 'accueil'} → ${b || 'accueil'} : traverse ${o}`); break; } }
        }
      }
      return { ok: problemes.length === 0, poses, trajets: ids.length * (ids.length - 1), disposition, problemes };
    },
  };
}
