// Une réception déjà confirmée ne doit jamais gonfler le stock de la démonstration.
(() => {
  const recevoir = document.getElementById('recevoir');
  const recommencer = document.getElementById('recommencer');
  const quantite = document.getElementById('quantite');
  const resultat = document.getElementById('resultat');
  let confirmee = false;
  recevoir.hidden = recommencer.hidden = false;
  recevoir.addEventListener('click', () => {
    if (confirmee) {
      resultat.textContent = 'Bon DEMO-006 déjà réceptionné : aucun ajout. Le stock reste à 10 carnets.';
      return;
    }
    confirmee = true;
    quantite.textContent = '10';
    resultat.textContent = 'Réception confirmée : 4 + 6 = 10 carnets en stock. Le bon DEMO-006 est enregistré dans cet exemple.';
    recevoir.textContent = 'Essayer de confirmer le même bon';
  });
  recommencer.addEventListener('click', () => {
    confirmee = false;
    quantite.textContent = '4';
    resultat.textContent = 'Exemple réinitialisé : 4 carnets en stock, livraison en attente.';
    recevoir.textContent = 'Confirmer les 6 carnets reçus';
  });
})();
