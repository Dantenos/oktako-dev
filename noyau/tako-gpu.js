// tako-gpu : la carte graphique paravirtualisée de Rouille, côté page.
// Le noyau déclare une zone de sa mémoire, y dépose une commande et frappe un port ;
// on lit la commande DANS la zone seulement, on la passe au moteur wasm, et l'image
// rendue va dans la mémoire vidéo de v86, comme une vraie carte l'y écrirait.
// Protocole : docs/doont/OS-FLUIDE.md § 5. Aucune bibliothèque.
"use strict";
(function (racine) {
  const BASE = 0x7E0;
  const IDENTITE = 0x504B4754; // « TKGP »
  const TETE = 16;
  const ZONE_MAX = 1 << 20;
  const IMAGE = 320 * 200;
  const ETAT = {
    OK: 0, ZONE: 0x10, DEBORDE: 0x11, MAGIE: 0x12, GENRE: 0x13, LONGUEUR: 0x14, SANS_ZONE: 0x15,
  };
  const CHARGER = 1;
  const DESSINER = 2;
  const DESSINER_HD = 3;

  // memoire() : la RAM de l'invité ; vram() : la mémoire vidéo ; moteur : exports du wasm.
  // vramHd() et marquer() servent l'édition HD : le mode 32 bits de v86 suit les zones
  // sales, et une écriture directe ne s'y note pas toute seule.
  // horloge() : le temps réel, en millisecondes. Le PIT de v86 ne rattrape pas les
  // interruptions manquées quand la carte tient le fil : la logique ne peut pas s'y fier.
  function creer({ memoire, taille, vram, vramHd, marquer, moteur, horloge = () => performance.now() }) {
    let zone = 0, longueur = 0, etat = ETAT.SANS_ZONE;
    let mesures = { images: 0, refus: 0, ms: 0 };
    const declarer = () => {
      const ram = taille();
      // La zone doit tenir entière dans la RAM de l'invité, et rester raisonnable.
      if (longueur === 0 || longueur > ZONE_MAX || zone + longueur > ram || zone < 0x100000) {
        etat = ETAT.ZONE;
        return false;
      }
      etat = ETAT.OK;
      return true;
    };
    const executer = (decalage) => {
      if (etat === ETAT.ZONE || longueur === 0) { mesures.refus++; return (etat = ETAT.SANS_ZONE); }
      if (decalage < 0 || decalage + TETE > longueur) { mesures.refus++; return (etat = ETAT.DEBORDE); }
      const ram = memoire();
      const debut = zone + decalage;
      const tete = ram.subarray(debut, debut + TETE);
      if (tete[0] !== 0x54 || tete[1] !== 0x47 || tete[2] !== 0x43 || tete[3] !== 0x31) {
        mesures.refus++; return (etat = ETAT.MAGIE);
      }
      const genre = tete[4] | (tete[5] << 8);
      const n = (tete[8] | (tete[9] << 8) | (tete[10] << 16) | (tete[11] << 24)) >>> 0;
      // La charge doit rester dans la zone : l'invité ne fait rien lire au-delà.
      if (decalage + TETE + n > longueur || n > moteur.entree_taille()) {
        mesures.refus++; return (etat = ETAT.LONGUEUR);
      }
      const tampon = new Uint8Array(moteur.memory.buffer, moteur.entree(), n);
      tampon.set(ram.subarray(debut + TETE, debut + TETE + n));
      const t0 = performance.now();
      let code;
      if (genre === CHARGER) code = moteur.charger(n);
      else if (genre === DESSINER) code = moteur.rendre(n);
      else if (genre === DESSINER_HD && vramHd) code = moteur.hd_rendre(n);
      else { mesures.refus++; return (etat = ETAT.GENRE); }
      if (code !== 0) { mesures.refus++; return (etat = code); }
      if (genre === DESSINER) {
        vram().set(new Uint8Array(moteur.memory.buffer, moteur.image(), IMAGE));
        mesures.images++;
        mesures.ms += performance.now() - t0;
      } else if (genre === DESSINER_HD) {
        vramHd(moteur.hd_octets()).set(new Uint8Array(moteur.memory.buffer, moteur.hd_image(), moteur.hd_octets()));
        marquer();
        mesures.images++;
        mesures.ms += performance.now() - t0;
      }
      return (etat = ETAT.OK);
    };
    return {
      lireIdentite: () => IDENTITE,
      lireHorloge: () => Math.floor(horloge()) >>> 0,
      ecrireZone: (v) => { zone = v >>> 0; longueur = 0; etat = ETAT.SANS_ZONE; },
      ecrireLongueur: (v) => { longueur = v >>> 0; declarer(); },
      commande: (v) => executer(v >>> 0),
      lireEtat: () => etat,
      mesures,
    };
  }

  // Branche la carte sur les ports de v86. Le moteur wasm est chargé avant l'amorçage.
  function brancher(emulateur, moteur, son) {
    const cpu = emulateur.v86.cpu;
    const vga = cpu.devices.vga;
    const carte = creer({
      memoire: () => cpu.mem8,
      taille: () => cpu.memory_size[0],
      vram: () => new Uint8Array(cpu.wasm_memory.buffer, vga.svga_memory.byteOffset, IMAGE),
      vramHd: moteur.hd_rendre ? n => new Uint8Array(cpu.wasm_memory.buffer, vga.svga_memory.byteOffset, n) : undefined,
      marquer: () => cpu.svga_mark_dirty(),
      moteur,
    });
    const io = cpu.io;
    io.register_read(BASE, carte, undefined, undefined, carte.lireIdentite);
    io.register_read(BASE + 4, carte, undefined, undefined, carte.lireHorloge);
    io.register_write(BASE + 4, carte, undefined, undefined, carte.ecrireZone);
    io.register_write(BASE + 8, carte, undefined, undefined, carte.ecrireLongueur);
    io.register_write(BASE + 12, carte, undefined, undefined, carte.commande);
    io.register_read(BASE + 12, carte, undefined, undefined, carte.lireEtat);
    if (son) io.register_write(BASE + 16, carte, undefined, undefined, (v) => son.regler(v));
    return carte;
  }

  // Le défaut du menu Qualité. L'allégée partout pour l'instant : la HD doit d'abord être jugée
  // plus belle sur ordinateur. Pour la rendre, passer HD_SUR_ORDINATEUR à vrai.
  const HD_SUR_ORDINATEUR = false;
  const qualiteParDefaut = media =>
    (HD_SUR_ORDINATEUR && !(media("(pointer: coarse)").matches && !media("(pointer: fine)").matches)
      ? "qualite-hd" : "qualite-allegee");

  const api = { creer, brancher, qualiteParDefaut, ETAT, BASE, IDENTITE };
  racine.TakoGpu = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
