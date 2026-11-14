// La fiche « Mon parcours » (lot portfolio-parcours, 29/10) : une fiche bristol posée à plat sur l'établi, à gauche
// de la tasse, de l'autre côté de la carte « Ce que je sais faire ». Rien n'est recuit : c'est une décalcomanie en
// temps réel. Sa face est peinte en canevas (titre et années de la frise servie, lus dans le contenu), sa lumière est
// lue dans la cuisson elle-même : la carte des compétences, cuite à deux pas sous la même lumière, dit quelle couleur
// prend du papier dans l'ambiance du moment (fondu compris) ; la lampe, plus proche de la fiche, l'éclaire un peu plus
// quand elle est allumée. Le bois de l'établi ne sert pas de mesure : sa cuisson porte les reflets de son vernis vus
// depuis la place du visiteur, pas seulement la lumière qu'il reçoit.
import * as THREE from 'three';

// Dimensions (mètres) et place : le seul plat libre et entièrement vu depuis la place du visiteur près de la tasse,
// entre le carnet ouvert (à gauche), la feuille glissée sous le clavier (au fond), le sucre (à droite) et le chanfrein
// de l'établi (devant). À droite de la carte des compétences, les disquettes cachent la moitié avant de tout objet plat
// (tests/parcours.mjs vérifie que la fiche est vue entière et ne touche rien).
export const FICHE = { largeur: 0.155, profondeur: 0.112, epaisseur: 0.0006, centre: [-0.165, 0.185], lacet: 0.04, ecart: 0.0002 };
// Lecture du papier cuit à un niveau de mip FIXE (pas un biais : le niveau ne doit pas dépendre de la distance de
// l'œil) : assez pour effacer le grain du carton, pas assez pour y mêler le texte imprimé.
const FLOU = 2;
// Bristol : un peu plus blanc et plus froid que le carton de la carte des compétences.
const TEINTE = [1.1, 1.1, 1.14];
const OMBRE = 0.55;

// La face imprimée : réglure de fiche bristol (filet rouge en tête, lignes bleu pâle), le titre, puis une ligne par
// étape servie, la plus récente en haut, l'année à gauche d'un trait vertical. Blanc = papier nu (l'encre multiplie).
export function peindreFiche(contenu, l = 1024) {
  const h = Math.round(l * FICHE.profondeur / FICHE.largeur), c = document.createElement('canvas'); c.width = l; c.height = h;
  const g = c.getContext('2d'), k = l / 1024;
  const PROSE = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif', MONO = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';
  g.fillStyle = '#fff'; g.fillRect(0, 0, l, h);
  const pas = 84 * k, tete = 172 * k;
  g.fillStyle = 'rgba(196, 72, 60, .8)'; g.fillRect(0, tete, l, 5 * k);
  g.fillStyle = 'rgba(120, 156, 196, .6)';
  for (let y = tete + pas; y < h - 10 * k; y += pas) g.fillRect(0, y, l, 3 * k);
  const encre = '#2b2622';
  g.fillStyle = encre; g.font = `400 ${104 * k}px ${PROSE}`; g.textBaseline = 'alphabetic';
  g.fillText(contenu.titre, 60 * k, 134 * k);
  // Les années : le début de chaque période (« Novembre 2024 » → 2024, « 2017 – 2024 » → 2017).
  const etapes = contenu.etapes.slice(0, Math.floor((h - tete) / pas) - 1);
  const xTrait = 236 * k, y0 = tete + pas - 26 * k;
  g.fillStyle = 'rgba(43, 38, 34, .55)'; g.fillRect(xTrait - 1.5 * k, y0 - 4 * k, 3 * k, (etapes.length - 1) * pas + 8 * k);
  etapes.forEach((e, i) => {
    const y = y0 + i * pas;
    g.fillStyle = encre; g.beginPath(); g.arc(xTrait, y, 12 * k, 0, Math.PI * 2);
    if (i === 0) g.fill(); else { g.fillStyle = '#fff'; g.fill(); g.lineWidth = 4 * k; g.strokeStyle = encre; g.stroke(); }
    g.fillStyle = encre; g.font = `700 ${44 * k}px ${MONO}`; g.textAlign = 'right';
    g.fillText((/\d{4}/.exec(e.annee) || [''])[0], xTrait - 30 * k, y + 15 * k);
    g.textAlign = 'left'; g.font = `400 ${52 * k}px ${PROSE}`;
    let t = e.titre; while (g.measureText(t).width > l - xTrait - 80 * k && t.length > 4) t = t.slice(0, -2) + '…';
    g.fillText(t, xTrait + 34 * k, y + 17 * k);
  });
  return c;
}

// sol : le décor fixe (l'établi cuit) ; carte : le groupe de la carte des compétences ; contenu : { titre, etapes }.
export function creerFiche({ scene, sol, carte, contenu, posLampe }) {
  const r = new THREE.Raycaster(), bas = new THREE.Vector3(0, -1, 0);
  const sous = (x, z, cible = sol) => { r.set(new THREE.Vector3(x, 0.5, z), bas); return r.intersectObject(cible, true)[0] || null; };
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), FICHE.lacet);
  const demi = new THREE.Vector3(FICHE.largeur / 2, 0, FICHE.profondeur / 2);
  const versMonde = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyQuaternion(rot).add(new THREE.Vector3(FICHE.centre[0], 0, FICHE.centre[1]));
  // Posée à plat : sa hauteur est le point le plus haut de l'établi sous ses quatre coins et son centre.
  let y = -Infinity;
  for (const [sx, sz] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = versMonde(sx * demi.x, sz * demi.z), h = sous(p.x, p.z);
    if (!h) throw new Error('fiche : pas d’établi sous la fiche');
    y = Math.max(y, h.point.y);
  }
  const bas_ = y + FICHE.ecart;

  const geo = new THREE.BoxGeometry(FICHE.largeur, FICHE.epaisseur, FICHE.profondeur);

  // La référence, prise une fois : le papier de la carte, à ses quatre coins (loin du texte imprimé).
  const bc = new THREE.Box3().setFromObject(carte), cc = bc.getCenter(new THREE.Vector3());
  // La carte est tournée : ses vrais coins sont les sommets de son étiquette (un quadrilatère), pas ceux de sa boîte.
  // On lit le papier aux trois quarts du chemin du centre vers chaque coin, loin du texte centré.
  let etiquette = null; carte.traverse((m) => { if (m.isMesh && (!etiquette || m.geometry.attributes.position.count < etiquette.geometry.attributes.position.count)) etiquette = m; });
  const sommets = Array.from({ length: Math.min(4, etiquette.geometry.attributes.position.count) }, (_, i) => new THREE.Vector3().fromBufferAttribute(etiquette.geometry.attributes.position, i).applyMatrix4(etiquette.matrixWorld));
  const coins = sommets.map((p) => {
    const q = cc.clone().lerp(p, 0.75), h = sous(q.x, q.z, carte);
    if (!h) throw new Error('fiche : coin de la carte introuvable'); return h;
  });
  const matPapier = coins[0].object.material;

  const toile = peindreFiche(contenu);
  const face = new THREE.CanvasTexture(toile); face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = 8;
  const u = {
    tFace: { value: face }, tPapier: { value: matPapier.map }, tPapierSuivant: { value: null },
    uFonduPapier: { value: 0 }, uUvPapier: { value: coins.map((h) => h.uv.clone()) }, uDistanceCarte: { value: cc.distanceTo(posLampe) },
    uTeinte: { value: new THREE.Vector3(...TEINTE) }, uSurvol: { value: 0 }, uPosLampe: { value: posLampe.clone() }, uLampe: { value: 1 },
  };
  const materiau = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec2 vUv; varying vec3 vN, vMonde;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 m = modelMatrix * vec4(position, 1.); vMonde = m.xyz;
        gl_Position = projectionMatrix * viewMatrix * m; }`,
    fragmentShader: `uniform sampler2D tFace, tPapier, tPapierSuivant; uniform vec2 uUvPapier[4];
      uniform float uFonduPapier, uSurvol, uLampe, uDistanceCarte; uniform vec3 uTeinte, uPosLampe; varying vec2 vUv; varying vec3 vN, vMonde;
      vec3 papier(vec2 uv){ vec3 c = textureLod(tPapier, uv, ${FLOU}.).rgb; return uFonduPapier > 0. ? mix(c, textureLod(tPapierSuivant, uv, ${FLOU}.).rgb, uFonduPapier) : c; }
      void main(){
        // Le papier sous la lumière de la carte ; la lampe allumée, plus proche, éclaire un peu plus le côté qui la regarde.
        vec3 ref = (papier(uUvPapier[0]) + papier(uUvPapier[1]) + papier(uUvPapier[2]) + papier(uUvPapier[3])) * .25;
        float lampe = mix(1., clamp(pow(uDistanceCarte / distance(vMonde, uPosLampe), 1.5), .85, 1.45), uLampe);
        vec3 col = ref * lampe * uTeinte;
        vec3 n = normalize(vN);
        // Les tranches (0,6 mm) : un peu plus sombres que la face, côté lampe un peu moins.
        if (n.y < .5) col *= .62 + .25 * uLampe * max(dot(n, normalize(uPosLampe - vMonde)), 0.);
        else col *= texture2D(tFace, vUv).rgb;
        // Survolée, elle se réchauffe comme les autres objets (même gain que leur surlignage).
        col *= mix(vec3(1.), vec3(1.14, 1.06, .94), uSurvol);
        gl_FragColor = vec4(min(col, vec3(1.)), 1.);
      }`,
  });
  const maillage = new THREE.Mesh(geo, materiau); maillage.name = 'fiche-parcours';
  maillage.userData.objet = 'parcours';
  maillage.position.set(FICHE.centre[0], bas_ + FICHE.epaisseur / 2, FICHE.centre[1]); maillage.quaternion.copy(rot);
  const groupe = new THREE.Group(); groupe.add(maillage); scene.add(groupe); groupe.updateMatrixWorld(true);

  // L'ombre de contact : la cuisson ignore la fiche. Un liseré doux, poussé à l'opposé de la lampe, 0,1 mm au-dessus
  // de l'établi (jamais dans son plan) ; il reste sur l'établi quand la fiche se soulève au survol.
  const t = 128, tc = document.createElement('canvas'); tc.width = tc.height = t;
  { const g = tc.getContext('2d'); g.filter = `blur(${t * 0.05}px)`; g.fillStyle = '#000'; g.fillRect(t * 0.12, t * 0.12, t * 0.76, t * 0.76); }
  const texOmbre = new THREE.CanvasTexture(tc); texOmbre.colorSpace = THREE.NoColorSpace;
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(FICHE.largeur / 0.76 * 1.04, FICHE.profondeur / 0.76 * 1.06).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texOmbre, color: 0x000000, transparent: true, opacity: OMBRE, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const versLampe = new THREE.Vector3(posLampe.x - FICHE.centre[0], 0, posLampe.z - FICHE.centre[1]).normalize();
  ombre.position.set(FICHE.centre[0] - versLampe.x * 0.0015, y + 0.0001, FICHE.centre[1] - versLampe.z * 0.0015); ombre.quaternion.copy(rot);
  ombre.name = 'fiche-ombre'; scene.add(ombre);

  return {
    groupe, maillage, ombre, toile,
    // À chaque image : textures de l'ambiance du moment (fondu compris), survol, lampe.
    mettreAJour({ survol = 0, lampe = 1 } = {}) {
      const fp = matPapier.userData.fondu;
      u.tPapier.value = matPapier.map; u.tPapierSuivant.value = fp?.tSuivante.value || null; u.uFonduPapier.value = fp?.tSuivante.value ? fp.uFondu.value : 0;
      u.uSurvol.value = survol; u.uLampe.value = lampe;
    },
    // Pour les essais : posée à plat sur l'établi (même hauteur sous chaque coin), à quelle distance de l'établi.
    contacts() {
      maillage.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(maillage), dessous = [];
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) { const p = versMonde(sx * demi.x, sz * demi.z), h = sous(p.x, p.z); dessous.push(h ? +h.point.y.toFixed(5) : null); }
      return { bas: +(b.min.y - groupe.position.y).toFixed(5), dessous, boite: { min: b.min.toArray(), max: b.max.toArray() } };
    },
  };
}
