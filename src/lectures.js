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

/* Un identifiant d'entité est une chaîne non vide, et un recueil d'entités
 * un objet qui n'en garde que de telles (05/10, point 10b de l'audit de
 * Luna) : `useHass` fait `k.charAt(...)` sur chaque clé surveillée, et un
 * nombre ou un objet venu d'une configuration abîmée (import retouché, ancienne
 * version) faisait tomber tout l'écran, pas seulement sa carte. */
const estId = (v) => typeof v === 'string' && v !== '';
const ids = (o) => (o && typeof o === 'object' && !Array.isArray(o))
  ? Object.fromEntries(Object.entries(o).filter(([, v]) => estId(v))) : {};

/* ── Les volets ───────────────────────────────────────────────────────────── */

/** L'entité qui porte le mode d'automatisme des volets, ou `null`. */
export function voletMode() {
  const c = loggiaEnt('covers', null);
  return (c && estId(c.mode)) ? c.mode : null;
}

/** Les jours du planning des volets : `[{ haid, … }]`, vide par défaut. */
export function voletDays() {
  const c = loggiaEnt('covers', null);
  return (c && Array.isArray(c.days) && c.days.length) ? c.days.filter(d => d && estId(d.haid)) : [];
}

/* ── Le distributeur de croquettes ────────────────────────────────────────── */

/** Les entités du distributeur : `{ reservoir, portionWeight, distribuees }`. */
export function croqHaids() {
  const c = loggiaEnt('feeder', null);
  return ids(c && c.haids);
}

/** L'ANCIENNE liste de repas, pour la migration seulement (ADR 0155, 05/10) :
 * `[{ heure, label, auto, relie }]`.
 * La liste saisie dans Paramètres a cessé d'être un planning — le planning
 * vient de l'appareil, des automatisations qui le commandent, ou du planning
 * de Loggia. Elle n'est pas effacée pour autant : l'encart « Ancienne liste de
 * repas » la compte et la montre, et ses `automation.*` servent d'indices.
 * Rien ne se perd en silence, rien ne resert en silence : on lit TOUT ce qui
 * ressemble à un repas — un repas abîmé se compte aussi, il ne disparaît pas
 * de l'encart. `croqMeals` (la liste prise pour un planning) et
 * `croqRepasEdition` (son éditeur dans Paramètres) sont partis le 05/10 avec
 * leurs derniers lecteurs : la liste n'a plus d'éditeur, « Enregistrer » la
 * recopie telle quelle (`feederAEcrire`, views/parametres.jsx).
 * `relie` : l'interrupteur du repas est une automatisation (un
 * `input_boolean` ne distribuait rien par lui-même). Une heure illisible se
 * rend vide. */
export function croqAncienneListe() {
  const c = loggiaEnt('feeder', null);
  const texte = (v) => (typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v)) ? String(v) : '');
  return (c && Array.isArray(c.meals))
    ? c.meals.filter(m => m && typeof m === 'object' && !Array.isArray(m)).map(m => {
      const auto = estId(m.auto) ? m.auto : null;
      return {
        heure: typeof m.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(m.time) ? m.time : '',
        label: texte(m.label), auto, relie: !!auto && auto.indexOf('automation.') === 0,
      };
    }) : [];
}

/* ── Le reste ─────────────────────────────────────────────────────────────── */

/** Les scripts de scènes Hue désignés : `{ <clé>: 'script.…' }`. */
export function hueScripts() {
  return ids(loggiaEnt('hueScripts', null));
}

/** Les entités de notification désignées : `{ <clé>: '…' }`. */
export function notifIds() {
  return ids(loggiaEnt('notifications', null));
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
