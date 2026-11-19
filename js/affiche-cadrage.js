// Les photos débordent du champ utile : on en prélève la même fenêtre optique que la caméra 3D.
// Le facteur multiplie tan(champ / 2), jamais l'angle lui-même (la perspective n'est pas linéaire).
export const CAPTURES = {
  paysage: { largeur: 5120, hauteur: 3840, facteur: 2.4 },
  portrait: { largeur: 1800, hauteur: 2700, facteur: 1.6 },
};
export function cadrageAffiche(l, h, decalageY = 0) {
  const aspect = l / h, pose = aspect < .85 ? 'portrait' : 'paysage', s = CAPTURES[pose];
  const champ = pose === 'portrait' ? 1 : Math.max(1, (16 / 9) / aspect);
  const hauteur = h * s.facteur / champ, largeur = hauteur * s.largeur / s.hauteur;
  return { pose, largeur, hauteur, x: (l - largeur) / 2, y: (h - hauteur) / 2 - decalageY };
}
