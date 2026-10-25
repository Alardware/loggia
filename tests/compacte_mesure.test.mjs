/* La compacte d'une mesure (chantier Capteurs, § 3 ; C5).
 *
 * Elle garde sa disposition — la pastille, le nom, la ligne d'état — et prend
 * de la carte la phrase de sa zone, son chiffre (en haut à droite, à la place
 * d'une commande qu'elle n'a pas) et, hors du bon, la teinte de sa zone sur la
 * pastille et le lavis. Pas de barre. La carte STANDARD d'une mesure qui passe
 * par `CvCard` (une vue personnalisée) ne change pas. On JOUE la compacte
 * (tests/crochets.mjs) : sous `?compacte_mesure`, App.jsx exporte `CvCard`. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?compacte_mesure')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?compacte_mesure'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CvCard };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?compacte_mesure', import.meta.url).href);

const NBSP = '\u00a0';
const SURFACE = 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
const capteur = (id, state, attributes) => ({ entity_id: id, state: String(state), last_changed: '2026-10-15T20:00:00+02:00', last_updated: '2026-10-15T20:39:00+02:00', attributes });
const ETATS = {
  'sensor.chambre_co2': capteur('sensor.chambre_co2', 1659, { friendly_name: 'CO₂ Chambre', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
  'sensor.sejour_temperature': capteur('sensor.sejour_temperature', 21.4, { friendly_name: 'Séjour', device_class: 'temperature', unit_of_measurement: '°C' }),
  'sensor.morte': capteur('sensor.morte', 'unavailable', { friendly_name: 'CO₂ mort', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
};
const hass = () => ({ states: Object.fromEntries(Object.entries(ETATS).map(([k, v]) => [k, { ...v }])), config: { unit_system: { temperature: '°C' } } });
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  try { return await fn(); } finally { h.restaurer(); d.restaurer(); }
}
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').includes(c))[0];
const ligne = (m) => classe(m, 'o-cvtxt').props.children[1];
const compacte = (id, dense = true) => monter(F.CvCard, { id, hass: hass(), onOpen: () => {}, dense });

test('§ 3 : la compacte prend la phrase, le chiffre et, hors du bon, la teinte de la zone — sur la pastille et le lavis', () => dans(() => {
  const m = compacte('sensor.chambre_co2');
  const p = classe(m, 'o-cvpastille').props.style;
  assert.deepEqual([p.background, p.color], ['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']);
  assert.deepEqual([ligne(m).props.children, ligne(m).props.style.color], ['Confiné · aérez', 'var(--o-bad)']);
  assert.equal(classe(m, 'o-cvmesure').props.children, (1659).toLocaleString('fr-FR') + NBSP + 'ppm', 'le chiffre et son unité, insécables');
  assert.ok(m.arbre.props.style.background.startsWith('linear-gradient(180deg,rgba(var(--o-bad-rgb),0.16),rgba(var(--o-bad-rgb),0.03) 72%)'), 'la dernière zone : 0,16 en haut');
  assert.equal(m.trouver(e => e.type && e.type.name === 'Surface')[0].props.label, 'CO₂ Chambre, 1 659 ppm, Confiné · aérez');
}));

test('C5 : bonne, la compacte reste neutre — ni teinte ni lavis', () => dans(() => {
  const m = compacte('sensor.sejour_temperature');
  const p = classe(m, 'o-cvpastille').props.style;
  assert.deepEqual([p.background, p.color], ['var(--o-s1)', 'var(--o-text1)']);
  assert.deepEqual([ligne(m).props.children, ligne(m).props.style.color], ['Idéal', 'var(--o-text2)']);
  assert.equal(classe(m, 'o-cvmesure').props.children, '21,4' + NBSP + '°C');
  assert.equal(m.arbre.props.style.background, SURFACE);
}));

test('muette : « Indisponible » en rouge, le liseré, sans chiffre', () => dans(() => {
  const m = compacte('sensor.morte');
  assert.deepEqual([ligne(m).props.children, ligne(m).props.style.color], ['Indisponible', 'var(--o-bad)']);
  assert.ok(m.arbre.props.className.includes('o-panne'));
  assert.equal(classe(m, 'o-cvmesure'), undefined);
}));

/* TEST AJOUTÉ (passe 1 ter, 16/10 ; C15 révisé) : dehors, rien n'est une alerte. Une compacte du jardin dit le mot de sa zone — celle du
 * dehors —, sans teinte ni lavis, même hors du bon. */
test('C15 révisé : dehors, la compacte dit le mot de sa zone, sans teinte ni lavis', () => dans(() => {
  const S = {
    'sensor.jardin_temperature': capteur('sensor.jardin_temperature', 34, { friendly_name: 'Jardin', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.jardin_vent': capteur('sensor.jardin_vent', 60, { friendly_name: 'Vent', device_class: 'wind_speed', unit_of_measurement: 'km/h' }),
  };
  setLoggiaState({ index: { entityMeta: new Map(), deviceMeta: new Map(), areaList: [], areaNameOf: () => 'Jardin' }, ent: {}, cfg: {}, resolved: null });
  try {
    for (const [id, mot] of [['sensor.jardin_temperature', 'Canicule'], ['sensor.jardin_vent', 'Fort']]) {
      const m = monter(F.CvCard, { id, hass: { states: S }, onOpen: () => {}, dense: true });
      const p = classe(m, 'o-cvpastille').props.style;
      assert.deepEqual([p.background, p.color, ligne(m).props.children, ligne(m).props.style.color, m.arbre.props.style.background],
        ['var(--o-s1)', 'var(--o-text1)', mot, 'var(--o-text2)', SURFACE], id);
    }
  } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}));

test('la carte standard d’une mesure qui passe par CvCard ne change pas : seule la compacte lit sa vue', () => dans(() => {
  const m = compacte('sensor.chambre_co2', false);
  assert.equal(classe(m, 'o-cvmesure'), undefined);
  assert.equal(ligne(m).props.children, '1659 ppm', 'la ligne d’avant');
}));
