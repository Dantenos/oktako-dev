// Bouton d'impression du CV : sans JavaScript, il reste caché et l'impression du navigateur suffit.
(function () {
  var b = document.querySelector('[data-imprimer]');
  if (!b || !window.print) return;
  b.hidden = false;
  b.addEventListener('click', function () { window.print(); });
})();
