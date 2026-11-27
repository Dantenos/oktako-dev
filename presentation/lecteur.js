// Chargé après la pièce : aucune source vidéo n'existe avant son autorisation.
export function creerPresentation({ document: doc = document, afficher, sons = {}, annoncer = () => {} }) {
  const fichier = nom => new URL(`presentation/${nom}`, doc.baseURI).href;
  let etat = { prete: false, visible: false }, affiche = null, boucle = null, dialogue = null;
  let complet = null, origine = null, essayee = false, imagePrete = false, detruit = false;
  let derniereImage;
  const montrer = image => { if (image !== derniereImage) { derniereImage = image; afficher(image); } };
  const autorisee = () => etat.prete && etat.visible && !doc.hidden && !etat.mouvementReduit && !etat.economiser && !dialogue?.open && !detruit;
  const fixe = () => montrer(imagePrete ? affiche : null);
  function actualiser(nouveau = etat) {
    if (detruit) return;
    etat = nouveau;
    if (!autorisee()) {
      if (boucle) { boucle.autoplay = false; boucle.pause(); }
      essayee = false; fixe();
      // Save-Data activé en cours de lecture coupe aussi le téléchargement déjà parti.
      if (boucle?.src && (etat.economiser || !etat.prete)) { boucle.removeAttribute('src'); boucle.load(); }
    }
    if (!etat.prete) return;
    if (!affiche) {
      affiche = doc.createElement('img');
      affiche.addEventListener('load', () => { imagePrete = true; if (!detruit && (!boucle || boucle.paused || boucle.readyState < 2)) fixe(); });
      affiche.src = fichier('affiche-boucle-4x3.webp');
    }
    if (!autorisee()) return;
    if (!boucle) {
      boucle = doc.createElement('video');
      boucle.preload = 'none'; boucle.muted = true; boucle.defaultMuted = true;
      boucle.loop = true; boucle.playsInline = true; boucle.autoplay = true;
      boucle.setAttribute('muted', ''); boucle.setAttribute('playsinline', '');
      boucle.addEventListener('loadeddata', () => { if (autorisee() && !boucle.paused) montrer(boucle); });
      boucle.addEventListener('playing', () => { if (autorisee()) montrer(boucle); else boucle.pause(); });
      boucle.addEventListener('error', () => { fixe(); annoncer('La présentation reste disponible au clic sur l’écran.'); });
    }
    boucle.autoplay = true;
    if (!boucle.src) boucle.src = fichier(boucle.canPlayType('video/webm; codecs="vp9"') ? 'boucle-ecran-4x3.webm' : 'boucle-ecran-4x3.mp4');
    if (essayee) return;
    essayee = true;
    // Une politique de lecture automatique peut refuser ; l'affiche et le clic restent utilisables.
    boucle.play().then(() => { if (!autorisee()) boucle.pause(); }).catch(fixe);
  }
  function fermer() {
    if (dialogue?.open) dialogue.close();
  }
  function ouvrir(declencheur) {
    if (!etat.prete || detruit || dialogue?.open) return;
    origine = declencheur || doc.activeElement;
    if (!dialogue) {
      dialogue = doc.createElement('dialog'); dialogue.id = 'presentation-video'; dialogue.className = 'presentation-video';
      dialogue.setAttribute('aria-labelledby', 'presentation-video-titre');
      const titre = doc.createElement('h2'); titre.id = 'presentation-video-titre'; titre.textContent = 'Je suis Édouard — mes projets en vidéo';
      const croix = doc.createElement('button'); croix.type = 'button'; croix.className = 'presentation-video__fermer'; croix.textContent = 'Fermer';
      croix.setAttribute('aria-label', 'Fermer la vidéo'); croix.addEventListener('click', fermer);
      complet = doc.createElement('video'); complet.controls = true; complet.playsInline = true; complet.preload = 'none'; complet.muted = false;
      complet.setAttribute('aria-label', 'Présentation de MajorTakito, voix anglaise, sous-titres français');
      complet.addEventListener('error', () => annoncer('La vidéo n’a pas pu être chargée. Vous pouvez fermer cette fenêtre et réessayer.'));
      dialogue.append(titre, complet, croix); doc.body.append(dialogue);
      // Le dialogue natif rend le reste de la page inerte, y compris au clavier et au lecteur d'écran.
      dialogue.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); }
        // Le dialogue rend la page inerte, mais Chrome peut encore envoyer Tab dans sa barre
        // d'adresse. Refermer les deux extrémités garde le parcours dans les contrôles vidéo.
        if (e.key === 'Tab') {
          if (!e.shiftKey && doc.activeElement === croix) { e.preventDefault(); complet.focus(); }
          else if (e.shiftKey && doc.activeElement === complet) { e.preventDefault(); croix.focus(); }
        }
      });
      dialogue.addEventListener('cancel', e => { e.preventDefault(); fermer(); });
      dialogue.addEventListener('close', () => {
        complet.pause(); complet.removeAttribute('src'); complet.replaceChildren(); complet.load();
        sons.rendre?.(); origine?.focus({ preventScroll: true }); actualiser();
      });
    }
    complet.poster = fichier('affiche-video-16x9.webp');
    for (const [langue, nom] of [['fr', 'Français'], ['en', 'English']]) {
      const piste = doc.createElement('track'); piste.kind = 'subtitles'; piste.srclang = langue; piste.label = nom; piste.default = langue === 'fr';
      piste.src = fichier(`majortakito-v6.5.${langue}.vtt`); complet.append(piste);
    }
    complet.src = fichier('majortakito-v6.5-web.mp4');
    dialogue.showModal(); actualiser(); sons.couper?.();
    dialogue.lastElementChild?.focus({ preventScroll: true });
    // Appelé directement depuis le clic : le son bénéficie de l'activation du visiteur.
    complet.play().catch(() => annoncer('Appuyez sur Lecture pour démarrer la vidéo avec le son.'));
  }
  return {
    actualiser, ouvrir, fermer,
    get active() { return !!dialogue?.open; },
    etat: () => ({ active: !!dialogue?.open, boucle: !!boucle && !boucle.paused, source: boucle?.currentSrc || '', affiche: imagePrete }),
    detruire() { detruit = true; fermer(); boucle?.pause(); if (boucle) { boucle.removeAttribute('src'); boucle.load(); } dialogue?.remove(); montrer(null); },
  };
}
