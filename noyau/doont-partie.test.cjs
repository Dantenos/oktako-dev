const {test}=require('node:test');
const assert=require('node:assert/strict');
const Partie=require('./doont-partie.js');
test('seule la sortie du dernier niveau produit une victoire, jamais la mort',()=>{
 assert.equal(Partie.lire('DOONT_UI:100,36,1,0,0,1').victoire,false);
 assert.equal(Partie.lire('DOONT_UI:0,0,1,0,1,1').victoire,false);
 assert.equal(Partie.lire('DOONT_UI:50,12,2,1,2,1').victoire,true);
 assert.equal(Partie.lire('DOONT_UI:50,12,2,1,2,2'),null);
 for(const l of ['DOONT_UI:100,36,1,0,0','DOONT_UI:NaN,0,0,0,2,1','doont : niveau suivant'])assert.equal(Partie.lire(l),null);
});
test('la santé, les munitions, l’arme et l’objectif viennent du jeu',()=>{
 const s=Partie.lire('DOONT_UI:47,12,2,1,0,1');
 assert.equal(s.sante,47);assert.equal(s.munitions,12);assert.equal(s.arme,'Fusil');
 assert.match(s.objectif,/sortie/);assert.match(Partie.lire('DOONT_UI:100,36,1,0,0,1').objectif,/clé/);
 assert.equal(Partie.AIDE_MS,3000);
});
const {hote}=require('./doont-dom-essai.cjs');
test('aide de trois secondes, pause et victoire arrêtent et libèrent les commandes',()=>{
 const h=hote();let stops=0,runs=0,relaches=0,retours=0;
 const p=Partie.monter({parent:h.parent,suspendre:()=>stops++,reprendre:()=>runs++,relacher:()=>relaches++,retour:()=>retours++,tactile:()=>true});
 p.recevoir('DOONT_UI:100,36,1,0,0,1');assert.equal(stops,1);assert.equal(p.bloque(),true);
 const timer=[...h.timers.values()][0];assert.equal(timer.ms,3000);assert.match(h.trouver('doont-voile').children[1].textContent,/Glisse pour bouger, touche pour tirer/);
 timer.f();assert.equal(runs,1);assert.equal(p.bloque(),false);
 p.pauser();assert.equal(stops,2);h.trouver('doont-continuer').fire('click');assert.equal(runs,2);
 p.recevoir('DOONT_UI:0,0,1,0,1,1');assert.equal(stops,2);
 p.recevoir('DOONT_UI:35,8,2,1,2,1');assert.equal(stops,3);assert.equal(p.bloque(),true);assert.equal(h.trouver('doont-continuer').hidden,true);
 assert.match(h.trouver('doont-voile').children[1].textContent,/Merci d’avoir joué/);
 h.trouver('doont-retour').fire('click');assert.equal(retours,1);assert.equal(relaches,3);
 p.detruire();assert.equal(h.parent.children.length,0);assert.equal(h.timers.size,0);
});
test('après aide et pause le focus revient au jeu, hors du dialogue masqué',()=>{
 const h=hote(),doc=h.parent.ownerDocument,cible=doc.createElement('canvas');
 const p=Partie.monter({parent:h.parent,suspendre(){},reprendre(){},relacher(){},retour(){},tactile:()=>false,focusJeu:()=>cible.focus()});
 p.recevoir('DOONT_UI:100,36,1,0,0,1');
 assert.notEqual(doc.activeElement,cible);
 [...h.timers.values()][0].f();assert.equal(doc.activeElement,cible);
 p.pauser();assert.notEqual(doc.activeElement,cible);
 h.trouver('doont-continuer').fire('click');assert.equal(doc.activeElement,cible);
 p.detruire();
});
