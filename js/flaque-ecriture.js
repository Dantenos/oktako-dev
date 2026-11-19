// L'écriture dans la flaque de la fin du film (lot flaque-vivante) : la même police monotrait que la mousse de la tasse
// (scene/mousse.js), tracée dans l'ordre où un doigt l'écrirait. Module sans DOM : le build et les essais le chargent
// sous Node pour vérifier qu'un libellé tient dans la zone d'écriture de chaque format.
//
// Unités : pixels de l'image de fin, y vers le bas. La zone d'écriture vient de site/film/flaque.json (tools/flaque-masque.py),
// le plus grand rectangle libre de la flaque, loin de tout bord et de tout objet.
import { largeur, traits } from './scene/mousse.js';

// Le rendez-vous domine ; le café est le clin d'œil, plus petit.
export const TAILLES = [1, 0.74];
// Extensions d'une ligne autour de sa ligne de base, en hauteurs d'x : capitales et accents au-dessus, jambages au-dessous.
const HAUT = 1.45, BAS = 0.5, INTERLIGNE = 2.05, ECART = 0.75;

function couper(phrase, s, l) {
  const mots = phrase.split(/\s+/), lignes = [];
  for (const mot of mots) {
    const d = lignes[lignes.length - 1];
    if (d && largeur(d + ' ' + mot) * s <= l) lignes[lignes.length - 1] = d + ' ' + mot; else lignes.push(mot);
  }
  return lignes;
}

// La plus grande écriture qui tient dans la zone [x0, y0, x1, y1] : chaque phrase coupée en lignes, centrées ; le bloc centré.
// Rend les lignes (texte, phrase, x, ligne de base y, taille = hauteur d'x) et la boîte de clic de chaque phrase.
// tailleMin : la hauteur d'x (px de l'image) sous laquelle l'écriture ne se lirait plus ; plus petit, le libellé est refusé.
export function mettreEnPageFlaque(phrases, [x0, y0, x1, y1], { tailleMin = 0 } = {}) {
  const L = x1 - x0, H = y1 - y0;
  for (let s = H / 3; s > Math.max(3, tailleMin); s *= 0.97) {
    const blocs = phrases.map((p, k) => ({ k, t: s * TAILLES[Math.min(k, TAILLES.length - 1)], lignes: [] }));
    for (const b of blocs) b.lignes = couper(phrases[b.k], b.t, L);
    if (blocs.some((b) => b.lignes.some((l) => largeur(l) * b.t > L))) continue;
    // Lignes de base successives : un interligne dans une phrase, un écart en plus entre deux phrases.
    const lignes = []; let y = 0, haut = 0, bas = 0;
    blocs.forEach((b, i) => {
      b.lignes.forEach((texte, j) => {
        if (!i && !j) { y = HAUT * b.t; haut = 0; }
        else if (!j) y += BAS * blocs[i - 1].t + ECART * s + HAUT * b.t;
        else y += INTERLIGNE * b.t;
        lignes.push({ texte, phrase: b.k, y, taille: b.t, largeur: largeur(texte) * b.t });
        bas = y + BAS * b.t;
      });
    });
    if (bas - haut > H) continue;
    const dy = y0 + (H - bas) / 2;
    for (const l of lignes) { l.y += dy; l.x = x0 + (L - l.largeur) / 2; }
    const boites = phrases.map((_, k) => {
      const ls = lignes.filter((l) => l.phrase === k), m = 0.3 * ls[0].taille;
      return { gauche: Math.min(...ls.map((l) => l.x)) - m, droite: Math.max(...ls.map((l) => l.x + l.largeur)) + m,
        haut: ls[0].y - HAUT * ls[0].taille - m * 0.5, bas: ls[ls.length - 1].y + BAS * ls[ls.length - 1].taille + m * 0.5 };
    });
    return { taille: s, lignes, boites };
  }
  throw new Error('flaque : écriture trop longue pour la zone');
}

// Les traits de la page, en pixels de l'image, phrase par phrase, chacun avec sa taille (pour l'épaisseur du tracé).
export function traitsFlaque(page) {
  // traits() de la mousse travaille y vers le haut : la ligne de base est passée négative, puis retournée.
  return page.lignes.flatMap((l) => traits({ taille: l.taille, lignes: [{ ...l, y: -l.y }] })
    .map((t) => ({ phrase: l.phrase, taille: l.taille, points: t.points.map(([x, y]) => [x, -y]) })));
}

// Peint la page dans un canevas : R = encre de la première phrase, V = de la seconde, B = instant du tracé (0 → 254),
// le fond à B = 255 (jamais atteint). Le canevas couvre `cadre` (pixels de l'image) à `echelle` texels par pixel.
// Le shader révèle ce qui est déjà écrit ; rien n'est repeint pendant l'animation.
export function peindreFlaque(canevas, page, { cadre, echelle, epaisseur = 0.22, levee = 0.45, pause = 1.6 }) {
  const ctx = canevas.getContext('2d'), T = traitsFlaque(page);
  const px = ([x, y]) => [(x - cadre[0]) * echelle, (y - cadre[1]) * echelle];
  let total = 0;
  const debuts = T.map((t, i) => {
    if (i && T[i - 1].phrase !== t.phrase) total += pause * page.taille;
    const d = total; let l = 0;
    for (let j = 1; j < t.points.length; j++) l += Math.hypot(t.points[j][0] - t.points[j - 1][0], t.points[j][1] - t.points[j - 1][1]);
    t.longueur = Math.max(l, 0.02 * t.taille); total += t.longueur + levee * t.taille;
    return d;
  });
  ctx.fillStyle = 'rgb(0,0,255)'; ctx.fillRect(0, 0, canevas.width, canevas.height);
  ctx.lineCap = ctx.lineJoin = 'round';
  const pas = 1.5 / echelle;
  T.forEach((t, i) => {
    const r = t.phrase === 0 ? 255 : 0, v = t.phrase === 0 ? 0 : 255;
    ctx.lineWidth = epaisseur * t.taille * echelle;
    let parcouru = 0;
    // Chaque petit segment porte son instant dans le bleu : le trait se révèle de son début à sa fin.
    for (let j = 1; j < t.points.length; j++) {
      const [a, b] = [t.points[j - 1], t.points[j]], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / pas));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        ctx.strokeStyle = `rgb(${r},${v},${Math.min(254, Math.round((debuts[i] + parcouru + l * k / n) / total * 254))})`;
        ctx.beginPath(); ctx.moveTo(...px(p)); ctx.lineTo(...px(q)); ctx.stroke();
      }
      parcouru += l;
    }
    // Un point isolé (point du i, apostrophe courte) : posé d'un coup.
    if (t.points.length === 2 && t.longueur <= 0.03 * t.taille) {
      ctx.strokeStyle = `rgb(${r},${v},${Math.round(debuts[i] / total * 254)})`;
      ctx.beginPath(); ctx.moveTo(...px(t.points[0])); ctx.lineTo(...px(t.points[1])); ctx.stroke();
    }
  });
  // La pointe du tracé à l'instant u (0 → 1), en pixels de l'image : elle sème de petites rides pendant l'écriture.
  const tete = (u) => {
    const d = u * total, i = debuts.findIndex((x, k) => d >= x && d <= x + T[k].longueur);
    if (i < 0) return null;
    let reste = d - debuts[i]; const p = T[i].points;
    for (let j = 1; j < p.length; j++) {
      const l = Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]);
      if (reste <= l) { const f = l ? reste / l : 0; return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * f, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * f]; }
      reste -= l;
    }
    return p[p.length - 1];
  };
  // Où finit chaque phrase dans le tracé : le survol n'éclaire une phrase qu'une fois écrite.
  const fins = page.boites.map((_, k) => { const d = T.map((t, i) => [t, i]).filter(([t]) => t.phrase === k).pop(); return d ? (debuts[d[1]] + d[0].longueur) / total : 0; });
  return { tete, fins, longueur: total };
}
