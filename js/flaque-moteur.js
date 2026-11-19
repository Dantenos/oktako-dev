// Le moteur de la flaque vivante (lot flaque-vivante) : le shader, les textures et la boucle, sans DOM. Il tourne dans un
// worker sur un OffscreenCanvas (flaque-travail.js) ou, à défaut, sur le fil principal (flaque.js) : l'appelant fournit le
// contexte WebGL, de quoi créer un canevas 2D (toile), et ses horloges (pause entre deux étapes, images).
//
// Le canevas ne dessine QUE dans le masque de la flaque (site/film/flaque-*.png, tools/flaque-masque.py) et y relit l'image du
// film elle-même, déplacée par les rides : couleurs, contours et reflets restent ceux du film. Hors du masque il est
// transparent, et ses rides s'éteignent avant chaque bord (canal V du masque) : le contour du film ne bouge jamais.
// Rides au pointeur, onde au clic, éclat chaud de la lanterne sur les crêtes, houle presque immobile ; l'écriture est tracée
// DANS le café comme le sucre écrit dans la mousse (flaque-ecriture.js) et flotte avec les rides.
import { mettreEnPageFlaque, peindreFlaque } from './flaque-ecriture.js';

// Garde-fous de photosensibilité, comme ceux du café de la tasse (relus par tests/flaque-donnees.mjs) :
// - une crête passe sur un point moins de 3 fois par seconde (vitesse / longueur d'onde ≈ 2 Hz) ;
// - les pentes restent faibles : un reflet glisse, il ne clignote pas ; l'éclat de la lanterne est borné ;
// - une ride suit le pointeur au plus toutes les 220 ms.
export const GARDES = { vitesse: 70, longueur: 36, amortissement: 0.6, ondeMinMs: 220, eclatMax: 0.32 };
export const N_ONDES = 10;
// Amplitudes (pente maximale au cœur du paquet) : pointeur, clic, pointe de l'écriture.
export const AMPLITUDES = { pointeur: 0.05, clic: 0.13, ecriture: 0.03 };
const DUREE_ECRITURE = 3.4;   // s, toute l'écriture (une phrase : « Prendre un café avec moi »)
const PAUSE_ECRITURE = 0.35;  // s avant le premier trait : l'image se pose d'abord
export const CREME = [0.93, 0.86, 0.73];
// La carte du café côté processeur, au quart : une ride ne naît que sur le café.
export const CARTE = 4;

// Le recadrage « cover » de l'image dans l'hôte : le même calcul que object-fit: cover (et que film-cafe-fin.js).
export function couverture(d, L, H) {
  const s = Math.max(L / d.largeur, H / d.hauteur);
  return { s, x: (L - d.largeur * s) / 2, y: (H - d.hauteur * s) / 2 };
}
// Densité bornée : au plus ~2,5 millions de pixels calculés, jamais au-delà de 2 (le café est doux, il ne gagne rien plus fin).
export const densite = (dpr, L, H) => Math.min(dpr || 1, 2, Math.sqrt(2.5e6 / Math.max(1, L * H)));

const SOMMETS = `attribute vec2 aPos; uniform vec2 uEcran; varying vec2 vEcran;
  void main(){ vEcran = (aPos * .5 + .5) * uEcran; vEcran.y = uEcran.y - vEcran.y; gl_Position = vec4(aPos, 0., 1.); }`;
const FRAGMENTS = `precision highp float;
  uniform sampler2D tImage, tMasque, tTexte;
  uniform vec2 uTaille, uDecal, uLampe, uTexteTaille, uSurvol; uniform float uEchelle, uTemps, uHoule, uEcrit, uTexteEchelle;
  // Essais seulement : x ouvre le masque, y décale l'image relue (px) : chaque règle doit pouvoir rougir. uCreme : la couleur de l'écriture.
  uniform vec4 uEssai; uniform vec3 uCreme;
  uniform vec4 uOndes[${N_ONDES}]; uniform vec3 uChaud; uniform vec2 uTexteOrigine;
  varying vec2 vEcran;
  const float K = ${(2 * Math.PI / GARDES.longueur).toFixed(5)}, VITESSE = ${GARDES.vitesse.toFixed(2)}, AMORTI = ${GARDES.amortissement.toFixed(3)}, SIGMA = ${(GARDES.longueur * 1.1).toFixed(2)};
  void main(){
    vec2 p = (vEcran - uDecal) / uEchelle, uv = p / uTaille;
    vec4 m = texture2D(tMasque, uv);
    m = mix(m, vec4(1.), uEssai.x);
    if (m.r < .004 || uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) discard;
    // Les rides : des paquets qui s'élargissent depuis leur point de chute et s'amortissent (le même modèle que la tasse).
    vec2 g = vec2(0.);
    for (int i = 0; i < ${N_ONDES}; i++) {
      vec4 o = uOndes[i]; float age = uTemps - o.z;
      if (age <= 0. || o.w <= 0.) continue;
      vec2 d = p - o.xy; float dist = length(d) + 1e-3, x = dist - age * VITESSE;
      float env = o.w * exp(-age * AMORTI) * exp(-x * x / (SIGMA * SIGMA)) / (1. + age * VITESSE / 160.);
      g += env * -sin(K * x) * d / dist;
    }
    // La houle : le café respire, sans bouger vraiment.
    g += uHoule * .0045 * vec2(sin(p.y * .021 + uTemps * .35) + .6 * sin(p.x * .013 - uTemps * .23), cos(p.x * .017 - uTemps * .3) + .6 * cos(p.y * .011 + uTemps * .27));
    // Les rides s'éteignent avant chaque bord (parquet ou objet) : le contour du film reste fixe.
    float prof = smoothstep(0., 1., m.g);
    g *= prof;
    // Le café montre l'image du film elle-même, déplacée par les pentes (≤ 3 px) : reflets et couleurs bougent sans changer.
    vec3 col = texture2D(tImage, uv + (g * 22. + vec2(uEssai.y, 0.)) / uTaille).rgb;
    // Le modelé : les pentes tournées vers la lanterne s'éclairent de sa lumière chaude, les autres s'assombrissent.
    vec2 versLampe = normalize(uLampe - p);
    float face = dot(g, versLampe);
    col *= 1. + clamp(face * 3.4, -.2, .28) * uChaud;
    // L'éclat de la lanterne sur les crêtes qui lui font face, plus vif près d'elle. La lanterne est posée au sol et la caméra
    // regarde d'aplomb : son vrai reflet tombe hors du café ; ce liseré est sa lumière rasante. Nul sur une surface au repos.
    float eclat = smoothstep(.015, .09, face) * min(1., .35 + exp(-length(uLampe - p) / 600.));
    col += uChaud * eclat * ${GARDES.eclatMax.toFixed(2)};
    // L'écriture, dans le café : elle flotte avec les rides.
    vec2 t = (p + g * 26. - uTexteOrigine) * uTexteEchelle / uTexteTaille;
    if (t.x > 0. && t.y > 0. && t.x < 1. && t.y < 1.) {
      vec4 e = texture2D(tTexte, t);
      float encre = smoothstep(.2, .8, e.r + e.g) * smoothstep(0., .004, uEcrit - e.b * 255. / 254.);
      // Une ombre douce sous les lettres (le canevas lu flou, par ses mipmaps) : le contraste tient même près de la lanterne.
      vec4 f = texture2D(tTexte, t, 3.);
      float ombre = smoothstep(.03, .35, f.r + f.g) * smoothstep(0., .03, uEcrit - f.b * 255. / 254.);
      col *= 1. - .34 * ombre;
      float qui = (e.r * uSurvol.x + e.g * uSurvol.y) / max(e.r + e.g, .001);
      // La crème prend le modelé des rides qui la traversent, et laisse transparaître un peu de café : elle est dans le liquide.
      vec3 creme = uCreme * (1. + .16 * qui) * (1. + clamp(face * 3., -.14, .16));
      col = mix(col, min(creme, vec3(1.)), encre * .94);
    }
    // Le bord se fond dans l'image posée dessous ; à l'intérieur, le canevas est opaque.
    float a = m.r * smoothstep(0., .3, m.g);
    gl_FragColor = vec4(col * a, a);
  }`;

function texture(gl, unite, source, { mipmap = false, couleurs = true } = {}) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unite); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  // Le masque et l'écriture sont des données : aucune conversion de couleur ne doit toucher leurs canaux.
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, couleurs ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mipmap) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}
const puissance2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// Création en étapes, chacune dans sa propre tâche (`pause` entre deux) ; le statut du shader n'est lu qu'à l'étape suivante :
// le lire tout de suite attendrait que le processus graphique ait fini de compiler. Rend null si le shader est refusé.
export async function moteur({ canvas, gl, image, masque, donnees: d, phrases, reduit = false, immediat = false, toile, pause, raf, annulerRaf, surEcrit = () => {}, ferme = () => false }) {
  const lacher = () => { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; };
  const programme = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, SOMMETS], [gl.FRAGMENT_SHADER, FRAGMENTS]]) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(programme, sh);
  }
  gl.linkProgram(programme);
  await pause();
  if (ferme() || !gl.getProgramParameter(programme, gl.LINK_STATUS)) return lacher();
  gl.useProgram(programme);
  const tampon = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(programme, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(programme, n);
  gl.uniform1i(U('tImage'), 0); gl.uniform1i(U('tMasque'), 1); gl.uniform1i(U('tTexte'), 2);
  gl.uniform2f(U('uTaille'), d.largeur, d.hauteur); gl.uniform2f(U('uLampe'), d.lampe[0], d.lampe[1]);
  gl.uniform3f(U('uChaud'), 1.0, 0.6, 0.27); gl.uniform3f(U('uCreme'), ...CREME);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
  const textures = [texture(gl, 0, image)];
  await pause();
  if (ferme()) return lacher();
  textures.push(texture(gl, 1, masque, { couleurs: false }));
  const petit = toile(Math.round(d.largeur / CARTE), Math.round(d.hauteur / CARTE));
  const pctx = petit.getContext('2d', { willReadFrequently: true }); pctx.drawImage(masque, 0, 0, petit.width, petit.height);
  const brut = pctx.getImageData(0, 0, petit.width, petit.height).data, carte = new Uint8Array(petit.width * petit.height);
  for (let i = 0; i < carte.length; i++) carte[i] = brut[i * 4 + 1];
  await pause();
  if (ferme()) return lacher();
  // L'écriture : mise en page dans la zone libre de la flaque, peinte une fois dans un canevas aux dimensions puissances de 2.
  const page = mettreEnPageFlaque(phrases, d.ecriture, { tailleMin: d.taille_min });
  const marge = page.taille * 1.2;
  const cadre = [d.ecriture[0] - marge, d.ecriture[1] - marge, d.ecriture[2] + marge, d.ecriture[3] + marge];
  const lw = cadre[2] - cadre[0], lh = cadre[3] - cadre[1];
  const echelle = Math.min(1024 / lw, 1024 / lh, 3);
  const ecriture = toile(puissance2(lw * echelle), puissance2(lh * echelle));
  const trace = peindreFlaque(ecriture, page, { cadre, echelle });
  await pause();
  if (ferme()) return lacher();
  textures.push(texture(gl, 2, ecriture, { mipmap: true, couleurs: false }));
  gl.uniform2f(U('uTexteOrigine'), cadre[0], cadre[1]); gl.uniform1f(U('uTexteEchelle'), echelle); gl.uniform2f(U('uTexteTaille'), ecriture.width, ecriture.height);

  const ondes = new Float32Array(N_ONDES * 4); let prochaine = 0;
  const etat = { t: 0, fige: null, ecrit: 0, debutEcriture: null, survol: [0, 0], survolBut: [0, 0], ondes: 0, essai: [0, 0, 0, 0], actif: true, images: 0, prochaineTete: 0, L: 1, H: 1 };
  let image_raf = 0, avant = 0, perdu = false;
  canvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); perdu = true; });

  function onde(x, y, a) { ondes.set([x, y, etat.t, a], prochaine * 4); prochaine = (prochaine + 1) % N_ONDES; etat.ondes++; }
  function ecrire(v) { const avantV = etat.ecrit; etat.ecrit = v; if (v >= 1.02 && avantV < 1.02) surEcrit(); }
  function rendre() {
    if (perdu) return;
    gl.uniform1f(U('uTemps'), etat.t); gl.uniform4fv(U('uOndes'), ondes);
    gl.uniform1f(U('uHoule'), reduit ? 0 : 1); gl.uniform1f(U('uEcrit'), etat.ecrit);
    gl.uniform2f(U('uSurvol'), etat.survol[0], etat.survol[1]); gl.uniform4fv(U('uEssai'), etat.essai);
    gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); etat.images++;
  }
  // Une image : l'horloge du café, l'écriture, le survol. Hors mouvement réduit, la boucle tourne tant que la fin est là.
  function image_(maintenant) {
    image_raf = 0;
    const dt = Math.min(0.1, avant ? (maintenant - avant) / 1000 : 0); avant = maintenant;
    if (etat.fige != null) etat.t = etat.fige; else if (!reduit) etat.t += dt;
    if (reduit) { ecrire(1.02); ondes.fill(0); }
    else if (etat.debutEcriture != null && etat.ecrit < 1.02) {
      const u = Math.max(0, (etat.t - etat.debutEcriture) / DUREE_ECRITURE);
      ecrire(Math.min(1.02, u * 1.02));
      // La pointe qui écrit sème de petites rides, comme un doigt dans le café.
      if (u > 0 && u < 1 && etat.t >= etat.prochaineTete) { const p = trace.tete(u); if (p) onde(p[0], p[1], AMPLITUDES.ecriture); etat.prochaineTete = etat.t + 0.26; }
    }
    const k = reduit ? 1 : 1 - Math.exp(-dt / 0.1);
    for (const i of [0, 1]) etat.survol[i] += (etat.survolBut[i] - etat.survol[i]) * k;
    rendre();
    if (!reduit && etat.actif) image_raf = raf(image_);
  }
  const relancer = () => { if (!image_raf && etat.actif) image_raf = raf(image_); };

  return {
    page, carte: { largeur: petit.width, hauteur: petit.height, donnees: carte },
    // La taille de l'hôte (px CSS) et la densité : le tampon suit, le recadrage aussi.
    taille(L, H, dpr) {
      etat.L = L; etat.H = H;
      canvas.width = Math.max(1, Math.round(L * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
      const c = couverture(d, L, H);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U('uEcran'), L, H); gl.uniform2f(U('uDecal'), c.x, c.y); gl.uniform1f(U('uEchelle'), c.s);
      rendre();
    },
    demarrer() { if (immediat || reduit) ecrire(1.02); else etat.debutEcriture = PAUSE_ECRITURE; relancer(); },
    onde(x, y, a) { onde(x, y, a); if (reduit) rendre(); else relancer(); },
    survol(i) { etat.survolBut = [i === 0 ? 1 : 0, i === 1 ? 1 : 0]; if (reduit) { etat.survol = [...etat.survolBut]; rendre(); } else relancer(); },
    // Échap pendant l'écriture : elle se pose d'un coup.
    presser() { ecrire(1.02); etat.debutEcriture = null; rendre(); },
    // Mouvement réduit basculé pendant la fin : l'animation s'arrête (ou reprend), l'écriture reste posée.
    regler(r) {
      reduit = r;
      if (reduit) { ecrire(1.02); etat.debutEcriture = null; ondes.fill(0); annulerRaf(image_raf); image_raf = 0; rendre(); } else { avant = 0; relancer(); }
    },
    // Essais : fige l'horloge (null la rend), contre-épreuves (masque ouvert, image décalée, autre crème), écriture effacée ou reprise.
    figer(t) { etat.fige = t; if (t != null) etat.t = t; rendre(); relancer(); },
    essai({ sansMasque = false, decalage = 0, creme = CREME, ecrit = null, reecrire = false } = {}) {
      etat.essai = [sansMasque ? 1 : 0, decalage, 0, 0]; gl.uniform3f(U('uCreme'), ...creme);
      if (ecrit != null) { etat.ecrit = ecrit; etat.debutEcriture = null; }
      if (reecrire) { etat.ecrit = 0; etat.debutEcriture = etat.t + PAUSE_ECRITURE; relancer(); }
      rendre();
    },
    rendre,
    lire: () => ({ t: etat.t, ecrit: etat.ecrit, ondes: etat.ondes, images: etat.images, boucle: !!image_raf, perdu, taille: page.taille, lignes: page.lignes.map((l) => l.texte),
      dpr: canvas.width / Math.max(1, etat.L), actives: [...Array(N_ONDES).keys()].filter((i) => ondes[i * 4 + 3] > 0 && etat.t - ondes[i * 4 + 2] < 6).length }),
    fermer() {
      etat.actif = false; annulerRaf(image_raf); image_raf = 0;
      for (const t of textures) gl.deleteTexture(t);
      gl.deleteBuffer(tampon); gl.deleteProgram(programme);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
