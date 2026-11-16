// La géométrie est commune au navigateur et à Cycles : aucune seconde interprétation de la maquette.
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
export const LARGEUR = 0.075;
export const S = LARGEUR / GABARIT.coque.l;
const EPAISSEUR = 0.021;
// Couleurs de la maquette : coque crème grisée, cadre du thème ambre, rainures des fentes.
const COULEURS = { coque: '#c8c1b2', cadre: '#1c1b1f', fente: '#4a4640' };
// Le verre : bombé de 4 mm, à peine teinté.
export const VERRE = { fleche: 0.004, fume: 0.08, teinte: '#e8d9c0' };
// La place : le coin avant gauche du plateau, la console tournée vers le visiteur. Le plateau va de x = −1,08 au bord avant
// z = 0,26 (chanfrein de 8 mm) ; les dossiers commencent à x = −0,935 : l'emprise tient entre les deux (tests/console-poche.mjs).
export const PLACE = { centre: [-0.99, 0.145], lacet: 0.42 };

// Pixel de la maquette → repère de la console (x à droite, z vers le bas de l'écran, donc vers le visiteur).
const px = (x, y) => [(x - GABARIT.coque.l / 2) * S, (y - GABARIT.coque.h / 2) * S];

export function construireConsole({ THREE, mat, matNom, matDalle, matVerre, touches }) {
  const TOUCHES = touches;
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

// Le dôme : une plaque fine dont le milieu monte de `fleche`, comme la face d'un tube (bombée sur les deux axes).
function dome(l, h, fleche) {
  const g = new THREE.PlaneGeometry(l, h, 40, 80); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / (l / 2), w = p.getZ(i) / (h / 2); p.setY(i, fleche * (1 - u * u) * (1 - w * w)); }
  g.computeVertexNormals(); return g;
}

  const G = GABARIT, groupe = new THREE.Group(), corps = new THREE.Group(); groupe.name = 'console-poche'; corps.name = 'console-corps'; groupe.add(corps);
  // La coque : coin bas droit plus arrondi (70 px contre 22).
  corps.add(new THREE.Mesh(plaque(formePx({ x: 0, y: 0, ...G.coque }), EPAISSEUR, 0.0022), mat(COULEURS.coque, { brillant: 0.05 })));
  // Le cadre sombre, percé à la taille de l'écran : la dalle, posée plus bas que son dessus, y paraît enfoncée.
  const formeCadre = formePx(G.cadre), [ex, ez] = px(G.ecran.x + G.ecran.l / 2, G.ecran.y + G.ecran.h / 2);
  formeCadre.holes.push(new THREE.Path(formePx(G.ecran).getPoints(10)));
  const haut = EPAISSEUR, cadre = new THREE.Mesh(plaque(formeCadre, 0.0009, 0.0002), mat(COULEURS.cadre, { brillant: 0.08 }));
  cadre.position.y = haut - 0.0001; corps.add(cadre);
  const dessusCadre = haut + 0.0008;
  const nom = new THREE.Mesh(new THREE.PlaneGeometry(G.nom.l * S, G.nom.h * S).rotateX(-Math.PI / 2), matNom);
  const [nx, nz] = px(G.nom.x, G.nom.y); nom.position.set(nx, dessusCadre + 0.00004, nz); corps.add(nom);
  // La dalle et son verre.
  const dalle = new THREE.Mesh(new THREE.PlaneGeometry(G.ecran.l * S, G.ecran.h * S).rotateX(-Math.PI / 2), matDalle);
  dalle.position.set(ex, haut + 0.0001, ez); dalle.name = 'console-dalle'; corps.add(dalle);
  const verre = new THREE.Mesh(dome(G.ecran.l * S + 0.002, G.ecran.h * S + 0.002, VERRE.fleche), matVerre);
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

  return { groupe, corps, nom, dalle, verre, haut, dessusCadre };
}

// La dalle et le verre restent vivants ; le corps reçoit les texels et reflets de sa propre cuisson.
export function raccorderCorpsCuit({ corps, nom, dalle, verre, cuit }) {
  if (!cuit) return;
  for (const m of [...corps.children]) {
    if (m === nom || m === dalle || m === verre) continue;
    corps.remove(m); m.geometry.dispose(); m.material.dispose();
  }
  corps.updateWorldMatrix(true, true);
  corps.attach(cuit);
}
