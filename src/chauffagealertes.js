/* Les alertes que disent les capteurs de l'APPAREIL d'un chauffage : pression d'eau basse, granulés bas (chantier du 20/11, A10).
 *
 * À part de `chauffageseuils.js` (ADR 0385) : la fiche du chauffage les écrit, mais la carte n'a besoin que de la vanne — ce module-ci
 * ne se charge qu'avec la fiche, le démarrage n'en embarque rien. Mêmes règles : jamais un nom, une entité se reconnaît à sa
 * `device_class` ou à sa clé de traduction, parmi les entités du MÊME appareil que le thermostat.
 *
 * Pur : `tr` pour les mots, et ce qu'on lui passe — les états (`S`) et l'index des entités (`meta`, une Map `entity_id → fiche`). */
import { tr } from './i18n.js';
import { nombre } from './format.js';
import { voisinsDeLAppareil, mesure, vanneDeLAppareil } from './chauffageseuils.js';

/** Sous cette pression l'eau d'une chaudière ne circule plus bien : 0,8 bar, le seuil que la plupart des notices donnent (1 à 1,5 bar
 * à froid) et que la carte d'origine retient. */
export const SEUIL_PRESSION_BAR = 0.8;
/** Le stock de granulés, quand l'intégration le donne en pourcentage : sous 10 %, un ou deux jours de grand froid. */
export const SEUIL_GRANULES_PCT = 10;
// Ce que chaque unité de pression vaut en bar. Une pression sans unité ne se lit pas : on ne suppose pas des bars.
const EN_BAR = { bar: 1, mbar: 0.001, hpa: 0.001, kpa: 0.01, pa: 0.00001, mpa: 10, psi: 0.0689476 };
const PRESSION = /(^|_)pressure($|_)/;
const GRANULES = /pellet/;

/** Une pression ramenée en bars ; null si l'unité est absente ou inconnue, ou la valeur illisible. */
export function pressionEnBar(valeur, unite) {
  const n = Number(valeur);
  const k = EN_BAR[String(unite == null ? '' : unite).trim().toLowerCase()];
  return valeur !== '' && valeur != null && Number.isFinite(n) && k != null ? n * k : null;
}

/**
 * Ce que dit l'appareil d'un chauffage : `{ alertes, vanne }`.
 *  - `alertes` : `[{ cle: 'pression' | 'granules', id, texte }]` — « Pression de la chaudière basse · 0,6 bar », « Granulés bas · 8 % » ;
 *  - `vanne` : l'ouverture de la vanne en pour cent (`{ id, pct }`), ou null — sans capteur reconnu, ou muet.
 * `entite` : le thermostat ; `S` : les états ; `meta` : `LOGGIA_INDEX.entityMeta`. Rien sur un appareil que l'index ne connaît pas.
 */
export function signauxDeLAppareil(entite, S, meta) {
  const vide = { alertes: [], vanne: null };
  if (!entite || !S) return vide;
  const ids = voisinsDeLAppareil(meta, entite);
  if (!ids.length) return vide;
  let pression = null, granules = null;
  for (const id of ids) {
    if (id === entite || id.indexOf('sensor.') !== 0) continue;
    const st = S[id], m = meta.get(id) || {};
    const n = mesure(st);
    if (n === null || m.disabled || m.hidden) continue;
    const at = st.attributes || {};
    const cle = String(m.translationKey || '').toLowerCase();
    const classe = m.deviceClass || at.device_class;
    if (classe === 'pressure' || PRESSION.test(cle)) {
      const bar = pressionEnBar(n, at.unit_of_measurement);
      if (bar !== null && (pression === null || bar < pression.bar)) pression = { id, bar };
    } else if (GRANULES.test(cle) && String(at.unit_of_measurement || '').trim() === '%') {
      // Seulement un POURCENTAGE : des kilos ou des centimètres de granulés, personne ne sait où est « bas » sans la taille du réservoir.
      if (granules === null || n < granules.n) granules = { id, n };
    }
  }
  const alertes = [];
  if (pression && pression.bar < SEUIL_PRESSION_BAR) {
    alertes.push({ cle: 'pression', id: pression.id, texte: tr('Pression de la chaudière basse') + ' · ' + nombre(pression.bar, 2, 1) + ' bar' });
  }
  if (granules && granules.n < SEUIL_GRANULES_PCT) {
    alertes.push({ cle: 'granules', id: granules.id, texte: tr('Granulés bas') + ' · ' + nombre(granules.n, 0) + ' %' });
  }
  return { alertes, vanne: vanneDeLAppareil(entite, S, meta) };
}
