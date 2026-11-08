// ─────────────────────────────────────────────────────────────────────────────
// « Annuler » cinq secondes après un geste groupé (06/11, étape 7 du rapport sur l'usage).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONOLITHE } from './monolithe.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
// `getHass` lit l'élément `home-assistant` du document ; l'événement part sur `window`.
let HASS = null;
const ecoutes = [];
globalThis.window = { top: undefined, dispatchEvent: (e) => { ecoutes.forEach(f => f(e)); return true; } };
globalThis.document = { querySelector: () => (HASS ? { hass: HASS } : null) };
const A = await import('../src/annuler.js');
const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

const lampe = (state, a = {}) => ({ state, attributes: a });
const volet = (state, pos) => ({ state, attributes: pos == null ? {} : { current_position: pos } });

test('la photo ne garde que lumières, interrupteurs, ventilateurs, volets et thermostats joignables', () => {
  const p = A.photographier({
    'light.a': lampe('on', { brightness: 120, color_mode: 'color_temp', color_temp_kelvin: 2700 }),
    'switch.b': lampe('off'), 'fan.c': lampe('on'), 'cover.d': volet('open', 80),
    'climate.e': lampe('heat', { temperature: 20, preset_mode: 'comfort' }),
    'alarm_control_panel.f': lampe('armed_away'), 'lock.g': lampe('locked'), 'media_player.h': lampe('playing'),
    'light.muette': lampe('unavailable'),
  });
  assert.deepEqual(Object.keys(p).sort(), ['climate.e', 'cover.d', 'fan.c', 'light.a', 'switch.b']);
  assert.equal(p['light.a'].bri, 120);
  assert.equal(p['light.a'].kelvin, 2700);
  assert.equal(p['cover.d'].pos, 80);
  assert.equal(p['climate.e'].consigne, 20);
  assert.deepEqual(A.photographier(null), {});
});

test('rien n’a changé : aucun ordre de retour', () => {
  const S = { 'light.a': lampe('on', { brightness: 120, color_mode: 'color_temp', color_temp_kelvin: 2700 }), 'cover.d': volet('closed', 0) };
  assert.deepEqual(A.retoursDe(A.photographier(S), S), []);
});

test('une lampe éteinte par le geste se rallume à son niveau et son blanc', () => {
  const avant = { 'light.a': lampe('on', { brightness: 120, color_mode: 'color_temp', color_temp_kelvin: 2700 }) };
  const r = A.retoursDe(A.photographier(avant), { 'light.a': lampe('off') });
  assert.deepEqual(r, [{ id: 'light.a', domaine: 'light', service: 'turn_on', data: { entity_id: 'light.a', brightness: 120, color_temp_kelvin: 2700 } }]);
});

test('une lampe en couleur revient à sa couleur ; une lampe allumée par le geste s’éteint', () => {
  const avant = { 'light.c': lampe('on', { brightness: 200, color_mode: 'xy', xy_color: [0.4, 0.3] }), 'light.d': lampe('off') };
  const apres = { 'light.c': lampe('on', { brightness: 200, color_mode: 'color_temp', color_temp_kelvin: 4000, xy_color: [0.3, 0.3] }), 'light.d': lampe('on', { brightness: 255 }) };
  const r = A.retoursDe(A.photographier(avant), apres);
  assert.deepEqual(r.find(o => o.id === 'light.c').data, { entity_id: 'light.c', brightness: 200, xy_color: [0.4, 0.3] });
  assert.deepEqual(r.find(o => o.id === 'light.d'), { id: 'light.d', domaine: 'light', service: 'turn_off', data: { entity_id: 'light.d' } });
});

test('une lampe qui ne publie que sa teinte ou son RVB retrouve sa couleur, même passée en blanc', () => {
  // La lampe du salon de la démo : mode « rgb », `rgb_color` et `hs_color`, pas de `xy_color` (06/11).
  const avant = { 'light.s': lampe('on', { brightness: 180, color_mode: 'rgb', rgb_color: [255, 176, 92], hs_color: [31, 64] }) };
  const r = A.retoursDe(A.photographier(avant), { 'light.s': lampe('on', { brightness: 180, color_mode: 'color_temp', color_temp_kelvin: 2700 }) });
  assert.deepEqual(r, [{ id: 'light.s', domaine: 'light', service: 'turn_on', data: { entity_id: 'light.s', brightness: 180, hs_color: [31, 64] } }]);
  const q = A.photographier({ 'light.r': lampe('on', { brightness: 90, color_mode: 'rgb', rgb_color: [10, 20, 30] }) });
  assert.deepEqual(A.retoursDe(q, { 'light.r': lampe('on', { brightness: 90, color_mode: 'rgb', rgb_color: [200, 20, 30] }) })[0].data.rgb_color, [10, 20, 30]);
});

test('un volet revient à sa position, même s’il roule encore', () => {
  const p = A.photographier({ 'cover.v': volet('open', 70) });
  assert.deepEqual(A.retoursDe(p, { 'cover.v': volet('closing', 69) }),
    [{ id: 'cover.v', domaine: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.v', position: 70 }, cible: 70 }]);
  assert.deepEqual(A.retoursDe(p, { 'cover.v': volet('open', 70) }), []);
  // Un volet dont la position ne suit pas (« closed @100 ») : ouvrir, pas une position qu'il croit atteinte (démo, 06/11).
  const s = A.photographier({ 'cover.x': volet('open', 100) });
  assert.deepEqual(A.retoursDe(s, { 'cover.x': volet('closed', 100) }), [{ id: 'cover.x', domaine: 'cover', service: 'open_cover', data: { entity_id: 'cover.x' }, cible: 100 }]);
  // Sans position connue : ouvert / fermé seulement.
  const q = A.photographier({ 'cover.w': volet('closed') });
  assert.deepEqual(A.retoursDe(q, { 'cover.w': volet('open') }), [{ id: 'cover.w', domaine: 'cover', service: 'close_cover', data: { entity_id: 'cover.w' }, cible: 0 }]);
});

test('un thermostat retrouve son mode et son préréglage, ou sa consigne', () => {
  const p = A.photographier({ 'climate.t': lampe('heat', { temperature: 20, preset_mode: 'comfort' }), 'climate.u': lampe('heat', { temperature: 19 }) });
  const r = A.retoursDe(p, { 'climate.t': lampe('off', { temperature: 16, preset_mode: 'eco' }), 'climate.u': lampe('heat', { temperature: 17 }) });
  assert.deepEqual(r.map(o => o.id + ' ' + o.service), ['climate.t set_hvac_mode', 'climate.t set_preset_mode', 'climate.u set_temperature']);
});

test('un interrupteur ou un ventilateur revient ; un appareil devenu injoignable est laissé', () => {
  const p = A.photographier({ 'switch.s': lampe('on'), 'fan.f': lampe('off'), 'light.l': lampe('on', { brightness: 10 }) });
  const r = A.retoursDe(p, { 'switch.s': lampe('off'), 'fan.f': lampe('on'), 'light.l': lampe('unavailable') });
  assert.deepEqual(r.map(o => o.id + ' ' + o.service), ['switch.s turn_on', 'fan.f turn_off']);
});

test('annulable : la photo AVANT le geste, le bandeau APRÈS, le résultat rendu tel quel', async () => {
  const recus = [];
  ecoutes.push((e) => recus.push(e));
  HASS = { states: { 'light.a': lampe('on', { brightness: 50 }) } };
  const r = A.annulable('Lumières éteintes', () => { HASS = { states: { 'light.a': lampe('off') } }; return 7; });
  assert.equal(r, 7);
  assert.equal(recus.length, 1);
  assert.equal(recus[0].type, A.EVENEMENT_ANNULABLE);
  assert.equal(recus[0].detail.texte, 'Lumières éteintes');
  assert.equal(recus[0].detail.photo['light.a'].etat, 'on');
  // Une promesse : le bandeau attend la réponse ; un refus ne l'affiche pas et remonte.
  const v = await A.annulable('Scénario', () => Promise.resolve('fait'));
  assert.equal(v, 'fait');
  assert.equal(recus.length, 2);
  await assert.rejects(A.annulable('Refusé', () => Promise.reject(new Error('non'))), /non/);
  assert.equal(recus.length, 2);
  ecoutes.length = 0;
  HASS = null;
});

test('un geste qui sait se défaire passe sa fonction : pas de photo, Annuler l’appelle', () => {
  const recus = [];
  ecoutes.push((e) => recus.push(e));
  let defait = 0;
  A.annulable('Mode de la maison changé', () => null, () => { defait++; });
  assert.equal(recus[0].detail.photo, null);
  assert.equal(A.defaireAnnulable(recus[0].detail), 1);
  assert.equal(defait, 1);
  // Les cartes lâchent l'optimiste du geste annulé : un Annuler plus rapide que le relevé suivant ne les laisse pas 6 s à tort.
  assert.equal(recus[1].type, 'loggia:oublier-optimistes');
  assert.deepEqual(recus[1].detail, { photo: null });
  // La tuile d'une pièce montre la photo d'avant tout de suite (le relevé de l'Accueil suit à 2 s).
  const tuile = src('accueil/briques.jsx');
  assert.match(tuile, /window\.addEventListener\(OUBLIER_OPTIMISTES, surAnnule\);/);
  assert.match(tuile, /setOv\(ls\.some\(l => \(photo\[l\.id\] \? photo\[l\.id\]\.etat === 'on' : l\.on\)\)\);/);
  const opt = src('optimiste.js');
  assert.match(opt, /export const OUBLIER_OPTIMISTES = 'loggia:oublier-optimistes';/);
  assert.match(opt, /window\.addEventListener\(OUBLIER_OPTIMISTES, oublier\);/);
  assert.equal(A.defaireAnnulable(null), 0);
  ecoutes.length = 0;
});

test('le bandeau est monté une fois, à la racine, et dure cinq secondes', () => {
  assert.equal(A.DUREE_ANNULER_MS, 5000);
  assert.equal((MONOLITHE.match(/<BandeauAnnuler \/>/g) || []).length, 1);
  const b = src('chrome/bandeauannuler.jsx');
  assert.match(b, /EVENEMENT_ANNULABLE/);
  assert.match(b, /defaireAnnulable\(geste\)/);
  assert.match(b, /tr\('Annuler'\)/);
});

test('chaque geste groupé passe par annulable', () => {
  const branches = {
    'app/scenarios.jsx': /annulable\(tr\('\{nom\} lancé'/,
    'accueil/dashboard.jsx': /annulable\(svc === 'turn_off'/,
    'entetelumieres.jsx': /annulable\(tr\('Lumières éteintes'\), \(\) => toutEteindre/,
    'entetevolets.jsx': /annulable\(capacite === 'open'/,
    'views/voletsplan.jsx': /const allOpen = \(\) => annulable\(/,
    'scenes.jsx': /const allOff = \(\) => annulable\(/,
    'accueil/actionsmoment.jsx': /if \(a\.volets\) annulable\(/,
    'barremaison.jsx': /annulable\(tr\('Mode de la maison changé'\), [^\n]*, defaire\)/,
    'cartescustom/cartes.jsx': /annulable\(tr\('\{nom\} lancé', \{ nom: name \}\)/,
    'appareils/fiches.jsx': /annulable\(tr\('\{nom\} lancé', \{ nom: label \}\)/,
  };
  for (const [f, re] of Object.entries(branches)) assert.match(src(f), re, f);
  // Les volets de la pièce et l'aération de l'Accueil aussi.
  const d = src('accueil/dashboard.jsx');
  assert.match(d, /annulable\(tr\('Aération lancée'\)/);
  assert.match(d, /onToggle: \(\) => \{ annulable\(open \?/);
});

test('jamais l’alarme, les serrures ni les médias', () => {
  const a = src('annuler.js');
  assert.match(a, /const DOMAINES = \['light', 'switch', 'fan', 'cover', 'climate'\];/);
  assert.doesNotMatch(a, /alarm_control_panel|'lock'|media_player/);
});
