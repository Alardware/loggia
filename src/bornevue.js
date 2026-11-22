/* ── Ce que montrent la carte et la popup de la borne (chantier G3, E3 ; ADR 0302) ──
 *
 * Chargé avec elles seulement (carteborne.jsx, ficheborne.jsx) : le démarrage
 * n'en porte rien. La découverte, elle, est dans `borne.js`.
 */
import { tr, locale } from './i18n.js';
import { wattsDe, facteurKwh } from './unites.js';
import { SEUIL_CHARGE_W, statutBorne, borneEnDefaut } from './borne.js';

const MUETS = ['unavailable', 'unknown'];
const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

/**
 * Ce que montrent la carte et la popup de la borne.
 * `{ nom, mort, etat, phrase: { texte, encre }, watts, branchee, depuis, courant: { valeur, min, max, pas, unite }, pause, plaque }`.
 * `etat` : 'defaut' | 'charge' | 'pause' | 'branchee' | 'debranchee' | 'muette'.
 */
export function vueBorne({ borne, S = {}, nom = null }) {
  if (!borne) return null;
  const st = (id) => (id && S[id]) || null;
  const lisible = (id) => !!st(id) && MUETS.indexOf(String(st(id).state)) < 0;
  const watts = lisible(borne.puissance) ? wattsDe(st(borne.puissance)) : null;
  const branchee = lisible(borne.prise) ? st(borne.prise).state === 'on' : null;
  const statut = statutBorne(borne, S);
  const interrupteur = lisible(borne.interrupteur) ? st(borne.interrupteur).state === 'on' : null;
  const mort = watts == null && branchee == null && statut == null;
  let etat;
  if (mort) etat = 'muette';
  // La panne d'abord (F1, ADR 0381) : un statut `error` se disait « Branchée » ou « Débranchée » selon la prise.
  else if (borneEnDefaut(borne, S)) etat = 'defaut';
  else if (statut === 'charging' || (watts != null && watts > SEUIL_CHARGE_W)) etat = 'charge';
  else if ((branchee || (statut != null && statut !== 'disconnected')) && interrupteur === false) etat = 'pause';
  else if (branchee === true || (statut != null && ['connected', 'ready', 'waiting', 'suspended', 'paused', 'awaiting_start', 'charged', 'complete'].indexOf(statut) >= 0)) etat = 'branchee';
  else etat = 'debranchee';
  const mots = { defaut: tr('En défaut'), charge: tr('En charge'), pause: tr('En pause'), branchee: tr('Branchée'), debranchee: tr('Débranchée'), muette: tr('Indisponible') };
  const ac = (st(borne.courant) && st(borne.courant).attributes) || {};
  const p = st(borne.prise);
  return {
    nom: nom || (st(borne.puissance) && st(borne.puissance).attributes && st(borne.puissance).attributes.friendly_name) || tr('Borne de recharge'),
    mort, etat, watts, branchee,
    // Branchée depuis : le dernier passage à « on » de la prise — d'où se comptent les kWh de la charge en cours.
    depuis: branchee && p ? Date.parse(p.last_changed || p.last_updated || '') || null : null,
    phrase: { texte: mots[etat], encre: etat === 'charge' ? 'var(--o-ok)' : etat === 'defaut' ? 'var(--o-bad)' : etat === 'muette' ? 'var(--o-text3)' : 'var(--o-text2)' },
    courant: { valeur: lisible(borne.courant) ? nombre(st(borne.courant).state) : null, min: nombre(ac.min), max: nombre(ac.max), pas: nombre(ac.step) > 0 ? nombre(ac.step) : 1, unite: ac.unit_of_measurement || 'A' },
    // La pause et la reprise : seulement avec un interrupteur, et seulement quand une voiture est là.
    pause: borne.interrupteur && interrupteur != null && etat !== 'debranchee' && etat !== 'muette' ? (interrupteur ? 'pause' : 'reprise') : null,
    plaque: etat === 'charge' ? ['rgba(var(--o-ok-rgb),.18)', 'var(--o-ok)'] : etat === 'defaut' ? ['rgba(var(--o-bad-rgb),.14)', 'var(--o-bad)'] : etat === 'muette' ? ['var(--o-s1)', 'var(--o-text3)'] : ['var(--o-s1)', 'var(--o-text1)'],
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

/* ── La dernière charge (chantier du 20/11, A7 ; ADR 0385) ──
 *
 * « Dernière charge : 18 kWh, hier soir » : lue dans l'HISTORIQUE du compteur d'énergie de la borne, sans rien demander de
 * plus. Home Assistant ne note que les CHANGEMENTS : pendant une charge le compteur bouge toutes les quelques minutes, au
 * repos il se tait. Une charge est donc une suite de relevés qui montent, à moins d'`ECART_CHARGE` les uns des autres ; ce
 * qu'elle a donné, c'est le dernier relevé moins celui qui la précédait. Un compteur remis à zéro (celui d'une session) coupe
 * la suite : la charge d'avant garde son total. Aucun nombre n'est inventé : sans relevé, rien.
 */
const ECART_CHARGE = 90 * 60000;
/** Sous ce total, une montée n'est pas une charge : le bruit d'un compteur. */
const KWH_MINI = 0.2;

/**
 * La dernière charge terminée : `{ kwh, debut, fin }` (instants en ms), ou null.
 * `historique` : les relevés de l'index d'énergie (`{ state, last_changed }`) ; `etatActuel` : son état (pour l'unité).
 */
export function derniereCharge(historique, etatActuel) {
  const facteur = facteurKwh((etatActuel && etatActuel.attributes && etatActuel.attributes.unit_of_measurement) || 'kWh');
  const releves = (Array.isArray(historique) ? historique : []).map(e => {
    const v = e && MUETS.indexOf(String(e.state)) < 0 ? nombre(e.state) : null;
    const t = e ? Date.parse(e.last_changed || e.last_updated || '') : NaN;
    return v != null && Number.isFinite(t) ? { v, t } : null;
  }).filter(Boolean).sort((a, b) => a.t - b.t);
  let courante = null, derniere = null;
  const clore = () => { if (courante && (courante.fin.v - courante.avant.v) * facteur >= KWH_MINI) derniere = courante; courante = null; };
  for (let i = 1; i < releves.length; i++) {
    const avant = releves[i - 1], r = releves[i];
    if (r.v < avant.v) { clore(); continue; }
    if (r.v === avant.v) continue;
    if (courante && r.t - courante.fin.t > ECART_CHARGE) clore();
    if (!courante) courante = { avant, debut: r, fin: r };
    else courante.fin = r;
  }
  clore();
  return derniere ? { kwh: (derniere.fin.v - derniere.avant.v) * facteur, debut: derniere.debut.t, fin: derniere.fin.t } : null;
}

/**
 * Quand elle s'est finie, en mots : « ce soir », « hier soir », « cette nuit », sinon le jour (« le jeudi 14 novembre »).
 * La nuit va de minuit à 6 h, le matin jusqu'à midi, l'après-midi jusqu'à 18 h.
 */
export function quandCharge(fin, maintenant = Date.now()) {
  if (!Number.isFinite(fin)) return null;
  const d = new Date(fin), m = new Date(maintenant);
  const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(m) - jour(d)) / 86400000);
  const h = d.getHours();
  const moment = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
  if (ecart === 0) return [tr('cette nuit'), tr('ce matin'), tr('cet après-midi'), tr('ce soir')][moment];
  if (ecart === 1) return [tr('hier dans la nuit'), tr('hier matin'), tr('hier après-midi'), tr('hier soir')][moment];
  return tr('le {date}', { date: d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }) });
}
