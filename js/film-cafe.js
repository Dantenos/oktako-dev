// Le film du café renversé (lot portfolio-cafe-renverse) : à l'impact du sucre, la pieuvre renverse la tasse. Le film est pré-rendu
// (Blender, puis le café du site incrusté à son départ) et joué DANS la scène : scene.film.montrer() le fait passer par le même
// halo, la même sortie et la même finition que la pièce cuite. Son image 0 est la vue du dessus du site : rien ne saute au départ.
//
// Rien ne se charge avant le départ du sucre. Le film n'est jamais un passage obligé : s'il manque, tarde, ou si la lecture est
// refusée, jouer() rend false et la mousse écrit la proposition comme avant. Il se joue une fois par visite ; un clic ou Échap le
// passe ; en mouvement réduit, il ne se joue pas. À la fin, sa dernière image reste à l'écran et `mt:film-fin` passe la main à la
// scène finale : cette même image et les liens dans la flaque, sans autre géométrie.
//
// Le son : la musique du site et les sons de la scène s'éteignent en fondu AVANT que l'image parte (sons.couper, une promesse),
// et reviennent au retour vers la scène (sons.rendre). Son coupé : aucune attente.
const PATIENCE_MS = 6000;   // au-delà, un visiteur sur mauvais réseau a sa proposition dans la mousse, sans attendre le film

export function distanceDepart(depart) {
  const [a, b] = [depart.position, depart.vise]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function creerFilmCafe({ adresse, scene, mouvementReduit, annoncer, sons = {} }) {
  let charge = null, meta = null, video = null, image = null, phase = 'repos', jeton = 0, vu = false, finir = null, format = null, passe = false;

  // Appelé au départ du sucre : c'est le SEUL moment où le film se télécharge.
  function charger() {
    if (!adresse || charge || mouvementReduit()) return charge;
    const base = new URL(adresse, document.baseURI);
    charge = fetch(base).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then(async (m) => {
      if (m.ambiances && !m.ambiances.includes(scene()?.etatDuCiel?.().ambiance)) return false;
      const v = document.createElement('video');
      Object.assign(v, { muted: true, playsInline: true, preload: 'auto' });
      format = innerHeight > innerWidth && m.telephone ? m.telephone : m.large;
      v.setAttribute('aria-hidden', 'true'); v.crossOrigin = 'anonymous';
      const decodage = new Promise((ok, non) => { v.addEventListener('canplaythrough', ok, { once: true }); v.addEventListener('error', () => non(new Error('vidéo')), { once: true }); });
      v.src = new URL(format.video, base).href; v.load();
      // La dernière image, décodée d'avance : c'est elle qui reste à l'écran à la fin du film, ou quand on le passe.
      const img = new Image(); img.decoding = 'async'; img.src = new URL(format.image, base).href;
      await Promise.all([img.decode(), decodage]);
      meta = m; video = v; image = img; return true;
    });
    charge.catch(() => {});
    return charge;
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
  function surClic(e) { if (phase === 'film') { e.preventDefault(); e.stopPropagation(); passer(); } }

  return {
    charger,
    get actif() { return !!adresse; },
    get phase() { return phase; },
    // Après l'impact du sucre. false : rien n'est pris, la tasse continue comme avant (film absent, en retard, refusé, déjà vu).
    async jouer({ hote, direct } = {}) {
      if (!adresse || direct || mouvementReduit() || vu) return false;
      const j = ++jeton; charger();
      const pret = await Promise.race([charge.then(Boolean, () => false), new Promise((ok) => setTimeout(() => ok(false), PATIENCE_MS))]);
      const s = scene();
      if (!pret || j !== jeton || !s?.film) return false;
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
        // Un refus du son conserve les mêmes pixels avec le repli muet. Un refus de lecture garde l'image et les liens.
        video.muted = true;
        if (format.video_muet) video.src = new URL(format.video_muet, new URL(adresse, document.baseURI)).href;
        try { await video.play(); } catch { terminee = true; }
      }
      if (j !== jeton) { video.pause(); return false; }
      if (!terminee) {
        // Pause avant le premier décodage : le rappel vidéo ne viendra plus ; l'arrêt doit aussi libérer cette attente.
        await Promise.race([premiereImage(video), new Promise((ok) => { finir = ok; })]);
        finir = null;
      }
      if (j !== jeton) { video.pause(); return false; }
      const d = meta.depart;
      // La teinte de l'ambiance (film.json, mesurée au raccord) et le fondu enchaîné sur l'image fixe du départ.
      const teinte = meta.teinte?.[s.etatDuCiel?.().ambiance] || meta.teinte?.defaut || [1, 1, 1];
      if (!s.film.montrer(video, { distance: distanceDepart(d), champ: d.champ, rapport: format.largeur / format.hauteur, teinte, fondu: meta.fondu ?? 8 / 24 })) { video.pause(); phase = 'repos'; sons.rendre?.(); return false; }
      phase = 'film'; vu = true;
      hote?.addEventListener('pointerdown', surClic, true);
      annoncer?.('La pieuvre renverse le café. Échap ou un clic pour passer.');
      await new Promise((ok) => { if (terminee || video.ended || video.error) return ok(); finir = ok; });
      finir = null; hote?.removeEventListener('pointerdown', surClic, true);
      if (j !== jeton) return true;
      // Le récepteur pose cette même image décodée en fond, puis rend la main au compositeur.
      video.pause(); scene()?.film?.figer(image);
      phase = 'fin';
      document.dispatchEvent(new CustomEvent('mt:film-fin', { detail: { fin: meta.fin, image, format, passe } }));
      return true;
    },
    // Échap : pendant le film, il le passe (true : la touche est prise) ; ensuite, il laisse revenir au bureau.
    presser() { return passer(); },
    reglerSon() { if (video) video.muted = !sons.autorise?.(); },
    // Retour au bureau, Échap final, panne : tout s'arrête, la pièce revient, le son aussi.
    arreter() {
      ++jeton; finir?.(); finir = null;
      if (video) video.pause();
      if (phase !== 'repos') { scene()?.film?.cacher(); sons.rendre?.(); }
      phase = 'repos';
    },
    // Pour les essais.
    etat: () => ({ phase, vu, fige: !!image && phase === 'fin', format: format === meta?.telephone ? 'telephone' : 'large', source: video?.src, muet: video?.muted, lecture: video ? { t: video.currentTime, pause: video.paused, duree: video.duration } : null }),
  };
}
