/* LA FEUILLE D'ALERTE (29/10, lot 6 de l'audit du 28/10, M8 ; ADR 0288).
 *
 * `window.alert` et `window.confirm` dessinaient une boîte du système, hors du
 * thème et de la règle des feuilles, aux boutons non traduits. Une feuille à
 * la place (`alerter`, `HoteAlertes`, `FeuilleAlerte` : ui.jsx) :
 *  - le titre et la croix sur la ligne d'en-tête, la croix en dernier, une
 *    seule ; le message ; au plus UN bouton, celui de l'action, au bleu plein
 *    et au texte blanc — jamais un « OK » ni un « Annuler » qui ne ferait que
 *    fermer ;
 *  - l'hôte est monté à côté de l'App, hors de sa barrière : il sert encore
 *    sur l'écran de secours ;
 *  - sans hôte vivant, le dialogue natif d'avant (`repli`) : rien ne se perd.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./jsx-hooks.mjs', import.meta.url);
// ui.jsx guette la première image peinte dès son chargement.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
}
const { alerter, FeuilleAlerte } = await import('../src/ui.jsx');

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const lire = (f) => readFileSync(join(SRC, f), 'utf8');

test('plus aucun dialogue natif dans src/, hors du repli de la feuille', () => {
  const trouves = [];
  const marcher = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'langues') marcher(p); continue; }
      if (!/\.(js|jsx)$/.test(f)) continue;
      const rel = relative(SRC, p).split('\\').join('/');
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        if (/(?:^|[^.\w])(?:window\.)?(?:alert|confirm|prompt)\(/.test(l)) trouves.push(rel + ':' + (i + 1));
      });
    }
  };
  marcher(SRC);
  // Le repli par défaut d'`alerter` (ui.jsx) et celui des réglages d'usine (boot.jsx).
  assert.deepEqual(trouves.filter(x => !/^(ui\.jsx|boot\.jsx):/.test(x)), [], 'un dialogue du navigateur : passe par alerter (ui.jsx)');
  assert.equal(trouves.length, 2, 'les deux replis, et rien d’autre : ' + trouves.join(', '));
});

test('les réglages d’usine de l’écran de secours passent par la feuille, l’hôte vit hors de la barrière', () => {
  const boot = lire('boot.jsx');
  assert.ok(boot.includes("alerter({ titre: tr(\"Réglages d'usine\"), texte: question, action: { libelle: tr('Effacer'), faire: effacer },"), 'la feuille, son titre et son seul bouton');
  assert.ok(boot.includes('repli: () => { if (window.confirm(question)) effacer(); } });'), 'sans feuille, la confirmation d’avant');
  assert.ok(boot.includes('<><LoggiaErrorBoundary><App /></LoggiaErrorBoundary><HoteAlertes /></>'), 'l’hôte à côté de l’App, pas dedans');
});

test('Paramètres et ses versions n’appellent plus que la feuille', () => {
  const par = lire('views/parametres.jsx');
  const ver = lire('views/versions.jsx');
  assert.equal((par.match(/\balerter\(\{ titre: tr\(/g) || []).length, 9, 'les neuf alertes de Paramètres');
  assert.equal((ver.match(/\balerter\(\{ titre: tr\('Versions précédentes'\)/g) || []).length, 1, 'le retour à une version');
});

test('la feuille : le titre, la croix en dernier, le message ; un seul bouton, l’action au bleu plein', () => {
  const sans = renderToStaticMarkup(createElement(FeuilleAlerte, { titre: 'Import', texte: 'Import impossible : fichier illisible.', onClose: () => {} }));
  assert.equal((sans.match(/<button/g) || []).length, 1, 'sans action, la croix seule');
  assert.equal((sans.match(/data-croix=""/g) || []).length, 1);
  assert.ok(sans.indexOf('>Import<') < sans.indexOf('data-croix') && sans.indexOf('data-croix') < sans.indexOf('Import impossible'), 'le titre, la croix, puis le message');
  assert.ok(/role="alert"[^>]*>Import impossible : fichier illisible\.</.test(sans), 'le message se dit');
  assert.ok(!/>(OK|Annuler|Fermer)</.test(sans), 'pas de bouton qui ne ferait que fermer');

  const avec = renderToStaticMarkup(createElement(FeuilleAlerte, { titre: 'Réglages d’usine', texte: 'Tout effacer ?', action: { libelle: 'Effacer', faire: () => {} }, onClose: () => {} }));
  assert.equal((avec.match(/<button/g) || []).length, 2, 'la croix et l’action');
  assert.equal((avec.match(/data-croix=""/g) || []).length, 1, 'une seule croix');
  assert.ok(/<button type="button" style="[^"]*background:var\(--o-accent-fond\);color:#fff"[^>]*>Effacer<\/button>/.test(avec), 'l’action au bleu plein, texte blanc');
});

test('sans hôte vivant, le dialogue natif d’avant prend le relais', () => {
  const vus = [];
  alerter({ titre: 'Import', texte: 'A', repli: () => vus.push('repli') });
  const avant = globalThis.window;
  globalThis.window = { alert: (t) => vus.push('alert ' + t), dispatchEvent: () => vus.push('feuille') };
  try { alerter({ titre: 'Import', texte: 'B' }); } finally { globalThis.window = avant; }
  assert.deepEqual(vus, ['repli', 'alert B']);
});
