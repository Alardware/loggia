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
import { deCelsius, deKmh, versCelsius, versKmh, signeTemp } from './unites.js';

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
  /* Le monoxyde de carbone en ppm (audit du 19/10, H10) : sous 9 ppm, la valeur guide de l'OMS sur huit heures, l'air est bon ;
   * jusqu'à 35 ppm COMPRIS, celle d'une heure, il faut aérer ; AU-DELÀ, un danger — la carte Sécurité de Maison le dit aussi
   * (`coDanger`), et la veille du serveur prévient le téléphone au même chiffre (`SEUIL_CO`, veilles.py). */
  co: () => [[9, trSens('Bon · air'), OK], [35, trSens('Moyen · air'), AMBRE, true], [null, tr('Danger'), ROUGE]],
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
};
/* Le nom d'une mesure SANS table, par sa classe Home Assistant (audit du 19/10 : UNE source de noms, ici, avec celle des familles) —
 * ce que dit le sous-titre de sa carte et le nom de sa famille. Une pression, un indice, une puissance : un nom, jamais un jugement. */
const NOMS_CLASSES = () => ({ pm10: tr('Particules'), pm1: 'PM1', aqi: tr("Qualité de l'air"), nitrogen_dioxide: 'NO₂', ozone: 'O₃', volatile_organic_compounds: tr('COV'),
  volatile_organic_compounds_parts: tr('COV'), power: tr('Puissance'), energy: tr('Énergie'), voltage: tr('Tension'), current: tr('Courant'), pressure: tr('Pression'),
  atmospheric_pressure: tr('Pression'), battery: tr('Pile'), signal_strength: tr('Signal'), moisture: tr('Humidité du sol'), precipitation: tr('Précipitations'), gas: tr('Gaz'), water: tr('Eau') });
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

/** Un monoxyde en ppm au palier Danger de la table (audit du 19/10, H10) : la carte Sécurité de Maison le dit. */
export function coDanger(v) {
  const t = String(v == null ? '' : v).trim().replace(',', '.');
  const z = t === '' ? null : zoneMesure('co', Number(t));
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
};
// Les échelles du dehors (C15, révisé le 16/10) : de −10 à 40 °C, de 10 à 100 %.
const ECHELLES_DEHORS = { temp: { de: -10, a: 40, reperes: [0, 10, 17, 25, 32] }, hum: { de: 10, a: 100, reperes: [30, 70, 85] } };
const echelleDe = (cle, d) => (d && ECHELLES_DEHORS[cle]) || ECHELLES[cle];
const axe = (e, x) => (e.log ? Math.log10(Math.max(1, x)) : x);
const position = (e, x) => Math.round(Math.max(0, Math.min(100, (axe(e, x) - axe(e, e.de)) / (axe(e, e.a) - axe(e, e.de)) * 100)) * 10) / 10;
/** Le chiffre d'un repère dans l'unité du capteur : des °F, des m/s — et le seuil de « depuis » dans la fiche d'une mesure (C9). */
export const repereDans = (cle, v, unite) => (cle === 'temp' ? Math.round(deCelsius(v, unite)) : cle === 'vent' ? Math.round(deKmh(v, unite)) : v);
/** L'inverse : une valeur du capteur ramenée au repère de la table — le Celsius, le km/h (`unite` : 'C' ou 'F', l'unité d'un vent). */
export const versRepere = (cle, v, unite) => (cle === 'temp' ? versCelsius(v, unite) : cle === 'vent' ? versKmh(v, unite) : v);

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
 * pas sur ses bornes, et gardent la carte d'une mesure sans table. */
const CLES = { temperature: 'temp', humidity: 'hum', carbon_dioxide: 'co2', carbon_monoxide: 'co', sound_pressure: 'bruit', illuminance: 'lux', pm25: 'pm25', wind_speed: 'vent' };
export function cleMesure(deviceClass, unite = null) {
  if (deviceClass === 'volatile_organic_compounds' || deviceClass === 'volatile_organic_compounds_parts') return unite ? null : 'cov';
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
 * trop haute, les particules, les COV et le monoxyde hors du bon. */
const AERER = { co2: [2, 3, 4], hum: [6, 7, 8], pm25: [1, 2], cov: [1, 2], co: [1, 2] };

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

/** Le chiffre d'une carte : une décimale pour une température, aucune ailleurs ; les milliers à la manière de la langue. */
export function chiffreMesure(cle, v) {
  const d = cle === 'temp' ? 1 : 0;
  return Number(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
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
 * cacherait, la pire note seule ignorerait tout le reste. */
export function indiceConfort(valeurs, uniteT = 'C') {
  const mesures = MESURES_CONFORT
    .filter(cle => valeurs && lisible(valeurs[cle]))
    .map(cle => ({ cle, ...HABILLAGE[cle](), valeur: valeurConfort(cle, valeurs[cle], uniteT), verdict: verdictMesure(cle, valeurs[cle]), score: scoreMesure(cle, valeurs[cle]) }));
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
