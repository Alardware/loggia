// L'icône CHOISIE d'un volet suit son état (sa demande du 25/10, qui revient
// sur V7 « une icône choisie reste ») : ses deux volets portaient
// `shutter-closed`, et montraient un volet fermé même ouverts à 100 %.
// Les quatre dessins du volet roulant (dessins.js) en sont les variantes :
// montée et descente pendant la course, ouvert ou fermé sinon. Une autre
// icône choisie — sans variantes — reste telle quelle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const E = await import('../src/voletecran.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const vue = (o) => ({ muet: false, enCourse: false, ferme: false, ligne: { ligne: 8 }, ...o });

test('une icône de volet roulant choisie suit l’état', () => {
  for (const choisie of ['shutter-up', 'shutter-open', 'shutter-closed', 'shutter-down']) {
    assert.equal(E.iconeSelonEtat(choisie, vue({ ferme: true })), 'shutter-closed', choisie + ' fermé');
    assert.equal(E.iconeSelonEtat(choisie, vue({ ferme: false })), 'shutter-open', choisie + ' ouvert');
    assert.equal(E.iconeSelonEtat(choisie, vue({ enCourse: true, ligne: { ligne: 2, sens: 'ouverture' } })), 'shutter-up', choisie + ' en montée');
    assert.equal(E.iconeSelonEtat(choisie, vue({ enCourse: true, ligne: { ligne: 2, sens: 'fermeture' } })), 'shutter-down', choisie + ' en descente');
  }
});

test('une autre icône choisie reste, un volet muet garde la sienne', () => {
  assert.equal(E.iconeSelonEtat('bulb', vue({ ferme: true })), 'bulb');
  assert.equal(E.iconeSelonEtat('garage', vue({ ferme: false })), 'garage');
  assert.equal(E.iconeSelonEtat('shutter-open', vue({ muet: true, ferme: true })), 'shutter-open', 'muet : on ne sait pas, on ne change rien');
  assert.equal(E.iconeSelonEtat('shutter-closed', null), 'shutter-closed', 'sans vue');
  assert.equal(E.iconeSelonEtat(null, vue({ ferme: true })), null);
});

test('la carte, la compacte et la fiche passent l’icône choisie par l’état', () => {
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes("const GlypheCarte = ({ id, size = 19, anime = false, selon = null, children }) => {"), 'GlypheCarte accepte `selon`');
  assert.ok(app.includes('<GlypheCarte id={id} size={17} selon={(n) => iconeSelonEtat(n, vue)}><Fi i={vue.glyphe} size={17} /></GlypheCarte>'), 'la carte du volet');
  assert.ok(app.includes('<Ico name={vue ? iconeSelonEtat(ico, vue) : ico} size={dense ? 15 : 17} />'), 'la compacte');
  assert.ok(app.includes('glyphe={(defaut, vue) => <GlypheCarte id={id} size={18} selon={vue ? (n) => iconeSelonEtat(n, vue) : null}>{defaut}</GlypheCarte>}'), 'la coquille de la fiche');
  assert.ok(lire('src', 'fichevolet.jsx').includes('plaque.glyphe = glyphe(<Fi i={vue.glyphe} size={18} />, vue);'), 'la fiche passe sa vue');
});
