// Lettres de mousse : une police monotrait dessinée ici, en code, pour que la crème écrive comme on verse un
// latte art (un trait continu par geste, des attaques et des fins rondes). Aucune image, aucune police chargée :
// le tracé est vectoriel, donc net à toute taille, et son ordre de dessin EST l'animation.
//
// Unités du dessin : ligne de base y = 0, hauteur d'x = 1, capitales 1,4, jambages ±0,5 ; y vers le haut.

// Un arc d'ellipse (degrés, sens trigonométrique si a1 > a0), échantillonné assez fin pour rester rond à l'écran.
const arc = (cx, cy, rx, ry, a0, a1) => {
  const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 9)), p = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
};
const point = (x, y) => [[x, y], [x, y + 0.02]];
const bol = (cx = 0.45) => arc(cx, 0.5, 0.42, 0.5, 90, 450);

// Chaque glyphe : avance horizontale et traits (polylignes) dans l'ordre où la mousse les verse.
const G = {
  a: [0.95, [bol(), [[0.88, 1], [0.88, 0]]]],
  b: [0.95, [[[0.08, 1.5], [0.08, 0]], bol(0.5)]],
  c: [0.85, [arc(0.45, 0.5, 0.42, 0.5, 45, 315)]],
  d: [0.95, [bol(), [[0.88, 1.5], [0.88, 0]]]],
  e: [0.9, [[[0.04, 0.5], [0.86, 0.5], ...arc(0.45, 0.5, 0.42, 0.5, 0, 318).slice(1)]]],
  f: [0.62, [[...arc(0.5, 1.2, 0.25, 0.3, 45, 180), [0.25, 0]], [[0.02, 0.98], [0.56, 0.98]]]],
  g: [0.95, [bol(), [[0.88, 1], [0.88, -0.1], ...arc(0.46, -0.1, 0.42, 0.38, 0, -165).slice(1)]]],
  h: [0.9, [[[0.08, 1.5], [0.08, 0]], [[0.08, 0.6], ...arc(0.45, 0.6, 0.37, 0.4, 180, 0), [0.82, 0]]]],
  i: [0.3, [[[0.12, 1], [0.12, 0]], point(0.12, 1.34)]],
  j: [0.42, [[[0.3, 1], [0.3, -0.15], ...arc(0.05, -0.15, 0.25, 0.32, 0, -150).slice(1)], point(0.3, 1.34)]],
  k: [0.82, [[[0.08, 1.5], [0.08, 0]], [[0.72, 1], [0.08, 0.38]], [[0.3, 0.58], [0.78, 0]]]],
  l: [0.32, [[[0.12, 1.5], [0.12, 0]]]],
  m: [1.3, [[[0.08, 1], [0.08, 0]], [[0.08, 0.62], ...arc(0.35, 0.62, 0.27, 0.38, 180, 0), [0.62, 0]], [[0.62, 0.62], ...arc(0.89, 0.62, 0.27, 0.38, 180, 0), [1.16, 0]]]],
  n: [0.92, [[[0.08, 1], [0.08, 0]], [[0.08, 0.6], ...arc(0.45, 0.6, 0.37, 0.4, 180, 0), [0.82, 0]]]],
  o: [0.92, [bol()]],
  p: [0.95, [[[0.08, 1], [0.08, -0.5]], bol(0.5)]],
  q: [0.95, [bol(), [[0.88, 1], [0.88, -0.5]]]],
  r: [0.62, [[[0.08, 1], [0.08, 0]], [[0.08, 0.55], ...arc(0.42, 0.55, 0.34, 0.42, 180, 55)]]],
  s: [0.8, [[...arc(0.4, 0.75, 0.32, 0.25, 30, 270), ...arc(0.4, 0.25, 0.35, 0.25, 90, -150).slice(1)]]],
  t: [0.62, [[[0.28, 1.35], [0.28, 0.22], ...arc(0.5, 0.22, 0.22, 0.22, 180, 300).slice(1)], [[0.02, 1], [0.58, 1]]]],
  u: [0.92, [[[0.08, 1], [0.08, 0.4], ...arc(0.45, 0.4, 0.37, 0.4, 180, 360).slice(1), [0.82, 1]], [[0.82, 1], [0.82, 0]]]],
  v: [0.86, [[[0.02, 1], [0.43, 0], [0.84, 1]]]],
  w: [1.24, [[[0.02, 1], [0.32, 0], [0.62, 0.78], [0.92, 0], [1.22, 1]]]],
  x: [0.82, [[[0.04, 1], [0.78, 0]], [[0.78, 1], [0.04, 0]]]],
  y: [0.86, [[[0.02, 1], [0.43, 0]], [[0.84, 1], [0.28, -0.5]]]],
  z: [0.82, [[[0.06, 1], [0.76, 1], [0.06, 0], [0.78, 0]]]],
  M: [1.2, [[[0.06, 0], [0.14, 1.4], [0.6, 0.45], [1.06, 1.4], [1.14, 0]]]],
  P: [0.9, [[[0.08, 0], [0.08, 1.4], [0.45, 1.4], ...arc(0.45, 1.06, 0.36, 0.34, 90, -90).slice(1), [0.08, 0.72]]]],
  0: [0.9, [arc(0.45, 0.7, 0.38, 0.7, 90, 450)]],
  1: [0.62, [[[0.12, 1.12], [0.42, 1.4], [0.42, 0]]]],
  2: [0.86, [[...arc(0.42, 1.02, 0.36, 0.38, 155, -25), [0.06, 0], [0.82, 0]]]],
  3: [0.84, [[...arc(0.4, 1.06, 0.33, 0.34, 150, -90), ...arc(0.4, 0.38, 0.38, 0.38, 90, -150).slice(1)]]],
  4: [0.9, [[[0.62, 0], [0.62, 1.4], [0.04, 0.42], [0.86, 0.42]]]],
  5: [0.86, [[[0.76, 1.4], [0.16, 1.4], [0.12, 0.8], ...arc(0.42, 0.45, 0.38, 0.45, 120, -150).slice(1)]]],
  6: [0.88, [[...arc(0.45, 0.95, 0.38, 0.45, 60, 170), ...arc(0.45, 0.42, 0.38, 0.42, 170, 530).slice(1)]]],
  7: [0.8, [[[0.04, 1.4], [0.78, 1.4], [0.3, 0]]]],
  8: [0.86, [[...arc(0.43, 1.06, 0.3, 0.34, -90, 270), ...arc(0.43, 0.36, 0.38, 0.36, 90, 450).slice(1)]]],
  9: [0.88, [[...arc(0.43, 0.98, 0.38, 0.42, -10, 350), ...arc(0.43, 0.45, 0.38, 0.45, 0, -110).slice(1)]]],
  ':': [0.34, [point(0.14, 0.08), point(0.14, 0.82)]],
  '.': [0.32, [point(0.12, 0.08)]],
  ',': [0.32, [[[0.16, 0.12], [0.06, -0.22]]]],
  '!': [0.32, [[[0.12, 1.4], [0.12, 0.4]], point(0.12, 0.08)]],
  '?': [0.78, [[...arc(0.38, 1.06, 0.34, 0.34, 160, -60), [0.38, 0.4]], point(0.38, 0.08)]],
  '-': [0.6, [[[0.08, 0.55], [0.5, 0.55]]]],
  "'": [0.28, [[[0.14, 1.42], [0.08, 1.08]]]],
  ' ': [0.48, []],
};
G['’'] = G["'"];
// Accents : la lettre de base, puis le signe posé au-dessus (ou dessous pour la cédille).
const ACCENTS = {
  '́': (m) => [[[m - 0.1, 1.16], [m + 0.14, 1.42]]],
  '̀': (m) => [[[m - 0.14, 1.42], [m + 0.1, 1.16]]],
  '̂': (m) => [[[m - 0.2, 1.16], [m, 1.42], [m + 0.2, 1.16]]],
  '̈': (m) => [point(m - 0.16, 1.3), point(m + 0.16, 1.3)],
  '̧': (m) => [[[m, 0], [m + 0.06, -0.18], [m - 0.1, -0.32]]],
};

// Les glyphes d'un caractère, accents composés ; null s'il n'est pas dessinable (la mise en page le refuse).
function glyphe(car) {
  const [base, ...signes] = car.normalize('NFD');
  const g = G[base] || G[base.toLowerCase()];
  if (!g) return null;
  // Le point du i laisse la place à l'accent (î, ï).
  let traits = signes.length && (base === 'i' || base === 'j') ? g[1].slice(0, 1) : g[1];
  for (const s of signes) {
    if (!ACCENTS[s]) return null;
    traits = [...traits, ...ACCENTS[s](base === 'i' ? 0.12 : g[0] * 0.48)];
  }
  return [g[0], traits];
}
// Ce que la police ne sait pas dessiner : la config est vérifiée par l'essai plutôt qu'à l'écran.
export const manquants = (texte) => [...new Set([...texte].filter((c) => !glyphe(c)))];
export const largeur = (mot) => [...mot].reduce((s, c) => s + (glyphe(c)?.[0] ?? 0.5), 0);

// Mise en page dans le disque de café (rayon 1, y vers le haut) : les propositions l'une sous l'autre, chacune
// coupée en lignes qui tiennent dans la corde du cercle à leur hauteur. On cherche la plus grande taille qui tient.
export function mettreEnPage(phrases, { rayonUtile = 0.8 } = {}) {
  for (let s = 0.16; s > 0.035; s *= 0.96) {
    const interligne = 2.05 * s, ecart = 0.9 * interligne, blocs = [];
    for (const phrase of phrases) {
      const mots = phrase.split(/\s+/), lignes = [];
      // Les deux-points restent avec le mot qui les précède (règle typographique : jamais en tête de ligne).
      for (let i = 0; i < mots.length; i++) if (/^[:;!?]$/.test(mots[i]) && i) { mots[i - 1] += ' ' + mots[i]; mots.splice(i--, 1); }
      for (const mot of mots) {
        const derniere = lignes[lignes.length - 1];
        // Coupure gloutonne à une largeur cible, recalée ensuite contre le cercle.
        if (derniere && (largeur(derniere + ' ' + mot) * s) < rayonUtile * 1.55) lignes[lignes.length - 1] = derniere + ' ' + mot;
        else lignes.push(mot);
      }
      blocs.push(lignes);
    }
    const n = blocs.reduce((t, b) => t + b.length, 0);
    const hauteur = n * interligne + (blocs.length - 1) * ecart;
    let y = hauteur / 2 - interligne * 0.72, ok = true;
    const lignes = [];
    blocs.forEach((b, k) => {
      if (k) y -= ecart;
      for (const texte of b) {
        const l = largeur(texte) * s;
        // Les deux bords de la ligne (capitales et jambages compris) doivent rester dans le disque utile.
        const haut = y + 1.45 * s, bas = y - 0.5 * s, demi = Math.sqrt(Math.max(0, rayonUtile ** 2 - Math.max(haut * haut, bas * bas)));
        if (l / 2 > demi) ok = false;
        lignes.push({ texte, phrase: k, x: -l / 2, y, largeur: l });
        y -= interligne;
      }
    });
    if (ok) return { taille: s, lignes, boites: phrases.map((_, k) => boite(lignes.filter((l) => l.phrase === k), s)) };
  }
  throw new Error('propositions trop longues pour la tasse');
}
// Rectangle de clic d'une proposition (unités du disque) : du haut des capitales au bas des jambages, avec marge.
function boite(lignes, s) {
  const m = 0.35 * s;
  return { gauche: Math.min(...lignes.map((l) => l.x)) - m, droite: Math.max(...lignes.map((l) => l.x + l.largeur)) + m,
    haut: lignes[0].y + 1.45 * s + m, bas: lignes[lignes.length - 1].y - 0.5 * s - m * 0.4 };
}

// Les traits de la page, en unités du disque, avec la longueur cumulée de chacun : le versement suit cet ordre.
export function traits(page) {
  const liste = [];
  for (const l of page.lignes) {
    let x = l.x;
    for (const c of l.texte) {
      const [avance, gl] = glyphe(c);
      for (const t of gl) liste.push({ phrase: l.phrase, points: t.map(([u, v]) => [x + u * page.taille, l.y + v * page.taille]) });
      x += avance * page.taille;
    }
  }
  return liste;
}

// Dessine la page dans un canevas carré : R = mousse de la première proposition, V = de la seconde,
// B = instant du versement (0 → 1) de chaque pixel. Le shader révèle ce qui a été versé : le canevas n'est tracé
// qu'une fois et envoyé une fois au GPU, l'animation ne coûte qu'une comparaison par pixel.
// deja : propositions déjà écrites (après le sucre, la mousse se réarrange : la première reparaît à sa nouvelle
// place sans être reversée). Leurs pixels portent B = 255, une valeur que le versement n'atteint jamais (≤ 254) :
// le fond est lui aussi à 255, si bien que le flou des mipmaps ne mélange jamais « déjà là » et « à verser ».
export function peindre(canevas, page, { epaisseur = 0.2, levee = 0.5, pause = 1.4, deja = [] } = {}) {
  const tous = traits(page), N = canevas.width, ctx = canevas.getContext('2d');
  const T = tous.filter((t) => !deja.includes(t.phrase));
  const versPx = ([x, y]) => [(x + 1) / 2 * N, (1 - y) / 2 * N];
  // Longueurs : le geste suit la longueur du trait, plus un temps de levée entre deux traits et une pause entre
  // les deux propositions (la seconde arrive après, comme une arrière-pensée).
  let total = 0;
  const debuts = T.map((t, i) => {
    if (i && T[i - 1].phrase !== t.phrase) total += pause * page.taille;
    const d = total; let l = 0;
    for (let j = 1; j < t.points.length; j++) l += Math.hypot(t.points[j][0] - t.points[j - 1][0], t.points[j][1] - t.points[j - 1][1]);
    t.longueur = Math.max(l, 0.02 * page.taille); total += t.longueur + levee * page.taille;
    return d;
  });
  ctx.fillStyle = 'rgb(0,0,255)'; ctx.fillRect(0, 0, N, N);
  ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = epaisseur * page.taille * N / 2;
  for (const t of tous) {
    if (!deja.includes(t.phrase)) continue;
    ctx.strokeStyle = `rgb(${t.phrase === 0 ? 255 : 0},${t.phrase === 0 ? 0 : 255},255)`;
    ctx.beginPath(); ctx.moveTo(...versPx(t.points[0])); for (const p of t.points.slice(1)) ctx.lineTo(...versPx(p));
    if (t.points.length === 2) ctx.lineTo(...versPx(t.points[1]));
    ctx.stroke();
  }
  // Chaque petit segment porte son instant dans le bleu : le trait se révèle de son début à sa fin.
  const pas = 1.5 / N * 2;
  T.forEach((t, i) => {
    const rouge = t.phrase === 0 ? 255 : 0, vert = t.phrase === 0 ? 0 : 255;
    let parcouru = 0;
    for (let j = 1; j < t.points.length; j++) {
      const [a, b] = [t.points[j - 1], t.points[j]], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / pas));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        const instant = (debuts[i] + parcouru + l * k / n) / total;
        ctx.strokeStyle = `rgb(${rouge},${vert},${Math.min(254, Math.round(instant * 254))})`;
        ctx.beginPath(); ctx.moveTo(...versPx(p)); ctx.lineTo(...versPx(q)); ctx.stroke();
      }
      parcouru += l;
    }
    // Un point isolé (point du i, deux-points) : une goutte de crème posée d'un coup.
    if (t.points.length === 2 && t.longueur <= 0.03 * page.taille) {
      ctx.strokeStyle = `rgb(${rouge},${vert},${Math.round(debuts[i] / total * 254)})`;
      ctx.beginPath(); ctx.moveTo(...versPx(t.points[0])); ctx.lineTo(...versPx(t.points[1])); ctx.stroke();
    }
  });
  // Où en est le versement de chaque proposition : la seconde ne s'éclaire au survol qu'une fois écrite.
  const fins = [0, 1].map((k) => { const d = T.map((t, i) => [t, i]).filter(([t]) => t.phrase === k); return d.length ? (debuts[d[d.length - 1][1]] + d[d.length - 1][0].longueur) / total : 0; });
  // Sans rien à verser (tout est déjà là), pas de tête : la tache de crème ne court nulle part.
  if (!T.length) return { longueur: 0, fins, tete: () => null, deja };
  // La tête du versement, échantillonnée pour poser la petite tache de crème qui suit le geste.
  const tete = (u) => {
    const d = u * total; let i = debuts.findIndex((x, k) => d >= x && d <= x + T[k].longueur);
    if (i < 0) return null;
    let reste = d - debuts[i];
    const p = T[i].points;
    for (let j = 1; j < p.length; j++) { const l = Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]); if (reste <= l) { const f = l ? reste / l : 0; return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * f, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * f]; } reste -= l; }
    return p[p.length - 1];
  };
  return { longueur: total, fins, tete, deja };
}
