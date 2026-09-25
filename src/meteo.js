/* ── La carte météo du rail de l'Accueil, sans React (ADR 0038) ─────────────
 *
 * Le temps qu'il fait, le maximum et le minimum du jour, puis les heures qui
 * viennent — d'après l'entité `weather` et ses prévisions
 * (`weather/subscribe_forecast`). Rien ne s'invente : sans prévision du jour,
 * pas de ligne « Max · Min » ; sans prévision horaire, pas de rangée d'heures.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec
 * (tests/accueil_meteo.test.mjs).
 */
import { tr, locale } from './i18n.js';

/* `WeatherEntityFeature` : une entité dit elle-même quelles prévisions elle
 * sait donner. Demander un type qu'elle n'a pas, c'est une erreur côté serveur. */
const PREVISION_JOUR = 1, PREVISION_HEURE = 2;

export function typesPrevision(st) {
  const f = st && st.attributes ? (+st.attributes.supported_features || 0) : 0;
  return { jour: !!(f & PREVISION_JOUR), heure: !!(f & PREVISION_HEURE) };
}

/** « 16,2° », « 19° ». L'arrondi passe d'abord : « -0° » n'existe pas. */
export function degres(v, decimales = 0) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n)) return null;
  const k = 10 ** decimales;
  const r = Math.round(n * k) / k;
  return (r === 0 ? 0 : r).toLocaleString(locale(), { maximumFractionDigits: decimales, minimumFractionDigits: 0 }) + '°';
}

/* Fait-il nuit à l'instant `t` ? `sun.sun` donne le prochain lever et le
 * prochain coucher ; la nuit dure de l'un à l'autre, et revient toutes les
 * vingt-quatre heures — assez juste pour les quelques heures qui viennent. */
const JOUR_MS = 24 * 3600 * 1000;
const mod = (x) => ((x % JOUR_MS) + JOUR_MS) % JOUR_MS;

export function estNuit(t, soleil) {
  const a = (soleil && soleil.attributes) || {};
  const lever = Date.parse(a.next_rising || ''), coucher = Date.parse(a.next_setting || '');
  if (isNaN(lever) || isNaN(coucher)) return !!soleil && soleil.state === 'below_horizon';
  return mod(t - coucher) < mod(lever - coucher);
}

/* La condition de Home Assistant → le dessin. Une heure de nuit « partiellement
 * nuageuse » montre une lune voilée, pas un soleil. Une condition inconnue ne
 * se dessine pas : `null`, plutôt qu'un nuage qui affirmerait un ciel couvert. */
export function modeMeteo(cond, nuit) {
  const c = String(cond || '').toLowerCase();
  if (/lightning|thunder|storm/.test(c)) return /rain/.test(c) ? 'storrain' : 'storm';
  if (c === 'pouring') return 'pluieforte';
  if (c === 'snowy-rainy') return 'gresil';
  if (c === 'hail') return 'grele';
  if (/rain/.test(c)) return 'rain';
  if (/snow/.test(c)) return 'snow';
  if (c === 'fog') return 'brouillard';
  if (/wind/.test(c)) return 'wind';
  if (/partl/.test(c)) return nuit ? 'partlynight' : 'partly';
  if (c === 'cloudy') return 'clouds';
  if (c === 'clear-night') return 'night';
  if (c === 'sunny' || c === 'clear') return nuit ? 'night' : 'sun';
  return null;
}

/* La rangée des heures : « Maint. » d'abord — l'état de l'entité —, puis les
 * prochaines heures PLEINES de la prévision. Une seule case ne fait pas une
 * rangée : sans prévision horaire, rien. */
export function heuresMeteo({ etat = null, previsions = null, maintenant, soleil = null, n = 6 } = {}) {
  const out = [];
  const a = (etat && etat.attributes) || {};
  if (etat && degres(a.temperature) != null) {
    out.push({ cle: 'maint', libelle: tr('Maint.'), mode: modeMeteo(etat.state, estNuit(maintenant, soleil)), temp: degres(a.temperature) });
  }
  (previsions || []).map(p => ({ p, t: Date.parse((p && p.datetime) || '') }))
    .filter(x => !isNaN(x.t) && x.t > maintenant && degres(x.p.temperature) != null)
    .sort((x, y) => x.t - y.t)
    .slice(0, Math.max(0, n - out.length))
    .forEach(({ p, t }) => {
      out.push({ cle: String(t), libelle: tr('{n} h', { n: new Date(t).getHours() }), mode: modeMeteo(p.condition, estNuit(t, soleil)), temp: degres(p.temperature) });
    });
  return out.length >= 2 ? out : [];
}

/* Le maximum et le minimum D'AUJOURD'HUI : l'entrée de la prévision quotidienne
 * dont la date LOCALE est celle du jour — un service qui date ses jours à minuit
 * UTC tombe sinon la veille ou le lendemain. Pas d'entrée pour aujourd'hui, pas
 * de ligne : on ne prend pas demain à la place. */
export function extremesDuJour(previsionsJour, maintenant) {
  const auj = new Date(maintenant);
  const memeJour = (t) => { const d = new Date(t); return d.getFullYear() === auj.getFullYear() && d.getMonth() === auj.getMonth() && d.getDate() === auj.getDate(); };
  const p = (previsionsJour || []).find(x => { const t = Date.parse((x && x.datetime) || ''); return !isNaN(t) && memeJour(t); });
  if (!p || degres(p.temperature) == null) return null;
  return { max: degres(p.temperature), min: degres(p.templow) };
}

/* La pluie attendue et le vent — le « non fait » de l'ADR 0038 (25/09).
 *
 * Trois valeurs, TOUTES facultatives, et aucune n'est inventée : la
 * probabilité et le cumul viennent de la prévision du JOUR (la même entrée que
 * `extremesDuJour`, même règle de date locale), le vent de l'entité. Un
 * service qui ne donne pas la probabilité, ou pas le vent, laisse simplement
 * sa valeur à `null` — la carte n'affiche que ce qui existe.
 *
 * Un cumul de zéro n'est PAS rien : c'est l'information « il ne pleuvra pas ».
 * Mais on ne l'affiche pas seul, sans probabilité : une ligne « 0 mm » sur une
 * carte qui annonce « Ensoleillé » est du bruit. C'est l'appelant qui tranche,
 * avec les trois valeurs sous les yeux. */
export function pluieEtVent(previsionsJour, attributs, maintenant) {
  const a = attributs || {};
  const auj = new Date(maintenant);
  const memeJour = (t) => { const d = new Date(t); return d.getFullYear() === auj.getFullYear() && d.getMonth() === auj.getMonth() && d.getDate() === auj.getDate(); };
  const p = (previsionsJour || []).find(x => { const t = Date.parse((x && x.datetime) || ''); return !isNaN(t) && memeJour(t); }) || {};
  const nombre = (v) => { const n = Number(v); return (v == null || v === '' || isNaN(n)) ? null : n; };
  const proba = nombre(p.precipitation_probability);
  const cumul = nombre(p.precipitation);
  const vent = nombre(a.wind_speed);
  return {
    proba: proba == null ? null : Math.max(0, Math.min(100, Math.round(proba))),
    cumul: cumul == null ? null : Math.round(cumul * 10) / 10,
    vent: vent == null ? null : Math.round(vent),
    uniteVent: a.wind_speed_unit || 'km/h',
  };
}
