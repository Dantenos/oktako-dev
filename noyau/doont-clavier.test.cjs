const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creer } = require('./doont-clavier.js');

function session(stockage) {
  const octets = []; let actif = true;
  const clavier = creer({ envoyer: b => octets.push(...b), actif: () => actif, stockage });
  return { clavier, octets, quitter: () => { actif = false; } };
}
test('AZERTY et QWERTY donnent le même déplacement physique', () => {
  for (const key of ['z', 'w']) {
    const { clavier: c, octets } = session();
    c.traiter({ code: 'KeyW', key }, true); c.traiter({ code: 'KeyW', key }, false);
    assert.deepEqual(octets, [0x11, 0x91]);
  }
});
test('tirer avec Ctrl tout en avançant ne rend pas Ctrl+W au navigateur', () => {
  const { clavier: c, octets } = session();
  c.traiter({ code: 'ControlLeft' }, true);
  assert(c.traiter({ code: 'KeyW', ctrlKey: true }, true));
  assert.deepEqual(octets, [0x1d, 0x11]);
});
test('remapper supprime la commande de la touche précédente', () => {
  const { clavier: c, octets } = session();
  c.definir('avancer', 'KeyI');
  assert(c.traiter({ code: 'KeyW' }, true)); assert.deepEqual(octets, []);
  c.traiter({ code: 'KeyI' }, true); c.traiter({ code: 'KeyI' }, false);
  assert.deepEqual(octets, [0x11, 0x91]);
});
test('conflits et touches réservées refusés sans changer la liaison', () => {
  const { clavier: c } = session();
  for (const code of ['KeyS', 'Escape', 'KeyG', 'KeyH', 'ArrowUp']) assert.throws(() => c.definir('avancer', code));
  assert.equal(c.touches().avancer, 'KeyW');
});
test('répétitions et deux touches de la même action ne coincent pas le déplacement', () => {
  const { clavier: c, octets } = session();
  for (const code of ['KeyW', 'KeyW', 'ArrowUp']) c.traiter({ code }, true);
  c.traiter({ code: 'KeyW' }, false); assert.deepEqual(octets, [0x11]);
  c.traiter({ code: 'ArrowUp' }, false); assert.deepEqual(octets, [0x11, 0x91]);
});
test('relâcher après sortie du jeu libère encore la touche', () => {
  const { clavier: c, octets, quitter } = session();
  c.traiter({ code: 'KeyW' }, true); quitter(); c.traiter({ code: 'KeyW' }, false);
  assert.deepEqual(octets, [0x11, 0x91]);
  assert.equal(c.traiter({ code: 'KeyS' }, true), false);
});
test('perte de focus et remise à zéro relâchent les commandes', () => {
  const { clavier: c, octets } = session();
  c.traiter({ code: 'KeyW' }, true); c.relacher(); c.relacher();
  c.definir('avancer', 'KeyI'); c.reinitialiser();
  assert.deepEqual(octets, [0x11, 0x91]); assert.equal(c.touches().avancer, 'KeyW');
});
test('préférences conservées et stockage bloqué sans empêcher le jeu', () => {
  let texte = null;
  const stockage = { getItem: () => texte, setItem: (_, v) => { texte = v; } };
  session(stockage).clavier.definir('avancer', 'KeyI');
  assert.equal(session(stockage).clavier.touches().avancer, 'KeyI');
  texte = '{cassé'; assert.equal(session(stockage).clavier.touches().avancer, 'KeyW');
  const c = session({ getItem() { throw Error(); }, setItem() { throw Error(); } }).clavier;
  assert.equal(c.definir('avancer', 'KeyI'), false); assert.equal(c.touches().avancer, 'KeyI');
});
test('Entrée conserve son scancode pour valider le menu Qualité', () => {
  const { clavier: c, octets } = session();
  c.traiter({ code: 'Enter' }, true); c.traiter({ code: 'Enter' }, false);
  assert.deepEqual(octets, [0x1c, 0x9c]);
});
