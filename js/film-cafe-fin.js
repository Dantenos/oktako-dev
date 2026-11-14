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

export function creerFinFilm({ hote, image, format, propositions, libelleRendezVous, immediat = false }) {
  const fond = document.createElement('div'); fond.className = 'film-fin';
  const img = image.cloneNode(); img.className = 'film-fin__image'; img.alt = ''; fond.append(img);
  const calque = document.createElement('div'); calque.className = 'film-fin__ecriture';
  const liens = propositions.map((p) => {
    const a = p.cloneNode(true); a.className = 'film-fin__lien'; a.hidden = false;
    if (a.dataset.proposition === 'rendez-vous' && libelleRendezVous) a.textContent = libelleRendezVous;
    calque.append(a); return a;
  });
  fond.append(calque); hote.prepend(fond);
  function placer() {
    const w = format.calque, h = w * format.rapport;
    const m = matriceEcriture(format, hote.clientWidth, hote.clientHeight);
    // CSS arrondit les petits coefficients de perspective : une base unité conserve leur précision, puis le calque y est ramené.
    const unite = m.map((v, i) => i < 8 ? v * w : v);
    Object.assign(calque.style, { width: `${w}px`, height: `${h}px`, fontSize: `${format.police}px`,
      transform: `matrix3d(${unite.join(',')}) scale3d(${1 / w},${1 / w},1)` });
  }
  placer(); addEventListener('resize', placer);
  if (immediat) calque.classList.add('film-fin__ecriture--prete');
  return {
    liens,
    // L'écriture peut être révélée sans attendre ; une fois lisible, Échap rend le bureau.
    presser() {
      if (calque.getAnimations().some((a) => a.playState === 'running')) {
        calque.classList.add('film-fin__ecriture--prete'); return true;
      }
      return false;
    },
    fermer() { removeEventListener('resize', placer); fond.remove(); },
  };
}
