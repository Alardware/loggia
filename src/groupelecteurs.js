/* ── Grouper et dégrouper les enceintes depuis la fiche (chantier du 20/11, P6 ; ADR 0383) ──
 *
 * Pur, chargé avec la fiche d'un lecteur. Un lecteur se groupe s'il porte le bit GROUPING de `supported_features` (lecteur.js) ;
 * avec qui : les autres lecteurs qui le portent aussi, de la MÊME intégration — Home Assistant ne groupe pas une enceinte Music
 * Assistant avec une Sonos. Qui est déjà dedans : `group_members`, que l'intégration publie (le premier est le meneur).
 * Les ordres sont ceux de Home Assistant : `media_player.join` (`group_members`) et `media_player.unjoin`. Rien ne joue de soi-même :
 * grouper ne lance aucune lecture.
 */
import { comparerTextes } from './i18n.js';

const GROUPING = 524288;

const bits = (st) => Number(st && st.attributes && st.attributes.supported_features) || 0;
const muet = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';
/** Le lecteur sait-il se grouper ? */
export const peutGrouper = (st) => !muet(st) && (bits(st) & GROUPING) === GROUPING;

/** Les membres du groupe de `id`, lui excepté. */
export function membresDe(id, S) {
  const g = S && S[id] && S[id].attributes && S[id].attributes.group_members;
  return (Array.isArray(g) ? g : []).filter(x => typeof x === 'string' && x !== id);
}

/** Les lecteurs qu'on peut lui joindre : `[{ id, nom, dans }]`, triés par nom. `plateforme(id)` : son intégration. */
export function candidatsGroupe(id, ids, S, plateforme) {
  if (!peutGrouper(S && S[id])) return [];
  const p = plateforme(id);
  const dans = membresDe(id, S);
  return (Array.isArray(ids) ? ids : [])
    .filter(x => x !== id && peutGrouper(S[x]) && plateforme(x) === p)
    .map(x => ({ id: x, nom: (S[x].attributes && S[x].attributes.friendly_name) || x, dans: dans.indexOf(x) >= 0 }))
    .sort((a, b) => comparerTextes(a.nom, b.nom));
}

/** L'ordre d'une bascule : joindre `autre` au groupe de `id`, ou l'en retirer. */
export function appelGroupe(id, autre, joindre) {
  return joindre
    ? { domaine: 'media_player', service: 'join', data: { entity_id: id, group_members: [autre] } }
    : { domaine: 'media_player', service: 'unjoin', data: { entity_id: autre } };
}

/** « Tout dégrouper » : chaque membre quitte le groupe. */
export const appelsToutDegrouper = (id, S) => membresDe(id, S).map(x => appelGroupe(id, x, false));
