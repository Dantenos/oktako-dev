// Le cerveau de la mini-pieuvre : quelle action jouer, et quand. Il ne connaît ni three.js ni le DOM : il reçoit des
// événements de la pièce, avance par pas de temps et demande une action par jouer(nom, options). Tout le rythme tient
// ici, donc tests/pieuvre-cerveau.mjs joue des heures de présence en quelques millisecondes.
//
// Ce qui la rend crédible : elle se tient tranquille. Un personnage qui s'agite en permanence fatigue en dix secondes
// et vole la vedette au contenu ; elle respire longtemps, s'occupe de temps en temps, et réagit à ce que fait le
// visiteur. Une séquence à accessoire (casque, bonnet, parapluie) se referme toujours par sa sortie : couper au milieu
// laisserait l'accessoire disparaître en plein geste.

// Le calme entre deux gestes (secondes) : ni agitée ni morte.
export const CALME = [14, 38];
// La nuit, sans aucun geste du visiteur pendant ce temps (secondes), elle s'endort.
export const SOMMEIL = 90;
// Sans nouvelle cible pendant ce temps (secondes), ses yeux lâchent le pointeur et reviennent à leur vie propre.
export const FIN_REGARD = 2.5;
// Fondus entre actions (secondes) : plus court quand elle réagit, pour que la cause et l'effet restent liés.
const FONDU = 0.3, FONDU_VIF = 0.18;
const REPOS = 'repos_respire';
// Le survol de la lettre revient souvent : elle ne la montre pas plus d'une fois dans ce temps (secondes).
const REPIT_LETTRE = 60;
// Ses occupations, jouées en repos ; le poids dit à quelle fréquence. Le clavier est une boucle, tenue un temps.
const OCCUPATIONS = [['repos_clavier', 3, 12], ['repos_de', 3], ['repos_carnet', 3], ['repos_etirer', 2], ['repos_bailler', 2], ['reaction_postit', 1]];
const SEQUENCES = {
  casque: { entree: 'casque_mettre', boucle: 'casque_ecoute', sortie: 'casque_oter', tenue: 6 },
  nuit: { entree: 'nuit_endormir', boucle: 'nuit_dormir', sortie: 'nuit_reveil', tenue: Infinity },
  pluie: { entree: 'pluie_ouvrir', boucle: 'pluie_abri', sortie: 'pluie_fermer', tenue: 7 },
};
// Une réaction par événement de la pièce. La lettre, baignée dans la cuisson, ne peut pas être poussée : la pieuvre
// la montre du bras, tournée vers elle (la lettre est à sa gauche, à droite de l'écran).
const REACTIONS = { arrivee: 'accueil_coucou', caresse: 'accueil_coucou', sucre: 'reaction_applaudir', lettre: 'guide_montrer' };

export function creerCerveau({ catalogue, jouer, hasard = Math.random }) {
  const fiche = Object.fromEntries(catalogue.actions.map((a) => [a.nom, a]));
  const e = { phase: 'repos', action: null, reste: 0, calme: 0, sequence: null, tenue: 0, attente: null, sansGeste: 0, ambiance: null, salue: false, derniere: null, regard: 0, lettre: 0 };

  const aleatoire = (a, b) => a + (b - a) * hasard();
  function lancer(nom, phase, fondu = FONDU, reste = fiche[nom].secondes) {
    e.action = nom; e.phase = phase; e.reste = reste;
    jouer(nom, { boucle: fiche[nom].boucle, fondu });
  }
  function auRepos() { e.sequence = null; lancer(REPOS, 'repos', FONDU, Infinity); e.calme = aleatoire(...CALME); }
  function occupation() {
    // Jamais deux fois le même geste de suite : c'est la répétition qui trahit la machine.
    const choix = OCCUPATIONS.filter(([n]) => n !== e.derniere), total = choix.reduce((s, c) => s + c[1], 0);
    let t = hasard() * total, pris = choix[0];
    for (const c of choix) { t -= c[1]; if (t <= 0) { pris = c; break; } }
    e.derniere = pris[0];
    lancer(pris[0], 'geste', FONDU, pris[2] || fiche[pris[0]].secondes);
  }
  function entrer(nom, direct = false) {
    const S = SEQUENCES[nom]; e.sequence = S; e.tenue = S.tenue;
    if (direct) lancer(S.boucle, 'boucle', FONDU);
    else lancer(S.entree, 'entree');
  }
  // Un événement n'attend que la fin de ce qui ne se coupe pas. Le dernier arrivé gagne : la pièce a changé entre-temps.
  function declencher(ev) {
    if (ev === 'doont') { entrer('casque', true); return; }
    if (ev === 'tonnerre') { entrer('pluie'); return; }
    lancer(REACTIONS[ev], 'reaction', FONDU_VIF);
  }
  const libre = () => e.phase === 'repos' || e.phase === 'geste';

  function suivant() {
    // L'entrée et la boucle ne se coupent pas : l'événement en attente passera après la sortie.
    if (e.attente && e.phase !== 'entree' && e.phase !== 'boucle') { const ev = e.attente; e.attente = null; declencher(ev); return; }
    const S = e.sequence;
    if (e.phase === 'entree') { lancer(S.boucle, 'boucle'); return; }
    if (e.phase === 'boucle') {
      if (e.attente || e.tenue <= 0) lancer(S.sortie, 'sortie');
      else e.reste = fiche[S.boucle].secondes; // Une boucle de plus : elle reste calée sur sa durée, sans refondu.
      return;
    }
    auRepos();
  }

  auRepos();
  return {
    // À chaque image : un pas de temps, des nombres seulement (aucune allocation, le jeu tourne des heures).
    pas(dt) {
      if (e.phase === 'fige') return;
      e.sansGeste += dt;
      if (e.regard > 0) e.regard -= dt;
      if (e.lettre > 0) e.lettre -= dt;
      if (e.phase === 'boucle') e.tenue -= dt;
      // Une boucle attend sa fin pour sortir ; le sommeil se rompt dès que le visiteur est revenu.
      if (e.phase === 'boucle' && e.sequence === SEQUENCES.nuit && e.sansGeste < 1) e.tenue = 0;
      e.reste -= dt;
      if (e.phase === 'repos') {
        e.calme -= dt;
        if (e.ambiance === 'nuit' && e.sansGeste >= SOMMEIL) entrer('nuit');
        else if (e.calme <= 0) occupation();
        return;
      }
      if (e.reste <= 0) suivant();
    },
    evenement(ev) {
      if (e.phase === 'fige') return;
      if (ev === 'arrivee') { if (e.salue) return; e.salue = true; }
      if (ev === 'lettre') { if (e.lettre > 0) return; e.lettre = REPIT_LETTRE; }
      e.sansGeste = 0;
      // Déjà à l'abri : un nouveau coup de tonnerre prolonge l'abri, il ne replie pas le parapluie pour le rouvrir.
      if (ev === 'tonnerre' && e.sequence === SEQUENCES.pluie) { e.tenue = SEQUENCES.pluie.tenue; return; }
      // Au repos ou occupée, elle lâche tout ; dans une réaction ou une séquence, l'événement attend son tour.
      if (libre()) declencher(ev); else e.attente = ev;
    },
    // Le visiteur est là (pointeur, clavier) : il compte pour le sommeil, sans rien déclencher.
    activite() { e.sansGeste = 0; },
    ambiance(a) { e.ambiance = a; },
    viser(oui) { e.regard = oui ? FIN_REGARD : 0; },
    figer(oui) {
      if (oui) { e.phase = 'fige'; e.action = null; e.sequence = null; e.attente = null; }
      else if (e.phase === 'fige') auRepos();
    },
    // Lus à chaque image par le lecteur : sans objet à allouer.
    action() { return e.action; },
    regardLibre() { return e.regard > 0 && e.phase === 'repos'; },
    etat() { return { phase: e.phase, action: e.action, regardLibre: e.regard > 0 && e.phase === 'repos', sequence: e.sequence?.boucle ?? null, attente: e.attente }; },
  };
}
