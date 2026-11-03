/**
 * La voix et le clavier d'un lecteur (lot 12 du rapport Gladys, M2 et M3 ; ADR 0316).
 *
 * Deux choses que Home Assistant sait faire et que la fiche d'un lecteur ne proposait pas :
 *  - M2 : dire une annonce sur une enceinte qui LIT un média (`tts.speak`), avec un moteur de synthèse
 *    de la maison (Piper, Home Assistant Cloud…). L'annonce d'Alexa passe par ailleurs (fichemedia.jsx).
 *  - M3 : écrire sur la TV quand l'Apple TV le demande. Son binaire « clavier » (`keyboard_focused`)
 *    est à `on` pendant qu'un champ attend du texte ; `apple_tv.set_keyboard_text` le remplit. Ce service
 *    ne prend pas d'entité mais l'entrée de configuration, que le composant pose sur ce binaire seul
 *    (`clavier`, discovery.py) : rien ne se devine au nom.
 *
 * Ce module est PUR : ni JSX, ni appel de service. Il n'est importé que par la fiche du lecteur, chargée
 * à la demande : il ne pèse rien au démarrage.
 */
import { comparerTextes } from './i18n.js';

/* Les plateformes dont le lecteur joue l'annonce de `tts.speak`. `cast` : Google Cast lit l'adresse du son que la synthèse
 * produit, et c'est l'enceinte qu'on a. Une Apple TV ou une Echo ne la jouent pas de façon sûre : elles n'y sont pas. */
const VOIX_LUES = ['cast'];

/** Le lecteur joue-t-il une annonce de `tts.speak` ? Par sa plateforme seule (`plateformeDe`), jamais par son nom. */
export const litUneVoix = (plateforme) => VOIX_LUES.indexOf(plateforme) >= 0;

/**
 * Les moteurs de synthèse de la maison : les entités `tts.*` qui répondent, dans l'ordre de leur nom.
 * L'état d'une entité `tts` est l'heure de sa dernière phrase, `unknown` tant qu'elle n'a rien dit :
 * seule `unavailable` la retire.
 */
export function moteursVoix(states) {
  const S = states || {};
  return Object.keys(S)
    .filter(id => id.indexOf('tts.') === 0 && S[id] && S[id].state !== 'unavailable')
    .map(id => ({ id, label: String((S[id].attributes && S[id].attributes.friendly_name) || id) }))
    .sort((a, b) => comparerTextes(a.label, b.label));
}

/** L'appel d'une annonce : `tts.speak` sur le moteur, vers ce lecteur ; `null` sans texte, moteur ou lecteur. */
export function appelVoix(moteur, lecteur, texte) {
  const message = String(texte == null ? '' : texte).trim();
  if (!moteur || !lecteur || !message) return null;
  return { domaine: 'tts', service: 'speak', data: { entity_id: moteur, media_player_entity_id: lecteur, message } };
}

/**
 * Le clavier qui attend du texte sur l'appareil de ce lecteur, ou `null`.
 *
 * Le binaire est rattaché par l'APPAREIL (le même `deviceId` que le lecteur) et reconnu par son drapeau
 * `clavier` (l'entrée de configuration). Il faut aussi que le service existe dans cette installation —
 * il est arrivé dans Home Assistant au printemps 2026 —, et que le binaire soit à `on`.
 */
export function clavierDe(id, states, index) {
  const meta = index && index.entityMeta;
  if (!meta || typeof meta.get !== 'function' || typeof meta.forEach !== 'function') return null;
  const services = (index.services && index.services.apple_tv) || {};
  if (!services.set_keyboard_text) return null;
  const moi = meta.get(id);
  if (!moi || !moi.deviceId) return null;
  const S = states || {};
  let trouve = null;
  meta.forEach((m, eid) => {
    if (trouve || !m || !m.clavier || m.deviceId !== moi.deviceId) return;
    if (S[eid] && S[eid].state === 'on') trouve = { capteur: eid, entree: m.clavier };
  });
  return trouve;
}

/** L'appel qui écrit sur la TV : `apple_tv.set_keyboard_text` — il REMPLACE ce que le champ contient. */
export function appelClavier(entree, texte) {
  const text = String(texte == null ? '' : texte);
  if (!entree || !text.trim()) return null;
  return { domaine: 'apple_tv', service: 'set_keyboard_text', data: { config_entry_id: entree, text } };
}
