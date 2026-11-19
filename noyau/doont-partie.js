// Le petit protocole série évite de coupler l'interface à des adresses privées du noyau.
(function(racine) {
  'use strict';
  const AIDE_MS = 3000;
  const ARMES = ['Clé', 'Pistolet', 'Fusil', 'Mitraillette', 'Trident', 'Compilateur', 'Lance-Cerveau'];
  function lire(ligne) {
    const m = /^DOONT_UI:(\d{1,5}),(\d{1,5}),([0-6]),([0-7]),([0-2]),1$/.exec(ligne);
    if (!m) return null;
    const [,sante,munitions,arme,cles,etat] = m.map(Number);
    return {sante,munitions,arme:ARMES[arme],etat,victoire:etat===2,
      objectif: cles ? 'Vaincs le gardien, puis rejoins la sortie' : 'Trouve la clé de l’entrepôt'};
  }
  function monter({parent,suspendre,reprendre,relacher,retour,tactile}) {
    const doc=parent.ownerDocument, win=doc.defaultView;
    const root=doc.createElement('section');root.className='doont-partie';root.hidden=true;parent.append(root);
    const creer=(tag,classe,texte,cible=root)=>{const e=doc.createElement(tag);e.className=classe;e.textContent=texte;cible.append(e);return e;};
    const barre=creer('div','doont-reperes','');
    const sante=creer('span','','♥ Santé —',barre), balles=creer('span','','▥ Munitions —',barre), arme=creer('span','','⚒ Arme —',barre);
    const pause=creer('button','doont-pause','Ⅱ Pause',barre);pause.type='button';
    const objectif=creer('p','doont-objectif','⚑ Objectif : trouve la clé de l’entrepôt');
    const voile=creer('div','doont-voile','');voile.hidden=true;
    voile.setAttribute('role','dialog');voile.setAttribute('aria-modal','true');voile.setAttribute('aria-label','Partie');
    const titre=creer('h2','','',voile);titre.tabIndex=-1;
    const texte=creer('p','','',voile);
    const continuer=creer('button','doont-continuer','Reprendre',voile);continuer.type='button';
    const quitter=creer('button','doont-retour','Retour au portfolio',voile);quitter.type='button';
    let mode='repos', aideVue=false, timer=0, detruit=false;
    function montrer(nouveau,t,detail) {
      mode=nouveau;relacher();suspendre();voile.hidden=false;titre.textContent=t;texte.textContent=detail;
      continuer.hidden=nouveau!=='pause';quitter.hidden=nouveau==='aide';pause.disabled=true;titre.focus({preventScroll:true});
    }
    function jouer() {
      if(detruit || mode==='victoire')return;
      mode='jeu';voile.hidden=true;pause.disabled=false;reprendre();
    }
    function pauser() { if(mode==='jeu')montrer('pause','Pause','Prends ton temps.'); }
    // Le focus reste dans l'écran d'aide ou de pause ; aucune commande ne traverse le voile.
    voile.addEventListener('keyup',e=>e.stopPropagation());
    voile.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape') { e.preventDefault();e.stopPropagation();if(mode==='pause')jouer(); }
      if(e.key==='Tab') {
        e.preventDefault();const boutons=[continuer,quitter].filter(b=>!b.hidden);
        if(!boutons.length) { titre.focus();return; }
        const i=boutons.indexOf(doc.activeElement), pas=e.shiftKey?-1:1;
        boutons[(i+pas+boutons.length)%boutons.length].focus();
      }
    });
    pause.addEventListener('click',pauser);continuer.addEventListener('click',jouer);quitter.addEventListener('click',retour);
    return {
      pauser, bloque:()=>['aide','pause','victoire'].includes(mode),
      recevoir(ligne) {
        if(ligne==='doont : retour au bureau') {win.clearTimeout(timer);root.hidden=true;mode='repos';return;}
        const etat=lire(ligne);if(!etat)return;
        root.hidden=false;sante.textContent='♥ Santé '+etat.sante;balles.textContent='▥ Munitions '+etat.munitions;arme.textContent='⚒ Arme : '+etat.arme;
        objectif.textContent='⚑ Objectif : '+etat.objectif;
        if(etat.victoire) { win.clearTimeout(timer);montrer('victoire','Victoire !','Merci d’avoir joué');return; }
        if(!aideVue) {
          aideVue=true;
          montrer('aide','Le Quai · un niveau',tactile() ? 'Glisse pour bouger, touche pour tirer. À droite, glisse pour viser.' : 'ZQSD / WASD pour bouger, souris pour viser, Ctrl pour tirer.');
          timer=win.setTimeout(jouer,AIDE_MS);
        } else if(mode==='repos')jouer();
      },
      detruire(){detruit=true;win.clearTimeout(timer);root.remove();},
    };
  }
  racine.DoontPartie={lire,monter,AIDE_MS};
  if(typeof module!=='undefined')module.exports=racine.DoontPartie;
})(typeof globalThis!=='undefined'?globalThis:this);
