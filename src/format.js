/* Mettre un nombre ou une date en mots (première étape du découpage, plan M1).
 *
 * Ces fonctions vivaient au milieu d'`App.jsx`, à mille lignes de leurs dix
 * appelants. Elles n'ont besoin ni de React, ni du DOM, ni de `hass` : une
 * valeur entre, une chaîne sort. C'est exactement ce qu'un test peut vérifier
 * sans rendre quoi que ce soit.
 *
 * Elles parlent la langue de l'écran. Les deux étaient écrites en français : un
 * anglophone lisait « 1,50 kW » et « Il y a 3 min » au milieu de son interface,
 * ce qu'un commentaire d'App.jsx signalait sans le corriger.
 */
import { tr, locale } from './i18n.js';

/** Des watts, en W sous le kilowatt et en kW au-dessus : `1 240` → « 1,24 kW ».
 *
 * Deux décimales sur les kilowatts, aucune sur les watts — un compteur qui
 * oscille de quelques watts n'apprend rien, et le chiffre danserait. */
export function fmtWatts(w) {
  if (w == null || isNaN(w)) return '—';
  if (Math.abs(w) >= 1000) {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(w / 1000) + ' kW';
  }
  return new Intl.NumberFormat(locale()).format(Math.round(w)) + ' W';
}

/** Depuis quand, en gros : « À l'instant », « Il y a 3 min », « Il y a 2 h ».
 *
 * L'approximation est voulue : ces lignes disent la fraîcheur d'une donnée, et
 * la seconde près n'y ajoute rien. Une date illisible rend une chaîne vide
 * plutôt qu'un « Invalid Date » à l'écran. */
export function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const d = (Date.now() - t) / 1000;
  if (d < 60) return tr('À l\'instant');
  if (d < 3600) return tr('Il y a {n} min', { n: Math.floor(d / 60) });
  if (d < 86400) return tr('Il y a {n} h', { n: Math.floor(d / 3600) });
  return tr('Il y a {n} j', { n: Math.floor(d / 86400) });
}
