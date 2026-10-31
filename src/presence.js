/* ── Où est une personne, en un mot (G1-D8, 30/10 ; ADR 0300) ────────────────
 *
 * Hors de la maison, tout le monde était « Absent » : dans une zone de Home
 * Assistant (« Travail », « École »), ou quand son téléphone se taisait. Pour le
 * serveur (presence.py, `MUETS`), un téléphone muet n'est pas une maison vide :
 * l'écran le dit désormais aussi. L'état d'une `person` ou d'un `device_tracker` :
 *  - `home` : à la maison — chaque carte garde son mot (« Présent », « À la maison ») ;
 *  - `not_home` : absent ;
 *  - `unavailable`, `unknown`, vide, ou l'entité absente : inconnu ;
 *  - toute autre valeur : le NOM d'une zone de Home Assistant — une personne y
 *    prend le nom de la zone. Il s'écrit tel quel, jamais traduit : c'est le nom
 *    que la maison lui a donné.
 *
 * Pur : pas de React, pas de Home Assistant. */
import { tr } from './i18n.js';

// Ce qu'un traceur dit quand il ne dit rien : la liste de presence.py.
const MUETS = ['unavailable', 'unknown', 'none', ''];

/** `{ cle, zone }` — `cle` : 'maison', 'absent', 'zone' ou 'inconnu' ; `zone` : le nom de la zone, sinon null. */
export function lieuPresence(st) {
  const s = st && st.state != null ? String(st.state).trim() : '';
  if (s === 'home') return { cle: 'maison', zone: null };
  if (s === 'not_home') return { cle: 'absent', zone: null };
  if (MUETS.indexOf(s.toLowerCase()) >= 0) return { cle: 'inconnu', zone: null };
  return { cle: 'zone', zone: s };
}

/** Le mot d'un état de présence : `maison` (« Présent » par défaut), « Absent », le nom de la zone, ou « Inconnu ». */
export function motPresence(st, maison = null) {
  const l = lieuPresence(st);
  if (l.cle === 'maison') return maison || tr('Présent');
  if (l.cle === 'absent') return tr('Absent');
  if (l.cle === 'inconnu') return tr('Inconnu');
  return l.zone;
}
