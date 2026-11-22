/* Ce que le capteur de vanne de l'APPAREIL d'un chauffage dit de lui-même (chantier du 20/11, A10).
 *
 * Une tête thermostatique publie l'ouverture de sa vanne : une vanne ouverte fait dire « chauffe » à une tête qui ne publie pas son
 * `hvac_action`. La pression d'une chaudière et le stock de granulés d'un poêle, eux, se DISENT dans la fiche : `chauffagealertes.js`,
 * à part (ADR 0385) — la carte du démarrage n'a besoin que de la vanne.
 *
 * Jamais un nom : une entité se reconnaît à sa `device_class` ou à sa clé de traduction (l'index, `entityMeta`), et seulement parmi
 * les entités du MÊME appareil que le thermostat. Les clés ci-dessous sont celles que les intégrations de Home Assistant publient
 * (ZHA et Matter : `valve_position`, `pi_heating_demand`, ZHA : `heating_demand`) ; une intégration qui n'en pose pas — Zigbee2MQTT,
 * MQTT en général, l'intégration MCZ — n'est pas reconnue, et on ne le devine pas.
 *
 * Pur : ce qu'on lui passe — les états (`S`) et l'index des entités (`meta`, une Map `entity_id → fiche`). */

/** Une vanne ouverte de moins de 5 % ne chauffe pas : la tête reste « au repos ». */
export const SEUIL_VANNE_PCT = 5;

// Les clés de traduction de l'ouverture d'une vanne (sa position, la demande de chauffe d'une tête).
const CLES_VANNE = ['valve_position', 'pi_heating_demand', 'heating_demand'];

/* Les entités du même appareil que `entite`, mémorisées par index : une carte les relit à chaque rendu, et l'index compte des
 * milliers d'entités. Un nouvel index (rechargement) est une autre Map, donc un autre cache. */
const PAR_INDEX = new WeakMap();
/** Les entités que porte le même appareil — la sienne comprise — ; [] sans appareil connu. */
export function voisinsDeLAppareil(meta, entite) {
  if (!meta || typeof meta.get !== 'function' || typeof meta.forEach !== 'function') return [];
  const m = meta.get(entite);
  if (!m || !m.deviceId) return [];
  let table = PAR_INDEX.get(meta);
  if (!table || table.taille !== meta.size) {
    table = { taille: meta.size, appareils: new Map() };
    meta.forEach((x, id) => {
      if (!x || !x.deviceId) return;
      const liste = table.appareils.get(x.deviceId) || [];
      liste.push(id);
      table.appareils.set(x.deviceId, liste);
    });
    PAR_INDEX.set(meta, table);
  }
  return table.appareils.get(m.deviceId) || [];
}

// Le nombre d'un capteur vivant ; null s'il est muet ou n'en est pas un.
export function mesure(st) {
  if (!st || st.state === '' || st.state == null || st.state === 'unavailable' || st.state === 'unknown') return null;
  const n = Number(st.state);
  return Number.isFinite(n) ? n : null;
}

/**
 * L'ouverture de la vanne de l'appareil d'un chauffage en pour cent (`{ id, pct }`, la plus ouverte), ou null — sans capteur reconnu,
 * ou muet. `entite` : le thermostat ; `S` : les états ; `meta` : `LOGGIA_INDEX.entityMeta`. Rien sur un appareil que l'index ne connaît pas.
 */
export function vanneDeLAppareil(entite, S, meta) {
  if (!entite || !S) return null;
  let vanne = null;
  for (const id of voisinsDeLAppareil(meta, entite)) {
    if (id === entite || id.indexOf('sensor.') !== 0) continue;
    const m = meta.get(id) || {};
    const n = mesure(S[id]);
    if (n === null || m.disabled || m.hidden) continue;
    // Une pression n'est jamais une vanne, même sous une clé de vanne.
    if ((m.deviceClass || (S[id].attributes || {}).device_class) === 'pressure') continue;
    if (CLES_VANNE.indexOf(String(m.translationKey || '').toLowerCase()) >= 0 && (vanne === null || n > vanne.pct)) vanne = { id, pct: n };
  }
  return vanne;
}

/** La vanne d'une tête thermostatique est-elle ouverte ? `vanne` : ce que `vanneDeLAppareil` rend (`{ pct }`), ou un nombre. */
export function vanneOuverte(vanne) {
  const pct = vanne != null && typeof vanne === 'object' ? vanne.pct : vanne;
  return typeof pct === 'number' && Number.isFinite(pct) && pct >= SEUIL_VANNE_PCT;
}
