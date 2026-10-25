/* ── Ce qu'est une lumière, et ce que ses cartes en disent ──────────────────
 *
 * Chantier Lumières (docs/chantier-lumieres.md, § 4, § 5 ; L5, L6, L11).
 * Pur : ni DOM, ni React, ni lecture de l'état — l'appelant passe ce qu'il a
 * lu. Au démarrage avec la carte et la compacte ; l'en-tête d'Objets ›
 * Lumières et la fiche, chargés à la demande, s'en servent aussi. Ce qui ne
 * sert qu'à la fiche — les blancs et les couleurs nommés, les curseurs, le
 * type écrit — vit dans lumieresfiche.js, chargé avec elle : le démarrage n'a
 * pas de place à lui donner (tests/lot14_chargement.test.mjs).
 *
 *  - ce qu'elle SAIT FAIRE (`capacitesLumiere`) : varier — au sens de
 *    `planAction`, B8 —, des blancs, des couleurs, le blanc du mode `white` ;
 *    la saturation sous laquelle une couleur est un blanc (B1) ; les kelvins
 *    d'un ancien `color_temp` en mireds (B7) ;
 *  - CE QU'EST une lumière de la maison (L11, ADR 0261) : un `light.*` sans
 *    catégorie — la LED d'une borne Wi-Fi (`config`) n'en est pas une —, ni
 *    caché ni désactivé dans le registre, ou un switch déclaré lumière ; un
 *    groupe dont les membres sont déjà là ne compte pas deux fois.
 *    `lumieresDe` en tire la liste : la découverte, les compteurs, la vue Nuit,
 *    les Scènes lisent tous la même ;
 *  - ce qu'on ÉPARGNE partout (L2) : les veilleuses de la règle Nuit et les
 *    groupes qui en contiennent une — « Tout éteindre », la tuile d'une pièce,
 *    le repli des Scènes ne les touchent pas ;
 *  - la TEINTE de la vraie lumière (L6, § 5) : un blanc par la table de sa
 *    maquette, une couleur par son `rgb_color`, sinon l'or de la maison ;
 *  - son ENCRE (la glyphe de la plaque, le repère de la barre) : cette teinte
 *    rendue lisible sur le fond vrai de la carte, et le dégradé de la barre ;
 *  - la PHRASE d'état (§ 4) : « Allumée depuis 18:05 », « S'éteint à 21:10 »,
 *    « Éteinte », « Indisponible depuis 14:20 ».
 */
import { tr, locale } from './i18n.js';
import { quandPrise } from './prises.js';
import { lisibleSurLavis, lireCouleur } from './contraste.js';

/* ── Ce qu'est une lumière (L11) ────────────────────────────────────────────── */

/** Une lumière de la maison : un `light.*` SANS catégorie, ou un switch que la maison déclare lumière. */
export function estLumiere(id, { categorie = null, switchsLumiere = [] } = {}) {
  const s = String(id || '');
  if (s.indexOf('light.') === 0) return !categorie;
  return s.indexOf('switch.') === 0 && Array.isArray(switchsLumiere) && switchsLumiere.includes(s);
}

/** Les membres d'un groupe de lumières : Home Assistant en fait un `light.*` dont `attributes.entity_id` les liste. Une lampe seule : rien. */
export function membresDuGroupe(st) {
  const m = st && st.attributes && st.attributes.entity_id;
  return Array.isArray(m) ? m.filter(x => typeof x === 'string') : [];
}

/**
 * Les groupes dédoublonnés : un groupe dont UN membre est déjà dans `ids` s'efface — ses membres ont chacun leur carte, et
 * « 3 allumées » ne compterait pas le groupe en plus. Un groupe dont aucun membre n'est là reste : il est la seule carte de
 * ces lampes. De proche en proche, pour un groupe de groupes : le dessus s'efface dès que le dessous est là.
 */
export function sansGroupesDoubles(ids, S) {
  const presents = new Set(ids);
  return ids.filter(id => !membresDuGroupe((S || {})[id]).some(m => presents.has(m)));
}

/**
 * Les lumières de la maison parmi `ids` — par défaut, tout ce que le relevé `S`
 * connaît —, au sens d'Objets › Lumières (`discoverLights`, L11) : les compteurs
 * « n allumées » (l'Accueil, l'écran de veille, l'aperçu des Paramètres), la vue
 * Nuit et les Scènes disent ainsi la même liste que la vue, et la LED d'une
 * borne Wi-Fi n'y entre pas. Ni ce que le registre cache ou désactive (une
 * entité désactivée n'est plus dans le relevé ; une cachée y est encore). Les
 * groupes sont dédoublonnés (`sansGroupesDoubles`).
 * `meta` : `index.entityMeta`, une Map id → `{ category, hidden, disabled }` —
 * null avant que l'index soit lu : tout `light.*` compte alors ;
 * `switchsLumiere` : les switch que la maison déclare lumière.
 */
export function lumieresDe(S, { meta = null, switchsLumiere = [], ids = null } = {}) {
  const lire = meta && typeof meta.get === 'function' ? (id) => meta.get(id) : () => null;
  const releve = S || {};
  const base = (ids || Object.keys(releve)).filter((id) => {
    if (ids && !releve[id]) return false;
    const m = lire(id) || {};
    if (m.hidden || m.disabled) return false;
    return estLumiere(id, { categorie: m.category || null, switchsLumiere });
  });
  return sansGroupesDoubles(base, releve);
}

/* ── Ce qu'on épargne (L2) ─────────────────────────────────────────────────── */

/** Les veilleuses de la règle Nuit, lues dans la réponse de `loggia/nuit/etat` ; null tant qu'elle n'est pas lue. */
export function veilleusesDe(etat) {
  if (!etat || typeof etat !== 'object') return null;
  const v = etat.config && etat.config.veilleuse;
  return (v && Array.isArray(v.lampes) ? v.lampes : []).filter(x => typeof x === 'string');
}

/**
 * Les veilleuses à épargner d'après la lecture de `loggia/nuit/etat` : sa réponse, lue ; `[]` si le module Nuit est ABSENT
 * (`codeErr` vaut `not_available` : aucune veilleuse ne peut exister) ; null sur toute autre erreur, ou tant qu'elle n'est
 * pas lue — on ne sait pas quelles lampes épargner. `codeErr` : celui d'`useEtatServeur` (ui.jsx).
 */
export function veilleusesLues(etat, codeErr) {
  const v = veilleusesDe(etat);
  if (v) return v;
  return codeErr === 'not_available' ? [] : null;
}

/* Un groupe qui contient une veilleuse : son `light.turn_off` l'éteindrait avec les autres, contre L2. Un groupe de groupes
 * compte aussi ; `chemin` garde les groupes déjà parcourus, une configuration en boucle ne fige rien. */
function contientVeilleuse(id, S, veilleuses, chemin = [id]) {
  return membresDuGroupe(S[id]).some(m => veilleuses.indexOf(m) >= 0 || (chemin.indexOf(m) < 0 && contientVeilleuse(m, S, veilleuses, chemin.concat(m))));
}

/**
 * Épargnée : une veilleuse de la règle Nuit, ou un groupe qui en contient une (L2). `veilleuses` null — la règle n'est pas
 * encore lue — ou vide — le module Nuit absent, aucune veilleuse ne peut exister — : rien n'est épargné ICI ; c'est à
 * l'appelant d'attendre s'il le doit (« Tout éteindre » attend, une tuile de pièce n'attend pas).
 */
export function estEpargnee(id, S, veilleuses) {
  if (!Array.isArray(veilleuses) || !veilleuses.length) return false;
  return veilleuses.indexOf(id) >= 0 || contientVeilleuse(id, S || {}, veilleuses);
}

/** `ids` sans ce qu'on épargne (`estEpargnee`). */
export function sansEpargnees(ids, S, veilleuses) {
  return (ids || []).filter(id => !estEpargnee(id, S, veilleuses));
}

/** Les modes où une lampe est en couleur (la fiche les lit aussi, lumieresfiche.js). */
export const MODES_COULEUR = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
/* Les modes où une lampe VARIE : ceux auxquels `planAction` (capabilities.js, `MODES_COULEUR`) accorde `set_brightness`. Un
 * `brightness` publié sans l'un d'eux ne suffit pas : l'ordre serait refusé, la barre mentirait (audit du 19/10, B8). */
const MODES_VARIABLES = ['brightness', 'color_temp', 'white'].concat(MODES_COULEUR);

/**
 * Ce que la lampe sait faire (`supported_color_modes`) : varier, des blancs, des couleurs, et revenir au blanc du mode
 * `white` (`blanc` : un ruban `hs + white`, sans température ; audit du 19/10, B6). Une `rgbww` a des blancs même sans
 * `color_temp` : Home Assistant convertit `color_temp_kelvin` pour elle. Un switch-lumière ne fait rien de tout cela.
 */
export function capacitesLumiere(id, a) {
  const x = a || {};
  const modes = Array.isArray(x.supported_color_modes) ? x.supported_color_modes : [];
  if (String(id || '').indexOf('light.') !== 0) return { variable: false, blancs: false, couleurs: false, blanc: false };
  const couleurs = modes.some(m => MODES_COULEUR.includes(m));
  const blancs = modes.includes('color_temp') || modes.includes('rgbww');
  return { variable: modes.some(m => MODES_VARIABLES.includes(m)), blancs, couleurs, blanc: modes.includes('white') };
}

/**
 * La température d'un blanc, en kelvins : `color_temp_kelvin`, sinon l'ancien `color_temp` en mireds (K = 1 000 000 / mireds,
 * les Home Assistant d'avant 2022.11 ; audit du 19/10, B7) ; null sans l'un ni l'autre.
 */
export function kelvinDe(a) {
  const x = a || {};
  if (Number(x.color_temp_kelvin) > 0) return Math.round(Number(x.color_temp_kelvin));
  return Number(x.color_temp) > 0 ? Math.round(1000000 / Number(x.color_temp)) : null;
}

/* Sous ce seuil de saturation (`hs_color[1]`, de 0 à 100), une lampe en mode couleur est BLANCHE : un pastel réglé depuis
 * l'application Home Assistant (`[30, 12]`) n'est pas « orange », et aucune puce ne se cercle (audit du 19/10, A6 / B1).
 * 20 % : en HSV à pleine valeur, c'est `[255, 204, 204]` pour un rouge — un blanc à peine teinté ; au-dessus, la teinte se voit. */
export const SEUIL_BLANC = 20;
/** Un `hs_color` dont la saturation est sous le seuil ; sans saturation lue, une couleur. */
export const estBlanche = (hs) => Array.isArray(hs) && hs.length === 2 && isFinite(Number(hs[1])) && Number(hs[1]) < SEUIL_BLANC;

/* ── La teinte de la vraie lumière (L6, § 5) ───────────────────────────────── */

/* La couleur d'un blanc selon sa température : les points de sa maquette
 * (`KT`), interpolés entre eux ; au-dessous de 2 200 K et au-dessus de
 * 6 500 K, la valeur du bord. */
const KELVINS = [[2200, [255, 147, 44]], [2700, [255, 169, 87]], [3000, [255, 180, 107]], [4000, [255, 209, 163]], [5000, [255, 228, 206]], [6500, [255, 249, 253]]];

/** `[r, v, b]` d'un blanc de `k` kelvins. */
export function rgbDuBlanc(k) {
  const v = Math.max(KELVINS[0][0], Math.min(KELVINS[KELVINS.length - 1][0], Number(k) || 0));
  for (let i = 1; i < KELVINS.length; i++) {
    if (v <= KELVINS[i][0]) {
      const [k0, a] = KELVINS[i - 1], [k1, b] = KELVINS[i], f = (v - k0) / (k1 - k0);
      return a.map((x, j) => Math.round(x + (b[j] - x) * f));
    }
  }
  return KELVINS[KELVINS.length - 1][1].slice();
}

/** `[r, v, b]` d'une teinte (0 à 360°), telle que sa maquette peint ses couleurs (`hueTri` : saturation 0,8, clarté 0,62). */
export function rgbDeLaTeinte(h) {
  const t = ((Number(h) || 0) % 360 + 360) % 360;
  const s = 0.8, l = 0.62, a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + t / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/**
 * `[r, v, b]` d'un `hs_color` (teinte 0 à 360°, saturation 0 à 100), tel que Home Assistant en tire son `rgb_color` : HSV à
 * pleine valeur. C'est la couleur qu'une lampe éteinte REPRENDRA — un pastel reste un pastel (audit du 19/10, B1) —, là où
 * `rgbDeLaTeinte` peint les puces de la palette à saturation fixe.
 */
export function rgbDeHs(h, s) {
  const t = ((Number(h) || 0) % 360 + 360) % 360;
  const c = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
  const x = c * (1 - Math.abs(((t / 60) % 2) - 1));
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(t / 60) % 6];
  return [r, g, b].map(v => Math.round((v + 1 - c) * 255));
}

/**
 * La teinte d'une lampe : `[r, v, b]`, ou null pour l'or de la maison.
 *  - un blanc (`color_mode: color_temp`) : la table de sa maquette — en kelvins, ou en mireds d'un ancien Home Assistant (B7) ;
 *  - une couleur (`hs`, `xy`, `rgb`, `rgbw`, `rgbww`) : son `rgb_color` ;
 *  - allumée autrement (variateur, tout ou rien, `white`) : l'or.
 * Éteinte, Home Assistant efface ces attributs : `dernier`, ce que le carnet
 * du serveur garde d'elle (`{ mode, kelvin, hs }`, § 6.2), dit la teinte
 * qu'elle reprendra — à sa VRAIE saturation (`rgbDeHs`, B1) ; sans lui, l'or.
 * `kMax` : le blanc le plus froid que l'on rend, en kelvins — l'ENCRE d'une
 * lampe (`encreLumiere`) se tire d'un blanc plafonné ; une couleur n'est pas
 * un blanc, elle ne bouge pas.
 */
export function teinteLumiere(a, dernier = null, kMax = Infinity) {
  const x = a || {};
  const k = x.color_mode === 'color_temp' ? kelvinDe(x) : null;
  if (k) return rgbDuBlanc(Math.min(k, kMax));
  if (MODES_COULEUR.includes(x.color_mode) && Array.isArray(x.rgb_color) && x.rgb_color.length === 3) {
    return x.rgb_color.map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0))));
  }
  if (x.color_mode) return null;
  const d = dernier || {};
  if (d.mode === 'color_temp' && Number(d.kelvin) > 0) return rgbDuBlanc(Math.min(Number(d.kelvin), kMax));
  if (MODES_COULEUR.includes(d.mode) && Array.isArray(d.hs)) return rgbDeHs(d.hs[0], d.hs.length > 1 ? d.hs[1] : 100);
  return null;
}

/**
 * Les couleurs d'une lampe, d'après sa teinte : `rgb`, le triplet de son lavis
 * et de sa plaque (« r,v,b », ou le compagnon de l'or) ; `col`, la couleur
 * pleine ; `degrade`, le remplissage de sa barre — de la teinte éclaircie à la
 * teinte (sa maquette : `color-mix(in oklab, teinte 55%, #fff)`, calculé ici
 * en 55 % de teinte et 45 % de blanc). L'or garde le dégradé de la carte
 * d'avant, ses deux jetons.
 */
export function couleursLumiere(t) {
  if (!t) return { rgb: 'var(--o-lampe-rgb)', col: 'var(--o-lampe)', degrade: 'linear-gradient(90deg,var(--o-lampe),var(--o-lampe-b))' };
  const c = t.join(',');
  const clair = t.map(x => Math.round(x * 0.55 + 255 * 0.45)).join(',');
  return { rgb: c, col: 'rgb(' + c + ')', degrade: 'linear-gradient(90deg,rgb(' + clair + '),rgb(' + c + '))' };
}

/* Le blanc le plus froid dont se tire l'ENCRE. Un blanc froid est légèrement rosé — à 100 % de saturation, en HSL —,
 * et `lisibleSurLavis` assombrit en gardant la teinte ET la saturation : sur un lavis clair, l'encre d'une ampoule
 * « Froide » virait au rouge ou au magenta (#d81400 à 6 200 K, #d2008c à 6 500 K). Le blanc de 4 000 K tire sur
 * l'orange : assombri, il reste un brun. */
const ENCRE_BLANC_MAX = 4000;
/* L'opacité de la plaque d'une lampe allumée : `rgba(teinte, .22)` (la carte, la compacte et la fiche l'écrivent). */
const PLAQUE = 0.22;

/**
 * La teinte qui PEINT la plaque et le lavis d'une carte allumée : la teinte vraie (`teinteLumiere`) — sauf en thème clair, où un blanc
 * prend celui de l'encre, plafonné à 4 000 K (`rgbDuBlanc(Math.min(k, 4000))`). Un blanc froid — à 6 500 K, `[255, 249, 253]` —, posé
 * à .22 sur la carte claire, ne s'y voit pas : lavis à 1,003:1, plaque à 1,006:1, la carte d'une lampe allumée est « toute blanche »
 * (revue du 14/10, R7). Plafonné, c'est un crème orangé qui se voit, comme celui d'un blanc de 4 000 K. Une couleur, l'or de la
 * maison (un jeton, déjà gardé par le thème) et le thème sombre ne bougent pas. `clair` : le thème est clair.
 */
export function teinteDeCarte(a, dernier = null, clair = false) {
  return teinteLumiere(a, dernier, clair ? ENCRE_BLANC_MAX : Infinity);
}

/**
 * L'ENCRE d'une lampe allumée — la glyphe de sa plaque et le repère de sa barre —,
 * et le dégradé de sa barre. `{ encre, degrade }`.
 *  - L'encre est la teinte rendue lisible sur le fond VRAI de la glyphe : la
 *    plaque (0,22) posée sur le lavis de la carte (`lavis`, son opacité EN HAUT —
 *    0,22 à 100 % de luminosité, fois le réglage « Teinte » du thème), l'un sur
 *    l'autre. Elle se tire du blanc plafonné à 4 000 K (`ENCRE_BLANC_MAX`), mais se
 *    lit contre la teinte qui PEINT la carte (`teinteDeCarte`) : la teinte vraie en
 *    thème sombre, le même blanc plafonné en thème clair (R7 : la plaque et le lavis
 *    d'un blanc froid ne se voyaient pas sur la carte claire).
 *  - La barre : en thème sombre, la teinte vraie, claire sur une piste sombre ; en
 *    thème clair, l'encre gardée — la teinte vraie d'un blanc, presque blanche, ne
 *    se voit pas sur la piste (1,2:1).
 *  - L'or de la maison (une lampe qui ne fait que varier, un switch-lumière, une
 *    lampe éteinte) est un jeton, déjà gardé par le thème : il passe tel quel.
 * `clair` : le thème est clair.
 */
export function encreLumiere(a, dernier = null, { clair = false, lavis = 0.22 } = {}) {
  // Le fond de la glyphe est peint de la teinte de la carte (`teinteDeCarte` : en thème clair, un blanc plafonné) : c'est contre lui que l'encre se lit.
  const teinte = teinteDeCarte(a, dernier, clair);
  const c = couleursLumiere(teinte);
  if (!teinte) return { encre: c.col, degrade: c.degrade };
  const encre = lisibleSurLavis('rgb(' + teinteLumiere(a, dernier, ENCRE_BLANC_MAX).join(',') + ')', clair, 1 - (1 - lavis) * (1 - PLAQUE), c.col);
  return { encre, degrade: clair ? couleursLumiere(lireCouleur(encre).slice(0, 3)).degrade : c.degrade };
}

/** Le lavis d'une carte allumée (L6) : de 0,08 + 0,14 × la luminosité en haut (0,22 à 100 %) à 0,03 en bas. `bri` : 1 à 100, ou null (tout ou rien : 100). */
export function lavisLumiere(bri) {
  const b = bri == null ? 100 : Math.max(0, Math.min(100, Number(bri) || 0));
  return { haut: Math.round((0.08 + 0.14 * b / 100) * 1000) / 1000, bas: 0.03 };
}

/* ── La phrase d'état (§ 4) ─────────────────────────────────────────────────── */

const heureDe = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const memeJour = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** « Depuis » : l'heure aujourd'hui, « hier » la veille, la date au-delà (celle des prises). */
export function quandLumiere(t, maintenant = Date.now()) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (!isFinite(ms)) return null;
  if (memeJour(ms, maintenant)) return heureDe(ms);
  const veille = new Date(maintenant);
  veille.setDate(veille.getDate() - 1);
  return memeJour(ms, veille) ? tr('hier') : quandPrise(ms, maintenant);
}

/**
 * La phrase d'état (§ 4), la première qui s'applique :
 *  1. indisponible (`unavailable`, `unknown`, ou absente) : « Indisponible
 *     depuis 14:20 » — `panne` : en rouge, et le liseré qui respire ;
 *  2. un minuteur qui tourne, allumée : « S'éteint à 21:10 » ;
 *  3. allumée : « Allumée depuis 18:05 » (« depuis hier », la date au-delà) ;
 *  4. éteinte : « Éteinte ».
 * `st` : l'état tel que la carte le montre — le geste d'abord (`useOptimiste`)
 * lui donne l'heure du geste ; `fin` : la fin du minuteur en ms, ou null.
 * Rend `{ texte, panne, on }`.
 */
export function phraseLumiere({ st = null, fin = null, maintenant = Date.now() } = {}) {
  const s = st ? st.state : null;
  if (!st || s === 'unavailable' || s === 'unknown') {
    const q = st ? quandLumiere(st.last_changed, maintenant) : null;
    return { texte: q ? tr('Indisponible depuis {h}', { h: q }) : tr('Indisponible'), panne: true, on: false };
  }
  if (s !== 'on') return { texte: tr('Éteinte'), panne: false, on: false };
  if (fin && fin > maintenant) return { texte: tr('S’éteint à {h}', { h: heureDe(fin) }), panne: false, on: true };
  return { texte: tr('Allumée depuis {h}', { h: quandLumiere(st.last_changed, maintenant) || '—' }), panne: false, on: true };
}

/** La luminosité en pourcent (1 à 100), ou null : `brightness` va de 0 à 255. */
export function luminosite(a) {
  const b = a && a.brightness;
  return b == null || !isFinite(Number(b)) ? null : Math.max(1, Math.min(100, Math.round(Number(b) / 255 * 100)));
}
