// Ambiance sonore facultative : pluie sur la vitre et gouttes, synthétisées en WebAudio.
// Aucun fichier audio, aucun réseau : tout est du bruit filtré généré ici.
// Le contexte audio n'est créé qu'au premier clic explicite sur « Son » (politique des navigateurs,
// et respect du visiteur : rien ne sonne sans qu'il l'ait demandé).
import { creerPack, courbeFondu, DUREE_FONDU_FILM } from './pack-sons.js';
export function creerSon({ observerRadio = () => {} } = {}) {
  let ctx = null, maitre = null, minuteur = null, actif = false, pack = null, sortiePack = null, prete = Promise.resolve();
  let activation = 0;

  function bruit(duree, couleur = 'rose') {
    const n = Math.floor(ctx.sampleRate * duree); const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      // Bruit rose (filtre de Paul Kellet, version courte) : plus doux que le blanc, proche d'une averse.
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (couleur === 'blanc') { d[i] = w; continue; }
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      }
    }
    return buf;
  }

  function construire() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    maitre = ctx.createGain(); maitre.gain.value = 0; maitre.connect(ctx.destination);
    // Les sons du pack sont des enregistrements déjà mixés : ils passent à côté du maître de l'ambiance (0,22), à leur propre niveau.
    sortiePack = ctx.createGain(); sortiePack.gain.value = 0.8; sortiePack.connect(ctx.destination);
    pack = creerPack({ racine: 'sons/', contexte: () => ctx, sortie: () => sortiePack });
    pack.observerRadio(observerRadio);
    // Nappe de pluie : bruit rose en boucle, passe-bas + légère respiration de volume.
    const nappe = ctx.createBufferSource(); nappe.buffer = bruit(4); nappe.loop = true;
    const pb = ctx.createBiquadFilter(); pb.type = 'lowpass'; pb.frequency.value = 2400; pb.Q.value = 0.3;
    const ph = ctx.createBiquadFilter(); ph.type = 'highpass'; ph.frequency.value = 180;
    const vol = ctx.createGain(); vol.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 0.12;
    lfo.connect(lfoG).connect(vol.gain); lfo.start();
    nappe.connect(pb).connect(ph).connect(vol).connect(maitre); nappe.start();
    // Gouttes sur la vitre : impulsions de bruit blanc très courtes, filtrées en passe-bande, au hasard.
    const impulsion = bruit(0.05, 'blanc');
    const goutte = () => {
      if (!actif) return;
      const s = ctx.createBufferSource(); s.buffer = impulsion;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 3500; f.Q.value = 6 + Math.random() * 8;
      const g = ctx.createGain(); const t = ctx.currentTime; const a = 0.08 + Math.random() * 0.22;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + Math.random() * 0.05);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; s.connect(f).connect(g).connect(pan).connect(maitre); } else s.connect(f).connect(g).connect(maitre);
      s.start(t); s.stop(t + 0.12);
      minuteur = setTimeout(goutte, 60 + Math.random() * 420);
    };
    construire.goutte = goutte;
  }

  return {
    get actif() { return actif; },
    async activer() {
      if (!ctx) construire();
      const tour = ++activation;
      actif = true;
      // Premier clic seulement : le pack se télécharge ici, jamais avant. Un échec laisse l'ambiance maison seule.
      // Puis la musique d'atelier (lo-fi -> boss), SI ses fichiers sont au manifeste : sinon rien ne se charge ni ne joue.
      prete = pack.activer().then(() => tour === activation && actif ? pack.atelier.preparer() : false).catch(() => {});
      if (ctx.state === 'suspended') await ctx.resume();
      // Un réveil WebAudio peut finir après le geste suivant : il ne doit ni relever le gain ni rallumer la pluie.
      if (tour !== activation || !actif) { if (!actif) await ctx.suspend(); return; }
      const t = ctx.currentTime; maitre.gain.cancelScheduledValues(t); maitre.gain.setValueAtTime(maitre.gain.value, t); maitre.gain.linearRampToValueAtTime(0.22, t + 1.5);
      clearTimeout(minuteur); construire.goutte();
    },
    couper() {
      activation++;
      actif = false; clearTimeout(minuteur);
      if (!ctx) return;
      pack?.couper();
      const t = ctx.currentTime; maitre.gain.cancelScheduledValues(t); maitre.gain.setValueAtTime(maitre.gain.value, t); maitre.gain.linearRampToValueAtTime(0, t + 0.4);
      setTimeout(() => { if (!actif) ctx.suspend(); }, 450);
    },
    // La radio du bureau : passe à la station suivante (lo-fi d'atelier, piano 1 et 2, boss 1 et 2). Rend { id, nom }, ou null si le son est coupé
    // ou le pack indisponible. `prete` : la fin du chargement lancé par activer(), à attendre avant le premier changement.
    get prete() { return prete; },
    // Les noms de station, connus avant tout chargement de musique : l'annonce de la radio ne doit pas attendre le décodage.
    async stationDeDepart() { if (!actif || !pack) return null; try { return await pack.radio.depart(); } catch (e) { return null; } },
    prochaineStation() { return actif && pack ? pack.radio.prochaine() : null; },
    async changerStation() { if (!actif || !pack) return null; try { return await pack.radio.changer(); } catch (e) { return null; } },
    get station() { return pack?.radio.station ?? { id: '', nom: '' }; },
    // Un son du pack HD sur son événement (tiroir, radio, clé, diaphragme). Rend vrai s'il a sonné ; faux tant que le pack
    // n'est pas chargé ou si le son est coupé, pour que l'appelant garde son repli maison.
    evenement(nom) { return !!(actif && pack?.jouer(nom)); },
    // Fondu de TOUT le son de la scène (pack : musique, ambiances, effets ; et la pluie synthétisée) vers `vers`.
    // La promesse se résout à la fin du fondu ; rien quand le son est coupé. Courbe à puissance constante, sans clic.
    fondre({ duree = DUREE_FONDU_FILM, vers = 0 } = {}) {
      if (!ctx || !actif) return Promise.resolve();
      const t = ctx.currentTime, plein = 0.22, de = maitre.gain.value;
      maitre.gain.cancelScheduledValues(t); maitre.gain.setValueCurveAtTime(courbeFondu(de, vers * plein), t, duree);
      return Promise.all([pack.fondre({ duree, vers }), new Promise((fini) => setTimeout(fini, duree * 1000))]).then(() => {});
    },
    reprendre(options = {}) { return this.fondre({ duree: 1.5, ...options, vers: 1 }); },
    // La cuillère contre le grès, quand on plonge dans la tasse : deux tintements, seulement si le son est activé.
    // Partiels inharmoniques (une cloche, pas une note), attaque nette et extinction rapide.
    cuillere() {
      if (!ctx || !actif) return;
      const t0 = ctx.currentTime;
      for (const [decalage, force] of [[0, 0.16], [0.13, 0.1]]) for (const [f, a, d] of [[2380, 1, 0.35], [3870, 0.55, 0.22], [5620, 0.3, 0.14], [7400, 0.15, 0.09]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + decalage;
        o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(force * a, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(maitre); o.start(t); o.stop(t + d + 0.05);
      }
    },
    // Le tonnerre, après un éclair : un grondement grave qui roule au loin, une à trois secondes plus tard (la
    // lumière va plus vite que le son), jamais plus fort que la pluie. Seulement si le son est activé.
    tonnerre() {
      if (!ctx || !actif) return;
      const t = ctx.currentTime + 1 + Math.random() * 2, d = 2.6 + Math.random() * 1.4;
      const s = ctx.createBufferSource(); s.buffer = bruit(d + 0.2);
      const pb = ctx.createBiquadFilter(); pb.type = 'lowpass'; pb.frequency.value = 140; pb.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.25); g.gain.linearRampToValueAtTime(0.32, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(pb).connect(g).connect(maitre); s.start(t); s.stop(t + d + 0.2);
    },
    // Onglet caché : on suspend sans changer le réglage choisi.
    suspendre(oui) { if (!ctx || !actif) return; if (oui) { clearTimeout(minuteur); ctx.suspend(); } else { ctx.resume(); clearTimeout(minuteur); construire.goutte(); } },
  };
}
