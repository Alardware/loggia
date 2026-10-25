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
import { estMeteoAlarm } from './groupes.js';
import { niveauDe } from './vigilance.js';

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
    uniteCumul: a.precipitation_unit || 'mm',
    vent: vent == null ? null : Math.round(vent),
    uniteVent: a.wind_speed_unit || 'km/h',
  };
}

/* ══════════ Le widget et la popup de sa maquette « Cartes météo » (20/10) ══════════
 *
 * Ce que le WIDGET du rail lit, au démarrage : le nom de la ville, la phrase,
 * le soleil, la vigilance. Ce que la FICHE seule lit — la semaine en barres,
 * les tuiles, les risques — vit dans meteofiche.js, chargé avec elle : le
 * démarrage ne porte pas ce que l'Accueil n'affiche pas (lot14_chargement).
 * Rien ne s'invente : sans prévision, pas de phrase ; sans attribut, rien. */

export const memeJourQue = (t, ref) => { const a = new Date(t), b = new Date(ref); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
export const lectureDate = (p) => Date.parse((p && p.datetime) || '');
export const nombreOuNull = (v) => { const n = Number(v); return (v == null || v === '' || isNaN(n)) ? null : n; };
const hhmm = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const heureRonde = (t) => tr('{n} h', { n: new Date(t).getHours() });
export const jourCourt = (t) => new Date(t).toLocaleDateString(locale(), { weekday: 'short' });
const jourLong = (t) => new Date(t).toLocaleDateString(locale(), { weekday: 'long' });
export const mmArrondi = (v) => Math.round(v);

/* Le nom de la ville. Météo-France nomme son entité « Météo-France forecast
 * for city Sainte-Solange » : on garde la ville. Un nom choisi à la main reste
 * tel quel — c'est le sien. */
export function nomVille(nom) {
  const n = String(nom == null ? '' : nom).trim();
  if (!n) return null;
  const m = n.match(/forecast for (?:city|place|location)\s+(.+)$/i);
  return m ? m[1].trim() : n;
}

/* Les prévisions à venir, triées, datées. */
export const aVenir = (liste, maintenant) => (liste || []).map(p => ({ p, t: lectureDate(p) })).filter(x => !isNaN(x.t) && x.t > maintenant).sort((a, b) => a.t - b.t);
export const pleut = (p) => { const n = nombreOuNull(p.precipitation_probability); return n != null ? n >= 50 : /rain|pour|lightning-rainy|snowy-rainy|hail/.test(String(p.condition || '')); };

/* La phrase qui répond à la question qu'on se pose en regardant la météo.
 *  1. De la pluie dans les heures qui viennent : « Pluie vers 16 h, jusqu'à 19 h »
 *     et le conseil, avec le cumul. Déjà là : « Pluie jusqu'à 19 h ».
 *  2. Sinon, de nuit : la température au réveil (le minimum avant le lever),
 *     et le gel s'il menace.
 *  3. Sinon, le premier jour de pluie de la semaine : « Sec jusqu'à jeudi »,
 *     « Sec jusqu'à demain », ou « Sec toute la semaine ».
 * Rend `{ texte, conseil, ton }` — `ton` : 'cold' pour la pluie et le gel, null
 * sinon —, ou null sans prévision. */
export function phraseMeteo({ heures = null, jours = null, maintenant = Date.now(), soleil = null, etat = null } = {}) {
  const H = aVenir(heures, maintenant).slice(0, 12);
  const enCours = !!etat && pleut({ condition: etat.state });
  const premiere = H.findIndex(x => pleut(x.p));
  if (premiere >= 0 || (enCours && H.length)) {
    const debut = enCours && (premiere < 0 || premiere === 0) ? null : H[premiere].t;
    let fin = null, cumul = 0, i = debut == null ? 0 : premiere;
    for (; i < H.length && pleut(H[i].p); i++) { fin = H[i].t; cumul += nombreOuNull(H[i].p.precipitation) || 0; }
    const finTexte = fin != null ? heureRonde(fin + 3600000) : null;
    if (debut == null) {
      return { texte: finTexte ? tr('Pluie jusqu’à {h}', { h: finTexte }) : tr('Pluie en cours'), conseil: cumul > 0 ? tr('Environ {n} mm encore attendus.', { n: mmArrondi(cumul) }) : null, ton: 'cold' };
    }
    const d = heureRonde(debut);
    const texte = finTexte && finTexte !== d ? tr('Pluie vers {a}, jusqu’à {b}', { a: d, b: finTexte }) : tr('Pluie vers {h}', { h: d });
    const conseil = cumul > 0 ? tr('Rentrez le linge avant {h}. Environ {n} mm attendus.', { h: d, n: mmArrondi(cumul) }) : tr('Rentrez le linge avant {h}.', { h: d });
    return { texte, conseil, ton: 'cold' };
  }
  if (soleil && estNuit(maintenant, soleil) && H.length) {
    const lever = Date.parse((soleil.attributes || {}).next_rising || '');
    const avantLever = isNaN(lever) ? H : H.filter(x => x.t <= lever + 3600000);
    const avecTemp = avantLever.filter(x => nombreOuNull(x.p.temperature) != null);
    if (avecTemp.length) {
      const mini = avecTemp.reduce((m, x) => (nombreOuNull(x.p.temperature) < nombreOuNull(m.p.temperature) ? x : m));
      const t = nombreOuNull(mini.p.temperature);
      const h = heureRonde(mini.t);
      if (t <= 0) return { texte: tr('Gel au réveil : {t} vers {h}', { t: degres(t), h }), conseil: tr('Protégez les plantes sensibles.'), ton: 'cold' };
      const clair = avantLever.every(x => /clear|sunny/.test(String(x.p.condition || '')));
      const conseil = t <= 3 ? tr('Il peut geler au sol.') : clair ? tr('Ciel dégagé toute la nuit, sans risque de gel.') : null;
      return { texte: tr('Fraîche au réveil : {t} vers {h}', { t: degres(t), h }), conseil, ton: null };
    }
  }
  const J = aVenir(jours, maintenant - 86400000).filter(x => !memeJourQue(x.t, maintenant) || x.t > maintenant);
  if (!J.length && !H.length) return null;
  const jourPluie = J.find(x => !memeJourQue(x.t, maintenant) && pleut(x.p));
  if (jourPluie) {
    const demain = memeJourQue(jourPluie.t, maintenant + 86400000);
    const quand = demain ? tr('demain') : jourLong(jourPluie.t);
    const mm = nombreOuNull(jourPluie.p.precipitation);
    return { texte: tr('Sec jusqu’à {j}', { j: quand }), conseil: mm > 0 ? tr('La pluie arrive {j}, autour de {n} mm.', { j: quand, n: mmArrondi(mm) }) : tr('La pluie arrive {j}.', { j: quand }), ton: null };
  }
  if (J.length >= 2) return { texte: tr('Sec toute la semaine'), conseil: null, ton: null };
  return null;
}

/* Le soleil, lu dans sun.sun : de jour le coucher, de nuit le prochain lever —
 * et l'autre heure, pour le sous-titre de la tuile. Sans horaires, rien. */
export function soleilMeteo(maintenant, soleil) {
  const a = (soleil && soleil.attributes) || {};
  const lever = Date.parse(a.next_rising || ''), coucher = Date.parse(a.next_setting || '');
  if (isNaN(lever) || isNaN(coucher)) return null;
  const nuit = estNuit(maintenant, soleil);
  const heure = hhmm(nuit ? lever : coucher), autre = hhmm(nuit ? coucher : lever);
  return { jour: !nuit, libelle: nuit ? tr('Lever {h}', { h: heure }) : tr('Coucher {h}', { h: heure }), heure, autre };
}

/* La vigilance, vue du widget : le niveau, son ton, sa phrase, et si elle
 * doit se voir SUR L'ACCUEIL. Orange et rouge teintent le widget et prennent
 * la phrase ; le jaune reste dans la popup — l'Accueil ne fait pas de bruit
 * pour une vigilance jaune. Lit le capteur de Météo-France (son état est le
 * niveau, ses attributs les phénomènes) ou le binaire MeteoAlarm. */
export function vigilanceWidget(S, id) {
  const st = id && S ? S[id] : null;
  if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
  const a = st.attributes || {};
  let niveau = null, detail = null;
  if (estMeteoAlarm(id, a)) {
    const on = st.state === 'on';
    const couleur = niveauDe(String(a.awareness_level || '').split(';')[1]);
    niveau = on ? (a.severity === 'Severe' || a.severity === 'Extreme' ? 'rouge' : couleur || 'jaune') : (couleur === 'vert' ? 'vert' : null);
    detail = on ? (a.event || a.headline || null) : null;
  } else {
    niveau = niveauDe(st.state);
    const phenomenes = niveau && niveau !== 'vert' ? Object.keys(a).filter(k => niveauDe(a[k]) === niveau) : [];
    detail = phenomenes.length ? phenomenes.join(', ') : null;
  }
  if (!niveau) return null;
  const mots = { vert: tr('Vigilance verte'), jaune: tr('Vigilance jaune'), orange: tr('Vigilance orange'), rouge: tr('Vigilance rouge') };
  const texte = !detail ? mots[niveau] : /vigilance/i.test(detail) ? detail : mots[niveau] + ' · ' + detail;
  const ton = niveau === 'rouge' ? 'bad' : niveau === 'orange' ? 'warn2' : niveau === 'jaune' ? 'warn' : null;
  return { niveau, ton, texte, widget: niveau === 'orange' || niveau === 'rouge' };
}
