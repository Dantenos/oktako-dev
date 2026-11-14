// Démineur MajorTakito : jeu local, sans réseau ni stockage.
// Pourquoi des boutons dans une grille ARIA : chaque case est atteignable au clavier, nommée pour les lecteurs
// d'écran, et le geste « poser un drapeau » a un bouton explicite (le clic droit n'est qu'un raccourci facultatif).
const NIVEAUX = {
  facile: { l: 8, h: 8, m: 10, nom: 'Facile · 8 × 8 · 10 mines' },
  moyen: { l: 12, h: 12, m: 24, nom: 'Moyen · 12 × 12 · 24 mines' },
};
const COLONNES = 'ABCDEFGHIJKL';

export function monterDemineur(racine, { aleatoire = Math.random } = {}) {
  if (racine.__demineur) return racine.__demineur;
  const jeu = document.createElement('div');
  jeu.className = 'demineur__jeu';
  jeu.innerHTML = `
    <div class="demineur__commandes">
      <label class="demineur__niveau"><span>Niveau</span>
        <select>${Object.entries(NIVEAUX).map(([k, n]) => `<option value="${k}">${n.nom}</option>`).join('')}</select></label>
      <button type="button" class="tako-bouton demineur__mode" aria-pressed="false"><span class="demineur__icone-drapeau" aria-hidden="true"></span>Mode drapeau</button>
      <button type="button" class="tako-bouton demineur__nouvelle">Nouvelle partie</button>
    </div>
    <p class="demineur__etat"><span class="demineur__compteur"></span><span class="demineur__message" role="status"></span></p>
    <div class="demineur__grille" role="grid" aria-label="Grille du démineur"></div>`;
  racine.append(jeu);
  const $ = (s) => jeu.querySelector(s);
  const grille = $('.demineur__grille'), compteur = $('.demineur__compteur'), message = $('.demineur__message');
  const boutonMode = $('.demineur__mode'), choixNiveau = $('select');

  let n, mines, ouvertes, drapeaux, autour, etat, modeDrapeau = false, focus = 0, cases = [];
  const voisines = (i) => {
    const x = i % n.l, y = (i / n.l) | 0, r = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const vx = x + dx, vy = y + dy;
      if (vx >= 0 && vy >= 0 && vx < n.l && vy < n.h) r.push(vy * n.l + vx);
    }
    return r;
  };
  const nomCase = (i) => `${COLONNES[i % n.l]}${((i / n.l) | 0) + 1}`;

  function nouvelle(niveau = choixNiveau.value) {
    n = NIVEAUX[niveau] || NIVEAUX.facile; choixNiveau.value = niveau;
    const total = n.l * n.h;
    mines = null; ouvertes = new Uint8Array(total); drapeaux = new Uint8Array(total); autour = new Uint8Array(total);
    etat = 'attente'; focus = Math.min(focus, total - 1);
    grille.style.setProperty('--colonnes', n.l);
    grille.replaceChildren();
    cases = [];
    for (let y = 0; y < n.h; y++) {
      const ligne = document.createElement('div'); ligne.setAttribute('role', 'row'); ligne.className = 'demineur__ligne';
      for (let x = 0; x < n.l; x++) {
        const i = y * n.l + x;
        const cellule = document.createElement('span'); cellule.setAttribute('role', 'gridcell');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'demineur__case'; b.dataset.i = i; b.tabIndex = i === focus ? 0 : -1;
        cellule.append(b); ligne.append(cellule); cases.push(b);
      }
      grille.append(ligne);
    }
    dire('Touchez une case pour commencer. Le premier coup est sans danger.');
    dessiner();
  }

  // Les mines sont posées au premier coup, hors de la case jouée et de ses voisines : premier clic toujours sûr.
  function poserMines(depart) {
    const total = n.l * n.h, interdit = new Set([depart, ...voisines(depart)]);
    const libres = []; for (let i = 0; i < total; i++) if (!interdit.has(i)) libres.push(i);
    for (let k = libres.length - 1; k > 0; k--) { const j = Math.floor(aleatoire() * (k + 1)); [libres[k], libres[j]] = [libres[j], libres[k]]; }
    mines = new Uint8Array(total); for (const i of libres.slice(0, n.m)) mines[i] = 1;
    for (let i = 0; i < total; i++) autour[i] = voisines(i).reduce((s, v) => s + mines[v], 0);
  }

  function jouer(i) {
    if (etat === 'gagne' || etat === 'perdu' || drapeaux[i] || ouvertes[i]) return;
    if (!mines) { poserMines(i); etat = 'en cours'; }
    if (mines[i]) { ouvertes[i] = 1; etat = 'perdu'; cases[i].dataset.explosion = 'true'; dire(`Perdu : une mine en ${nomCase(i)}. « Nouvelle partie » ou N pour rejouer.`); dessiner(); return; }
    // Découverte en tache d'huile : une case sans mine voisine ouvre ses voisines.
    const pile = [i];
    while (pile.length) {
      const c = pile.pop(); if (ouvertes[c] || drapeaux[c]) continue;
      ouvertes[c] = 1;
      if (autour[c] === 0) for (const v of voisines(c)) if (!ouvertes[v]) pile.push(v);
    }
    const restantes = n.l * n.h - n.m - ouvertes.reduce((s, v) => s + v, 0);
    if (restantes === 0) { etat = 'gagne'; for (let k = 0; k < mines.length; k++) if (mines[k]) drapeaux[k] = 1; dire('Gagné ! Toutes les cases sûres sont découvertes.'); }
    else dire(autour[i] ? `${nomCase(i)} : ${autour[i]} mine${autour[i] > 1 ? 's' : ''} autour.` : `${nomCase(i)} : zone dégagée.`);
    dessiner();
  }
  function drapeau(i) {
    if (etat === 'gagne' || etat === 'perdu' || ouvertes[i]) return;
    drapeaux[i] = drapeaux[i] ? 0 : 1;
    dire(`${nomCase(i)} : drapeau ${drapeaux[i] ? 'posé' : 'retiré'}.`);
    dessiner();
  }

  function dessiner() {
    const poses = drapeaux.reduce((s, v) => s + v, 0);
    compteur.textContent = `Mines restantes : ${n.m - poses}`;
    jeu.dataset.etat = etat;
    for (let i = 0; i < cases.length; i++) {
      const b = cases[i]; const fin = etat === 'perdu';
      let e = 'cachee', texte = '', nom = 'cachée';
      if (ouvertes[i] && mines?.[i]) { e = 'mine'; nom = 'mine'; }
      else if (ouvertes[i]) { e = 'ouverte'; texte = autour[i] || ''; nom = autour[i] ? `${autour[i]} mine${autour[i] > 1 ? 's' : ''} autour` : 'vide'; }
      else if (fin && mines?.[i] && !drapeaux[i]) { e = 'mine'; nom = 'mine'; }
      else if (drapeaux[i]) { e = fin && !mines[i] ? 'erreur' : 'drapeau'; nom = e === 'erreur' ? 'drapeau à tort' : 'drapeau'; }
      b.dataset.etat = e; b.dataset.n = texte; b.textContent = texte;
      b.setAttribute('aria-label', `${nomCase(i)}, ${nom}`);
      b.setAttribute('aria-disabled', String(!!ouvertes[i] || etat === 'gagne' || fin));
    }
  }
  function dire(t) { message.textContent = t; }
  function deplacer(i) {
    i = Math.max(0, Math.min(cases.length - 1, i));
    cases[focus].tabIndex = -1; focus = i; cases[i].tabIndex = 0; cases[i].focus();
  }

  grille.addEventListener('click', (e) => {
    const b = e.target.closest('.demineur__case'); if (!b) return;
    const i = +b.dataset.i; deplacer(i);
    if (modeDrapeau) drapeau(i); else jouer(i);
  });
  grille.addEventListener('contextmenu', (e) => { const b = e.target.closest('.demineur__case'); if (!b) return; e.preventDefault(); drapeau(+b.dataset.i); });
  grille.addEventListener('keydown', (e) => {
    const b = e.target.closest('.demineur__case'); if (!b) return;
    const i = +b.dataset.i, x = i % n.l;
    const cible = { ArrowRight: x < n.l - 1 ? i + 1 : i, ArrowLeft: x > 0 ? i - 1 : i, ArrowDown: i + n.l < cases.length ? i + n.l : i, ArrowUp: i - n.l >= 0 ? i - n.l : i, Home: i - x, End: i - x + n.l - 1 }[e.key];
    if (cible !== undefined) { e.preventDefault(); deplacer(cible); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); drapeau(i); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nouvelle(); deplacer(focus); }
  });
  boutonMode.addEventListener('click', () => {
    modeDrapeau = !modeDrapeau; boutonMode.setAttribute('aria-pressed', String(modeDrapeau));
    dire(modeDrapeau ? 'Mode drapeau : toucher une case pose ou retire un drapeau.' : 'Mode découverte : toucher une case la découvre.');
  });
  $('.demineur__nouvelle').addEventListener('click', () => nouvelle());
  choixNiveau.addEventListener('change', () => nouvelle(choixNiveau.value));
  nouvelle('facile');

  // Accès pour les essais automatisés (lecture de l'état, pas de triche visible dans l'interface).
  const api = {
    etat: () => ({ etat, modeDrapeau, mines: n.m, drapeaux: drapeaux.reduce((s, v) => s + v, 0), ouvertes: ouvertes.reduce((s, v) => s + v, 0), largeur: n.l, hauteur: n.h }),
    mines: () => (mines ? [...mines].flatMap((v, i) => (v ? [i] : [])) : null),
    nouvelle,
  };
  racine.__demineur = api;
  return api;
}
