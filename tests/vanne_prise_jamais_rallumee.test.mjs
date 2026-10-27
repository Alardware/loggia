/* TEST AJOUTÉ (passe bis de l'étape 3 IoT, 25/10 ; relectures, point 9) — la prise désignée comme vanne d'eau (Paramètres ›
 * Alertes, « Quelle vanne ») ne se rallume JAMAIS d'un appui.
 *
 * Elle a sa carte de vanne, qui demande avant de rouvrir. Mais d'autres chemins menaient à `turn_on` d'un appui : la recherche
 * (« Basculer »), la fiche de la prise qu'elle ouvre, une ligne de la fiche universelle (une entité sœur), l'ancienne carte « gros
 * interrupteur » d'une vue personnelle, et toute carte posée avant que la configuration soit lue (elle se dessinait en prise). La
 * garde vit donc au moment de l'ORDRE, une fois, dans le moteur des commandes (`actions.js`) : `turn_on` sur la vanne désignée ne
 * part pas ; l'écran ouvre la popup de la vanne sur sa question (`surVanne` : l'en-tête de chaque vue s'y inscrit, App.jsx).
 * Fermer part toujours : le sens sûr. On JOUE le moteur sur un faux Home Assistant. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { setLoggiaState } = await import('../src/state.js');
const A = await import('../src/actions.js');
const ouvertes = [];
A.surVanne((id) => ouvertes.push(id));

const PRISE = 'switch.prise_arrivee';
function maison() {
  const appels = [];
  const hass = {
    states: { [PRISE]: { state: 'off', attributes: { friendly_name: 'Prise de l’arrivée' } }, 'switch.lampe': { state: 'off', attributes: {} } },
    services: { switch: { turn_on: {}, turn_off: {} }, homeassistant: { turn_on: {}, turn_off: {} } },
    callService: (d, s, data) => { appels.push(d + '.' + s + ' ' + [].concat((data && data.entity_id) || []).join(',')); return Promise.resolve(); },
  };
  return { hass, appels };
}
const laisser = () => new Promise((r) => setTimeout(r, 20));
const designer = (entite) => setLoggiaState({ cfg: { loggia_alertes: { actions: { vanne: { actif: true, entite } } } }, server: true });

test('point 9 : `turn_on` sur la prise-vanne ne part pas — ni par `commanderService`, ni par `commander` ; la popup demande', async () => {
  designer(PRISE);
  ouvertes.length = 0;
  const { hass, appels } = maison();
  assert.equal(A.commanderService(hass, PRISE, 'homeassistant', 'turn_on', { entity_id: PRISE }), null, 'la fiche de la prise, une ligne de la fiche universelle');
  assert.equal(A.commanderService(hass, PRISE, 'switch', 'turn_on', { entity_id: PRISE }), null);
  assert.ok(A.commander(hass, PRISE, 'turn_on') == null, 'la recherche, le gros interrupteur (ses appelants lisent `!= null`)');
  await laisser();
  assert.deepEqual(appels, [], 'rien ne part');
  assert.deepEqual(ouvertes, [PRISE, PRISE, PRISE], 'l’écran ouvre la popup sur sa question');
  // Fermer part toujours, et une autre prise s'allume comme avant.
  A.commanderService(hass, PRISE, 'homeassistant', 'turn_off', { entity_id: PRISE });
  A.commanderService(hass, 'switch.lampe', 'homeassistant', 'turn_on', { entity_id: 'switch.lampe' });
  await laisser();
  assert.equal(appels.length, 2);
  assert.ok(appels.every(a => !(a.indexOf('turn_on') >= 0 && a.indexOf(PRISE) >= 0)));
  // La garde se lit au moment de l'appui : une prise retirée de « Quelle vanne » redevient une prise.
  designer('');
  A.commander(hass, PRISE, 'turn_on');
  await laisser();
  assert.equal(appels.length, 3, 'plus désignée : elle s’allume');
  setLoggiaState({ cfg: {}, server: false });
});

test('point 9 : l’en-tête de chaque vue s’inscrit, et ouvre la popup de la vanne SUR sa question — la recherche aussi', () => {
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  // Monté, il s'inscrit ; démonté, il se retire (passe bis 2 : tests/vanne_garde_trous.test.mjs).
  assert.ok(APP.includes('useEffect(() => surVanne(setFichePrise), []);'), 'l’en-tête s’inscrit');
  // La fiche d'une prise-vanne montre la popup de la vanne, sur sa question (ficheprise.jsx, après ses crochets).
  const PRISEF = readFileSync(new URL('../src/ficheprise.jsx', import.meta.url), 'utf8');
  assert.ok(PRISEF.includes('if (estVanneCarte(id)) return <VanneDansPrise id={id} hass={hass} epingle={epingle} onFiche={onFiche} question />;'),
    'la popup de la vanne, sur sa question — jamais la fiche de prise d’une vanne');
  assert.ok(PRISEF.indexOf('if (estVanneCarte(id)) return') > PRISEF.lastIndexOf('useEffect('), 'après les crochets de la prise');
  // Chaque vue a son en-tête : la popup s'ouvre d'où que vienne l'appui.
  for (const vue of ['RoomView', 'ObjetsView', 'Dashboard', 'CustomView', 'SecuriteView', 'EnergieView']) {
    const debut = APP.indexOf('function ' + vue + '(');
    assert.ok(debut >= 0 && APP.indexOf('<Header />', debut) > debut, vue);
  }
  // La carte « gros interrupteur » ne se pose plus sur une vanne : la carte de la vanne prend sa place.
  assert.ok(APP.includes("if (t === 'gros' && !estVanneCarte(id)) return <CvBigToggle"), 'le gros interrupteur cède à la carte de la vanne');
  const FICHE = readFileSync(new URL('../src/fichevanne.jsx', import.meta.url), 'utf8');
  assert.ok(FICHE.includes('useState(() => prendreQuestion(id) || question)'), 'la popup s’ouvre sur la question qu’on lui passe');
});
