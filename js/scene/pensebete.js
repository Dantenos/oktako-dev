// Le pense-bête collé à gauche de l'écran (tools/blender/atelier.py, « pense_bete1 ») portait le nom de l'ancien jeu de
// Rouille, cuit dans l'atlas des étiquettes. Le jeu s'appelle DOONT_Rouille (29/10) et ce nom ne doit plus paraître :
// sans recuisson, une décalcomanie en temps réel recouvre le papillon. Son papier est lu dans la cuisson elle-même,
// aux quatre coins (loin de l'encre), et fondu de l'un à l'autre ; l'encre a le rapport cuit encre / papier.
// atelier.py écrit désormais le même texte : la prochaine cuisson le portera, et ce calque se superposera à l'identique.
import * as THREE from 'three';

// Le texte et la peinture d'atelier.py : 5 × 5 cm, deux lignes de 12 mm centrées à ±8 mm, encre #4a3424 sur #e4d7b8.
export const PENSE_BETE = { mots: ['rendre', 'DOONT'], cote: 0.05, taille: 0.012, interligne: 0.008, encre: [0x4a, 0x34, 0x24], papier: [0xe4, 0xd7, 0xb8] };
// Coins lus à 12 % du bord : hors de l'encre, dans le papier.
const RETRAIT = 0.12;

function peindre(n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), k = n / PENSE_BETE.cote;
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  // Police étroite, grasse et italique, comme Liberation Sans Narrow Bold Italic de la cuisson.
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 700 ${PENSE_BETE.taille * k}px "Liberation Sans Narrow", "Arial Narrow", "Nimbus Sans Narrow", sans-serif`;
  PENSE_BETE.mots.forEach((m, i) => {
    g.save(); g.translate(n / 2, n / 2 + (i ? 1 : -1) * PENSE_BETE.interligne * k);
    // Sans police étroite installée, on resserre la police du système à la largeur de l'étroite.
    if (!/Narrow/i.test(g.font) || g.measureText('DOONT').width > 0.5 * PENSE_BETE.taille * k * 4) g.scale(0.82, 1);
    g.fillText(m, 0, 0); g.restore();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

// statiques : le décor fixe cuit. Le papillon est l'un des quadrilatères du maillage « etiquettes-statique » :
// celui à gauche de l'écran, à hauteur de son cadre.
export function creerPenseBete({ scene, statiques }) {
  let maillage = null; statiques.traverse((m) => { if (m.isMesh && /^etiquettes-statique/.test(m.name)) maillage = m; });
  if (!maillage) return null;
  const g = maillage.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
  maillage.updateMatrixWorld(true);
  // Regroupe les triangles en quadrilatères par sommets partagés, puis choisit le plus à gauche parmi ceux du cadre.
  const quads = [];
  for (let i = 0; i < idx.count; i += 3) {
    const s = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    const q = quads.find((x) => s.some((v) => x.has(v))); if (q) s.forEach((v) => q.add(v)); else quads.push(new Set(s));
  }
  const monde = (i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(maillage.matrixWorld);
  const candidats = quads.filter((q) => q.size === 4).map((q) => { const v = [...q], p = v.map(monde); return { v, p, c: p.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(0.25) }; })
    .filter((q) => q.c.y > 0.2 && Math.abs(q.p[0].distanceTo(q.p[2]) - Math.SQRT2 * PENSE_BETE.cote) < 0.004 || (q.c.y > 0.2 && Math.abs(q.p[0].distanceTo(q.p[1]) - Math.SQRT2 * PENSE_BETE.cote) < 0.004));
  const q = candidats.sort((a, b) => a.c.x - b.c.x)[0];
  if (!q || q.c.x > 0) return null;
  // Repère du papillon : « haut » = la verticale du monde ramenée dans son plan, « droite » = vers +x à l'écran.
  const n = new THREE.Vector3().subVectors(q.p[1], q.p[0]).cross(new THREE.Vector3().subVectors(q.p[2], q.p[0])).normalize();
  if (n.z < 0) n.negate();
  const haut = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(), droite = new THREE.Vector3().crossVectors(haut, n);
  const st = q.p.map((p) => { const d = p.clone().sub(q.c); return new THREE.Vector2(d.dot(droite) / PENSE_BETE.cote + 0.5, d.dot(haut) / PENSE_BETE.cote + 0.5); });
  // UV de l'atlas en un point (s, t) du papillon : l'interpolation affine des trois premiers sommets.
  const uvs = q.v.map((i) => new THREE.Vector2().fromBufferAttribute(uv, i));
  const [A, B, C] = [0, 1, 2], d1 = st[B].clone().sub(st[A]), d2 = st[C].clone().sub(st[A]), det = d1.x * d2.y - d1.y * d2.x;
  const uvEn = (s, t) => { const a = ((s - st[A].x) * d2.y - (t - st[A].y) * d2.x) / det, b = (d1.x * (t - st[A].y) - d1.y * (s - st[A].x)) / det;
    return uvs[A].clone().addScaledVector(uvs[B].clone().sub(uvs[A]), a).addScaledVector(uvs[C].clone().sub(uvs[A]), b); };
  const coins = [[RETRAIT, RETRAIT], [1 - RETRAIT, RETRAIT], [RETRAIT, 1 - RETRAIT], [1 - RETRAIT, 1 - RETRAIT]].map(([s, t]) => uvEn(s, t));

  const geo = new THREE.BufferGeometry();
  const ecart = n.clone().multiplyScalar(0.0002);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(q.p.flatMap((p) => p.clone().add(ecart).toArray()), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(st.flatMap((v) => [v.x, v.y]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3].map((i) => i));
  // L'ordre des sommets du quadrilatère n'est pas garanti : on retient la triangulation qui couvre bien le carré.
  const aire = (a, b, c) => Math.abs((st[b].x - st[a].x) * (st[c].y - st[a].y) - (st[c].x - st[a].x) * (st[b].y - st[a].y)) / 2;
  if (Math.abs(aire(0, 1, 2) + aire(0, 2, 3) - 1) > 0.05) geo.setIndex([0, 1, 3, 0, 3, 2]);
  const lin = (c) => c.map((x) => Math.pow(x / 255, 2.2));
  const [ei, pi] = [lin(PENSE_BETE.encre), lin(PENSE_BETE.papier)];
  const mat = maillage.material;
  const u = { tEncre: { value: peindre() }, tCuit: { value: mat.map }, tCuitSuivant: { value: null }, uFondu: { value: 0 }, uCoins: { value: coins },
    uRapport: { value: new THREE.Vector3(ei[0] / pi[0], ei[1] / pi[1], ei[2] / pi[2]) } };
  const materiau = new THREE.ShaderMaterial({
    uniforms: u, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tEncre, tCuit, tCuitSuivant; uniform vec2 uCoins[4]; uniform float uFondu; uniform vec3 uRapport; varying vec2 vUv;
      vec3 cuit(vec2 uv){ vec3 c = textureLod(tCuit, uv, 1.).rgb; return uFondu > 0. ? mix(c, textureLod(tCuitSuivant, uv, 1.).rgb, uFondu) : c; }
      void main(){
        // Le papier cuit aux quatre coins, fondu sur toute la surface (la lumière y varie doucement).
        vec2 s = clamp((vUv - ${RETRAIT}) / ${1 - 2 * RETRAIT}, 0., 1.);
        vec3 papier = mix(mix(cuit(uCoins[0]), cuit(uCoins[1]), s.x), mix(cuit(uCoins[2]), cuit(uCoins[3]), s.x), s.y);
        float encre = texture2D(tEncre, vUv).r;
        gl_FragColor = vec4(mix(papier, papier * uRapport, encre), 1.);
      }`,
  });
  const calque = new THREE.Mesh(geo, materiau); calque.name = 'pense-bete-doont';
  scene.add(calque);
  return {
    calque,
    mettreAJour() { const f = mat.userData.fondu; u.tCuit.value = mat.map; u.tCuitSuivant.value = f?.tSuivante.value || null; u.uFondu.value = f?.tSuivante.value ? f.uFondu.value : 0; },
    // Pour les essais : le papillon recouvert (centre, taille mesurée sur le maillage cuit).
    lire() { return { centre: q.c.toArray().map((v) => +v.toFixed(4)), cote: +q.p[0].distanceTo(q.p[1]).toFixed(4), mots: [...PENSE_BETE.mots] }; },
  };
}
