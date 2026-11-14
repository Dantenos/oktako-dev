// Le Psst de la mini-pieuvre : une fois arrivée, elle appelle, une seule fois par visite. Mesure de départ : rien ne l'annonçait, et son rouge se lit à peine sur le chêne.
// Il part dès qu'elle a été vue (survolée, ou passé TENUE) ou ouverte. La mémoire tient à la visite, pas au navigateur : la semaine prochaine, elle peut rappeler.
const CLE = 'mt-pieuvre-psst', TENUE = 8000, ECART = 8;
// Autour d'elle, par ordre de préférence : au-dessus à droite, à droite, dessous, à gauche.
const COINS = [
  (r, l, h) => [r.droite - 16, r.haut - ECART - h],
  (r, l, h) => [r.droite + ECART, (r.haut + r.bas - h) / 2],
  (r, l, h) => [r.gauche - 10, r.bas + ECART],
  (r, l, h) => [r.gauche - ECART - l, (r.haut + r.bas - h) / 2],
];
function deja() { try { return sessionStorage.getItem(CLE) === '1'; } catch { return false; } }
function noter() { try { sessionStorage.setItem(CLE, '1'); } catch { /* sans mémoire, le Psst reviendra : il ne bloque rien */ } }

export function creerPsst({ bouton, rect, ouvrir, gens }) {
  let minuteur = 0, attend = false, coin = null, ici = [0, 0], couverts = [];
  function effacer() { for (const e of couverts) delete e.dataset.psst; couverts = []; }
  bouton.addEventListener('click', () => ouvrir());
  function retirer() { clearTimeout(minuteur); attend = false; bouton.hidden = true; effacer(); }
  function placer() {
    if (attend && rect()) {
      attend = false; noter(); bouton.hidden = false;
      minuteur = setTimeout(retirer, TENUE);
    }
    if (bouton.hidden) return;
    const r = rect();
    bouton.dataset.cache = String(!r);
    if (!r) return;
    const { offsetWidth: l, offsetHeight: h } = bouton;
    // Une place se choisit à l'arrivée, puis tient tant qu'elle ne s'éloigne pas : il ne doit pas sautiller d'une image à l'autre. Au doigt, les étiquettes restent affichées et la pièce
    // est si dense qu'aucun coin n'est toujours libre : il prend le moins encombré, et s'y efface ce qu'il couvrirait, le temps qu'il est là. Le point, lui, reste.
    if (!coin || Math.hypot(r.gauche - ici[0], r.haut - ici[1]) > 12) {
      const essais = COINS.map((f) => { const [x, y] = f(r, l, h); return { f, gens: gens({ gauche: x, haut: y, droite: x + l, bas: y + h }) }; });
      const meilleur = essais.reduce((m, e) => (e.gens.length < m.gens.length ? e : m));
      coin = meilleur.f; ici = [r.gauche, r.haut];
    }
    const [x, y] = coin(r, l, h);
    bouton.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    // Relu à chaque image qu'il est là, huit secondes au plus : une étiquette peut venir sous lui après coup, celle du tiroir glisse pour s'écarter de la pieuvre.
    const sous = gens({ gauche: x, haut: y, droite: x + l, bas: y + h });
    for (const e of couverts) if (!sous.includes(e)) delete e.dataset.psst;
    for (const e of sous) e.dataset.psst = 'true';
    couverts = sous;
  }
  return {
    retirer, placer,
    // Elle est arrivée : il paraîtra à la première image où elle se voit. La mémoire ne s'écrit qu'alors, un Psst jamais montré ne compte pas.
    montrer() { if (!deja()) { attend = true; placer(); } },
  };
}
