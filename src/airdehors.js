/* ── L'air et les pollens du DEHORS, pour la fiche météo (chantier G4, A1 et A6 ; ADR 0303) ──────────────────────────────────
 *
 * Deux INFORMATIONS de la fiche météo, jamais une alerte ni un point d'attention : la qualité de l'air du dehors et les pollens.
 * Un `aqi` de Home Assistant ne dit pas son échelle (62 est « Modéré » pour l'EPA, hors de l'indice ATMO, « Bon » pour l'indice
 * universel de Google, qui va à l'envers) : il ne se lit que si son échelle est CONNUE, et les échelles sont celles de la table
 * (`INDICES`, confort.js). Dans cet ordre :
 *  1. par sa PLATEFORME, en ce seul cas — l'échelle est écrite dans la documentation de l'intégration (`PAR_PLATEFORME`) ;
 *  2. par un capteur À CHOIX frère, sur le même appareil, dont les options sont celles d'une échelle connue (AirVisual, Google,
 *     AccuWeather) : son rang. Avec un seul indice sur l'appareil, le chiffre est celui de cet indice ; sinon, le mot seul — un
 *     chiffre qu'on ne sait pas apparier ne s'écrit pas. Des choix d'une même série (« day 0 », « day 1 ») donnent le lendemain.
 * Sinon : rien, et pas de tuile. L'indice universel de Google ne se lit JAMAIS au chiffre : son rang vient de sa catégorie.
 *
 * Chargé avec la fiche, jamais au démarrage. Pur : `S`, les états ; `meta(id)`, ce que l'index sait d'une entité
 * (`platform`, `deviceId`, `translationKey`, `name`, `hidden`, `disabled`). Testé à sec (tests/g4_air_meteo.test.mjs).
 */
import { tr, comparerTextes } from './i18n.js';
import { sansAccents } from './outils.js';
import { rangIndice, indiceDesChoix } from './confort.js';

const muet = (st) => !st || st.state === 'unavailable' || st.state === 'unknown' || String(st.state).trim() === '';
const capteurs = (S) => Object.keys(S || {}).filter(id => id.indexOf('sensor.') === 0 && !muet(S[id])).sort();
const lu = (meta, id) => meta(id) || {};
const visible = (m) => !m.hidden && !m.disabled;
// Le texte d'une entité, sans accents ni ponctuation, entouré d'espaces : son nom affiché, son identifiant, son nom au registre.
const texte = (S, id, m) => ' ' + sansAccents([(S[id].attributes || {}).friendly_name, id.replace(/[._]/g, ' '), m.name].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
// Le lendemain d'Atmo France : « Qualité globale-Paris-J+1 », `sensor.qualite_globale_paris_j_1`.
const LENDEMAIN = / j 1 /;
// Le numéro de jour d'une prévision qui en porte un (« Air quality day 1 » d'AccuWeather) ; 0 sinon.
const jourDe = (id) => { const x = /_(\d+)$/.exec(id); return x ? Number(x[1]) : 0; };
const chiffre = (v) => String(Math.round(Number(v)));

/* L'échelle écrite par la plateforme — en ce seul cas, l'échelle se lit à la plateforme (A1) :
 *  - Atmo France (HACS, sebcaps/atmofrance) : « Qualité globale-<ville> », l'indice ATMO de 1 à 6, SANS classe `aqi`. Ses
 *    sous-indices (NO₂, O₃, PM10, PM2,5, SO₂) et ses niveaux de pollen (« Niveau Graminé », « Qualité globale Pollen ») sont, eux,
 *    des nombres de 1 à 6 — jamais l'indice de l'air ;
 *  - AirNow : l'AQI de l'EPA ;
 *  - Ambient Weather : l'AQI PM2,5 du DEHORS, à sa clé de traduction ; ceux de la sonde intérieure et de l'AQIN sont la maison ;
 *  - AirVisual : l'AQI « U.S. » (l'EPA) ; le « Chinese », non ;
 *  - Airly : le CAQI européen (clé `caqi`, unité « CAQI »). */
const PAR_PLATEFORME = {
  atmofrance: (t) => (/ qualite globale /.test(t) && !/ pollen /.test(t) && !LENDEMAIN.test(t) ? 'atmo' : null),
  airnow: (t, m, a) => (a.device_class === 'aqi' ? 'epa' : null),
  ambient_station: (t, m) => (m.translationKey === 'pm25_aqi' || m.translationKey === 'pm25_aqi_24h_average' ? 'epa' : null),
  airvisual: (t, m, a) => (a.device_class === 'aqi' && / u s /.test(t) ? 'epa' : null),
  airly: (t, m, a) => (m.translationKey === 'caqi' || a.unit_of_measurement === 'CAQI' ? 'caqi' : null),
};

/** Le lendemain d'Atmo France (son option J+1) : l'indice global « -J+1 » du même appareil ; null sans lui. */
function lendemainAtmo(S, meta, ids, m0) {
  const id = ids.find(x => { const m = lu(meta, x); return m.platform === 'atmofrance' && visible(m) && m.deviceId === m0.deviceId && LENDEMAIN.test(texte(S, x, m)) && / qualite globale /.test(texte(S, x, m)) && !/ pollen /.test(texte(S, x, m)); });
  return id ? rangIndice('atmo', S[id].state) : null;
}

/**
 * L'air du dehors : `{ id, echelle, valeur, rang, demain }` — l'entité lue, sa clé dans la table, ce que la tuile écrit en grand
 * (le chiffre, ou le mot quand il n'y a pas de chiffre sûr), son rang (`rangIndice`) et celui du lendemain ; null si aucune
 * échelle n'est connue.
 */
export function airDuDehors(S, meta) {
  const ids = capteurs(S);
  for (const p of Object.keys(PAR_PLATEFORME)) {
    for (const id of ids) {
      const m = lu(meta, id);
      if (m.platform !== p || !visible(m)) continue;
      const a = S[id].attributes || {};
      const echelle = PAR_PLATEFORME[p](texte(S, id, m), m, a);
      const rang = echelle ? rangIndice(echelle, S[id].state) : null;
      if (rang) return { id, echelle, valeur: chiffre(S[id].state), rang, demain: p === 'atmofrance' ? lendemainAtmo(S, meta, ids, m) : null };
    }
  }
  // Un capteur à choix frère : par appareil, ses indices et ses choix d'une échelle de l'air connue.
  const parAppareil = new Map();
  for (const id of ids) {
    const m = lu(meta, id);
    if (!m.deviceId || !visible(m)) continue;
    const a = S[id].attributes || {};
    const echelle = a.device_class === 'enum' ? indiceDesChoix(a.options) : null;
    if (a.device_class !== 'aqi' && !echelle) continue;
    if (!parAppareil.has(m.deviceId)) parAppareil.set(m.deviceId, { indices: [], choix: [] });
    if (echelle) parAppareil.get(m.deviceId).choix.push({ id, echelle });
    else parAppareil.get(m.deviceId).indices.push(id);
  }
  for (const [, d] of [...parAppareil].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    // Une seule série : des choix qui ne diffèrent que par leur numéro de jour. Deux séries (l'indice US et le chinois) : on ne choisit pas.
    if (!d.choix.length || new Set(d.choix.map(c => c.id.replace(/_\d+$/, ''))).size !== 1) continue;
    const serie = d.choix.slice().sort((x, y) => jourDe(x.id) - jourDe(y.id));
    // Sans jour 0 (muet ou désactivé), le jour 1 ne passe pas pour aujourd'hui (relecture G4, point 3).
    if (jourDe(serie[0].id) !== 0) continue;
    const rang = rangIndice(serie[0].echelle, S[serie[0].id].state);
    if (!rang) continue;
    const suivant = serie[1] && jourDe(serie[1].id) === jourDe(serie[0].id) + 1 ? rangIndice(serie[1].echelle, S[serie[1].id].state) : null;
    // Le chiffre, seulement d'un indice seul sur l'appareil — et jamais celui de Google, à l'envers : 85 y est excellent.
    const seul = d.indices.length === 1 && serie.length === 1 && serie[0].echelle !== 'uaqi' ? d.indices[0] : null;
    const valeur = seul && /^\d+(\.\d+)?$/.test(String(S[seul].state).trim()) ? chiffre(S[seul].state) : rang.t;
    return { id: serie[0].id, echelle: serie[0].echelle, valeur, rang, demain: suivant };
  }
  return null;
}

/* Les plantes des pollens : la clé de traduction d'AccuWeather, sinon les mots du nom (Atmo France : « Niveau Graminé »). */
const PLANTES = () => [
  [/ ambroisie | ragweed /, 'ragweed_pollen', tr('Ambroisie')], [/ armoise | mugwort /, null, tr('Armoise')], [/ aulne | alder /, null, tr('Aulne')],
  [/ bouleau | birch /, null, tr('Bouleau')], [/ gramin| grass /, 'grass_pollen', tr('Graminées')], [/ olivier | olive /, null, tr('Olivier')],
  [/ tree | arbres? /, 'tree_pollen', tr('Arbres')], [/ mold | mould | moisissures? /, 'mold_pollen', tr('Moisissures')],
];
const planteDe = (t, cle) => { const p = PLANTES().find(([re, k]) => (cle && k === cle) || re.test(t)); return p ? p[2] : null; };
const POLLEN_M3 = /^p\/m(³|3)$/;

/**
 * Les pollens du dehors (A6) : `{ rang, plantes }` — le niveau du jour et les plantes qui le portent (quand il n'est pas au plus
 * bas) ; null sans capteur de pollen à échelle connue :
 *  - Atmo France, à sa plateforme et à ses noms : « Qualité globale Pollen » (le niveau du jour), « Niveau <plante> » ; ni le
 *    lendemain (« -J+1 »), ni les concentrations ;
 *  - une concentration en p/m³ qui porte son niveau (`level` : low … extreme — AccuWeather) : le jour 0.
 */
export function pollensDuDehors(S, meta) {
  const ids = capteurs(S);
  const plantes = [];
  let global = null;
  for (const id of ids) {
    const m = lu(meta, id);
    if (!visible(m)) continue;
    const a = S[id].attributes || {};
    const t = texte(S, id, m);
    if (m.platform === 'atmofrance') {
      if (LENDEMAIN.test(t) || / concentration /.test(t)) continue;
      const r = / pollen /.test(t) && / qualite globale /.test(t) ? rangIndice('pollen_atmo', S[id].state) : null;
      if (r) { global = r; continue; }
      const nom = / niveau /.test(t) ? planteDe(t, null) : null;
      const rp = nom ? rangIndice('pollen_atmo', S[id].state) : null;
      if (rp) plantes.push({ nom, rang: rp });
    } else if (POLLEN_M3.test(String(a.unit_of_measurement || '').trim()) && jourDe(id) === 0) {
      const rp = rangIndice('pollen_choix', a.level);
      const nom = rp ? planteDe(t, m.translationKey) : null;
      if (nom) plantes.push({ nom, rang: rp });
    }
  }
  const rang = global || plantes.reduce((x, p) => (!x || p.rang.i > x.i ? p.rang : x), null);
  if (!rang) return null;
  const noms = rang.i > 0 ? plantes.filter(p => p.rang.i === rang.i).map(p => p.nom) : [];
  return { rang, plantes: [...new Set(noms)].sort(comparerTextes) };
}
