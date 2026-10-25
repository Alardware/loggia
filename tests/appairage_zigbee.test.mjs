/* L'appairage Zigbee dans Paramètres › Interrupteurs (chantier Prises, § 9 ;
 * ADR 0193).
 *
 * Le « Permit join » de Zigbee2MQTT a quitté Objets › Prises (P1) : la section
 * Interrupteurs le porte, en tête. On le reconnaît à son APPAREIL (Zigbee2MQTT
 * / Bridge), jamais à son nom ; l'ouvrir demande deux appuis, le fermer un
 * seul ; un compte ordinaire voit l'état, sans geste ; sans pont, rien. */
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
const I = await import(new URL('../src/views/interrupteurs.jsx', import.meta.url).href);
const { setLoggiaState } = await import('../src/state.js');

const PONT = 'switch.zigbee2mqtt_bridge_permit_join';
const index = (fabricant = 'Zigbee2MQTT', modele = 'Bridge') => ({
  entityMeta: new Map([[PONT, { deviceId: 'pont' }], ['switch.zigbee2mqtt_bridge_mode', { deviceId: 'pont', category: 'config' }], ['switch.prise', { deviceId: 'prise' }]]),
  deviceMeta: new Map([['pont', { manufacturer: fabricant, model: modele }], ['prise', { manufacturer: 'Tuya', model: 'Smart plug' }]]),
});
const rendre = (state, admin = true) => renderToStaticMarkup(createElement(I.RangeeAppairage, { admin,
  hass: { states: { [PONT]: { entity_id: PONT, state, attributes: { friendly_name: 'Zigbee2MQTT Bridge Permit join' } } }, callService: () => Promise.resolve() } }));

test('le pont se reconnaît à son appareil, au caractère près ; ni un groupe, ni un switch de configuration', () => {
  assert.equal(I.switchDuPont(index()), PONT);
  assert.equal(I.switchDuPont(index('Zigbee2MQTT', 'Group')), null, 'un groupe Zigbee2MQTT n’est pas le pont');
  assert.equal(I.switchDuPont(null), null);
});

test('fermé : « Autorise… », et l’ouvrir demande deux appuis ; ouvert : « Appairage ouvert », la bascule le ferme', () => {
  setLoggiaState({ index: index() });
  const ferme = rendre('off');
  assert.ok(ferme.includes('>Appairage Zigbee<') && ferme.includes('>Autorise un nouvel appareil à rejoindre le réseau<'));
  assert.ok(ferme.includes('aria-label="Ouvrir l’appairage"') && ferme.includes('>Ouvrir<'), 'BoutonConfirme : un appui arme, le second ouvre');
  const ouvert = rendre('on');
  assert.ok(ouvert.includes('>Appairage ouvert<') && /role="switch" aria-checked="true" aria-label="Fermer l’appairage"/.test(ouvert));
});

test('un compte ordinaire voit l’état, sans geste ; sans pont, pas de rangée', () => {
  setLoggiaState({ index: index() });
  const html = rendre('off', false);
  assert.ok(html.includes('>Appairage fermé<') && !html.includes('<button'));
  setLoggiaState({ index: index('Tuya', 'Bridge') });
  assert.equal(rendre('off'), '', 'pas de pont Zigbee2MQTT : rien');
  setLoggiaState({ index: null });
});
