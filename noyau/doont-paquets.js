// Le port demande un niveau ; le réseau ne travaille qu'au lancement du jeu.
"use strict";
(function (racine) {
  const BASE = 0x7F0, IDENTITE = 0x4B505344, MAX = 8 * 1024 * 1024, ECHEC = 0xFFFFFFFF;
  // Bit de la demande : le paquet HD, déposé dans la mémoire de la carte et non dans la RAM.
  const HD = 0x100, MAX_HD = 96 * 1024 * 1024;
  // Les fichiers HD de chaque niveau, un par famille : ce qu'on croise dans ses cartes. Chacun
  // ne se télécharge qu'une fois et réside dans la carte ; `doont/outils/hd.py` tient ce tableau.
  const HD_TOUJOURS = ["arme", "lance", "conscrit"];
  const HD_NIVEAUX = { 1: ["chien"], 2: ["hoplite"], 3: ["chien"], 4: ["chien", "harpie"], 5: ["chien", "hoplite"], 6: ["harpie", "hoplite"] };
  function creer({ memoire, taille, charger, chargerHd, moteur }) {
    let adresse = 0, capacite = 0, etat = 0, generation = 0;
    const residents = new Set();
    const mesures = { demandes: 0, octets: 0, niveau: 0, refus: 0 };
    return {
      mesures,
      identite: () => IDENTITE,
      adresse: v => { adresse = v >>> 0; },
      capacite: v => { capacite = v >>> 0; },
      etat: () => etat,
      demander: v => {
        const courant = ++generation;
        etat = 0;
        if (v & HD) {
          const niveau = v & 0xFF;
          if (niveau < 1 || niveau > 6 || !moteur || !moteur.hd_charger || !chargerHd) {
            mesures.refus++; etat = ECHEC; return;
          }
          // Ce qui réside dans la carte ne se retélécharge pas, d'un niveau à l'autre non plus.
          const manque = [...HD_TOUJOURS, ...HD_NIVEAUX[niveau]].filter(f => !residents.has(f));
          if (!manque.length) { etat = 1; return; }
          mesures.demandes++;
          (async () => {
            let octets = 0;
            for (const famille of manque) {
              const data = await chargerHd(famille);
              if (courant !== generation) return;
              if (!data.length || data.length > MAX_HD) throw Error("Paquet HD hors mémoire");
              // Le regonflé se réserve avant le dépôt : sa taille est dans l'en-tête.
              const brut = new DataView(data.buffer, data.byteOffset).getUint32(16, true);
              const p = moteur.hd_entree(data.length, brut);
              if (!p) throw Error("Carte sans mémoire");
              new Uint8Array(moteur.memory.buffer, p, data.length).set(data);
              if (!moteur.hd_charger(data.length)) throw Error("Paquet HD refusé");
              residents.add(famille);
              octets += data.length;
            }
            mesures.octetsHd = (mesures.octetsHd || 0) + octets;
            etat = octets;
          })().catch(() => { if (courant === generation) { mesures.refus++; etat = ECHEC; } });
          return;
        }
        const niveau = v;
        if (niveau === 0) { if (moteur) moteur.sprites_vider(); return; }
        if (niveau < 1 || niveau > 6 || adresse < 0x100000 || !capacite || capacite > MAX || adresse + capacite > taille()) {
          mesures.refus++; etat = ECHEC; return;
        }
        const destination = adresse, limite = capacite;
        mesures.demandes++;
        Promise.resolve().then(() => charger(niveau)).then(data => {
          if (courant !== generation) return;
          if (!data.length || data.length > limite || destination + data.length > taille()) throw Error("Paquet hors mémoire");
          if (moteur) {
            if (data.length > moteur.sprites_taille()) throw Error("Paquet hors wasm");
            new Uint8Array(moteur.memory.buffer, moteur.sprites_entree(), data.length).set(data);
            if (moteur.sprites_charger(data.length) !== 0) throw Error("Sprites refusés");
          }
          memoire().set(data, destination);
          mesures.octets = data.length;
          mesures.niveau = niveau;
          etat = data.length;
        }).catch(() => { if (courant === generation) { mesures.refus++; etat = ECHEC; } });
      },
    };
  }
  async function lire(url, max) {
    const r = await fetch(url);
    if (!r.ok || +(r.headers.get("Content-Length") || 0) > max) throw Error("Paquet indisponible");
    const lecteur = r.body.getReader();
    const morceaux = [];
    let longueur = 0;
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      longueur += value.length;
      if (longueur > max) { await lecteur.cancel(); throw Error("Paquet trop long"); }
      morceaux.push(value);
    }
    const data = new Uint8Array(longueur);
    let p = 0;
    for (const morceau of morceaux) { data.set(morceau, p); p += morceau.length; }
    return data;
  }
  function brancher(emulateur, moteur) {
    const cpu = emulateur.v86.cpu;
    const carte = creer({
      memoire: () => cpu.mem8,
      taille: () => cpu.memory_size[0],
      moteur,
      charger: niveau => lire(`sprites/niveau-${niveau}.dpk`, MAX),
      chargerHd: famille => lire(`sprites-hd/${famille}.dhd`, MAX_HD),
    });
    const io = cpu.io;
    io.register_read(BASE, carte, undefined, undefined, carte.identite);
    io.register_write(BASE + 4, carte, undefined, undefined, carte.adresse);
    io.register_write(BASE + 8, carte, undefined, undefined, carte.capacite);
    io.register_write(BASE + 12, carte, undefined, undefined, carte.demander);
    io.register_read(BASE + 12, carte, undefined, undefined, carte.etat);
    return carte;
  }
  const api = { creer, brancher, BASE, IDENTITE, MAX, ECHEC, HD, MAX_HD, HD_TOUJOURS, HD_NIVEAUX };
  racine.DoontPaquets = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
