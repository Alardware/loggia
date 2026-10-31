/* ── Le confort d'une pièce, sans React (ADR 0039) ──────────────────────────
 *
 * Quatre mesures au plus — température, humidité, CO₂, bruit —, chacune avec
 * son verdict, et un indice sur 100 qui les résume. Une mesure que la pièce
 * n'a pas ne compte pas et ne s'affiche pas : l'indice se calcule sur ce qui
 * existe, et sans aucune mesure il n'y a pas d'indice.
 *
 * UNE SEULE TABLE DE SEUILS. La barre de la pièce, sa fiche (`FICHE_CONFORT()`,
 * App.jsx), les cartes des capteurs et leur jauge lisent les paliers d'ici :
 * ils ne peuvent pas se contredire. Ce sont ceux des captures Netatmo fournies
 * le 19/09 (« les valeurs sont inscrites sur les photos ») : bornes et
 * couleurs.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec
 * (tests/pieces_confort.test.mjs).
 */
import { tr, trSens, locale } from './i18n.js';
import { deCelsius, deKmh, versCelsius, versKmh, signeTemp, uniteCo, versPpmCo, dePpmCo } from './unites.js';

const OK = 'var(--o-ok)', DOUX = 'var(--o-accent-soft)', BLEU = 'var(--o-cold)';
const AMBRE = 'var(--o-warn)', ORANGE = 'var(--o-warn2)', ROUGE = 'var(--o-bad)';
const VIOLET = 'var(--o-purple)', DORE = 'var(--o-gold)', CYAN = 'var(--o-cyan)';

/* Un palier : [borne, mot, couleur]. La borne est EXCLUE (« < 15 »), sauf
 * `inclus` (« ≤ 23 : idéal »). Le dernier palier n'a pas de borne. Les mots
 * sont des littéraux : le catalogue les retrouve. « Froid » et « Sec » passent
 * par `trSens` (audit du 03/10) : leurs clés nues sont aussi les MODES d'une
 * climatisation, et l'allemand lisait « Kühlen » (refroidir) sous 16 °C,
 * « Trocknen » (sécher) sur la jauge d'humidité. Le CO₂ aussi (05/10) : sous
 * « Qualité de l'air », « High », « Hoch » ou « Alto » se lisaient « bonne
 * qualité » au palier même où il faut aérer. Ses mots y disent la QUALITÉ
 * (« Poor », « Mala ») et s'accordent (« Buena », « Media ») ; le « Bon » de
 * la température et de l'humidité, l'« Élevé » du robot gardent leur clé nue.
 * Le dernier palier aussi (05/10, suite) : « Viziato », masculin, ne
 * s'accordait ni à « qualità » ni à « aria » ; « Cargado » allait à « aire »,
 * pas à « calidad » comme « Buena » et « Mala » — « Viziata », « Cargada » ;
 * les autres langues recopient leur « Confiné », que le français lit nu.
 *
 * Les bornes et les couleurs des captures : le bleu, c'est l'idéal ; puis le
 * vert, le jaune (ambre), l'orange et le rouge à mesure qu'on s'en éloigne —
 * des deux côtés pour la température et l'humidité. */
const PALIERS = {
  temp: () => [[15, tr('Trop froid'), ROUGE], [16, trSens('Froid · ressenti'), ORANGE], [17, tr('Frais'), AMBRE], [18, tr('Bon'), OK], [23, tr('Idéal'), BLEU, true], [26, tr('Bon'), OK, true], [27, tr('Un peu chaud'), AMBRE, true], [29, tr('Chaud'), ORANGE, true], [null, tr('Trop chaud'), ROUGE]],
  hum: () => [[15, tr('Très sec'), ROUGE], [20, tr('Trop sec'), ORANGE], [30, trSens('Sec · ressenti'), AMBRE], [40, tr('Bon'), OK], [50, tr('Idéal'), BLEU, true], [60, tr('Bon'), OK, true], [70, tr('Humide'), AMBRE, true], [80, tr('Trop humide'), ORANGE, true], [null, tr('Très humide'), ROUGE]],
  co2: () => [[900, tr('Excellent'), BLEU], [1150, trSens('Bon · air'), OK], [1400, trSens('Moyen · air'), AMBRE], [1600, trSens('Élevé · air'), ORANGE], [null, trSens('Confiné · air'), ROUGE]],
  bruit: () => [[50, tr('Calme'), BLEU], [65, tr('Modéré'), OK], [70, tr('Animé'), AMBRE], [80, tr('Bruyant'), ORANGE], [null, tr('Très bruyant'), ROUGE]],
  /* Les familles NOUVELLES (chantier Capteurs, § 6 ; C3) prennent les mots de
   * sa maquette « Cartes capteurs » — les quatre d'avant gardent les leurs.
   * Les particules (µg/m³) et les COV (un INDICE, de 0 à 500) disent une
   * qualité d'air, comme le CO₂ : leurs mots passent par les mêmes clés de
   * contexte. Aucune lumière n'est « mauvaise » : violet, or et cyan disent
   * où l'on est, la carte ne se colore jamais (`TOUJOURS_BONNES`). */
  lux: () => [[50, tr('Sombre'), VIOLET], [300, tr('Tamisé'), DORE], [null, tr('Lumineux'), CYAN]],
  pm25: () => [[10, trSens('Bon · air'), OK], [25, trSens('Moyen · air'), AMBRE], [null, trSens('Mauvais · air'), ROUGE]],
  cov: () => [[150, trSens('Bon · air'), OK], [250, trSens('Moyen · air'), AMBRE], [null, trSens('Mauvais · air'), ROUGE]],
  vent: () => [[20, tr('Calme'), OK], [50, tr('Venteux'), BLEU], [null, tr('Fort'), ROUGE]],
  /* Le monoxyde de carbone en ppm (audit du 19/10, H10) : sous 9 ppm, la norme de l'EPA sur huit heures, l'air est bon ;
   * jusqu'à 35 ppm COMPRIS, sa norme d'une heure, il faut aérer ; AU-DELÀ, un danger — la carte Sécurité de Maison le dit aussi
   * (`coDanger`), et la veille du serveur prévient le téléphone au même chiffre (`SEUIL_CO`, veilles.py). Ce sont les normes
   * américaines (NAAQS) ; l'OMS, elle, dit 10 mg/m³ sur 8 h et 35 mg/m³ sur 1 h — environ 9 et 31 ppm (G1-D6, 30/10 : le
   * commentaire les attribuait à l'OMS ; les seuils ne changent pas). Un capteur en mg/m³, en µg/m³ ou en ppb se ramène au
   * ppm avant d'être jugé (`versRepere`, unites.js) ; dans une autre unité, il n'est pas de la famille (`cleMesure`). */
  co: () => [[9, trSens('Bon · air'), OK], [35, trSens('Moyen · air'), AMBRE, true], [null, tr('Danger'), ROUGE]],
  /* Les PM10, le dioxyde d'azote et l'ozone d'un capteur de la MAISON (chantier G4, A5 ; ADR 0303), en µg/m³, sur le patron des
   * PM2,5 : en dessous de la valeur limite annuelle de l'UE pour 2030, l'air est bon (directive (UE) 2024/2881 : PM10 20, NO₂ 20) ;
   * au-delà de la ligne directrice de l'OMS sur 24 h (OMS 2021 : PM10 45), ou de la valeur limite journalière de l'UE pour 2030
   * (NO₂ 50), il est mauvais. L'ozone n'a qu'un seuil : la ligne directrice de l'OMS sur 8 h, 100 µg/m³ (OMS 2021). Dehors, rien
   * de cela n'est jugé (`JUGEES_DEHORS`). */
  pm10: () => [[20, trSens('Bon · air'), OK], [45, trSens('Moyen · air'), AMBRE], [null, trSens('Mauvais · air'), ROUGE]],
  no2: () => [[20, trSens('Bon · air'), OK], [50, trSens('Moyen · air'), AMBRE], [null, trSens('Mauvais · air'), ROUGE]],
  o3: () => [[100, trSens('Bon · air'), OK], [null, trSens('Mauvais · air'), ROUGE]],
};

/* Dehors a ses propres zones (C15, révisé le 16/10 — « les capteur exterieur il manque les jauges ») : la température et
 * l'humidité d'une pièce du dehors se lisent sur une échelle DU DEHORS. Le froid en bleu — aucun jeton n'en a de plus
 * soutenu : le gel prend le même —, le doux en vert, le chaud en ambre, la canicule en rouge ; l'air sec et humide en
 * ambre, saturé en orange. « Doux » passe par une clé de sens : sa clé nue est l'arrondi d'une carte (« Sanft »). */
const PALIERS_DEHORS = {
  temp: () => [[0, tr('Gel'), BLEU], [10, trSens('Froid · ressenti'), BLEU], [17, tr('Frais'), BLEU], [25, trSens('Doux · température'), OK], [32, tr('Chaud'), AMBRE], [null, tr('Canicule'), ROUGE]],
  hum: () => [[30, trSens('Sec · ressenti'), AMBRE], [70, tr('Normal'), OK], [85, tr('Humide'), AMBRE], [null, tr('Saturé'), ORANGE]],
};
// Les paliers d'une famille : ceux du dehors pour une mesure du dehors qui en a, sinon ceux de la maison.
const paliersDe = (cle, d) => (d && PALIERS_DEHORS[cle]) || PALIERS[cle];

/* La note d'une mesure, de 0 à 100 : des points d'ancrage reliés en ligne
 * droite, calés sur les paliers ci-dessus — le plateau de l'idéal (le bleu)
 * vaut 100, la note descend à mesure qu'on s'en éloigne. */
const COURBES = {
  temp: [[13, 0], [15, 25], [16, 45], [17, 65], [18, 100], [23, 100], [26, 70], [27, 55], [29, 25], [31, 0]],
  hum: [[5, 0], [15, 25], [20, 45], [30, 70], [40, 100], [50, 100], [60, 70], [70, 45], [80, 25], [90, 0]],
  co2: [[400, 100], [900, 100], [1150, 80], [1400, 55], [1600, 30], [2200, 0]],
  bruit: [[0, 100], [50, 100], [65, 70], [70, 55], [80, 25], [90, 0]],
};

export const MESURES_CONFORT = ['temp', 'hum', 'co2', 'bruit'];
const HABILLAGE = {
  temp: () => ({ nom: tr('Température'), icone: 'thermometer-half' }),
  hum: () => ({ nom: tr('Humidité'), icone: 'humidity' }),
  co2: () => ({ nom: 'CO₂', icone: 'wind' }),
  bruit: () => ({ nom: tr('Bruit'), icone: 'volume' }),
  lux: () => ({ nom: tr('Luminosité'), icone: 'brightness' }),
  pm25: () => ({ nom: tr('PM2,5'), icone: 'smog' }),
  cov: () => ({ nom: tr('Indice COV'), icone: 'smog' }),
  vent: () => ({ nom: tr('Vent'), icone: 'wind' }),
  co: () => ({ nom: 'CO', icone: 'flame' }),
  // Les noms d'avant (chantier G4, A5) : la famille change, pas ce qu'écrit la carte.
  pm10: () => ({ nom: tr('Particules'), icone: 'smog' }),
  no2: () => ({ nom: 'NO₂', icone: 'smog' }),
  o3: () => ({ nom: 'O₃', icone: 'smog' }),
};
/* Le nom d'une mesure SANS table, par sa classe Home Assistant (audit du 19/10 : UNE source de noms, ici, avec celle des familles) —
 * ce que dit le sous-titre de sa carte et le nom de sa famille. Une pression, un indice, une puissance : un nom, jamais un jugement. */
const NOMS_CLASSES = () => ({ pm10: tr('Particules'), pm1: 'PM1', aqi: tr("Qualité de l'air"), nitrogen_dioxide: 'NO₂', ozone: 'O₃', volatile_organic_compounds: tr('COV'),
  volatile_organic_compounds_parts: tr('COV'), power: tr('Puissance'), energy: tr('Énergie'), voltage: tr('Tension'), current: tr('Courant'), pressure: tr('Pression'),
  atmospheric_pressure: tr('Pression'), battery: tr('Pile'), signal_strength: tr('Signal'), moisture: tr('Humidité du sol'), precipitation: tr('Précipitations'), gas: tr('Gaz'), water: tr('Eau'),
  // Un monoxyde dans une unité que la table ne sait pas convertir (G1-D6) : hors de la famille, il garde son nom.
  carbon_monoxide: 'CO' });
/** Le nom d'une mesure par sa classe (et son unité, pour un COV) : celui de sa famille si la table la lit, sinon celui de sa classe ; '' sinon. */
export function nomClasse(deviceClass, unite = null) {
  const cle = cleMesure(deviceClass, unite);
  return cle ? nomMesure(cle) : NOMS_CLASSES()[deviceClass] || '';
}

/** Le nom d'une famille : « Température », « CO₂ »… (la carte l'écrit sous son chiffre, la fiche sous son nom). */
export function nomMesure(cle) { return HABILLAGE[cle] ? HABILLAGE[cle]().nom : ''; }
/* Un nom qui dit déjà sa famille (correction bis 2, point 1) : « Chambre CO2 », « Salle de bain température » — la famille,
 * écrite dessous, la redisait, et le lecteur d'écran deux fois. Les deux se comparent sans casse ni accents, les indices et
 * les exposants ramenés à leurs chiffres (NFKD : « CO₂ » vaut « CO2 »), la ponctuation et les espaces en un seul espace
 * (« PM2.5 » vaut « PM2,5 »). Le nom la CONTIENT, mot entier ou non : un nom composé la porte dans son mot
 * (« Schlafzimmertemperatur »). */
const aplatiFamille = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Le nom affiché dit-il déjà la famille ? Alors la carte et la fiche la taisent (correction bis 2, point 1). */
export function nomDitFamille(nom, famille) {
  const f = aplatiFamille(famille);
  return f !== '' && aplatiFamille(nom).includes(f);
}
/** Le glyphe d'une famille (correction bis, point 9) : celui de la carte d'une mesure quand l'utilisateur n'en a pas choisi — `volume`, `wind`, `smog`… ; null sans famille. */
export function iconeMesure(cle) { return HABILLAGE[cle] ? HABILLAGE[cle]().icone : null; }

const lisible = (v) => v != null && v !== '' && !isNaN(v);

/* Ce qui est BON (chantier Capteurs, C5) : le bleu et le vert de la table —
 * l'idéal et ce qui l'entoure. Une zone bonne s'écrit en neutre, sans teinte
 * ni lavis ; seules l'ambre, l'orange et le rouge colorent une carte. Toute la
 * luminosité est bonne : aucune lumière n'est une alerte. Dehors (`d`), le bon
 * est le vert seul — Doux, Normal — : le bleu y dit le froid, pas l'idéal. Il
 * ne sert qu'aux bandes de la courbe : dehors, rien n'est une alerte. */
const TOUJOURS_BONNES = ['lux'];
const bonne = (cle, c, d) => (d && PALIERS_DEHORS[cle] ? c === OK : TOUJOURS_BONNES.indexOf(cle) >= 0 || c === BLEU || c === OK);

/* Dehors, on ne juge pas le confort de la maison (chantier Capteurs, C15,
 * révisé le 16/10) : un jardin à 5 °C n'est pas « Trop froid », il est
 * « Froid ». La température et l'humidité d'une pièce du dehors se lisent sur
 * les zones du dehors ; le vent et les particules gardent les leurs, déjà du
 * dehors ; le CO₂, le bruit, les COV et la luminosité s'écrivent en neutre —
 * le chiffre et la courbe, sans zone. Dehors, rien n'est une alerte : la zone
 * le dit (`dehors`), la carte n'a ni teinte ni lavis, la fiche ni conseil. */
const JUGEES_DEHORS = ['vent', 'pm25', 'temp', 'hum'];
/** Une famille qui a des zones dans une pièce du dehors (C15, révisé) : la température, l'humidité, le vent et les particules. */
export function jugeeDehors(cle) { return JUGEES_DEHORS.indexOf(cle) >= 0; }

/**
 * La zone d'une valeur : `{ i, t, c, rgb, bon, dehors }` — son rang dans la
 * table, son mot, sa couleur et son compagnon « r,g,b » (le lavis, la plaque),
 * bonne ou non (C5), du dehors ou non (C15). `v` dans le repère de la table :
 * le Celsius, le km/h ; `dehors` : une mesure du dehors, lue sur les zones du
 * dehors quand sa famille en a. `null` sans table ou sans valeur lisible.
 */
export function zoneMesure(cle, v, dehors = false) {
  const P = paliersDe(cle, dehors);
  if (!P || !lisible(v)) return null;
  const n = Number(v);
  const paliers = P();
  const i = paliers.findIndex(([borne, , , inclus]) => borne == null || (inclus ? n <= borne : n < borne));
  const [, t, c] = paliers[i];
  return { i, t, c, rgb: c.replace(/\)$/, '-rgb)'), bon: bonne(cle, c, dehors), dehors: !!dehors };
}

/* ── Les INDICES du dehors (chantier G4, A1 et A6 ; ADR 0303) ─────────────────────────────────────────────────────────────────
 *
 * Un `aqi` de Home Assistant ne dit pas son échelle : 62 est « Modéré » pour l'EPA, hors de l'indice ATMO (de 1 à 6), et
 * « Bon » pour l'indice universel de Google, qui va à l'envers (100 = le meilleur). La fiche météo ne lit donc un indice que
 * si son échelle est CONNUE (airdehors.js) ; les échelles vivent ici, avec les autres jauges. Un rang : `[borne, mot, couleur]`,
 * la borne COMPRISE (« 0 à 50 : bon ») ; le dernier n'en a pas. Une échelle à choix (`choix`) range les états d'un capteur
 * `enum`, du meilleur au pire. Les couleurs : le jeton du thème le plus proche de la couleur officielle, dans l'ordre de
 * gravité — le bordeaux de l'EPA n'en a pas, il reprend le violet. Une information, jamais une alerte : ni lavis, ni « aérez ».
 */
const rangsDe = (mots, couleurs, bornes = []) => () => mots().map((t, k) => [k < bornes.length ? bornes[k] : null, t, couleurs[k]]);
const MOTS_ATMO = () => [trSens('Bon · air'), trSens('Moyen · air'), trSens('Dégradé · air'), trSens('Mauvais · air'), trSens('Très mauvais · air'), trSens('Extrêmement mauvais · air')];
const MOTS_EPA = () => [trSens('Bon · air'), trSens('Modéré · air'), trSens('Mauvais pour les sensibles · air'), trSens('Mauvais · air'), trSens('Très mauvais · air'), trSens('Dangereux · air')];
const SIX = [CYAN, OK, AMBRE, ORANGE, ROUGE, VIOLET];
const INDICES = {
  // L'indice ATMO (arrêté du 10 juillet 2020) : un entier de 1 à 6 ; Atmo France écrit 0 (indisponible) et 7 (évènement) à côté.
  atmo: { de: 1, a: 6, entier: true, rangs: rangsDe(() => MOTS_ATMO(), SIX, [1, 2, 3, 4, 5]) },
  // L'AQI de l'EPA (États-Unis ; AirNow, Ambient Weather, AirVisual « U.S. ») : 0–50, 51–100, 101–150, 151–200, 201–300, au-delà.
  epa: { de: 0, rangs: rangsDe(() => MOTS_EPA(), [OK, AMBRE, ORANGE, ROUGE, VIOLET, VIOLET], [50, 100, 150, 200, 300]) },
  // Le CAQI européen (Airly) : 0–25, 25–50, 50–75, 75–100, au-delà.
  caqi: { de: 0, rangs: rangsDe(() => [trSens('Excellent · air'), trSens('Bon · air'), trSens('Moyen · air'), trSens('Mauvais · air'), trSens('Très mauvais · air')], [CYAN, OK, AMBRE, ORANGE, ROUGE], [25, 50, 75, 100]) },
  // Les choix d'un capteur `enum` : AirVisual (les six catégories de l'EPA), AccuWeather (cinq), l'indice universel de Google.
  epa_choix: { air: true, choix: ['good', 'moderate', 'unhealthy_sensitive', 'unhealthy', 'very_unhealthy', 'hazardous'], rangs: rangsDe(() => MOTS_EPA(), [OK, AMBRE, ORANGE, ROUGE, VIOLET, VIOLET]) },
  accuweather: { air: true, choix: ['good', 'moderate', 'unhealthy', 'very_unhealthy', 'hazardous'],
    rangs: rangsDe(() => [trSens('Bon · air'), trSens('Modéré · air'), trSens('Mauvais · air'), trSens('Très mauvais · air'), trSens('Dangereux · air')], [OK, AMBRE, ORANGE, ROUGE, VIOLET]) },
  uaqi: { air: true, choix: ['excellent_air_quality', 'good_air_quality', 'moderate_air_quality', 'low_air_quality', 'poor_air_quality'],
    rangs: rangsDe(() => [trSens('Excellent · air'), trSens('Bon · air'), trSens('Modéré · air'), trSens('Médiocre · air'), trSens('Mauvais · air')], [CYAN, OK, AMBRE, ORANGE, ROUGE]) },
  // Les pollens (A6) : Atmo France, de 1 (très faible) à 6 (extrêmement élevé) ; le niveau (`level`) d'AccuWeather.
  pollen_atmo: { de: 1, a: 6, entier: true, rangs: rangsDe(() => [tr('Très faible'), tr('Faible'), tr('Modéré'), tr('Élevé'), tr('Très élevé'), tr('Extrêmement élevé')], SIX, [1, 2, 3, 4, 5]) },
  pollen_choix: { choix: ['low', 'moderate', 'high', 'very_high', 'extreme'], rangs: rangsDe(() => [tr('Faible'), tr('Modéré'), tr('Élevé'), tr('Très élevé'), tr('Extrême')], [OK, AMBRE, ORANGE, ROUGE, VIOLET]) },
};
const enRgb = (c) => c.replace(/\)$/, '-rgb)');

/** Le rang d'une valeur sur une échelle connue : `{ i, n, t, c, rgb, couleurs }` — son rang et leur nombre, son mot, sa couleur, et
 *  les compagnons « r,g,b » de tous les rangs (la barre de la tuile) ; null hors de l'échelle, ou pour une échelle inconnue. */
export function rangIndice(echelle, v) {
  const E = INDICES[echelle];
  if (!E) return null;
  const rangs = E.rangs();
  const brut = String(v == null ? '' : v).trim();
  let i = -1;
  if (E.choix) i = E.choix.indexOf(brut.toLowerCase());
  else if (/^\d+(\.\d+)?$/.test(brut)) {
    // Un indice se juge ARRONDI, comme la tuile l'écrit (relecture G4, point 5) : 50,4 s'écrit « 50 », il est « Bon ». L'ATMO,
    // entier, ne s'arrondit pas : 2,5 n'est pas un rang.
    const n = E.entier ? Number(brut) : Math.round(Number(brut));
    if (n >= E.de && (E.a == null || n <= E.a) && (!E.entier || n === Math.round(n))) i = rangs.findIndex(([b]) => b == null || n <= b);
  }
  if (i < 0) return null;
  const c = rangs[i][2];
  return { i, n: rangs.length, t: rangs[i][1], c, rgb: enRgb(c), couleurs: rangs.map(r => enRgb(r[2])) };
}

/** L'échelle de l'air dont un capteur `enum` porte EXACTEMENT les options, dans n'importe quel ordre ; null sinon. */
export function indiceDesChoix(options) {
  if (!Array.isArray(options) || !options.length) return null;
  const o = options.map(x => String(x).toLowerCase()).sort().join('|');
  return Object.keys(INDICES).find(k => INDICES[k].air && INDICES[k].choix.slice().sort().join('|') === o) || null;
}

/** Un monoxyde au palier Danger de la table (audit du 19/10, H10) : la carte Sécurité de Maison le dit. `unite` : celle du
 *  capteur, ramenée au ppm (G1-D6) ; une unité inconnue n'est jamais un danger chiffré. Jugé sur la valeur LUE, au-delà de
 *  35 ppm, comme le serveur (`au_dessus`, veilles.py) : le chiffre écrit, arrondi vers le haut, dit la même chose. */
export function coDanger(v, unite = 'ppm') {
  const t = String(v == null ? '' : v).trim().replace(',', '.');
  const z = t === '' ? null : zoneMesure('co', versPpmCo(Number(t), unite));
  return !!z && z.i === 2;
}

export function verdictMesure(cle, v) {
  const z = zoneMesure(cle, v);
  return z ? { t: z.t, c: z.c } : null;
}

/* La JAUGE d'une mesure (cartes des capteurs et fiche de confort, 19/09) :
 * les paliers ci-dessus sur une échelle LINÉAIRE, bornée comme celles des
 * captures, et leurs repères — les chiffres écrits sous leurs barres. Les
 * positions sont des pourcentages de la barre. */
const ECHELLES = {
  temp: { de: 14, a: 30, reperes: [15, 17, 23, 26, 29] },
  hum: { de: 12, a: 83, reperes: [15, 30, 40, 50, 60, 70, 80] },
  co2: { de: 850, a: 1700, reperes: [900, 1150, 1400, 1600] },
  bruit: { de: 46, a: 83, reperes: [50, 65, 70, 80] },
  /* La luminosité suit l'œil (chantier Capteurs, § 6) : une échelle
   * LOGARITHMIQUE, de 1 à 2 000 lx — linéaire, la pénombre d'une chambre et
   * une lampe de chevet tiendraient dans le premier pixel. */
  lux: { de: 1, a: 2000, log: true, reperes: [50, 300] },
  pm25: { de: 0, a: 50, reperes: [10, 25] },
  cov: { de: 0, a: 500, reperes: [150, 250] },
  vent: { de: 0, a: 80, reperes: [20, 50] },
  co: { de: 0, a: 100, reperes: [9, 35] },
  pm10: { de: 0, a: 80, reperes: [20, 45] },
  no2: { de: 0, a: 100, reperes: [20, 50] },
  o3: { de: 0, a: 200, reperes: [100] },
};
// Les échelles du dehors (C15, révisé le 16/10) : de −10 à 40 °C, de 10 à 100 %.
const ECHELLES_DEHORS = { temp: { de: -10, a: 40, reperes: [0, 10, 17, 25, 32] }, hum: { de: 10, a: 100, reperes: [30, 70, 85] } };
const echelleDe = (cle, d) => (d && ECHELLES_DEHORS[cle]) || ECHELLES[cle];
const axe = (e, x) => (e.log ? Math.log10(Math.max(1, x)) : x);
const position = (e, x) => Math.round(Math.max(0, Math.min(100, (axe(e, x) - axe(e, e.de)) / (axe(e, e.a) - axe(e, e.de)) * 100)) * 10) / 10;
/* Le monoxyde, du ppm de la table à l'unité du capteur et retour (G1-D6) : une unité qui n'est pas celle d'un monoxyde — le
 * 'C' par défaut d'un appel sans unité — laisse la valeur en ppm. */
const deCo = (v, unite) => (uniteCo(unite) ? dePpmCo(v, unite) : v);
const versCo = (v, unite) => (uniteCo(unite) ? versPpmCo(v, unite) : v);
/** Le chiffre d'un repère dans l'unité du capteur : des °F, des m/s, des mg/m³ — et le seuil de « depuis » dans la fiche d'une mesure (C9). */
export const repereDans = (cle, v, unite) => (cle === 'temp' ? Math.round(deCelsius(v, unite)) : cle === 'vent' ? Math.round(deKmh(v, unite)) : cle === 'co' ? Math.round(deCo(v, unite)) : v);
/** L'inverse : une valeur du capteur ramenée au repère de la table — le Celsius, le km/h, le ppm (`unite` : 'C' ou 'F', l'unité d'un vent, d'un monoxyde). */
export const versRepere = (cle, v, unite) => (cle === 'temp' ? versCelsius(v, unite) : cle === 'vent' ? versKmh(v, unite) : cle === 'co' && v != null ? versCo(v, unite) : v);

/** L'échelle d'une mesure : { de, a, log, bandes: [{de, a, c}], reperes: [{v, pos, t}] }, ou null — `log` : l'échelle logarithmique de la luminosité.
 * `v` et `pos` restent dans le repère de la table — le Celsius pour `temp` ;
 * `t` est le CHIFFRE écrit sous le repère, redit dans l'unité réelle du
 * capteur (`uniteT`), arrondi comme les graduations de la fiche. Audit du
 * 03/10 : la carte d'un capteur en Fahrenheit plaçait bien son trait (la
 * valeur était convertie), mais écrivait dessous 15 · 17 · 23 · 26 · 29 —
 * des Celsius sous « 72 °F ». `dehors` : l'échelle du dehors, quand la famille
 * en a une (C15, révisé le 16/10). */
export function echelleMesure(cle, uniteT = 'C', dehors = false) {
  const e = echelleDe(cle, dehors), P = paliersDe(cle, dehors);
  if (!e || !P) return null;
  let debut = e.de;
  const bandes = P().map(([borne, , c]) => {
    const fin = borne == null ? e.a : borne;
    const b = { de: position(e, debut), a: position(e, fin), c };
    debut = fin;
    return b;
  });
  return { de: e.de, a: e.a, log: !!e.log, bandes, reperes: e.reperes.map(v => ({ v, pos: position(e, v), t: repereDans(cle, v, uniteT) })) };
}

/* La mesure d'un capteur Home Assistant, lue à sa classe. Un COV se lit aussi à
 * son UNITÉ (chantier Capteurs, § 6) : la table compte un indice, sans unité —
 * celui des capteurs Sensirion, de 0 à 500 ; des µg/m³ ou des ppb ne se lisent
 * pas sur ses bornes, et gardent la carte d'une mesure sans table. Un monoxyde
 * aussi (G1-D6, 30/10) : des ppm, ou une unité qui s'y ramène (`uniteCo`) ;
 * sans unité ou dans une autre, rien ne dit des ppm — il garde la carte d'une
 * mesure sans table. */
const CLES = { temperature: 'temp', humidity: 'hum', carbon_dioxide: 'co2', carbon_monoxide: 'co', sound_pressure: 'bruit', illuminance: 'lux', pm25: 'pm25', wind_speed: 'vent', pm10: 'pm10' };
/* Le NO₂ et l'ozone (chantier G4, A5) ne se lisent qu'en µg/m³ — le « µ » micro ou le « μ » grec : des ppb ou des ppm ne se
 * lisent pas sur des bornes en µg/m³, et gardent la carte d'une mesure sans table. */
const EN_UG = { nitrogen_dioxide: 'no2', ozone: 'o3' };
const ugM3 = (u) => /^[µμu]g\/m(³|3)$/.test(String(u == null ? '' : u).trim());
export function cleMesure(deviceClass, unite = null) {
  if (deviceClass === 'volatile_organic_compounds' || deviceClass === 'volatile_organic_compounds_parts') return unite ? null : 'cov';
  if (deviceClass === 'carbon_monoxide') return uniteCo(unite) ? 'co' : null;
  if (EN_UG[deviceClass]) return ugM3(unite) ? EN_UG[deviceClass] : null;
  return CLES[deviceClass] || null;
}

/**
 * La barre d'une carte (chantier Capteurs, § 3, § 4) : une bande par zone de la
 * table — son mot, sa couleur, bonne ou non, et sa PART de l'échelle (`part`,
 * en %) —, la zone où l'on est (`i`), le repère (`pos`, de 1 à 99 % : il reste
 * sur la barre) et les chiffres des repères (`reperes` : `{ t, pos }`), écrits
 * dans l'unité du capteur et la langue de l'écran. `v` dans le repère de la
 * table, `unite` : 'C' ou 'F' pour une température, l'unité d'un vent ;
 * `dehors` : les zones et l'échelle du dehors (C15, révisé le 16/10).
 */
export function barreMesure(cle, v, unite = 'C', dehors = false) {
  const e = echelleMesure(cle, unite, dehors);
  const z = zoneMesure(cle, v, dehors);
  if (!e || !z) return null;
  return {
    zones: paliersDe(cle, dehors)().map(([, t, c], k) => ({ t, c, rgb: c.replace(/\)$/, '-rgb)'), bon: bonne(cle, c, dehors), part: Math.round((e.bandes[k].a - e.bandes[k].de) * 10) / 10 })),
    i: z.i,
    pos: Math.max(1, Math.min(99, position(echelleDe(cle, dehors), Number(v)))),
    reperes: e.reperes.map(r => ({ t: nombre(r.t, 0), pos: r.pos })),
  };
}

/**
 * Les zones d'une famille dans le repère de la table (chantier Capteurs, § 4) :
 * `{ de, a, inclus, bon, rgb }` — leurs bornes (−∞ et +∞ aux deux bouts), `a`
 * comprise ou non (`inclus`, comme dans la table), bonnes ou non (C5), leur
 * compagnon « r,g,b ». La fiche d'une mesure en tire les bandes de sa courbe, le
 * seuil de « depuis », et la zone de chaque point sans rebâtir la table. [] sans table.
 * `dehors` : celles du dehors, quand la famille en a (C15, révisé le 16/10).
 */
export function zonesMesure(cle, dehors = false) {
  const P = paliersDe(cle, dehors);
  if (!P) return [];
  let de = -Infinity;
  return P().map(([borne, , c, inclus]) => {
    const z = { de, a: borne == null ? Infinity : borne, inclus: !!inclus, bon: bonne(cle, c, dehors), rgb: c.replace(/\)$/, '-rgb)') };
    de = z.a;
    return z;
  });
}

/* Les zones qui demandent d'aérer (C8) : le CO₂ moyen et au-delà, l'humidité
 * trop haute, les particules, les COV et le monoxyde hors du bon ; le NO₂ aussi
 * (une cuisson au gaz). Pas l'ozone (chantier G4, A5) : dans la maison, il vient
 * surtout du dehors. */
const AERER = { co2: [2, 3, 4], hum: [6, 7, 8], pm25: [1, 2], cov: [1, 2], co: [1, 2], pm10: [1, 2], no2: [1, 2] };

/**
 * La phrase d'une carte (C8) : le mot de la zone, « · aérez » quand la zone le
 * demande ; une température dit aussi l'humidité de son appareil (`humidite`,
 * en %) — « Idéal · 52 % d'humidité » —, SEULEMENT quand cette humidité est
 * dans le bon (audit du 19/10) : « Bon · 68 % d'humidité » se lisait comme un
 * jugement de l'humidité, que sa propre carte disait « Humide · aérez ». Hors du
 * bon, la carte d'humidité le dit, et la température se tait sur elle — sauf
 * dehors, où rien n'est un jugement : « Froid · 92 % d'humidité ». Sans
 * zone, l'humidité seule : « 81 % d'humidité ». `repli` : la forme de repli
 * d'une carte large trop étroite pour la phrase entière (correction bis, point 6)
 * — le mot de la zone, sans « aérez », et l'humidité sans son mot : « Idéal · 52 % »,
 * « Confiné ». Une zone du dehors ne demande jamais d'aérer (C15, révisé le 16/10) :
 * des particules dehors, « Mauvais », sans plus.
 */
export function phraseMesure(cle, z, humidite = null, repli = false) {
  const morceaux = z ? [z.t] : [];
  if (!repli && z && !z.dehors && (AERER[cle] || []).indexOf(z.i) >= 0) morceaux.push(tr('aérez'));
  const zh = cle === 'temp' && lisible(humidite) ? zoneMesure('hum', humidite, !!(z && z.dehors)) : null;
  if (zh && (zh.bon || !z || z.dehors)) { const h = nombre(humidite, 0) + '\u00a0%'; morceaux.push(repli ? h : tr('{h} d’humidité', { h })); }
  return morceaux.join(' · ');
}

/* ── Le chiffre ÉCRIT, et la zone qu'il dit (G1-D5, 30/10 ; ADR 0300) ─────────
 *
 * La zone se jugeait sur la valeur brute, le chiffre s'écrivait arrondi :
 * 39,6 % s'affichait « 40 % · Bon » quand 40 est « Idéal » sur la jauge. Partout
 * où un chiffre et son mot s'affichent ensemble — la carte d'une mesure, sa
 * compacte, sa fiche, la fiche de confort d'une pièce et sa barre, le CO₂ de
 * l'Accueil —, la zone se juge sur le chiffre TEL QU'IL S'ÉCRIT : arrondi à la
 * précision affichée, dans l'unité du capteur, avant `zoneMesure`. L'arrondi est
 * celui de l'écriture (`Intl` : la moitié s'éloigne de zéro, comme
 * `toLocaleString`). `zoneMesure` reste un juge exact des valeurs qu'on lui donne.
 *
 * Le monoxyde s'arrondit VERS LE HAUT, comme le message de la veille du serveur
 * (`math.ceil`, veilles.py) : 35,4 ppm est un danger, « 35 ppm · Moyen » ne le
 * dirait pas. Il se JUGE sur son ppm arrondi vers le haut, quelle que soit l'unité
 * du capteur (`valeurEcrite`) : la zone dit « Danger » exactement quand la valeur
 * lue dépasse 35 ppm — l'écran, la carte Sécurité et le téléphone disent la même
 * chose. */
const ARRONDIS = new Map();
function arrondisseur(d) {
  if (!ARRONDIS.has(d)) ARRONDIS.set(d, new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d, useGrouping: false }));
  return ARRONDIS.get(d);
}
/* Les décimales du chiffre d'une famille : une pour une température — et pour un monoxyde en mg/m³, qui tient sous 1 —, aucune ailleurs. */
function decimalesMesure(cle, unite = null) {
  return cle === 'temp' || (cle === 'co' && uniteCo(unite) === 'mg/m³') ? 1 : 0;
}
/** La valeur `v`, dans l'unité du capteur (`unite`), arrondie comme son chiffre s'écrit ; null si elle n'est pas un nombre. */
export function arrondiMesure(cle, v, unite = null) {
  if (!lisible(v) || String(v).trim() === '') return null;
  const n = Number(v), d = decimalesMesure(cle, unite);
  const f = 10 ** d;
  // Vers le haut pour le monoxyde ; `toFixed(6)` efface le bruit binaire (0,3 × 10 = 3,0000000000000004 ne monte pas à 4).
  const x = cle === 'co' ? Math.ceil(Number((n * f).toFixed(6))) / f : Number(arrondisseur(d).format(n));
  return x === 0 ? 0 : x; // jamais « -0 »
}

/** Le chiffre d'une carte : une décimale pour une température, aucune ailleurs ; les milliers à la manière de la langue.
 *  `unite` : celle du capteur, qui décide des décimales d'un monoxyde (G1-D6). */
export function chiffreMesure(cle, v, unite = null) {
  const d = decimalesMesure(cle, unite);
  const x = arrondiMesure(cle, v, unite);
  return Number(x == null ? v : x).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** La valeur `n` du capteur, dans son unité, telle que son chiffre l'écrit, ramenée au repère de la table : CE QUI SE JUGE (D5).
 *  Le bruit binaire de la conversion s'efface : 73,4 °F valent 23 °C — « Idéal » —, pas 23,000000000000004 — « Bon ». */
export function valeurEcrite(cle, n, unite = null) {
  /* Le monoxyde se juge sur le ppm arrondi VERS LE HAUT, quelle que soit l'unité du capteur (relecture de G1) : l'arrondi dans
   * l'unité faisait de 40,01 mg/m³ (34,92 ppm) un « 40,1 » — 35,003 ppm, « Danger » — quand la carte Sécurité et le serveur se
   * taisaient. `ceil(ppm) > 35` exactement quand la valeur lue dépasse 35 ppm : les trois disent la même chose. Le chiffre, lui,
   * reste écrit dans l'unité du capteur (`chiffreMesure`). */
  if (cle === 'co') {
    if (!lisible(n) || String(n).trim() === '') return null;
    const ppm = versCo(Number(n), unite);
    return ppm == null ? null : Math.ceil(Number(ppm.toFixed(6)));
  }
  const x = arrondiMesure(cle, n, unite);
  const r = x == null ? null : versRepere(cle, x, unite);
  return r == null ? null : Math.round(r * 1e9) / 1e9;
}

/* Une valeur du REPÈRE de la table — le Celsius d'une température —, telle que son chiffre l'écrit dans l'unité `unite`, ramenée
 * au repère : ce que la fiche de confort et sa barre jugent, notent et écrivent (D5). */
function ecriteDansRepere(cle, v, unite = 'C') {
  return cle === 'temp' ? valeurEcrite('temp', deCelsius(Number(v), unite), unite) : valeurEcrite(cle, v);
}

export function scoreMesure(cle, v) {
  const pts = COURBES[cle];
  if (!pts || !lisible(v)) return null;
  const n = Number(v);
  if (n <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (n <= x1) return Math.round(y0 + (y1 - y0) * (n - x0) / (x1 - x0));
  }
  return pts[pts.length - 1][1];
}

const nombre = (n, decimales) => Number(n).toLocaleString(locale(), { maximumFractionDigits: decimales, minimumFractionDigits: 0 });

/** « 21,4 °C », « 47 % », « 612 ppm », « 34 dB ». `v` arrive TOUJOURS en Celsius pour
 * `temp` (comme pour tout le reste de ce module) ; `uniteT` ne sert qu'à reconvertir le
 * chiffre affiché vers l'unité réelle de l'installation. */
export function valeurConfort(cle, v, uniteT = 'C') {
  if (!lisible(v)) return null;
  if (cle === 'temp') return nombre(deCelsius(v, uniteT), 1) + ' ' + signeTemp(uniteT);
  if (cle === 'hum') return nombre(v, 0) + ' %';
  if (cle === 'co2') return nombre(v, 0) + ' ppm';
  if (cle === 'bruit') return nombre(v, 0) + ' dB';
  return null;
}

/* Le mot de l'indice. Les mêmes couleurs que les mesures : un indice ambre
 * s'explique toujours par une mesure ambre ou pire. */
export function verdictIndice(indice) {
  if (!lisible(indice)) return null;
  if (indice >= 80) return { t: tr('Confortable'), c: OK };
  if (indice >= 60) return { t: tr('Correct'), c: DOUX };
  if (indice >= 40) return { t: tr('Acceptable'), c: AMBRE };
  if (indice >= 20) return { t: tr('À améliorer'), c: ORANGE };
  return { t: tr('Inconfortable'), c: ROUGE };
}

/* L'INDICE : la moyenne des notes, tirée vers le bas par la pire. Une pièce à
 * 21 °C n'est pas confortable si l'air y est confiné : la moyenne seule le
 * cacherait, la pire note seule ignorerait tout le reste. Chaque mesure se juge,
 * se note et s'écrit sur la même valeur : son chiffre tel qu'il s'écrit (G1-D5). */
export function indiceConfort(valeurs, uniteT = 'C') {
  const mesures = MESURES_CONFORT
    .filter(cle => valeurs && lisible(valeurs[cle]) && String(valeurs[cle]).trim() !== '')
    .map(cle => {
      const v = ecriteDansRepere(cle, valeurs[cle], uniteT);
      return { cle, ...HABILLAGE[cle](), valeur: valeurConfort(cle, v, uniteT), verdict: verdictMesure(cle, v), score: scoreMesure(cle, v) };
    });
  if (!mesures.length) return null;
  const notes = mesures.map(m => m.score);
  const moyenne = notes.reduce((a, n) => a + n, 0) / notes.length;
  const indice = Math.round((moyenne + Math.min(...notes)) / 2);
  return { indice, verdict: verdictIndice(indice), mesures };
}

/* Les mesures que lit la FICHE de confort d'une pièce (audit du 03/10).
 *
 * Une pièce réelle — `live`, ce que `deriveAccueil` (App.jsx) a lu dans ses
 * capteurs — ne dit que ce qu'elle mesure : une mesure absente ou
 * indisponible reste `null`, et la fiche la tait, comme la barre. Les
 * chaînes de `piece` (« 18.1° », « 60% », « 529 ppm ») ne se lisent que
 * SANS `live` : c'est l'écran d'avant la connexion, où les pièces d'exemple
 * (`PIECES`) portent leurs valeurs de vitrine.
 *
 * La fiche relisait ces chaînes dès qu'une mesure manquait, et la vue Pièce
 * y glissait celles du modèle : une chambre sans hygromètre affichait
 * « Humidité 60 % », un conseil sur un air que rien ne mesure, et un indice
 * de 78 sous une barre qui disait 100. Sans thermomètre, sur une
 * installation en Fahrenheit, le « 18.1° » du modèle devenait −7,7 °C :
 * « Trop froid ».
 *
 * La température sort dans l'unité de son capteur : la fiche la convertit
 * (ADR 0128). Un tiret n'est pas un nombre — il reste `null`, jamais zéro
 * (ADR 0030) ; un vrai 0 mesuré, lui, reste 0. */
export function mesuresFiche(live, piece) {
  if (live) {
    const lu = (v) => (lisible(v) ? Number(v) : null);
    return { temp: lu(live.temp), hum: lu(live.hum), co2: lu(live.co2) };
  }
  const chaine = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; };
  return { temp: chaine(piece && piece.temp), hum: chaine(piece && piece.hum), co2: chaine(piece && piece.badge) };
}

/* Le capteur de bruit d'une pièce : la `device_class` fait foi. L'unité ne
 * suffit pas — la force d'un signal Wi-Fi se mesure aussi en dB. */
export function capteurBruit(ids, S) {
  return (ids || []).find(id => {
    const st = S && S[id];
    return String(id).indexOf('sensor.') === 0 && !!st && st.attributes && st.attributes.device_class === 'sound_pressure' && lisible(parseFloat(st.state));
  }) || null;
}
