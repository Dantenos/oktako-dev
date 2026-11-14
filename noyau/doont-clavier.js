// Positions physiques : le Z français et le W anglais portent le même code.
(function (racine) {
  'use strict';
  const ACTIONS = {
    avancer: ['Avancer', 'KeyW', 0x11], reculer: ['Reculer', 'KeyS', 0x1f],
    gauche: ['Pas à gauche', 'KeyA', 0x1e], droite: ['Pas à droite', 'KeyD', 0x20],
    ouvrir: ['Ouvrir / utiliser', 'KeyE', 0x12], tirer: ['Tirer', 'ControlLeft', 0x1d],
    sauter: ['Sauter', 'Space', 0x39], courir: ['Courir', 'ShiftLeft', 0x2a],
    ralentir: ['Sablier', 'KeyC', 0x2e],
  };
  for (let n = 1; n <= 7; n++) ACTIONS['arme' + n] = ['Arme ' + n, 'Digit' + n, n + 1];
  const STOCK = 'doont-touches-v1';
  const defaut = () => Object.fromEntries(Object.entries(ACTIONS).map(([a, v]) => [a, v[1]]));
  const permis = code => /^(Key[A-FI-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(code);
  const aliases = { ArrowUp: 0x11, ArrowDown: 0x1f, ArrowLeft: 0xe04b, ArrowRight: 0xe04d, Enter: 0x1c };
  const octets = (code, bas) => code > 255 ? [code >> 8, (code & 255) | (bas ? 0 : 128)] : [code | (bas ? 0 : 128)];
  const nom = code => ({ KeyW: 'Z (AZERTY) / W (QWERTY)', KeyA: 'Q (AZERTY) / A (QWERTY)',
    KeyQ: 'A (AZERTY) / Q (QWERTY)', KeyZ: 'W (AZERTY) / Z (QWERTY)',
    KeyM: ', (AZERTY) / M (QWERTY)', Space: 'Espace', ShiftLeft: 'Maj gauche',
    ShiftRight: 'Maj droite', ControlLeft: 'Ctrl gauche', ControlRight: 'Ctrl droite' })[code]
    || code.replace(/^Key/, '').replace(/^Digit/, 'Touche ');

  function creer({ envoyer, actif, stockage }) {
    let touches = defaut();
    const tenues = new Map();
    const valides = t => t && Object.keys(t).length === Object.keys(ACTIONS).length
      && Object.keys(ACTIONS).every(a => permis(t[a])) && new Set(Object.values(t)).size === Object.keys(ACTIONS).length;
    try { const t = JSON.parse(stockage?.getItem(STOCK) || 'null'); if (valides(t)) touches = t; } catch (_) { /* Défaut utilisable même sans stockage. */ }
    function relacher() {
      for (const scan of new Set(tenues.values())) envoyer(octets(scan, false));
      tenues.clear();
    }
    function appuyer(scan) {
      // Le décodeur PS/2 transforme les chiffres sous Maj : une arme doit rester un chiffre.
      const maj = scan >= 2 && scan <= 8 && [...tenues.values()].includes(0x2a);
      envoyer(maj ? [0xaa, ...octets(scan, true), 0x2a] : octets(scan, true));
    }
    function sauver() { try { stockage?.setItem(STOCK, JSON.stringify(touches)); } catch (_) { return false; } return true; }
    return {
      touches: () => ({ ...touches }), relacher,
      tactile(action, bas) {
        const id = 'tactile:' + action;
        const scan = ACTIONS[action]?.[2] || { regardHaut: 0x13, regardBas: 0x2f, tournerGauche: 0xe04b, tournerDroite: 0xe04d, menu: 1, valider: 0x1c, carte: 0x32 }[action];
        if (!bas && tenues.has(id)) {
          tenues.delete(id);
          if (![...tenues.values()].includes(scan)) envoyer(octets(scan, false));
          return;
        }
        if (!actif()) { relacher(); return; }
        if (scan && bas && !tenues.has(id)) {
          if (![...tenues.values()].includes(scan)) appuyer(scan);
          tenues.set(id, scan);
        }
      },
      definir(action, code) {
        if (!ACTIONS[action] || !permis(code)) throw Error('Touche réservée. Gardez Échap, G, H et les flèches disponibles.');
        if (Object.entries(touches).some(([a, c]) => a !== action && c === code)) throw Error('Cette touche sert déjà à une autre action.');
        relacher(); touches[action] = code; return sauver();
      },
      reinitialiser() { relacher(); touches = defaut(); return sauver(); },
      traiter(e, bas) {
        if (!bas && tenues.has(e.code)) {
          const scan = tenues.get(e.code); tenues.delete(e.code);
          if (![...tenues.values()].includes(scan)) envoyer(octets(scan, false));
          return true;
        }
        if (!actif()) { relacher(); return false; }
        // Les raccourcis navigateur restent disponibles ; les anciennes liaisons
        // de lettres sont absorbées pour ne pas réactiver une action remappée.
        if (e.altKey || e.metaKey || e.ctrlKey && e.shiftKey && /^Key[IJK]$/.test(e.code)) return false;
        const action = Object.keys(touches).find(a => touches[a] === e.code);
        const scan = action ? ACTIONS[action][2] : aliases[e.code];
        if (scan && bas && !tenues.has(e.code)) {
          if (![...tenues.values()].includes(scan)) appuyer(scan);
          tenues.set(e.code, scan);
        }
        return !!scan || permis(e.code);
      },
    };
  }

  function monter({ conteneur, envoyer, actif, suspendre = () => {}, reprendre = () => {}, stockage }) {
    const doc = conteneur.ownerDocument, win = doc.defaultView;
    if (!stockage) { try { stockage = win.localStorage; } catch (_) { /* La session reste jouable. */ } }
    const clavier = creer({ envoyer, actif, stockage });
    const details = doc.createElement('details'), titre = doc.createElement('summary');
    titre.textContent = 'Touches · AZERTY / QWERTY'; details.append(titre);
    const aide = doc.createElement('p');
    aide.textContent = 'ZQSD en AZERTY, WASD en QWERTY. Flèches : avancer, reculer, tourner. E : ouvrir. Cliquez sur une touche pour la changer. Échap annule. Le jeu s’arrête pendant le réglage.';
    details.append(aide);
    const statut = doc.createElement('p'); statut.setAttribute('role', 'status');
    const boutons = new Map(); let attente = null, suspendu = false;
    function afficher() { for (const [a, b] of boutons) b.textContent = ACTIONS[a][0] + ' : ' + nom(clavier.touches()[a]); }
    for (const a of Object.keys(ACTIONS)) {
      const bouton = doc.createElement('button'); bouton.type = 'button';
      bouton.addEventListener('click', () => { attente = a; statut.textContent = 'Appuyez sur la nouvelle touche pour « ' + ACTIONS[a][0] + ' ».'; });
      boutons.set(a, bouton); details.append(bouton, doc.createTextNode(' '));
    }
    const reset = doc.createElement('button'); reset.type = 'button'; reset.textContent = 'Rétablir les touches';
    reset.addEventListener('click', () => { attente = null; const ok = clavier.reinitialiser(); afficher(); statut.textContent = ok ? 'Touches rétablies.' : 'Touches rétablies pour cette session ; stockage indisponible.'; });
    details.append(doc.createElement('br'), reset, statut); conteneur.append(details); afficher();
    details.addEventListener('toggle', () => {
      attente = null; clavier.relacher();
      if (details.open && actif() && !suspendu) { suspendre(); suspendu = true; }
      else if (!details.open && suspendu) { reprendre(); suspendu = false; }
    });
    const traiter = bas => e => {
      if (details.open) {
        e.stopImmediatePropagation();
        if (bas && attente) {
          e.preventDefault();
          if (e.code === 'Escape') { attente = null; statut.textContent = 'Changement annulé.'; return; }
          try { const ok = clavier.definir(attente, e.code); attente = null; afficher(); statut.textContent = ok ? 'Touche enregistrée.' : 'Touche appliquée pour cette session ; stockage indisponible.'; }
          catch (err) { statut.textContent = err.message; }
        }
        return;
      }
      if (e.target?.nodeType && details.contains(e.target)) { e.stopImmediatePropagation(); return; }
      if (clavier.traiter(e, bas)) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    const bas = traiter(true), haut = traiter(false), relacher = () => clavier.relacher();
    win.addEventListener('keydown', bas, true); win.addEventListener('keyup', haut, true); win.addEventListener('blur', relacher);
    return { reglageOuvert: () => details.open,
      detruire() { relacher(); win.removeEventListener('keydown', bas, true); win.removeEventListener('keyup', haut, true); win.removeEventListener('blur', relacher); details.remove(); }, clavier };
  }
  racine.DoontClavier = { creer, monter, ACTIONS };
  if (typeof module !== 'undefined') module.exports = racine.DoontClavier;
})(typeof globalThis !== 'undefined' ? globalThis : this);
