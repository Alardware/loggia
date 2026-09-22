/* Les composants se testent par rendu (ADR 0069, 22/09).
 *
 * Jusqu'ici aucun composant `.jsx` n'etait execute par un test : on relisait
 * leur texte. Ici, React rend le HTML, et l'on affirme sur ce que l'ecran
 * montre — un role, un nom, un texte — pas sur la forme du code. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { composant, rendre } from './rendu.mjs';

const verdict = (t, c) => ({ t, c });
const CONFORT = {
  indice: 72,
  verdict: verdict('Confortable', 'var(--o-ok)'),
  mesures: [
    { cle: 'temp', nom: 'Température', valeur: '21,4 °C', icone: 'thermometer-half', verdict: verdict('Idéal', 'var(--o-ok)') },
    { cle: 'co2', nom: 'CO₂', valeur: '1 480 ppm', icone: 'wind', verdict: verdict('Élevé', 'var(--o-warn2)') },
  ],
};

test('la barre de confort : un bouton nomme, l’indice sur 100, une pastille par mesure', async () => {
  const BarreConfort = await composant('barreconfort.jsx', 'BarreConfort');
  const html = rendre(BarreConfort, { confort: CONFORT, onOpen: () => {} });
  assert.ok(html.includes('role="button"') && html.includes('tabindex="0"'), 'un bouton, au clavier aussi');
  assert.ok(html.includes('aria-label="Historique du confort"'), 'son nom');
  assert.ok(html.includes('<span class="n">72</span>') && html.includes('/ 100') && html.includes('Confortable'), 'l’indice et son mot');
  assert.equal((html.match(/class="o-confort-mesure"/g) || []).length, 2, 'une pastille par mesure');
  assert.ok(html.includes('--conf-n:2') || html.includes('--conf-n: 2'), 'la rangee sait combien elle porte');
  assert.ok(html.includes('1 480 ppm') && html.includes('Élevé'), 'la valeur et le verdict de chaque mesure');
  assert.ok(html.includes('aria-hidden="true"'), 'l’anneau et le point ne se lisent pas');
});

test('la barre de confort sans confort : rien', async () => {
  const BarreConfort = await composant('barreconfort.jsx', 'BarreConfort');
  assert.equal(rendre(BarreConfort, { confort: null, onOpen: () => {} }), '');
});

test('la carte meteo du rail : rien sans entite meteo, et rien d’invente sans prevision', async () => {
  const CarteMeteo = await composant('cartemeteo.jsx', 'CarteMeteo');
  assert.equal(rendre(CarteMeteo, { hass: { states: {} } }), '', 'sans entite meteo, la carte n’existe pas');
  const hass = { states: { 'weather.maison': { entity_id: 'weather.maison', state: 'cloudy', attributes: { friendly_name: 'Maison', temperature: 18.3 } } } };
  const html = rendre(CarteMeteo, { hass });
  assert.equal(typeof html, 'string');
  assert.ok(!/Max|Min/.test(html), 'pas de Max · Min sans prevision quotidienne (ADR 0038)');
});

test('l’en-tete d’une regle : le nom, la description, et un interrupteur qui dit son etat', async () => {
  const RegleEntete = await composant('ui.jsx', 'RegleEntete');
  const html = rendre(RegleEntete, { nom: 'Volet bloqué', desc: 'Ne pas fermer sur une porte ouverte.', on: true, cb: () => {} });
  assert.ok(html.includes('Volet bloqué') && html.includes('Ne pas fermer sur une porte ouverte.'), 'le nom et la description');
  assert.ok(html.includes('aria-checked="true"') || html.includes('aria-pressed="true"'), 'l’etat se lit');
});
