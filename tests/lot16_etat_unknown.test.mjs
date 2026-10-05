/* Une scène jamais lancée n'est pas en panne (lot 16, défaut vu en passant,
 * 05/10).
 *
 * Dans Home Assistant, une scène, un `button`, un `input_button` ou un `event`
 * n'ont pas d'état propre : leur état est l'HORODATAGE de leur dernier
 * déclenchement. Jamais lancés, jamais pressés, jamais tirés, ils valent
 * `unknown` — c'est leur état NORMAL, et il peut durer toujours. `CvCard` les
 * peignait en panne : « Indisponible », liseré `o-panne`, carte à 55 %, et
 * PLUS de bouton « Activer ». Mesuré dans la démo (vue perso de trois cartes :
 * Cinéma, Nuit, « Aspirateur Réinitialiser le filtre », toutes à `unknown`) :
 * trois cartes mortes, aucun bouton. Chez l'utilisateur, toute scène jamais
 * lancée paraissait morte — et on ne pouvait plus la lancer.
 *
 * Une règle, une aide : `enPanne(id, st)` (outils.js). Pour ces domaines, seul
 * `unavailable` est une panne ; pour tous les autres, rien ne change — un
 * capteur `unknown` reste « Indisponible ». devices.js et health.js faisaient
 * déjà la distinction pour l'appareil et le diagnostic ; robots.js pour le
 * bouton de remise à zéro d'un robot.
 *
 * On REND la carte (React côté serveur, ADR 0069) : un crochet de chargement
 * ajoute à App.jsx, pour CE test seul, l'export de `CvCard` sous `?l16unk` —
 * le fichier n'est pas touché. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?l16unk')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -7), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CvCard as __CvCard };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const { __CvCard: CvCard } = await import(new URL('../src/App.jsx?l16unk', import.meta.url).href);
const outils = () => import('../src/outils.js');

const etat = (id, state, nom) => ({ entity_id: id, state, last_changed: '2026-10-05T08:00:00Z', attributes: { friendly_name: nom } });
const carte = (st, dense) => renderToStaticMarkup(createElement(CvCard, {
  id: st.entity_id, hass: { states: { [st.entity_id]: st }, callService: () => {} }, onOpen: () => {}, dense,
}));
const enPanneRendu = (html) => /class="o-piece[^"]*\bo-panne\b/.test(html);

/* Les domaines sans état, chacun avec le geste que la carte doit garder. */
const SANS_ETAT = [
  ['scene.cinema', 'Cinéma', 'Activer'],
  ['button.filtre', 'Réinitialiser le filtre', 'Appuyer'],
  ['input_button.sonnette', 'Sonnette', 'Appuyer'],
];

test('enPanne : sans état, seul « unavailable » est une panne', async () => {
  const { enPanne } = await outils();
  assert.equal(typeof enPanne, 'function', 'outils.js doit exporter enPanne');
  for (const id of ['scene.a', 'button.a', 'input_button.a', 'event.a']) {
    assert.equal(enPanne(id, { state: 'unknown' }), false, id + ' à « unknown » : jamais déclenché, pas en panne');
    assert.equal(enPanne(id, { state: '2026-10-05T08:00:00+00:00' }), false, id + ' déclenché');
    assert.equal(enPanne(id, { state: 'unavailable' }), true, id + ' à « unavailable » : en panne');
    assert.equal(enPanne(id, null), true, id + ' absent : en panne');
  }
});

test('enPanne : les autres domaines ne changent pas', async () => {
  const { enPanne } = await outils();
  // Mêmes réponses que l'ancienne règle de CvCard, domaine par domaine.
  const ancienne = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';
  for (const id of ['sensor.t', 'binary_sensor.p', 'light.l', 'switch.s', 'cover.v', 'climate.c', 'script.s', 'automation.a', 'media_player.m', 'lock.s']) {
    for (const st of [null, { state: 'unknown' }, { state: 'unavailable' }, { state: 'on' }, { state: 'off' }, { state: '21.5' }, { state: null }]) {
      assert.equal(enPanne(id, st), ancienne(st), id + ' ' + JSON.stringify(st));
    }
  }
});

test('carte : une scène, un bouton jamais déclenchés gardent leur geste', () => {
  for (const [id, nom, geste] of SANS_ETAT) {
    for (const dense of [true, false]) {
      const html = carte(etat(id, 'unknown', nom), dense);
      const ou = id + (dense ? ' (compacte)' : ' (standard)');
      assert.ok(!html.includes('Indisponible'), ou + ' ne doit pas dire « Indisponible »');
      assert.ok(!enPanneRendu(html), ou + ' ne doit pas porter le liseré de panne');
      assert.ok(html.includes('>—<') && !/>unknown</.test(html), ou + ' dit « — », pas « unknown »');
      assert.ok(html.includes('aria-label="' + geste + ' ' + nom + '"'), ou + ' doit garder son bouton « ' + geste + ' »');
    }
  }
});

test('carte : la même scène « unavailable » reste en panne, sans bouton', () => {
  for (const [id, nom, geste] of SANS_ETAT) {
    const html = carte(etat(id, 'unavailable', nom), true);
    assert.ok(html.includes('Indisponible'), id);
    assert.ok(enPanneRendu(html), id + ' : liseré de panne');
    assert.ok(!html.includes('aria-label="' + geste + ' ' + nom + '"'), id + ' : pas de geste vers une entité morte');
  }
});

test('carte : un capteur « unknown » reste ce qu’il était (témoin)', () => {
  const html = carte(etat('sensor.co2', 'unknown', 'CO2'), true);
  assert.ok(html.includes('Indisponible'));
  assert.ok(enPanneRendu(html));
});

/* Un `event` n'a pas de geste : sorti de la panne, il tombait dans la branche
 * `String(s)` et la carte écrivait « unknown » — le mot anglais de Home
 * Assistant, sous le nom (relecture du contradicteur, 05/10). Il dit « — »,
 * comme une scène jamais lancée ; tiré, sa date relative. */
test('carte : un événement jamais tiré dit « — », jamais « unknown »', () => {
  for (const dense of [true, false]) {
    const html = carte(etat('event.sonnette', 'unknown', 'Sonnette'), dense);
    assert.ok(!html.includes('Indisponible') && !enPanneRendu(html), 'pas en panne');
    assert.ok(!/>unknown</.test(html), 'pas de « unknown » en clair');
    assert.ok(html.includes('>—<'), 'le tiret');
  }
  const tire = carte(etat('event.sonnette', new Date().toISOString(), 'Sonnette'), true);
  assert.ok(tire.includes('l&#x27;instant'), 'tiré : « À l’instant »');
});

test('découverte : une scène jamais lancée ne compte pas parmi les indisponibles', async () => {
  const { capabilities } = await import('../src/discovery.js');
  const states = {
    'scene.cinema': { state: 'unknown' }, 'button.filtre': { state: 'unknown' }, 'event.sonnette': { state: 'unknown' },
    'scene.morte': { state: 'unavailable' }, 'sensor.co2': { state: 'unknown' }, 'light.salon': { state: 'on' },
  };
  assert.equal(capabilities({ states }).totals.unavailable, 2, 'scene.morte et sensor.co2 seulement');
});

test('une seule règle : CvCard, Objets et la découverte passent par enPanne', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const disc = readFileSync(new URL('../src/discovery.js', import.meta.url), 'utf8');
  // `assert.ok` et non `assert.match` : un échec recopierait tout App.jsx.
  assert.ok(/^import \{[^}]*\benPanne\b[^}]*\} from '\.\/outils\.js';$/m.test(app), 'App.jsx prend enPanne à outils.js');
  assert.ok(/^import \{[^}]*\benPanne\b[^}]*\} from '\.\/outils\.js';$/m.test(disc), 'discovery.js prend enPanne à outils.js');
  const i = app.indexOf('\nfunction CvCard(');
  const cv = app.slice(i, app.indexOf('\nfunction ', i + 1));
  assert.ok(/const dead = enPanne\(id, st\);/.test(cv), 'CvCard : dead = enPanne(id, st)');
  assert.ok(!/=== 'unknown'/.test(cv), 'plus de « unknown » en dur dans CvCard');
  assert.ok(/absent: type === 'entite' \? enPanne\(o\.id, st\) : false,/.test(app), 'Objets : « entités absentes »');
});
