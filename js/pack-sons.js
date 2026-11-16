// Le pack sonore HD (sons ElevenLabs transcodés en Opus) : chargé à la demande, jamais avant le premier clic sur « Son ».
// POURQUOI un module à part : le payload initial ne contient que ce petit fichier ; le manifeste et les sons ne sont
// demandés qu'à activer(), et rien ne sonne tant que le visiteur n'a pas activé (coupé par défaut).
// `racine` : dossier du pack côté site ('sons/' depuis la racine, '../sons/' depuis noyau/).
// Durée annoncée du fondu qui précède le film du café (secondes) : le film attend la promesse de fondre(), ou ce temps fixe.
export const DUREE_FONDU_FILM = 1.2;
// Courbe d'un fondu de `de` vers `vers` (gains linéaires) : loi en puissance constante, g(p) = √(de²·cos²(pπ/2) + vers²·sin²(pπ/2)).
// Elle part exactement de la valeur courante (aucun saut, donc aucun clic), arrive exactement à `vers`, et reste monotone.
export function courbeFondu(de, vers, points = 64) {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const p = i / (points - 1), a = p * Math.PI / 2;
    c[i] = Math.sqrt((de * Math.cos(a)) ** 2 + (vers * Math.sin(a)) ** 2);
  }
  return c;
}
// Durée (secondes) du court fondu enchaîné entre deux morceaux de la playlist de la radio (à la fin réelle du fichier).
export const FONDU_PLAYLIST = 1.5;
// `minuteur` : { apres(fn, ms) -> id, annuler(id) }, injectable pour jouer l'enchaînement en horloge simulée.
export function creerPack({ racine, contexte, sortie, chercher = (u) => fetch(u), minuteur = { apres: (fn, ms) => setTimeout(fn, ms), annuler: (id) => clearTimeout(id) } }) {
  let actif = false, charge = null, octets = 0;
  const tampons = new Map(), registre = new Map();
  const boucles = new Map();
  // Le bus de tout le pack (effets, boucles, musique) : un seul gain à fondre, sans toucher aux sons un par un.
  let bus = null;
  const busGain = () => (bus ??= (() => { const g = contexte().createGain(); g.connect(sortie()); return g; })());

  let manifeste = null, musique = null;
  async function lireManifeste() {
    if (manifeste) return manifeste;
    const rep = await chercher(racine + 'manifeste.json');
    if (!rep.ok) throw new Error('manifeste des sons indisponible');
    manifeste = await rep.json();
    return manifeste;
  }
  async function chargerGroupe(liste) {
    const man = { sons: liste };
    for (const s of man.sons) registre.set(s.nom, s);
    // Chaque son est indépendant : un fichier absent ou un codec non pris en charge ne coupe pas les autres.
    await Promise.all(man.sons.map(async (s) => {
      try {
        const r = await chercher(racine + s.fichier);
        if (!r.ok) return;
        const brut = await r.arrayBuffer();
        octets += brut.byteLength;
        tampons.set(s.nom, await contexte().decodeAudioData(brut));
      } catch (e) { /* ce son-là reste muet */ }
    }));
    return { sons: tampons.size, octets };
  }
  async function chargerTout() { return chargerGroupe((await lireManifeste()).sons); }

  function jouerVoix(nom, { boucle = false, volume = 1 } = {}) {
    const tampon = tampons.get(nom);
    if (!tampon) return null;
    const ctx = contexte(), s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = tampon; s.loop = boucle; g.gain.value = volume * (registre.get(nom)?.volume ?? 1);
    s.connect(g).connect(busGain()); s.start();
    return { source: s, gain: g };
  }

  // --- La musique du site est une PLAYLIST (la radio du bureau) : lo-fi (162 s) -> arrêt de platine -> scratch -> boss 1, puis piano 1, piano 2,
  // boss 1, boss 2, puis retour au début. AUCUN morceau ne boucle : chacun joue jusqu'à la fin réelle de son fichier, puis le suivant entre par
  // un court fondu enchaîné. Un clic sur la radio saute au suivant. ---
  // Le minutage vient des DURÉES RÉELLES des fichiers décodés (aucun chiffre en dur) et se planifie sur l'horloge audio : chaque
  // morceau est posé à son instant exact, sans dérive de minuteur. Les pas absents (fichier pas encore livré) sont sautés ;
  // sans le premier pas (le lo-fi), rien ne démarre. Tout passe par le bus : le fondu du film (fondre) l'éteint où qu'il en soit,
  // même en plein boss, et reprendre() le rend, la musique ayant continué son chemin.
  let ordre = [], cycles = [], minuteurCycle = null, enCours = false, atelierPret = null;
  // Annuler un minuteur ne retire pas son rappel déjà entré dans une attente réseau.
  let revisionAtelier = 0;
  // Cette observation lit l'horloge audio ; elle n'ordonne jamais la playlist.
  const observateursRadio = new Set();
  let veilleRadio = null, dernierRadio = '', busAudible = true;
  function etatRadio() {
    const ctx = contexte(), t = ctx.currentTime;
    const cycle = [...cycles].reverse().find(c => c.voix.some(v => !v.terminee && v.debut <= t && t < v.fin));
    return { station: cycle?.station ?? '', lecture: !!(actif && busAudible && cycle && (!ctx.state || ctx.state === 'running')) };
  }
  function publierRadio() {
    if (!observateursRadio.size) return;
    const etat = etatRadio(), cle = JSON.stringify(etat);
    if (cle !== dernierRadio) {
      dernierRadio = cle;
      for (const observer of observateursRadio) observer({ ...etat });
    }
    if (veilleRadio !== null) minuteur.annuler(veilleRadio);
    veilleRadio = enCours ? minuteur.apres(() => { veilleRadio = null; publierRadio(); }, 100) : null;
  }
  const pasPresents = () => ordre.filter((n) => tampons.has(n));
  function programmer(nom, { quand, decalage = 0, entree = 0, sortie: sortieS = 0 }) {
    const tampon = tampons.get(nom), ctx = contexte();
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = tampon;
    const plein = registre.get(nom)?.volume ?? 1, fin = quand + tampon.duration - decalage;
    // Entrée et sortie en puissance constante (comme le fondu du film) : le croisement lo-fi/boss ne creuse ni ne bosse.
    if (entree > 0) g.gain.setValueCurveAtTime(courbeFondu(0, plein), quand, entree); else g.gain.setValueAtTime(plein, quand);
    if (sortieS > 0) g.gain.setValueCurveAtTime(courbeFondu(plein, 0), fin - sortieS, sortieS);
    s.connect(g).connect(busGain()); s.start(quand, decalage);
    const voix = { nom, source: s, gain: g, debut: quand, fin, decalage, terminee: false };
    s.onended = () => { voix.terminee = true; publierRadio(); };
    return voix;
  }
  // Pose un cycle dont le premier pas commence (ou aurait commencé) à `t0`. `premier` : pas de fondu d'entrée sur le tout premier cycle.
  function lancerCycle(t0, { premier = false } = {}) {
    if (!enCours) return;
    const ctx = contexte(), maintenant = ctx.currentTime, pas = pasPresents();
    if (!pas.length) return;
    let t = t0; const voix = [];
    pas.forEach((nom, i) => {
      const d = tampons.get(nom).duration, fin = t + d;
      if (fin > maintenant) voix.push(programmer(nom, {
        quand: Math.max(t, maintenant), decalage: Math.max(0, maintenant - t),
        entree: i === 0 && !premier && t >= maintenant ? FONDU_PLAYLIST : 0,
        sortie: i === pas.length - 1 ? FONDU_PLAYLIST : 0,
      }));
      t = fin;
    });
    cycles.push({ t0, fin: t, voix, station: courante }); if (cycles.length > 3) cycles.shift();
    // Le morceau suivant de la playlist entre FONDU_PLAYLIST avant la fin réelle de celui-ci. Il est chargé d'avance ; s'il n'est pas prêt à l'heure, il part dès qu'il l'est.
    const suiv = suivanteDe(courante);
    if (suiv) {
      const revision = revisionAtelier;
      const pret = (manifeste ? chargerStation(suiv, manifeste) : Promise.resolve()).catch(() => {});
      const quand = t - FONDU_PLAYLIST;
      minuteurCycle = minuteur.apres(async () => {
        await pret;
        if (!enCours || revision !== revisionAtelier) return;
        courante = suiv.id; ordre = pistesDe(suiv);
        lancerCycle(Math.max(quand, contexte().currentTime));
      }, Math.max(0, (quand - ctx.currentTime - 3) * 1000));
    }
    publierRadio();
  }
  // `fondu` : secondes pour éteindre ce qui joue (0,05 = quasi sec, pour couper() ; 0,6 quand la radio change de station).
  const arreterAtelier = (fondu = 0.05) => {
    revisionAtelier++;
    enCours = false; if (minuteurCycle != null) minuteur.annuler(minuteurCycle); minuteurCycle = null;
    const ctx = contexte(), t = ctx.currentTime;
    for (const c of cycles) for (const v of c.voix) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        if (fondu > 0.06) v.gain.gain.setValueCurveAtTime(courbeFondu(v.gain.gain.value, 0), t, fondu); else v.gain.gain.setValueAtTime(0, t);
        v.source.stop(t + fondu);
      } catch (e) { /* déjà fini */ }
    }
    cycles = []; publierRadio();
  };
  // --- La radio du bureau : un clic change de station (lo-fi d'atelier, piano 1 et 2, boss 1 et 2). Les stations viennent du manifeste. ---
  const GRESILLEMENT = 'radio-ancienne-gresillement';
  // Pas de station « silence » : le silence est le bouton Son. `courante` vide = rien ne joue (aucune station disponible).
  let stations = [], courante = '', musiqueDispo = new Set();
  const pistesDe = (st) => (st.pistes === 'enchainement' ? enchainementAtelier : st.pistes);
  const disponible = (st) => (pistesDe(st).length > 0 && (tampons.has(pistesDe(st)[0]) || musiqueDispo.has(pistesDe(st)[0])));
  let enchainementAtelier = [];
  // La station qui suit `id` dans la tracklist (en rond), parmi celles dont les fichiers sont au manifeste.
  const suivanteDe = (id) => { const l = stations.filter(disponible); return l.length ? l[(l.findIndex((x) => x.id === id) + 1) % l.length] : null; };
  function initStations(m) {
    enchainementAtelier = m.enchainement || [];
    musiqueDispo = new Set((m.musique || []).map((s) => s.nom));
    stations = m.stations_radio || [{ id: 'lofi', nom: 'Lo-fi d\'atelier', pistes: 'enchainement' }];
    ordre = enchainementAtelier;
  }
  async function chargerStation(st, m) {
    const noms = pistesDe(st);
    await chargerGroupe((m.musique || []).filter((s) => noms.includes(s.nom) && !tampons.has(s.nom)));
  }
  // Le petit grésillement de recherche de station (un son du lot A) : rend sa durée, 0 s s'il n'est pas chargé.
  function gresillement() {
    const t = tampons.get(GRESILLEMENT); if (!t) return 0;
    const ctx = contexte(), now = ctx.currentTime, d = Math.min(1.1, t.duration), s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = t; g.gain.setValueAtTime(0.6, now); g.gain.setValueCurveAtTime(courbeFondu(0.6, 0), now + d - 0.3, 0.3);
    s.connect(g).connect(busGain()); s.start(now); s.stop(now + d);
    return d;
  }
  // Accorde la radio sur `st` : l'ancienne station s'éteint en fondu, le grésillement passe, la nouvelle entre en fondu.
  function accorder(st, { avecGresillement = true } = {}) {
    if (enCours || cycles.length) arreterAtelier(0.6);
    const d = avecGresillement ? gresillement() : 0;
    courante = st.id;
    ordre = pistesDe(st);
    enCours = true; lancerCycle(contexte().currentTime + (d ? 0.9 : 0.1), { premier: false });
  }

  return {
    get actif() { return actif; },
    observerRadio(observer) {
      observateursRadio.add(observer);
      observer(etatRadio()); dernierRadio = JSON.stringify(etatRadio());
      publierRadio();
      return () => {
        observateursRadio.delete(observer);
        if (!observateursRadio.size && veilleRadio !== null) { minuteur.annuler(veilleRadio); veilleRadio = null; }
      };
    },
    get octetsCharges() { return octets; },
    // Un seul chargement, partagé : activer deux fois ne redemande rien.
    activer() {
      if (!actif) {
        busAudible = true;
        // Couper pendant le film laisse son bus à zéro : le geste de réactivation doit le rendre audible.
        if (bus) { const t = contexte().currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(1, t); }
      }
      actif = true;
      return (charge ??= chargerTout().catch((e) => { charge = null; throw e; }));
    },
    // La musique (permise pour le site seulement) : jamais chargée par activer(), seulement sur demande explicite et si le son est activé.
    chargerMusique() { if (!actif) return Promise.resolve({ sons: 0, octets: 0 }); return (musique ??= lireManifeste().then((m) => chargerGroupe(m.musique || [])).catch((e) => { musique = null; throw e; })); },
    // FONDU de tout le pack (musique, ambiances, effets) vers `vers` (0 = silence, 1 = plein) en `duree` secondes.
    // Rend une promesse résolue À LA FIN du fondu : le film du café l'attend avant de lancer l'image. Rien (promesse déjà
    // résolue, aucune automation) quand le son est coupé ou que rien n'a encore sonné. Un fondu en cours est repris de son niveau courant.
    fondre({ duree = DUREE_FONDU_FILM, vers = 0 } = {}) {
      busAudible = vers > 0; publierRadio();
      if (!actif || !bus) return Promise.resolve();
      const g = bus.gain, t = contexte().currentTime;
      const de = g.value;
      g.cancelScheduledValues(t);
      g.setValueCurveAtTime(courbeFondu(de, vers), t, duree);
      return new Promise((fini) => setTimeout(fini, duree * 1000));
    },
    // Réciproque : retour au plein niveau (retour à la scène après le film).
    reprendre({ duree = 1.5 } = {}) { return this.fondre({ duree, vers: 1 }); },
    couper() { actif = false; arreterAtelier(); courante = ''; atelierPret = null; for (const nom of [...boucles.keys()]) this.arreterBoucle(nom); },
    radio: {
      // Les stations accordables, dans l'ordre de la tracklist, avec leur nom pour l'annonce.
      stations: () => stations.filter(disponible).map(({ id, nom }) => ({ id, nom })),
      get station() { const s = stations.find((x) => x.id === courante); return s ? { id: s.id, nom: s.nom } : { id: '', nom: '' }; },
      // La station de départ (la première dont les fichiers sont au manifeste) : ne lit que le petit manifeste, SANS attendre le téléchargement
      // ni le décodage de la musique, pour que le nom soit annoncé tout de suite (lecteur d'écran). null si le son est coupé ou rien à jouer.
      async depart() {
        if (!actif) return null;
        const m = await lireManifeste();
        if (!stations.length) initStations(m);
        const s = stations.find(disponible);
        return s ? { id: s.id, nom: s.nom } : null;
      },
      // La station qui suivra un clic, connue sans rien charger (null tant que le manifeste n'est pas lu).
      prochaine() { const s = stations.length ? suivanteDe(courante) : null; return s ? { id: s.id, nom: s.nom } : null; },
      // Passe à la station suivante de la tracklist (en boucle : lo-fi, piano 1, piano 2, boss 1, boss 2, lo-fi…). Charge ses morceaux au besoin. Rend { id, nom }, ou null si le son est coupé.
      async changer() {
        if (!actif) return null;
        const revision = revisionAtelier;
        const m = await lireManifeste();
        if (!stations.length) initStations(m);
        const suivante = suivanteDe(courante);
        if (!suivante) return null;
        await chargerStation(suivante, m);
        if (!actif || revision !== revisionAtelier) return null;
        accorder(suivante);
        return { id: suivante.id, nom: suivante.nom };
      },
    },
    atelier: {
      // Charge (une fois) les pas présents au manifeste, puis démarre si le premier (le lo-fi) est là. Rend vrai si la musique joue.
      async preparer() {
        if (!actif) return false;
        atelierPret ??= lireManifeste().then(async (m) => {
          initStations(m);
          // La station de départ : la première disponible (le lo-fi d'atelier ; le piano 1 tant que le lo-fi n'est pas livré).
          const depart = stations.find(disponible);
          if (!depart) return;
          ordre = pistesDe(depart); courante = depart.id;
          await chargerGroupe((m.musique || []).filter((s) => ordre.includes(s.nom)));
        }).catch((e) => { atelierPret = null; throw e; });
        await atelierPret;
        return this.demarrer();
      },
      demarrer() {
        if (!actif || enCours || !ordre.length || !tampons.has(ordre[0])) return false;
        enCours = true; lancerCycle(contexte().currentTime, { premier: true });
        return true;
      },
      arreter: () => arreterAtelier(),
      get enCours() { return enCours; },
      get enLecture() { return etatRadio().lecture; },
      // Où en est la musique : { nom, secondes } (secondes écoulées dans le pas courant), pour l'affichage et l'essai.
      etat() {
        const ctx = contexte(), t = ctx.currentTime;
        const c = [...cycles].reverse().find((x) => x.voix.length && x.t0 <= t) ?? cycles[0];
        if (!c) return null;
        const v = c.voix.find((x) => x.debut <= t && t < x.fin) ?? c.voix[c.voix.length - 1];
        return { nom: v.nom, secondes: Math.max(0, t - v.debut) + v.decalage };
      },
      // Saute à `secondes` depuis le début du cycle (page d'écoute : « sauter à 2 min 35 » pour entendre la bascule).
      sauter(secondes) {
        if (!actif || !tampons.has(ordre[0])) return false;
        arreterAtelier(); enCours = true; lancerCycle(contexte().currentTime - secondes, { premier: true });
        return true;
      },
      get duree() { return pasPresents().reduce((n, x) => n + tampons.get(x).duration, 0); },
    },
    // Un effet ponctuel, seulement si le son est activé ET déjà chargé.
    jouer(nom, options) { return actif ? jouerVoix(nom, options) : null; },
    // Une ambiance en boucle (un seul exemplaire par nom).
    boucle(nom, volume = 1) {
      if (!actif || boucles.has(nom)) return;
      const v = jouerVoix(nom, { boucle: true, volume });
      if (v) boucles.set(nom, v);
    },
    arreterBoucle(nom) {
      const v = boucles.get(nom); if (!v) return;
      boucles.delete(nom);
      const t = contexte().currentTime;
      v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + 0.4);
      v.source.stop(t + 0.45);
    },
    boucleActive: (nom) => boucles.has(nom),
  };
}
