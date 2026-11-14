// Ce que la console « Takito SYSTEM » dit et montre : SEULE source, pour l'objet 3D (scene/console-poche.js) et l'interface
// vivante (console.js). Lot portfolio-console-poche, 02/11/2026 ; choix de l'utilisateur : la maquette, écran ambre.

// Le nom sérigraphié (utilisateur, ~13 h 10), avec cette casse ; son encre : un rouge cerise profond (~13 h 12).
export const NOM_CONSOLE = { marque: 'Takito', gamme: 'SYSTEM', encre: '#8e1630' };
// Les touches (correction finale de l'utilisateur, ~13 h 08) : boutons ronds, Select et Start de l'encre du nom ; la croix
// en rouge sombre.
export const TOUCHES = { boutons: NOM_CONSOLE.encre, croix: '#4a1219', pilules: NOM_CONSOLE.encre };
// L'écran retenu : le thème ambre de la maquette (fond, ton pâle, encre, encre vive).
export const ECRAN = { theme: { fond: '#1d0f04', pale: '#6b3a10', encre: '#e89a3c', vif: '#ffd28a' } };

// Les icônes en pixels (12 × 12) : des dessins simples, aucun logo. '#' = encre.
export const DESSINS = {
  pieuvre: ['....####....', '...######...', '..########..', '..#.##.###..', '..########..', '..########..', '...######...', '..#.#..#.#..', '.#..#..#..#.', '.#.#....#.#.', '#..#....#..#', '..#......#..'],
  pave: ['............', '############', '#....#.....#', '#....#.....#', '############', '#..#.....#.#', '#..#.....#.#', '############', '#.....#....#', '#.....#....#', '############', '............'],
  viseur: ['.....##.....', '.....##.....', '...#....#...', '..#......#..', '............', '##...##...##', '##...##...##', '............', '..#......#..', '...#....#...', '.....##.....', '.....##.....'],
  mine: ['.....#......', '.#...#...#..', '..#.###.#...', '...#####....', '..###.###...', '#####.#####.', '..#######...', '...#####....', '..#.###.#...', '.#...#...#..', '.....#......', '............'],
  bulle: ['.##########.', '#..........#', '#..##..#...#', '#.#..#.#...#', '#....#.#...#', '#...#..#...#', '#..........#', '#...#..#...#', '.##########.', '...##.......', '..#.........', '............'],
  info: ['....####....', '..##....##..', '.#...##...#.', '.#........#.', '#....##....#', '#....##....#', '#....##....#', '.#...##...#.', '.#........#.', '..##....##..', '....####....', '............'],
};

// Les applis : chacune un jeu de l'utilisateur, d'après l'inventaire du lot (rapport), jamais deviné. Une appli qui ne tourne
// pas dans le navigateur ouvre une fiche (citation de sa source, capture, lien), jamais un écran vide.
// medias : sous site/console/ ; lien : 'noyau/' (Rouille), une adresse publique vérifiée, ou une destination du site (#…).
export const APPLIS = [
  { id: 'octosnake', nom: 'OctoSnake', icone: 'pieuvre', statut: 'Navigateur et Android · fiche',
    citation: 'Jeu multijoueur en ligne temps réel, dans le navigateur et sur Android.',
    texte: ['Chaque joueur est une pieuvre qui avance en continu comme un serpent ; ses tentacules grandissent quand elle mange.', 'Le même moteur sert aussi L’Argonaute, une aventure solo et coopérative, et Encre & Sang, un jeu de cartes tactiques.'],
    medias: [{ src: 'octosnake-accueil.webp', alt: 'OctoSnake au téléphone : l’écran d’accueil du jeu' }, { src: 'argonaute-accueil.webp', alt: 'L’Argonaute, écran d’accueil' }, { src: 'encre-et-sang-accueil.webp', alt: 'Encre & Sang, écran d’accueil' }] },
  { id: 'pave', nom: 'Pavé', icone: 'pave', statut: 'En chantier · fiche',
    citation: 'Tower defense de rue en vue isométrique, 3D cartoon, deux camps jouables.',
    texte: ['Three.js, modules ES, pensé pour le téléphone. Pas encore de capture publiée : elle viendra avec la prochaine version.'] },
  { id: 'doont', nom: 'DOONT', icone: 'viseur', statut: 'Jouable ici',
    citation: 'Un FPS rétro complet, écrit en Rust sans dépendance, jouable dans le navigateur.',
    texte: ['Six niveaux, lancé depuis son icône sur le bureau du noyau Rouille.'],
    medias: [{ src: 'doont.png', alt: 'DOONT_Rouille : un couloir en vue subjective' }], lien: { href: 'noyau/', libelle: 'Jouer dans Rouille' } },
  { id: 'demineur', nom: 'Démineur', icone: 'mine', statut: 'Jouable ici',
    texte: ['Le démineur du bureau Rouille, le petit système écrit en Rust qui démarre dans votre navigateur.'],
    medias: [{ src: 'rouille-bureau.png', alt: 'Le bureau du noyau Rouille et ses applis' }], lien: { href: 'noyau/', libelle: 'Ouvrir Rouille' } },
  { id: 'factarena', nom: 'FactArena', icone: 'bulle', statut: 'Projet d’équipe · fiche',
    citation: 'Jeu multijoueur de vérification des faits.',
    texte: ['Fait à cinq : NestJS, FastAPI, PostgreSQL, Docker. Il demande son serveur, il ne tourne pas dans cette console.'],
    lien: { href: 'https://github.com/Dantenos/factarena', libelle: 'Voir le dépôt', externe: true } },
  { id: 'apropos', nom: 'À propos', icone: 'info',
    texte: [`${NOM_CONSOLE.marque} ${NOM_CONSOLE.gamme} : une console de poche qui n’a jamais existé, posée au coin du bureau pour ranger mes jeux.`, 'Chaque icône est un de mes jeux. Ceux qui tournent dans le navigateur s’ouvrent ici ; les autres ont leur fiche.'] },
];
// Le dock : écrire, revoir les captures, régler l'écran.
export const DOCK = [
  { id: 'messages', nom: 'Messages', icone: 'bulle', texte: ['Une idée de jeu, une question ?'], lien: { href: '#contact', libelle: 'M’écrire' } },
  { id: 'galerie', nom: 'Galerie', icone: 'info', galerie: true },
  { id: 'reglages', nom: 'Réglages', icone: 'info', reglages: true },
];
