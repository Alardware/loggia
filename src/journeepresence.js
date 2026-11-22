/* ── La journée de chacun et la pile de son téléphone, dans la feuille Présence (chantier du 20/11, P3 ; ADR 0383) ──
 *
 * Pur, chargé avec la feuille. LA JOURNÉE : les changements de la `person` depuis minuit (`history/period`, `lireHistorique`) —
 * « Départ 08:12 · Travail 08:40 · Retour 18:30 ». Le nom d'une zone reste celui que la maison lui a donné, jamais traduit ; un
 * état muet n'est pas un mouvement. LE TÉLÉPHONE : le `device_tracker` de l'application compagnon (`mobile_app`) que la personne
 * porte (`device_trackers`), et le capteur `battery` de SON appareil. Un téléphone qui s'éteint ne dit plus « il est rentré » :
 * le voir à 8 % explique un retour manqué. La pile ne change rien au compte « à la maison » (règle de sûreté).
 */
import { tr } from './i18n.js';

const MUETS = ['unknown', 'unavailable', ''];
const PLUS = 4;

/** Les mouvements depuis `minuit` : `[{ t, etat }]`, un par changement réel, les `PLUS` derniers. */
export function mouvementsDuJour(serie, minuit) {
  const out = [];
  let avant = null;
  (Array.isArray(serie) ? serie : []).forEach((p) => {
    if (!p || MUETS.indexOf(p.etat) >= 0) return;
    if (p.etat !== avant && p.t > minuit) out.push({ t: p.t, etat: p.etat });
    avant = p.etat;
  });
  return out.slice(-PLUS);
}

/** « Départ 08:12 · Travail 08:40 · Retour 18:30 ». `heure(t)` : l'heure dans la langue de l'écran. */
export function texteJournee(mouvements, heure) {
  return (mouvements || []).map(m => (m.etat === 'home' ? tr('Retour {h}', { h: heure(m.t) })
    : m.etat === 'not_home' ? tr('Départ {h}', { h: heure(m.t) }) : m.etat + ' ' + heure(m.t))).join(' · ');
}

/** Le téléphone de la personne : son `device_tracker` de l'application compagnon, ou null. */
export function telephoneDe(st, plateforme) {
  const liste = st && st.attributes && Array.isArray(st.attributes.device_trackers) ? st.attributes.device_trackers : [];
  return liste.find(id => typeof id === 'string' && id.indexOf('device_tracker.') === 0 && plateforme(id) === 'mobile_app') || null;
}

/** La charge lue d'un capteur `battery`, en pour cent entier ; null s'il se tait. */
export function chargeDe(st) {
  const n = st && MUETS.indexOf(String(st.state)) < 0 ? parseFloat(st.state) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}
