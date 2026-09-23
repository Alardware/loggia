/* Lire la configuration : les petites fonctions qui la traduisent en données
 * (deuxième étape du découpage, plan M1).
 *
 * Chacune fait la même chose — aller chercher une clé, vérifier qu'elle a la
 * forme attendue, rendre un défaut sûr quand elle ne l'a pas. C'est du travail
 * de lecture, pas d'affichage : ni React, ni DOM, ni `hass`. Elles vivaient
 * dispersées dans `App.jsx`, chacune à quelques lignes de son seul appelant
 * visible, alors qu'une dizaine d'endroits les appellent.
 *
 * La règle commune : une configuration absente, vide ou mal formée rend le
 * défaut, jamais `undefined` — c'est ce qui permet aux vues de s'écrire sans
 * une garde à chaque ligne.
 *
 * N'entrent ici que les lectures PURES. Celles qui se rabattent sur ce que
 * Home Assistant a découvert (`voletCovers`, `switchLights`) restent avec le
 * reste : elles lisent deux sources, pas une.
 */
import { cfgVal, loggiaEnt, readLS } from './state.js';

/* ── Les volets ───────────────────────────────────────────────────────────── */

/** L'entité qui porte le mode d'automatisme des volets, ou `null`. */
export function voletMode() {
  const c = loggiaEnt('covers', null);
  return (c && c.mode) || null;
}

/** Les jours du planning des volets : `[{ haid, … }]`, vide par défaut. */
export function voletDays() {
  const c = loggiaEnt('covers', null);
  return (c && Array.isArray(c.days) && c.days.length) ? c.days : [];
}

/* ── Le distributeur de croquettes ────────────────────────────────────────── */

/** Les entités du distributeur : `{ reservoir, portionWeight, distribuees }`. */
export function croqHaids() {
  const c = loggiaEnt('feeder', null);
  return (c && c.haids) || {};
}

/** Les repas programmés : `[{ id, time, label, g, auto }]`, vide par défaut. */
export function croqMeals() {
  const c = loggiaEnt('feeder', null);
  return (c && Array.isArray(c.meals) && c.meals.length) ? c.meals : [];
}

/* ── Le reste ─────────────────────────────────────────────────────────────── */

/** Les scripts de scènes Hue désignés : `{ <clé>: 'script.…' }`. */
export function hueScripts() {
  const c = loggiaEnt('hueScripts', null);
  return (c && typeof c === 'object') ? c : {};
}

/** Les entités de notification désignées : `{ <clé>: '…' }`. */
export function notifIds() {
  const c = loggiaEnt('notifications', null);
  return (c && typeof c === 'object') ? c : {};
}

/** Les pièces que l'utilisateur a masquées sur l'Accueil. */
export function roomHidden() {
  const v = readLS('loggia_roomhidden', []);
  return Array.isArray(v) ? v : [];
}

/** Les plantes suivies : `[{ base, name, room }]`, sans les lignes sans base. */
export function plantsCfg() {
  const raw = cfgVal('loggia_plants', null);
  return (Array.isArray(raw) && raw.length) ? raw.filter(p => p && p.base) : [];
}
