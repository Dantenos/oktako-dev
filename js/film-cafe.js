// Le film du café renversé (lot portfolio-cafe-renverse) : la pieuvre renverse la tasse. Le film est pré-rendu (Blender, puis le café du
// site incrusté à son départ) et joué DANS la scène : scene.film.montrer() le fait passer par le même halo, la même sortie et la même
// finition que la pièce cuite. Son image 0 est la vue du dessus du site : rien ne saute au départ.
//
// À LA DEMANDE (lot film-a-la-demande, 14/11) : rien ne se télécharge, ni film.json ni vidéo, avant que le visiteur ait demandé à le voir.
// Le sucre ne vaut plus accord pour 10 Mo : il fait seulement paraître l'offre (js/tasse.js). Deux versions : l'extrait (8 à 12 s, le
// défaut) et le film entier (22 s), toutes deux dans le seul format de l'écran (ordinateur ou téléphone). L'attente est annulable et
// l'annulation coupe le téléchargement. Son refusé : la MÊME vidéo repart muette, sans second téléchargement.
//
// Le film n'est jamais un passage obligé : s'il manque, échoue, ou si la lecture est refusée, jouer() rend false et la mousse garde ses
// propositions. Un clic ou Échap le passe ; en mouvement réduit, il ne se propose pas. À la fin, sa dernière image reste à l'écran et
// `mt:film-fin` passe la main à la scène finale : cette même image et les liens dans la flaque. L'extrait finit sur la même image.
//
// Le son : la musique du site et les sons de la scène s'éteignent en fondu AVANT que l'image parte (sons.couper, une promesse),
// et reviennent au retour vers la scène (sons.rendre). Son coupé : aucune attente.

export function distanceDepart(depart) {
  const [a, b] = [depart.position, depart.vise]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Ce que le build annonce sur le gabarit du café (tools/build.mjs) : durées et ambiances, pour proposer le film sans rien télécharger.
export function lireAnnonce(d = {}) {
  const s = (v) => (Number(v) > 0 ? Number(v) : null);
  return { extrait: s(d.filmExtrait), complet: s(d.filmComplet), ambiances: d.filmAmbiances ? d.filmAmbiances.split(' ') : null };
}

export function creerFilmCafe({ adresse, annonce = {}, scene, mouvementReduit, annoncer, sons = {} }) {
  const a = lireAnnonce(annonce);
  let meta = null, metaCharge = null, video = null, image = null, format = null, cle = null, version = null;
  let phase = 'repos', jeton = 0, finir = null, passe = false, issue = null;

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
  // Le seul moment où une vidéo se télécharge : après la demande, un fichier, celui de l'écran et de la version demandée.
  async function charger(complet, j) {
    const m = await lireMeta();
    if (j !== jeton) return false;
    if (m.ambiances && !m.ambiances.includes(scene()?.etatDuCiel?.().ambiance)) return false;
    cle = innerHeight > innerWidth && m.telephone ? 'telephone' : 'large';
    const extrait = !complet && m.extrait?.[cle]?.video;
    // L'extrait partage la fin, l'écriture et le cadre du film entier : seul le fichier vidéo change.
    format = { ...m[cle], video: extrait || m[cle].video };
    version = extrait ? 'extrait' : 'complet';
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
  // Passer : la dernière image, tout de suite (clic ou Échap pendant le film). Elle est posée en image fixe à la sortie de jouer().
  function passer() {
    if (phase !== 'film' || !video) return false;
    passe = true; const f = finir; finir = null; video.pause(); f?.(); return true;
  }
  // Annuler l'attente : la requête vidéo est abandonnée, jouer() rend false, la mousse revient.
  function annuler() {
    if (phase !== 'attente') return false;
    ++jeton; lacher(); phase = 'repos'; issue = 'annule'; finir?.(); finir = null; return true;
  }
  function surClic(e) { if (phase === 'film') { e.preventDefault(); e.stopPropagation(); passer(); } }

  return {
    get actif() { return !!adresse; },
    get phase() { return phase; },
    // Ce que l'on peut proposer maintenant, sans aucun téléchargement : null si rien (film absent, mouvement réduit, autre ambiance).
    offre() {
      if (!adresse || mouvementReduit() || !a.extrait && !a.complet) return null;
      if (a.ambiances && !a.ambiances.includes(scene()?.etatDuCiel?.().ambiance)) return null;
      return { extrait: a.extrait, complet: a.complet };
    },
    // Sur demande explicite. false : rien n'est pris, la tasse continue comme avant (film absent, refusé, annulé).
    // attente(true|false) : le chargement commence, ou se termine (film prêt, panne ou annulation).
    async jouer({ hote, direct, complet = false, attente } = {}) {
      if (!adresse || direct || mouvementReduit() || phase !== 'repos') return false;
      const j = ++jeton; phase = 'attente'; issue = null; attente?.(true);
      let pret = false;
      try { pret = await Promise.race([charger(complet, j), new Promise((ok) => { finir = () => ok(false); })]); } catch { pret = false; }
      finir = null; attente?.(false);
      const s = scene();
      if (!pret || j !== jeton || !s?.film) { if (j === jeton) { phase = 'repos'; issue = 'panne'; lacher(); } return false; }
      // L'arrêt doit rendre le son même si le visiteur repart avant la première image.
      phase = 'fondu';
      // Le son s'éteint d'abord ; l'image ne part qu'ensuite.
      try { await (sons.couper?.() ?? null); } catch { /* un fondu raté ne bloque pas le film */ }
      if (j !== jeton) return false;
      // La fin de la vidéo peut arriver pendant les attentes qui suivent (décodage qui lâche : 4 s « lues » en 100 ms sous SwiftShader, contrôle 12a) :
      // on l'écoute AVANT de lancer la lecture, sinon « ended » part sans témoin, le film ne finit jamais et sa texture reste noire.
      let terminee = false; const finVideo = () => { terminee = true; const f = finir; finir = null; f?.(); };
      video.addEventListener('ended', finVideo, { once: true }); video.addEventListener('error', finVideo, { once: true });
      passe = false;
      try {
        video.currentTime = 0; video.muted = !sons.autorise?.(); await video.play();
      } catch {
        if (j !== jeton) return false;
        // Le son refusé : le même fichier, muet (aucun second téléchargement). Une lecture refusée même muette garde l'image et les liens.
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
      const d = meta.depart;
      // La teinte de l'ambiance (film.json, mesurée au raccord) et le fondu enchaîné sur l'image fixe du départ.
      const teinte = meta.teinte?.[s.etatDuCiel?.().ambiance] || meta.teinte?.defaut || [1, 1, 1];
      if (!s.film.montrer(video, { distance: distanceDepart(d), champ: d.champ, rapport: format.largeur / format.hauteur, teinte, fondu: meta.fondu ?? 8 / 24 })) { video.pause(); phase = 'repos'; sons.rendre?.(); return false; }
      phase = 'film';
      hote?.addEventListener('pointerdown', surClic, true);
      annoncer?.(`${version === 'extrait' ? 'Extrait du film' : 'Le film'} : la pieuvre renverse le café. Échap ou un clic pour passer.`);
      await new Promise((ok) => { if (terminee || video.ended || video.error) return ok(); finir = ok; });
      finir = null; hote?.removeEventListener('pointerdown', surClic, true);
      if (j !== jeton) return true;
      // Le récepteur pose cette même image décodée en fond, puis rend la main au compositeur.
      video.pause(); scene()?.film?.figer(image);
      phase = 'fin';
      document.dispatchEvent(new CustomEvent('mt:film-fin', { detail: { fin: meta.fin, image, format, passe, version } }));
      return true;
    },
    annuler,
    // Échap : pendant l'attente, il l'annule ; pendant le film, il le passe (true : la touche est prise) ; ensuite, il laisse revenir au bureau.
    presser() { return annuler() || passer(); },
    reglerSon() { if (video) video.muted = !sons.autorise?.(); },
    // Retour au bureau, Échap final, panne : tout s'arrête, la pièce revient, le son aussi ; une attente en cours lâche son téléchargement.
    arreter() {
      const enAttente = phase === 'attente';
      ++jeton; finir?.(); finir = null;
      if (enAttente) lacher(); else video?.pause();
      if (phase !== 'repos' && !enAttente) { scene()?.film?.cacher(); sons.rendre?.(); }
      phase = 'repos';
    },
    // Pour les essais.
    etat: () => ({ phase, issue, fige: !!image && phase === 'fin', format: cle, version, source: video?.src || null, muet: video?.muted,
      lecture: video ? { t: video.currentTime, pause: video.paused, duree: video.duration } : null }),
  };
}
