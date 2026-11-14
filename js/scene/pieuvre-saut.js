// L'entrée de la mini-pieuvre : un saut depuis derrière le casier jusqu'à sa place. Ce module ne connaît ni three.js ni le DOM : il
// donne une pose pour un instant, donc tests/pieuvre-saut.mjs éprouve sans navigateur qu'elle ne traverse rien.
//
// Ce qui donne du poids : une vraie parabole, à gravité constante, plutôt qu'une courbe dessinée. Elle s'accroupit avant de partir,
// s'étire quand elle va vite, et c'est la réception qui s'écrase. Les pieds restent le pivot : l'écrasement ne décolle pas du casier.
//   depart, arrivee : { x, y, z }, positions de ses pieds.

// Accroupie (s), puis l'écrasement à la réception (s) et son redressement, amorti.
const ELAN = 0.3, IMPACT = 0.07, REDRESSE = 0.38;
// La gravité de la pièce est plus lente que la vraie : à 9,8 m/s², ce vol de 20 cm durerait à peine le temps de le voir.
const GRAVITE = 6;
// La hauteur du sommet au-dessus de sa place : assez pour passer le bord du casier, pas assez pour sortir du cadre.
const BOND = 0.09;
const ACCROUPI = 0.76, ETIRE = 0.16, ECRASE = 0.68, PENTE = 0.22;

const lisse = (u) => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
const entre = (a, b, u) => a + (b - a) * u;

export function creerSaut(depart, arrivee) {
  const vitesse = Math.sqrt(2 * GRAVITE * (arrivee.y + BOND - depart.y)), vol = vitesse / GRAVITE + Math.sqrt(2 * BOND / GRAVITE);
  const duree = ELAN + vol + IMPACT + REDRESSE;
  const etirement = (vy) => 1 + ETIRE * Math.abs(vy) / vitesse;
  const finVol = etirement(vitesse - GRAVITE * vol);
  const pose = (t) => {
    // Comparé à la durée totale, pas au reste du vol : l'arrondi laisserait sinon une pose finale presque droite, jamais droite.
    if (t >= duree) return { ...arrivee, sy: 1, pente: 0, bras: 0, ombre: 1 };
    if (t < ELAN) return { ...depart, sy: entre(1, ACCROUPI, lisse(t / ELAN)), pente: 0, bras: 0, ombre: 0 };
    const v = t - ELAN;
    if (v < vol) {
      const u = v / vol, vy = vitesse - GRAVITE * v;
      // Le pas de côté se fait tôt : arrivée au-dessus du casier, elle file droit et ne frôle pas l'appareil photo.
      return { x: entre(depart.x, arrivee.x, 1 - (1 - u) ** 3), y: depart.y + vitesse * v - GRAVITE * v * v / 2, z: entre(depart.z, arrivee.z, u),
        sy: entre(ACCROUPI, etirement(vy), lisse(u / 0.12)), pente: PENTE * (1 - 2 * u) * lisse(u / 0.12), bras: lisse(u), ombre: lisse((u - 0.55) / 0.4) };
    }
    const r = v - vol;
    const amorti = Math.exp(-10 * r), base = { ...arrivee, pente: -PENTE * amorti, bras: amorti, ombre: 1 };
    if (r < IMPACT) return { ...base, sy: entre(finVol, ECRASE, r / IMPACT) };
    const s = r - IMPACT;
    return { ...base, sy: 1 - (1 - ECRASE) * Math.exp(-8 * s) * Math.cos(15 * s) * (1 - s / REDRESSE) };
  };
  // Le volume se garde : plus basse, plus large. Sans cela, l'écrasement la rapetisse au lieu de l'aplatir.
  return { duree, vol, debutVol: ELAN, pose: (t) => { const p = pose(Math.max(0, t)); return { ...p, sx: 1 / Math.sqrt(p.sy), fini: t >= duree }; } };
}
