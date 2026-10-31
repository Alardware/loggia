/* Le bandeau « Commande non exécutée » ne parle que des refus de Home Assistant
 * (audit de consolidation du 28/10, M11).
 *
 * L'écoute globale des rejets (`useToastApp`, app/hooks.jsx) prenait tout rejet
 * qui portait un `code` vrai, ou dont le message contenait « service »,
 * « entity », « timeout »… Une `AbortError` (une `DOMException`, code
 * numérique) ou une erreur de programme qui nomme `entity_id` passait donc pour
 * un refus de Home Assistant, et le bandeau l'annonçait comme tel. Elle ne
 * garde plus que les erreurs du protocole : `{ code, message }`, le code une
 * chaîne (`estRefus`, refus.js). Le hook est joué ici, rejet par rejet. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter } from './crochets.mjs';

register('./jsx-hooks.mjs', import.meta.url);
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

/* La fenêtre : l'écoute qui s'y pose, et des événements qu'on lui envoie. */
const ecoutes = new Map();
globalThis.window = globalThis.window || {};
window.addEventListener = (type, f) => { ecoutes.set(type, f); };
window.removeEventListener = (type) => { ecoutes.delete(type); };

const { useToastApp } = await import('../src/app/hooks.jsx');

function Bandeau() { return useToastApp().toast; }

/** Monte le hook, envoie un rejet ; rend le bandeau, et si l'événement a été pris en charge. */
function rejeter(raison) {
  const m = monter(Bandeau);
  let pris = false;
  ecoutes.get('unhandledrejection')({ reason: raison, preventDefault: () => { pris = true; } });
  m.effets();
  const bandeau = m.arbre;
  m.demonter();
  return { bandeau, pris };
}

test('un refus du protocole de Home Assistant s’affiche, comme avant', () => {
  const { bandeau, pris } = rejeter({ code: 'home_assistant_error', message: 'Entity is unavailable' });
  assert.ok(pris, 'le rejet n’est plus pris en charge');
  assert.match(String(bandeau), /Commande non exécutée/);
  // Les refus que Loggia lève sous la même forme passent aussi.
  assert.match(String(rejeter(Object.assign(new Error('commande impossible'), { code: 'service_error' })).bandeau), /Commande non exécutée/);
  assert.match(String(rejeter({ code: 'not_admin', message: 'reglages reserves aux administrateurs Home Assistant : loggia_rooms' }).bandeau), /loggia_rooms/);
});

test('une AbortError n’est pas un refus de Home Assistant', () => {
  const abandon = typeof DOMException === 'function' ? new DOMException('The operation was aborted.', 'AbortError') : Object.assign(new Error('aborted'), { name: 'AbortError', code: 20 });
  const { bandeau, pris } = rejeter(abandon);
  assert.equal(bandeau, null, 'une requête abandonnée affiche « Commande non exécutée »');
  assert.ok(!pris, 'le rejet est avalé : la console ne le verrait plus');
});

test('une erreur de programme qui nomme une entité non plus', () => {
  for (const r of [new TypeError("Cannot read properties of undefined (reading 'entity_id')"), new Error('timeout'), 'connection', { code: 3 }, null]) {
    const { bandeau, pris } = rejeter(r);
    assert.equal(bandeau, null, 'pris pour un refus : ' + String(r && (r.message || r.code) || r));
    assert.ok(!pris);
  }
});
