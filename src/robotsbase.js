/* ── Ce que fait la base d'un aspirateur, et la pièce où il est (chantier du 20/11, A6 ; ADR 0385) ──
 *
 * Quand le robot est sur sa base, il y fait parfois quelque chose — vider son bac, laver puis sécher sa serpillière — ou la base lui
 * demande un geste : réservoir sale plein, réservoir propre à remplir. Au travail, la carte dit « Nettoie · Cuisine · 60 % » : la pièce
 * où il est et le chemin fait. Tout cela se lit dans les entités SŒURS du robot, à leur CLÉ DE TRADUCTION (la même dans toutes les
 * langues), jamais à leur nom : comme les sœurs d'une tondeuse (`decrireSoeurs`, robotsfiche.js).
 *
 * Les clés et les valeurs ci-dessous ne sont pas devinées : lues le 21/11 dans le code PUBLIC des intégrations.
 *  - Roborock (Home Assistant, `components/roborock`) : capteur `status` (valeurs `emptying_the_bin`, `washing_the_mop`,
 *    `going_to_wash_the_mop`) ; `q7_status` (`mop_cleaning`, `mop_airdrying`) ; binaires `mop_drying_status`, `dirty_box_full`,
 *    `clean_box_empty`, `clean_fluid_empty` ; capteurs `mop_drying_remaining_time`, `dock_error` (`waste_water_tank_full`,
 *    `water_empty`), `clean_percent`, `current_room`.
 *  - Ecovacs (Home Assistant, `components/ecovacs`) : capteur `station_state` (`emptying_dustbin`, `washing_mop`, `drying_mop`).
 *    Il ne publie ni la pièce en cours ni la progression.
 *  - Dreame (dépôt Tasshack/dreame-vacuum, domaine `dreame_vacuum`) : capteurs `state` (`auto_emptying`, `washing`, `drying`,
 *    `clean_add_water`, `returning_to_wash`), `self_wash_base_status`, `auto_empty_status`, `dirty_water_tank_status`
 *    (`not_installed_or_full`), `clean_water_tank_status` (`low_water`), `dust_bag_status` (`check`), `detergent_status`
 *    (`low_detergent`), `cleaning_progress`, `current_room`.
 *  - Xiaomi Miio (Home Assistant) : rien de tout cela — ni base, ni pièce.
 * Aucune des quatre ne publie un « bac plein » à proprement parler : on ne l'invente pas.
 * Une valeur que l'appareil ne publie pas ne se dessine pas : sans la sœur, rien ne s'affiche. Pas de React, pas de Home Assistant.
 */
import { tr } from './i18n.js';

/* L'état de la base, tel que chaque capteur le dit : `[clé de traduction]: { valeur: ce que fait la base }`. */
const ACTIVITES = {
  status: { emptying_the_bin: 'vide', washing_the_mop: 'lave', going_to_wash_the_mop: 'va_laver' },
  q7_status: { mop_cleaning: 'lave', mop_airdrying: 'seche' },
  station_state: { emptying_dustbin: 'vide', washing_mop: 'lave', drying_mop: 'seche' },
  state: { auto_emptying: 'vide', washing: 'lave', clean_add_water: 'lave', drying: 'seche', returning_to_wash: 'va_laver' },
  self_wash_base_status: { washing: 'lave', clean_add_water: 'lave', drying: 'seche', returning: 'va_laver' },
  auto_empty_status: { active: 'vide' },
};
/* Les binaires qui disent « allumé » : un seul geste, la serpillière sèche. */
const BINAIRES_SECHE = ['mop_drying_status'];
/* La base demande un geste : capteurs à valeur, binaires `problem` allumés. */
const ALERTES_VALEUR = {
  dock_error: { waste_water_tank_full: 'sale', water_empty: 'propre' },
  dirty_water_tank_status: { not_installed_or_full: 'sale_absent' },
  clean_water_tank_status: { low_water: 'propre' },
  dust_bag_status: { check: 'sac' },
  detergent_status: { low_detergent: 'detergent' },
};
const ALERTES_BINAIRES = { dirty_box_full: 'sale', clean_box_empty: 'propre', clean_fluid_empty: 'detergent' };
/* La pièce en cours et le chemin fait. */
const CLE_PIECE = 'current_room';
const CLES_PCT = ['clean_percent', 'cleaning_progress'];

/* Les clés qui comptent : ce que la carte suit en direct (`clesBase`). */
const CLES = new Set([...Object.keys(ACTIVITES), ...BINAIRES_SECHE, ...Object.keys(ALERTES_VALEUR), ...Object.keys(ALERTES_BINAIRES),
  'mop_drying_remaining_time', CLE_PIECE, ...CLES_PCT]);

const ACTIVITE = {
  vide: { glyphe: 'trash', texte: () => tr('Vide le bac') },
  lave: { glyphe: 'raindrops', texte: () => tr('Lave la serpillière') },
  seche: { glyphe: 'wind', texte: () => tr('Sèche la serpillière') },
  va_laver: { glyphe: 'home', texte: () => tr('Va laver la serpillière') },
};
const ALERTE = {
  sale: () => tr('Réservoir d’eau sale plein'),
  sale_absent: () => tr('Réservoir d’eau sale plein ou absent'),
  propre: () => tr('Réservoir d’eau propre à remplir'),
  sac: () => tr('Sac de la base à vérifier'),
  detergent: () => tr('Détergent de la base à remplir'),
};
/* Ce que l'on dit d'abord : vider avant laver, laver avant sécher ; le plus pressant des soucis d'abord. */
const ORDRE_ACTIVITES = ['vide', 'lave', 'seche', 'va_laver'];
const ORDRE_ALERTES = ['sale', 'sale_absent', 'propre', 'sac', 'detergent'];

const SANS_VALEUR = new Set(['', 'unavailable', 'unknown', 'none', 'null']);
const lisible = (v) => v != null && !SANS_VALEUR.has(String(v).trim().toLowerCase());
const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

/**
 * Les sœurs d'un robot qui parlent de sa base ou de sa pièce, dans un `hass` vivant : `[{ id, cle, domaine }]`, celles de SON appareil,
 * ni masquées ni désactivées, reconnues à leur clé de traduction. `index` : celui de la découverte (`entityMeta`). Vide sans appareil.
 * La carte s'abonne à ces identifiants, puis passe leurs états à `lireBase` (`entrees`).
 */
export function soeursBase(index, idRobot) {
  const t = index && index.entityMeta;
  const moi = t && idRobot ? t.get(idRobot) : null;
  if (!moi || !moi.deviceId) return [];
  const out = [];
  t.forEach((m, id) => {
    if (id === idRobot || !m || m.deviceId !== moi.deviceId || m.hidden || m.disabled || !CLES.has(m.translationKey)) return;
    out.push({ id, cle: m.translationKey, domaine: id.slice(0, id.indexOf('.')) });
  });
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Les entrées de `lireBase` d'après les sœurs de `soeursBase` et les états d'un `hass`. */
export function entreesBase(soeurs, states) {
  return (soeurs || []).map(s => ({ cle: s.cle, domaine: s.domaine, etat: states && states[s.id] ? states[s.id].state : null }));
}

/**
 * Ce que fait la base, et ce qu'elle demande. `entrees` : `[{ cle, domaine, etat }]` — celles de `entreesBase`, ou les sœurs que décrit
 * `decrireSoeurs` (robotsfiche.js), qui ont ces trois champs. Rend :
 *  - `activite` : `{ cle, glyphe, texte }` — « Vide le bac », « Lave la serpillière », « Sèche la serpillière », « Va laver la
 *    serpillière » — ou null ; une seule, la plus avancée ;
 *  - `alertes` : `[{ cle, texte }]` — « Réservoir d’eau sale plein », « Réservoir d’eau propre à remplir », « Sac de la base à vérifier »,
 *    « Détergent de la base à remplir » — dans l'ordre du souci le plus pressant, sans doublon (deux capteurs qui disent la même chose
 *    ne font qu'une ligne).
 */
export function lireBase(entrees) {
  const liste = Array.isArray(entrees) ? entrees : [];
  const faits = new Set();
  const alertes = new Set();
  liste.forEach((e) => {
    if (!e || !lisible(e.etat)) return;
    const v = String(e.etat).trim().toLowerCase();
    if (e.domaine === 'sensor') {
      const a = ACTIVITES[e.cle] && ACTIVITES[e.cle][v];
      if (a) faits.add(a);
      const s = ALERTES_VALEUR[e.cle] && ALERTES_VALEUR[e.cle][v];
      if (s) alertes.add(s);
      if (e.cle === 'mop_drying_remaining_time' && (nombre(e.etat) || 0) > 0) faits.add('seche');
    } else if (e.domaine === 'binary_sensor' && v === 'on') {
      if (BINAIRES_SECHE.includes(e.cle)) faits.add('seche');
      if (ALERTES_BINAIRES[e.cle]) alertes.add(ALERTES_BINAIRES[e.cle]);
    }
  });
  const cle = ORDRE_ACTIVITES.find(k => faits.has(k)) || null;
  return {
    activite: cle ? { cle, glyphe: ACTIVITE[cle].glyphe, texte: ACTIVITE[cle].texte() } : null,
    alertes: ORDRE_ALERTES.filter(k => alertes.has(k)).map(k => ({ cle: k, texte: ALERTE[k]() })),
  };
}

/**
 * La pièce où il est et le chemin fait : `{ piece, pct }`, chacun null quand l'appareil ne le publie pas ; null quand ni l'un ni l'autre.
 * `piece` : le nom que publie le capteur `current_room`, tel quel ; `pct` : `clean_percent` (Roborock) ou `cleaning_progress` (Dreame),
 * de 0 à 100, arrondi — hors de ces bornes, ce n'en est pas un.
 */
export function avanceAspirateur(entrees) {
  const liste = (Array.isArray(entrees) ? entrees : []).filter(e => e && e.domaine === 'sensor' && lisible(e.etat));
  const sal = liste.find(e => e.cle === CLE_PIECE);
  const piece = sal ? String(sal.etat).trim().slice(0, 60) : null;
  const p = liste.find(e => CLES_PCT.includes(e.cle) && nombre(e.etat) != null && nombre(e.etat) >= 0 && nombre(e.etat) <= 100);
  const pct = p ? Math.round(nombre(p.etat)) : null;
  return piece || pct != null ? { piece, pct } : null;
}

/** La phrase de cette avance, comme la dit l'écran : « Cuisine · 60 % », « Cuisine », « 60 % » ; null sans rien. */
export function texteAvanceAspirateur(av) {
  const t = av ? [av.piece, av.pct != null ? av.pct + ' %' : null].filter(Boolean).join(' · ') : '';
  return t || null;
}
