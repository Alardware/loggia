/* Traduire un dashboard deja ecrit en francais.
 *
 * La methode habituelle — remplacer chaque texte par un identifiant, `t('nav.rooms')`
 * — supposerait de reecrire un millier de chaines d'un coup, et le moindre oubli
 * afficherait « nav.rooms » a l'ecran. Ici LA CLE EST LE TEXTE FRANCAIS : un texte
 * absent du catalogue sort tel quel, en francais. Une traduction incomplete reste
 * donc un dashboard qui fonctionne, et la conversion peut se faire par morceaux.
 *
 * La langue suit Home Assistant par defaut, comme le reste de Loggia suit les noms
 * et les icones de l'installation. Un choix explicite la fige.
 */
import { cfgVal, getHass } from './state.js';
import EN from './langues/en.js';

/* Ajouter une langue = un fichier dans `langues/`, une entree ici, une dans
 * CATALOGUES. Rien d'autre a toucher. */
export const LANGUES = [
  { code: 'auto', nom: 'Suivre Home Assistant' },
  { code: 'fr', nom: 'Francais' },
  { code: 'en', nom: 'English' },
];

const CATALOGUES = { en: EN };

/* Le francais n'a pas de catalogue : c'est la langue des sources. */
export const LANGUE_SOURCE = 'fr';

export function langueDeHA(hass) {
  const h = hass || getHass();
  const brut = (h && (h.language || (h.locale && h.locale.language)))
    || (typeof navigator !== 'undefined' && navigator.language)
    || LANGUE_SOURCE;
  return String(brut).slice(0, 2).toLowerCase();
}

/* Ce que l'utilisateur a choisi, sans le resoudre : 'auto', 'fr', 'en'. */
export function choixLangue() {
  return cfgVal('loggia-langue', 'auto') || 'auto';
}

function resoudre(hass) {
  const choix = choixLangue();
  const code = choix === 'auto' ? langueDeHA(hass) : choix;
  return (code === LANGUE_SOURCE || CATALOGUES[code]) ? code : LANGUE_SOURCE;
}

/* Cle ou la derniere langue REELLEMENT servie est notee. Voir `resoudreTot`. */
const MEMO = 'loggia-langue-active';

function lireLS(cle) {
  try {
    const v = localStorage.getItem(cle);
    if (v == null) return null;
    try { return JSON.parse(v); } catch (e) { return v; }
  } catch (e) { return null; }
}

const valide = (c) => !!(c && (c === LANGUE_SOURCE || CATALOGUES[c]));

/* La langue AVANT que quoi que ce soit ne soit charge.
 *
 * Plusieurs modules construisent des tableaux de libelles au niveau du fichier —
 * la navigation, la liste des themes. Ces `t()` s'evaluent a l'import, bien avant
 * que `hass` existe : sans resolution des maintenant, ces libelles resteraient
 * figes en francais pendant que le reste de l'ecran passe a l'anglais.
 *
 * Le stockage local suffit : le selecteur y ecrit le choix explicite, et
 * `preparerLangue` y note la langue effective une fois `hass` connu. Seul le tout
 * premier affichage, sur un appareil qui n'a jamais rien note, se rabat sur la
 * langue du navigateur. */
function resoudreTot() {
  const choix = lireLS('loggia-langue') || 'auto';
  if (choix !== 'auto') return valide(choix) ? choix : LANGUE_SOURCE;
  const memo = lireLS(MEMO);
  if (valide(memo)) return memo;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || LANGUE_SOURCE;
  const c = String(nav).slice(0, 2).toLowerCase();
  return valide(c) ? c : LANGUE_SOURCE;
}

/* `t` est appele des milliers de fois par rendu : la langue est resolue une fois
 * et gardee. `preparerLangue` la recalcule quand `hass` arrive. */
let _code = resoudreTot();
let _cat = CATALOGUES[_code] || null;

export function preparerLangue(hass) {
  const avant = _code;
  _code = resoudre(hass);
  _cat = CATALOGUES[_code] || null;
  try { localStorage.setItem(MEMO, JSON.stringify(_code)); } catch (e) { /* sans memo, on repart du navigateur */ }
  // `index.html` porte `lang="fr"` en dur : sans cette ligne, un lecteur d'ecran
  // lirait de l'anglais avec la prononciation francaise, et la cesure serait
  // celle du francais.
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = _code;
  } catch (e) { /* pas de DOM : rien a annoncer */ }
  return avant !== _code;
}

export function langue() {
  return _code;
}

/** Le texte dans la langue active. Absent du catalogue → le francais d'origine.
 *
 * `params` remplace les reperes `{nom}` : `t('{n} appareils', { n: 4 })`. Les
 * reperes restent lisibles dans le catalogue, ou l'ordre des mots change souvent
 * d'une langue a l'autre. */
export function t(texte, params) {
  if (texte == null) return texte;
  let s = (_cat && _cat[texte]) || texte;
  if (params) {
    for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  }
  return s;
}

/* Le tri alphabetique depend de la langue : en suedois « a trema » vient apres
 * « z ». Les listes triaient toutes sur 'fr' en dur. */
export function comparerTextes(a, b) {
  return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), langue());
}
