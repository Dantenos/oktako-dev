// La mémoire de la mini-pieuvre : une recherche BM25 maison, sans dépendance ni réseau. Ce module est pur : le build
// l'emploie pour calculer l'index (tools/pieuvre-index.mjs), le navigateur pour y chercher. Les mêmes mots des deux
// côtés, donc : une racine calculée autrement au build ne se retrouverait jamais à la lecture.
export const VERSION_INDEX = 1;
// Au-delà, on ne lit plus la question : personne ne pose 200 caractères à une bulle, et le coût resterait borné.
export const LONGUEUR_QUESTION = 200;

// Les réglages usuels de BM25 ; b reste bas parce que les passages sont déjà courts et de longueurs voisines.
const K1 = 1.2, B = 0.6;
// La part de la question, pesée par la rareté de ses mots, que le site doit couvrir. C'est ce seuil qui fait dire « je
// ne sais pas » : « coder en Java » a le mot commun, pas le mot rare, et un hors-sujet ne s'habille pas d'un passage voisin.
const SEUIL = 0.55;
// Un passage bien moins pertinent que le premier n'apporte rien : trois réponses au plus, et de vraies réponses.
const PART_DU_PREMIER = 0.4, MAXIMUM = 3;
// Un passage des rubriques du profil pèse double : une préférence, pas un filtre. Le recruteur qui demande un service a sa réponse.
const PREFERENCE = 2;

// Mots outils, formules de question et nom du propriétaire : ils sont partout, ils ne disent pas ce qui est demandé.
const VIDES = new Set(`a ai as au aux avec avez avoir bien bonjour c ca ce ceci cela celui ces cet cette chose choses comment d dans de des dire dis dit
donne donnez du elle elles en es est et etes etre explique expliquez fais faire fait faites font il ils j je l la le les leur leurs lui m ma me merci mes moi
mon n ne nous on ont ou par parle parlez parler pas peut peux plus pour pourquoi pouvez pourrais pourriez puis qu quand que quel quelle quelles quels quelque
qui quoi s sa sait salut sans savez savoir se ses si son sont suis sur t ta te tes toi ton tous tout toute toutes tres tu un une vos votre voudrais vous veux
y edouard lantenois majortakito utilise utilises utilisez utiliser ete etait deja cherche cherchez chercher fonctionne marche existe existent travail the of and`.split(/\s+/));
// Les fins françaises les plus productives : assez pour rapprocher « automatiser » d'« automatisations », pas plus.
const FINS = ['ations', 'ation', 'ements', 'ement', 'ments', 'ment', 'euses', 'euse', 'eurs', 'eur', 'ees', 'ee', 'es', 'er', 'ez', 'e', 's', 'x'];

export const normaliser = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/œ/g, 'oe');
export function racine(m) {
  if (/\d/.test(m)) return m;
  if (m.length < 5) return m.length > 3 ? m.replace(/[sx]$/, '') : m;
  for (const f of FINS) if (m.endsWith(f) && m.length - f.length >= 4) return m.slice(0, -f.length);
  return m;
}
// C et C++ sont des langages : « c » ne tombe pas avec les élisions, qui ont déjà perdu leur apostrophe ici.
export function tokens(texte) {
  const propre = normaliser(texte).replace(/\b(?:[cdjlmnst]|qu)'/g, ' ');
  return (propre.match(/[a-z0-9]+(?:\+\+|#)?/g) || []).filter((m) => m === 'c' || !VIDES.has(m)).filter((m) => m.length > 1 || m === 'c').map(racine);
}

// { passages, termes: { racine: [passage, occurrences, passage, occurrences…] }, longueurs, moyenne, synonymes, ton }.
export function construireIndex(passages, { synonymes = {}, ton = {}, profils = {} } = {}) {
  const termes = {}, longueurs = [];
  passages.forEach((p, i) => {
    // Le titre compte double : une fiche qui porte le mot en titre parle de lui, plus qu'une ligne qui le cite. La rubrique
    // compte autant : « parcours » doit trouver les lignes de la frise, qui ne redisent pas ce mot, avant une ligne qui le cite.
    const mots = [...tokens(p.t), ...tokens(p.t), ...tokens(p.l || ''), ...tokens(p.l || ''), ...tokens(p.x)], compte = new Map();
    for (const m of mots) compte.set(m, (compte.get(m) || 0) + 1);
    longueurs.push(mots.length);
    for (const [m, n] of compte) (termes[m] ||= []).push(i, n);
  });
  const syn = {};
  for (const [mot, formes] of Object.entries(synonymes)) for (const cle of tokens(mot)) syn[cle] = [...new Set([...(syn[cle] || []), ...formes.flatMap(tokens)])];
  const moyenne = longueurs.reduce((s, n) => s + n, 0) / (longueurs.length || 1);
  return { version: VERSION_INDEX, passages, termes, longueurs, moyenne: +moyenne.toFixed(3), synonymes: syn, ton, profils };
}

// profil : un id de ix.profils, ou rien. Rend { passages, raison } : raison vaut 'vide' (rien à chercher dans la question), 'rien' (le site ne le dit pas), ou null.
export function chercher(ix, question, { profil } = {}) {
  const mots = [...new Set(tokens(String(question).slice(0, LONGUEUR_QUESTION)))];
  if (!mots.length) return { passages: [], raison: 'vide' };
  const N = ix.passages.length, idf = (df) => Math.log(1 + (N - df + 0.5) / (df + 0.5)), inconnu = idf(0);
  const scores = new Float64Array(N);
  let poidsTotal = 0, poidsTrouve = 0;
  for (const m of mots) {
    const formes = [m, ...(ix.synonymes[m] || [])].filter((f) => ix.termes[f]);
    const poids = formes.length ? Math.max(...formes.map((f) => idf(ix.termes[f].length / 2))) : inconnu;
    poidsTotal += poids;
    if (!formes.length) continue;
    poidsTrouve += poids;
    // Un mot et ses synonymes ne s'additionnent pas : chaque mot de la question vote une fois par passage.
    const local = new Map();
    for (const f of formes) {
      const liste = ix.termes[f], w = idf(liste.length / 2);
      for (let i = 0; i < liste.length; i += 2) {
        const d = liste[i], tf = liste[i + 1], s = w * tf * (K1 + 1) / (tf + K1 * (1 - B + B * ix.longueurs[d] / ix.moyenne));
        if (s > (local.get(d) || 0)) local.set(d, s);
      }
    }
    for (const [d, s] of local) scores[d] += s;
  }
  const couverture = poidsTrouve / poidsTotal;
  if (couverture < SEUIL) return { passages: [], raison: 'rien' };
  const rubriques = ix.profils?.[profil];
  if (rubriques) for (let d = 0; d < N; d++) if (scores[d] && rubriques.some((r) => ix.passages[d].a?.startsWith(r))) scores[d] *= PREFERENCE;
  const rang = [...scores.keys()].filter((d) => scores[d] > 0).sort((a, b) => scores[b] - scores[a]);
  if (!rang.length) return { passages: [], raison: 'rien' };
  const seuil = scores[rang[0]] * PART_DU_PREMIER, vus = new Set();
  const passages = rang.filter((d) => scores[d] >= seuil).map((d) => ix.passages[d])
    // Sans ancre, pas de réponse : un passage qu'on ne peut pas aller relire n'est pas une source.
    .filter((p) => p.a)
    .filter((p) => !vus.has(p.x) && vus.add(p.x))
    // Règle de l'utilisateur : le code d'abord, la presse jamais en tête. Le tri est stable : le rang tient dans chaque groupe.
    .sort((a, b) => (a.p ? 1 : 0) - (b.p ? 1 : 0))
    .slice(0, MAXIMUM);
  return { passages, raison: passages.length ? null : 'rien' };
}
