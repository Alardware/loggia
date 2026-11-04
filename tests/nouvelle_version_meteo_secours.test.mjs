// ─────────────────────────────────────────────────────────────────────────────
// Deux idées reprises de HomeDeck (03/11) : prévenir qu'une nouvelle version
// est installée, et une météo de secours qui ne sort pas de la maison.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en est sorti (ADR 0282)

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const V = await import('../src/nouvelleversion.jsx');
const { setLoggiaState } = await import('../src/state.js');
const { weatherEntity } = await import('../src/wxutil.jsx');
const { temperatureDehors } = await import('../src/meteosecours.js');

test('le boot se lit dans index.html, et seul un AUTRE boot dit une nouvelle version', async () => {
  const page = '<link rel="modulepreload" crossorigin href="./assets/boot-BC1ZS3uy.js">';
  assert.equal(V.bootDe(page), 'boot-BC1ZS3uy.js');
  assert.equal(V.bootDe('<html></html>'), null);
  const doc = { querySelector: (s) => (/boot-/.test(s) ? { getAttribute: (a) => (a === 'href' ? './assets/boot-AAA.js' : null) } : null) };
  assert.equal(V.bootCharge(doc), 'boot-AAA.js');
  assert.equal(V.autreVersion('boot-AAA.js', 'boot-BBB.js'), true);
  assert.equal(V.autreVersion('boot-AAA.js', 'boot-AAA.js'), false);
  assert.equal(V.autreVersion('boot-AAA.js', null), false, 'une lecture ratée n’annonce rien');
  assert.equal(V.autreVersion(null, 'boot-BBB.js'), false, 'sans boot connu (développement), rien');
  // index.html relu SANS cache, à côté de la page.
  const appels = [];
  const servi = await V.bootServi(async (u, o) => { appels.push([u, o]); return { ok: true, text: async () => page }; });
  assert.equal(servi, 'boot-BC1ZS3uy.js');
  assert.deepEqual(appels, [['./index.html', { cache: 'no-store' }]]);
  assert.equal(await V.bootServi(async () => { throw new Error('hors ligne'); }), null);
  assert.equal(await V.bootServi(async () => ({ ok: false })), null);
});

test('la pastille vit dans App, après le bandeau de connexion perdue', () => {
  const app = MONOLITHE;
  assert.ok(app.includes("import { NouvelleVersion } from './nouvelleversion.jsx';"));
  const perdue = app.indexOf('{haLost && <div role="alert"');
  const pastille = app.indexOf('<NouvelleVersion />');
  assert.ok(perdue > 0 && pastille > perdue, 'la pastille manque ou est mal placée');
});

test('une entité météo en panne passe la main à une autre qui répond', () => {
  const st = (state) => ({ state, attributes: {} });
  setLoggiaState({ ent: { weather: 'weather.choisie' }, resolved: { weather: { available: true, main: 'weather.trouvee' } } });
  assert.equal(weatherEntity({ states: { 'weather.choisie': st('sunny'), 'weather.trouvee': st('rainy') } }), 'weather.choisie', 'celle choisie, quand elle répond');
  assert.equal(weatherEntity({ states: { 'weather.choisie': st('unavailable'), 'weather.trouvee': st('rainy') } }), 'weather.trouvee');
  assert.equal(weatherEntity({ states: { 'weather.choisie': st('unavailable'), 'weather.trouvee': st('unknown'), 'weather.autre': st('cloudy') } }), 'weather.autre');
  assert.equal(weatherEntity({ states: { 'weather.choisie': st('unavailable'), 'weather.trouvee': st('unavailable') } }), 'weather.choisie', 'toutes en panne : celle choisie, qui le dira');
});

test('sans température de la météo, la sonde d’une pièce du dehors', () => {
  setLoggiaState({ cfg: {} });
  const S = { 'sensor.salon_t': { state: '21.4' }, 'sensor.jardin_t': { state: '12.6' }, 'sensor.terrasse_t': { state: 'unavailable' } };
  const rooms = [
    { room: 'Salon', haid: { temp: 'sensor.salon_t' } },
    { room: 'Terrasse', haid: { temp: 'sensor.terrasse_t' } },
    { room: 'Jardin', haid: { temp: 'sensor.jardin_t' } },
  ];
  assert.equal(temperatureDehors(rooms, S), 12.6, 'la première pièce du dehors qui répond — jamais le salon');
  assert.equal(temperatureDehors([{ room: 'Salon', haid: { temp: 'sensor.salon_t' } }], S), null, 'sans pièce du dehors, rien d’inventé');
  // Le secours ne sert que si la météo se tait.
  const H = lire('src/app/hooks.jsx');
  assert.ok(H.includes('const temperatureMeteo = wEnt && wEnt.attributes ? lireNombre(wEnt.attributes.temperature) : null;'));
  assert.ok(H.includes('const weatherTemp = temperatureMeteo != null ? temperatureMeteo : temperatureDehors(rooms, hass && hass.states);'));
  // Rien ne sort de la maison : aucun service en ligne dans ce qui a été ajouté.
  for (const f of ['src/meteosecours.js', 'src/nouvelleversion.jsx']) assert.ok(!/open-meteo|https?:\/\//i.test(lire(f)), f + ' : un appel au dehors');
});
