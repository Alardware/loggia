/* Les langues de Loggia, en un seul endroit (ADR 0070).
 *
 * Ce module est minuscule et sans dependance : l'amorce (`main.jsx`) l'importe
 * pour charger le bon catalogue AVANT d'evaluer l'application, et `i18n.js`
 * pour resoudre la langue. Avant, l'anglais etait ecrit en dur a trois
 * endroits ; ajouter une langue, c'est desormais un fichier dans ce dossier et
 * une ligne dans chacune des trois tables ci-dessous.
 *
 * Le francais n'a pas de catalogue : c'est la langue des sources. */

/* Ce que le selecteur propose. `nom` est le nom de la langue DANS cette langue
 * (c'est ainsi qu'on la reconnait) ; `enFrancais` est la cle de son nom
 * traduit, lu par `tr` sous le nom natif. */
export const LANGUES = [
  { code: 'auto', nom: 'Suivre Home Assistant' },
  { code: 'fr', nom: 'Français', enFrancais: 'français' },
  { code: 'en', nom: 'English', enFrancais: 'anglais' },
  { code: 'de', nom: 'Deutsch', enFrancais: 'allemand' },
  { code: 'nl', nom: 'Nederlands', enFrancais: 'néerlandais' },
  { code: 'it', nom: 'Italiano', enFrancais: 'italien' },
  { code: 'es', nom: 'Español', enFrancais: 'espagnol' },
  { code: 'pl', nom: 'Polski', enFrancais: 'polonais' },
];

/* Un catalogue ne se charge que si la langue resolue le demande : 40 a 50 Ko
 * chacun, que le boot francophone n'a aucune raison d'emporter. Des imports
 * explicites, pas un gabarit : Vite en fait un morceau chacun, et Node (les
 * tests) les resout sans magie. */
export const CHARGEURS = {
  en: () => import('./en.js'),
  de: () => import('./de.js'),
  nl: () => import('./nl.js'),
  it: () => import('./it.js'),
  es: () => import('./es.js'),
  pl: () => import('./pl.js'),
};

/* La locale d'`Intl` pour chaque langue : dates, heures, nombres, tri. Une
 * langue sans entree est rendue telle quelle — `Intl` sait quoi faire de
 * « pt », et se rabat seul sur le navigateur si le code ne lui dit rien. */
export const LOCALES = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', nl: 'nl-NL', it: 'it-IT', es: 'es-ES', pl: 'pl-PL' };

/** Un code que Loggia sait servir en entier : le francais, ou une langue qui
 * a son catalogue. C'est aussi ce que `?lang=` de la demo accepte. */
export function langueServie(code) {
  return code === 'fr' || Object.prototype.hasOwnProperty.call(CHARGEURS, code);
}
