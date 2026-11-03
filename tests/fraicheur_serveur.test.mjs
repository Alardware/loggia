/* La fraîcheur des mesures, jugée au SERVEUR (01/11, ADR 0311 ; lot 7 du rapport Gladys : A4 bis, F1).
 *
 * L'écran ne reçoit pas `last_reported` (ADR 0303) : il ne juge pas. L'état des veilles porte `figees` ; la racine le relit avec
 * le seuil des piles (`useSeuilPile`) et le retient (`retenirFigees`). La carte d'une mesure garde son chiffre, perd sa zone et
 * écrit « Dernier relevé il y a 7 h » ; celle d'une plante aussi, et rien n'y presse plus. La démo porte un capteur figé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const M = await import('../src/cartes/mesure.jsx');
const F = await import('../src/fraicheur.js');
const { vuePlante } = await import('../src/plantes.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const H = 3600000;
const CO2 = 'sensor.chambre_co2';
function vue(id = CO2) {
  const fx = {
    areas: [area('chambre', 'Chambre')], floors: [], energyPrefs: null,
    devices: [device('d_co2', 'Capteur', 'chambre', { manufacturer: 'X', model: 'Y' })],
    entities: [{ ...entity(CO2, { device: 'd_co2' }), device_class: 'carbon_dioxide' }],
    states: states(state(CO2, 1659, { friendly_name: 'Chambre CO2', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm', state_class: 'measurement' })),
  };
  setLoggiaState({ index: ctxOf(fx, {}).index, ent: {}, cfg: { loggia_rooms: [{ room: 'Chambre' }] }, resolved: null });
  try { return M.vueMesure({ states: fx.states }, id); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const oublier = () => F.retenirFigees({ figees: {} });

test('le verdict du serveur se retient ; une réponse sans verdict ne le défait pas, un verdict vide le vide', () => {
  const t = Math.round(Date.now() / 1000) - 7 * 3600;
  F.retenirFigees({ figees: { [CO2]: t, 'sensor.x': 'abime', 'sensor.y': -4 } });
  assert.equal(F.figeeDe(CO2), t * 1000, 'en ms');
  assert.equal(F.figeeDe('sensor.x'), null, 'un instant illisible ne vaut rien');
  assert.equal(F.figeeDe('sensor.y'), null);
  F.retenirFigees({ signales: [] });
  F.retenirFigees(null);
  assert.equal(F.figeeDe(CO2), t * 1000, 'une veille sans `figees` (un serveur d’avant) garde le dernier verdict');
  oublier();
  assert.equal(F.figeeDe(CO2), null);
});

test('les cartes qui écoutent sont prévenues quand le verdict CHANGE, pas à chaque relevé', () => {
  let n = 0;
  const fin = F.ecouterFigees(() => { n += 1; });
  F.retenirFigees({ figees: { [CO2]: 1000 } });
  F.retenirFigees({ figees: { [CO2]: 1000 } });
  assert.equal(n, 1, 'le même verdict toutes les 30 s ne redessine rien');
  oublier();
  assert.equal(n, 2);
  fin();
  F.retenirFigees({ figees: { [CO2]: 1000 } });
  assert.equal(n, 2, 'désabonnée, la carte n’est plus prévenue');
  oublier();
});

test('« Dernier relevé il y a 7 h », en jours au-delà de 48 h', () => {
  const t = Date.now();
  assert.equal(F.texteFigee(t - 7 * H - 10 * 60000, t), 'Dernier relevé il y a 7 h');
  assert.equal(F.texteFigee(t - 47 * H, t), 'Dernier relevé il y a 47 h');
  assert.equal(F.texteFigee(t - 50 * H, t), 'Dernier relevé il y a 2 j');
});

test('une mesure figée garde son chiffre, perd sa zone et sa teinte, et dit son dernier relevé', () => {
  const fraiche = vue();
  assert.ok(fraiche.zone && !fraiche.zone.bon && fraiche.barre, 'fraîche, 1 659 ppm se juge');
  F.retenirFigees({ figees: { [CO2]: Math.round((Date.now() - 7 * H - 60000) / 1000) } });
  try {
    const v = vue();
    assert.equal(v.phrase, 'Dernier relevé il y a 7 h');
    assert.equal(v.chiffre, fraiche.chiffre, 'le chiffre reste');
    assert.equal(v.zone, null, 'une valeur d’il y a 7 h ne se juge pas');
    assert.equal(v.barre, null);
    assert.equal(v.phraseCourte, null);
    assert.ok(v.figee > 0);
  } finally { oublier(); }
});

test('muette, elle reste « Indisponible » : le verdict de fraîcheur ne passe qu’après', () => {
  F.retenirFigees({ figees: { [CO2]: 1000 } });
  try {
    const fx = { states: { [CO2]: { entity_id: CO2, state: 'unavailable', attributes: { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' } } } };
    const v = M.vueMesure(fx, CO2);
    assert.equal(v.phrase, 'Indisponible');
    assert.equal(v.figee, null);
  } finally { oublier(); }
});

test('une plante au sol figé : son dernier relevé, et rien ne presse sur une valeur d’hier', () => {
  const pl = { base: 'sensor.ficus', name: 'Ficus', mort: false, hum: 10, lux: 84, temp: 19.5, cond: 784, uniteTemp: 'C',
    ids: { hum: 'sensor.ficus_sol', lux: 'sensor.ficus_lumiere' } };
  assert.equal(vuePlante(pl).ton, 'warn', 'fraîche, un sol à 10 % presse');
  F.retenirFigees({ figees: { 'sensor.ficus_sol': Math.round((Date.now() - 30 * H - 60000) / 1000) } });
  try {
    const v = vuePlante(pl);
    assert.equal(v.phrase, 'Dernier relevé il y a 30 h');
    assert.equal(v.ton, null);
    assert.equal(v.regarder, false, 'pas d’« à regarder » de plus : pas de bruit');
    assert.ok(v.mesures.every(m => !m.presse));
    assert.equal(v.sol, 10, 'le chiffre reste');
    assert.equal(vuePlante({ ...pl, mort: true, muetDepuis: null }).phrase, 'Indisponible', 'muette d’abord');
  } finally { oublier(); }
});

test('la racine relit le verdict avec le seuil des piles ; la carte et la plante s’y abonnent ; la fiche montre le relevé du serveur', () => {
  assert.ok(lire('src/cartes/groupe.jsx').includes('.then(r => { if (vivant) { retenirFigees(r); setSeuil(reglerSeuilPile(r).alerte); } })'));
  // Le même lecteur sert au rendu côté serveur (les tests, `renderToStaticMarkup`) : sans lui, React refuse.
  const abonnee = (p, lecteur) => { const s = lire(p); return s.includes('const lireFigee = () => ' + lecteur + ';') && s.includes('useSyncExternalStore(ecouterFigees, lireFigee, lireFigee);'); };
  assert.ok(abonnee('src/cartes/mesure.jsx', 'figeeDe(actif ? id : null)'));
  assert.ok(abonnee('src/cartes/plante.jsx', 'figeeDe(pl && pl.ids && pl.ids.hum)'));
  assert.ok(lire('src/fichecapteur.jsx').includes('const dernier = vue.figee || dernierSignal(S, [id, ...soeursDe(id)]);'));
  // L'écran ne juge pas lui-même : il ne lit que le verdict.
  assert.ok(!/last_reported/.test(lire('src/fraicheur.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'l’écran ne lit pas `last_reported`, qu’il ne reçoit pas');
});

test('la démo porte un capteur figé : la température de l’entrée, il y a 7 h', () => {
  const d = lire('src/demo.js');
  assert.ok(d.includes("figees: { 'sensor.entree_temperature': Math.round(Date.now() / 1000) - 7 * 3600 - 600 },"));
  assert.ok(d.includes("states['sensor.' + cle + '_temperature'] = s(t,") && d.includes("['entree', 'Entrée',"), 'le capteur existe dans la démo');
});

test('les deux mots sont dans les sept langues', async () => {
  for (const l of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const t = (await import('../src/langues/' + l + '.js')).default;
    for (const k of ['Dernier relevé il y a {n} h', 'Dernier relevé il y a {n} j']) assert.ok(t[k] && t[k].includes('{n}'), l + ' : ' + k);
  }
});
