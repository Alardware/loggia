/* Avant de partir (04/11, étape 2 du rapport sur l'usage).
 *
 * « Je pars » éteint, met le chauffage en éco, arme et verrouille. Il ne ferme
 * ni une fenêtre ni une porte — Loggia ne le peut pas — et ne touche ni au
 * garage ni au portail. Ce module dit ce qui RESTERA OUVERT si l'on part
 * maintenant : les portes de garage et portails motorisés (qu'on peut fermer
 * d'ici), puis les portes et les fenêtres (à fermer à la main). Rien
 * d'ouvert : rien à dire, « Je pars » part tout de suite, comme avant.
 *
 * Les ouvrants sont ceux de la rangée sûreté de l'Accueil — mêmes classes
 * (`attention.js`), mêmes exclusions (muets, groupes, entités masquées) —,
 * pour que la feuille et l'Accueil ne se contredisent jamais. Le capteur de
 * porte de garage que porte l'appareil d'un portail motorisé se tait : le
 * portail le dit déjà, avec son bouton.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec. */
import { familleOuvrant } from './attention.js';
import { coverFerme } from './voletecran.js';

/* Les `cover` qu'on ferme en partant : pas les volets (on les laisse comme on
 * veut en journée), seulement ce qui ouvre la maison. */
const CLASSES_PORTAIL = ['garage', 'gate'];
const MUETS = ['unavailable', 'unknown'];

function position(st) {
  const p = Number(st && st.attributes && st.attributes.current_position);
  if (Number.isFinite(p)) return p;
  return st && st.state === 'closed' ? 0 : 100;
}
const nomDe = (id, st) => (st && st.attributes && st.attributes.friendly_name) || id;
const vivant = (st) => !!st && typeof st === 'object' && st.state != null && MUETS.indexOf(String(st.state)) < 0;
const groupe = (id, st, plateforme) => Array.isArray(st.attributes && st.attributes.entity_id) || plateforme(id) === 'group';

/** Ce qui restera ouvert : `{ portails: [{id, nom}], ouverts: [{id, nom, famille}] }`. */
export function restesAvantDepart(S, { plateforme = () => null, masque = () => false, voisins = () => [] } = {}) {
  const out = { portails: [], ouverts: [] };
  if (!S || typeof S !== 'object') return out;
  const ids = Object.keys(S).sort();
  ids.forEach(id => {
    if (id.indexOf('cover.') !== 0) return;
    const st = S[id];
    if (!vivant(st) || groupe(id, st, plateforme) || masque(id)) return;
    if (CLASSES_PORTAIL.indexOf((st.attributes || {}).device_class) < 0) return;
    // Un portail qui se ferme déjà n'est plus un reste.
    if (st.state === 'closing' || coverFerme(st, position(st))) return;
    out.portails.push({ id, nom: nomDe(id, st) });
  });
  const portes = [], fenetres = [];
  ids.forEach(id => {
    if (id.indexOf('binary_sensor.') !== 0) return;
    const st = S[id];
    if (!vivant(st) || st.state !== 'on' || groupe(id, st, plateforme) || masque(id)) return;
    const dc = (st.attributes || {}).device_class;
    const famille = familleOuvrant(dc);
    if (!famille) return;
    const v = voisins(id);
    if (dc === 'garage_door' && Array.isArray(v) && v.indexOf('cover') >= 0) return;
    (famille === 'portes' ? portes : fenetres).push({ id, nom: nomDe(id, st), famille });
  });
  out.ouverts = [...portes, ...fenetres];
  return out;
}

export const resteQuelqueChose = (r) => !!r && (r.portails.length + r.ouverts.length) > 0;
