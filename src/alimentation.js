/* ── « Alimentée par » : une ampoule derrière un interrupteur (audit du 12/11, X4 ; ADR 0369) ──
 *
 * Une ampoule connectée posée derrière un interrupteur mural n'a plus de
 * courant quand il est éteint. Home Assistant, lui, garde son dernier état —
 * « allumée » pour toujours —, ou la dit injoignable au bout de dix minutes :
 * la pièce comptait une lampe allumée dans le noir, ou une panne qui n'en est
 * pas une.
 *
 * La maison le dit une fois (`loggia_alimentation`, la fiche de l'ampoule,
 * réservé aux administrateurs) : `{ ampoule: source }`, deux `light.*` ou
 * `switch.*`. Tant que la source est ÉTEINTE, l'ampoule est vue éteinte, avec
 * la marque de ce qui la coupe (`loggia_coupee_par`) — et c'est le RELEVÉ que
 * l'écran lit qui le porte (`avecAlimentation`, posé dans `getHass`) : chaque
 * compteur, la santé des appareils, la recherche lisent tous `state`, aucun
 * n'a à connaître la relation. Une source muette ou absente ne dit rien :
 * l'ampoule garde son propre état.
 *
 * Pur : ni DOM, ni React, ni lecture de la configuration — l'appelant passe ce
 * qu'il a lu. Le serveur tient la même règle (`lumieres_maison.py`).
 */

/** La clé de la configuration de la maison. */
export const CLE_ALIMENTATION = 'loggia_alimentation';
/* La marque posée sur l'état d'une ampoule sans courant : l'identifiant de sa source. */
const MARQUE = 'loggia_coupee_par';

const commandable = (x) => typeof x === 'string' && (x.indexOf('light.') === 0 || x.indexOf('switch.') === 0);
const possede = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const objet = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);

/**
 * La relation, lue proprement : `{ ampoule: source }`, deux `light.*` ou `switch.*` différents. Une source ne peut pas être
 * elle-même alimentée : la relation qui la nomme s'écarte — ni chaîne, ni boucle, et une seule question à poser.
 */
export function alimentationsDe(brut) {
  const b = objet(brut);
  if (!b) return {};
  const propres = {};
  Object.keys(b).forEach((a) => { if (commandable(a) && commandable(b[a]) && a !== b[a]) propres[a] = b[a]; });
  const out = {};
  Object.keys(propres).forEach((a) => { if (!possede(propres, propres[a])) out[a] = propres[a]; });
  return out;
}

/** La source qui coupe `id` en ce moment — elle est éteinte (`off`) —, ou null. `S` : le relevé ; `alim` : la relation lue. */
export function sourceCoupee(id, S, alim) {
  const source = alim && possede(alim, id) ? alim[id] : null;
  const st = source && S ? S[source] : null;
  return st && st.state === 'off' ? source : null;
}

/** Ce qui coupe cette ampoule, lu sur son état tel que l'écran le voit (`avecAlimentation`) ; null : elle a du courant. */
export const coupeePar = (st) => (st && typeof st[MARQUE] === 'string' && st[MARQUE]) || null;

/** Les ampoules que `source` alimente. */
export const alimentees = (alim, source) => Object.keys(alim || {}).filter(a => alim[a] === source);

/* Ce que Home Assistant efface d'une lampe éteinte : une ampoule sans courant ne garde pas son dernier réglage. */
const REGLAGES = ['brightness', 'color_mode', 'color_temp', 'color_temp_kelvin', 'hs_color', 'rgb_color', 'rgbw_color', 'rgbww_color', 'xy_color', 'effect'];

/* L'état d'une ampoule sans courant : éteinte, depuis que sa source l'est — son `last_updated` suit celui de la source, les
 * abonnements de l'écran (`useHass` : l'état et `last_updated`) se relancent donc quand le courant part ou revient. */
function etatCoupe(st, src, source) {
  const attributes = { ...(st.attributes || {}) };
  REGLAGES.forEach((k) => { delete attributes[k]; });
  return { ...st, state: 'off', attributes, last_changed: src.last_changed || st.last_changed, last_updated: src.last_updated || st.last_updated, [MARQUE]: source };
}

/* Le même état rendu tant que ni l'ampoule ni sa source n'ont bougé : ce qui se mémorise sur l'identité d'un état reste mémorisé. */
const memoire = new Map();

/**
 * Le relevé tel que l'écran le lit : `S` lui-même quand aucune ampoule n'est coupée — rien n'est recopié —, sinon sa copie où
 * chaque ampoule sans courant est éteinte et marquée. Une ampoule sans état n'en reçoit pas.
 */
export function etatsAlimentes(S, alim) {
  if (!objet(S) || !objet(alim)) return S;
  let out = null;
  Object.keys(alim).forEach((id) => {
    const source = sourceCoupee(id, S, alim);
    const st = S[id];
    if (!source || !objet(st)) return;
    const src = S[source];
    let m = memoire.get(id);
    if (!m || m.st !== st || m.src !== src) { m = { st, src, vu: etatCoupe(st, src, source) }; memoire.set(id, m); }
    if (!out) out = { ...S };
    out[id] = m.vu;
  });
  return out || S;
}

/* Un `hass` vu : le même objet tant que ni lui, ni son relevé, ni la relation n'ont changé — ce qui compare deux `hass` ne voit
 * pas un changement à chaque lecture. */
const enveloppes = new WeakMap();
let dernierBrut = null;
let dernieresRelations = {};

/**
 * Le `hass` tel que l'écran le lit (`getHass`, state.js) : lui-même sans relation, ou quand aucune ampoule n'est coupée ; sinon
 * son double, au relevé corrigé (`etatsAlimentes`). `brut` : `loggia_alimentation`, telle que la configuration la rend.
 */
export function avecAlimentation(hass, brut) {
  if (!objet(hass) || !objet(hass.states) || !objet(brut)) return hass;
  const deja = enveloppes.get(hass);
  if (deja && deja.brut === brut && deja.states === hass.states) return deja.vu;
  if (brut !== dernierBrut) { dernierBrut = brut; dernieresRelations = alimentationsDe(brut); }
  const S = etatsAlimentes(hass.states, dernieresRelations);
  const vu = S === hass.states ? hass : Object.assign(Object.create(Object.getPrototypeOf(hass)), hass, { states: S });
  enveloppes.set(hass, { brut, states: hass.states, vu });
  return vu;
}

/**
 * Ce qui s'écrit dans la configuration (`cfgSet`) : `id` alimentée par `source`, ou plus par rien (`source` vide). Les autres
 * relations restent telles quelles ; null quand il n'en reste aucune — la clé s'efface.
 */
export function poserAlimentation(brut, id, source) {
  const b = objet(brut) || {};
  const out = {};
  Object.keys(b).forEach((k) => { if (k !== id) out[k] = b[k]; });
  if (commandable(id) && commandable(source) && id !== source) out[id] = source;
  return Object.keys(out).length ? out : null;
}
