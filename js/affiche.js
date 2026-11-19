import { cadrageAffiche, CAPTURES } from './affiche-cadrage.js';

// Une seule photo est téléchargée, dans l'ambiance déjà calculée pour la scène.
// Le cadre suit la hauteur réelle de l'invitation, y compris après le chargement des polices.
export function preparerAffiche(ambiance) {
  const repli = document.querySelector('.piece__repli'), piece = document.querySelector('#accueil');
  const intro = document.querySelector('#intro'), photo = new Image();
  photo.alt = ''; photo.className = 'piece__photo'; photo.decoding = 'async';
  let adresse = '', serie = 0;
  function cadrer() {
    const { width: l, height: h } = piece.getBoundingClientRect();
    const dy = innerWidth <= 760 ? intro.getBoundingClientRect().height * .3 : 0;
    const a = cadrageAffiche(l, h, dy);
    Object.assign(photo.style, { width: `${a.largeur}px`, height: `${a.hauteur}px`, left: `${a.x}px`, top: `${a.y}px` });
    // Le grand fichier ne sert que si les pixels réellement visibles le demandent.
    const hd = a.largeur * Math.min(devicePixelRatio || 1, 2) > CAPTURES[a.pose].largeur / 2;
    const src = `affiche/${ambiance}-${a.pose}${hd ? '-hd' : ''}.webp`;
    if (adresse === src) return;
    adresse = src; const n = ++serie, image = new Image(); image.src = src;
    image.decode().then(() => {
      if (n !== serie) return;
      photo.src = src; repli.append(photo); repli.dataset.affiche = ambiance;
    }).catch(() => { /* L'affiche de secours reste visible si une variante manque hors ligne. */ });
  }
  const observation = new ResizeObserver(cadrer); observation.observe(piece); observation.observe(intro);
  cadrer();
  return { cadrer };
}
