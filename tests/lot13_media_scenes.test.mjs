// ─────────────────────────────────────────────────────────────────────────────
// La carte lecteur et le curseur des ambiances : plus de contrôle DANS un
// contrôle (lot 13 de l'audit du 03/10, ADR 0074).
//
// Mesuré dans la démo par axe-core : `nested-interactive` sur la carte lecteur
// d'une pièce (un `role="button"` qui enfermait la bascule, le volume et trois
// boutons de lecture — un rôle bouton rend sa descendance présentationnelle,
// ils disparaissaient d'un lecteur d'écran), et une fois sur Scènes, où le
// curseur « Luminosité des scènes » était la rangée qui portait − et +.
//
// Et le nom : la carte s'annonçait « Ouvrir Enceinte salon », sans l'état
// qu'elle affiche (WCAG 2.5.3). Elle s'annonce désormais comme elle se lit,
// « Enceinte salon, En pause », par le bouton de SURFACE (`Surface`, ui.jsx).
//
// RoomMediaCard et ScenesContent ne sont pas exportés : leur source se lit
// comme du texte. Le bouton de surface, lui, se rend.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');

/** Le source d'une fonction de premier niveau d'App.jsx, jusqu'à la suivante. */
function fonction(nom) {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  assert.ok(i >= 0, nom + ' a disparu d’App.jsx');
  return APP.slice(i, APP.indexOf('\nfunction ', i + 1));
}

/** L'indice qui ferme la chaîne ouverte en `k` (', " ou `). */
function finChaine(s, k) {
  const q = s[k];
  for (k++; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === q) return k;
  }
  return k;
}

/** L'indice de l'accolade qui ferme celle ouverte en `i` — chaînes et
 *  commentaires sautés : le « d'état » d'un commentaire n'ouvre pas de chaîne. */
function finAccolade(s, i) {
  let p = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"' || c === "'" || c === '`') k = finChaine(s, k);
    else if (c === '/' && s[k + 1] === '/') k = s.indexOf('\n', k);
    else if (c === '/' && s[k + 1] === '*') k = s.indexOf('*/', k) + 1;
    else if (c === '{') p++;
    else if (c === '}' && --p === 0) return k;
  }
  return s.length;
}

/** La balise ouvrante qui commence en `d` : son nom, son texte, l'indice de
 *  son `>`. Les attributs entre accolades sont sautés d'un bloc. */
function balise(s, d) {
  const nom = /^<([A-Za-z][\w.]*)/.exec(s.slice(d, d + 60))[1];
  for (let k = d + 1 + nom.length; k < s.length; k++) {
    if (s[k] === '{') k = finAccolade(s, k);
    else if (s[k] === '"') k = finChaine(s, k);
    else if (s[k] === '>') return { nom, texte: s.slice(d, k + 1), fin: k, seule: s[k - 1] === '/' };
  }
  throw new Error('balise sans fin');
}

/** Ce que la balise ouverte en `d` contient, jusqu'à SA fermante. */
function contenu(s, d) {
  const b = balise(s, d);
  if (b.seule) return '';
  const re = new RegExp('<(/?)' + b.nom + '(?=[\\s>/])', 'g');
  re.lastIndex = b.fin + 1;
  let prof = 1;
  for (let m; (m = re.exec(s)); ) {
    if (m[1]) { if (--prof === 0) return s.slice(b.fin + 1, m.index); continue; }
    const o = balise(s, m.index);
    if (!o.seule) prof++;
    re.lastIndex = o.fin + 1;
  }
  throw new Error('<' + b.nom + '> sans fermante');
}

/** Le premier enfant d'un contenu JSX, commentaires `{/* … *\/}` sautés. */
function premierEnfant(c) {
  let k = 0;
  for (;;) {
    while (/\s/.test(c[k])) k++;
    if (c.startsWith('{/*', k)) { k = c.indexOf('*/}', k) + 3; continue; }
    if (c[k] === '{') return c.slice(k, finAccolade(c, k) + 1);
    return c.slice(k, c.indexOf('\n', k));
  }
}

const MEDIA = fonction('RoomMediaCard');
const RACINE_MEDIA = MEDIA.indexOf("<div className={'o-rmcard'");

test('la carte lecteur n’est plus un bouton qui enferme ses commandes', () => {
  assert.ok(RACINE_MEDIA > 0, 'la racine de la carte lecteur a changé de forme');
  const t = balise(MEDIA, RACINE_MEDIA).texte;
  for (const attr of ['role=', 'tabIndex=', 'aria-label=', 'onClick=', 'onKeyDown=']) {
    assert.ok(!t.includes(attr), 'la racine porte encore ' + attr + ' : la bascule, le volume et les boutons redeviennent invisibles à un lecteur d’écran');
  }
  // La surface se pose en `inset: 0` : sans racine positionnée, elle
  // couvrirait la grille entière.
  assert.ok(t.includes("position: 'relative'"), 'la racine n’est plus positionnée');
  // Le gabarit ne bouge pas : la carte garde sa classe (index.css, tests/clair).
  assert.ok(t.includes("className={'o-rmcard' + (mort ? ' o-panne' : '')}") && t.includes('...RM_CARD'));
});

test('la carte lecteur s’ouvre par sa surface, qui dit ce que la carte affiche', async () => {
  const c = contenu(MEDIA, RACINE_MEDIA);
  assert.equal(premierEnfant(c), '{onOpen && <Surface onClick={() => onOpen(id)} label={nomCarte(nom, texte)} />}',
    'le premier enfant doit être la surface : peinte d’abord, elle passe sous les commandes');
  // `texte` est la ligne d'état écrite sous le nom : le nom lu et le texte vu
  // sont la même variable.
  assert.ok(c.includes('<div style={RM_NAME}>{nom}</div>') && /\}\}>\{texte\}<\/div>/.test(c), 'la carte n’affiche plus `texte` sous son nom');
  assert.ok(!MEDIA.includes("tr('Ouvrir') + ' ' + nom"), '« Ouvrir Enceinte salon » taisait l’état affiché');
  // Ce que la surface devient à l'écran.
  const Surface = await composant('ui.jsx', 'Surface');
  const nomCarte = await composant('ui.jsx', 'nomCarte');
  const html = rendre(Surface, { onClick: () => {}, label: nomCarte('Enceinte salon', 'En pause') });
  assert.ok(html.startsWith('<button type="button" class="o-surface"'), 'un vrai bouton');
  assert.ok(html.includes('aria-label="Enceinte salon, En pause"'), 'nom, puis état affiché');
  assert.ok(html.includes('aria-haspopup="dialog"'), 'il ouvre une fiche, et le dit');
});

test('les commandes de la carte lecteur passent au-dessus de la surface et nomment l’appareil', () => {
  const boutons = [...MEDIA.matchAll(/<button\b/g)].map(m => balise(MEDIA, m.index).texte);
  assert.equal(boutons.length, 3, 'piste précédente, lecture / pause, piste suivante');
  for (const b of boutons) {
    assert.match(b, /aria-label=\{[^}]*\+ ' ' \+ nom\}/, 'un bouton de lecture ne dit pas quel lecteur il commande : ' + b.slice(0, 80));
    assert.ok(b.includes('e.stopPropagation()'), 'le clic d’un bouton remonte à la carte');
  }
  // « Lecture » est l'état écrit sur la carte (« Playing ») : le geste est « Lire ».
  const lecture = boutons.find(b => b.includes("'media_play_pause'"));
  assert.ok(lecture.includes("tr('Lire')") && !lecture.includes("tr('Lecture')"), 'le bouton de lecture porte le nom d’un état');
  // Relecture du lot 13 : même règle pour le mini de la compacte CvCard, un
  // bouton à icône seule — son nom est tout ce qu'il dit.
  const cv = fonction('CvCard');
  const minis = [...cv.matchAll(/<button\b/g)].map(m => balise(cv, m.index).texte).filter(b => b.includes("'play_pause'") && b.includes('style={miniAccent}'));
  assert.equal(minis.length, 1, 'le mini lecture / pause de la compacte a disparu');
  assert.ok(minis[0].includes("tr('Lire')") && !minis[0].includes("tr('Lecture')"), '« Playing Enceinte salon » : le mini de la compacte porte le nom d’un état');
  // Les boutons SEULS sont positionnés (`btn` hérite de RM_BTN), pas leur
  // rangée : positionnée, elle couvrait la surface, et un appui entre deux
  // boutons ne faisait plus rien (relecture du lot 13).
  const i = MEDIA.indexOf('<button');
  const rangee = balise(MEDIA, MEDIA.lastIndexOf('<div', i)).texte;
  assert.ok(!rangee.includes("position: 'relative'"), 'la rangée des boutons couvre la surface : l’écart entre deux boutons ne fait plus rien');
  assert.ok(/\nconst RM_BTN = \{ position: 'relative', /.test(APP), 'RM_BTN n’est plus positionné : un clic sur « Pause » ouvrirait la fiche');
  assert.ok(MEDIA.includes('const btn = { ...RM_BTN,') && boutons.every(b => b.includes('style={btn}')), 'un bouton de lecture ne tient plus sa position de RM_BTN : il passerait sous la surface');
  // La bascule et la jauge le sont d'elles-mêmes, et nomment l'appareil aussi.
  assert.ok(MEDIA.includes('<RmBascule on={marche} nom={nom} onToggle={basculer} />'));
  assert.ok(MEDIA.includes("label={tr('Volume') + ' ' + nom}"));
  for (const f of ['RmBascule', 'RmJauge']) {
    // Le premier élément rendu, commentaires de bloc retirés.
    const corps = fonction(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const el = corps.indexOf('<', corps.indexOf('return ('));
    assert.ok(balise(corps, el).texte.includes("position: 'relative'"), f + ' n’est plus positionnée : la surface la couvrirait');
  }
});

test('Scènes : le curseur de luminosité ne contient plus ses boutons', () => {
  const scenes = fonction('ScenesContent');
  const i = scenes.indexOf("kbSlider(tr('Luminosité des scènes')");
  assert.ok(i > 0, 'le curseur de luminosité des scènes a disparu');
  const d = scenes.lastIndexOf('<', i);
  const dedans = contenu(scenes, d);
  assert.ok(!/<(button|input|select|a)\b|role=|tabIndex=/.test(dedans), 'un curseur contient un contrôle (`nested-interactive`)');
  // La valeur elle-même, `span` enfant direct de la rangée : `.o-qb-lumi > div
  // > span` (index.css) la tient au téléphone.
  assert.equal(balise(scenes, d).nom, 'span', 'le rôle curseur est porté par autre chose que la valeur');
  assert.equal(dedans, '{bri} %', 'la valeur affichée est ce que le curseur porte');
  // − et + restent frères de la valeur, dans la même rangée, et disent ce qu'ils règlent.
  const q = scenes.indexOf('<QuickBox label={tr(\'Luminosité\')} className="o-qb-lumi">');
  const groupe = contenu(scenes, q);
  assert.ok(groupe.includes("aria-label={tr('Baisser la luminosité')}") && groupe.includes("aria-label={tr('Monter la luminosité')}"),
    '− et + n’annoncent pas ce qu’ils règlent');
  assert.ok(!groupe.includes("tr('Monter')"), '« Monter » se lit « Move up » en anglais — le mot du mode édition');
  assert.ok(groupe.includes('onClick={() => setBri(bri - 5)}') && groupe.includes('onClick={() => setBri(bri + 5)}'), 'le pas de − et + a changé');
});

test('les noms de ces commandes existent dans les sept langues', async () => {
  const cles = ['Luminosité des scènes', 'Baisser la luminosité', 'Monter la luminosité', 'Lire', 'Mettre en pause', 'Piste précédente', 'Piste suivante', 'Volume'];
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const t = (await import(new URL('../src/langues/' + l + '.js', import.meta.url))).default;
    for (const k of cles) assert.ok(typeof t[k] === 'string' && t[k], l + ' : « ' + k + ' » n’a pas de traduction');
  }
});
