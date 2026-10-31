/* ── La collecte des déchets : lire le capteur de CHACUN ────────────────────
 *
 * « J'aime beaucoup la carte collecte » (03/10) — elle sort donc de la carte
 * Rappels, où elle n'était qu'une ligne, et prend une carte à elle.
 *
 * ADAPTÉ À TOUS, PAS À UNE SEULE MAISON. Il n'existe aucune entité standard
 * pour le ramassage : chacun branche la sienne. On en voit au moins trois
 * formes, et ce fichier les lit toutes, de la plus riche à la plus pauvre :
 *
 *  1. un capteur-gabarit écrit à la main, avec ses attributs en clair
 *     (`jours_restants`, `est_aujourd_hui`, `est_demain`, `date_formatee`…) ;
 *  2. une intégration répandue — « Waste Collection Schedule » et ses pareilles
 *     donnent `daysTo` (ou `days_to`) et `date`, parfois `types` ;
 *  3. rien du tout : le `state` porte alors la date, ou le nombre de jours.
 *
 * Le nombre de jours fait foi quand il existe : lui seul distingue « demain »
 * de « dans trente heures ». Sinon il se déduit de la date. Et quand RIEN ne
 * se lit, on rend `null` : pas de carte vaut mieux qu'une carte qui invente.
 *
 * Aucun React ici, et aucune couleur : tout se teste à la main.
 *
 * OÙ LA LIRE (30/10, chantier G2 ; ADR 0301). Le calendrier ne se reconnaissait
 * qu'à des mots français sans accents : rien dans cinq des sept langues, ni
 * pour « Déchets » ou « Poubelles ». Il se reconnaît d'abord à sa PLATEFORME
 * (Waste Collection Schedule, Afvalbeheer), puis à son nom, sans accents, dans
 * les sept langues ; sans calendrier, les CAPTEURS qui portent un jour de
 * passage. Le composant lit la même liste (`collecte.py`, un test les compare),
 * et un choix dans Paramètres › Veilles ne fait que corriger.
 */
import { sansAccents } from './outils.js';

/* Les intégrations de ramassage : leur plateforme suffit. */
const PLATEFORMES_COLLECTE = ['waste_collection_schedule', 'afvalbeheer'];
/* Les mots du ramassage, sans accents, dans les sept langues — ceux du composant.
 * Des mots entiers (relecture du 30/10) : « Familie Müller », « Tonte des
 * bordures », « Collectif parents » ne sont pas des ramassages. */
const MOTS_COLLECTE = ['collecte', 'collectes', 'collection', 'collections', 'ramassage', 'ramassages', 'poubelle', 'poubelles',
  'ordure', 'ordures', 'dechet', 'dechets', 'waste', 'abfall', 'abfuhr', 'mull', 'muell',
  'mullkalender', 'mulltermin', 'mulltermine', 'mulltonne', 'mulltonnen',
  'inzameling', 'inzamelingen', 'ophaling', 'ophalingen', 'afval', 'raccolta', 'rifiuti', 'rifiuto',
  'recogida', 'recogidas', 'residuos', 'residuo', 'basura', 'basuras',
  'odpad', 'odpady', 'odpadow', 'odpadu', 'smieci', 'wywoz', 'wywozu'];
/* Les composés de l'allemand et du néerlandais : « Abfallkalender » commence par
 * le mot, « Restmüll », « Restafval », « Müllabfuhr » ou « Müllabholung » finit par lui. */
const DEBUTS_COLLECTE = ['abfall', 'abfuhr', 'afval'];
const FINS_COLLECTE = ['mull', 'muell', 'abfall', 'afval', 'abfuhr', 'abholung'];

const CLES_JOURS = ['jours_restants', 'daysTo', 'days_to', 'Days_until', 'days_until', 'days', 'jours'];
const CLES_DATE = ['date', 'next_date', 'prochaine_date', 'next_collection', 'collection_date'];

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/;

const nombre = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  /* « 13 », « 13 jours », « in 13 days » : le premier entier qu'on trouve, à
   * condition que le texte n'en porte qu'un — « 16/10 » en porte deux et n'est
   * pas un nombre de jours. */
  const n = s.match(/-?\d+/g);
  return n && n.length === 1 ? parseInt(n[0], 10) : null;
};

/* Les booléens de Home Assistant arrivent en vrai booléen, mais un gabarit mal
 * cité les rend en texte : « True », « true », « on », « 1 ». */
const vrai = (v) => v === true || (typeof v === 'string' && /^(true|on|1|oui|yes)$/i.test(v.trim()));

const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ecartJours = (a, b) => Math.round((minuit(a).getTime() - minuit(b).getTime()) / 864e5);

/** Une date lisible dans une valeur, ou `null`. Les dates nues sont LOCALES. */
export function dateDe(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = s.match(DATE_ISO);
  if (!m) return null;
  const d = s.length === 10 ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  if (isNaN(d.getTime())) return null;
  /* `new Date(2026, 12, 45)` ne refuse pas : il deborde sur fevrier 2027. On
   * relit donc ce qu'on vient de construire — le 45 du mois 13 n'existe pas. */
  if (s.length === 10 && (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3])) return null;
  return d;
}

/**
 * Ce qu'on sait du prochain ramassage, ou `null`.
 *
 *   { jours, date, aujourdhui, demain, types, decale }
 *
 * `date` peut manquer quand le capteur ne donne qu'un nombre de jours ; on la
 * reconstruit alors, car une carte sans date ne dirait rien. `types` est ce qui
 * passe ce jour-là (« Jaune », « Verre »), vide quand le capteur se tait.
 */
export function lireCollecte(etat, maintenant = new Date()) {
  if (!etat || typeof etat !== 'object') return null;
  const at = etat.attributes || {};
  const now = maintenant instanceof Date ? maintenant : new Date(maintenant);

  /* 1. Le nombre de jours, dans l'ordre des formes rencontrées. Un capteur qui
   * dit 0 jour parle d'aujourd'hui : on teste la PRÉSENCE de la clé. */
  let jours = null;
  for (const k of CLES_JOURS) {
    if (at[k] !== undefined) { const n = nombre(at[k]); if (n !== null) { jours = n; break; } }
  }

  /* 2. La date, dans les attributs puis dans l'état. */
  let date = null;
  for (const k of CLES_DATE) {
    if (at[k] !== undefined) { date = dateDe(at[k]); if (date) break; }
  }
  if (!date) date = dateDe(etat.state);

  /* 3. Rien dans les attributs : l'état porte peut-être le nombre de jours. */
  if (jours === null && !date) jours = nombre(etat.state);
  if (jours === null && date) jours = ecartJours(date, now);
  if (jours === null) return null;             // rien de lisible : pas de carte
  if (!date) { date = minuit(now); date.setDate(date.getDate() + jours); }

  /* 4. Aujourd'hui et demain : le capteur a le dernier mot quand il les dit —
   * une tournée du soir peut compter « demain » autrement que le calendrier. */
  const aujourdhui = at.est_aujourd_hui !== undefined ? vrai(at.est_aujourd_hui) : jours === 0;
  const demain = at.est_demain !== undefined ? vrai(at.est_demain) : (!aujourdhui && jours === 1);

  const bruts = at.types !== undefined ? at.types : (at.type !== undefined ? at.type : at.waste_type);
  const types = (Array.isArray(bruts) ? bruts : (typeof bruts === 'string' ? bruts.split(/[,;]/) : []))
    .map(t => String(t).trim()).filter(Boolean);

  return { jours, date, aujourdhui, demain, types, decale: vrai(at.decale_samedi) };
}

/**
 * Le prochain ramassage lu dans un CALENDRIER, même forme que `lireCollecte`.
 *
 * Beaucoup de communes publient un `.ics` : un calendrier marche alors sans
 * qu'on ait un capteur à écrire. Les événements sont ceux de l'API calendriers
 * — `{ summary, start: { date | dateTime } }` —, déjà lus ailleurs : on ne
 * rouvre rien. Le PROCHAIN qui ne soit pas fini fait foi, et les événements du
 * MÊME jour se rassemblent : « Jaune » et « Verre » le même matin, c'est une
 * tournée, pas deux.
 */
export function collecteDuCalendrier(evenements, maintenant = new Date()) {
  const now = maintenant instanceof Date ? maintenant : new Date(maintenant);
  const jour0 = minuit(now);
  const avec = [];
  for (const e of (evenements || [])) {
    const s = e && e.start;
    const d = dateDe(s && (s.date || s.dateTime)) || dateDe(s);
    if (!d || minuit(d).getTime() < jour0.getTime()) continue;   // la tournée d'hier est passée
    avec.push({ d, titre: String((e && e.summary) || '').trim() });
  }
  if (!avec.length) return null;
  avec.sort((x, y) => x.d.getTime() - y.d.getTime());
  const date = minuit(avec[0].d);
  const jours = ecartJours(date, now);
  const types = avec.filter(x => minuit(x.d).getTime() === date.getTime() && x.titre).map(x => x.titre);
  return { jours, date, aujourdhui: jours === 0, demain: jours === 1, types, decale: false };
}

/* ── Les sept prochains jours (maquette « 1c Collectes », 03/10) ────────────
 *
 * La carte montre une bande de sept jours avec un point par collecte, et une
 * légende des types rencontrés. Les couleurs ne sont PAS décidées par le code
 * pour une commune : on reconnaît les familles les plus répandues à leur nom,
 * dans les sept langues de Loggia, et tout nom inconnu prend la couleur
 * suivante — chacun ses bacs, chacun ses mots.
 */
const FAMILLES = [
  { cle: 'ordures', rgb: '140,152,170', mots: /ordure|m[eé]nag|r[eé]siduel|restafval|restm[uü]ll|household|general|resto|zmieszan/i },
  { cle: 'recyclables', rgb: '242,201,76', mots: /recycl|jaune|emballage|plastique|papier|carton|pmc|pmd|gelbe|papel|carta|opakowan/i },
  { cle: 'verre', rgb: '46,196,136', mots: /verre|glas|glass|vidrio|vetro|szk[lł]o/i },
  { cle: 'biodechets', rgb: '232,132,56', mots: /bio|compost|organi|gft|vert|green|braune|org[aá]nic|bio-?odpad/i },
];
const AUTRES = ['79,140,255', '142,110,255', '236,98,140', '64,196,214'];

/**
 * La famille d'un type de collecte : `{ cle, rgb, nom }`.
 * `nom` est celui que la source donne — on ne le traduit pas, c'est le mot de
 * la commune. `rang` sert aux types qu'on ne reconnaît pas.
 */
export function familleCollecte(nom, rang = 0) {
  const s = String(nom || '').trim();
  const f = FAMILLES.find(x => x.mots.test(s));
  return { cle: f ? f.cle : 's' + rang, rgb: f ? f.rgb : AUTRES[rang % AUTRES.length], nom: s };
}

/**
 * Les collectes des `n` prochains jours, à partir d'aujourd'hui :
 *   [{ date, jour, types: [{ cle, rgb, nom }] }]
 * Un jour sans collecte reste dans la liste, avec `types` vide : la bande
 * montre les sept jours, pas seulement ceux qui portent un bac.
 */
function joursCollecte(evenements, maintenant = new Date(), n = 7) {
  const now = maintenant instanceof Date ? maintenant : new Date(maintenant);
  const jour0 = minuit(now);
  const parJour = new Map();
  const vus = [];
  for (const e of (evenements || [])) {
    const s = e && e.start;
    const d = dateDe(s && (s.date || s.dateTime)) || dateDe(s);
    if (!d) continue;
    const k = ecartJours(d, now);
    if (k < 0 || k >= n) continue;
    const nom = String((e && e.summary) || '').trim();
    if (!nom) continue;
    if (vus.indexOf(nom) < 0) vus.push(nom);
    if (!parJour.has(k)) parJour.set(k, []);
    parJour.get(k).push(nom);
  }
  /* Le RANG d'un type inconnu suit son ordre d'apparition, pour que deux
   * rendus de la même semaine donnent les mêmes couleurs. */
  const famille = (nom) => familleCollecte(nom, vus.indexOf(nom));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(jour0); d.setDate(d.getDate() + i);
    const noms = parJour.get(i) || [];
    const types = [];
    for (const nom of noms) {
      const f = famille(nom);
      if (!types.some(x => x.cle === f.cle)) types.push(f);
    }
    return { date: d, jour: i, types };
  });
}

/* ── Où lire la collecte (chantier G2, D2 ; ADR 0301) ────────────────────── */

const motDeCollecte = (m) => MOTS_COLLECTE.indexOf(m) >= 0
  || DEBUTS_COLLECTE.some(d => m.indexOf(d) === 0)
  || FINS_COLLECTE.some(f => m.length >= f.length && m.slice(-f.length) === f);

/** Un de ces noms parle-t-il de ramassage, dans l'une des sept langues ? Mot à mot, sans accents. */
export function nomDeCollecte(...noms) {
  return noms.some(n => !!n && sansAccents(n).split(/[^a-z0-9]+/).some(m => !!m && motDeCollecte(m)));
}

/* Un capteur qui porte un jour de passage : sa classe, une clé connue, ou un
 * état qui EST une date. « Déchets triés : 12 kg » n'en est pas un. */
function ditUneDate(st) {
  const a = (st && st.attributes) || {};
  return a.device_class === 'date' || a.device_class === 'timestamp'
    || CLES_JOURS.some(k => k in a) || CLES_DATE.some(k => k in a) || !!dateDe(st && st.state);
}

/**
 * Les calendriers et les capteurs de ramassage de la maison :
 *   { calendriers: [id…], capteurs: [id…], plateforme: [id…] }
 * Ceux que leur PLATEFORME désigne d'abord, puis ceux que leur nom désigne —
 * nom affiché ou identifiant —, chaque groupe dans l'ordre des identifiants.
 * Les tests de date passent AVANT le nom : la maison compte des centaines de
 * capteurs, et ce calcul suit chaque changement d'état.
 */
export function sourcesCollecte(S, plateformeDe = () => null) {
  const cals = [], caps = [];
  for (const id of Object.keys(S || {})) {
    const estCal = id.indexOf('calendar.') === 0;
    if (!estCal && id.indexOf('sensor.') !== 0) continue;
    const st = S[id] || {};
    const plateforme = PLATEFORMES_COLLECTE.indexOf(plateformeDe(id)) >= 0;
    const parNom = () => nomDeCollecte((st.attributes || {}).friendly_name, id.slice(id.indexOf('.') + 1));
    if (estCal) { if (plateforme || parNom()) cals.push([plateforme ? 0 : 1, id]); }
    else if (plateforme || (ditUneDate(st) && parNom())) caps.push([plateforme ? 0 : 1, id]);
  }
  const ranger = (l) => l.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(x => x[1]);
  const plateforme = [...cals, ...caps].filter(x => x[0] === 0).map(x => x[1]).sort();
  return { calendriers: ranger(cals), capteurs: ranger(caps), plateforme };
}

/**
 * LA source de l'Accueil : `{ calendrier, capteurs }`. Celle que Paramètres a
 * choisie si elle existe encore ; sinon la PLATEFORME d'abord — son calendrier,
 * puis ses capteurs —, puis un calendrier reconnu à son nom, puis des capteurs.
 * Même règle que le composant (`collecte.source`).
 */
export function sourceCollecte(S, plateformeDe = () => null, choisie = '') {
  if (choisie && S && S[choisie]) {
    return choisie.indexOf('calendar.') === 0 ? { calendrier: choisie, capteurs: [] } : { calendrier: null, capteurs: [choisie] };
  }
  const s = sourcesCollecte(S, plateformeDe);
  const par = (oui) => [s.calendriers.filter(x => (s.plateforme.indexOf(x) >= 0) === oui), s.capteurs.filter(x => (s.plateforme.indexOf(x) >= 0) === oui)];
  for (const [cals, caps] of [par(true), par(false)]) {
    if (cals.length) return { calendrier: cals[0], capteurs: [] };
    if (caps.length) return { calendrier: null, capteurs: caps };
  }
  return { calendrier: null, capteurs: [] };
}

/**
 * Le prochain passage lu dans des CAPTEURS, à la forme d'un jour de
 * `joursCollecte` : `{ date, jour, types: [{ cle, rgb, nom }] }`, ou `null`.
 * Plusieurs capteurs, une tournée : le plus proche, et ce qui passe ce jour-là
 * — les types que le capteur dit, sinon son nom (un capteur par bac, comme
 * Afvalbeheer).
 */
function collecteDesCapteurs(etats, maintenant = new Date()) {
  const lus = [];
  for (const st of etats || []) {
    const lu = lireCollecte(st, maintenant);
    if (lu && lu.jours >= 0) lus.push({ lu, nom: String(((st && st.attributes) || {}).friendly_name || '').trim() });
  }
  if (!lus.length) return null;
  const jours = Math.min(...lus.map(x => x.lu.jours));
  const noms = [];
  let date = null;
  for (const { lu, nom } of lus) {
    if (lu.jours !== jours) continue;
    date = date || lu.date;
    for (const t of (lu.types.length ? lu.types : (nom ? [nom] : []))) if (noms.indexOf(t) < 0) noms.push(t);
  }
  const types = [];
  noms.forEach((n, i) => { const f = familleCollecte(n, i); if (!types.some(x => x.cle === f.cle)) types.push(f); });
  return { date: minuit(date), jour: jours, types };
}

/**
 * Le prochain jour qui porte un bac, d'où qu'il vienne : les événements du
 * calendrier (ceux de l'agenda, marqués `_cal`), ou les capteurs.
 */
export function prochaineCollecte({ calendrier = null, capteurs = [], evenements = [], etats = {} } = {}, maintenant = new Date()) {
  if (calendrier) {
    const j = joursCollecte((evenements || []).filter(e => e && e._cal === calendrier), maintenant);
    return j.find(x => x.types.length) || null;
  }
  if (capteurs && capteurs.length) return collecteDesCapteurs(capteurs.map(id => (etats || {})[id]).filter(Boolean), maintenant);
  return null;
}

/** « 2026-10-31 » : le jour d'une collecte, tel que le composant le range
 * (`loggia_collecte`) — ISO, mois de 1 à 12, ce que n'est pas `cleJour` d'agenda.js. */
export function jourIso(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Les bacs de CE ramassage sont-ils sortis ? La partie commune le dit, pour tous les écrans. */
export function sortiPour(etat, prochain) {
  return !!(etat && prochain && prochain.date && typeof etat.sorti === 'string' && etat.sorti === jourIso(prochain.date));
}
