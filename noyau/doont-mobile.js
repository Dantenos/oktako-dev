// Quand afficher les touches tactiles de DOONT : seulement sur un écran tactile sans souris ni survol (téléphone, tablette),
// Le réglage manuel peut les masquer sur téléphone. La disposition vit dans doont-fps.js.
(function (racine) {
  'use strict';
  // Un PC dont Windows signale un écran tactile garde souris et clavier : `any-pointer` l'aurait pris pour un
  // téléphone. Seul un appareil dont le pointeur principal est le doigt, sans survol, reçoit les touches d'office.
  const REQUETE = '(pointer: coarse) and (hover: none)';
  const tactileSeul = mm => mm(REQUETE).matches;
  const STOCK = 'doont-touches';
  function monter({ parent, clavier, actif = () => true, surface, viser = () => {}, bouton = null, stockage = null, pause = null }) {
    const doc = parent.ownerDocument, win = doc.defaultView;
    const media = win.matchMedia(REQUETE);
    try { stockage = stockage || win.localStorage; } catch (_) { stockage = null; }
    // Un ancien choix manuel ne doit jamais transformer une souris en écran tactile.
    let choix = null;
    try { choix = stockage?.getItem(STOCK) || null; } catch (_) { /* stockage refusé : le choix ne vaut que pour cette visite */ }
    const voulu = () => media.matches && choix !== 'non';
    let fps = null;
    function actualiser() {
      const visible = voulu() && actif();
      if (bouton) { bouton.hidden = !actif() || !media.matches; bouton.setAttribute('aria-pressed', String(voulu())); }
      parent.hidden = !visible;
      doc.body.classList.toggle('doont-mobile', visible);
      if (visible && !fps) {
        fps = racine.DoontFps.creer({
          parent, surface, stockage, viser,
          envoyer: (action, bas) => { if (action === 'menu' && pause) { if (bas) pause(); } else clavier.tactile(action, bas); },
          regard: (haut, bas) => { clavier.tactile('regardHaut', haut); clavier.tactile('regardBas', bas); },
        });
      } else if (!visible && fps) { fps.detruire(); fps = null; }
      fps?.placer();
    }
    const fin = () => fps?.relacher();
    win.addEventListener?.('blur', fin);
    win.addEventListener?.('pagehide', fin);
    const cacher = () => { if (doc.hidden) fin(); };
    doc.addEventListener?.('visibilitychange', cacher);
    media.addEventListener('change', actualiser);
    const basculer = () => {
      choix = voulu() ? 'non' : 'oui';
      try { stockage?.setItem(STOCK, choix); } catch (_) { /* gardé en mémoire seulement */ }
      actualiser();
    };
    bouton?.addEventListener('click', basculer);
    actualiser();
    return { actualiser, relacher: fin, detruire() {
      fin();
      win.removeEventListener?.('blur', fin); win.removeEventListener?.('pagehide', fin);
      doc.removeEventListener?.('visibilitychange', cacher);
      media.removeEventListener('change', actualiser); bouton?.removeEventListener('click', basculer); if (bouton) bouton.hidden = true;
      fps?.detruire(); fps = null;
      parent.hidden = true; doc.body.classList.remove('doont-mobile');
    } };
  }
  racine.DoontMobile = { monter, tactileSeul };
  if (typeof module !== 'undefined') module.exports = racine.DoontMobile;
})(typeof globalThis !== 'undefined' ? globalThis : this);
