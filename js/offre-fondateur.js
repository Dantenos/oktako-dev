// Offre « client fondateur » : passé sa date de fin, la page la retire d'elle-même et rend les prix normaux.
// Pourquoi : le portfolio s'arrête après sa dernière mise en ligne ; une page statique garderait sinon des prix barrés après la
// fin de l'offre, ce qui serait trompeur. Une seule lecture de l'horloge au chargement : aucun compte à rebours, aucune minuterie.
// Sans JavaScript, la date de fin reste écrite en toutes lettres sur la page.
(function () {
  var page = document.querySelector('[data-fondateur-fin]');
  if (!page) return;
  var fin = new Date(page.getAttribute('data-fondateur-fin')).getTime();
  if (isNaN(fin) || Date.now() < fin) return;
  var i, offre = document.querySelectorAll('[data-fondateur]'), repli = document.querySelectorAll('[data-fondateur-repli]');
  for (i = 0; i < offre.length; i++) offre[i].hidden = true;
  for (i = 0; i < repli.length; i++) repli[i].hidden = false;
})();
