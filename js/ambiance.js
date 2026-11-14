// Le ciel de la page (lot portfolio-ciel-vivant, 28/10) : l'heure et le fuseau du navigateur choisissent l'ambiance ;
// la météo change seule toutes les 4 min 20 s, en fondu (lot portfolio-sucre, 29/10) ; le visiteur peut tout changer
// à la main, et ce choix arrête le cycle. En mouvement réduit, rien ne change de soi-même. Le calcul vit dans js/ciel.js.
// Vie privée : AUCUNE requête tant que le visiteur n'a pas cliqué « La météo de chez vous ». Après ce clic (son
// consentement, retenu dans ce navigateur), une seule requête à Open-Meteo, pour la ville de son fuseau horaire,
// arrondie au dixième de degré ; jamais l'API de géolocalisation, jamais d'adresse IP interrogée.
import { etatDuCiel, fuseauDuNavigateur, urlOpenMeteo, meteoDuCode, CYCLE } from './ciel.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const CONSENTEMENT = 'mt-meteo-reelle';
const RELEVE = 'mt-meteo-releve';
const FRAICHEUR = 30 * 60 * 1000; // une météo reçue sert une demi-heure : pas de requête à chaque page
// Stockage refusé (navigation privée stricte) : le ciel marche, seul le choix n'est pas retenu.
const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* choix non retenu */ } };

const NOMS_AMBIANCE = { jour: 'jour', doree: 'fin d’après-midi dorée', crepuscule: 'crépuscule', nuit: 'nuit' };
const NOMS_MOMENT = { ...NOMS_AMBIANCE, aube: 'aube' };
// La tuile du ciel montre le temps qu'il fait.
const PICTOS_METEO = { degage: '☀', nuages: '☁', pluie: '☂', averse: '☂', orage: 'ϟ', brouillard: '≋', neige: '❄' };
const NOMS_METEO = { degage: 'ciel dégagé', nuages: 'nuages', pluie: 'pluie', averse: 'averse', orage: 'orage', brouillard: 'brouillard', neige: 'neige' };

export function creerAmbiance({ annoncer, son, mouvementReduit = () => false }) {
  const params = new URLSearchParams(location.search);
  // Horloge injectable (?heure=2026-12-31T23:30:00Z) : pour les essais et pour montrer une autre heure ; elle avance.
  const force = Date.parse(params.get('heure') || '');
  let decalage = Number.isFinite(force) ? force - Date.now() : 0;
  const maintenant = () => new Date(Date.now() + decalage);
  const fuseau = fuseauDuNavigateur();
  const choix = { ambiance: null, meteo: null };
  let reelle = null; // { meteo, quand } : la météo reçue d'Open-Meteo
  let scene = null, courant = null, minuteur = null, minuteurCycle = null;
  // Un choix à la main (moment ou météo) arrête le cycle : la météo reste celle du moment du choix. « Auto » sur les
  // deux lignes le relance.
  let figee = null;
  // Le module entier compte comme « dedans » : choisir une vignette ne referme pas la météo ouverte.
  const racine = $('#ciel-choix'), panneau = $('#ciel-panneau'), bouton = $('#ciel-ouvrir'), ligneEtat = $('#ciel-etat');
  const boutonReel = $('[data-ciel-reelle]');
  const meteoReellePermise = !!boutonReel;

  // Mouvement réduit : l'ambiance et la météo restent celles déjà posées (seule l'heure de l'écran avance).
  const etat = () => {
    const fixe = mouvementReduit() && courant ? courant : null;
    return etatDuCiel(maintenant(), fuseau, { ambiance: choix.ambiance || fixe?.ambiance, meteo: choix.meteo || reelle?.meteo || figee || fixe?.meteo });
  };

  function decrire(e) {
    if (!ligneEtat) return;
    const quoi = choix.ambiance ? `${NOMS_AMBIANCE[e.ambiance]} (choisie)` : `${NOMS_MOMENT[e.moment]} à ${e.heure}, d’après l’horloge de votre appareil`;
    const temps = choix.meteo ? `${NOMS_METEO[e.meteo]} (choisie)` : reelle ? `${NOMS_METEO[e.meteo]}, météo réelle (Open-Meteo)`
      : figee ? `${NOMS_METEO[e.meteo]}, figée par votre choix` : `${NOMS_METEO[e.meteo]}, change toutes les 4 min 20 s`;
    ligneEtat.textContent = `${quoi} · ${temps}.`;
  }
  function marquer() {
    $$('[data-ciel-ambiance]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.cielAmbiance === 'auto' && !choix.ambiance) || b.dataset.cielAmbiance === choix.ambiance)));
    $$('[data-ciel-meteo]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.cielMeteo === 'auto' && !choix.meteo) || b.dataset.cielMeteo === choix.meteo)));
    // Les vignettes montrent aussi le ciel en cours quand personne n'a choisi : on voit où l'on est avant de changer.
    const actuelle = etat().ambiance;
    $$('.ciel-choix [data-ciel-ambiance]').forEach((b) => { b.dataset.actuelle = String(b.dataset.cielAmbiance === actuelle); });
    const picto = $('.ciel__picto'), meteo = etat().meteo;
    if (picto) picto.textContent = PICTOS_METEO[meteo] || '☁';
    if (boutonReel) {
      const oui = lire(CONSENTEMENT) === '1';
      boutonReel.setAttribute('aria-pressed', String(oui));
      boutonReel.textContent = oui ? 'Météo de chez vous : activée (ne plus la demander)' : 'La météo de chez vous';
    }
  }
  // Applique l'état à la scène : une nouvelle ambiance ne se télécharge qu'ici, au moment d'y passer.
  async function rafraichir({ duree = 1200 } = {}) {
    const e = etat(); decrire(e); marquer();
    if (!scene) return e;
    scene.horloge(e.heure);
    if (courant && courant.ambiance === e.ambiance && courant.meteo === e.meteo && JSON.stringify(courant.speciales) === JSON.stringify(e.speciales) && courant.saison === e.saison && courant.lune.visible === e.lune.visible) return e;
    try {
      await scene.ambiance(e, { duree });
      courant = e;
    } catch (err) {
      // Un jeu de textures qui ne vient pas (réseau, ancien cache) : le panneau ne prétend pas l'avoir, le ciel reste celui qu'on voit.
      console.warn('Ambiance indisponible :', err);
      const perdue = choix.ambiance === e.ambiance;
      if (perdue) choix.ambiance = null;
      marquer();
      if (ligneEtat) ligneEtat.textContent = `${NOMS_AMBIANCE[e.ambiance]} indisponible pour le moment.`;
      annoncer(`Ciel : ${NOMS_AMBIANCE[e.ambiance]} indisponible pour le moment.`);
      return courant || e;
    }
    return e;
  }

  // Deux minuteurs calés sur l'horloge du ciel : chaque minute pile (l'heure de l'écran, le moment de la journée), et
  // chaque bord de cycle de 260 s (la météo, en fondu de 6 s).
  function planifier() {
    if (!scene) return;
    clearTimeout(minuteur); clearInterval(minuteur); clearTimeout(minuteurCycle); clearInterval(minuteurCycle);
    const tic = () => { rafraichir({ duree: 6000 }); };
    minuteur = setTimeout(() => { tic(); minuteur = setInterval(tic, 60000); }, 60000 - (maintenant().getTime() % 60000) + 50);
    minuteurCycle = setTimeout(() => { tic(); minuteurCycle = setInterval(tic, CYCLE * 1000); }, CYCLE * 1000 - (maintenant().getTime() % (CYCLE * 1000)) + 50);
  }

  // La météo réelle : une requête, après le clic seulement. Le relevé sert une demi-heure.
  async function meteoReelle() {
    const garde = JSON.parse(lire(RELEVE) || 'null');
    if (garde && Date.now() - garde.quand < FRAICHEUR && garde.fuseau === fuseau) { reelle = garde; return; }
    try {
      const r = await fetch(urlOpenMeteo(fuseau), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' });
      if (!r.ok) throw Error('HTTP ' + r.status);
      const j = await r.json();
      const code = j?.current?.weather_code;
      if (!Number.isFinite(code)) throw Error('réponse sans code météo');
      reelle = { meteo: meteoDuCode(code), quand: Date.now(), fuseau };
      ecrire(RELEVE, JSON.stringify(reelle));
    } catch (err) {
      console.warn('Météo réelle indisponible :', err);
      annoncer('Météo réelle indisponible : le ciel reste simulé.');
    }
  }

  // --- Le module : la tuile Météo ouvre le temps qu'il fait, l'état du ciel et sa note ---
  function ouvrir(oui) {
    if (!panneau) return;
    panneau.hidden = !oui; bouton.setAttribute('aria-expanded', String(oui));
    if (oui) panneau.querySelector('[aria-pressed="true"]')?.focus();
  }
  bouton?.addEventListener('click', () => ouvrir(panneau.hidden));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panneau && !panneau.hidden) { e.preventDefault(); e.stopPropagation(); ouvrir(false); bouton.focus(); } }, true);
  document.addEventListener('pointerdown', (e) => { if (panneau && !panneau.hidden && !racine.contains(e.target)) ouvrir(false); });
  function arreterOuRelancer() { figee = (choix.ambiance || choix.meteo) ? (figee || courant?.meteo || null) : null; }
  $$('[data-ciel-ambiance]').forEach((b) => b.addEventListener('click', async () => {
    choix.ambiance = b.dataset.cielAmbiance === 'auto' ? null : b.dataset.cielAmbiance; arreterOuRelancer();
    const e = await rafraichir(); if (!choix.ambiance || choix.ambiance === e.ambiance) annoncer(`Ciel : ${NOMS_AMBIANCE[e.ambiance]}.`);
  }));
  $$('[data-ciel-meteo]').forEach((b) => b.addEventListener('click', async () => {
    choix.meteo = b.dataset.cielMeteo === 'auto' ? null : b.dataset.cielMeteo; arreterOuRelancer();
    const e = await rafraichir(); annoncer(`Météo : ${NOMS_METEO[e.meteo]}.`);
  }));
  boutonReel?.addEventListener('click', async () => {
    if (lire(CONSENTEMENT) === '1') {
      // Retrait du consentement : plus de requête, le relevé gardé est effacé, le ciel redevient simulé.
      ecrire(CONSENTEMENT, null); ecrire(RELEVE, null); reelle = null;
      await rafraichir(); annoncer('Météo réelle désactivée : plus aucune requête, le ciel est simulé.'); return;
    }
    ecrire(CONSENTEMENT, '1'); choix.meteo = null;
    await meteoReelle(); await rafraichir();
    if (reelle) annoncer(`Météo de chez vous : ${NOMS_METEO[reelle.meteo]}.`);
  });

  return {
    etat, maintenant, fuseau,
    // La scène est prête : on la règle, puis on suit l'horloge (une vérification par minute, à la minute pile).
    async brancher(s) {
      scene = s;
      // Une météo DÉJÀ consentie lors d'une visite précédente : la seule requête possible sans clic sur cette page.
      if (meteoReellePermise && lire(CONSENTEMENT) === '1') await meteoReelle();
      await rafraichir({ duree: 0 });
      planifier();
    },
    // Pour les essais : l'état choisi par le visiteur, et l'application immédiate d'un réglage.
    choix: () => ({ ...choix, reelle: reelle?.meteo || null, cycleArrete: !!figee }),
    // Horloge injectable (essais, démonstration) : l'heure du ciel devient celle-ci, puis avance ; les minuteurs se
    // recalent sur elle. Le changement de cycle se vérifie ainsi sans attendre 260 s.
    async horloge(iso) { decalage = Date.parse(iso) - Date.now(); planifier(); return rafraichir({ duree: 0 }); },
    rafraichir,
    surTonnerre: () => son()?.tonnerre?.(),
  };
}
