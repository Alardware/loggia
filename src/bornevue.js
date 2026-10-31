/* ── Ce que montrent la carte et la popup de la borne (chantier G3, E3 ; ADR 0302) ──
 *
 * Chargé avec elles seulement (carteborne.jsx, ficheborne.jsx) : le démarrage
 * n'en porte rien. La découverte, elle, est dans `borne.js`.
 */
import { tr } from './i18n.js';
import { wattsDe, facteurKwh } from './unites.js';
import { SEUIL_CHARGE_W } from './borne.js';

const MUETS = ['unavailable', 'unknown'];
const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

/**
 * Ce que montrent la carte et la popup de la borne.
 * `{ nom, mort, etat, phrase: { texte, encre }, watts, branchee, depuis, courant: { valeur, min, max, pas, unite }, pause, plaque }`.
 * `etat` : 'charge' | 'pause' | 'branchee' | 'debranchee' | 'muette'.
 */
export function vueBorne({ borne, S = {}, nom = null }) {
  if (!borne) return null;
  const st = (id) => (id && S[id]) || null;
  const lisible = (id) => !!st(id) && MUETS.indexOf(String(st(id).state)) < 0;
  const watts = lisible(borne.puissance) ? wattsDe(st(borne.puissance)) : null;
  const branchee = lisible(borne.prise) ? st(borne.prise).state === 'on' : null;
  const statut = lisible(borne.statut) ? String(st(borne.statut).state) : null;
  const interrupteur = lisible(borne.interrupteur) ? st(borne.interrupteur).state === 'on' : null;
  const mort = watts == null && branchee == null && statut == null;
  let etat;
  if (mort) etat = 'muette';
  else if (statut === 'charging' || (watts != null && watts > SEUIL_CHARGE_W)) etat = 'charge';
  else if ((branchee || (statut != null && statut !== 'disconnected')) && interrupteur === false) etat = 'pause';
  else if (branchee === true || (statut != null && ['connected', 'ready', 'waiting', 'suspended', 'paused', 'awaiting_start', 'charged', 'complete'].indexOf(statut) >= 0)) etat = 'branchee';
  else etat = 'debranchee';
  const mots = { charge: tr('En charge'), pause: tr('En pause'), branchee: tr('Branchée'), debranchee: tr('Débranchée'), muette: tr('Indisponible') };
  const ac = (st(borne.courant) && st(borne.courant).attributes) || {};
  const p = st(borne.prise);
  return {
    nom: nom || (st(borne.puissance) && st(borne.puissance).attributes && st(borne.puissance).attributes.friendly_name) || tr('Borne de recharge'),
    mort, etat, watts, branchee,
    // Branchée depuis : le dernier passage à « on » de la prise — d'où se comptent les kWh de la charge en cours.
    depuis: branchee && p ? Date.parse(p.last_changed || p.last_updated || '') || null : null,
    phrase: { texte: mots[etat], encre: etat === 'charge' ? 'var(--o-ok)' : etat === 'muette' ? 'var(--o-text3)' : 'var(--o-text2)' },
    courant: { valeur: lisible(borne.courant) ? nombre(st(borne.courant).state) : null, min: nombre(ac.min), max: nombre(ac.max), pas: nombre(ac.step) > 0 ? nombre(ac.step) : 1, unite: ac.unit_of_measurement || 'A' },
    // La pause et la reprise : seulement avec un interrupteur, et seulement quand une voiture est là.
    pause: borne.interrupteur && interrupteur != null && etat !== 'debranchee' && etat !== 'muette' ? (interrupteur ? 'pause' : 'reprise') : null,
    plaque: etat === 'charge' ? ['rgba(var(--o-ok-rgb),.18)', 'var(--o-ok)'] : etat === 'muette' ? ['var(--o-s1)', 'var(--o-text3)'] : ['var(--o-s1)', 'var(--o-text1)'],
  };
}

/** Le courant demandé, dans les bornes de l'appareil et à son pas. */
export function bornerCourant(v, c) {
  const n = nombre(v);
  if (n == null || !c) return null;
  const pas = nombre(c.pas) > 0 ? nombre(c.pas) : 1;
  let x = Math.round(n / pas) * pas;
  if (nombre(c.min) != null) x = Math.max(c.min, x);
  if (nombre(c.max) != null) x = Math.min(c.max, x);
  return x;
}

/**
 * Les kWh de la charge en cours : l'index d'énergie maintenant, moins ce qu'il
 * valait au branchement — le premier relevé de son historique depuis
 * `depuis`. `null` quand on ne sait pas : pas d'historique, un index remis à
 * zéro entre-temps.
 */
export function kwhDepuis(historique, etatActuel) {
  const lu = (e) => (e && MUETS.indexOf(String(e.state)) < 0 ? nombre(e.state) : null);
  const debut = (Array.isArray(historique) ? historique : []).map(lu).find(v => v != null);
  const fin = lu(etatActuel);
  if (debut == null || fin == null || fin < debut) return null;
  const unite = (etatActuel.attributes && etatActuel.attributes.unit_of_measurement) || 'kWh';
  return (fin - debut) * facteurKwh(unite);
}
