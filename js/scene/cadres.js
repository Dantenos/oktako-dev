// Les tableaux aux murs (lot portfolio-bureau-range) : Blender cuit un cadre de chêne et une feuille blanche, qui reçoit la
// lumière de la pièce ; l'image n'est pas cuite. Elle se peint ici sur un canevas (image recadrée, sans déformation, et sa
// légende), que la matière cuite multiplie : changer l'image de content/site.json ne demande aucune recuisson, et le tableau
// garde la lumière de chaque ambiance, fondu compris. Tout se charge après la première image : rien n'attend un tableau.
import * as THREE from 'three';

const PROSE = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif', MONO = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';
const ENCRE = '#2b2622';

// Remplit le rectangle sans déformer : l'image déborde dans sa plus grande dimension, comme object-fit: cover.
function recadrer(g, img, x, y, l, h) {
  const k = Math.max(l / img.naturalWidth, h / img.naturalHeight), sl = l / k, sh = h / k;
  g.drawImage(img, (img.naturalWidth - sl) / 2, (img.naturalHeight - sh) / 2, sl, sh, x, y, l, h);
}
// Liège : un semis de grains clairs et foncés, tiré d'une graine fixe (la même image à chaque visite).
function liege(g, l, h) {
  g.fillStyle = '#a97c4f'; g.fillRect(0, 0, l, h);
  let s = 7; const alea = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = alea() > 0.5 ? 'rgba(84, 54, 28, .35)' : 'rgba(216, 176, 128, .3)';
    const r = 1 + alea() * 2.6; g.beginPath(); g.ellipse(alea() * l, alea() * h, r, r * (0.5 + alea() * 0.5), alea() * 3, 0, 7); g.fill();
  }
}
function lignes(g, texte, largeur) {
  const res = []; let ligne = '';
  for (const mot of texte.split(/\s+/)) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (g.measureText(essai).width > largeur && ligne) { res.push(ligne); ligne = mot; } else ligne = essai;
  }
  if (ligne) res.push(ligne);
  return res;
}
// Le passe-partout : un carton crème, un fin biseau plus sombre autour de la fenêtre. Il encadre une vraie photo ; sans elle, il
// reste vide ou porte le texte du tableau : l'état neutre ne prétend rien montrer.
const CARTON = '#f3ecdd', BISEAU = 'rgba(92, 74, 52, .55)';
function passePartout(g, l, h, x, y, lf, hf) {
  g.fillStyle = CARTON; g.fillRect(0, 0, l, h);
  g.fillStyle = '#fff'; g.fillRect(x, y, lf, hf);
  g.strokeStyle = BISEAU; g.lineWidth = Math.max(1.5, l * 0.006); g.strokeRect(x - g.lineWidth / 2, y - g.lineWidth / 2, lf + g.lineWidth, hf + g.lineWidth);
}
// La face du tableau. Blanc = la feuille cuite telle quelle : ce qui est peint la multiplie.
export function peindreCadre(cadre, repere, img, l = 512) {
  const h = Math.round(l * repere.hauteur / repere.largeur), c = document.createElement('canvas'); c.width = l; c.height = h;
  const nue = cadre.fond === 'liege' || cadre.fond === 'vierge';
  const g = c.getContext('2d'), m = nue ? 0 : Math.round(l * 0.09);
  const titre = (cadre.payant ? 'Publicité · ' : '') + (cadre.legende || '');
  const bas = titre && cadre.fond !== 'liege' ? Math.round(l * 0.13) : 0;
  g.fillStyle = '#fff'; g.fillRect(0, 0, l, h);
  if (cadre.fond === 'liege') liege(g, l, h);
  else if (!nue) passePartout(g, l, h, m, m, l - 2 * m, h - 2 * m - bas);
  if (img) recadrer(g, img, m, m, l - 2 * m, h - 2 * m - bas);
  else if (cadre.texte) {
    g.fillStyle = ENCRE; g.textBaseline = 'alphabetic'; g.font = `400 ${Math.round(l * 0.075)}px ${PROSE}`;
    g.fillText(cadre.titre || '', m, m + l * 0.1);
    g.font = `400 ${Math.round(l * 0.05)}px ${PROSE}`;
    lignes(g, cadre.texte, l - 2 * m).slice(0, 7).forEach((t, i) => g.fillText(t, m, m + l * 0.22 + i * l * 0.07));
  }
  if (bas) {
    g.fillStyle = ENCRE; g.textAlign = 'center'; g.textBaseline = 'middle'; let corps = Math.round(l * 0.042);
    do { g.font = `400 ${corps}px ${MONO}`; corps--; } while (g.measureText(titre).width > l - 2 * m && corps > 10);
    g.fillText(titre, l / 2, h - m / 2 - bas / 2);
  }
  return c;
}

// groupes : les maillages par objet (« cadre:<id> ») ; reperes : centre, axes et taille de chaque feuille, exportés par
// Blender ; cadres : le contenu, un par id ; base : l'adresse du site. demarrer : redemande une image après un chargement.
export function creerCadres({ groupes, reperes, cadres, base, demarrer, telephone }) {
  const etat = {}, attentes = [];
  for (const cadre of cadres) {
    const r = reperes[cadre.id], g = groupes['cadre:' + cadre.id]; if (!r || !g) continue;
    const c = new THREE.Vector3().fromArray(r.centre), dx = new THREE.Vector3().fromArray(r.droite), dy = new THREE.Vector3().fromArray(r.haut);
    const taille = telephone ? 256 : 512;
    const tex = new THREE.CanvasTexture(peindreCadre(cadre, r, null, taille)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const u = { tCadre: { value: tex } };
    g.traverse((m) => {
      if (!m.isMesh) return;
      m.updateMatrixWorld(true);
      const pos = m.geometry.attributes.position, uv = new Float32Array(pos.count * 2), p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(c);
        uv[i * 2] = 0.5 + p.dot(dx) / r.largeur; uv[i * 2 + 1] = 0.5 + p.dot(dy) / r.hauteur;
      }
      m.geometry.setAttribute('aCadre', new THREE.BufferAttribute(uv, 2));
      const avant = m.material.onBeforeCompile;
      m.material.onBeforeCompile = (s) => {
        avant(s); Object.assign(s.uniforms, u);
        s.vertexShader = 'attribute vec2 aCadre; varying vec2 vCadre;\n' + s.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vCadre = aCadre;');
        s.fragmentShader = 'uniform sampler2D tCadre; varying vec2 vCadre;\n' + s.fragmentShader.replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor *= sampledDiffuseColor; diffuseColor.rgb *= texture2D( tCadre, vCadre ).rgb;');
      };
      m.material.customProgramCacheKey = () => 'atelier-cadre';
      m.material.needsUpdate = true;
    });
    etat[cadre.id] = { image: cadre.image || null, chargee: false, legende: (cadre.payant ? 'Publicité · ' : '') + (cadre.legende || ''), lien: cadre.lien || null, tex };
    if (cadre.image) {
      const img = new Image();
      let terminer; attentes.push(new Promise((ok) => { terminer = ok; }));
      img.onload = () => { tex.image = peindreCadre(cadre, r, img, taille); tex.needsUpdate = true; etat[cadre.id].chargee = true; terminer(); demarrer(); };
      // Une image absente ne casse rien : la feuille reste blanche, avec sa légende.
      img.onerror = () => { etat[cadre.id].erreur = true; terminer(); };
      img.src = new URL(cadre.image, base).href;
    }
  }
  return { pretes: Promise.all(attentes), etat: () => Object.fromEntries(Object.entries(etat).map(([k, v]) => { const { tex, ...reste } = v; return [k, reste]; })) };
}
