// ─────────────────────────────────────────────────────────────────────────────
// La barre des ambiances (Scènes) au téléphone : deux rangées, rien ne glisse.
//
// Retour du 19/09 : « dans Scènes, ceux-ci sur mobile c'est pas terrible — sur
// PC et tablette très bien, mais sur mobile je suis obligé de scroller, on voit
// mal ». Sous 760 px, un bandeau devient une rangée qui glisse ; celui-ci fait
// exception. Les pièces se partagent la première rangée ; la collection, la
// luminosité et les deux gestes directs, en icônes, la seconde — sous 330 px
// environ, les icônes passent à la ligne plutôt que d'écraser la collection.
// L'ordinateur et la tablette ne changent pas. Voir l'ADR 0051 (v3.56.2).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const CSS = lire('src', 'index.css');
// Le bloc des bandeaux au téléphone (≤ 760 px).
const DEBUT_MOBILE = '@media (max-width: 760px) {\n  .o-bar {';
const MOBILE = CSS.slice(CSS.indexOf(DEBUT_MOBILE), CSS.indexOf('\n}\n', CSS.indexOf(DEBUT_MOBILE)));
const SCENES = (() => {
  const i = APP.indexOf('\nfunction ScenesContent(');
  return APP.slice(i, APP.indexOf('\nfunction ', i + 1));
})();

test('la barre des ambiances et ses quatre groupes portent leurs classes', () => {
  assert.ok(CSS.indexOf(DEBUT_MOBILE) > 0, 'le bloc des bandeaux au téléphone a changé de forme');
  assert.ok(APP.includes('const QuickBox = ({ label, children, className = null }) => ('));
  assert.ok(APP.includes("<div className={'o-qb' + (className ? ' ' + className : '')} "));
  assert.ok(APP.includes('<span className="o-qb-lbl" '), 'le libellé d’un groupe ne peut plus s’effacer au téléphone');
  assert.ok(SCENES.includes('<div className="o-bar o-bar-scenes" '), 'la barre a perdu sa classe : au téléphone, elle glisserait de nouveau');
  const groupes = [['label="Direct"', 'o-qb-direct'], ["label={tr('Pièce')}", 'o-qb-piece'], ['label="Collection"', 'o-qb-collection'], ["label={tr('Luminosité')}", 'o-qb-lumi']];
  for (const [libelle, classe] of groupes) {
    assert.ok(SCENES.includes('<QuickBox ' + libelle + ' className="' + classe + '">'), libelle + ' a perdu sa classe');
  }
});

test('les gestes directs : le mot à l’ordinateur, l’icône au téléphone, un nom toujours', () => {
  // Au téléphone, le mot s'efface : sans aria-label, le bouton n'aurait plus de nom.
  assert.ok(SCENES.includes('<button onClick={warmWhite} aria-label="Blanc chaud" style={miniBtn(false)}><span className="o-qb-ico" aria-hidden="true"><Fi i="bulb" '));
  assert.ok(SCENES.includes('<span className="o-qb-txt">Blanc chaud</span></button>'));
  assert.ok(SCENES.includes("<button onClick={allOff} aria-label={tr('Éteindre')} style={miniBtn(false)}><span className=\"o-qb-ico\" aria-hidden=\"true\"><Fi i=\"power\" "));
  assert.ok(SCENES.includes("<span className=\"o-qb-txt\">{tr('Éteindre')}</span></button>"));
  // L'icône ne sert qu'au téléphone : hors du bloc, elle est cachée.
  assert.ok(CSS.slice(0, CSS.indexOf(DEBUT_MOBILE)).includes('\n.o-qb-ico { display: none; }\n'));
});

test('au téléphone : deux rangées, rien ne glisse ; ailleurs, rien ne change', () => {
  assert.ok(MOBILE.includes('.o-bar.o-bar-scenes { flex-wrap: wrap !important; overflow: visible; '), 'la barre des ambiances glisse de nouveau au téléphone');
  assert.ok(MOBILE.indexOf('.o-bar.o-bar-scenes {') > MOBILE.indexOf('  .o-bar { flex-wrap: nowrap !important;'), 'l’exception doit suivre la règle commune des bandeaux');
  assert.ok(MOBILE.includes('.o-bar-scenes > * { flex-shrink: 1 !important; }'));
  assert.ok(MOBILE.includes('.o-bar-scenes > .o-qb-piece { order: -1; flex: 1 1 100%; }'), 'les pièces ne prennent plus toute la première rangée');
  assert.ok(MOBILE.includes('.o-bar-scenes > .o-qb-collection { flex: 1 1 0; min-width: 96px; }'), 'la collection ne prend plus la place qui reste');
  assert.ok(MOBILE.includes('.o-bar-scenes > .o-qb-direct { order: 1; }'));
  assert.ok(MOBILE.includes('.o-bar-scenes .o-qb-lbl { display: none; }'));
  assert.ok(MOBILE.includes('.o-bar-scenes .o-qb-ico { display: flex; }') && MOBILE.includes('.o-bar-scenes .o-qb-txt { display: none; }'), 'les gestes directs ne passent plus en icônes');
  // Le nom de la collection se réduit en dernier recours, avec des points de suspension.
  assert.ok(MOBILE.includes('.o-bar-scenes .o-qb-collection button > span:first-child { flex: 1 1 auto !important; }'));
  // Toute règle de la barre vit dans le bloc du téléphone : l'ordinateur et la tablette ne changent pas.
  const ailleurs = CSS.replace(MOBILE, '');
  assert.doesNotMatch(ailleurs, /\.o-bar-scenes|\.o-qb-(lbl|txt|piece|collection|lumi|direct)\b/, 'une règle de la barre des ambiances touche l’ordinateur ou la tablette');
});
