/* TEST AJOUTÉ (passe bis 2 de l'étape 3 IoT, 25/10 ; relecture de contrôle, sonde `garde.mjs`) — les trous de la garde de l'écran.
 *
 * La règle : la maison ne ROUVRE jamais l'eau seule ; rouvrir, c'est une personne, depuis la popup de la vanne, après la question.
 * La garde de `actions.js` ne voyait que `turn_on` sur UNE entité : un ordre groupé (le bouton des lumières d'une pièce), `toggle`,
 * et la route directe de `commanderService` (un champ de plus) rallumaient la prise désignée. L'appui retenu ne disait rien à
 * l'appelant (`surEchec`), ni rien du tout sans en-tête monté. On JOUE le moteur sur un faux Home Assistant : chaque cas de la sonde
 * n'envoie plus rien vers la vanne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
// Le stockage local de l'écran : la copie de `loggia_alertes` que `cfgSet` y laisse (state.js).
const LS = new Map();
globalThis.window = { localStorage: { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) } };
const { setLoggiaState } = await import('../src/state.js');
const A = await import('../src/actions.js');
const { texteRefus } = await import('../src/refus.js');

const PRISE = 'switch.prise_arrivee';
const ALERTES = { actions: { vanne: { actif: true, entite: PRISE } } };
/* Le canal du toast global : un rejet que personne ne reprend. Le lanceur de tests en ferait un échec ; on le recueille, repris. */
const rejets = [];
const rejeter = Promise.reject.bind(Promise);
Promise.reject = (e) => { rejets.push(e); const p = rejeter(e); p.catch(() => {}); return p; };

function maison() {
  const appels = [];
  const hass = {
    states: { [PRISE]: { state: 'off', attributes: {} }, 'switch.lampe': { state: 'off', attributes: {} }, 'valve.arrivee': { state: 'closed', attributes: { device_class: 'water' } } },
    services: { switch: { turn_on: {}, turn_off: {}, toggle: {} }, homeassistant: { turn_on: {}, turn_off: {}, toggle: {} }, valve: { open_valve: {}, close_valve: {} } },
    // La cible : dans `target` (le moteur vérifié), ou dans la charge (la route directe).
    callService: (d, s, data, t) => { appels.push(d + '.' + s + ' ' + [].concat((t && t.entity_id) || (data && data.entity_id) || []).join(',')); return Promise.resolve(); },
  };
  return { hass, appels };
}
const laisser = () => new Promise((r) => setTimeout(r, 20));
const versLaVanne = (appels) => appels.filter(a => a.indexOf(PRISE) >= 0 && !/turn_off/.test(a));

test('un ordre GROUPÉ perd la prise-vanne et part pour les autres ; la popup demande', async () => {
  setLoggiaState({ cfg: { loggia_alertes: ALERTES }, server: true });
  const ouvertes = [];
  const quitter = A.surVanne((id) => ouvertes.push(id));
  const { hass, appels } = maison();
  // Le bouton des lumières d'une pièce (App.jsx) : `commanderService(dashHass, ids, 'homeassistant', 'turn_on', { entity_id: ids })`.
  A.commanderService(hass, [PRISE, 'switch.lampe'], 'homeassistant', 'turn_on', { entity_id: [PRISE, 'switch.lampe'] });
  assert.equal(A.commanderService(hass, [PRISE], 'homeassistant', 'turn_on', { entity_id: [PRISE] }), null, 'la vanne seule : rien ne part');
  await laisser();
  assert.deepEqual(appels, ['switch.turn_on switch.lampe'], 'la lampe s’allume, la vanne non');
  assert.deepEqual(ouvertes, [PRISE, PRISE]);
  quitter();
});

test('`toggle`, `open`, et la route directe avec un champ de plus ne partent pas ; le rappel `surEchec` tombe', async () => {
  setLoggiaState({ cfg: { loggia_alertes: ALERTES }, server: true });
  const ouvertes = [];
  const quitter = A.surVanne((id) => ouvertes.push(id));
  const { hass, appels } = maison();
  const echecs = [];
  assert.ok(A.commander(hass, PRISE, 'toggle', undefined, null, null, (m) => echecs.push(m)) == null, 'toggle');
  assert.equal(A.commanderService(hass, PRISE, 'switch', 'turn_on', { entity_id: PRISE, foo: 1 }, (m) => echecs.push(m)), null, 'un champ de plus');
  assert.equal(A.commanderService(hass, PRISE, 'switch', 'toggle', { entity_id: PRISE }, (m) => echecs.push(m)), null);
  assert.ok(A.commander(hass, 'valve.arrivee', 'open') == null, 'une vanne ne s’ouvre que de sa popup');
  assert.equal(A.commanderService(hass, null, 'valve', 'open_valve', { entity_id: 'valve.arrivee' }), null, 'route directe, sans id');
  await laisser();
  assert.deepEqual(appels, [], 'rien ne part');
  assert.equal(echecs.length, 3, 'l’appelant l’apprend : la bascule ne reste pas « allumée »');
  assert.deepEqual(ouvertes, [PRISE, PRISE, PRISE, 'valve.arrivee', 'valve.arrivee']);
  // Fermer part toujours — y compris en groupe, et par la route directe.
  A.commanderService(hass, [PRISE, 'switch.lampe'], 'homeassistant', 'turn_off', { entity_id: [PRISE, 'switch.lampe'] });
  A.commanderService(hass, PRISE, 'switch', 'turn_off', { entity_id: PRISE, foo: 1 });
  A.commanderService(hass, null, 'valve', 'close_valve', { entity_id: 'valve.arrivee' });
  await laisser();
  assert.equal(appels.length, 3, appels.join(' | '));
  // Une commande sans entité n'est pas une vanne.
  A.commanderService(hass, null, 'scene', 'turn_on', {});
  await laisser();
  assert.equal(appels.length, 4);
  quitter();
});

test('sans en-tête monté, l’appui retenu dit pourquoi (le toast `eau_seule`) au lieu de ne rien faire', async () => {
  setLoggiaState({ cfg: { loggia_alertes: ALERTES }, server: true });
  const ouvertes = [];
  const quitter = A.surVanne((id) => ouvertes.push(id));
  quitter();
  rejets.length = 0;
  const { hass, appels } = maison();
  A.commander(hass, PRISE, 'turn_on');
  await laisser();
  assert.deepEqual(appels, []);
  assert.deepEqual(ouvertes, [], 'l’en-tête parti ne reçoit plus rien');
  assert.equal(rejets.length, 1);
  assert.equal(rejets[0].code, 'eau_seule');
  assert.equal(texteRefus(rejets[0]), 'Loggia ne rouvre jamais l’eau seule', 'le toast global le dit par son code (refus.js)');
  // Un en-tête qui part ne retire pas celui qui l'a remplacé.
  const a = A.surVanne(() => ouvertes.push('a'));
  A.surVanne(() => ouvertes.push('b'));
  a();
  A.commander(hass, PRISE, 'turn_on');
  assert.deepEqual(ouvertes, ['b']);
});

test('avant la configuration lue, la copie locale de `loggia_alertes` garde ; sans elle, le trou est connu (ADR 0217)', async () => {
  const ouvertes = [];
  const quitter = A.surVanne((id) => ouvertes.push(id));
  const { hass, appels } = maison();
  LS.set('loggia_alertes', JSON.stringify(ALERTES));
  setLoggiaState({ cfg: {}, server: false });
  A.commander(hass, PRISE, 'turn_on');
  await laisser();
  assert.deepEqual(versLaVanne(appels), [], 'la copie locale suffit');
  assert.deepEqual(ouvertes, [PRISE]);
  // Sans copie locale, la toute première seconde reste un trou : le serveur garde (regles.py).
  LS.delete('loggia_alertes');
  A.commander(hass, PRISE, 'turn_on');
  await laisser();
  assert.equal(versLaVanne(appels).length, 1, 'le trou documenté — une `valve` reste gardée, elle');
  A.commander(hass, 'valve.arrivee', 'open');
  await laisser();
  assert.equal(appels.length, 1);
  quitter();
  setLoggiaState({ cfg: {}, server: false });
});

test('la bascule de la fiche universelle retire son avance sur un refus ; l’en-tête se retire en partant', () => {
  const FC = readFileSync(new URL('../src/fichecommune.jsx', import.meta.url), 'utf8');
  assert.ok(FC.includes("commanderService(hass, r.id, dom, on ? 'turn_off' : 'turn_on', { entity_id: r.id }, () => poser(null))"),
    'le rappel `surEchec` défait la bascule');
  const APP = MONOLITHE;
  assert.ok(APP.includes('useEffect(() => surVanne(setFichePrise), []);'), 'monté il s’inscrit, démonté il se retire');
  assert.ok(!/^\s*surVanne\(setFichePrise\);/m.test(APP), 'plus d’inscription pendant le rendu');
});
