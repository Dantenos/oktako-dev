// Le film du café renversé (lot portfolio-cafe-renverse) : la pieuvre renverse la tasse. Le film est pré-rendu (Blender, puis le café du
// site incrusté à son départ) et joué DANS la scène : scene.film.montrer() le fait passer par le même halo, la même sortie et la même
// finition que la pièce cuite. Son image 0 est la vue du dessus du site : rien ne saute au départ.
//
// AU SUCRE, POUR TOUS (décision de l'utilisateur du 16/11, 15 h 50 et 15 h 52, « coûte que coûte », « pour tout le monde ») : quand le
// sucre fond, le FILM ENTIER part tout seul, dans le seul format de l'écran, mouvement réduit compris. Rien ne se télécharge avant le
// geste du sucre (la première visite ne s'alourdit pas) ; le téléchargement part au geste, le film à l'impact, son image 0 étant la vue
// du dessus à cet instant. Pendant le chargement comme pendant la lecture, on peut toujours passer (bouton « Passer », Échap, un clic
// sur le film) : la scène finale paraît, sa dernière image et le lien dans la flaque, sans attendre la vidéo. Son refusé : la MÊME
// vidéo repart muette, sans second téléchargement. Photosensibilité : tests/film-photosensibilite.mjs (au plus 3 éclairs par seconde).
//
// Le film n'est jamais un passage obligé : s'il manque ou échoue, jouer() rend false et la mousse garde ses propositions. À la fin, sa
// dernière image reste à l'écran et `mt:film-fin` passe la main à la scène finale : cette même image et le lien dans la flaque.
//
// Le son : la musique du site et les sons de la scène s'éteignent en fondu AVANT que l'image parte (sons.couper, une promesse),
// et reviennent au retour vers la scène (sons.rendre), seulement s'ils ont été coupés. Son coupé : aucune attente.

export function distanceDepart(depart) {
  const [a, b] = [depart.position, depart.vise]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Ce que le build annonce sur le gabarit du café (tools/build.mjs) : durées et ambiances, pour proposer le film sans rien télécharger.
export function lireAnnonce(d = {}) {
  const s = (v) => (Number(v) > 0 ? Number(v) : null);
  return { extrait: s(d.filmExtrait), complet: s(d.filmComplet), ambiances: d.filmAmbiances ? d.filmAmbiances.split(' ') : null };
}

// surPret({ format }) : le film est chargé et va partir ; la fin peut précharger ce qui lui sert (le masque de la flaque, js/flaque.js).
export function creerFilmCafe({ adresse, annonce = {}, scene, annoncer, sons = {}, surPret = null }) {
  const a = lireAnnonce(annonce);
  let meta = null, metaCharge = null, video = null, image = null, format = null, cle = null, version = null;
  let phase = 'repos', jeton = 0, finir = null, passe = false, issue = null, saute = false, sonCoupe = false;

  const base = () => new URL(adresse, document.baseURI);
  // film.json une fois par visite ; une panne réseau laisse réessayer à la demande suivante.
  function lireMeta() {
    metaCharge ??= fetch(base()).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
    metaCharge.catch(() => { metaCharge = null; });
    return metaCharge;
  }
  // Coupe le téléchargement en cours : sans src, le navigateur abandonne la requête (load() sur un élément vidé).
  function lacher() {
    if (!video) return;
    video.pause(); video.removeAttribute('src'); video.load(); video = null;
  }
  // Le format de l'écran et la version (le film entier ; l'extrait partage sa fin, son écriture et son cadre).
  function choisir(m, complet) {
    cle = innerHeight > innerWidth && m.telephone ? 'telephone' : 'large';
    const extrait = !complet && m.extrait?.[cle]?.video;
    format = { ...m[cle], video: extrait || m[cle].video };
    version = extrait ? 'extrait' : 'complet';
  }
  // Le seul moment où une vidéo se télécharge : au geste du sucre, un fichier, celui de l'écran.
  async function charger(complet, j) {
    const m = await lireMeta();
    if (j !== jeton) return false;
    if (m.ambiances && !m.ambiances.includes(scene()?.etatDuCiel?.().ambiance)) return false;
    choisir(m, complet);
    if (video?.dataset.version !== `${cle}:${version}`) {
      lacher();
      const v = document.createElement('video');
      Object.assign(v, { muted: true, playsInline: true, preload: 'auto' });
      v.dataset.version = `${cle}:${version}`;
      v.setAttribute('aria-hidden', 'true'); v.crossOrigin = 'anonymous';
      v.src = new URL(format.video, base()).href; v.load();
      video = v;
    }
    const v = video;
    const decodage = v.readyState >= 4 ? null : new Promise((ok, non) => {
      v.addEventListener('canplaythrough', ok, { once: true }); v.addEventListener('error', () => non(new Error('vidéo')), { once: true });
    });
    // La dernière image, décodée d'avance : c'est elle qui reste à l'écran à la fin du film, ou quand on le passe.
    const img = new Image(); img.decoding = 'async'; img.src = new URL(format.image, base()).href;
    await Promise.all([img.decode(), decodage]);
    if (j !== jeton) return false;
    meta = m; image = img; return true;
  }
  // La première image vraiment décodée : la montrer avant serait montrer une texture vide, un noir d'une image.
  function premiereImage(v) {
    // Une vidéo qui se termine ou tombe en erreur avant sa première image ne doit pas suspendre le lecteur pour toujours.
    return new Promise((ok) => {
      if (v.ended || v.error) return ok();
      v.addEventListener('ended', () => ok(), { once: true }); v.addEventListener('error', () => ok(), { once: true });
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => ok()); else v.addEventListener('playing', () => ok(), { once: true });
    });
  }
  // Passer : pendant le film, la dernière image tout de suite ; pendant le chargement ou le fondu du son, la scène finale sans la vidéo.
  function passer() {
    if (phase === 'attente' || phase === 'fondu') { saute = true; const f = finir; finir = null; f?.(); return true; }
    if (phase !== 'film' || !video) return false;
    passe = true; const f = finir; finir = null; video.pause(); f?.(); return true;
  }
  // La scène finale sans le film (passé avant sa première image) : le téléchargement de la vidéo est abandonné ; il ne faut que
  // film.json et l'image finale (quelques dizaines de Ko). En panne, jouer() rend false et la mousse revient.
  async function finSansFilm(j, complet) {
    lacher();
    try {
      const m = meta || await lireMeta();
      if (j !== jeton) return false;
      if (!format) choisir(m, complet);
      if (!image) {
        const img = new Image(); img.decoding = 'async'; img.src = new URL(format.image, base()).href; await img.decode();
        if (j !== jeton) return false;
        image = img;
      }
      meta = m;
    } catch { if (j === jeton) { phase = 'repos'; issue = 'panne'; } return false; }
    try { surPret?.({ format: cle }); } catch { /* un préchargement raté laisse la fin à son repli */ }
    phase = 'fin'; passe = true; issue = 'passe';
    document.dispatchEvent(new CustomEvent('mt:film-fin', { detail: { fin: meta.fin, image, format, passe: true, version } }));
    return true;
  }
  function surClic(e) { if (phase === 'film') { e.preventDefault(); e.stopPropagation(); passer(); } }

  return {
    get actif() { return !!adresse; },
    get phase() { return phase; },
    // Une adresse voisine de film.json (le masque de la flaque, flaque.json) ; null sans film publié.
    fichier(nom) { return adresse ? new URL(nom, base()).href : null; },
    // Le film peut-il partir au sucre ? Sans rien télécharger : publié, et dans son ambiance (le gabarit du build l'annonce).
    disponible() { return !!adresse && (!a.ambiances || a.ambiances.includes(scene()?.etatDuCiel?.().ambiance)); },
    // Au geste du sucre, pour tous. depart : la promesse de l'impact (le film raccorde à la vue du dessus à cet instant).
    // attente(true|false) : le chargement commence, ou se termine. false : film absent ou en panne, la mousse garde ses propositions.
    async jouer({ hote, complet = true, attente, depart = null } = {}) {
      if (!adresse || phase !== 'repos') return false;
      const j = ++jeton; phase = 'attente'; issue = null; saute = false; attente?.(true);
      let pret = false;
      // Le téléchargement part tout de suite ; le film attend en plus l'impact du sucre. « Passer » libère l'attente (finir).
      try { pret = await Promise.race([Promise.all([charger(complet, j), depart]).then(([p]) => p), new Promise((ok) => { finir = () => ok(false); })]); } catch { pret = false; }
      finir = null; attente?.(false);
      if (j !== jeton) return false;
      if (saute) return finSansFilm(j, complet);
      const s = scene();
      if (!pret || !s?.film) { phase = 'repos'; issue = 'panne'; lacher(); return false; }
      try { surPret?.({ format: cle }); } catch { /* un préchargement raté laisse la fin à son repli */ }
      phase = 'fondu';
      // Le son s'éteint d'abord ; l'image ne part qu'ensuite. L'arrêt le rend même si le visiteur repart avant la première image.
      sonCoupe = true;
      try { await (sons.couper?.() ?? null); } catch { /* un fondu raté ne bloque pas le film */ }
      if (j !== jeton) return false;
      if (saute) return finSansFilm(j, complet);
      // La fin de la vidéo peut arriver pendant les attentes qui suivent (décodage qui lâche : 4 s « lues » en 100 ms sous SwiftShader, contrôle 12a) :
      // on l'écoute AVANT de lancer la lecture, sinon « ended » part sans témoin, le film ne finit jamais et sa texture reste noire.
      let terminee = false; const finVideo = () => { terminee = true; const f = finir; finir = null; f?.(); };
      video.addEventListener('ended', finVideo, { once: true }); video.addEventListener('error', finVideo, { once: true });
      passe = false;
      try {
        video.currentTime = 0; video.muted = !sons.autorise?.(); await video.play();
      } catch {
        if (j !== jeton) return false;
        // Le son refusé : le même fichier, muet (aucun second téléchargement). Une lecture refusée même muette garde l'image et le lien.
        video.muted = true;
        try { await video.play(); } catch { terminee = true; }
      }
      if (j !== jeton) { video?.pause(); return false; }
      if (!terminee) {
        // Pause avant le premier décodage : le rappel vidéo ne viendra plus ; l'arrêt doit aussi libérer cette attente.
        await Promise.race([premiereImage(video), new Promise((ok) => { finir = ok; })]);
        finir = null;
      }
      if (j !== jeton) { video?.pause(); return false; }
      // Passé avant la première image (phase « fondu ») : la scène finale, sans montrer le film.
      if (saute) { video.pause(); return finSansFilm(j, complet); }
      const d = meta.depart;
      // La teinte de l'ambiance (film.json, mesurée au raccord) et le fondu enchaîné sur l'image fixe du départ.
      const teinte = meta.teinte?.[s.etatDuCiel?.().ambiance] || meta.teinte?.defaut || [1, 1, 1];
      if (!s.film.montrer(video, { distance: distanceDepart(d), champ: d.champ, rapport: format.largeur / format.hauteur, teinte, fondu: meta.fondu ?? 8 / 24 })) { video.pause(); phase = 'repos'; if (sonCoupe) { sonCoupe = false; sons.rendre?.(); } return false; }
      phase = 'film';
      hote?.addEventListener('pointerdown', surClic, true);
      annoncer?.('Le film : la pieuvre renverse le café. « Passer », Échap ou un clic pour passer.');
      await new Promise((ok) => { if (terminee || video.ended || video.error) return ok(); finir = ok; });
      finir = null; hote?.removeEventListener('pointerdown', surClic, true);
      if (j !== jeton) return true;
      // Le récepteur pose cette même image décodée en fond, puis rend la main au compositeur.
      video.pause(); scene()?.film?.figer(image);
      phase = 'fin';
      document.dispatchEvent(new CustomEvent('mt:film-fin', { detail: { fin: meta.fin, image, format, passe, version } }));
      return true;
    },
    passer,
    // Échap : pendant le chargement ou le film, il le passe (true : la touche est prise) ; ensuite, il laisse revenir au bureau.
    presser() { return passer(); },
    reglerSon() { if (video) video.muted = !sons.autorise?.(); },
    // Retour au bureau, Échap final, panne : tout s'arrête, la pièce revient, le son aussi ; une attente en cours lâche son téléchargement.
    arreter() {
      const enAttente = phase === 'attente';
      ++jeton; finir?.(); finir = null;
      if (enAttente) lacher(); else video?.pause();
      if (phase !== 'repos' && !enAttente) scene()?.film?.cacher();
      if (sonCoupe) { sonCoupe = false; sons.rendre?.(); }
      phase = 'repos';
    },
    // Pour les essais.
    etat: () => ({ phase, issue, fige: !!image && phase === 'fin', format: cle, version, source: video?.src || null, muet: video?.muted,
      lecture: video ? { t: video.currentTime, pause: video.paused, duree: video.duration } : null }),
  };
}
