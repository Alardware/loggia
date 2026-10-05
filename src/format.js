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
 * oscille de quelques watts n'apprend rien, et le chiffre danserait.
 *
 * L'unité se choisit APRÈS l'arrondi (05/10) : 999,6 W, encore sous le seuil,
 * s'écrivait « 1 000 W », et 1 000 W « 1,00 kW » — la même puissance écrite
 * de deux façons d'une mise à jour à l'autre. Comme `nombre()`, ce qui
 * ne se lit pas (`null`, '', l'infini) rend « — », et « -0 W » n'existe pas :
 * un onduleur publie volontiers -0,4 W la nuit. */
export function fmtWatts(w) {
  if (w == null || w === '') return '—';
  const n = Number(w);
  if (!isFinite(n)) return '—';
  const r = Math.round(n) || 0;
  if (Math.abs(r) >= 1000) {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1000) + ' kW';
  }
  return new Intl.NumberFormat(locale()).format(r) + ' W';
}

/* Un format par locale et par nombre de décimales : `dec` (App.jsx) est appelé
 * des dizaines de fois par rendu, et le format ne change qu'avec la langue. */
const _formats = {};

/** Un nombre écrit comme on l'écrit dans la langue de l'écran : `nombre(21.5, 1)`
 * donne « 21,5 » en français, « 21.5 » en anglais (audit du 03/10).
 *
 * La 3.82.0 avait retiré les vingt-trois remplacements du point par la virgule
 * qui faisaient lire « 21,5 °C » à un anglophone. Il restait l'inverse : des
 * `toFixed` et des arrondis faits à la main, qui posaient le POINT en
 * français — « 21.3° » sur le cadran du fil pilote, « actuel 20.6° » sur un
 * thermostat, « 4.2 mm » sur la carte météo, à côté de cartes en « 21,4° ».
 * `Intl` choisit seul, à condition de lui donner `locale()`.
 *
 * `decimales` : les chiffres gardés après la virgule. `minimum` : ceux qu'on
 * écrit même nuls — tous par défaut (« 19,0 »), 0 pour qu'un entier reste
 * entier (« 19 », mais « 19,5 »). Rien de lisible → « — », comme `fmtWatts`.
 *
 * `Intl` arrondit seul (relecture du 03/10) : il part de l'écriture décimale
 * la plus courte du nombre et éloigne de zéro une demi-valeur, comme le
 * `toLocaleString` de l'ancien `dec` d'App.jsx. Le pré-arrondi
 * `Math.round(n * k) / k` qui le précédait montait les demi-valeurs vers +∞
 * et lisait le double binaire : dans la fiche d'un capteur (`decMax`), -1,125
 * se lisait « -1,12 » quand 1,125 donnait « 1,13 », et 1,005 kWh s'écrivait
 * « 1,00 ».
 *
 * Seul ce qui s'arrondit à zéro passe par 0, pour que « -0,0 » n'existe pas,
 * ni le « -0 » d'un état « -0.0 ». Le demi-pas est la frontière exacte de
 * l'arrondi d'Intl (trois millions de valeurs comparées) : -0,05 à une
 * décimale reste « -0,1 ». `signDisplay: 'negative'` ferait le même travail,
 * mais Intl ne connaît cette valeur que depuis Chrome 106, Firefox 116 et
 * Safari 15.4, et la refuse avant par une RangeError. La cible du build
 * (vite.config.js) garde Safari 14 : le premier nombre rendu y ferait tomber
 * l'écran. */
export function nombre(v, decimales = 0, minimum = decimales) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  const min = Math.min(minimum, decimales);
  const cle = locale() + '|' + min + '|' + decimales;
  if (!_formats[cle]) _formats[cle] = new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: decimales });
  return _formats[cle].format(Math.abs(n) < 0.5 / 10 ** decimales ? 0 : n);
}

/**
 * Minutes écoulées depuis une heure de départ (audit du 03/10).
 *
 * `ts` est ce que donne une entité « heure seule » de Home Assistant : des
 * secondes depuis minuit. Une heure encore à venir aujourd'hui est celle
 * d'HIER — un lave-vaisselle lancé à 23 h 30 tourne encore à 0 h 40. Le calcul
 * se fait sur l'heure de l'HORLOGE (heures, minutes, secondes) et non sur des
 * millisecondes depuis minuit, qui comptent une heure de trop ou de moins les
 * jours de changement d'heure.
 *
 * Un horodatage complet (date comprise, donc au-delà d'une journée de
 * secondes) se lit tel quel. `null` sans départ connu.
 */
export function minutesDepuisHeure(ts, maintenant = new Date()) {
  const s = Number(ts);
  if (!s || !isFinite(s) || s < 0) return null;
  if (s >= 86400) return Math.max(0, Math.floor((maintenant.getTime() / 1000 - s) / 60));
  const ici = maintenant.getHours() * 3600 + maintenant.getMinutes() * 60 + maintenant.getSeconds();
  const depuis = ici >= s ? ici - s : ici - s + 86400;
  return Math.floor(depuis / 60);
}

/** Depuis quand, en gros : « À l'instant », « Il y a 3 min », « Il y a 2 h ».
 *
 * L'approximation est voulue : ces lignes disent la fraîcheur d'une donnée, et
 * la seconde près n'y ajoute rien. Une date illisible rend une chaîne vide
 * plutôt qu'un « Invalid Date » à l'écran.
 *
 * Une date À VENIR n'a pas d'« il y a » (05/10) : l'écart y est négatif, et
 * tout le futur tombait sous les 60 s de « À l'instant ». La fiche d'un
 * appareil passe ici chaque capteur horodaté — prochaine alarme du téléphone,
 * prochain lever du soleil, prochaine collecte —, la tuile d'une entité
 * `datetime` aussi. Une avance d'une minute au plus reste « À l'instant » :
 * c'est l'horloge de la tablette qui retarde sur celle de HA. Au-delà, l'heure
 * dite telle quelle (`heureAVenir`). */
export function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const d = (Date.now() - t) / 1000;
  if (d < -60) return heureAVenir(t);
  if (d < 60) return tr('À l\'instant');
  if (d < 3600) return tr('Il y a {n} min', { n: Math.floor(d / 60) });
  if (d < 86400) return tr('Il y a {n} h', { n: Math.floor(d / 3600) });
  return tr('Il y a {n} j', { n: Math.floor(d / 86400) });
}

/* Une heure à venir, au plus court sans mentir (05/10) : « 18:00 » plus tard
 * aujourd'hui, « mar. 07:00 » dans les six jours — le nom du jour n'y désigne
 * qu'une date ; à sept, « lun. » se lirait comme aujourd'hui —, « 12 oct.,
 * 14:00 » au-delà, l'année en plus si ce n'est pas celle-ci (un certificat qui
 * expire). Les jours se comptent au CALENDRIER local et non par tranches de
 * 24 h : lundi 23 h 30 → mardi 0 h 30, c'est demain. `new Date(Date.now())`
 * et non `new Date()` : le test fige `Date.now`. Aucun mot : Intl écrit la
 * langue de l'écran. */
function heureAVenir(t) {
  const l = locale();
  const quand = new Date(t), auj = new Date(Date.now());
  const jours = Math.round((Date.UTC(quand.getFullYear(), quand.getMonth(), quand.getDate()) - Date.UTC(auj.getFullYear(), auj.getMonth(), auj.getDate())) / 86400000);
  const heure = { hour: '2-digit', minute: '2-digit' };
  if (jours === 0) return quand.toLocaleTimeString(l, heure);
  if (jours < 7) return quand.toLocaleString(l, { weekday: 'short', ...heure });
  return quand.toLocaleString(l, { day: 'numeric', month: 'short', ...(quand.getFullYear() !== auj.getFullYear() ? { year: 'numeric' } : {}), ...heure });
}
