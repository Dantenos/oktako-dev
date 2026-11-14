// Le moteur reste dans sa page qualifiée. Seul ce clic crée l'iframe et déclenche ses fichiers.
// Le canevas appartient toujours à v86 : la scène l'échantillonne, puis le DOM prend le relais.
import { texteEchap } from './fermer.js';
export function creerPlongee({ scene, mouvementReduit, auRetour, annoncer }) {
  let phase='repos', cadre=null, racine=null, source=null, vivant=false, annule=0, emuPause=false;
  let focusAvant=null, controle=null, licences=null, elementEtat=null, surveillance=0, delai=0, requete=null, pretDepuis=0, voyage=false;
  let verre=null, ecranComplet=null, plonge=false, dernierJournal='';
  const inerties=new Map();
  const etat=()=>({phase,textureVivante:vivant,memeCanvas:!!source&&source===cadre?.contentDocument?.querySelector('[data-ecran] canvas'),emuPause});
  const api=()=>{try{return cadre?.contentWindow?.__noyauInterface;}catch{return null;}};
  function dire(texte) { if(elementEtat)elementEtat.textContent=texte; annoncer(texte); }
  function echouer(texte) {clearTimeout(delai);phase='erreur';cadre?.classList.remove('plongee__cadre--visible');dire(texte);}
  const repliDirect=()=>mouvementReduit()||matchMedia('(max-width:760px), (pointer:coarse)').matches;
  // DOONT au premier plan passe l'invité en 320×200 (menu, édition allégée) ou 640×400 (édition HD) et rend
  // lui-même le bureau Rouille (800×600) sur Échap : tant qu'il joue, Échap lui appartient ; seul un Échap posé
  // sur le bureau quitte la plongée.
  const jeuAuPremierPlan=()=>(source?.width===320&&source?.height===200)||(source?.width===640&&source?.height===400);
  // Après la traversée, le bureau Rouille reste dans son tube : même rectangle et mêmes coins que la dalle 3D.
  // Sans travelling (téléphone, mouvement réduit), il occupe toute la fenêtre comme avant.
  function placerCadre() {
    if(!cadre)return;
    const r=voyage?scene()?.cadreArrivee():null;
    for(const e of [cadre,verre]){
      if(!e)continue;
      if(r)Object.assign(e.style,{inset:'auto',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:r.arrondi+'px'});
      else for(const k of ['inset','left','top','width','height','borderRadius'])e.style[k]='';
    }
  }
  function recadrer() { if(phase!=='dedans')return; placerCadre(); if(voyage)scene()?.rafraichir(); }
  function suivre() {
    if(!cadre || phase==='retour' || phase==='repos')return;
    const noyau=cadre.contentWindow.__noyau;
    if(noyau?.etat==='erreur'||(noyau?.etat==='arrete'&&phase==='dedans')) {
      echouer(noyau.erreur||'Rouille a été arrêté. Revenez au bureau pour le relancer.');
      return;
    }
    const c=cadre.contentDocument?.querySelector('[data-ecran] canvas');
    if(!vivant && c?.width===800 && c?.height===600) {
      source=c; vivant=true; scene()?.textureTerminal(c);
    }
    // Avant son écran graphique, le tube montre ce que le noyau écrit vraiment sur son port série.
    if(!vivant && voyage){
      const lignes=noyau?.serie?noyau.serie.split('\n').filter(Boolean):['moteur v86 · BIOS…'];
      const cle=lignes.join('|')+Math.floor(performance.now()/600)%2;
      if(cle!==dernierJournal){dernierJournal=cle;scene()?.journalTerminal(lignes);}
    }
    if(noyau?.etat==='pret'&&!pretDepuis)pretDepuis=performance.now();
    const pret=vivant && noyau?.etat==='pret' && performance.now()-pretDepuis>300;
    // Rouille prêt : la caméra traverse le verre, y compris si l'approche est encore en cours.
    if(pret && voyage && !plonge && (phase==='approche'||phase==='attente')){plonge=true;scene()?.plongerTerminal();}
    // La dernière projection 3D du tube, sans effet de verre, doit être peinte avant le relais.
    const tubePret=!voyage||scene()?.etatPlongee().texturePeinte;
    if(phase==='attente' && pret && tubePret) {
      phase='dedans';racine.dataset.phase=phase;
      clearTimeout(delai);
      placerCadre();
      elementEtat.hidden=true;cadre.classList.add('plongee__cadre--visible');verre?.classList.add('plongee__verre--visible');
      scene()?.pause(true);c.tabIndex=0;cadre.contentWindow.focus();c.focus({preventScroll:true});
      annoncer('Vous êtes dans Rouille. Échap ou Retour au bureau pour sortir.');
    }
    surveillance=setTimeout(suivre,100);
  }
  async function entrer() {
    if(phase!=='repos')return;
    const jeton=++annule; phase='approche'; vivant=false;emuPause=false;pretDepuis=0;plonge=false;dernierJournal='';
    focusAvant=document.activeElement;
    racine=document.createElement('section');racine.className='plongee';racine.dataset.phase=phase;
    racine.setAttribute('role','dialog');racine.setAttribute('aria-modal','true');racine.setAttribute('aria-label','Le terminal Rouille');
    controle=document.createElement('button');controle.type='button';controle.className='tako-bouton plongee__retour';
    controle.textContent=texteEchap('← Retour au bureau · Échap');controle.addEventListener('click',()=>revenir());
    ecranComplet=document.createElement('button');ecranComplet.type='button';ecranComplet.className='tako-bouton plongee__plein';
    ecranComplet.textContent='Plein écran';ecranComplet.hidden=!document.fullscreenEnabled;
    ecranComplet.addEventListener('click',()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{/* refus du navigateur : on reste en fenêtre */});});
    verre=document.createElement('div');verre.className='plongee__verre';verre.setAttribute('aria-hidden','true');
    elementEtat=document.createElement('p');elementEtat.className='plongee__etat';elementEtat.setAttribute('role','status');
    const aide=document.createElement('p');aide.className='plongee__aide';aide.textContent='Rouille · Rust i686 · 32 Mio invités + 8 Mio vidéo · ZQSD / WASD · touches réglables dans le jeu · ';
    licences=document.createElement('a');licences.href='noyau/';licences.target='_blank';licences.rel='noopener';licences.textContent='Fonctionnement, licences et sources';
    aide.append(licences);
    cadre=document.createElement('iframe');cadre.className='plongee__cadre';cadre.title='Bureau Rouille : menu Démarrer, notes, démineur et DOONT_Rouille';
    racine.append(controle,ecranComplet,elementEtat,aide,verre);document.body.append(racine);
    for(const e of document.body.children)if(e!==racine && e.id!=='annonce'){inerties.set(e,e.inert);e.inert=true;}
    document.body.classList.add('plongee-active'); controle.focus({preventScroll:true});
    dire('Entrée dans Rouille… Chargement du moteur, puis démarrage du noyau.');
    cadre.addEventListener('load',()=>{
      if(jeton!==annule)return;
      try{
      const w=cadre.contentWindow;
      // Une répétition d'un Échap tenu depuis le jeu tombe sur le bureau revenu : elle ne doit pas tout fermer.
      w.document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!jeuAuPremierPlan()){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)revenir();}},true);
      w.document.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();(e.shiftKey?licences:controle).focus();}},true);
      const raison=w.__noyau?.raison;
      if(raison){echouer(raison);return;}
      if(!api())throw new Error('page du noyau indisponible');
      api().lancer(); suivre();
      }catch{
        echouer('Impossible de charger la page Rouille. Vérifiez la connexion puis revenez au bureau.');
      }
    },{once:true});
    // Une iframe inaccessible ne signale pas toujours son échec : le HEAD donne un retour honnête,
    // et le délai couvre une coupure entre cette vérification et la navigation elle-même.
    requete=new AbortController();
    fetch('noyau/?immersion=1',{method:'HEAD',cache:'no-store',signal:requete.signal}).then(r=>{
      if(jeton!==annule)return;
      if(!r.ok)throw new Error('page indisponible');
      // Aucun de ces accès n'existe hors de entrer(), donc jamais avant le clic.
      cadre.src='noyau/?immersion=1';racine.prepend(cadre);requete=null;
    }).catch(()=>{if(jeton===annule)echouer('Impossible de charger la page Rouille. Vérifiez la connexion puis revenez au bureau.');});
    delai=setTimeout(()=>{
      // Le délai juge le noyau, pas la carte graphique : un Rouille prêt attend la fin d'un travelling lent.
      if(jeton!==annule||phase==='dedans'||cadre?.contentWindow?.__noyau?.etat==='pret')return;
      ++annule;
      echouer('Rouille ne répond pas après 45 secondes. Revenez au bureau pour réessayer.');
      api()?.arreter();requete?.abort();
    },45000);
    voyage=!repliDirect()&&!!scene();
    if(voyage)await scene().entrerTerminal();
    if(jeton!==annule)return;
    if(phase!=='erreur'){
      phase='attente';racine.dataset.phase=phase;
      dire('Rouille démarre… Vous entrerez dès que le bureau sera prêt.');
    }
  }
  async function revenir({sansTravelling=false}={}) {
    if(phase==='repos'||phase==='retour')return;
    ++annule;clearTimeout(surveillance);clearTimeout(delai);requete?.abort();requete=null;
    phase='retour';racine.dataset.phase=phase;
    // Arrêt immédiat du processeur ; son dernier canevas reste vivant sur le tube jusqu'au plan large.
    api()?.pauser();emuPause=true;
    cadre?.classList.remove('plongee__cadre--visible');verre?.classList.remove('plongee__verre--visible');elementEtat.hidden=true;
    controle.disabled=true;scene()?.pause(false);
    if(voyage&&!sansTravelling)await scene()?.sortirTerminal();
    await api()?.arreter();
    scene()?.textureTerminal(null);scene()?.journalTerminal(null);source=null;vivant=false;
    cadre?.remove();racine?.remove();cadre=racine=verre=ecranComplet=null;
    for(const [e,inert] of inerties)e.inert=inert;inerties.clear();
    document.body.classList.remove('plongee-active');phase='repos';emuPause=false;
    auRetour();focusAvant?.focus({preventScroll:true});annoncer('Retour au bureau. Rouille arrêté, mémoire libérée.');
  }
  document.addEventListener('keydown',e=>{
    if(phase==='repos')return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();revenir();}
    if(e.key==='Tab'){
      e.preventDefault();
      // Boucle courte : retour, plein écran, licences, puis le bureau Rouille une fois entré.
      const ordre=[controle,ecranComplet&&!ecranComplet.hidden?ecranComplet:null,licences].filter(Boolean);
      const j=ordre.indexOf(document.activeElement)+(e.shiftKey?-1:1);
      if(j>=0&&j<ordre.length)ordre[j].focus();
      else if(phase==='dedans'){cadre?.contentWindow.focus();source?.focus();}
      else ordre[(j+ordre.length)%ordre.length]?.focus();
    }
  },true);
  // Fenêtre redimensionnée ou plein écran : le cadre DOM et le tube 3D se recalent ensemble.
  addEventListener('resize',()=>requestAnimationFrame(()=>requestAnimationFrame(recadrer)));
  document.addEventListener('fullscreenchange',()=>{if(ecranComplet)ecranComplet.textContent=document.fullscreenElement?'Quitter le plein écran':'Plein écran';});
  // Une disparition de l'onglet sur téléphone libère aussi la page intégrée, même en chargement.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&phase!=='repos'&&matchMedia('(pointer:coarse)').matches)revenir();
  });
  return {entrer,revenir,etat,get active(){return phase!=='repos';}};
}
