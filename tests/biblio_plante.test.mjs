/* La Bibliothèque des cartes se MONTE (audit du 19/10, H1).
 *
 * Le chantier Capteurs (C30) a donné à `RoomPlantCard` une seule source, la plante `pl`. La Bibliothèque l'appelait encore avec les
 * props d'avant (`hum`, `verdict`, `img`…) : `pl.img` levait « Cannot read properties of undefined » et TOUTE la vue tombait. Les
 * tests d'avant ne lisaient que sa source ; celui-ci la rend. `BiblioView` vit dans App.jsx : sous `?biblio`, un crochet de
 * chargement lui ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?biblio')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?biblio'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { BiblioView };' };",
  '}',
].join('\n')));
await import(new URL('../src/App.jsx?biblio', import.meta.url).href);
/* ASSERTION MODIFIÉE (ADR 0283) : la Bibliothèque se charge à la demande (edition/biblio.jsx) ; App.jsx n'en garde qu'une coquille,
 * que le rendu statique ne déplie pas. Le module se rend lui-même, App.jsx chargé d'abord : c'est lui qui pose `OUTILS_VUES`. */
const F = await import(new URL('../src/edition/biblio.jsx', import.meta.url).href);

test('H1 : la Bibliothèque se rend, cartes de plante comprises (large et compacte)', () => {
  const html = renderToStaticMarkup(createElement(F.BiblioView, {}));
  assert.equal((html.match(/data-plante=""/g) || []).length, 2, 'les deux cartes de plante sont là');
  assert.ok(html.includes('Monstera'), 'avec leur nom');
  assert.ok(!html.includes('Mesure absente'), 'la plante d’exemple porte ses mesures, pas « Mesure absente »');
});
