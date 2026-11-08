/* « Pendant votre absence » (05/11, étape 3 du rapport sur l'usage).
 *
 * Le journal existe, mais personne ne va le lire en rentrant. Ce module dit, à
 * la première ouverture après un retour, ce qui s'est passé pendant qu'il n'y
 * avait personne : l'alarme, on a sonné, un colis, une porte ou une fenêtre
 * ouverte, une machine qui a fini, du mouvement. Rien de passé : rien à dire —
 * pas de « rien à signaler ».
 *
 * L'absence se lit dans l'historique de Home Assistant : la maison est vide
 * quand toutes les personnes suivies (`person.*`) sont ailleurs ; sans personne
 * suivie, quand l'alarme est armée « absent » ou « vacances ». Elle compte si
 * elle a duré une demi-heure au moins, et elle se dit douze heures au plus
 * après le retour.
 *
 * Les dix dernières minutes avant le retour ne comptent pas pour les
 * ouvertures et les mouvements : c'est soi-même qui rentre, et la porte
 * s'ouvre parfois avant que le téléphone ne le dise.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec. */
import { tr, trN, locale } from './i18n.js';
import { familleOuvrant, CLASSES_MOUVEMENT } from './attention.js';

const MUETS = ['unavailable', 'unknown', ''];
const DUREE_MIN_MS = 30 * 60000;
const FRAICHEUR_MS = 12 * 3600000;
const MARGE_RETOUR_MS = 10 * 60000;
/* Sept jours de présence relus : une semaine de vacances se raconte en entier. */
export const LECTURE_MS = 7 * 86400000;
const ALARME_ABSENT = ['armed_away', 'armed_vacation', 'triggered'];
/* L'ordre des lignes : ce qui inquiète, ce qu'on attendait, puis le reste. */
const ORDRE = ['alarme', 'sonnette', 'colis', 'ouverture', 'machine', 'mouvement'];
export const MAX_LIGNES = 6;

/** La réponse de `history/period` en séries : `{ id: [{ t, etat }] }`, dans l'ordre du temps. */
export function lireHistorique(r) {
  const out = {};
  (Array.isArray(r) ? r : []).forEach(liste => {
    const id = Array.isArray(liste) && liste[0] && liste[0].entity_id;
    if (!id) return;
    out[id] = liste
      .map(p => ({ t: Date.parse((p && (p.last_changed || p.last_updated)) || ''), etat: String(p && p.state != null ? p.state : '') }))
      .filter(p => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);
  });
  return out;
}

/** Qui dit l'absence : les personnes suivies, sinon l'alarme (`alarme` : celle de Paramètres). null sans l'une ni l'autre. */
export function sujetsAbsence(S, alarme = '') {
  if (!S || typeof S !== 'object') return null;
  const vivant = (id) => !!S[id] && MUETS.indexOf(String(S[id].state)) < 0;
  const personnes = Object.keys(S).filter(id => id.indexOf('person.') === 0 && vivant(id)).sort();
  if (personnes.length) return { ids: personnes, absent: (etat) => etat !== 'home' };
  const a = alarme && vivant(alarme) ? alarme : Object.keys(S).sort().find(id => id.indexOf('alarm_control_panel.') === 0 && vivant(id));
  return a ? { ids: [a], absent: (etat) => ALARME_ABSENT.indexOf(etat) >= 0 } : null;
}

/** L'état du moment ajouté au bout de chaque série : l'historique peut ne pas avoir encore enregistré un retour d'à l'instant. */
export function avecEtatActuel(series, S, ids) {
  const out = { ...(series || {}) };
  (ids || []).forEach(id => {
    const st = S && S[id];
    const t = st ? Date.parse(st.last_changed || st.last_updated || '') : NaN;
    if (!Number.isFinite(t)) return;
    const l = out[id] || [];
    if (!l.length || l[l.length - 1].t < t) out[id] = [...l, { t, etat: String(st.state) }];
  });
  return out;
}

/** La dernière absence FINIE : `{ debut, fin }` en ms, ou null — encore absent, jamais parti, trop courte ou trop ancienne. */
export function derniereAbsence(series, ids, absent, maintenant = Date.now()) {
  const pts = [];
  (ids || []).forEach(id => ((series && series[id]) || []).forEach(p => pts.push({ id, t: p.t, etat: p.etat })));
  pts.sort((a, b) => a.t - b.t);
  const cur = {};
  let depuis = null, derniere = null;
  pts.forEach(p => {
    // Un téléphone muet ne dit ni un départ ni un retour : on garde ce qu'on savait.
    if (MUETS.indexOf(p.etat) >= 0) return;
    cur[p.id] = p.etat;
    const vide = ids.every(id => cur[id] != null && absent(cur[id]));
    if (vide && depuis == null) depuis = p.t;
    else if (!vide && depuis != null) { derniere = { debut: depuis, fin: p.t }; depuis = null; }
  });
  if (depuis != null || !derniere) return null;
  if (derniere.fin - derniere.debut < DUREE_MIN_MS) return null;
  return encoreFraiche(derniere, maintenant) ? derniere : null;
}

export const encoreFraiche = (abs, maintenant = Date.now()) => !!abs && maintenant - abs.fin <= FRAICHEUR_MS;

/** Ce qu'on écoute pendant l'absence : `{ id: { genre, nom, famille? } }`. `porte` : les entités de la porte
 *  (`evenementsPorte`, la sonnette et le colis) ; les binaires suivent les exclusions de la rangée sûreté. */
export function entitesAbsence(S, { porte = [], plateforme = () => null, masque = () => false } = {}) {
  const out = {};
  if (!S || typeof S !== 'object') return out;
  const nom = (id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || id;
  (porte || []).forEach(e => { if (e && S[e.id] && (e.genre === 'sonnette' || e.genre === 'colis')) out[e.id] = { genre: e.genre, nom: nom(e.id) }; });
  Object.keys(S).forEach(id => {
    const a = (S[id] && S[id].attributes) || {};
    if (masque(id) || Array.isArray(a.entity_id) || plateforme(id) === 'group') return;
    if (id.indexOf('binary_sensor.') === 0) {
      const famille = familleOuvrant(a.device_class);
      if (famille) out[id] = { genre: 'ouverture', nom: nom(id), famille };
      else if (CLASSES_MOUVEMENT.indexOf(a.device_class) >= 0) out[id] = { genre: 'mouvement', nom: nom(id) };
    } else if (id.indexOf('alarm_control_panel.') === 0) out[id] = { genre: 'alarme', nom: nom(id) };
  });
  return out;
}

/** Ce qui s'est passé entre `debut` et `fin` : `[{ genre, id, nom, famille, fois: [ms] }]`, une ligne par entité. */
export function faitsAbsence({ debut, fin, series, entites }) {
  const out = [];
  Object.keys(entites || {}).sort().forEach(id => {
    const e = entites[id];
    const fois = [];
    let avant = null;
    ((series && series[id]) || []).forEach(p => {
      const dedans = p.t > debut && p.t <= fin;
      if (e.genre === 'sonnette' || e.genre === 'colis') {
        // L'état d'une entité `event` EST l'instant de l'appui : un redémarrage qui le rend tel quel ne compte pas deux fois.
        const quand = Date.parse(p.etat);
        if (Number.isFinite(quand) && quand > debut && quand <= fin && fois.indexOf(quand) < 0) fois.push(quand);
      } else if (e.genre === 'alarme') {
        if (dedans && p.etat === 'triggered' && avant !== 'triggered') fois.push(p.t);
      } else if (dedans && avant === 'off' && p.etat === 'on' && p.t <= fin - MARGE_RETOUR_MS) fois.push(p.t);
      avant = p.etat;
    });
    if (fois.length) out.push({ genre: e.genre, id, nom: e.nom, famille: e.famille || null, fois: fois.sort((a, b) => a - b) });
  });
  return out;
}

/** Les machines qui ont fini pendant l'absence, lues dans `loggia/prises/etat` (les cycles des sept derniers jours). */
export function faitsCycles(etat, abs, nomDe = (id) => id) {
  const t = etat && etat.prises;
  if (!t || typeof t !== 'object' || !abs) return [];
  const out = [];
  Object.keys(t).sort().forEach(id => {
    const p = t[id];
    if (!p || !Array.isArray(p.cycles)) return;
    const fois = p.cycles.map(c => Date.parse((c && c.fin) || '')).filter(ms => Number.isFinite(ms) && ms > abs.debut && ms <= abs.fin).sort((a, b) => a - b);
    if (fois.length) out.push({ genre: 'machine', id, nom: nomDe(id, p.type), type: p.type || null, fois });
  });
  return out;
}

export const trierFaits = (lignes) => [...(lignes || [])].sort((a, b) => (ORDRE.indexOf(a.genre) - ORDRE.indexOf(b.genre)) || (a.fois[0] - b.fois[0]));

/** L'heure d'un fait : « 14:12 » le jour même, « sam. 14:12 » un autre jour. */
export function heureDe(ms, maintenant = Date.now()) {
  const d = new Date(ms);
  if (d.toDateString() === new Date(maintenant).toDateString()) return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/* Trois heures au plus : au-delà, le nombre suffit. */
const heures = (fois, maintenant) => fois.slice(0, 3).map(t => heureDe(t, maintenant)).join(', ') + (fois.length > 3 ? ', …' : '');

/** Une ligne de la carte : `{ titre, detail }` dans la langue de l'écran. */
export function texteFait(l, maintenant = Date.now()) {
  const n = l.fois.length;
  const p = { n, heures: heures(l.fois, maintenant), heure: heures(l.fois, maintenant) };
  if (l.genre === 'alarme') return { titre: tr('Alarme'), detail: trN(n, 'Déclenchée à {heures}', 'Déclenchée {n} fois : {heures}', p) };
  if (l.genre === 'sonnette') return { titre: tr('Sonnette'), detail: n === 1 ? tr('On a sonné à {heure}', p) : tr('On a sonné {n} fois : {heures}', p) };
  if (l.genre === 'colis') return { titre: tr('Colis'), detail: n === 1 ? tr('Un colis déposé à {heure}', p) : tr('{n} colis déposés : {heures}', p) };
  if (l.genre === 'ouverture') return { titre: l.nom, detail: trN(n, 'Ouverture à {heures}', '{n} ouvertures : {heures}', p) };
  if (l.genre === 'machine') return { titre: l.nom, detail: tr('Cycle terminé à {heures}', p) };
  return { titre: l.nom, detail: trN(n, 'Mouvement à {heures}', '{n} mouvements : {heures}', p) };
}

/** Ce que la phrase du bandeau en dit : « 3 événements pendant votre absence ». */
export function phraseAbsence(absence) {
  const n = ((absence && absence.lignes) || []).reduce((s, l) => s + l.fois.length, 0);
  return trN(n, '1 événement pendant votre absence', '{n} événements pendant votre absence', { n });
}
