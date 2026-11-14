// Touches mobiles de DOONT_Rouille, sur le principe des FPS mobiles récents (joystick flottant, visée au glissement,
// gros tir au pouce droit, petits boutons ronds autour). Aucun visuel d'un jeu existant : seulement le principe.
// Le module ne connaît ni le noyau ni v86 : il reçoit envoyer(action, bas), viser(dx, dy) et regard(haut, bas).
(function (racine) {
  'use strict';
  const STOCK = 'doont-disposition-v1';
  const CIBLE_MIN = 48;             // cible tactile minimale, en pixels CSS
  const COURSE = 52;                // course du joystick : le pouce ne sort jamais de l'anneau
  const MORT = 0.3, MORT_PAS = 0.55; // zones mortes : avancer/reculer, puis pas de côté
  const ZONE_GAUCHE = 0.46;         // part gauche de l'écran réservée au joystick ; le reste vise

  // Chaque bouton : action du jeu (celles de doont-clavier), icône, diamètre de base `t` et centre (x, y) en fraction du pad.
  // `tenir` : actif tant que le doigt reste ; les emplacements d'armes et le menu sont de simples appuis.
  const BOUTONS = [
    { id: 'tir', action: 'tirer', icone: 'tir', libelle: 'Tirer', tenir: true },
    { id: 'tir2', action: 'tirer', icone: 'tir', libelle: 'Second tir', tenir: true, option: 'tir2' },
    { id: 'ouvrir', action: 'ouvrir', icone: 'main', libelle: 'Ouvrir ou utiliser', tenir: true },
    { id: 'sauter', action: 'sauter', icone: 'saut', libelle: 'Sauter', tenir: true },
    { id: 'courir', action: 'courir', icone: 'course', libelle: 'Courir', tenir: true },
    { id: 'arme1', action: 'arme1', icone: '1', libelle: 'Arme 1', emplacement: true },
    { id: 'arme2', action: 'arme2', icone: '2', libelle: 'Arme 2', emplacement: true },
    { id: 'arme6', action: 'arme6', icone: '6', libelle: 'Arme 6', emplacement: true },
    { id: 'arme7', action: 'arme7', icone: 'cerveau', libelle: 'Lance-Cerveau', petit: true },
    { id: 'ralentir', action: 'ralentir', icone: 'sablier', libelle: 'Sablier', tenir: true, petit: true },
    { id: 'menu', action: 'menu', icone: 'menu', libelle: 'Menu', petit: true },
    { id: 'valider', action: 'valider', icone: 'valider', libelle: 'Valider', petit: true },
  ];
  const DEFAUTS = {
    // Paysage : le pad couvre tout l'écran ; le jeu 4:3 est centré, les commandes tombent dans les marges (jamais sur la barre de vie).
    paysage: { tir: [.9, .64, 88], tir2: [.07, .4, 64], ouvrir: [.86, .86, 56], sauter: [.95, .4, 56], courir: [.84, .44, 56],
      arme1: [.4, .1, 48], arme2: [.5, .1, 48], arme6: [.6, .1, 48], arme7: [.83, .1, 48], ralentir: [.89, .1, 48], menu: [.95, .1, 48], valider: [.95, .24, 48], edition: [.05, .1, 48] },
    // Portrait : le pad est le bloc sous l'image.
    portrait: { tir: [.82, .62, 88], tir2: [.1, .5, 56], ouvrir: [.6, .84, 56], sauter: [.89, .3, 56], courir: [.58, .56, 56],
      arme1: [.1, .1, 48], arme2: [.24, .1, 48], arme6: [.38, .1, 48], arme7: [.67, .1, 48], ralentir: [.8, .1, 48], menu: [.93, .1, 48], valider: [.54, .1, 48], edition: [.08, .28, 48] },
  };
  const ICONES = {
    tir: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 100 8 4 4 0 000-8z',
    main: 'M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2 7-6 7-3 0-4-2-6-5l-1-3a1.5 1.5 0 012.6-1.4L8 14',
    saut: 'M12 19V6M6 11l6-6 6 6',
    course: 'M6 17l5-5-5-5M13 17l5-5-5-5',
    sablier: 'M7 3h10M7 21h10M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9',
    menu: 'M5 7h14M5 12h14M5 17h14',
    valider: 'M5 12.5l4.5 4.5L19 7',
    cerveau: 'M9 5a3 3 0 00-3 3 3 3 0 00-1 5 3 3 0 003 4 3 3 0 006 0 3 3 0 003-4 3 3 0 00-1-5 3 3 0 00-3-3 3 3 0 00-4 0zM12 6v12',
    edition: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3',
    fermer: 'M6 6l12 12M18 6L6 18',
  };

  // --- Logique pure (testée sous Node) ---
  // Du déplacement du pouce (vx, vy en pixels, y vers le bas) aux actions tenues. Sans cette zone morte, un doigt
  // posé sans bouger marcherait seul ; sans seuil plus haut sur le côté, le moindre écart déclencherait un pas de côté.
  function actionsJoystick(vx, vy, course = COURSE) {
    const nx = Math.max(-1, Math.min(1, vx / course)), ny = Math.max(-1, Math.min(1, -vy / course));
    const tenues = new Set();
    if (ny > MORT) tenues.add('avancer'); else if (ny < -MORT) tenues.add('reculer');
    if (nx > MORT_PAS) tenues.add('droite'); else if (nx < -MORT_PAS) tenues.add('gauche');
    return tenues;
  }
  const diametre = (t, echelle) => Math.max(CIBLE_MIN, Math.round(t * echelle));
  const borner = (v, a, b) => Math.max(a, Math.min(b, v));
  function disposition(stock, orientation) {
    // Une disposition enregistrée ne sert qu'à replacer : un fichier abîmé retombe sur les défauts, bouton par bouton.
    const def = DEFAUTS[orientation], sortie = {};
    let brut = {};
    try { brut = JSON.parse(stock)?.[orientation] || {}; } catch (_) { brut = {}; }
    for (const [id, [x, y, t]] of Object.entries(def)) {
      const b = brut[id];
      const ok = b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.s);
      sortie[id] = ok ? { x: borner(b.x, 0, 1), y: borner(b.y, 0, 1), s: borner(b.s, 0.7, 1.8), t } : { x, y, s: 1, t };
    }
    return sortie;
  }
  function reglages(stock) {
    let r = {}; try { r = JSON.parse(stock) || {}; } catch (_) { r = {}; }
    return { sensibilite: Number.isFinite(r.sensibilite) ? borner(r.sensibilite, 0.5, 2.5) : 1, tir2: r.tir2 !== false };
  }

  function creer({ parent, envoyer, viser = () => {}, regard = () => {}, stockage = null, surface = null, vibrer = true }) {
    const doc = parent.ownerDocument, win = doc.defaultView;
    const el = (nom, classe, parentEl) => { const e = doc.createElement(nom); if (classe) e.className = classe; (parentEl || racineFps).appendChild(e); return e; };
    const svg = (cle, classe) => {
      const s = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', classe || 'fps-icone'); s.setAttribute('aria-hidden', 'true');
      if (ICONES[cle]) { const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONES[cle]); s.appendChild(p); }
      else { const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('x', '12'); t.setAttribute('y', '17.5'); t.setAttribute('text-anchor', 'middle'); t.textContent = cle; s.appendChild(t); }
      return s;
    };
    let stock = null; try { stock = stockage?.getItem(STOCK) ?? null; } catch (_) { stock = null; }
    let opt = reglages(stock), lay = {}, orientation = 'paysage', edition = false, choisi = null;
    const sauver = () => {
      let tout = {}; try { tout = JSON.parse(stock) || {}; } catch (_) { tout = {}; }
      tout[orientation] = Object.fromEntries(Object.entries(lay).map(([id, v]) => [id, { x: +v.x.toFixed(4), y: +v.y.toFixed(4), s: +v.s.toFixed(2) }]));
      tout.sensibilite = opt.sensibilite; tout.tir2 = opt.tir2;
      stock = JSON.stringify(tout); try { stockage?.setItem(STOCK, stock); } catch (_) { /* choix gardé pour la visite */ }
    };

    const racineFps = doc.createElement('div'); racineFps.className = 'fps'; parent.appendChild(racineFps);
    const zoneG = el('div', 'fps-zone fps-zone-g'), zoneD = el('div', 'fps-zone fps-zone-d');
    const anneau = el('div', 'fps-anneau'); anneau.hidden = true; const pouce = el('div', 'fps-pouce', anneau);
    const boutons = {}, tenus = new Map(); // id → pointerId
    const defs = BOUTONS.concat([{ id: 'edition', action: null, icone: 'edition', libelle: 'Modifier la disposition des touches', petit: true }]);
    for (const d of defs) {
      const b = el('button', 'fps-bouton' + (d.petit ? ' fps-petit' : '') + (d.emplacement ? ' fps-emplacement' : ''));
      b.type = 'button'; b.setAttribute('aria-label', d.libelle); b.dataset.bouton = d.id; b.appendChild(svg(d.icone)); boutons[d.id] = { d, b };
    }
    // Un doigt déjà levé (charge, retard) rend la capture impossible : le geste doit continuer sans elle.
    const capturer = (cible, id) => { try { cible.setPointerCapture?.(id); } catch (_) { /* pointeur plus actif */ } };
    const retour = pointeur => { if (vibrer && win.navigator?.vibrate) { try { win.navigator.vibrate(pointeur); } catch (_) { /* sans vibreur */ } } };

    // --- Placement ---
    function placer() {
      const r = parent.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nouvelle = r.width > r.height * 1.1 ? 'paysage' : 'portrait';
      if (nouvelle !== orientation || !Object.keys(lay).length) { orientation = nouvelle; lay = disposition(stock, orientation); }
      for (const { d, b } of Object.values(boutons)) {
        const v = lay[d.id]; if (!v) continue;
        const px = diametre(v.t, v.s);
        b.hidden = (d.option === 'tir2' && !opt.tir2);
        b.style.width = b.style.height = px + 'px';
        b.style.left = (v.x * r.width) + 'px'; b.style.top = (v.y * r.height) + 'px';
        b.classList.toggle('fps-choisi', edition && choisi === d.id);
      }
    }

    // --- Appuis sur les boutons ---
    function appui(id, bas) {
      const d = boutons[id].d; if (!d.action) return;
      boutons[id].b.classList.toggle('fps-enfonce', bas);
      envoyer(d.action, bas);
      if (d.emplacement && bas) for (const o of Object.values(boutons)) if (o.d.emplacement) o.b.classList.toggle('fps-actif', o.d.id === id);
    }
    for (const { d, b } of Object.values(boutons)) {
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        capturer(b, e.pointerId);
        if (edition) { glisser = { id: d.id, pid: e.pointerId, dx: 0, dy: 0, x0: e.clientX, y0: e.clientY, bouge: false }; choisi = d.id; synchroPanneau(); placer(); return; }
        if (d.id === 'edition') { editer(true); return; }
        if (tenus.has(d.id)) return;
        tenus.set(d.id, e.pointerId); retour(8); appui(d.id, true);
        if (!d.tenir) { /* un simple appui : relâché au lever du doigt comme une touche */ }
      });
      const fin = e => {
        if (edition && glisser?.pid === e.pointerId && glisser.id === d.id) { if (glisser.bouge) sauver(); glisser = null; return; }
        if (tenus.get(d.id) !== e.pointerId) return;
        tenus.delete(d.id); appui(d.id, false);
      };
      b.addEventListener('pointerup', fin); b.addEventListener('pointercancel', fin); b.addEventListener('lostpointercapture', fin);
      b.addEventListener('pointermove', e => {
        if (!edition || !glisser || glisser.pid !== e.pointerId || glisser.id !== d.id) return;
        const r = parent.getBoundingClientRect();
        if (Math.abs(e.clientX - glisser.x0) + Math.abs(e.clientY - glisser.y0) > 4) glisser.bouge = true;
        const v = lay[d.id]; v.x = borner((e.clientX - r.left) / r.width, 0.03, 0.97); v.y = borner((e.clientY - r.top) / r.height, 0.04, 0.96);
        placer(); e.preventDefault();
      });
    }
    let glisser = null;

    // --- Joystick flottant (moitié gauche) ---
    let stick = null;
    function relacherStick() {
      if (!stick) return;
      for (const a of stick.actions) envoyer(a, false);
      stick = null; anneau.hidden = true;
    }
    zoneG.addEventListener('pointerdown', e => {
      if (edition || stick) return;
      e.preventDefault(); capturer(zoneG, e.pointerId);
      const r = parent.getBoundingClientRect();
      // Il naît sous le pouce, sans déborder de l'écran.
      const ox = borner(e.clientX, r.left + COURSE + 8, r.right - COURSE - 8), oy = borner(e.clientY, r.top + COURSE + 8, r.bottom - COURSE - 8);
      stick = { pid: e.pointerId, ox, oy, actions: new Set() };
      anneau.hidden = false; anneau.style.left = (ox - r.left) + 'px'; anneau.style.top = (oy - r.top) + 'px'; pouce.style.transform = 'translate(-50%,-50%)';
      retour(5);
    });
    zoneG.addEventListener('pointermove', e => {
      if (!stick || stick.pid !== e.pointerId) return;
      let vx = e.clientX - stick.ox, vy = e.clientY - stick.oy; const n = Math.hypot(vx, vy);
      if (n > COURSE) { vx *= COURSE / n; vy *= COURSE / n; }
      pouce.style.transform = `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px))`;
      const suivantes = actionsJoystick(vx, vy);
      for (const a of stick.actions) if (!suivantes.has(a)) envoyer(a, false);
      for (const a of suivantes) if (!stick.actions.has(a)) envoyer(a, true);
      stick.actions = suivantes; e.preventDefault();
    });
    const finStick = e => { if (stick && stick.pid === e.pointerId) relacherStick(); };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zoneG.addEventListener(t, finStick);

    // --- Visée au glissement (moitié droite, et l'image en portrait) ---
    let vise = null, reste = 0;
    function debutVisee(e) {
      if (edition || vise) return;
      // L'image seule (portrait) ne vise qu'au toucher : à la souris, le jeu garde sa visée absolue.
      if (e.currentTarget === surface && e.pointerType !== 'touch') return;
      vise = { pid: e.pointerId, x: e.clientX, y: e.clientY, cible: e.currentTarget };
      capturer(e.currentTarget, e.pointerId); e.preventDefault();
    }
    function mouvementVisee(e) {
      if (!vise || vise.pid !== e.pointerId) return;
      const dy = e.clientY - vise.y;
      regard(dy < -2, dy > 2);
      // La sensibilité multiplie le geste ; la fraction perdue au passage est reportée pour ne pas la perdre.
      let total = (e.clientX - vise.x) * opt.sensibilite + reste, pas = Math.round(total); reste = total - pas;
      let premier = true;
      while (pas) { const p = borner(pas, -40, 40); viser(p, premier ? dy * opt.sensibilite : 0); pas -= p; premier = false; }
      vise.x = e.clientX; vise.y = e.clientY; e.preventDefault();
    }
    function finVisee(e) {
      if (e?.pointerId !== undefined && vise && e.pointerId !== vise.pid) return;
      vise = null; reste = 0; regard(false, false);
    }
    const gestes = { pointerdown: debutVisee, pointermove: mouvementVisee, pointerup: finVisee, pointercancel: finVisee, lostpointercapture: finVisee };
    const cibles = [zoneD]; if (surface) cibles.push(surface);
    for (const c of cibles) for (const [t, f] of Object.entries(gestes)) c.addEventListener(t, f);

    // --- Mode édition : déplacer, redimensionner, régler, retenir ---
    const panneau = el('div', 'fps-panneau'); panneau.hidden = true; panneau.setAttribute('role', 'group'); panneau.setAttribute('aria-label', 'Réglage des touches');
    const ligne = (texte) => { const l = el('label', 'fps-ligne', panneau); l.appendChild(doc.createTextNode(texte)); return l; };
    const sens = doc.createElement('input'); sens.type = 'range'; sens.min = '0.5'; sens.max = '2.5'; sens.step = '0.1'; ligne('Sensibilité de la visée').appendChild(sens);
    const taille = doc.createElement('input'); taille.type = 'range'; taille.min = '0.7'; taille.max = '1.8'; taille.step = '0.05'; taille.disabled = true; ligne('Taille du bouton choisi').appendChild(taille);
    const t2 = doc.createElement('input'); t2.type = 'checkbox'; ligne('Second tir à gauche').appendChild(t2);
    const raz = el('button', 'fps-texte', panneau); raz.type = 'button'; raz.textContent = 'Réinitialiser';
    const ok = el('button', 'fps-texte', panneau); ok.type = 'button'; ok.textContent = 'Terminer';
    const aide = el('p', 'fps-aide', panneau); aide.textContent = 'Glissez un bouton pour le déplacer, touchez-le pour changer sa taille.';
    for (const t of ['pointerdown', 'pointerup']) panneau.addEventListener(t, e => e.stopPropagation());
    function synchroPanneau() { sens.value = opt.sensibilite; t2.checked = opt.tir2; taille.disabled = !choisi || !lay[choisi]; if (choisi && lay[choisi]) taille.value = lay[choisi].s; }
    sens.addEventListener('input', () => { opt.sensibilite = +sens.value; sauver(); });
    t2.addEventListener('change', () => { opt.tir2 = t2.checked; sauver(); placer(); });
    taille.addEventListener('input', () => { if (choisi && lay[choisi]) { lay[choisi].s = +taille.value; sauver(); placer(); } });
    raz.addEventListener('click', () => { stock = null; try { stockage?.removeItem?.(STOCK); } catch (_) { /* rien à effacer */ } opt = reglages(null); lay = disposition(null, orientation); synchroPanneau(); placer(); });
    ok.addEventListener('click', () => editer(false));
    function editer(oui) {
      edition = oui; racineFps.classList.toggle('fps-edition', oui); panneau.hidden = !oui;
      if (oui) { relacherStick(); finVisee(); for (const [id] of [...tenus]) { tenus.delete(id); appui(id, false); } choisi = null; synchroPanneau(); }
      else sauver();
      placer();
    }

    const surRedim = () => placer();
    win.addEventListener?.('resize', surRedim);
    placer();
    // Un défilement de mise en page peut donner une taille nulle au premier appel : on replace dès la première image.
    win.requestAnimationFrame?.(placer);
    return {
      placer, editer, relacher() { relacherStick(); finVisee(); for (const [id] of [...tenus]) { tenus.delete(id); appui(id, false); } },
      etat: () => ({ orientation, edition, options: { ...opt }, disposition: JSON.parse(JSON.stringify(lay)) }),
      detruire() {
        this.relacher();
        win.removeEventListener?.('resize', surRedim);
        for (const c of cibles) for (const [t, f] of Object.entries(gestes)) c.removeEventListener(t, f);
        racineFps.remove();
      },
    };
  }

  racine.DoontFps = { creer, actionsJoystick, disposition, reglages, diametre, BOUTONS, DEFAUTS, STOCK, CIBLE_MIN, COURSE };
  if (typeof module !== 'undefined') module.exports = racine.DoontFps;
})(typeof globalThis !== 'undefined' ? globalThis : this);
