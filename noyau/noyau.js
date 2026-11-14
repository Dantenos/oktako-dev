'use strict';
// Lanceur du noyau Rouille dans v86. Règles du mandat (R07) :
// - rien ne se charge sans clic explicite (le moteur n'est même pas téléchargé avant) ;
// - toute erreur de chargement est affichée et arrête tout ;
// - la fermeture détruit l'émulateur et rend la mémoire ;
// - budget mémoire fixe et annoncé ;
// - sur téléphone, jamais d'émulation en arrière-plan.
(function () {
  const MIO = 1024 * 1024;
  const BUDGET = { memoire: 32 * MIO, video: 8 * MIO };
  const FICHIERS = { moteur: 'v86/libv86.js', wasm: 'v86/v86.wasm', bios: 'v86/seabios.bin', vgabios: 'v86/vgabios.bin', noyau: 'v86/rouille.elf', carte: 'doont.wasm' };
  // Allégée présélectionnée partout : la HD, encore trop sombre, reste au menu. Le défaut de tako-gpu.js (HD sur
  // ordinateur) n'est pas appliqué ici parce que ce fichier doit rester la copie exacte de l'amont.
  const QUALITE_DEFAUT = 'qualite-allegee';
  // Délais au-delà desquels on considère le démarrage raté, plutôt que de laisser tourner une page muette.
  const DELAI_PRET_MS = 45000;

  const $ = (s) => document.querySelector(s);
  const bouton = $('[data-lancer]');
  const fermer = $('[data-fermer]');
  const etat = $('[data-etat]');
  const boutonSon = $('[data-son]');
  const ecran = $('[data-ecran]');
  if(new URLSearchParams(location.search).has('immersion')) document.body.classList.add('n-immersion');
  let generation=0;
  let emu = null;
  let paquets = null;
  let clavierJeu = null;
  let mobileJeu = null;
  const bascule = document.querySelector('[data-bascule-touches]');
  let minuteur = 0;
  let serie = '';
  // Exposé pour la recette automatisée (lecture seule de l'état, aucune commande).
  const sonde = (window.__noyau = { etat: 'repos', serie: '', erreur: '' });

  $('[data-touches]').addEventListener('toggle', () => mobileJeu?.actualiser(), true);
  const telephone = () => matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const dire = (texte, erreur) => {
    etat.textContent = texte;
    etat.classList.toggle('erreur', !!erreur);
  };

  // Pourquoi un bouton désactivé avec sa raison plutôt qu'un bouton caché : le visiteur sait ce qui manque.
  function qualif() {
    try { return JSON.parse(document.getElementById('qualification').textContent); } catch (e) { return null; /* JSON absent : bloqué */ }
  }
  function raisonDeBlocage() {
    const q = qualif();
    if (!q || q.ok !== true) return (q && q.raison) || 'Démonstration désactivée : la qualification du moteur n\u2019est pas établie.';
    if (location.protocol === 'file:') return 'Démonstration désactivée en ouverture directe du fichier : le navigateur interdit d\u2019y charger le moteur. Utilisez lancer-apercu (serveur local) ou la version en ligne.';
    if (typeof WebAssembly !== 'object') return 'Démonstration indisponible : ce navigateur n\u2019exécute pas WebAssembly.';
    return '';
  }

  function chargerScript(src) {
    return new Promise((ok, ko) => {
      if (window.V86) return ok();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (window.V86 ? ok() : ko(new Error('moteur v86 invalide')));
      s.onerror = () => ko(new Error('moteur introuvable (' + src + ')'));
      document.head.appendChild(s);
    });
  }

  // La carte tako-gpu : sans elle, le noyau n'offre ni menu Qualité ni édition HD. Une carte absente est une
  // panne annoncée comme les autres fichiers, pas un repli muet vers le rendu logiciel.
  async function chargerCarte() {
    const r = await fetch(FICHIERS.carte);
    if (!r.ok) throw new Error('fichier manquant : ' + FICHIERS.carte + ' (HTTP ' + r.status + ')');
    return (await WebAssembly.instantiate(await r.arrayBuffer(), {})).instance.exports;
  }

  // Souris absolue posée sur la souris PS/2 relative. v86 traduit movementX, en pixels CSS : dès que le
  // canevas 800×600 est agrandi, le curseur de Rouille prend du retard sur le vrai et l'écart grandit.
  // Le noyau additionne les déplacements sans accélération et borne le pointeur à l'écran : la page connaît
  // donc exactement sa position. Elle envoie l'écart entre le pixel visé et ce modèle, et un recalage contre
  // le coin haut-gauche (la borne rend la position certaine) fixe le modèle au départ et après une pause.
  const souris = { x: 0, y: 0, sure: false, largeur: 0, boutons: [false, false, false] };
  function envoyerDelta(dx, dy) {
    // Un paquet PS/2 porte 9 bits signés : un grand écart part en plusieurs paquets.
    while (dx || dy) {
      const px = Math.max(-200, Math.min(200, dx)), py = Math.max(-200, Math.min(200, dy));
      emu.bus.send('mouse-delta', [px, -py]);
      dx -= px; dy -= py;
    }
  }
  // Pixel de l'invité sous le point chaud du vrai pointeur, bandes d'object-fit et mise à l'échelle comprises.
  function pixelVise(c, clientX, clientY) {
    const r = c.getBoundingClientRect();
    const echelle = Math.min(r.width / c.width, r.height / c.height);
    const x0 = r.left + (r.width - c.width * echelle) / 2, y0 = r.top + (r.height - c.height * echelle) / 2;
    return [
      Math.max(0, Math.min(c.width - 1, Math.floor((clientX - x0) / echelle))),
      Math.max(0, Math.min(c.height - 1, Math.floor((clientY - y0) / echelle))),
    ];
  }
  function viser(e) {
    if (e.pointerType === 'touch' && mobileJeu && [320, 640].includes(ecran.querySelector('canvas').width)) return false;
    const c = ecran.querySelector('canvas');
    if (!emu || sonde.etat !== 'pret' || !c || !c.width || !c.height) return false;
    if (souris.largeur !== c.width) { souris.largeur = c.width; souris.sure = false; }
    if (!souris.sure) { envoyerDelta(-(c.width + 400), -(c.height + 400)); souris.x = souris.y = 0; souris.sure = true; }
    const [x, y] = pixelVise(c, e.clientX, e.clientY);
    envoyerDelta(x - souris.x, y - souris.y);
    souris.x = x; souris.y = y;
    return true;
  }
  function boutons(e) {
    // Ordre du bus v86 : gauche, milieu, droit ; e.buttons : 1 gauche, 4 milieu, 2 droit.
    const b = [!!(e.buttons & 1), !!(e.buttons & 4), !!(e.buttons & 2)];
    if (b.some((v, i) => v !== souris.boutons[i])) { souris.boutons = b; emu.bus.send('mouse-click', b); }
  }
  function brancherSouris() {
    const c = ecran.querySelector('canvas');
    c.style.touchAction = 'none';
    c.addEventListener('pointermove', (e) => { if (viser(e)) boutons(e); });
    c.addEventListener('pointerdown', (e) => {
      if (!viser(e)) return;
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* pointeur déjà relâché */ }
      c.focus({ preventScroll: true }); boutons(e); e.preventDefault();
    });
    const relacher = (e) => { if (viser(e)) boutons(e); };
    c.addEventListener('pointerup', relacher);
    c.addEventListener('pointercancel', () => { if (emu && souris.boutons.some(Boolean)) { souris.boutons = [false, false, false]; emu.bus.send('mouse-click', souris.boutons); } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  brancherSouris();
  // Pour la recette et le diagnostic : modèle de la page, sans aucune commande.
  sonde.souris = () => ({ x: souris.x, y: souris.y, sure: souris.sure });

  async function verifierFichiers() {
    // Un HEAD par fichier avant de réserver la mémoire : un fichier manquant arrête tout, avec son nom.
    for (const [nom, url] of Object.entries(FICHIERS)) {
      let r;
      try { r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); } catch (e) { throw new Error('fichier inaccessible : ' + url); }
      if (!r.ok) throw new Error('fichier manquant : ' + url + ' (HTTP ' + r.status + ')');
      if (nom === 'noyau' && r.headers.get('content-length') === '0') throw new Error('fichier vide : ' + url);
    }
  }

  async function lancer() {
    if (emu || raisonDeBlocage()) return;
    const actuel=++generation;
    bouton.disabled = true;
    fermer.hidden = false;
    serie = '';
    souris.sure = false; souris.boutons = [false, false, false];
    sonde.etat = 'chargement'; sonde.erreur = ''; sonde.serie = '';
    dire('Chargement du moteur et du noyau…');
    try {
      await verifierFichiers();
      if(actuel!==generation)return;
      await chargerScript(FICHIERS.moteur);
      if(actuel!==generation)return;
      const carte = await chargerCarte();
      if(actuel!==generation)return;
      ecran.hidden = false;
      emu = new window.V86({
        wasm_path: FICHIERS.wasm,
        memory_size: BUDGET.memoire,
        vga_memory_size: BUDGET.video,
        screen_container: ecran,
        bios: { url: FICHIERS.bios },
        vga_bios: { url: FICHIERS.vgabios },
        multiboot: { url: FICHIERS.noyau },
        // Le défaut du menu Qualité, lu par le noyau : la page ne choisit pas à la place du visiteur.
        cmdline: QUALITE_DEFAUT + (window.DoontMobile.tactileSeul(matchMedia) ? " moteur" : ""),
        disable_speaker: true,
        // La souris passe par viser() : l'adaptateur de v86 traduirait les pixels CSS tels quels.
        disable_mouse: true,
        // Le noyau sonde le périphérique au démarrage : il doit exister avant la première instruction.
        autostart: false,
      });
      const instance = emu;
      clavierJeu = window.DoontClavier.monter({
        conteneur: $('[data-touches]'),
        envoyer: codes => instance.keyboard_send_scancodes(codes),
        actif: () => !ecran.hidden && [320, 640].includes(ecran.querySelector('canvas').width),
        suspendre: () => { souris.boutons = [false, false, false]; instance.bus.send('mouse-click', souris.boutons); instance.stop(); },
        reprendre: () => { if (emu === instance && !document.hidden) instance.run(); },
      });
      // La bascule des touches tactiles vit dans le panneau des touches : un bouton posé sur l'écran du jeu avalerait la souris qui
      // vise ce coin (tests/plongee.mjs, tests/souris.mjs). Le panneau est refait à chaque lancement, on y remet donc le bouton.
      const panneauTouches = document.querySelector('[data-touches] details');
      if (panneauTouches && bascule) panneauTouches.append(bascule);
      mobileJeu = window.DoontMobile.monter({
        surface: ecran.querySelector('canvas'),
        viser: dx => instance.bus.send('mouse-delta', [Math.max(-40, Math.min(40, Math.round(dx))), 0]),
        parent: document.getElementById('mobile-pad'), bouton: bascule, clavier: clavierJeu.clavier,
        actif: () => !clavierJeu.reglageOuvert(),
      });
      emu.add_listener('emulator-ready', () => {
        if (actuel !== generation) return;
        try {
          paquets = window.DoontPaquets.brancher(instance, carte);
          window.TakoGpu.brancher(instance, carte, ralentiSon);
          instance.run();
        } catch (e) { echec('périphériques du jeu indisponibles : ' + e.message); }
      });
      // Build d'essai seulement : la recette lit les messages du bus (souris, clavier) pour prouver le trajet des entrées.
      if (qualif().essai) sonde.emu = emu;
      emu.add_listener('download-error', (e) => echec('téléchargement impossible : ' + ((e && e.file_name) || 'fichier')));
      emu.add_listener('serial0-output-byte', (b) => {
        serie += String.fromCharCode(b);
        if (serie.length > 4096) serie = serie.slice(-4096);
        sonde.serie = serie;
        if (sonde.etat !== 'pret' && serie.includes('ROUILLE_READY')) {
          clearTimeout(minuteur);
          sonde.etat = 'pret';
          // Sous v86, le pilote PS/2 du noyau peut avaler l'accusé 0xFA de l'initialisation comme début de paquet,
          // et lire ensuite la souris décalée d'un octet (curseur erratique). Un paquet neutre (aucun bouton,
          // aucun déplacement) le réaligne : ses deux octets nuls ne peuvent pas commencer un paquet. Le noyau
          // d'origine n'est pas modifié ; c'est la page qui s'adapte.
          try { emu.bus.send('mouse-click', [false, false, false]); } catch (x) { /* souris absente : rien à réaligner */ }
          // Le pointeur de Rouille suit exactement le vrai : un seul curseur reste visible, le sien.
          ecran.querySelector('canvas').style.cursor = 'none';
          dire('Noyau démarré. Cliquez dans l\u2019écran puis utilisez clavier et souris. DOONT : ZQSD / WASD ; réglage des touches dans le panneau Touches.');
        }
      });
      minuteur = setTimeout(() => echec('le noyau n\u2019a pas signalé son démarrage en ' + DELAI_PRET_MS / 1000 + ' s'), DELAI_PRET_MS);
    } catch (e) {
      echec(e && e.message ? e.message : String(e));
    }
  }

  // --- Son HD : coupé par défaut, pack Opus chargé au premier clic sur « Son », jamais au chargement de la page. ---
  // Le jeu n'envoie qu'un événement par port (le ralenti) et demande le paquet du niveau : la page n'a rien d'autre à écouter.
  const AMBIANCES = { 1: 'quai-orage-boucle', 2: 'forge-boucle' };
  let audio = null, sonVoulu = false, minuteurSon = 0, ralentiActif = false;
  const ralentiSon = { regler(demande) {
    const voulu = demande !== 0;
    if (voulu === ralentiActif) return;
    ralentiActif = voulu;
    if (audio && sonVoulu) audio.pack.jouer(voulu ? 'ralenti-entree' : 'ralenti-sortie');
  } };
  function majAmbiance() {
    if (!audio) return;
    const niveau = sonVoulu && emu && sonde.etat === 'pret' && paquets ? paquets.mesures.niveau : 0;
    for (const [n, nom] of Object.entries(AMBIANCES)) {
      if (Number(n) === niveau) audio.pack.boucle(nom, 1); else audio.pack.arreterBoucle(nom);
    }
  }
  const libelleSon = (ko) => 'Son : ' + (sonVoulu ? 'activé' : 'coupé') + ' (pack ' + ko + (audio?.charge ? '' : ', chargé au premier clic') + ')';
  boutonSon.addEventListener('click', async () => {
    sonVoulu = !sonVoulu;
    boutonSon.setAttribute('aria-pressed', String(sonVoulu));
    if (!sonVoulu) {
      if (audio) { audio.pack.couper(); audio.ctx.suspend(); }
      boutonSon.textContent = libelleSon(boutonSon.dataset.poids);
      return;
    }
    boutonSon.textContent = libelleSon(boutonSon.dataset.poids);
    try {
      if (!audio) {
        const { creerPack } = await import('../js/pack-sons.js');
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const sortie = ctx.createGain(); sortie.gain.value = 0.8; sortie.connect(ctx.destination);
        audio = { ctx, pack: creerPack({ racine: '../sons/', contexte: () => ctx, sortie: () => sortie }), charge: false };
      }
      await audio.ctx.resume();
      const r = await audio.pack.activer();
      audio.charge = true;
      boutonSon.dataset.poids = Math.round(r.octets / 1000) + ' Ko réels';
      boutonSon.textContent = libelleSon(boutonSon.dataset.poids);
      clearInterval(minuteurSon); minuteurSon = setInterval(majAmbiance, 500); majAmbiance();
    } catch (e) {
      sonVoulu = false; boutonSon.setAttribute('aria-pressed', 'false');
      boutonSon.textContent = 'Son indisponible (pack non chargé)';
    }
  });

  async function arreter(message, erreur) {
    generation++;
    if (audio) for (const nom of Object.values(AMBIANCES)) audio.pack.arreterBoucle(nom);
    ralentiActif = false;
    clearTimeout(minuteur);
    const e = emu;
    mobileJeu?.detruire(); mobileJeu = null;
    if (clavierJeu) clavierJeu.detruire();
    clavierJeu = null;
    // Invalide une réponse réseau encore en vol avant de lâcher la mémoire invitée.
    if (paquets) paquets.demander(0);
    paquets = null;
    emu = null;
    delete sonde.emu;
    if (e) {
      try { e.stop(); } catch (x) { /* déjà arrêté */ }
      // destroy() peut ne jamais rendre la main si le moteur a échoué à mi-chemin : on n'attend pas plus de 3 s.
      try { await Promise.race([e.destroy(), new Promise((ok) => setTimeout(ok, 3000))]); } catch (x) { /* la référence est lâchée quand même */ }
    }
    // On vide l'écran : le canvas garderait sinon la dernière image (et sa mémoire) affichée.
    const c = ecran.querySelector('canvas');
    if (c) { c.width = 0; c.height = 0; c.style.cursor = ''; }
    ecran.querySelector('.n-texte').textContent = '';
    ecran.hidden = true;
    fermer.hidden = true;
    sonde.etat = erreur ? 'erreur' : 'arrete';
    dire(message, erreur);
    const raison = raisonDeBlocage();
    bouton.disabled = !!raison;
  }

  function echec(msg) {
    sonde.erreur = msg;
    arreter('Échec : ' + msg + '. L\u2019émulation est arrêtée.', true);
  }

  document.addEventListener('visibilitychange', () => {
    if (!emu) return;
    if (document.hidden) {
      if (telephone()) arreter('Arrêté : la page est passée en arrière-plan sur un téléphone. Relancez quand vous voulez.');
      else { try { emu.stop(); } catch (x) { /* rien */ } sonde.etat = sonde.etat === 'pret' ? 'pause' : sonde.etat; }
    } else if (sonde.etat === 'pause' && !clavierJeu?.reglageOuvert()) {
      try { emu.run(); } catch (x) { /* rien */ }
      souris.sure = false;
      sonde.etat = 'pret';
    }
  });
  // Quitter la page libère tout, même si le navigateur la garde en cache d'historique.
  addEventListener('pagehide', () => { if (emu) arreter('Arrêté.'); });

  // Un moteur corrompu échoue dans une promesse interne à v86 : on la rattrape pour arrêter tout de suite,
  // au lieu d'attendre le délai de démarrage.
  addEventListener('unhandledrejection', (ev) => { if (emu && sonde.etat === 'chargement') { ev.preventDefault(); echec('le moteur n\u2019a pas pu démarrer (' + String((ev.reason && ev.reason.message) || ev.reason).slice(0, 120) + ')'); } });
  addEventListener('error', (ev) => { if (emu && sonde.etat === 'chargement') echec('erreur du moteur (' + String(ev.message).slice(0, 120) + ')'); });

  // Une petite interface de cycle de vie pour la plongée, sans exposer l'émulateur.
  window.__noyauInterface={lancer,arreter:()=>arreter('Arrêté, mémoire libérée.'),pauser:()=>{
    if(emu){try{emu.stop();}catch(x){/* moteur déjà arrêté */}sonde.etat='pause';souris.sure=false;}
  }};
  bouton.addEventListener('click', lancer);
  fermer.addEventListener('click', () => arreter('Arrêté, mémoire libérée.'));

  const raison = raisonDeBlocage();
  bouton.disabled = !!raison;
  sonde.raison = raison;
  dire(raison || 'Prêt. Rien n\u2019est chargé tant que vous n\u2019avez pas cliqué sur « Démarrer le noyau ».');
})();
