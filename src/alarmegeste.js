/* ── L'alarme : qui l'a armée ou désarmée, et pourquoi elle ne s'arme pas (chantier du 20/11, P1 et P2 ; ADR 0382) ──
 *
 * Pur : la carte Alarme (`CvAlarm`, cartescustom/cartes.jsx) ne fait que l'afficher.
 *
 * P2 — L'AUTEUR. D'abord Loggia lui-même : le journal de la présence (serveur, `loggia/presence/etat`) garde chaque armement du
 * départ et chaque désarmement du retour, avec l'heure et l'entité ; une ligne à moins de 15 s du dernier changement d'état, c'est
 * elle (le 17/10, un faux retour de la tablette désarmait l'alarme, et rien ne le disait). Sinon `changed_by`, que le panneau
 * publie — Alarmo y met le nom de la personne dont il a reconnu le code. Ni l'un ni l'autre : rien n'est dit.
 *
 * P1 — LE REFUS. Alarmo refuse d'armer sur un ouvrant ouvert : l'état reste `disarmed` et l'attribut `open_sensors` nomme ce qui
 * bloque (lu dans sa source). Trois secondes après un geste d'armement, un panneau resté désarmé qui publie ses ouvrants a refusé ;
 * la carte le dit soixante secondes, puis se tait. « Armer quand même » passe par `alarmo.arm` avec `force` — un service d'Alarmo,
 * offert à Alarmo seulement, et jamais sans un geste : l'armement automatique du départ ne force rien.
 */
import { tr } from './i18n.js';

const ECART_MS = 15000;
export const REFUS_APRES_MS = 3000;
export const REFUS_DURE_MS = 60000;

/** L'auteur du dernier changement : `{ loggia: 'depart' | 'retour' | 'autre' }`, `{ qui }`, ou null. */
export function auteurAlarme(st, id, journal) {
  if (!st || !st.attributes) return null;
  const t = Date.parse(st.last_changed || st.last_updated || '');
  const ligne = Number.isFinite(t) && Array.isArray(journal) ? journal.find(e => e && e.module === 'presence' && !e.simule
    && Array.isArray(e.cibles) && e.cibles.indexOf(id) >= 0 && Math.abs(Number(e.ts) * 1000 - t) <= ECART_MS) : null;
  if (ligne) return { loggia: ligne.regle === 'depart' || ligne.regle === 'retour' ? ligne.regle : 'autre' };
  const qui = st.attributes.changed_by;
  return typeof qui === 'string' && qui.trim() ? { qui: qui.trim() } : null;
}

/** « par Camille », « par Loggia, au retour ». */
export function texteAuteur(a) {
  if (!a) return '';
  if (a.loggia === 'retour') return tr('par Loggia, au retour');
  if (a.loggia === 'depart') return tr('par Loggia, au départ');
  if (a.loggia) return tr('par Loggia');
  return tr('par {nom}', { nom: a.qui });
}

const MODES_ALARMO = { alarm_arm_away: 'away', alarm_arm_home: 'home', alarm_arm_night: 'night', alarm_arm_vacation: 'vacation', alarm_arm_custom_bypass: 'custom' };

/** Les ouvrants que le panneau publie (`open_sensors` : un dictionnaire chez Alarmo, une liste ailleurs), par leur nom. */
export function ouvertsPublies(st, S) {
  const v = st && st.attributes ? st.attributes.open_sensors : null;
  const ids = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v) : []);
  return ids.filter(i => typeof i === 'string').map(i => (S && S[i] && S[i].attributes && S[i].attributes.friendly_name) || i);
}

/** Le refus d'un armement demandé : `{ noms, mode }`, ou null. `geste` : `{ svc, t }`, le dernier armement que la carte a envoyé. */
export function refusArmement(geste, st, S, maintenant = Date.now()) {
  if (!geste || !st || st.state !== 'disarmed') return null;
  const age = maintenant - geste.t;
  if (age < REFUS_APRES_MS || age > REFUS_DURE_MS) return null;
  const noms = ouvertsPublies(st, S);
  return noms.length ? { noms, mode: MODES_ALARMO[geste.svc] || null } : null;
}

/** « Armer quand même » : l'appel d'Alarmo, `force` mis, le même mode, le code tapé s'il y en avait un ; null sans mode connu. */
export function appelForcer(id, refus, code = null) {
  if (!refus || !refus.mode) return null;
  return { domaine: 'alarmo', service: 'arm', data: { entity_id: id, mode: refus.mode, force: true, ...(code ? { code } : {}) } };
}
