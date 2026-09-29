/**
 * Ce qu'il y a AU BOUT d'une prise (26/09).
 *
 * Une prise commandée ne dit rien d'elle-même : Home Assistant publie `on` ou
 * `off`, et c'est tout. Toutes portaient donc le même dessin et le même mot —
 * « Allumée ». Or « allumée » ne veut rien dire seule : un NAS allumé travaille,
 * une cafetière allumée chauffe, un lave-vaisselle allumé peut aussi bien être
 * en veille à 1 W. Trois situations, un seul mot, aucune couleur.
 *
 * Ce module porte la connaissance manquante : ce qu'est l'appareil, la couleur
 * et le glyphe qui le disent, et ce que sa consommation raconte de lui.
 *
 * Trois règles qu'il ne franchit pas :
 *   — il est PUR : aucun DOM, aucun état, aucune lecture de configuration ;
 *   — il ne connaît que des JETONS de couleur, jamais une couleur en dur, pour
 *     que les quinze thèmes restent maîtres chez eux ;
 *   — il ne devine rien qu'il ne puisse voir. Sans capteur de puissance, une
 *     prise reste une prise allumée : pas de phase inventée, pas de barre de
 *     progression tirée d'une moyenne.
 */

import { tr } from './i18n.js';

/** En dessous, la prise ne fait rien : l'appareil est en veille, pas en marche.
 *  Trois watts — un NAS au repos en tire trente, une TV en veille moins de deux. */
const SEUIL_VEILLE = 3;

/**
 * Les appareils que Loggia sait reconnaître.
 *
 * `fx` ne concerne QUE les types rendus par la fonte : un glyphe de police ne
 * bouge pas tout seul. `bob` un léger va-et-vient, `shake` la sirène — des
 * mouvements du glyphe lui-même, jamais quelque chose ajouté derrière lui.
 *
 * Il y avait là une lueur qui respirait et deux témoins qui clignotaient. Ils
 * venaient de moi, pas du catalogue : « derrière l'icône il y a un pulse
 * lumineux, j'en veux pas, je veux les icônes que je t'ai données » (26/09).
 * Un appareil dessiné porte déjà son mouvement ; rien n'a à s'allumer autour.
 * `marche` et `veille` remplacent les mots par défaut quand l'appareil a les
 * siens — un réfrigérateur ne « marche » pas, son compresseur tourne.
 */
export const TYPES_PRISE = {
  nas: { col: 'var(--o-purple)', rgb: 'var(--o-purple-rgb)', ico: 'database' },
  pc: { col: 'var(--o-piece-ambre)', rgb: 'var(--o-piece-ambre-rgb)', ico: 'computer' },
  lv: { col: 'var(--o-piece-bain)', rgb: 'var(--o-piece-bain-rgb)', ico: 'dishwasher' },
  ll: { col: 'var(--o-piece-tendre)', rgb: 'var(--o-piece-tendre-rgb)', ico: 'washer' },
  sl: { col: 'var(--o-gold)', rgb: 'var(--o-gold-rgb)', ico: 'dryer' },
  /* Le fer, demande par Seba882 (issue #6, 29/09) : « un fer sur prise
   * commandee, c'est souvent la raison meme pour laquelle la prise est la —
   * verifier depuis le travail qu'il est bien eteint ». Et la veille lui va
   * mieux qu'a tout le reste : un fer ne consomme rien, ou tire 2 000 W. */
  fer: { col: 'var(--o-orange)', rgb: 'var(--o-orange-rgb)', ico: 'iron', marche: 'chauffe' },
  frigo: { col: 'var(--o-cold)', rgb: 'var(--o-cold-rgb)', ico: 'fridge', marche: 'compresseur', veille: 'repos' },
  tv: { col: 'var(--o-piece-chambre)', rgb: 'var(--o-piece-chambre-rgb)', ico: 'tv-set' },
  cafe: { col: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)', ico: 'coffee-machine', marche: 'chauffe' },
  radia: { col: 'var(--o-warn2)', rgb: 'var(--o-warn2-rgb)', ico: 'radiator', marche: 'chauffe' },
  box: { col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)', ico: 'hub' },
  ve: { col: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)', ico: 'charging-station', fx: 'bob', marche: 'charge', veille: 'branchee' },
  siren: { col: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)', ico: 'bell-ring', fx: 'shake' },
  prise: { col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)', ico: null },
};

/** Le nom de chaque appareil, dans la langue affichée. */
export const NOMS_PRISE = () => ({
  nas: tr('Serveur NAS'),
  pc: tr('Ordinateur'),
  lv: tr('Lave-vaisselle'),
  ll: tr('Lave-linge'),
  sl: tr('Sèche-linge'),
  fer: tr('Fer à repasser'),
  frigo: tr('Réfrigérateur'),
  tv: tr('Télévision'),
  cafe: tr('Cafetière'),
  radia: tr('Radiateur'),
  box: tr('Box internet'),
  ve: tr('Borne de recharge'),
  siren: tr('Sirène'),
  prise: tr('Prise'),
});

/** Les mots qui trahissent un appareil, dans les deux langues où les gens
 *  nomment leurs prises. L'ORDRE compte : « sèche-linge » avant « linge », et
 *  « lave-vaisselle » avant « lave ». */
const MOTS_PRISE = [
  ['lv', ['lave vaisselle', 'lavevaisselle', 'dishwasher', 'vaisselle', 'lv']],
  ['sl', ['seche linge', 'sechelinge', 'dryer', 'tumble', 'sl']],
  ['ll', ['lave linge', 'lavelinge', 'machine a laver', 'washer', 'washing', 'lessive', 'll']],
  ['fer', ['fer a repasser', 'fer', 'repassage', 'centrale vapeur', 'iron']],
  ['frigo', ['frigo', 'refrigerateur', 'fridge', 'refrigerator', 'congelateur', 'freezer']],
  ['cafe', ['cafetiere', 'machine a cafe', 'coffee', 'expresso', 'espresso', 'percolateur']],
  ['ve', ['borne', 'recharge', 'wallbox', 'chargeur voiture', 'voiture electrique', 'ev charger']],
  ['nas', ['nas', 'synology', 'serveur', 'server', 'homelab', 'unraid']],
  ['pc', ['pc', 'ordinateur', 'computer', 'imac', 'macbook', 'desktop', 'tour', 'workstation']],
  ['tv', ['tv', 'tele', 'television', 'televiseur', 'oled', 'videoprojecteur', 'projecteur']],
  ['box', ['box', 'routeur', 'router', 'fibre', 'livebox', 'freebox', 'bbox', 'modem']],
  ['radia', ['radiateur', 'convecteur', 'chauffage', 'seche serviette', 'heater', 'radiator']],
  ['siren', ['sirene', 'siren', 'alarme sonore']],
];

/** Sans accents, sans casse : « Prise Réfrigérateur » et « prise refrigerateur »
 *  doivent se reconnaître pareil. */
const aplati = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * L'appareil derrière une prise, d'après son nom.
 *
 * Rien d'autre n'est disponible côté navigateur : Home Assistant ne publie ni
 * marque ni modèle pour une prise commandée, et sa `device_class` ne connaît
 * que « outlet » et « switch ». Le nom que l'utilisateur a donné est donc la
 * seule source — et c'est une bonne source, parce qu'il l'a écrit pour lui.
 *
 * `impose` court-circuite tout : c'est le type qu'on a choisi à la main.
 * Aucune correspondance : « prise », qui ne prétend rien.
 */
export function typeDePrise(nom, impose = null, indice = '') {
  if (impose && TYPES_PRISE[impose]) return impose;
  /* Le nom AFFICHE, puis l'identifiant : une prise peut s'appeler « Prise 3 »
   * et s'appeler `switch.lave_vaisselle` dessous. Les deux comptent.
   *
   * La recherche se fait mot par mot, entier, depuis le 29/09. Elle se contentait
   * d'un `indexOf`, ce qui allait tant que les mots étaient longs — puis il a
   * fallu écrire ` lv `, ` ll `, ` sl ` avec leurs espaces, à la main, sans en
   * tirer la règle. Seba882 l'a dite à propos du fer : « `iron` est un mot
   * court qui se cache dans d'autres ». `environnement` contient `iron`,
   * `boxe` contient `box`, `television` contient `tele`. On sépare donc sur
   * tout ce qui n'est ni lettre ni chiffre, et l'on compare des mots. */
  const mots = (aplati(nom) + ' ' + aplati(indice)).split(/[^a-z0-9]+/).filter(Boolean);
  const n = ' ' + mots.join(' ') + ' ';
  for (const [type, cles] of MOTS_PRISE) {
    for (const c of cles) if (n.indexOf(' ' + c + ' ') >= 0) return type;
  }
  return 'prise';
}

/**
 * Ce que la prise est en train de faire.
 *
 *   `eteinte` — elle ne donne pas de courant ;
 *   `veille`  — elle en donne, mais l'appareil ne consomme presque rien ;
 *   `marche`  — l'appareil travaille ;
 *   `inconnu` — allumée, sans capteur de puissance : on ne peut pas trancher,
 *               et on ne le prétend pas.
 */
export function modePrise(actif, watts) {
  if (!actif) return 'eteinte';
  if (watts == null || !isFinite(watts)) return 'inconnu';
  return watts >= SEUIL_VEILLE ? 'marche' : 'veille';
}

/** Le mot qui va avec le mode, celui de l'appareil s'il en a un. */
export function motDuMode(type, mode) {
  const t = TYPES_PRISE[type] || TYPES_PRISE.prise;
  if (mode === 'eteinte') return tr('Éteinte');
  if (mode === 'inconnu') return tr('Allumée');
  if (mode === 'veille') {
    if (t.veille === 'repos') return tr('Au repos');
    if (t.veille === 'branchee') return tr('Branchée');
    return tr('En veille');
  }
  if (t.marche === 'compresseur') return tr('Compresseur');
  if (t.marche === 'chauffe') return tr('Chauffe');
  if (t.marche === 'charge') return tr('Charge');
  return tr('En marche');
}

/**
 * L'étiquette au-dessus du nom — quand elle apprend quelque chose.
 *
 * « Radiateur » écrit au-dessus de « Radiateur chambre » ne dit rien deux fois
 * pour rien : il prend une ligne et double le mot. L'étiquette ne paraît donc
 * que si le nom ne porte pas déjà celui de l'appareil, et jamais pour une prise
 * ordinaire — « PRISE » au-dessus d'une prise n'apprend rien non plus.
 */
export function libelleType(type, nom, noms) {
  if (!type || type === 'prise') return null;
  const lib = (noms || {})[type];
  if (!lib) return null;
  return aplati(nom).indexOf(aplati(lib)) >= 0 ? null : lib;
}

/** L'animation de la plaque, seulement quand l'appareil travaille vraiment. */
export function animationPrise(type, mode) {
  const t = TYPES_PRISE[type] || TYPES_PRISE.prise;
  return (mode === 'marche' && t.fx) ? t.fx : null;
}

/** La teinte d'un mode : la couleur de l'appareil en marche, un gris sinon.
 *  Une prise en veille garde un texte lisible, sans prendre la couleur vive —
 *  sinon veille et marche se ressembleraient de loin. */
export function couleurPrise(type, mode) {
  const t = TYPES_PRISE[type] || TYPES_PRISE.prise;
  if (mode === 'marche') return t.col;
  if (mode === 'veille' || mode === 'inconnu') return 'var(--o-text1)';
  return 'var(--o-text3)';
}
