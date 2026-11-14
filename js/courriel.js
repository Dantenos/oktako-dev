// Les adresses de contact, assemblées dans le navigateur : le HTML servi n'en porte aucune en clair (build.mjs les voile),
// un robot qui lit les pages ne ramasse rien. Le texte se montre dès l'arrivée, à l'humain comme au lecteur d'écran ; le
// lien de messagerie, lui, n'existe qu'au moment du clic. Sans JavaScript, l'adresse reste écrite en toutes lettres.
(function () {
  function lire(v) {
    var o = [];
    for (var i = 0; i < v.length; i += 2) o.push(parseInt(v.substr(i, 2), 16) ^ ((0x5a + (i / 2) * 7) & 0xff));
    return new TextDecoder().decode(new Uint8Array(o));
  }
  function reveler(racine) {
    racine.querySelectorAll('[data-courriel]').forEach(function (a) {
      var adresse = lire(a.dataset.courriel);
      if ('courrielTexte' in a.dataset) a.textContent = adresse;
      if (a.dataset.courrielNom) a.setAttribute('aria-label', a.dataset.courrielNom + adresse);
    });
    racine.querySelectorAll('[data-courriel-copier]').forEach(function (b) {
      b.hidden = !navigator.clipboard;
      b.setAttribute('aria-label', "Copier l'adresse " + lire(b.dataset.courrielCopier));
    });
  }
  // Le lien se crée pour le clic et disparaît avec lui. En phase de capture : le routeur de la page, qui prend les ancres,
  // ne doit pas voir ce clic.
  document.addEventListener('click', function (e) {
    var cible = e.target.closest && e.target.closest('[data-courriel], [data-courriel-copier]');
    if (!cible) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if ('courrielCopier' in cible.dataset) {
      navigator.clipboard.writeText(lire(cible.dataset.courrielCopier)).then(function () {
        cible.textContent = 'Copié'; setTimeout(function () { cible.textContent = 'Copier'; }, 2000);
      });
      return;
    }
    var q = cible.dataset.objet ? '?subject=' + encodeURIComponent(cible.dataset.objet) + '&body=' + encodeURIComponent(cible.dataset.corps) : '';
    var a = document.createElement('a'); a.href = 'mailto:' + lire(cible.dataset.courriel) + q; a.click();
  }, true);
  reveler(document);
  // Le panneau recopie la rubrique Contact et son pied après coup : les copies se révèlent à leur tour.
  new MutationObserver(function (lots) {
    lots.forEach(function (l) { l.addedNodes.forEach(function (n) { if (n.nodeType === 1) reveler(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
