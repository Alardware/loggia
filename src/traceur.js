/* ── Un traceur d'objet : ce que disent sa carte et sa popup (lot 13 du rapport Gladys, H2 ; ADR 0318) ──
 *
 * Un traceur d'objet (Invoxia : un sac, un vélo, un chien) est un `device_tracker`,
 * comme le téléphone d'une personne. Ce n'est PAS une personne : il ne compte jamais
 * dans la présence de la maison (presence.py ne lit que les `person` choisies). Le
 * démarrage ne porte que sa reconnaissance (`estTraceur`, state.js) ; ce module est
 * chargé avec sa carte et dit ce qu'elle montre :
 *  - sa ZONE : l'état du traceur, au mot de la présence (`lieuPresence`) : « À la
 *    maison », « Absent », le nom de la zone de Home Assistant tel quel, « Inconnu »
 *    quand il se tait ;
 *  - sa PILE : le capteur `battery` de son appareil, sinon l'attribut `battery_level` ;
 *  - son DERNIER SIGNAL : le capteur de clé `last_seen` de son appareil, sinon
 *    l'attribut `last_seen`, sinon l'heure de sa dernière position (`last_location`,
 *    capteur ou attribut), sinon le dernier changement d'état du traceur ;
 *  - son ÉTAT : le capteur de clé `tracker_state`, tel que l'intégration l'écrit.
 *    C'est un mot de son service, que Loggia ne connaît pas : il ne se traduit pas.
 * Les capteurs se lisent à leur clé, rattachés par l'APPAREIL du traceur, jamais à
 * leur nom. Rien ne se commande. Pur : pas de React, pas de Home Assistant. */
import { tr } from './i18n.js';
import { relTime } from './format.js';
import { pickSibling } from './discovery.js';
import { lieuPresence } from './presence.js';

const MUETS = ['unavailable', 'unknown', 'none', ''];

/** La valeur d'une entité qui répond, sinon null. */
const valeur = (S, id) => {
  const st = id ? S[id] : null;
  const s = st && st.state != null ? String(st.state).trim() : '';
  return st && MUETS.indexOf(s.toLowerCase()) < 0 ? s : null;
};
/** Un instant lisible (ISO, ou « 2026-11-01 10:00:00 »), en millisecondes ; sinon null. */
const instant = (v) => {
  if (v == null || v === '') return null;
  const t = new Date(typeof v === 'string' ? v.replace(' ', 'T') : v).getTime();
  return Number.isFinite(t) ? t : null;
};
const pourcent = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};
// « Il y a 3 j » au milieu d'une phrase : la première lettre en bas de casse, comme le groupe des piles (fichegroupe.jsx).
const enPhrase = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Ce que montrent la carte et la popup d'un traceur d'objet.
 *
 * `{ nom, mort, lieu, zone, encre, pile, signal, quand, etat }` : `lieu` est la clé
 * de `lieuPresence` ; `zone`, son mot ; `signal`, l'instant du dernier signal (ms) ;
 * `quand`, « Signal il y a 3 j » ; `etat`, le mot de l'intégration, ou null.
 */
export function vueTraceur({ id, S = {}, index = null, nom = null }) {
  const st = (S && S[id]) || null;
  const a = (st && st.attributes) || {};
  const soeur = (crit) => (index ? pickSibling(index, S, id, { domain: 'sensor', ...crit }) : null);
  const lieu = lieuPresence(st).cle;
  const mort = !st || String(st.state) === 'unavailable';
  const zone = mort ? tr('Indisponible') : lieu === 'maison' ? tr('À la maison') : lieu === 'absent' ? tr('Absent') : lieu === 'inconnu' ? tr('Inconnu') : String(st.state).trim();
  const pileCapteur = pourcent(valeur(S, soeur({ deviceClass: 'battery' })));
  const pile = pileCapteur != null ? pileCapteur : pourcent(a.battery_level != null ? a.battery_level : a.battery);
  const lu = (cle) => instant(valeur(S, soeur({ cles: [cle] })));
  const signal = lu('last_seen') || instant(a.last_seen) || lu('last_location') || instant(a.last_location) || instant(st && st.last_changed);
  return {
    nom: nom || a.friendly_name || id,
    mort, lieu, zone,
    // Le vert de la carte d'une personne quand il est à la maison ; le gris s'il ne répond plus.
    encre: mort ? 'var(--o-text3)' : lieu === 'maison' ? 'var(--o-ok)' : 'var(--o-text2)',
    pile, signal,
    quand: signal != null ? tr('Signal {quand}', { quand: enPhrase(relTime(new Date(signal).toISOString())) }) : null,
    etat: valeur(S, soeur({ cles: ['tracker_state'] })),
  };
}
