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

/** Les repas programmés : `[{ id, time, label, g, auto }]`, vide par défaut.
 * Un repas sans heure lisible, ou dont l'interrupteur n'est pas une entité,
 * ne passe pas : `deriveAccueil` fait `m.time.split(':')`. */
export function croqMeals() {
  const c = loggiaEnt('feeder', null);
  return (c && Array.isArray(c.meals) && c.meals.length)
    ? c.meals.filter(m => m && typeof m.time === 'string' && (!m.auto || estId(m.auto))) : [];
}

/** Les repas tels que Paramètres les ÉDITE : `[{ time, label, g, auto }]`, en
 * texte, comme le formulaire (05/10, suite du point 10b).
 * `croqMeals` écarte ce que la fiche et l'Accueil ne savent pas programmer ;
 * l'éditeur, lui, le garde pour qu'on le répare — sinon le prochain
 * « Enregistrer » effaçait le repas, libellé et grammes compris, sans rien
 * dire. Seul ce qui n'est pas un repas (`null`, un nombre, une liste) part.
 * Une heure illisible se montre vide, un interrupteur qui n'est pas une entité
 * aussi : deux champs à remplir, pas un repas perdu. */
export function croqRepasEdition() {
  const c = loggiaEnt('feeder', null);
  const texte = (v) => (typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v)) ? String(v) : '');
  return (c && Array.isArray(c.meals))
    ? c.meals.filter(m => m && typeof m === 'object' && !Array.isArray(m)).map(m => ({
      time: typeof m.time === 'string' ? m.time : '', label: texte(m.label), g: texte(m.g), auto: estId(m.auto) ? m.auto : '',
    })) : [];
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
