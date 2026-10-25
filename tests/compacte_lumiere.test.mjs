/* La compacte d'une lumière (chantier Lumières, § 3.3 ; L3, L5, L6).
 *
 * Elle garde sa disposition — une rangée : la pastille, le nom, l'état, la
 * bascule — et prend de sa carte la phrase d'état (§ 4), le pourcentage et la
 * teinte de la vraie lumière. Pas de barre. On la REND (react-dom/server) et on
 * la JOUE (tests/crochets.mjs) ; sous `?compacte_lumiere`, App.jsx exporte
 * `CvCard`. Une compacte qui n'est pas une lumière ne change pas. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';
import { teinteDe } from './jetons_loggia.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?compacte_lumiere')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?compacte_lumiere'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CvCard };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?compacte_lumiere', import.meta.url).href);
const L = await import('../src/lumieresetat.js');
const { lireCouleur } = await import('../src/contraste.js');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

const iso = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const lampe = (id, state, attributes, depuis) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
const ETATS = {
  'light.ampoule_chambre': lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 2700, brightness: 115 }, iso(20, 10)),
  'light.chambre': lampe('light.chambre', 'off', { friendly_name: 'Plafonnier Chambre', supported_color_modes: ['brightness'] }, iso(7, 50)),
  'switch.applique': lampe('switch.applique', 'on', { friendly_name: 'Applique Extérieur' }, iso(20, 24)),
  'light.morte': lampe('light.morte', 'unavailable', { friendly_name: 'Lampe morte', supported_color_modes: ['brightness'] }, iso(14, 20)),
  'switch.radiateur': lampe('switch.radiateur', 'on', { friendly_name: 'Radiateur salon' }, iso(6, 0)),
  // Les autres types de luminaires, que leur nom rangeait sous une icône à eux (plafonnier, veilleuse, lampadaire).
  'light.veilleuse_lino': lampe('light.veilleuse_lino', 'on', { friendly_name: 'Veilleuse Chambre Lino', supported_color_modes: ['color_temp', 'xy'], color_mode: 'xy', rgb_color: [149, 0, 255], brightness: 38 }, iso(20, 30)),
  'light.lampadaire_salon': lampe('light.lampadaire_salon', 'on', { friendly_name: 'Lampadaire Salon', supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 200 }, iso(19, 0)),
  'light.plafonnier_cuisine': lampe('light.plafonnier_cuisine', 'off', { friendly_name: 'Plafonnier Cuisine', supported_color_modes: ['brightness'] }, iso(8, 0)),
};
function poser() {
  setLoggiaState({ index: null, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  L.reglerLumieresEtat({ hass: { callWS: () => new Promise(() => {}) }, horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  const appels = [];
  const hass = { states: JSON.parse(JSON.stringify(ETATS)), callService: (d, s, data, cible) => { appels.push(d + '.' + s + ' ' + ((cible && cible.entity_id) || (data && data.entity_id))); return Promise.resolve(); } };
  return { appels, hass };
}
const rendre = (id, w, dense = true) => renderToStaticMarkup(createElement(F.CvCard, { id, hass: w.hass, onOpen: () => {}, dense }));
async function dans(fn, { clair = false } = {}) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: (c) => clair && c === 'loggia-light' } };
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}

test('§ 3.3 : allumée — la phrase de sa carte, le pourcentage, la teinte de la vraie lumière sur la pastille et le lavis', () => dans(() => {
  const html = rendre('light.ampoule_chambre', poser());
  assert.ok(html.includes('>Allumée depuis 20:10<'), 'la phrase du § 4, plus « Allumé · 45% »');
  assert.ok(html.includes('<span class="o-cvpourcent" style="font-size:12px;font-weight:800;flex-shrink:0;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--o-text2)">45\u00a0%</span>'), 'le pourcentage, son espace insécable');
  assert.ok(/class="o-cvpastille" style="background:rgba\(255,169,87,\.22\);color:#[0-9a-f]{6}"/.test(html), 'la pastille dans le blanc de l’ampoule');
  assert.ok(html.includes('background:linear-gradient(180deg,rgba(255,169,87,0.143),rgba(255,169,87,0.03) 72%)'), 'le lavis, comme la carte');
  assert.ok(!html.includes('role="slider"') && !html.includes('type="range"'), 'pas de barre');
  assert.ok(html.includes('aria-label="Ampoule Chambre, Allumée depuis 20:10"'), 'la surface dit ce que la compacte affiche ; le pourcentage, hors d’elle, se lit après');
}));

test('§ 3.3 : éteinte, « Éteinte », ni pourcentage ni teinte ; muette, « Indisponible depuis » en rouge ; un switch-lumière en or', () => dans(() => {
  const w = poser();
  const off = rendre('light.chambre', w);
  assert.ok(off.includes('>Éteinte<') && !off.includes('o-cvpourcent') && off.includes('class="o-cvpastille" style="background:var(--o-s1);color:var(--o-text3)"'));
  const morte = rendre('light.morte', w);
  assert.ok(morte.includes('color:var(--o-bad)') && morte.includes('>Indisponible depuis 14:20<') && morte.includes('o-panne'));
  assert.ok(!morte.includes('role="switch"'), 'muette, pas de bascule, comme toute compacte en panne');
  const sw = rendre('switch.applique', w);
  assert.ok(sw.includes('>Allumée depuis 20:24<') && sw.includes('background:rgba(var(--o-lampe-rgb),.22);color:var(--o-lampe)') && !sw.includes('o-cvpourcent'));
}));

test('L3 : la bascule allume ou éteint par `turn_on` / `turn_off`, le geste d’abord ; une compacte d’autre chose ne change pas', () => dans(() => {
  const w = poser();
  const m = monter(F.CvCard, { id: 'light.ampoule_chambre', hass: w.hass, onOpen: () => {}, dense: true });
  const bascule = m.trouver(e => e.props && e.props.role === 'switch')[0];
  m.appuyer(bascule);
  assert.deepEqual(w.appels, ['light.turn_off light.ampoule_chambre']);
  assert.ok(m.texte().includes('Éteinte'), 'le geste se voit tout de suite');
  const sw = monter(F.CvCard, { id: 'switch.applique', hass: w.hass, onOpen: () => {}, dense: true });
  sw.appuyer(sw.trouver(e => e.props && e.props.role === 'switch')[0]);
  assert.deepEqual(w.appels.slice(1), ['switch.turn_off switch.applique']);
  assert.ok(rendre('switch.radiateur', w).includes('>Allumé<'), 'un switch qui n’est ni une lumière ni une prise garde ses mots');
  assert.ok(CSS.includes('@container (width < 140px) { .o-cvpourcent { display: none; } }'), 'sous 140 px de contenu, le pourcentage cède sa place');
}));

test('11 bis, R3 : la bascule d’une compacte ÉTEINTE l’allume par `turn_on` — le test d’au-dessus ne jouait que des lampes allumées, et ne prouvait pas ce sens-là', () => dans(() => {
  const w = poser();
  const m = monter(F.CvCard, { id: 'light.chambre', hass: w.hass, onOpen: () => {}, dense: true });
  assert.ok(m.texte().includes('Éteinte'), 'au départ : éteinte');
  const bascule = m.trouver(e => e.props && e.props.role === 'switch')[0];
  assert.equal(bascule.props['aria-checked'], false, 'la bascule est sur « éteinte »');
  m.appuyer(bascule);
  assert.deepEqual(w.appels, ['light.turn_on light.chambre'], 'éteinte, la bascule ALLUME : `turn_on`, jamais `toggle`');
  assert.ok(m.texte().includes('Allumée depuis') && !m.texte().includes('Éteinte'), 'le geste d’abord : « Allumée », avant que la lampe ne réponde');
  assert.equal(m.trouver(e => e.props && e.props.role === 'switch')[0].props['aria-checked'], true);
  // Un switch déclaré lumière, éteint : `turn_on` de son domaine.
  const w2 = poser();
  w2.hass.states['switch.applique'] = lampe('switch.applique', 'off', { friendly_name: 'Applique Extérieur' }, iso(20, 24));
  const sw = monter(F.CvCard, { id: 'switch.applique', hass: w2.hass, onOpen: () => {}, dense: true });
  sw.appuyer(sw.trouver(e => e.props && e.props.role === 'switch')[0]);
  assert.deepEqual(w2.appels, ['switch.turn_on switch.applique'], 'un switch-lumière éteint : `turn_on` de son domaine');
  assert.ok(![...w.appels, ...w2.appels].some(x => /toggle/.test(x)));
}));

/* ── Passe de finition 9 bis A ─────────────────────────────────────────────────── */

/* Le `hass` du PARENT (la prop) et le `hass` VIVANT (celui que la compacte relève elle-même, `useHass([id])`, via `getHass()`) : le parent peut
 * avoir un tic de retard. Seul le vivant dit la vérité de la lampe — sa phrase et sa bascule en viennent déjà. */
function surDeuxReleves(id, parent, vivant, d) {
  const w = poser();
  const etat = (e) => ({ ...w.hass, states: { ...w.hass.states, [id]: e } });
  d.suivre(() => etat(vivant));
  return renderToStaticMarkup(createElement(F.CvCard, { id, hass: etat(parent), onOpen: () => {}, dense: true }));
}
const UNE_LAMPE = (state, depuis) => lampe('light.morte', state, { friendly_name: 'Lampe morte', supported_color_modes: ['brightness'], brightness: 128 }, depuis);

test('point 13 : la compacte lit sa panne dans SA vue — une lampe qui revient en ligne perd son liseré et retrouve sa bascule, même si le parent est en retard', () => dans(({ d }) => {
  const html = surDeuxReleves('light.morte', UNE_LAMPE('unavailable', iso(14, 20)), UNE_LAMPE('on', iso(14, 40)), d);
  assert.ok(html.includes('>Allumée depuis 14:40<'), 'la phrase vient de la vue vivante');
  assert.ok(!html.includes('o-panne'), 'plus de liseré de panne : la lampe répond');
  assert.ok(html.includes('role="switch" aria-checked="true"'), 'sa bascule est revenue');
  assert.ok(!html.includes('opacity:0.55'), 'ni l’opacité d’une carte morte');
}));

test('point 13 : à l’inverse, une lampe qui tombe porte son liseré et perd sa bascule, même si le parent la croit encore allumée', () => dans(({ d }) => {
  const html = surDeuxReleves('light.morte', UNE_LAMPE('on', iso(14, 40)), UNE_LAMPE('unavailable', iso(14, 50)), d);
  assert.ok(html.includes('>Indisponible depuis 14:50<'), 'la phrase vient de la vue vivante');
  assert.ok(html.includes('o-panne') && html.includes('opacity:0.55'), 'le liseré qui respire, la carte atténuée');
  assert.ok(!html.includes('role="switch"'), 'plus de bascule sur une lampe muette');
  // Une compacte qui n’est pas une lumière lit sa panne comme avant : dans l’état de la carte.
  const w = poser();
  w.hass.states['switch.radiateur'] = lampe('switch.radiateur', 'unavailable', { friendly_name: 'Radiateur salon' }, iso(6, 0));
  assert.ok(rendre('switch.radiateur', w).includes('o-panne'), 'un switch ordinaire hors ligne : toujours le liseré');
}));

test('point 1 : la compacte d’une ampoule « Froide » en thème clair lit la même encre brune que sa carte — ni rouge ni magenta ; sa pastille prend le blanc de 4 000 K, qui se voit', () => dans(() => {
  const w = poser();
  w.hass.states['light.ampoule_chambre'] = lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 6500, brightness: 115 }, iso(20, 10));
  /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R7) : la pastille gardait le blanc froid vrai (255,249,253), qui ne se voyait pas sur la carte claire — une carte
   * toute blanche. En thème clair elle prend le blanc de l’encre, plafonné à 4 000 K (255,209,163). */
  const m = rendre('light.ampoule_chambre', w).match(/class="o-cvpastille" style="background:rgba\(255,209,163,\.22\);color:(#[0-9a-f]{6})"/);
  assert.ok(m, 'la pastille : le fond du blanc de 4 000 K, une encre en hexadécimal');
  const h = teinteDe(lireCouleur(m[1]));
  assert.ok(h >= 20 && h <= 45, 'l’encre ' + m[1] + ' est à ' + h + '° : un brun orangé, pas le magenta (#d2008c) d’avant');
}, { clair: true }));

test('point 9 : toute lumière compacte porte l’ampoule — plafonnier, veilleuse, lampadaire, ampoule, switch déclaré — la standard aussi ; une icône choisie passe devant', () => dans(() => {
  const w = poser();
  const pastille = (html) => html.slice(html.indexOf('class="o-cvpastille"'), html.indexOf('</span>', html.indexOf('class="o-cvpastille"')));
  const ids = ['light.ampoule_chambre', 'light.chambre', 'light.veilleuse_lino', 'light.lampadaire_salon', 'light.plafonnier_cuisine', 'light.morte', 'switch.applique'];
  for (const id of ids) {
    for (const dense of [true, false]) {
      const p = pastille(rendre(id, w, dense));
      assert.ok(p.includes('class="fi fi-rr-bulb"'), id + (dense ? ' (compacte)' : ' (standard)') + ' : l’ampoule — ' + p);
      assert.ok(!/fi-rr-(light-switch-on|moon)|<svg/.test(p), id + ' : ni le plafonnier ni la lune d’avant');
    }
  }
  setLoggiaState({ index: null, ent: { switchLights: ['switch.applique'] }, cfg: { loggia_icones: { 'light.chambre': 'star', 'switch.applique': 'star' } }, resolved: null });
  for (const id of ['light.chambre', 'switch.applique']) {
    const p = pastille(rendre(id, w));
    assert.ok(p.includes('fi-rr-star') && !p.includes('fi-rr-bulb'), id + ' : l’icône choisie à la main l’emporte — ' + p);
  }
  assert.ok(pastille(rendre('light.plafonnier_cuisine', w)).includes('fi-rr-bulb'), 'une lampe sans choix garde l’ampoule');
}));

/* ── Passe de finition 11 bis, R7 : le thème clair et les blancs ───────────────────────────────── */

test('11 bis, R7 : la compacte d’une ampoule froide — en thème clair la pastille ET le lavis prennent le blanc de 4 000 K ; en thème sombre, la teinte vraie, comme avant', async () => {
  const froide = (clair) => dans(() => {
    const w = poser();
    w.hass.states['light.ampoule_chambre'] = lampe('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule Chambre', supported_color_modes: ['color_temp'], color_mode: 'color_temp', color_temp_kelvin: 6500, brightness: 255 }, iso(20, 10));
    return rendre('light.ampoule_chambre', w);
  }, { clair });
  const c = await froide(true), s = await froide(false);
  assert.ok(/class="o-cvpastille" style="background:rgba\(255,209,163,\.22\)/.test(c), 'clair : la pastille, le blanc de 4 000 K');
  assert.ok(c.includes('background:linear-gradient(180deg,rgba(255,209,163,0.22),rgba(255,209,163,0.03) 72%)'), 'clair : le lavis aussi');
  assert.ok(/class="o-cvpastille" style="background:rgba\(255,249,253,\.22\)/.test(s), 'sombre : la pastille, la teinte vraie');
  assert.ok(s.includes('background:linear-gradient(180deg,rgba(255,249,253,0.22),rgba(255,249,253,0.03) 72%)'), 'sombre : le lavis, la teinte vraie');
});
