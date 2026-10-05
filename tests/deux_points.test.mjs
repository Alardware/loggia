// ─────────────────────────────────────────────────────────────────────────────
// Les deux-points à la française, en français seulement (audit du 03/10).
//
// Cinq endroits collaient un libellé traduit à sa valeur par « ' : ' » : l'état
// de l'alarme et la carte « À surveiller », dits au lecteur d'écran ; le nom de
// chaque liste de choix ; le dernier indice de présence ; l'ordre des règles
// des volets. L'espace avant les deux-points est une règle de la typographie
// FRANÇAISE : écrite en dur, elle passait dans les six autres langues —
// « Language : Deutsch », « Alarm : Armed ».
//
// Le libellé et sa valeur passent maintenant par UN gabarit, « {a} : {b} »,
// que chaque catalogue écrit à sa façon : « {a}: {b} » dans les six.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');
const GABARIT = '{a} : {b}';
const catalogue = async (l) => (await import(pathToFileURL(join(SRC, 'langues', l + '.js')).href)).default;

/* L'écran en ANGLAIS, posé avant tout import qui lit la langue : `i18n.js` la
 * résout au chargement — le choix explicite du stockage local, puis le
 * catalogue que l'amorce dépose sur `window`. Chaque fichier de test tourne
 * dans son propre processus : rien ne fuit vers les autres. */
const EN = await catalogue('en');
const stockage = {
  getItem: (k) => (k === 'loggia-langue' ? JSON.stringify('en') : null),
  setItem() {}, removeItem() {}, key: () => null, length: 0,
};
globalThis.localStorage = stockage;
globalThis.window = { __loggiaCatalogue: { code: 'en', cat: EN }, localStorage: stockage };
const { tr, langue } = await import('../src/i18n.js');
const { composant, rendre } = await import('./rendu.mjs');

test('chaque catalogue écrit le gabarit sans espace avant les deux-points', async () => {
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    assert.equal((await catalogue(l))[GABARIT], '{a}: {b}', l + ' : le gabarit manque, ou garde l’espace française');
  }
});

test('en anglais, la liste de choix se dit « Language: Deutsch »', async () => {
  assert.equal(langue(), 'en', 'le test ne tourne pas en anglais : il ne prouverait rien');
  const ListeChoix = await composant('ui.jsx', 'ListeChoix');
  const options = [{ id: 'de', label: 'Deutsch' }];
  const html = rendre(ListeChoix, { label: tr('Langue'), value: 'de', options, onChange: () => {} });
  assert.ok(html.includes('aria-label="Language: Deutsch"'), 'l’espace française avant les deux-points a passé en anglais');
  // Sans choix, le nom seul : pas de deux-points pendus.
  const vide = rendre(ListeChoix, { label: tr('Langue'), value: 'zz', options, onChange: () => {} });
  assert.ok(vide.includes('aria-label="Language"'), 'sans choix, le bouton dit son nom seul');
  assert.equal(tr(GABARIT, { a: tr('Alarme'), b: 'Armed' }), 'Alarm: Armed', 'l’annonce de l’alarme');
});

/* Un libellé collé à sa valeur par des deux-points écrits en dur :
 * `x + ' : '`, `' : ' + y`, `${x} : ${y}`, et en JSX `{tr('X')} : {y}`. Une
 * espace avant les deux-points est exigée : `h + ':' + m`, une heure, n'en a
 * pas. */
const COLLAGES = [
  /\+\s*(['"`])\s+:\s*\1/,
  /(['"`])\s+:\s*\1\s*\+/,
  /\$\{[^{}]*\}\s+:\s*\$\{/,
  /\{tr(?:N|Court)?\((?:[^()]|\([^()]*\))*\)\}\s*:/,
];
const colle = (l) => COLLAGES.some(m => m.test(l));

/* Les commentaires sont blanchis avant le balayage : ils citent la faute pour
 * l'expliquer. Une ouverture de commentaire ne compte qu'en début de texte ou
 * après un séparateur. Collée à un mot, comme dans accept="image/*", elle n'en
 * est pas une : la prendre pour telle blanchissait une trentaine de lignes de
 * vrai code de parametres.jsx, que le balayage ne voyait plus. */
const blanc = (m) => m.replace(/[^\n]/g, ' ');
const sansCommentaires = (s) => s
  .replace(/(^|[^\w/'"`*])\/\*[\s\S]*?\*\//g, (m, a) => a + blanc(m.slice(a.length)))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + blanc(m.slice(a.length)));

test('le balayage reconnaît un collage, et pas une heure', () => {
  assert.ok(colle("tr('Alarme') + ' : ' + alarmeTuile.texte"), "x + ' : ' + y");
  assert.ok(colle("label + (cur ? ' : ' + cur.label : '')"), "' : ' + y");
  assert.ok(colle('`${nom} : ${valeur}`'), 'un gabarit de chaîne');
  assert.ok(colle("{tr('Qui l’emporte')} : {liste}"), 'le JSX');
  assert.ok(!colle("dd(d.getHours()) + ':' + dd(d.getMinutes())"), 'une heure n’est pas un collage');
  assert.ok(!colle("color: on ? 'var(--o-ok)' : 'var(--o-text3)'"), 'un ternaire non plus');
  // Un vrai commentaire est blanchi ; un glob `image/*` n'en ouvre pas un.
  assert.ok(!colle(sansCommentaires("/* tr('A') + ' : ' + b */")), 'un commentaire cite la faute sans la commettre');
  const glob = '<input accept="image/*" />\n' + "x = tr('A') + ' : ' + b; /* fin */";
  assert.ok(colle(sansCommentaires(glob).split('\n')[1]), 'un « /* » collé à un mot a avalé du code : le balayage devient aveugle');
});

test('plus aucun libellé collé à sa valeur dans src/', () => {
  const fichiers = [];
  (function walk(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'langues') walk(p); }
      else if (/\.jsx?$/.test(f)) fichiers.push(p);
    }
  })(SRC);
  assert.ok(fichiers.length > 50, 'le balayage ne voit presque rien : il est cassé');
  const trouves = [];
  for (const f of fichiers) {
    sansCommentaires(readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
      if (colle(l)) trouves.push(relative(SRC, f).replace(/\\/g, '/') + ':' + (i + 1) + '  ' + l.trim().slice(0, 90));
    });
  }
  assert.deepEqual(trouves, [], "un libellé collé à sa valeur : passer par tr('{a} : {b}', { a, b })");
});

test('les cinq endroits passent par le gabarit', () => {
  const lire = (f) => readFileSync(join(SRC, f), 'utf8');
  const app = lire('App.jsx');
  assert.ok(app.includes("{alarmeTuile ? tr('{a} : {b}', { a: tr('Alarme'), b: alarmeTuile.texte }) : ''}"), 'l’état de l’alarme, dit au lecteur d’écran');
  assert.ok(app.includes("{points.length ? tr('{a} : {b}', { a: tr('À surveiller'), b: resumeAttention(points) }) : ''}"), 'la carte « À surveiller », dite au lecteur d’écran');
  const ui = lire('ui.jsx');
  // `nom` ne sert qu'au bouton que l'appelant dessine (lot 13 de l'audit du
  // 03/10) : sans lui, le nom composé par le gabarit reste celui du bouton.
  assert.ok(ui.includes("const nomBouton = cur ? tr('{a} : {b}', { a: label, b: cur.label }) : label;") && ui.includes('aria-label={nom || nomBouton}'), 'le nom de la liste de choix');
  assert.ok(lire('views/presence.jsx').includes("{tr('{a} : {b}', { a: tr('Dernier indice'), b: tr(etat.indices.dernier.genre || '') })}"), 'le dernier indice de présence, son genre traduit');
  assert.ok(lire('views/volets.jsx').includes("{tr('{a} : {b}', { a: tr('Qui l’emporte'), b: etat.priorites.map(nomPriorite).join(' › ') })}"), 'l’ordre des règles des volets');
});
