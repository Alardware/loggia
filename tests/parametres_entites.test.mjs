// ─────────────────────────────────────────────────────────────────────────────
// Plus aucun texte n'envoie vers « Paramètres → Entités » (audit du 03/10).
//
// La section Entités de Paramètres est partie (edition_en_tete.test.mjs) :
// chaque vue règle ses entités en mode édition, par le bouton « Entités de la
// vue » de son bandeau (`BandeauEdition`, App.jsx). Quatre textes y
// renvoyaient encore — la vue vide, deux étapes du premier lancement, la carte
// du robot — et faisaient chercher, dans les sept langues, un écran qui
// n'existe plus.
//
// Une exception, vérifiée : le diagnostic de `health.js`. Il parle des
// Paramètres de HOME ASSISTANT, où l'on supprime une entrée de registre
// orpheline, et seule la console l'affiche (`healthText`).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const fichiers = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx?$/.test(f)) fichiers.push(p);
  }
})(SRC);
const nom = (f) => relative(SRC, f).split(sep).join('/');

/* L'ancien chemin, avec ou sans accents, et les flèches qu'on a vu écrire. */
const ANCIEN = /Param[eè]tres\s*(?:→|›|->|>)\s*Entit[eé]s/;
/* Une ligne de commentaire raconte l'histoire du code, et plusieurs disent
 * encore d'où venait une clé : seul ce qui peut s'afficher compte ici. */
const COMMENTAIRE = /^\s*(?:\/\/|\{?\/\*|\*)/;

test('aucun texte n’envoie vers « Paramètres → Entités », section supprimée', () => {
  assert.ok(ANCIEN.test('dans Paramètres → Entités.') && ANCIEN.test('Parametres › Entites'),
    'le motif ne reconnaît plus l’ancien chemin : ce test serait vert pour rien');
  assert.ok(fichiers.length > 50, `seulement ${fichiers.length} fichiers lus dans src/`);
  const fautifs = [];
  for (const f of fichiers) {
    if (nom(f) === 'health.js') continue;
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (COMMENTAIRE.test(l)) return;
      if (ANCIEN.test(l.replace(/\s\/\/.*$/, ''))) fautifs.push(`${nom(f)}:${i + 1}`);
    });
  }
  assert.deepEqual(fautifs, [],
    'ces textes renvoient vers un écran qui n’existe plus : le chemin est « Entités de la vue », en mode édition');
});

test('l’exception de health.js : les Paramètres de Home Assistant, lus dans la console seule', () => {
  const h = lire('src', 'health.js');
  assert.match(h, /entités sans définition — anciennes configurations /);
  assert.match(h, /dont seule l’entrée de registre subsiste, à supprimer dans '\s*\+ 'Paramètres → Entités'/,
    'le diagnostic a changé : revoir si l’exception tient encore');
  const appelants = fichiers.filter(f => nom(f) !== 'health.js' && /healthText\(/.test(readFileSync(f, 'utf8'))).map(nom);
  assert.deepEqual(appelants, ['App.jsx'], 'healthText a un nouveau lecteur');
  assert.match(lire('src', 'App.jsx'), /healthText: \(\) => \{[^\n]*console\.log\(t\)/,
    'healthText s’affiche ailleurs que dans la console : son chemin doit alors nommer Home Assistant');
});

test('le chemin donné est le nom du bouton, tel qu’il s’affiche dans chaque langue', async () => {
  /* Renommer le bouton sans ces textes referait la même faute : ils citent son
   * libellé, et chaque traduction doit citer la traduction du libellé. */
  const LIBELLE = 'Entités de la vue';
  assert.ok(lire('src', 'App.jsx').includes("{entLabel || tr('" + LIBELLE + "')}"), 'le bouton du bandeau a changé de nom');
  const charger = async (code) => (await import(pathToFileURL(join(SRC, 'langues', code + '.js')).href)).default;
  const en = await charger('en');
  const citent = Object.keys(en).filter(k => k.includes('« ' + LIBELLE + ' »'));
  assert.ok(citent.length >= 3, `seulement ${citent.length} textes citent le bouton`);
  for (const code of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = await charger(code);
    assert.ok(cat[LIBELLE], `${code} : le bouton n’a plus de traduction`);
    for (const k of citent) {
      assert.ok(typeof cat[k] === 'string' && cat[k].includes(cat[LIBELLE]),
        `${code} : « ${k} » ne nomme pas le bouton comme il s’affiche (« ${cat[LIBELLE]} »)`);
    }
  }
});

test('le plan du robot ne se monte qu’avec une image : pas d’état « sans carte »', () => {
  const fiche = lire('src', 'ficherobot.jsx');
  assert.ok(fiche.includes('<VacPlan hass={hass} haid={idCarte} '), 'le plan reçoit autre chose que l’image trouvée par la fiche');
  assert.ok(fiche.includes('carte={idCarte ? planDe() : null}'),
    'la fiche monte le plan sans image : il lui faut de nouveau un état « sans carte »');
  assert.equal((fiche.match(/planDe\(\)/g) || []).length, 1, 'planDe() est appelé ailleurs : vérifier qu’une image y existe');
  const importeurs = fichiers.filter(f => /vacplan\.jsx['"]/.test(readFileSync(f, 'utf8'))).map(nom);
  assert.deepEqual(importeurs, ['ficherobot.jsx'], 'un autre écran monte le plan');
  assert.ok(!/if \(!haid\) \{/.test(lire('src', 'vacplan.jsx')), 'la branche « sans carte » est revenue');
});
