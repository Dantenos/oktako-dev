const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creer } = require('./doont-clavier.js');
test('le tactile suit les actions malgré un remappage et partage les maintiens', () => {
  const octets = [], c = creer({ envoyer: b => octets.push(...b), actif: () => true });
  c.definir('avancer', 'KeyI');
  c.tactile('avancer', true); c.traiter({code:'KeyI'}, true);
  c.tactile('avancer', false);
  assert.deepEqual(octets, [0x11]);
  c.traiter({code:'KeyI'}, false);
  assert.deepEqual(octets, [0x11, 0x91]);
});
test('visée action menu et validation ont les scancodes du noyau', () => {
  const octets = [], c = creer({ envoyer: b => octets.push(...b), actif: () => true });
  for (const a of ['tournerGauche','tournerDroite','ouvrir','tirer','menu','valider']) {
    c.tactile(a,true); c.tactile(a,false);
  }
  assert.deepEqual(octets,[0xe0,0x4b,0xe0,0xcb,0xe0,0x4d,0xe0,0xcd,0x12,0x92,0x1d,0x9d,1,0x81,0x1c,0x9c]);
});
test('une commande tactile inactive est ignorée et un départ libère les appuis', () => {
  let actif=true; const octets=[], c=creer({envoyer:b=>octets.push(...b),actif:()=>actif});
  c.tactile('tirer',true); actif=false; c.tactile('avancer',true);
  assert.deepEqual(octets,[0x1d,0x9d]);
});
test('Entrée conserve le scancode attendu par le menu Qualité', () => {
 const octets=[], c=creer({envoyer:b=>octets.push(...b),actif:()=>true});
 c.traiter({code:'Enter'},true); c.traiter({code:'Enter'},false);
 assert.deepEqual(octets,[0x1c,0x9c]);
});
const { monter } = require('./doont-mobile.js');
const Fps = require('./doont-fps.js');
function hote({choix=null,tactile=false}={}) {
  let changer, active=true, cree=0, detruit=0, opts, relaches=0;
  const requetes=[], mem=choix?{'doont-touches':choix}:{}, stockage={getItem:k=>(k in mem?mem[k]:null),setItem:(k,v)=>{mem[k]=String(v);}};
  const bouton={hidden:true,attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(_,f){this.clic=f;},removeEventListener(){}};
  const media={matches:tactile,addEventListener(_,f){changer=f;},removeEventListener(){changer=null;}};
  const parent={hidden:false,ownerDocument:{defaultView:{matchMedia:q=>{requetes.push(q);return media;}},body:{classList:{toggle(){},remove(){}}}}};
  global.DoontFps={creer:o=>{opts=o;cree++;return {placer(){},relacher(){relaches++;},detruire(){detruit++;}};}};
  const octets=[], clavier=creer({envoyer:b=>octets.push(...b),actif:()=>true});
  const ui=monter({parent,clavier,stockage,bouton,actif:()=>active,surface:{},viser:()=>{}});
  return {requetes,mem,bouton,parent,octets,ui,media,changer:()=>changer?.(),etat:()=>({cree,detruit,opts,relaches}),suspendre:()=>{active=false;ui.actualiser();}};
}
test('le module ne monte que sur tactile, puis se détruit au réglage ou au retrait',()=>{
 const h=hote(); assert.equal(h.parent.hidden,true); assert.equal(h.etat().cree,0);
 h.media.matches=true;h.changer();assert.equal(h.parent.hidden,false);assert.equal(h.etat().cree,1);
 h.suspendre();assert.equal(h.etat().detruit,1); assert.equal(h.parent.hidden,true);h.ui.detruire();
});
test('les touches tactiles envoient au jeu les mêmes scancodes que le clavier',()=>{
 const h=hote({tactile:true});const o=h.etat().opts;
 for(const a of ['ouvrir','sauter','gauche','droite','tirer','arme1','arme2','arme6','arme7','ralentir','menu','valider','courir']) {o.envoyer(a,true);o.envoyer(a,false);}
 // E, Espace, Q, D (pas de côté), Ctrl, armes 1 2 6 7, M, Échap, Entrée, Maj : appui puis relâchement chacun
 assert.deepEqual(h.octets,[18,146,57,185,30,158,32,160,29,157,2,130,3,131,7,135,8,136,46,174,1,129,28,156,42,170]);
 // chaque action du module a un scancode : aucune ne tombe dans le vide
 for(const b of Fps.BOUTONS){const sortie=[];const c=creer({envoyer:x=>sortie.push(...x),actif:()=>true});c.tactile(b.action,true);assert.ok(sortie.length>0,b.action+' sans scancode');}
 h.ui.detruire();
});
test('la visée verticale emprunte les commandes de regard et se libère',()=>{
 const h=hote({tactile:true});const o=h.etat().opts;
 o.regard(true,false);o.regard(false,false);o.regard(false,true);o.regard(false,false);
 assert.deepEqual(h.octets,[19,147,47,175]);h.ui.detruire();
});
test('un départ libère les appuis tenus',()=>{
 const h=hote({tactile:true}); h.ui.detruire();
 assert.equal(h.etat().detruit,1);
});
test('changer d’arme en courant garde le chiffre et rétablit Maj pour les deux entrées',()=>{
 const octets=[],c=creer({envoyer:b=>octets.push(...b),actif:()=>true});
 c.tactile('courir',true);c.tactile('arme6',true);c.tactile('arme6',false);
 c.traiter({code:'Digit2'},true);c.traiter({code:'Digit2'},false);c.tactile('courir',false);
 assert.deepEqual(octets,[42,170,7,42,135,170,3,42,131,170]);
});
test('seul un écran tactile sans survol affiche les touches : un PC à écran tactile ne compte pas',()=>{
 const h=hote();
 assert.ok(h.requetes.length>0);
 for(const q of h.requetes) assert.equal(q,'(pointer: coarse) and (hover: none)');
 assert.ok(!h.requetes.some(q=>/any-pointer/.test(q)));
 const vus=[]; assert.equal(require('./doont-mobile.js').tactileSeul(q=>{vus.push(q);return {matches:true};}),true);
 assert.deepEqual(vus,['(pointer: coarse) and (hover: none)']);
 h.ui.detruire();
});
test('un choix ancien ne peut afficher les joysticks sur un écran sans toucher',()=>{
 const h=hote({choix:'oui'}); assert.equal(h.parent.hidden,true); assert.equal(h.bouton.hidden,true);h.ui.detruire();
});

// --- Disposition de type FPS mobile : logique pure du module ---
test('le joystick : zone morte, avancer, reculer, pas de côté, diagonales',()=>{
 const a=(x,y)=>[...Fps.actionsJoystick(x,y)].sort().join();
 assert.equal(a(0,0),''); assert.equal(a(5,-8),'');          // un pouce posé sans bouger ne marche pas
 assert.equal(a(0,-40),'avancer'); assert.equal(a(0,40),'reculer');
 assert.equal(a(40,0),'droite'); assert.equal(a(-40,0),'gauche');
 assert.equal(a(40,-40),'avancer,droite'); assert.equal(a(-40,40),'gauche,reculer');
 assert.equal(a(0,-500),'avancer');                          // au-delà de la course, même résultat
});
test('chaque cible fait au moins 48 px, même réduite',()=>{
 assert.equal(Fps.diametre(48,0.7),48); assert.equal(Fps.diametre(88,1),88); assert.equal(Fps.diametre(88,1.5),132);
 for(const o of ['paysage','portrait']) for(const [id,[x,y,t]] of Object.entries(Fps.DEFAUTS[o])){assert.ok(t>=48,id);assert.ok(x>0&&x<1&&y>0&&y<1,id);}
});
test('la disposition retenue se relit, borne et retombe sur les défauts si elle est abîmée',()=>{
 const base=Fps.disposition(null,'paysage'); assert.equal(base.tir.t,88); assert.equal(base.tir.s,1);
 const mem=JSON.stringify({paysage:{tir:{x:.5,y:.5,s:1.4},ouvrir:{x:9,y:-3,s:50}}});
 const l=Fps.disposition(mem,'paysage');
 assert.deepEqual([l.tir.x,l.tir.y,l.tir.s],[.5,.5,1.4]); assert.deepEqual([l.ouvrir.x,l.ouvrir.y,l.ouvrir.s],[1,0,1.8]);
 assert.deepEqual(l.sauter,base.sauter);                     // non enregistré : défaut
 assert.deepEqual(Fps.disposition('pas du json','portrait'),Fps.disposition(null,'portrait'));
 assert.notDeepEqual(Fps.disposition(mem,'portrait').tir,l.tir); // chaque orientation a sa disposition
});
test('les réglages : sensibilité bornée, second tir actif par défaut et désactivable',()=>{
 assert.deepEqual(Fps.reglages(null),{sensibilite:1,tir2:true});
 assert.deepEqual(Fps.reglages(JSON.stringify({sensibilite:9,tir2:false})),{sensibilite:2.5,tir2:false});
 assert.deepEqual(Fps.reglages('x'),{sensibilite:1,tir2:true});
});

test('le joystick droit poursuit la visée à pouce tenu et possède une zone morte',()=>{
 assert.deepEqual(Fps.vitesseVisee(0,0),{x:0,y:0});
 assert.ok(Fps.vitesseVisee(45,-30).x>0); assert.ok(Fps.vitesseVisee(45,-30).y<0);
});
test('une cible reste entière dans les bords sûrs, même après un réglage extrême',()=>{
 assert.equal(Fps.centreAccessible(0,320,88,20),64);
 assert.equal(Fps.centreAccessible(1,320,88,20),256);
});
test('deux doigts indépendants : marche, visée continue, tir et annulation sans appui coincé',()=>{
 const h=require('./doont-dom-essai.cjs').hote(),actions=[],angles=[];
 const ui=Fps.creer({parent:h.parent,envoyer:(a,b)=>actions.push([a,b]),viser:x=>angles.push(x),vibrer:false});
 const g=h.trouver('fps-zone-g'),d=h.trouver('fps-zone-d');
 g.fire('pointerdown',{clientX:90,clientY:280});g.fire('pointermove',{clientX:90,clientY:230});
 d.fire('pointerdown',{pointerId:2,clientX:290,clientY:290});d.fire('pointermove',{pointerId:2,clientX:335,clientY:290});
 h.image(16);h.image(32);assert.ok(angles.length>=2);assert.ok(angles.every(x=>x>0));assert.deepEqual(actions,[['avancer',true]]);
 const tir=h.tous().find(e=>e.dataset?.bouton==='tir');tir.fire('pointerdown',{pointerId:3});tir.fire('pointercancel',{pointerId:3});
 assert.deepEqual(actions.slice(-2),[['tirer',true],['tirer',false]]);
 g.fire('pointercancel');d.fire('lostpointercapture',{pointerId:2});const n=angles.length;h.image(48);assert.equal(angles.length,n);
 assert.deepEqual(actions.at(-1),['avancer',false]);ui.detruire();assert.equal(h.parent.children.length,0);
});
