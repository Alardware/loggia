/* ── Les piles et batteries de la maison (vue Énergie, 19/09) ─────────────────
 *
 * Demande : « dans Énergie, à la suite des postes de consommation, on pourrait
 * ajouter les nouveaux capteurs de batterie, non ? » — les cartes à cinq
 * barres de la v3.57.0 (ADR 0057), toutes au même endroit.
 *
 * Un capteur de pile, c'est sa classe Home Assistant (`battery`), jamais son
 * nom. Les entités masquées ou désactivées restent dehors ; celles de
 * DIAGNOSTIC, non : c'est la catégorie de presque toutes les piles Zigbee, et
 * c'est d'elles qu'on parle. Les téléphones non plus (« retire les téléphones
 * de la liste des piles », même jour) : reconnus à leur intégration,
 * l'application Home Assistant (`mobile_app`) — tablettes comprises.
 *
 * La plus basse d'abord — c'est celle qu'on change —, puis les capteurs
 * muets : une pile à plat se tait souvent (voir `veilles.py`), elle ne doit
 * pas disparaître pour autant.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec.
 */

const MUETS = ['unavailable', 'unknown'];

/** Les piles : [{ id, niveau }] triées, `niveau` nul pour un capteur muet.
 * `meta(id)` rend { hidden, disabled, platform } (le registre des entités). */
export function pilesMaison(S, meta = () => ({})) {
  const etats = S && typeof S === 'object' ? S : {};
  const nomDe = (id) => {
    const a = etats[id] && etats[id].attributes;
    return String((a && a.friendly_name) || id);
  };
  const out = [];
  Object.keys(etats).forEach(id => {
    if (id.indexOf('sensor.') !== 0) return;
    const st = etats[id];
    const a = (st && st.attributes) || {};
    if (a.device_class !== 'battery') return;
    const m = meta(id) || {};
    if (m.hidden || m.disabled || m.platform === 'mobile_app') return;
    const brut = st.state == null ? '' : String(st.state);
    const n = parseFloat(brut);
    if (MUETS.indexOf(brut) >= 0) out.push({ id, niveau: null });
    else if (!isNaN(n)) out.push({ id, niveau: n });
  });
  return out.sort((x, y) => {
    if (x.niveau == null || y.niveau == null) {
      if (x.niveau != null) return -1;
      if (y.niveau != null) return 1;
    } else if (x.niveau !== y.niveau) return x.niveau - y.niveau;
    return nomDe(x.id).localeCompare(nomDe(y.id), 'fr');
  });
}
