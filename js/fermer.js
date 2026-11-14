// La croix des vues rapprochées, à côté de la mention d'Échap : elle fait exactement comme Échap, à la souris et au doigt. Sans clavier, la mention d'Échap se retire, la croix reste.
const sansClavier = () => matchMedia('(pointer: coarse)').matches;
export const texteEchap = (t) => (sansClavier() ? t.replace(/ · Échap( pour revenir)?$/, '') : t);
export function creerBas(aide, fermer) {
  const bas = document.createElement('div'); bas.className = 'vue-bas';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'fermer-x'; x.setAttribute('aria-label', 'Fermer'); x.textContent = '×';
  x.addEventListener('click', () => fermer());
  bas.append(...(aide ? [aide] : []), x);
  return bas;
}
