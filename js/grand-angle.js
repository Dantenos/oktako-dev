// La vue dans l'objectif ultra grand angle, côté page : un dialogue par-dessus la scène, comme le tiroir des objectifs. Le parcours s'arrête ici, sur le verre sombre
// (décision de l'utilisateur, 31/10). Échap, la croix ou le bouton ramènent au tiroir ; la souris fait glisser les reflets.
import { creerBas, texteEchap } from './fermer.js';
export function creerGrandAngle({ scene, mouvementReduit, annoncer, son = () => null, auRetour }) {
  let phase = 'repos', racine = null, retour = null, focusAvant = null;
  const inerties = new Map();
  const souris = (e) => { if (phase !== 'arrivee' || mouvementReduit()) return; scene()?.sourisFisheye(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); };
  async function entrer() {
    if (phase !== 'repos' || !scene()) return;
    phase = 'aller'; focusAvant = document.activeElement;
    racine = document.createElement('section'); racine.className = 'tiroir grand-angle'; racine.dataset.phase = phase;
    racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-modal', 'true'); racine.setAttribute('aria-labelledby', 'grand-angle-titre');
    const titre = document.createElement('h2'); titre.id = 'grand-angle-titre'; titre.className = 'tiroir__titre'; titre.textContent = 'L’ultra grand angle';
    retour = document.createElement('button'); retour.type = 'button'; retour.className = 'tako-bouton tiroir__retour'; retour.textContent = texteEchap('← Retour au tiroir · Échap');
    retour.addEventListener('click', () => revenir());
    const aide = document.createElement('p'); aide.className = 'tiroir__aide'; aide.setAttribute('aria-hidden', 'true'); aide.textContent = 'Échap pour revenir';
    racine.append(titre, retour, creerBas(aide, () => revenir()));
    racine.addEventListener('pointermove', souris, { passive: true });
    document.body.append(racine);
    for (const e of document.body.children) if (e !== racine && e.id !== 'annonce') { inerties.set(e, e.inert); e.inert = true; }
    document.body.classList.add('tiroir-actif'); retour.focus({ preventScroll: true });
    son()?.evenement?.('diaphragme-objectif');
    annoncer('La vue plonge dans l’objectif : un verre sombre, les lames du diaphragme au fond.');
    await scene().entrerFisheye();
    if (phase !== 'aller') return;
    phase = 'arrivee'; racine.dataset.phase = phase;
  }
  async function revenir({ sansTravelling = false } = {}) {
    if (phase === 'repos' || phase === 'retour') return;
    phase = 'retour'; racine.dataset.phase = phase; retour.disabled = true;
    scene()?.sourisFisheye(0, 0);
    if (!sansTravelling) await scene()?.sortirTiroir();
    racine.remove(); racine = retour = null;
    for (const [e, inert] of inerties) e.inert = inert; inerties.clear();
    document.body.classList.remove('tiroir-actif'); phase = 'repos';
    auRetour(); focusAvant?.focus({ preventScroll: true }); annoncer('Retour au tiroir.');
  }
  document.addEventListener('keydown', (e) => {
    if (phase === 'repos') return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); revenir(); return; }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ordre = [retour, racine.querySelector('.fermer-x')].filter(Boolean), j = ordre.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1);
    ordre[(j + ordre.length) % ordre.length]?.focus();
  }, true);
  return { entrer, revenir, get active() { return phase !== 'repos'; }, etat: () => ({ phase }) };
}
