/* La carte générique STANDARD d'une lampe, et les pastilles (ADR 0261 ; A8, A9).
 *
 * `CvCard` — la carte des vues personnelles — parle désormais comme la carte
 * d'une lumière : « Allumée depuis 18:05 · 45 % » (`phraseLumiere`,
 * `luminosite` au plancher de 1 %), la teinte de la VRAIE lumière sur son
 * sous-titre (`teinteDeCarte`, un blanc plafonné à 4 000 K en thème clair), un
 * curseur pour toute lampe VARIABLE (`capacitesLumiere`), qui tient 4 s le geste
 * d'abord (`useOptimiste`) et laisse défiler la page (`pan-y`). Une pastille
 * n'est en or que pour une vraie lumière (`cvEstLumiere`). Sous
 * `?carte_generique`, App.jsx exporte la carte et la pastille ; on les JOUE
 * (tests/crochets.mjs). */
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
  "  if (!url.endsWith('/src/App.jsx?carte_generique')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?carte_generique'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CvCard, CvChip, CvBigToggle };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?carte_generique', import.meta.url).href);
const L = await import('../src/lumieresetat.js');
const { versHex } = await import('../src/contraste.js');
const { rgbDuBlanc } = await import('../src/lumieres.js');

const aujourdhui = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
const iso = (h, m) => new Date(aujourdhui(h, m)).toISOString();
const lampe = (id, state, attributes, depuis = iso(18, 5)) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
function maison() {
  return {
    'light.ampoule': lampe('light.ampoule', 'on', { friendly_name: 'Ampoule', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 2700, brightness: 115 }),
    'light.froide': lampe('light.froide', 'on', { friendly_name: 'Froide', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 6500, brightness: 2 }),
    'light.chambre': lampe('light.chambre', 'off', { friendly_name: 'Chambre', supported_color_modes: ['brightness'], color_mode: null, brightness: null }, iso(7, 50)),
    'light.simple': lampe('light.simple', 'on', { friendly_name: 'Simple', supported_color_modes: ['onoff'], color_mode: 'onoff' }),
    'light.muette': lampe('light.muette', 'unknown', { friendly_name: 'Muette', supported_color_modes: ['brightness'] }),
    'switch.applique': lampe('switch.applique', 'on', { friendly_name: 'Applique' }, iso(20, 24)),
    'switch.prise': lampe('switch.prise', 'on', { friendly_name: 'Prise' }),
  };
}
function poser() {
  setLoggiaState({ index: null, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  L.reglerLumieresEtat({ hass: { callWS: () => new Promise(() => {}) }, horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  const appels = [];
  const courants = maison();
  const hass = () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v }])),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), ...Object.entries(data || {}).filter(([k]) => k !== 'entity_id').map(([k, v]) => k + '=' + v)].join(' ')); return Promise.resolve(); } });
  return { appels, courants, hass };
}
async function dans(fn, { clair = false } = {}) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: (c) => clair && c === 'loggia-light' } };
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const sousTitre = (m) => m.trouver(e => e.props && e.props.style && e.props.style.textOverflow === 'ellipsis' && e.props.style.fontSize === 12)[0];
const curseur = (m) => m.trouver(e => e.type === 'input' && e.props.type === 'range')[0];

test('A8 : « Allumée depuis 18:05 · 45 % » — le vocabulaire de la carte d’une lumière, le pourcentage au plancher de 1 %', () => dans(() => {
  const w = poser();
  const m = monter(F.CvCard, { id: 'light.ampoule', hass: w.hass(), onOpen: () => {} });
  assert.equal(sousTitre(m).props.children, 'Allumée depuis 18:05 · 45 %');
  assert.equal(sousTitre(monter(F.CvCard, { id: 'light.froide', hass: w.hass() })).props.children, 'Allumée depuis 18:05 · 1 %', '2 / 255 : 1 %, jamais 0 %');
  assert.equal(sousTitre(monter(F.CvCard, { id: 'light.chambre', hass: w.hass() })).props.children, 'Éteinte');
  assert.equal(sousTitre(monter(F.CvCard, { id: 'light.simple', hass: w.hass() })).props.children, 'Allumée depuis 18:05', 'tout ou rien : pas de pourcentage');
  assert.equal(sousTitre(monter(F.CvCard, { id: 'switch.applique', hass: w.hass() })).props.children, 'Allumée depuis 20:24', 'un switch déclaré lumière parle comme une lumière');
  assert.equal(sousTitre(monter(F.CvCard, { id: 'light.muette', hass: w.hass() })).props.children, 'Indisponible', '`unknown` : muette');
}));

test('A8 : la teinte du sous-titre est celle de la VRAIE lumière — un blanc par la table, plafonné à 4 000 K en thème clair', async () => {
  await dans(() => {
    const w = poser();
    assert.equal(sousTitre(monter(F.CvCard, { id: 'light.ampoule', hass: w.hass() })).props.style.color, versHex(rgbDuBlanc(2700)), 'le blanc chaud de la table, pas un rgb_color brut');
    assert.equal(sousTitre(monter(F.CvCard, { id: 'light.froide', hass: w.hass() })).props.style.color, versHex(rgbDuBlanc(6500)), 'thème sombre : la teinte vraie');
    assert.equal(sousTitre(monter(F.CvCard, { id: 'light.simple', hass: w.hass() })).props.style.color, 'var(--o-warn)', 'tout ou rien : l’or de la maison');
    assert.equal(sousTitre(monter(F.CvCard, { id: 'light.chambre', hass: w.hass() })).props.style.color, 'var(--o-text3)', 'éteinte : la carte se tait');
  });
  await dans(() => {
    const w = poser();
    assert.equal(sousTitre(monter(F.CvCard, { id: 'light.froide', hass: w.hass() })).props.style.color, versHex(rgbDuBlanc(4000)), 'thème clair : un blanc froid se plafonne à 4 000 K, sinon il ne se voit pas');
  }, { clair: true });
});

test('A8 : le curseur suit `capacitesLumiere`, tient le geste d’abord 4 s, et laisse défiler la page', () => dans(({ h }) => {
  const w = poser();
  const m = monter(F.CvCard, { id: 'light.ampoule', hass: w.hass(), onOpen: () => {} });
  const c = curseur(m);
  assert.ok(c, 'une lampe à blancs varie : elle a son curseur');
  assert.equal(c.key, '45'); assert.equal(c.props.defaultValue, 45);
  assert.equal(c.props.style.touchAction, 'pan-y');
  assert.ok(curseur(monter(F.CvCard, { id: 'light.chambre', hass: w.hass() })), 'éteinte mais variable : le curseur est là, à 0');
  assert.equal(curseur(monter(F.CvCard, { id: 'light.chambre', hass: w.hass() })).props.defaultValue, 0);
  assert.ok(!curseur(monter(F.CvCard, { id: 'light.simple', hass: w.hass() })), 'tout ou rien : pas de curseur');
  assert.ok(!curseur(monter(F.CvCard, { id: 'light.muette', hass: w.hass() })), 'muette : pas de curseur');
  c.props.onPointerUp({ target: { value: '60' } });
  m.effets();
  assert.deepEqual(w.appels, ['light.turn_on light.ampoule brightness_pct=60']);
  m.proprietes({ hass: w.hass() });
  assert.equal(curseur(m).key, '60', 'la maison redit encore 45 (l’écho) : le curseur ne remonte pas');
  assert.equal(sousTitre(m).props.children, 'Allumée depuis 18:05 · 60 %', 'le sous-titre suit le geste');
  h.avancer(4100);
  m.proprietes({ hass: w.hass() });
  assert.equal(curseur(m).key, '45', 'passé 4 s, la maison a le dernier mot');
  m.demonter();
}));

test('A8 : une pastille n’est en or que pour une vraie lumière ; une prise s’allume à l’accent ; 2 / 255 se dit « 1 % »', () => dans(() => {
  const w = poser();
  const couleur = (id) => monter(F.CvChip, { id, hass: w.hass() }).trouver(e => e.type === 'button')[0].props.style.color;
  assert.equal(couleur('light.ampoule'), 'var(--o-warn)');
  assert.equal(couleur('switch.applique'), 'var(--o-warn)', 'un switch déclaré lumière');
  assert.equal(couleur('switch.prise'), 'var(--o-accent-soft)', 'une prise ordinaire');
  const m = monter(F.CvChip, { id: 'light.froide', hass: w.hass() });
  assert.ok(m.texte().includes('1 %'), 'le plancher : ' + m.texte());
}));

test('A9 : le gros interrupteur tient `unknown` pour muet, comme toutes les cartes', () => dans(() => {
  const w = poser();
  const m = monter(F.CvBigToggle, { id: 'light.muette', hass: w.hass() });
  assert.ok(m.texte().includes('Indisponible'), m.texte());
  assert.ok(!monter(F.CvBigToggle, { id: 'light.simple', hass: w.hass() }).texte().includes('Indisponible'));
}));
