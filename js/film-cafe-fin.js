import { boitesFlaque, creerFlaque, pageFlaque } from './flaque.js';
// Le fond et l'écriture partagent le même recadrage : les coordonnées normalisées du montage restent vraies au redimensionnement.
export function matriceEcriture(format, largeur, hauteur) {
  const s = Math.max(largeur / format.largeur, hauteur / format.hauteur);
  const coins = format.ecriture.map(([x, y]) => [x * format.largeur * s + (largeur - format.largeur * s) / 2,
    y * format.hauteur * s + (hauteur - format.hauteur * s) / 2]);
  const w = format.calque, h = w * format.rapport;
  const lignes = [];
  for (const [i, [x, y]] of [[0, [0, 0]], [1, [w, 0]], [2, [w, h]], [3, [0, h]]]) {
    const [u, v] = coins[i];
    lignes.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let k = 0; k < 8; k++) {
    let pivot = k;
    for (let j = k + 1; j < 8; j++) if (Math.abs(lignes[j][k]) > Math.abs(lignes[pivot][k])) pivot = j;
    [lignes[k], lignes[pivot]] = [lignes[pivot], lignes[k]];
    const diviseur = lignes[k][k];
    if (Math.abs(diviseur) < 1e-12) throw new Error('Écriture du film : coins dégénérés');
    lignes[k] = lignes[k].map((v) => v / diviseur);
    for (let j = 0; j < 8; j++) if (j !== k) {
      const a = lignes[j][k]; lignes[j] = lignes[j].map((v, i) => v - a * lignes[k][i]);
    }
  }
  const [a, b, c, d, e, f, g, h0] = lignes.map((l) => l[8]);
  return [a, d, 0, g, b, e, 0, h0, 0, 0, 1, 0, c, f, 0, 1];
}

// La fin : l'image fixe du film, et la proposition du rendez-vous dans la flaque. Avec la flaque vivante (flaque.js, `flaque` : la promesse
// de son masque, préchargé pendant le film), le café ondule et l'écriture est peinte DANS le liquide ; les vrais liens, transparents,
// sont posés exactement sur le texte peint (clavier, lecteurs d'écran, focus visible). Sans WebGL ou sans masque : le repli d'avant,
// l'écriture HTML posée en perspective par-dessus la flaque. Si la flaque tarde (4 s) alors que son masque est là : l'écriture HTML
// se pose À PLAT dans les boîtes mêmes du texte peint, et la flaque la remplace dès qu'elle est prête, sans que les liens bougent
// (décision D4 du 18/11 : sous rendu logiciel, elle arrive à 2,6–3,1 s ; un appareil lent ne la voyait jamais).
export function creerFinFilm({ hote, image, format, propositions, libelleRendezVous, immediat = false, flaque = null, mouvementReduit = () => false, creer = creerFlaque }) {
  const fond = document.createElement('div'); fond.className = 'film-fin';
  const img = image.cloneNode(); img.className = 'film-fin__image'; img.alt = ''; fond.append(img);
  const calque = document.createElement('div'); calque.className = 'film-fin__ecriture';
  const liens = propositions.map((p, i) => {
    const a = p.cloneNode(true); a.className = 'film-fin__lien'; a.hidden = false;
    if (a.dataset.proposition === 'rendez-vous' && libelleRendezVous) a.textContent = libelleRendezVous;
    // Le survol et le focus éclairent la phrase peinte ; le pointeur y sème une ride.
    a.addEventListener('pointerenter', () => vivante?.survol(i)); a.addEventListener('focus', () => vivante?.survol(i));
    a.addEventListener('pointerleave', () => { if (document.activeElement !== a) vivante?.survol(null); });
    a.addEventListener('blur', () => vivante?.survol(null));
    calque.append(a); return a;
  });
  fond.append(calque); hote.prepend(fond);
  let vivante = null, ferme = false, mode = flaque ? 'attente' : 'repli', plat = null;
  const poser = (boites) => boites.forEach((b, i) => { if (liens[i]) Object.assign(liens[i].style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
    ...(plat && !vivante ? { fontSize: `${b.height * 0.62}px` } : {}) }); });
  function placer() {
    // Chaque lien recouvre sa phrase peinte (boîtes calculées par la mise en page, projetées comme l'image) ; à plat, la même boîte.
    if (vivante) return poser(vivante.boites());
    if (plat) return poser(boitesFlaque(plat.d, plat.page, hote.clientWidth, hote.clientHeight));
    const w = format.calque, h = w * format.rapport;
    const m = matriceEcriture(format, hote.clientWidth, hote.clientHeight);
    // CSS arrondit les petits coefficients de perspective : une base unité conserve leur précision, puis le calque y est ramené.
    const unite = m.map((v, i) => i < 8 ? v * w : v);
    Object.assign(calque.style, { width: `${w}px`, height: `${h}px`, fontSize: `${format.police}px`,
      transform: `matrix3d(${unite.join(',')}) scale3d(${1 / w},${1 / w},1)` });
  }
  placer(); addEventListener('resize', placer);
  const repli = () => {
    if (ferme || mode === 'repli') return;
    mode = 'repli'; calque.classList.remove('film-fin__ecriture--attente');
    if (immediat) calque.classList.add('film-fin__ecriture--prete');
  };
  // Les liens quittent le calque projeté : posés à plat sur la flaque, au-dessus du canevas.
  const aPlat = () => { calque.remove(); for (const a of liens) { a.classList.add('film-fin__lien--peint'); fond.append(a); } };
  // La flaque tarde mais son masque est là : l'écriture HTML, visible, dans les boîtes du texte peint ; la flaque la remplacera.
  const repliAPlat = (f) => {
    if (ferme || mode !== 'attente') return;
    mode = 'repli'; plat = { d: f.donnees, page: pageFlaque(liens.map((a) => a.textContent.trim()), f.donnees) };
    aPlat(); fond.classList.add('film-fin--plat'); placer();
  };
  // Le pointeur sur le café : une ride où il passe, une onde au clic (les liens laissent passer l'événement jusqu'ici).
  const bouger = (e) => vivante?.pointeur(e.clientX, e.clientY);
  const appuyer = (e) => vivante?.pointeur(e.clientX, e.clientY, { fort: true });
  fond.addEventListener('pointermove', bouger, { passive: true }); fond.addEventListener('pointerdown', appuyer, { passive: true });
  if (flaque) {
    // L'écriture HTML attend la flaque, invisible : pas de texte qui changerait de forme sous les yeux. 4 s au plus (la flaque se crée
    // hors du fil de la page en une fraction de seconde ; sous rendu logiciel, il lui faut jusqu'à 1,5 s).
    calque.classList.add('film-fin__ecriture--attente');
    let f = null;
    // À 4 s : à plat si le masque est là (la flaque se crée encore), sinon le repli projeté (aucune flaque ne viendra la remplacer).
    const delai = setTimeout(() => (f ? repliAPlat(f) : repli()), 4000);
    (async () => {
      // Jamais dans la tâche de l'événement de fin : la flaque se crée en étapes, après lui (flaque.js).
      f = await Promise.resolve(flaque).catch(() => null);
      await new Promise((ok) => setTimeout(ok, 0));
      if (ferme || mode !== 'attente' || !f) { clearTimeout(delai); return repli(); }
      const phrases = liens.map((a) => a.textContent.trim());
      let v = null;
      // La création continue après le repli à plat ; seul le repli projeté (ou la fermeture) l'arrête.
      try { v = await creer({ hote: fond, image, donnees: f.donnees, masque: f.masque, phrases, mouvementReduit, immediat, ferme: () => ferme || (mode === 'repli' && !plat) }); } catch { v = null; }
      clearTimeout(delai);
      if (ferme || (mode === 'repli' && !plat)) { v?.fermer(); return; }
      if (!v) return mode === 'attente' ? repli() : undefined;
      const remplace = !!plat;
      vivante = v; mode = 'flaque';
      if (!remplace) aPlat();
      fond.classList.remove('film-fin--plat'); fond.classList.add('film-fin--vivante');
      placer();
      if (remplace) {
        // L'écriture HTML était lue : la phrase peinte apparaît posée, pas retracée. Le canevas vient d'être accroché (même suite de
        // micro-tâches : aucune image pleine avant le fondu) ; mouvement réduit : un remplacement net.
        v.presser();
        if (!mouvementReduit()) {
          v.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
          for (const a of liens) a.animate([{ color: '#ead9b8', textShadow: '0 2px 3px #211306' }, { color: 'transparent', textShadow: 'none' }], { duration: 500, easing: 'ease-out' });
        }
      }
    })();
  } else if (immediat) calque.classList.add('film-fin__ecriture--prete');
  return {
    liens,
    get mode() { return mode; },
    // L'écriture HTML est posée à plat et la flaque, encore en création, va la remplacer.
    get aPlat() { return !!plat && !vivante; },
    get flaque() { return vivante; },
    // L'écriture peut être révélée sans attendre ; une fois lisible, Échap rend le bureau.
    presser() {
      if (vivante) return vivante.presser();
      if (calque.getAnimations().some((a) => a.playState === 'running')) {
        calque.classList.add('film-fin__ecriture--prete'); return true;
      }
      return false;
    },
    regler() { vivante?.regler(); },
    fermer() { ferme = true; removeEventListener('resize', placer); vivante?.fermer(); vivante = null; fond.remove(); },
  };
}
