// La mesure d'audience (lot mesure-audience, docs/MESURE-AUDIENCE.md) : trois signaux, et rien qui désigne le visiteur.
// - « visite » au chargement de la page (pas au rechargement ni au retour arrière : sans identifiant ni stockage, c'est ainsi
//   qu'une même personne n'est pas comptée deux fois en appuyant sur F5) ;
// - « question » quand une question part vers la pieuvre (la bulle le dit par l'événement `mt:question`) ;
// - « reserver » au clic sur le lien du rendez-vous, où qu'il soit dans la page.
// Chaque signal porte la provenance de CE chargement : les paramètres utm_* du lien suivi, ou le site d'où l'on vient réduit
// à un seau (« instagram », « moteur »…), jamais l'adresse entière. Les utm_* sont ensuite retirés de la barre d'adresse :
// un lien recopié ou partagé ne porte pas la campagne d'un autre, et un rechargement ne la redit pas.
// Ni cookie, ni stockage local, ni identifiant : ce script n'écrit rien dans le navigateur. Do Not Track ou Global Privacy
// Control : il ne fait rien du tout (le collecteur ignore aussi ces navigateurs, au cas où une ancienne page resterait en cache).
(() => {
  const script = document.currentScript;
  if (!script) return;
  const { collecteur, page, rendezVous } = script.dataset;
  const refus = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  if (refus || !collecteur) return;

  // Le même vocabulaire que le collecteur ([a-z0-9-], 32 caractères) : une valeur hors forme part comme « autre », jamais telle quelle.
  const mot = (v) => (!v ? '' : /^[a-z0-9-]{1,32}$/.test(v.toLowerCase()) ? v.toLowerCase() : 'autre');
  // Seaux de provenance : les mêmes que campagnes.json du collecteur (tests/mesure.mjs les compare).
  const SEAUX = { 'instagram.com': 'instagram', 'linkedin.com': 'linkedin', 'lnkd.in': 'linkedin', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
    'tiktok.com': 'tiktok', 'facebook.com': 'facebook', 'google.com': 'moteur', 'google.fr': 'moteur', 'bing.com': 'moteur',
    'duckduckgo.com': 'moteur', 'qwant.com': 'moteur', 'ecosia.org': 'moteur', 'github.com': 'github' };
  function provenance() {
    let hote;
    try { hote = new URL(document.referrer).hostname; } catch { return 'aucune'; }
    if (hote === location.hostname) return 'interne';
    const suffixe = Object.keys(SEAUX).find((s) => hote === s || hote.endsWith('.' + s));
    return suffixe ? SEAUX[suffixe] : 'autre';
  }

  const adresse = new URL(location.href), q = adresse.searchParams;
  const origine = { s: mot(q.get('utm_source')), m: mot(q.get('utm_medium')), c: mot(q.get('utm_campaign')), k: mot(q.get('utm_content')), r: provenance() };
  const utm = [...q.keys()].filter((k) => k.startsWith('utm_'));
  if (utm.length) {
    for (const k of utm) q.delete(k);
    const reste = q.toString();
    try { history.replaceState(history.state, '', adresse.pathname + (reste ? `?${reste}` : '') + adresse.hash); } catch { /* adresse figée : sans gravité */ }
  }

  const envoyer = (e, plus) => {
    try {
      // text/plain, sans en-tête ajouté : une requête simple, sans contrôle préalable. keepalive : le clic sur le rendez-vous
      // quitte la page, le signal part quand même. credentials omis : aucun cookie, même si le domaine en avait un.
      fetch(`${collecteur}/mesure`, { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ v: 1, e, p: page, ...origine, ...plus }) }).catch(() => {});
    } catch { /* la mesure ne casse jamais la page */ }
  };

  const navigation = performance.getEntriesByType?.('navigation')?.[0]?.type;
  if (navigation !== 'reload' && navigation !== 'back_forward') envoyer('visite');

  let cible = null;
  try { cible = rendezVous ? new URL(rendezVous) : null; } catch { /* adresse absente : aucun clic à compter */ }
  const versRendezVous = (a) => {
    if (!cible || !a) return false;
    try { const u = new URL(a.href, location.href); return u.origin === cible.origin && u.pathname.replace(/\/$/, '') === cible.pathname.replace(/\/$/, ''); } catch { return false; }
  };
  const clic = (ev) => { if (ev.type === 'auxclick' && ev.button !== 1) return; if (versRendezVous(ev.target.closest?.('a[href]'))) envoyer('reserver'); };
  // En capture : un gestionnaire de la page qui arrêterait le clic (la flaque, la bulle) ne le cache pas à la mesure.
  document.addEventListener('click', clic, true);
  document.addEventListener('auxclick', clic, true);
  document.addEventListener('mt:question', (ev) => envoyer('question', { i: ev.detail?.voie === 'ia' ? 'ia' : 'locale' }));
})();
