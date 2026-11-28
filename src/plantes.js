/* ── Les plantes de la maison (chantier Capteurs, étape 3 ; C29) ──────────────────────────────────
 *
 * Une plante se DÉCOUVRE, sans configuration : c'est un APPAREIL physique qui
 * porte un capteur de l'humidité du SOL (`moisture` — celle de l'air est
 * `humidity`) et un capteur de la conductivité (`conductivity` ; l'unité µS/cm en
 * second recours, comme `plantCapteur`). Une sonde de sol seule n'est pas une plante.
 *  - Son nom : celui de l'appareil — le nom posé dans Home Assistant, sinon le sien.
 *  - Sa clé reste `plant:{base}` : la base est le début commun des identifiants de
 *    ses capteurs ; ses clés d'aujourd'hui et son agencement tiennent.
 *  - Sa pièce : celle de l'appareil, si c'est une pièce de Loggia (« Technique » ne
 *    s'affiche pas sous une plante), sinon rien.
 *  - Ses capteurs se trouvent par l'appareil.
 * `loggia_plants` COMPLÈTE la découverte, sans la remplacer : une base configurée
 * qui couvre un capteur d'une plante découverte lui donne sa clé, et son nom, sa
 * pièce et son dessin s'ils sont posés ; une base configurée sans appareil connu
 * marche comme avant (ses capteurs se trouvent par la base, `capteurs` nul).
 *
 * Plant Monitor (ADR 0390) RECOPIE les capteurs de la sonde sur l'appareil de la
 * plante qu'il crée (`external_sensor` dit l'original) : la sonde reste la plante, sa
 * copie n'en fait pas une de plus — sauf si la sonde se cache. La plante prend alors
 * le nom et la pièce de Plant Monitor, et ses seuils (`seuilsPlantMonitor`).
 *
 * Pur : pas de React, pas de Home Assistant. L'écran passe ce que l'index sait
 * (`ctx` : `meta(id)`, `physique(deviceId)`, `soeurs(id)`, `piece(id)`, `appareil(id)`).
 */
import { tr } from './i18n.js';
import { nombre } from './format.js';
import { signeTemp, uniteTemp, versCelsius } from './unites.js';
import { verdictsPlante, PLAGES_PLANTE } from './objets.js';
import { figeeDe, texteFigee } from './fraicheur.js';

// Les capteurs d'une plante : leur classe, et l'unité qui les reconnaît à défaut. La pile, à sa classe seule : un sol se mesure aussi en %.
const CLASSES = { hum: ['moisture', null], cond: ['conductivity', 'µS/cm'], lux: ['illuminance', 'lx'], temp: ['temperature', null], bat: ['battery', null] };

const attrs = (S, id) => (S && S[id] && S[id].attributes) || {};
function capteurDe(ids, S, [classe, unite]) {
  return ids.find(id => attrs(S, id).device_class === classe) || (unite ? ids.find(id => attrs(S, id).unit_of_measurement === unite) : null) || null;
}
// La copie d'un capteur par Plant Monitor : l'original qu'elle nomme, s'il existe.
const originalDe = (S, id) => { const x = attrs(S, id).external_sensor; return typeof x === 'string' && S[x] ? x : null; };
// Ses seuils : les `number` de l'appareil de la plante, à leur clé de traduction (`min_moisture`…), jamais à leur identifiant.
const MOTS_PM = { hum: 'moisture', temp: 'temperature', lux: 'illuminance', cond: 'conductivity' };

/** Le début commun de plusieurs identifiants, coupé à son dernier « _ » : `sensor.ficus_moisture` et `sensor.ficus_conductivity`
 *  donnent `sensor.ficus`. */
export function baseCommune(ids) {
  if (!ids.length) return '';
  let p = ids[0];
  ids.forEach(id => { let i = 0; while (i < p.length && i < id.length && p[i] === id[i]) i++; p = p.slice(0, i); });
  if (ids.every(id => id === p)) return p;
  const i = p.lastIndexOf('_');
  return i > p.indexOf('.') ? p.slice(0, i) : p;
}

/** Les plantes découvertes, une par appareil : `[{ base, nom, piece, capteurs: { hum, cond, lux, temp, bat }, pm }]` — `pm` : la plante
 *  de Plant Monitor qui la suit (`{ plante, seuils }`, des identifiants), sinon null. */
export function plantesDecouvertes(S, ctx) {
  const out = [];
  const vus = new Set();
  const sols = new Set();
  const tous = Object.keys(S || {}).sort().filter(id => id.indexOf('sensor.') === 0 && attrs(S, id).device_class === 'moisture');
  // Les copies de Plant Monitor après les sondes : une copie dont l'original est déjà une plante n'en fait pas une seconde.
  const copies = tous.filter(id => originalDe(S, id));
  tous.filter(id => !originalDe(S, id)).concat(copies).forEach(id => {
    if (sols.has(originalDe(S, id))) return;
    const m = ctx.meta(id) || {};
    if (m.hidden || m.disabled || !m.deviceId || vus.has(m.deviceId) || !ctx.physique(m.deviceId)) return;
    // Un capteur ne joue qu'un rôle : chaque rôle se cherche parmi ceux qui restent.
    const reste = ctx.soeurs(id).filter(e => e !== id && e.indexOf('sensor.') === 0 && S[e]).sort();
    const pris = new Set([id]);
    const prendre = (cle) => { const c = capteurDe(reste.filter(e => !pris.has(e)), S, CLASSES[cle]); if (c) pris.add(c); return c; };
    const cond = prendre('cond');
    if (!cond) return;
    vus.add(m.deviceId);
    sols.add(id);
    const capteurs = { hum: id, cond, lux: prendre('lux'), temp: prendre('temp'), bat: prendre('bat') };
    // Sa plante de Plant Monitor : celle dont la copie du sol nomme ce sol — ou celle qu'elle est, quand la sonde se cache.
    const copie = originalDe(S, id) ? id : copies.find(c => originalDe(S, c) === id);
    const soeursPm = copie ? ctx.soeurs(copie) : [];
    const seuil = (mot) => soeursPm.find(e => e.indexOf('number.') === 0 && (ctx.meta(e) || {}).translationKey === mot) || null;
    // Ses copies aussi (`copies`) : une configuration posée sur leur base, du temps où elles faisaient une plante, la retrouve.
    const pm = copie ? { plante: soeursPm.find(e => e.indexOf('plant.') === 0) || null, copies: [copie].concat(soeursPm.filter(e => e.indexOf('sensor.') === 0)),
      seuils: Object.fromEntries(Object.keys(MOTS_PM).map(k => [k, [seuil('min_' + MOTS_PM[k]), seuil('max_' + MOTS_PM[k])]])) } : null;
    const nomPm = pm && pm.plante && attrs(S, pm.plante).friendly_name;
    out.push({ base: baseCommune(Object.values(capteurs).filter(Boolean)), nom: nomPm || ctx.appareil(id) || attrs(S, id).friendly_name || id,
      piece: ctx.piece(id) || (pm && pm.plante ? ctx.piece(pm.plante) : '') || '', capteurs, pm });
  });
  return out;
}

const couvre = (base, id) => !!id && (id === base || id.indexOf(base + '_') === 0);

/**
 * Les plantes de la maison, dans l'ordre de leur nom : les découvertes, complétées par `loggia_plants`, puis les bases
 * configurées sans appareil connu. `[{ base, nom, piece, img, capteurs, espece, pm }]` — `capteurs` nul pour une base sans appareil,
 * `espece` celle que `loggia_plants` garde (`especeValide`), `pm` sa plante de Plant Monitor.
 * Une configuration se lie d'abord à la plante de SA base (le choix de l'espèce l'écrit telle quelle), puis à celle dont elle couvre
 * un capteur — ou une copie de Plant Monitor —, la base la plus longue d'abord : `sensor.ficus` ne prend pas la configuration de
 * `sensor.ficus_2`. Une ligne que le choix de l'espèce a créée (`decouverte`) ne fait que compléter : sans sa plante, elle se tait.
 */
export function plantesMaison(S, ctx, config = [], comparer = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
  const conf = (Array.isArray(config) ? config : []).filter(p => p && typeof p.base === 'string' && p.base);
  const prises = new Set();
  const decouvertes = plantesDecouvertes(S, ctx);
  const liees = decouvertes.map(d => { const c = conf.find(p => !prises.has(p) && p.base === d.base); if (c) prises.add(c); return c; });
  const out = decouvertes.map((d, i) => {
    let c = liees[i];
    if (!c) {
      const ids = Object.values(d.capteurs).concat(d.pm ? d.pm.copies : []);
      c = conf.filter(p => !prises.has(p) && ids.some(id => couvre(p.base, id))).sort((a, b) => b.base.length - a.base.length)[0];
      if (c) prises.add(c);
    }
    return { base: c ? c.base : d.base, nom: (c && c.name) || d.nom, piece: (c && c.room) || d.piece, img: (c && c.img) || null, capteurs: d.capteurs,
      espece: especeValide(c && c.espece), pm: d.pm };
  });
  conf.forEach(p => { if (!prises.has(p) && !p.decouverte) out.push({ base: p.base, nom: p.name || p.base, piece: p.room || '', img: p.img || null, capteurs: null, espece: especeValide(p.espece), pm: null }); });
  return out.sort((a, b) => comparer(a.nom, b.nom));
}

/* ── Les seuils d'une plante, ceux de son espèce (ADR 0390) ─────────────────────────────────────────────────────────────────
 *
 * Un administrateur choisit l'espèce dans la fiche ; Open Plantbook (l'intégration `openplantbook` de Home Assistant, ses clés y
 * restent) donne ses plages, que `loggia_plants` GARDE : l'entité `openplantbook.<espèce>` ne survit pas à un redémarrage. Chaque
 * mesure se juge sur la plage de l'espèce, sinon sur celle de Plant Monitor, sinon sur la table générale (`PLAGES_PLANTE`). */
const CLES_PLAGES = ['hum', 'temp', 'lux', 'cond'];
// Une plage lisible : deux nombres finis, le bas sous le haut. Sinon rien — la mesure garde l'autre source.
const plage = (x) => (Array.isArray(x) && x.length === 2 && x.every(n => typeof n === 'number' && Number.isFinite(n)) && x[0] <= x[1] ? [x[0], x[1]] : null);

/** L'image d'une espèce, ou null : une adresse http(s), une page de Home Assistant (`/local/…`, quand l'intégration la télécharge), ou
 *  un fichier servi avec Loggia (`./…`, la démo) — rien d'autre. */
export const imageEspece = (x) => (typeof x === 'string' && /^(https?:\/\/|\.?\/(?![/\\]))/.test(x) ? x : null);

/** L'espèce gardée dans `loggia_plants`, relue sans confiance : `{ pid, nom, image, plages }`, ou null. */
export function especeValide(e) {
  if (!e || typeof e !== 'object' || typeof e.pid !== 'string' || !e.pid) return null;
  const plages = {};
  CLES_PLAGES.forEach(k => { const p = plage(e.plages && e.plages[k]); if (p) plages[k] = p; });
  // Le dessin de la carte, choisi avec l'espèce (`dessinEspece`, especes.js) : une clé de `PLANT_ART`, rien d'autre.
  const dessin = typeof e.dessin === 'string' && /^[a-z]{2,20}$/.test(e.dessin) ? e.dessin : null;
  return { pid: e.pid, nom: typeof e.nom === 'string' && e.nom ? e.nom : e.pid, image: imageEspece(e.image), plages, dessin };
}

/** Les plages d'une plante : `{ plages, source }` — la table entière ; `source` dit d'où vient la première plage qui n'est pas la
 *  table générale : 'espece', 'plantmonitor', ou null. */
export function plagesPlante(espece, seuilsPm = null) {
  const plages = {};
  let source = null;
  CLES_PLAGES.forEach(k => {
    const e = espece && espece.plages ? plage(espece.plages[k]) : null;
    const m = e ? null : plage(seuilsPm && seuilsPm[k]);
    if (e) source = 'espece'; else if (m && !source) source = 'plantmonitor';
    plages[k] = e || m || PLAGES_PLANTE[k];
  });
  return { plages, source };
}

/** Les seuils de Plant Monitor, lus dans ses `number` : `{ hum: [a, b], … }` — la température en Celsius, comme `lirePlante`. Un
 *  seuil illisible laisse sa mesure à l'autre source. */
export function seuilsPlantMonitor(S, pm, hass = null) {
  if (!pm || !pm.seuils) return null;
  const lu = (id, k) => {
    const e = id && S[id];
    const n = e ? parseFloat(e.state) : NaN;
    return isNaN(n) ? null : k === 'temp' ? versCelsius(n, uniteTemp(e.attributes, hass)) : n;
  };
  return Object.fromEntries(CLES_PLAGES.map(k => [k, (pm.seuils[k] || []).map(id => lu(id, k))]));
}

/* ── La vue d'une plante (chantier Capteurs, étape 3 ; C30, C31, § 7.2, § 7.3) ───────────────────
 *
 * Ce que la carte, la compacte, la fiche et la section Plantes et piles lisent d'une
 * plante (`lirePlante`, App.jsx : son sol, sa lumière, sa température, son engrais, sa
 * pile, et si son capteur de sol se tait). `verdictsPlante` (objets.js) juge sur les
 * plages de la plante (`plages`, ADR 0390 : son espèce, Plant Monitor), sinon sur la
 * table générale — le sol de 15 à 70 %, 10 à 32 °C, 500 à 20 000 lx, 350 à 2 000 µS/cm.
 * Le calme est neutre (C5) ; l'ambre ne dit que ce qui presse ; jamais « Tout lui
 * convient ». */

const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/* Les mots de la carte, dits au rendu : ce qui presse — les mots d'aujourd'hui, en tête de phrase —, le sol au calme. */
const motsPlante = () => ({ presse: { arroser: tr('à arroser'), lumiere: tr('lumière faible'), temperature: tr('température hors plage') }, ok: tr('Humidité correcte'), humide: tr('Sol très humide') });
// Les glyphes des quatre mesures, et leur unité écrite.
const MESURES_PLANTE = [['hum', 'raindrops'], ['lux', 'brightness'], ['temp', 'thermometer-half'], ['cond', 'leaf']];

/**
 * La vue d'une plante : `{ phrase, ton, sol, chiffre, mesures, presse, regarder, jugee, muette }`.
 *  1. muette (son capteur de sol se tait) : « Indisponible depuis {quand} » — `quand(ms)` écrit l'heure —, en rouge (`ton` 'bad') ;
 *  2. ce qui presse (`verdictsPlante`), deux au plus : « À arroser · Lumière faible », en ambre ('warn') ;
 *  3. sinon le mot du sol : « Humidité correcte », « Sol très humide », en neutre (null) ;
 *  4. sans mesure du sol : « Mesure absente ».
 * `mesures` : sol, lumière, température, engrais — la valeur écrite dans l'unité du capteur, et `presse` pour l'ambre (l'engrais
 * reste neutre sur la carte). `regarder` (C33) : une plante qui presse ou qui se tait ; `jugee` : la section sait quoi en dire.
 */
export function vuePlante(pl, { quand = null, deCelsius = (x) => x } = {}) {
  const p = pl || {};
  const v = verdictsPlante(p);
  const M = motsPlante();
  const muette = !!p.mort;
  // Son sol figé au jugement du serveur (ADR 0311) : son dernier relevé, et rien ne presse sur une valeur d'hier.
  const figee = p.ids ? figeeDe(p.ids.hum) : null;
  const presse = figee ? [] : v.presse.slice(0, 2).map(x => M.presse[x]);
  const uT = p.uniteTemp || 'C';
  const phrase = muette ? (p.muetDepuis != null && quand ? tr('Indisponible depuis {h}', { h: quand(p.muetDepuis) }) : tr('Indisponible'))
    : figee ? texteFigee(figee) : presse.length ? presse.map(majuscule).join(' · ') : v.hum ? (v.hum === 'humide' ? M.humide : M.ok) : tr('Mesure absente');
  const valeur = { hum: p.hum == null ? null : nombre(p.hum, 0) + '\u00a0%', lux: p.lux == null ? null : nombre(p.lux, 0) + '\u00a0lx',
    temp: p.temp == null ? null : nombre(deCelsius(p.temp, uT), 1, 0) + '\u00a0' + signeTemp(uT), cond: p.cond == null ? null : nombre(p.cond, 0) + '\u00a0µS/cm' };
  const pressant = { hum: v.hum === 'sec', lux: v.lux === 'faible', temp: v.temp === 'froid' || v.temp === 'chaud', cond: false };
  const sol = muette || p.hum == null ? null : Math.round(p.hum);
  return {
    phrase, ton: muette ? 'bad' : presse.length ? 'warn' : null, sol, chiffre: sol == null ? '\u2014' : nombre(sol, 0) + '\u00a0%',
    mesures: MESURES_PLANTE.map(([cle, glyphe]) => ({ cle, glyphe, valeur: muette ? null : valeur[cle], presse: !muette && !figee && pressant[cle] })),
    presse: v.presse, regarder: muette || presse.length > 0, jugee: muette || p.hum != null, muette,
  };
}

/**
 * Les conseils de la fiche (C31) : une phrase par mesure qui presse, dans l'unité du capteur ; puis « L'arrosage peut attendre. »
 * si le sol va bien et qu'autre chose presse. Rien au calme.
 */
export function conseilsPlante(pl, { deCelsius = (x) => x } = {}) {
  const p = pl || {};
  const v = verdictsPlante(p);
  const P = p.plages || PLAGES_PLANTE;
  // Un capteur en kelvins : les conseils parlent en °C — leurs phrases écrivent « °{u} », et « °K » n'existe pas.
  const uT = p.uniteTemp === 'K' ? 'C' : p.uniteTemp || 'C';
  const t = (x) => nombre(deCelsius(x, uT), 1, 0);
  const out = [];
  if (v.hum === 'sec') out.push(tr('Arrosez-la : le sol est à {n} %, il lui en faut au moins {min} %.', { n: nombre(p.hum, 0), min: nombre(P.hum[0], 0) }));
  if (v.lux === 'faible') out.push(tr('Rapprochez-la d’une fenêtre : {n} lx reçus, il lui en faut au moins {min}.', { n: nombre(p.luxJour != null ? p.luxJour : p.lux, 0), min: nombre(P.lux[0], 0) }));
  if (v.temp === 'froid') out.push(tr('Mettez-la au chaud : {n} °{u}, elle demande au moins {min} °{u}.', { n: t(p.temp), min: t(P.temp[0]), u: uT }));
  if (v.temp === 'chaud') out.push(tr('Éloignez-la de la chaleur : {n} °{u}, au-delà de {max} °{u}.', { n: t(p.temp), max: t(P.temp[1]), u: uT }));
  if (out.length && v.hum === 'ok') out.push(tr('L’arrosage peut attendre.'));
  return out;
}

/* L'échelle de chaque mesure, pour la barre de la fiche : le sol de 0 à 100 %, la température de 0 à 40 °C, l'engrais de 0 à
 * 3 000 µS/cm ; la lumière de 1 à 100 000 lx, sur une échelle logarithmique (§ 7.3). */
const ECHELLES_PLANTE = { hum: [0, 100, false], temp: [0, 40, false], lux: [1, 100000, true], cond: [0, 3000, false] };
/** La barre d'une mesure : `{ plage: [a, b], pos }` en pourcentage de l'échelle — la plage idéale (celle de la plante, `plages`), et le
 *  repère à la valeur (null sans valeur). */
export function barrePlante(cle, valeur, plages = null) {
  const [min, max, log] = ECHELLES_PLANTE[cle];
  const [a, b] = (plages || PLAGES_PLANTE)[cle];
  const f = (x) => { const v = Math.max(min, Math.min(max, x)); const p = log ? (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)) : (v - min) / (max - min); return Math.round(p * 1000) / 10; };
  return { plage: [f(a), f(b)], pos: valeur == null || isNaN(valeur) ? null : f(valeur) };
}

/** Le dernier relevé d'une plante muette, dans les statistiques à l'heure de Home Assistant : `{ quand, sol, pile }`, ou null sans relevé. */
export function dernierReleve(reponse, idSol, idPile) {
  const r = reponse && typeof reponse === 'object' ? reponse : {};
  /* Une ligne compte si sa moyenne est un NOMBRE (audit du 12/11, B24) : `Number(null)` vaut 0, et une heure sans relevé
   * (`mean: null`) passait pour « sol 0 % » à la place du relevé d'avant. */
  const dernier = (id) => { const l = Array.isArray(r[id]) ? r[id].filter(x => x && typeof x.mean === 'number' && Number.isFinite(x.mean)) : []; return l.length ? l[l.length - 1] : null; };
  const sol = dernier(idSol);
  if (!sol) return null;
  const pile = idPile ? dernier(idPile) : null;
  return { quand: Number(sol.end != null ? sol.end : sol.start), sol: Math.round(Number(sol.mean)), pile: pile ? Math.round(Number(pile.mean)) : null };
}

/** « 14:05 » aujourd'hui, « sam. 14:05 » dans les six jours, « 5 oct., 14:05 » au-delà — l'année en plus si ce n'est pas
 *  celle-ci : l'instant d'un relevé ou d'un silence, dans la langue de l'écran. Le patron de `heureAVenir` (format.js), vers le
 *  passé : à sept jours, « lun. » se lirait comme la semaine en cours, et un relevé vieux de dix jours disait « lun. 14:05 » (audit
 *  du 19/10, lot 4). Les jours se comptent au CALENDRIER local. */
export function quandPlante(t, maintenant, loc) {
  const d = new Date(t), auj = new Date(maintenant);
  const heure = { hour: '2-digit', minute: '2-digit' };
  const h = d.toLocaleTimeString(loc, heure);
  const jours = Math.round((Date.UTC(auj.getFullYear(), auj.getMonth(), auj.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (jours === 0) return h;
  if (jours > 0 && jours < 7) return d.toLocaleDateString(loc, { weekday: 'short' }) + ' ' + h;
  return d.toLocaleString(loc, { day: 'numeric', month: 'short', ...(d.getFullYear() !== auj.getFullYear() ? { year: 'numeric' } : {}), ...heure });
}
