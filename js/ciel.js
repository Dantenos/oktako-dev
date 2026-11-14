// Le ciel derrière la fenêtre, calculé ICI, sans réseau ni autorisation (lot portfolio-ciel-vivant, 28/10).
// Module pur (ni DOM ni three.js) : la page, la scène et les essais Node l'appellent avec une horloge injectée.
// Ce qu'il sait du visiteur : l'heure et le fuseau horaire que son navigateur annonce (Intl), rien d'autre. Le fuseau
// donne une ville par zone (table ci-dessous) : de quoi placer le soleil, jamais de quoi situer quelqu'un.

// Une ville par fuseau, coordonnées arrondies au dixième de degré (≈ 10 km) : c'est la position de la ville
// principale du fuseau, pas celle du visiteur. Fuseau absent de la table : Europe/Paris.
export const FUSEAUX = {
  'Europe/Paris': [48.9, 2.4], 'Europe/Brussels': [50.8, 4.4], 'Europe/Luxembourg': [49.6, 6.1], 'Europe/Monaco': [43.7, 7.4],
  'Europe/Zurich': [47.4, 8.5], 'Europe/London': [51.5, -0.1], 'Europe/Dublin': [53.3, -6.3], 'Europe/Lisbon': [38.7, -9.1],
  'Europe/Madrid': [40.4, -3.7], 'Europe/Rome': [41.9, 12.5], 'Europe/Berlin': [52.5, 13.4], 'Europe/Amsterdam': [52.4, 4.9],
  'Europe/Vienna': [48.2, 16.4], 'Europe/Prague': [50.1, 14.4], 'Europe/Warsaw': [52.2, 21.0], 'Europe/Copenhagen': [55.7, 12.6],
  'Europe/Stockholm': [59.3, 18.1], 'Europe/Oslo': [59.9, 10.8], 'Europe/Helsinki': [60.2, 24.9], 'Europe/Athens': [38.0, 23.7],
  'Europe/Bucharest': [44.4, 26.1], 'Europe/Budapest': [47.5, 19.0], 'Europe/Istanbul': [41.0, 29.0], 'Europe/Kyiv': [50.5, 30.5],
  'Europe/Moscow': [55.8, 37.6], 'Atlantic/Reykjavik': [64.1, -21.9], 'Atlantic/Canary': [28.1, -15.4], 'Atlantic/Azores': [37.7, -25.7],
  'Africa/Casablanca': [33.6, -7.6], 'Africa/Algiers': [36.8, 3.1], 'Africa/Tunis': [36.8, 10.2], 'Africa/Cairo': [30.0, 31.2],
  'Africa/Dakar': [14.7, -17.4], 'Africa/Abidjan': [5.3, -4.0], 'Africa/Lagos': [6.5, 3.4], 'Africa/Douala': [4.0, 9.7],
  'Africa/Kinshasa': [-4.3, 15.3], 'Africa/Nairobi': [-1.3, 36.8], 'Africa/Johannesburg': [-26.2, 28.0], 'Indian/Reunion': [-20.9, 55.5],
  'Indian/Mauritius': [-20.2, 57.5], 'Indian/Mayotte': [-12.8, 45.2], 'Asia/Dubai': [25.2, 55.3], 'Asia/Tehran': [35.7, 51.4],
  'Asia/Karachi': [24.9, 67.0], 'Asia/Kolkata': [22.6, 88.4], 'Asia/Calcutta': [22.6, 88.4], 'Asia/Dhaka': [23.8, 90.4],
  'Asia/Bangkok': [13.8, 100.5], 'Asia/Ho_Chi_Minh': [10.8, 106.7], 'Asia/Singapore': [1.3, 103.8], 'Asia/Jakarta': [-6.2, 106.8],
  'Asia/Shanghai': [31.2, 121.5], 'Asia/Hong_Kong': [22.3, 114.2], 'Asia/Taipei': [25.0, 121.6], 'Asia/Seoul': [37.6, 127.0],
  'Asia/Tokyo': [35.7, 139.7], 'Asia/Manila': [14.6, 121.0], 'Asia/Jerusalem': [31.8, 35.2], 'Asia/Beirut': [33.9, 35.5],
  'Asia/Riyadh': [24.7, 46.7], 'Australia/Perth': [-31.9, 115.9], 'Australia/Adelaide': [-34.9, 138.6], 'Australia/Brisbane': [-27.5, 153.0],
  'Australia/Sydney': [-33.9, 151.2], 'Australia/Melbourne': [-37.8, 145.0], 'Pacific/Auckland': [-36.8, 174.8], 'Pacific/Noumea': [-22.3, 166.5],
  'Pacific/Tahiti': [-17.5, -149.6], 'Pacific/Honolulu': [21.3, -157.9], 'America/Anchorage': [61.2, -149.9], 'America/Los_Angeles': [34.1, -118.2],
  'America/Vancouver': [49.3, -123.1], 'America/Denver': [39.7, -105.0], 'America/Phoenix': [33.4, -112.1], 'America/Chicago': [41.9, -87.6],
  'America/Mexico_City': [19.4, -99.1], 'America/New_York': [40.7, -74.0], 'America/Toronto': [43.7, -79.4], 'America/Montreal': [45.5, -73.6],
  'America/Halifax': [44.6, -63.6], 'America/St_Johns': [47.6, -52.7], 'America/Bogota': [4.7, -74.1], 'America/Lima': [-12.0, -77.0],
  'America/Caracas': [10.5, -66.9], 'America/Santiago': [-33.4, -70.7], 'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'America/Sao_Paulo': [-23.6, -46.6],
  'America/Martinique': [14.6, -61.1], 'America/Guadeloupe': [16.2, -61.5], 'America/Cayenne': [4.9, -52.3], 'America/Miquelon': [47.1, -56.4],
};
export const FUSEAU_DEFAUT = 'Europe/Paris';
export const coordonneesDuFuseau = (fuseau) => FUSEAUX[fuseau] || FUSEAUX[FUSEAU_DEFAUT];

// --- Le soleil : élévation par les formules de la NOAA (précision de l'ordre de la minute, largement assez) ---
const RAD = Math.PI / 180;
function jourJulien(date) { return date.getTime() / 86400000 + 2440587.5; }
export function elevationSoleil(date, lat, lon) {
  const T = (jourJulien(date) - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * RAD);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos((125.04 - 1934.136 * T) * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan(eps * RAD / 2) ** 2;
  const eqTemps = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const minutesUTC = (date.getTime() / 60000) % 1440;
  const tempsSolaire = ((minutesUTC + eqTemps + 4 * lon) % 1440 + 1440) % 1440;
  const angleHoraire = tempsSolaire / 4 - 180; // négatif le matin, positif l'après-midi
  const cosZ = Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(angleHoraire * RAD);
  return { elevation: 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD, matin: angleHoraire < 0 };
}

// Cinq moments, tirés de la hauteur du soleil (donc du lever et du coucher du jour et du lieu) :
// nuit sous −6° (fin du crépuscule civil) ; aube et crépuscule entre −6° et +2° ; dorée l'après-midi sous +10° ;
// jour au-dessus. La matinée basse reste « jour » : l'heure dorée du site est celle de la fin d'après-midi.
export const SEUILS = { nuit: -6, bas: 2, dore: 10 };
export function momentDuSoleil({ elevation, matin }) {
  if (elevation < SEUILS.nuit) return 'nuit';
  if (elevation < SEUILS.bas) return matin ? 'aube' : 'crepuscule';
  if (!matin && elevation < SEUILS.dore) return 'doree';
  return 'jour';
}
// Les ambiances cuites dans Blender : l'aube emprunte l'heure bleue du crépuscule (même ciel, lampe allumée).
export const AMBIANCE_DU_MOMENT = { aube: 'crepuscule', jour: 'jour', doree: 'doree', crepuscule: 'crepuscule', nuit: 'nuit' };
export const AMBIANCES = ['nuit', 'jour', 'doree', 'crepuscule'];

// La date et l'heure locales du visiteur, dans SON fuseau (la page peut être ouverte n'importe où).
export function dateLocale(date, fuseau) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const jours = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour, minute: +p.minute, semaine: jours[p.weekday] };
}

// Saisons météorologiques (mois entiers), inversées dans l'hémisphère sud.
export function saison({ mois }, lat) {
  const nord = ['hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'ete', 'ete', 'ete', 'automne', 'automne', 'automne', 'hiver'][mois - 1];
  if (lat >= 0) return nord;
  return { hiver: 'ete', ete: 'hiver', printemps: 'automne', automne: 'printemps' }[nord];
}

// Les dates qui comptent ici. La Braderie de Lille tient le premier week-end de septembre : le premier samedi
// du mois et le dimanche qui le suit (1er septembre un dimanche : la Braderie est le week-end suivant).
export function datesSpeciales({ mois, jour, semaine }) {
  // Le samedi de ce week-end (aujourd'hui, ou la veille si l'on est dimanche) ; null en semaine.
  const samedi = semaine === 6 ? jour : semaine === 0 ? jour - 1 : null;
  return {
    decembre: mois === 12,
    feux: (mois === 12 && jour === 31) || (mois === 1 && jour === 1),
    braderie: mois === 9 && samedi !== null && samedi >= 1 && samedi <= 7,
  };
}

// La lune : âge dans la lunaison depuis la nouvelle lune de référence (6 janvier 2000, 18 h 14 UTC).
const LUNAISON = 29.530588853;
export function lune(date) {
  const age = (((jourJulien(date) - 2451550.25972) % LUNAISON) + LUNAISON) % LUNAISON;
  return { age, eclairee: (1 - Math.cos(2 * Math.PI * age / LUNAISON)) / 2, croissante: age < LUNAISON / 2 };
}

// --- La météo ---
export const METEOS = ['degage', 'nuages', 'pluie', 'averse', 'orage', 'brouillard', 'neige'];
// Météo simulée, sans réseau, en CYCLE (décision de l'utilisateur, 29/10, 10 h 55 : « changeons la météo toutes les
// 4 minutes 20 secondes ») : chaque tranche de 260 s de l'horloge tire son temps, le même pour tous les visiteurs au même
// instant, vraisemblable pour la saison. Pluie RARE (10 h 40 : « météo pluvieuse rare ») : ciel dégagé ou nuageux le
// plus souvent, environ un cycle de pluie sur dix, l'orage très rare, la neige seulement l'hiver.
// tests/ciel.mjs plafonne la pluie (pluie, averse, orage) à 15 % de 1 000 cycles, dans chaque saison.
export const CYCLE = 260;
const POIDS = {
  hiver: { nuages: 40, degage: 26, brouillard: 14, neige: 8, pluie: 9, averse: 2, orage: 1 },
  printemps: { degage: 46, nuages: 40, pluie: 7, averse: 3, brouillard: 3, orage: 1, neige: 0 },
  ete: { degage: 56, nuages: 32, pluie: 6, averse: 2, orage: 2, brouillard: 2, neige: 0 },
  automne: { nuages: 42, degage: 32, brouillard: 12, pluie: 9, averse: 3, orage: 2, neige: 0 },
};
function hachage(texte) { let h = 2166136261; for (const c of texte) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// Brassage final (fmix32 de MurmurHash3) : FNV seul donne des graines voisines pour des numéros voisins, et des séries
// entières trop pluvieuses.
function brasser(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
// Le numéro du cycle de 260 s auquel appartient cet instant (temps universel : le même partout).
export const numeroDeCycle = (date) => Math.floor(date.getTime() / (CYCLE * 1000));
export function meteoSimulee(cycle, sais) {
  const graine = brasser(hachage(`cycle-${cycle}`)) / 4294967296;
  const p = POIDS[sais]; const total = Object.values(p).reduce((s, x) => s + x, 0);
  let r = graine * total;
  for (const [m, w] of Object.entries(p)) { if ((r -= w) < 0) return m; }
  return 'nuages';
}
// Codes météo de l'OMM (WMO 4677), tels qu'Open-Meteo les donne dans `weather_code`.
export function meteoDuCode(code) {
  if (code <= 1) return 'degage';
  if (code <= 3) return 'nuages';
  if (code === 45 || code === 48) return 'brouillard';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neige';
  if (code >= 95) return 'orage';
  if (code === 65 || code === 67 || code === 82) return 'averse';
  if ((code >= 51 && code <= 64) || code === 66 || (code >= 80 && code <= 81)) return 'pluie';
  return 'nuages';
}
// La seule requête que le site sait faire vers un autre site, et seulement après le clic : la ville du fuseau,
// arrondie au dixième (jamais la position du visiteur), le code météo du moment, rien d'autre (ni clé, ni cookie).
export const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
export function urlOpenMeteo(fuseau) {
  const [lat, lon] = coordonneesDuFuseau(fuseau);
  return `${OPEN_METEO}?latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}&current=weather_code`;
}

// --- Les éclairs : doux, rares, sous les seuils de la photosensibilité ---
// WCAG 2.3.1 : pas plus de trois éclats par seconde. Ici, au plus UN éclat (une montée, une descente douce) tous les
// ECLAIR.ecart secondes au minimum, et jamais plus qu'un voile (ECLAIR.max) sur l'image.
export const ECLAIR = { ecart: 7, etendue: 9, montee: 0.12, descente: 0.9, max: 0.32 };
// Instants des éclairs (secondes) sur une durée, depuis une graine : écart minimum garanti par construction.
export function planEclairs(graine, duree) {
  const t = []; let x = (hachage(String(graine)) % 1000) / 1000, s = 2 + x * 3;
  while (s < duree) { t.push(s); x = (x * 9301 + 0.49297) % 1; s += ECLAIR.ecart + x * ECLAIR.etendue; }
  return t;
}
// Intensité à l'instant t d'un éclair né en t0 : montée brève puis extinction exponentielle, sans rebond.
export function eclat(t, t0) {
  const d = t - t0;
  if (d < 0 || d > ECLAIR.montee + ECLAIR.descente * 4) return 0;
  return ECLAIR.max * (d < ECLAIR.montee ? d / ECLAIR.montee : Math.exp(-(d - ECLAIR.montee) / ECLAIR.descente * 2.5));
}

// --- L'état complet du ciel pour un instant ---
// choix : { ambiance?: 'nuit'|'jour'|'doree'|'crepuscule', meteo?: une des METEOS } — le sélecteur du visiteur,
// ou la météo réelle reçue après son clic ; le reste suit l'horloge.
export function etatDuCiel(date, fuseau, choix = {}) {
  const [lat, lon] = coordonneesDuFuseau(fuseau);
  // L'heure affichée est celle du fuseau du visiteur, même hors de la table ; le soleil, celui de la ville du fuseau.
  const zone = validerFuseau(fuseau) ? fuseau : FUSEAU_DEFAUT;
  const local = dateLocale(date, zone);
  const soleil = elevationSoleil(date, lat, lon);
  const moment = momentDuSoleil(soleil);
  const sais = saison(local, lat);
  const ambiance = AMBIANCES.includes(choix.ambiance) ? choix.ambiance : AMBIANCE_DU_MOMENT[moment];
  const cycle = numeroDeCycle(date);
  const meteo = METEOS.includes(choix.meteo) ? choix.meteo : meteoSimulee(cycle, sais);
  const lu = lune(date);
  return {
    zone, local, moment, ambiance, meteo, cycle, saison: sais, speciales: datesSpeciales(local), soleil: soleil.elevation,
    lune: { ...lu, visible: ambiance === 'nuit' || ambiance === 'crepuscule' },
    // La pièce répond : la lampe s'allume au crépuscule, l'écran luit plus fort la nuit, la vapeur se voit en hiver.
    piece: { lampe: ambiance === 'nuit' || ambiance === 'crepuscule', ecran: { nuit: 1, crepuscule: 0.9, doree: 0.72, jour: 0.62 }[ambiance], vapeur: sais === 'hiver' ? 1.8 : sais === 'automne' ? 1.2 : 1 },
    heure: `${String(local.heure).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
  };
}
function validerFuseau(f) { try { new Intl.DateTimeFormat('en', { timeZone: f }); return true; } catch { return false; } }
export function fuseauDuNavigateur() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || FUSEAU_DEFAUT; } catch { return FUSEAU_DEFAUT; } }
