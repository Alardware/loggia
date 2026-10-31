/* ── Ce que la fiche d'une lumière calcule (chantier Lumières, § 3.5 à 3.8 ; L9) ──
 *
 * Chargé avec la fiche (`fichelumiere.jsx`), jamais au démarrage : les blancs et
 * les couleurs nommés, le réglage du moment, les bornes du blanc et les pistes des
 * deux curseurs, l'encre d'un blanc nommé, la ligne du type, les phrases du
 * panneau du haut et du minuteur. Pur : ni DOM, ni React, ni lecture de l'état —
 * la fiche lui passe ce qu'elle a lu. La teinte, la phrase d'état et la
 * luminosité de la carte vivent dans lumieres.js : la fiche les reprend, elle ne
 * les récrit pas.
 */
import { tr, locale } from './i18n.js';
import { nombre } from './format.js';
import { insecable, dureePrise, decompte } from './prises.js';
import { ajuster, versHex, SEUILS } from './contraste.js';
import { MODES_COULEUR, rgbDuBlanc, rgbDeLaTeinte, quandLumiere, kelvinDe, estBlanche, capacitesLumiere } from './lumieres.js';

/* ── Les blancs et les couleurs nommés (L9) ────────────────────────────────── */

/** Les quatre blancs : la température, le mot de la puce (« Douce ») et celui de la phrase (« blanc doux »). Une fonction : dits dans la langue du moment. */
export const BLANCS_NOMMES = () => [[2200, tr('Chaude'), tr('blanc chaud')], [2700, tr('Douce'), tr('blanc doux')], [4000, tr('Neutre'), tr('blanc neutre')], [6500, tr('Froide'), tr('blanc froid')]];
/** Les six couleurs : la teinte et son nom (« Violet » ; la phrase le dit en minuscules). */
export const COULEURS_NOMMEES = () => [[0, tr('Rouge')], [30, tr('Orange')], [55, tr('Jaune')], [130, tr('Vert')], [215, tr('Bleu')], [275, tr('Violet')]];

/** L'écart de deux teintes, le tour du cercle compris. */
export const ecartTeintes = (a, b) => { const d = Math.abs((Number(a) || 0) - (Number(b) || 0)) % 360; return Math.min(d, 360 - d); };

/** Le blanc nommé le plus proche de `k` : `[kelvins, puce, phrase]`. */
export const blancProche = (k) => BLANCS_NOMMES().reduce((m, w) => (Math.abs(w[0] - k) < Math.abs(m[0] - k) ? w : m));
/** La couleur nommée la plus proche de la teinte `h` : `[teinte, nom]`. */
export const couleurProche = (h) => COULEURS_NOMMEES().reduce((m, c) => (ecartTeintes(c[0], h) < ecartTeintes(m[0], h) ? c : m));

/**
 * Le réglage du moment d'une lampe allumée, ou null : `{ mode, kelvin, teinte,
 * blanc, etiquette, phrase }` — `etiquette` à droite du titre « Couleur » de la
 * fiche (« Douce · 2 700 K », « Violet »), `phrase` après sa phrase d'état
 * (« blanc doux », « violet »). Le nombre et son unité ne se séparent pas.
 * `blanc` (audit du 19/10, B1, B6) : en mode couleur sous `SEUIL_BLANC` de
 * saturation — un pastel réglé ailleurs —, ou dans le mode `white` d'un ruban,
 * la lampe est « Blanc » : aucune couleur nommée ne la dit, aucune puce ne se
 * cercle ; la palette des couleurs reste la sienne (`mode`). Un blanc en mireds
 * d'un ancien Home Assistant se lit aussi (`kelvinDe`, B7).
 */
export function reglageLumiere(a) {
  const x = a || {};
  const k = x.color_mode === 'color_temp' ? kelvinDe(x) : null;
  if (k) {
    const [, puce, phrase] = blancProche(k);
    return { mode: 'blancs', kelvin: k, teinte: null, blanc: false, etiquette: puce + ' · ' + insecable(nombre(k, 0) + ' K'), phrase };
  }
  const blanc = () => ({ mode: 'couleurs', kelvin: null, teinte: null, blanc: true, etiquette: tr('Blanc'), phrase: tr('Blanc').toLocaleLowerCase(locale()) });
  if (x.color_mode === 'white') return blanc();
  if (MODES_COULEUR.includes(x.color_mode) && Array.isArray(x.hs_color)) {
    const h = Number(x.hs_color[0]) || 0;
    if (estBlanche(x.hs_color)) return { ...blanc(), teinte: h };
    const nom = couleurProche(h)[1];
    return { mode: 'couleurs', kelvin: null, teinte: h, blanc: false, etiquette: nom, phrase: nom.toLocaleLowerCase(locale()) };
  }
  return null;
}

/* ── Les bornes du blanc, les curseurs ─────────────────────────────────────── */

/**
 * Les bornes du blanc d'une ampoule (`min_` et `max_color_temp_kelvin` ; à défaut, `max_` et `min_mireds` d'un ancien Home
 * Assistant — min_kelvin = 1 000 000 / max_mireds, B7) ; sans elles, celles de sa maquette, 2 200 à 6 500 K — une `rgbww` sans
 * `color_temp` en a besoin (B6).
 */
export function bornesBlanc(a) {
  const x = a || {};
  const k = (kelvin, mireds) => (Number(kelvin) > 0 ? Math.round(Number(kelvin)) : Number(mireds) > 0 ? Math.round(1000000 / Number(mireds)) : 0);
  const bas = k(x.min_color_temp_kelvin, x.max_mireds), haut = k(x.max_color_temp_kelvin, x.min_mireds);
  const min = bas > 0 ? bas : 2200;
  const max = haut > min ? haut : Math.max(min + 100, 6500);
  return { min, max };
}

/**
 * Le niveau à envoyer avec `white` pour revenir au blanc du mode `white` (B6) : la luminosité de la lampe allumée
 * (`brightness`, 0 à 255), sinon le dernier niveau que le carnet garde (`dernier`, 1 à 100), sinon plein — jamais 0, qui
 * ÉTEINDRAIT la lampe.
 */
export function niveauBlanc(a, dernier = null) {
  const b = a && Number(a.brightness);
  if (b > 0) return Math.max(1, Math.min(255, Math.round(b)));
  const d = Number(dernier);
  return d > 0 ? Math.max(1, Math.min(255, Math.round(d * 255 / 100))) : 255;
}

/* ── Les effets (audit du 19/10, B4) ───────────────────────────────────────── */

/* Les noms sous lesquels une intégration range « aucun effet » dans son `effect_list` : Hue et Zigbee2MQTT disent `off` (la
 * constante `EFFECT_OFF` de Home Assistant), d'autres `none` ou `None`, Shelly `stop_effect`. Comparés sans la casse — dans la
 * liste comme dans l'effet courant (`effect: 'Off'`, retouches du 19/10, R3). */
const SANS_EFFET = ['off', 'none', 'stop_effect'];
/* Ce que Zigbee2MQTT et Hue glissent dans `effect_list` et qui n'est PAS un effet : la commande qui en arrête un. Ni listées, ni
 * « aucun » (elles ne disent pas l'état), ni jamais « en cours » (R3). */
const COMMANDES_EFFET = ['finish_effect', 'stop_hue_effect'];
const estSansEffet = (e) => SANS_EFFET.includes(e.toLowerCase());
const estCommande = (e) => COMMANDES_EFFET.includes(e.toLowerCase());

/**
 * Les effets d'une lampe, ou null si elle n'en publie aucun : `{ aucun, effets, courant }` — `aucun`, le nom que la liste donne
 * à « aucun effet » (null si elle n'en a pas : on ne l'offre pas) ; `effets`, les autres, tels que Home Assistant les donne —
 * des noms venus de l'intégration, jamais traduits ; `courant`, l'effet en cours (`attributes.effect`), null s'il vaut « aucun »
 * (sans la casse) ou une commande d'arrêt. Une liste qui ne porte que des commandes vaut aucune liste.
 */
export function effetsLumiere(a) {
  const x = a || {};
  const liste = Array.isArray(x.effect_list) ? x.effect_list.filter(e => typeof e === 'string' && e && !estCommande(e)) : [];
  if (!liste.length) return null;
  const aucun = liste.find(estSansEffet) || null;
  const courant = typeof x.effect === 'string' && x.effect && !estSansEffet(x.effect) && !estCommande(x.effect) ? x.effect : null;
  return { aucun, effets: liste.filter(e => e !== aucun), courant };
}

/** Un blanc nommé borné à ceux de l'ampoule (L9) : ce qui part vraiment. */
export const blancBorne = (k, b) => Math.max(b.min, Math.min(b.max, k));

/** La piste du curseur du blanc : la couleur de chaque température, de la borne basse à la borne haute (cinq arrêts). */
export function degradeBlanc(b) {
  const arrets = [0, 0.25, 0.5, 0.75, 1].map(f => 'rgb(' + rgbDuBlanc(b.min + (b.max - b.min) * f).join(',') + ')');
  return 'linear-gradient(90deg,' + arrets.join(',') + ')';
}

/** La piste du curseur de teinte : l'arc-en-ciel de sa maquette, de 0 à 360°. */
export function degradeTeinte() {
  return 'linear-gradient(90deg,' + [0, 60, 120, 180, 240, 300, 360].map(h => 'rgb(' + rgbDeLaTeinte(h).join(',') + ')').join(',') + ')';
}

/* ── La ligne du type, sous le nom de la fiche (§ 3.5) ─────────────────────── */

/** « couleur », « blanc réglable », « variateur » ou « tout ou rien ». */
export function typeLumiere(c) {
  if (c && c.couleurs) return tr('couleur');
  if (c && c.blancs) return tr('blanc réglable');
  return c && c.variable ? tr('variateur') : tr('tout ou rien');
}

/** L'encre des blancs nommés (§ 3.7) : le brun de sa maquette, calculé — le plus chaud des blancs, assombri jusqu'à se lire sur les quatre. */
export const encreBlancs = () => versHex(ajuster(rgbDuBlanc(2200), BLANCS_NOMMES().map(([k]) => rgbDuBlanc(k)), SEUILS.wcag, -1));

/* ── Les phrases du panneau du haut et du minuteur (§ 3.6, § 3.8) ──────────── */

/**
 * Sous le grand chiffre : allumée, la phrase de la carte et le nom de sa couleur
 * (« Allumée depuis 20:10 · blanc doux ») ; éteinte, depuis quand et le niveau
 * que le carnet garde (« Depuis 07:50 · se rallumera à 80 % » ; sans lui,
 * « Depuis 07:50 ») ; muette, la phrase de la carte (« Indisponible depuis
 * 14:20 »). `depuis` : l'heure de l'état montré, celle du geste pendant une avance.
 * `effet` (B4) : l'effet en cours, nommé après la couleur — « · effet Bougie » —, tel que Home Assistant le donne.
 */
export function phraseFiche({ phrase, on, muette, depuis = null, dernier = null, reglage = null, effet = null, maintenant = Date.now() }) {
  if (muette) return phrase;
  if (on) return [phrase, reglage ? reglage.phrase : null, effet ? tr('effet {nom}', { nom: effet }) : null].filter(Boolean).join(' · ');
  const q = quandLumiere(depuis, maintenant);
  return [q ? tr('Depuis {h}', { h: q }) : phrase, dernier ? tr('se rallumera à {p}', { p: insecable(dernier + ' %') }) : null].filter(Boolean).join(' · ');
}

/** Le minuteur qui tourne : « S'éteint à 21:10 · dans 14 min 32 s » — le temps qu'il reste se décompte à la seconde (20/10),
 * la durée et ses unités ne se séparent pas. */
export function phraseMinuteur(fin, maintenant = Date.now()) {
  const h = new Date(fin).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  return tr('S’éteint à {h}', { h }) + ' · ' + tr('dans {d}', { d: insecable(decompte(fin, maintenant)) });
}

/* ── Aujourd'hui : la durée allumée, le fondu de la veilleuse (§ 3.9, § 8) ──── */

/**
 * Combien de minutes la lampe a été allumée depuis minuit, d'après le carnet :
 * depuis l'état d'avant minuit — la note d'avant la fenêtre le donne (le contrat
 * du plan 1) —, une panne comptant éteinte, et la dernière allumée courant jusqu'à
 * `maintenant` — une horloge du serveur un peu en avance n'en fait pas un avenir.
 * Un réglage ne change pas l'état, mais il le DIT — « allumée » : on le garde (la note
 * d'avant minuit, que le carnet conserve, en est souvent un). Allumée, ne serait-ce
 * qu'un instant : une minute au moins.
 * Sans note d'avant minuit — le premier jour du carnet : le serveur ne note pas le
 * premier état qu'il voit, le logbook non plus —, la lampe d'avant la première note
 * était dans l'état CONTRAIRE : éteinte à 23:00, elle était allumée ; allumée, elle
 * était éteinte ; réglée, elle l'était déjà. Une panne ne dit pas ce qui la précédait :
 * éteinte, comme toujours. Sans aucune note — ou une lampe que le carnet n'a jamais
 * vue changer —, l'état que l'écran montre (`etat` : `{ on, depuis }`) : allumée
 * depuis `depuis`, ou depuis minuit si c'était avant.
 */
export function minutesAllumee(evenements, minuit, maintenant, etat = null) {
  const notes = (Array.isArray(evenements) ? evenements : []).filter(e => e && typeof e.when === 'number').sort((a, b) => a.when - b.when);
  const evts = !notes.length && etat ? [{ when: (Date.parse(etat.depuis) || minuit) / 1000, state: etat.on ? 'on' : 'off' }] : notes;
  const premiere = notes[0];
  const sansNoteAvant = !!premiere && premiere.when * 1000 > minuit;
  let on = sansNoteAvant && (premiere.state === 'off' || (premiere.state === 'on' && premiere.reglage === true));
  let depuis = minuit, total = 0;
  for (const e of evts) {
    const t = Math.min(e.when * 1000, maintenant);
    const allume = e.state === 'on';
    if (t <= minuit) { on = allume; continue; }
    if (on && !allume) total += t - depuis;
    if (!on && allume) depuis = t;
    on = allume;
  }
  if (on) total += maintenant - Math.max(depuis, minuit);
  // Jamais « Pas allumée aujourd'hui » sous une lampe allumée.
  return on || total > 0 ? Math.max(1, Math.round(total / 60000)) : 0;
}

/** À droite du titre « Aujourd'hui » : « Allumée 2 h 35 », ou « Pas allumée aujourd'hui » — la durée et son unité ne se séparent pas. */
export function texteDuree(minutes) {
  return minutes > 0 ? tr('Allumée {d}', { d: insecable(dureePrise(minutes)) }) : tr('Pas allumée aujourd’hui');
}

/** Le fondu de la veilleuse de la règle Nuit, en minutes (`loggia/nuit/etat`) ; 0 tant qu'on ne le sait pas. */
export function fonduDe(etat) {
  const v = etat && etat.config && etat.config.veilleuse;
  const n = v ? Number(v.fondu) : 0;
  return n > 0 ? n : 0;
}

/* ── La bibliothèque des ambiances, sans script (ADR 0304) ─────────────────────
 *
 * Chargé avec les Scènes (scenes.jsx, à la demande), jamais au démarrage. Une ambiance de `HUE_SCENES` — cinq couleurs et
 * une luminosité — devient un ordre par lampe, que scenes.jsx envoie par `commander` : la capacité déclarée par la lampe, ses
 * bornes, et le carnet des lumières qui note le geste sous le compte de la personne. */

/* Le bit TRANSITION de `supported_features` : la lampe sait fondre, elle reçoit `transition` (le même bit que `nuit.py`). */
const BIT_TRANSITION = 32;
/** La lampe sait-elle fondre ? */
export const saitFondre = (a) => ((Number((a || {}).supported_features) || 0) & BIT_TRANSITION) !== 0;
/** Le fondu d'une ambiance, en secondes : court — on voit la pièce changer, on n'attend pas. */
const FONDU_AMBIANCE = 1;

/** `[teinte 0–360, saturation 0–100]` d'un `[r, v, b]`, au dixième — le `color_RGB_to_hs` de Home Assistant (HSV). */
export function hsDeRgb(rgb) {
  const [r, g, b] = (rgb || []).map(x => Math.max(0, Math.min(255, Number(x) || 0)) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const dixieme = (x) => Math.round(x * 10) / 10;
  return [dixieme(((h * 60) + 360) % 360), dixieme(max > 0 ? d / max * 100 : 0)];
}

/** `[x, y]` d'un `[r, v, b]`, au millième — le `color_RGB_to_xy` de Home Assistant (gamma sRGB, matrice « Wide RGB D65 »). */
export function xyDeRgb(rgb) {
  const [r, g, b] = (rgb || []).map(x => Math.max(0, Math.min(255, Number(x) || 0)) / 255)
    .map(c => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92));
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;
  const somme = X + Y + Z;
  return somme > 0 ? [Math.round(X / somme * 1000) / 1000, Math.round(Y / somme * 1000) / 1000] : [0, 0];
}

/**
 * Le blanc le plus proche d'une couleur, en kelvins, dans les bornes `{ min, max }` d'une ampoule (`bornesBlanc`) : celui dont
 * la couleur (`rgbDuBlanc`, la table de la carte) ressemble le plus à la sienne, ramenées toutes deux à la même intensité. Un
 * orange donne le plus chaud de la lampe, un blanc bleuté le plus froid ; par pas de 50 K.
 */
export function blancDeRgb(rgb, b = { min: 2200, max: 6500 }) {
  const norme = (c) => { const m = Math.max(1, ...c); return c.map(x => x / m); };
  const cible = norme((rgb || [255, 255, 255]).map(x => Math.max(0, Number(x) || 0)));
  let meilleur = b.min, ecart = Infinity;
  for (let k = b.min; k <= b.max + 49; k += 50) {
    const kk = Math.min(k, b.max);
    const e = norme(rgbDuBlanc(kk)).reduce((s, x, i) => s + (x - cible[i]) * (x - cible[i]), 0);
    if (e < ecart - 1e-9) { meilleur = kk; ecart = e; }
  }
  return Math.round(meilleur);
}

/** Ce qu'une lampe fait d'une ambiance : `couleur`, `blanc` (réglable), `variateur`, ou null — elle ne fait que s'allumer. */
export function genreAmbiance(id, a) {
  const c = capacitesLumiere(id, a);
  return c.couleurs ? 'couleur' : c.blancs ? 'blanc' : c.variable ? 'variateur' : null;
}

/** La luminosité d'une ambiance, de 1 à 100 : « Nightlight » vaut 0 dans la bibliothèque, et une luminosité nulle ÉTEINT une
 * lampe chez Home Assistant (`light.turn_on` avec `brightness_pct: 0`) — 1 %, la veilleuse, jamais le noir. */
export const luminositeAmbiance = (scene) => Math.max(1, Math.min(100, Math.round(Number(scene && scene.brightness) || 0)));

/* Laquelle des `m` couleurs pour la `i`-ième de `n` lampes couleur : jusqu'à `m` lampes, réparties sur toute l'ambiance (deux
 * lampes : la première et la troisième) ; au-delà, on recommence. */
const rangCouleur = (i, n, m) => (n <= m ? Math.floor(i * m / n) : i % m);

/**
 * Les ordres d'une ambiance (`scene` : `{ colors, brightness }`) pour `lampes` (`[{ id, a }]`, `a` ses attributs) :
 * `[{ id, capacite, valeur, options }]`, pour `commander(hass, id, capacite, valeur, null, options)`. Dans l'ordre des noms :
 *  - une lampe COULEUR prend une des cinq couleurs, réparties sur les lampes couleur — en `xy` si elle parle `xy`, sinon en `hs` ;
 *  - une lampe à BLANC réglable prend le blanc le plus proche de la moyenne de l'ambiance, dans ses bornes ;
 *  - un VARIATEUR prend la luminosité seule ; une lampe qui ne fait que s'allumer, rien ;
 *  - une ambiance de luminosité nulle (« Nightlight ») : 1 % au blanc le plus chaud que la lampe sait faire — une lampe
 *    couleur sans blanc prend la couleur de ce blanc ;
 *  - `brightness_pct` : `bri` (le curseur des Scènes), sinon celle de l'ambiance, de 1 à 100 ; `transition` d'une seconde à
 *    la lampe qui sait fondre.
 */
export function ordresAmbiance(scene, lampes, { bri = null } = {}) {
  const couleurs = (scene && Array.isArray(scene.colors) ? scene.colors : []).filter(c => Array.isArray(c) && c.length === 3);
  const nuit = !(Number(scene && scene.brightness) > 0);
  const pct = bri != null && Number(bri) > 0 ? Math.max(1, Math.min(100, Math.round(Number(bri)))) : luminositeAmbiance(scene);
  const moyenne = couleurs.length ? [0, 1, 2].map(i => couleurs.reduce((s, c) => s + (Number(c[i]) || 0), 0) / couleurs.length) : null;
  const triees = (lampes || []).filter(l => l && typeof l.id === 'string').sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const enCouleur = triees.filter(l => genreAmbiance(l.id, l.a) === 'couleur');
  const out = [];
  for (const l of triees) {
    const a = l.a || {};
    const genre = genreAmbiance(l.id, a);
    if (!genre) continue;
    const fondu = saitFondre(a) ? { transition: FONDU_AMBIANCE } : {};
    if (genre === 'variateur' || (!moyenne && !nuit)) { out.push({ id: l.id, capacite: 'set_brightness', valeur: pct, options: fondu }); continue; }
    const options = { brightness_pct: pct, ...fondu };
    const b = bornesBlanc(a);
    if (genre === 'blanc' || (nuit && capacitesLumiere(l.id, a).blancs)) {
      out.push({ id: l.id, capacite: 'set_color_temp', valeur: nuit ? b.min : blancDeRgb(moyenne, b), options });
      continue;
    }
    const rgb = nuit ? rgbDuBlanc(b.min) : couleurs[rangCouleur(enCouleur.indexOf(l), enCouleur.length, couleurs.length)];
    const xy = Array.isArray(a.supported_color_modes) && a.supported_color_modes.includes('xy');
    out.push({ id: l.id, capacite: xy ? 'set_xy' : 'set_hs', valeur: xy ? xyDeRgb(rgb) : hsDeRgb(rgb), options });
  }
  return out;
}
