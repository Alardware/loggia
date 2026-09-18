/* Le nom d'un geste de télécommande, dit en français.
 *
 * Zigbee2MQTT, ZHA et deCONZ nomment les appuis à leur façon : `on_press`,
 * `off_hold_release`, `brightness_move_up`, `single_left`… C'est ce code qu'on
 * affecte, et la page le garde toujours à côté du libellé : le libellé aide à
 * lire, le code dit la vérité. Un code qu'on ne sait pas lire n'a donc pas de
 * libellé plutôt qu'un libellé inventé (`null`).
 */
import { tr } from './i18n.js';

// Les codes qui se lisent d'un bloc.
const ENTIERS = () => ({
  identify: tr('Appairage'),
  on: tr('Haut'), off: tr('Bas'), toggle: tr('Bascule'),
  brightness_move_up: tr('Plus') + ' · ' + tr('maintien'),
  brightness_move_down: tr('Moins') + ' · ' + tr('maintien'),
  brightness_stop: tr('Fin de maintien'),
  brightness_up_click: tr('Plus') + ' · ' + tr('appui'),
  brightness_down_click: tr('Moins') + ' · ' + tr('appui'),
  single: tr('Appui simple'), double: tr('Double appui'), triple: tr('Triple appui'),
  hold: tr('Maintien'), release: tr('Relâché'), long: tr('Appui long'),
});

// La touche : ce qu'on presse.
const TOUCHES = () => ({
  on: tr('Haut'), off: tr('Bas'), up: tr('Plus'), down: tr('Moins'),
  left: tr('Gauche'), right: tr('Droite'), both: tr('Les deux'), toggle: tr('Bascule'),
  arrow_left: tr('Gauche'), arrow_right: tr('Droite'),
});

// Le mouvement : comment on la presse. Les plus longs d'abord — `press_release`
// avant `release`, sans quoi « relâché » perdrait l'appui qui le précède.
const MOUVEMENTS = () => [
  ['hold_release', tr('fin de maintien')], ['long_release', tr('fin de maintien')],
  ['press_release', tr('relâché')], ['release', tr('relâché')],
  ['press', tr('appui')], ['click', tr('appui')], ['hold', tr('maintien')],
  ['single', tr('appui simple')], ['double', tr('double appui')], ['triple', tr('triple appui')],
  ['long', tr('appui long')],
];

const touche = (t) => {
  const m = /^button_(\d+)$/.exec(t);
  if (m) return tr('Bouton {n}', { n: m[1] });
  return TOUCHES()[t] || null;
};

/** « Haut · appui » pour `on_press` ; `null` pour un code inconnu. */
export function libelleGeste(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return null;
  const entier = ENTIERS()[c];
  if (entier) return entier;
  for (const [suffixe, mot] of MOUVEMENTS()) {
    // La touche puis le mouvement : `on_press`, `button_2_hold`.
    if (c.endsWith('_' + suffixe)) {
      const t = touche(c.slice(0, -(suffixe.length + 1)));
      if (t) return t + ' · ' + mot;
    }
    // Le mouvement puis la touche : `single_left`, `double_both`.
    if (c.startsWith(suffixe + '_')) {
      const t = touche(c.slice(suffixe.length + 1));
      if (t) return t + ' · ' + mot;
    }
  }
  return null;
}
