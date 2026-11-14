// Amorce synchrone : marque la présence de JS avant le premier rendu, pour éviter le flash de la
// présentation sans scène. Pas de module ici : il doit s'exécuter avant la peinture.
(function () {
  var h = document.documentElement;
  if (location.protocol === 'file:') {
    h.classList.add('sans-scene');
    document.addEventListener('DOMContentLoaded', function () {
      var avis=document.createElement('p');avis.className='tako-bandeau';
      avis.textContent='Présentation en ouverture directe. Pour explorer l’atelier 3D et jouer, utilisez lancer-apercu (serveur local).';
      document.querySelector('#presentation')?.prepend(avis);
    });
    return;
  }
  h.classList.remove('sans-js');
  h.classList.add('avec-js');
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) h.classList.add('mouvement-reduit');
})();
