/* TEST AJOUTÉ (étape 2 IoT, 19/10 ; sa maquette « Cartes IoT », 1e ; I8, I24, I25) — la popup du distributeur : Repas et Historique.
 *
 * Les règles du serveur ne changent pas (ADR 0155) : ce fichier tient le DESSIN de sa maquette et ce que l'Historique affirme.
 *  - I24 : « Repas » — la rangée « Programme de l'appareil », qui dit qui sert (« Ce sont vos automatisations qui servent ») et
 *    son mode (« Manuel › », qui ouvre Réglages) ; « VOS AUTOMATISATIONS » en petites capitales, une rangée par automatisation — son
 *    nom 14 / 700, ses heures 17 / 800, ses jours, « Couper cette automatisation coupe ses 2 repas. » seulement quand elle sert —
 *    et le lien « Associer une automatisation », à l'accent ;
 *  - I25 : l'Historique sur les 7 × 24 h qui finissent maintenant — « 7 DERNIERS JOURS », « 2 repas · 18 g » —, une rangée par
 *    repas : le jour, le titre VRAI (le nom de l'automatisation qui a servi, sinon « Planning de Loggia », « Repas à la main »,
 *    « À distance », « Programme de l'appareil », et « Repas » quand on ne sait pas), le moment, la pastille d'origine, les
 *    grammes ; les barres partent ; jamais « Repas du matin » deviné à l'heure ;
 *  - I8 : plus d'orange de fiche — ni `.rb-distributeur`, ni lavis `--rb-` : les panneaux de sa maquette, l'ambre de la plaque.
 * L'heure est celle de la démo : lundi 19/10/2026, 18:20. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const M = await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href);
const Fiche = M.default;
const D = await import('../src/distributeurfiche.js');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (j, h, m) => new Date(2026, 9, 19 + j, h, m).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = iso(a(0, 14, 20))) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });

const FEED = 'select.distributeur_feed', GJOUR = 'sensor.distributeur_weight_per_day', BAC = 'input_number.croquettes_reservoir';
const MATIN = 'automation.croquettes_matin_et_soir', MIDI = 'automation.croquettes_du_midi', AUTRE = 'automation.rappel_arrosage';
const CFG = { haid: FEED, haids: { reservoir: BAC } };
const maison = ({ matin = 'on' } = {}) => ({
  [FEED]: st(FEED, 'unknown', { friendly_name: 'Distributeur Feed', options: ['START'] }),
  [GJOUR]: st(GJOUR, '12', { friendly_name: 'Distributeur Weight per day', unit_of_measurement: 'g' }, iso(a(0, 7, 30))),
  [BAC]: st(BAC, '450', { friendly_name: 'Réservoir', min: 0, max: 1500, step: 1, unit_of_measurement: 'g' }),
  [MATIN]: st(MATIN, matin, { friendly_name: 'Croquettes matin et soir' }),
  [MIDI]: st(MIDI, 'off', { friendly_name: 'Croquettes du midi' }),
  [AUTRE]: st(AUTRE, 'on', { friendly_name: 'Rappel arrosage' }),
});
const auto = (entity_id, nom, etat, heures, jours = null) => ({ entity_id, nom, etat, heures, jours, conditionnel: false, portions: null, declencheurs: heures.map(heure => ({ type: 'heure', heure })), pilotable: true, modifiable: false, indice: null, dernier: null });
const ETAT = ({ matin = 'on' } = {}) => ({
  source: 'automatisations',
  sources: { programme: { presente: false, active: false }, automatisations: { presente: true, active: matin === 'on' }, loggia: { presente: false, active: false } },
  appareil: { device_id: 'dev1', nom: 'Distributeur de croquettes', fabricant: 'Aqara', modele: 'ZNCWWSQ01LM' },
  programme: { source: 'aqara', connu: true, presente: false, active: false, lisible: false, mode: 'manuel', note: 'mode_manuel', repas: [] },
  automatisations: [auto(MATIN, 'Croquettes matin et soir', matin, ['07:30', '19:00']), auto(MIDI, 'Croquettes du midi', 'off', ['12:30'], [0, 1, 2, 3, 4])],
  planning: { appareil: null, repas: [] }, peutPlanifier: false, commande: { domaine: 'select', quantite: false, min: null, max: null, pas: null },
  ancienne_liste: { n: 0, relies: 0, non_relies: [] }, notes: [], journal: [],
});
const INDEX = { entityMeta: new Map([[FEED, { deviceId: 'dev1', platform: 'mqtt' }], [GJOUR, { deviceId: 'dev1', platform: 'mqtt' }]]), deviceMeta: new Map([['dev1', { id: 'dev1', name: 'Distributeur', manufacturer: 'Aqara', model: 'ZNCWWSQ01LM' }]]) };
const hass = (S) => ({ user: { is_admin: true }, states: S, callService: () => { throw new Error('rien ne doit partir'); } });
const repas = ({ matin = 'on' } = {}) => renderToStaticMarkup(createElement(Fiche, { hass: hass(maison({ matin })), index: INDEX, cfg: CFG, etat: ETAT({ matin }), maintenant: T, ongletDepart: 'planning' }));

/* Trois repas reconstruits (`repasDepuisHistorique`) : ce matin par l'automatisation, lundi dernier au bouton de l'appareil — à 7 jours
 * moins dix minutes : DEDANS —, et un repas de Loggia à 7 jours et dix minutes : DEHORS. */
const LIGNES = () => [
  { t: a(0, 7, 30), source: 'automatisation', quantites: [{ valeur: 12, unite: 'g' }], grammes: 12, origines: [GJOUR, MATIN] },
  { t: a(-7, 18, 30), source: 'manuel', quantites: [{ valeur: 6, unite: 'g' }], grammes: 6, origines: [GJOUR] },
  { t: a(-7, 18, 10), source: 'loggia', quantites: [], grammes: null, origines: [] },
];
const NOMS = { [MATIN]: 'Croquettes matin et soir' };

test('I25 : les sept jours GLISSANTS — les 7 × 24 h qui finissent maintenant ; les grammes seulement si l’appareil pèse', () => {
  const s = D.septJoursRepas(LIGNES(), { noms: NOMS, maintenant: T });
  assert.deepEqual([s.n, s.grammes, s.rangees.length], [2, 18, 2], 'le repas de lundi dernier, à 18:30, compte ; celui de 18:10 non');
  const sansPesee = D.septJoursRepas([{ t: a(0, 7, 30), source: null, quantites: [], grammes: null, origines: [] }], { maintenant: T });
  assert.deepEqual([sansPesee.n, sansPesee.grammes], [1, null], 'sans pesée, pas de « 0 g »');
  assert.deepEqual(D.septJoursRepas(null, { maintenant: T }), { n: 0, grammes: null, rangees: [] });
});

test('I25 : le titre VRAI et la pastille d’origine — jamais « Repas du matin » deviné à l’heure', () => {
  const l = (source, origines = []) => ({ t: a(0, 7, 30), source, quantites: [], grammes: null, origines });
  const s = D.septJoursRepas([l('automatisation', [GJOUR, MATIN]), l('automatisation', ['automation.inconnue']), l('loggia'), l('programme'), l('manuel'), l('distance'), l(null)],
    { noms: NOMS, maintenant: T });
  assert.deepEqual(s.rangees.map(r => [r.titre, r.origine]), [
    ['Croquettes matin et soir', 'automatisme'], ['Depuis une automatisation', 'automatisme'], ['Planning de Loggia', 'automatisme'],
    ['Programme de l’appareil', 'appareil'], ['Repas à la main', 'main'],
    // « remote » : l'application du fabricant, Loggia, ou une automatisation que le serveur ne reconnaît pas — qui, on ne le sait pas.
    ['À distance', null], ['Repas', null]]);
  assert.ok(!JSON.stringify(s).includes('Repas du'), 'un repas nommé d’après l’heure');
});

/* TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; point D) : le titre de repli d'UN repas de source inconnue partageait la clé de l'onglet
 * « Repas », traduite au PLURIEL — « Meals », « Mahlzeiten », « Posiłki » sur une seule rangée. Il a sa clé, au singulier. */
test('point D : un repas de source inconnue se titre « Repas » au singulier — « Meal », pas « Meals » (l’onglet)', async () => {
  const { preparerLangue, langue, trSens } = await import('../src/i18n.js');
  const CAT = Object.fromEntries(await Promise.all(['en', 'de', 'nl', 'it', 'es', 'pl'].map(async l => [l, (await import('../src/langues/' + l + '.js')).default])));
  for (const l of Object.keys(CAT)) {
    assert.ok(typeof CAT[l]['Repas · un repas'] === 'string' && CAT[l]['Repas · un repas'], l + ' : « Repas · un repas » sans traduction');
    assert.notEqual(CAT[l]['Repas · un repas'], CAT[l]['Repas'], l + ' : le repas et l’onglet se disent pareil');
  }
  assert.deepEqual([CAT.en['Repas · un repas'], CAT.en['Repas'], CAT.pl['Repas · un repas']], ['Meal', 'Meals', 'Posiłek']);
  assert.equal(trSens('Repas · un repas'), 'Repas', 'en français, le sens tombe : « Repas »');
  for (let i = 0; i < 100 && langue() !== 'en'; i++) { preparerLangue({ language: 'en' }); await new Promise(r => setTimeout(r, 10)); }
  assert.equal(langue(), 'en', 'le catalogue anglais ne s’est pas chargé');
  try {
    const s = D.septJoursRepas([{ t: a(0, 7, 30), source: null, quantites: [], grammes: null, origines: [] }], { maintenant: T });
    assert.equal(s.rangees[0].titre, 'Meal');
  } finally {
    preparerLangue({ language: 'fr' });
    assert.equal(langue(), 'fr');
  }
});

test('I25 : l’Historique de sa maquette — « 7 DERNIERS JOURS », une rangée par repas ; les barres partent', () => {
  const h = (p = {}) => renderToStaticMarkup(createElement(M.OngletHistorique, { semaine: D.septJoursRepas(LIGNES(), { noms: NOMS, maintenant: T }), chargee: true, erreur: false, aveugle: false, maintenant: T, ...p }));
  const html = h();
  assert.match(html, /text-transform:uppercase[^"]*">7 derniers jours</, 'le panneau en petites capitales');
  assert.match(html, /font-size:20px;font-weight:800[^"]*">2 repas · 18 g</, '« 2 repas · 18 g » en 20 / 800');
  assert.match(html, /min-width:44px;height:36px[^"]*">Auj\.</, 'le jour dans son badge, qui s’élargit au mot');
  assert.ok(html.includes('>Croquettes matin et soir<') && html.includes('>Aujourd’hui 07:30<'), 'le nom de l’automatisation, et le moment');
  assert.match(html, /fi-rr-magic-wand[^>]*><\/i>Automatisme</, 'la pastille « Automatisme »');
  assert.match(html, /fi-rr-hand[^>]*><\/i>À la main</, 'la pastille « À la main »');
  assert.ok(html.includes('>Repas à la main<') && html.includes('>Lundi 18:30<') && html.includes('>12 g<') && html.includes('>6 g<'));
  assert.ok(!html.includes('role="img"') && !html.includes('Cette semaine'), 'les barres de la semaine sont restées');
  assert.ok(!/--rb-(rgb|doux|fond)/.test(html), 'le lavis orange de la fiche est resté');
  const vide = h({ semaine: D.septJoursRepas([], { maintenant: T }) });
  assert.ok(vide.includes('>0 repas<') && vide.includes('Aucun repas ces 7 derniers jours.'), 'vide, il le dit');
  // Rien vu par un historique aveugle : ni « 0 repas » ni « Aucun repas », la phrase seule.
  const aveugle = h({ semaine: D.septJoursRepas([], { maintenant: T }), aveugle: true });
  assert.ok(aveugle.includes('L’historique ne voit que les repas partis de Home Assistant.') && !aveugle.includes('0 repas') && !aveugle.includes('Aucun repas'));
});

test('I25 : la fiche nomme le repas par l’automatisation qui l’a servi', async () => {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  Date.now = () => T;
  try {
    const S = maison();
    const H = { ...hass(S), callApi: (m, url) => Promise.resolve(url.includes('minimal_response')
      ? [[{ entity_id: GJOUR, state: '0', last_changed: iso(a(0, 0, 0)) }, { entity_id: GJOUR, state: '12', last_changed: iso(a(0, 7, 30)) }]]
      : [[{ entity_id: MATIN, state: 'on', last_changed: iso(a(-1, 9, 0)), attributes: { last_triggered: iso(a(0, 7, 30)) } }]]) };
    const m = monter(Fiche, { hass: H, index: INDEX, cfg: CFG, etat: ETAT(), maintenant: T, ongletDepart: 'historique' });
    await new Promise(r => setImmediate(r));
    m.rendre();
    const histo = m.trouver(e => e.type && e.type.name === 'OngletHistorique')[0];
    assert.deepEqual(histo.props.semaine.rangees.map(r => [r.titre, r.origine, r.grammes]), [['Croquettes matin et soir', 'automatisme', 12]]);
  } finally { Date.now = vraiNow; h.restaurer(); d.restaurer(); }
});

test('I24 : Repas — « Programme de l’appareil » dit qui sert, son mode ouvre Réglages', () => {
  const html = repas();
  const rangee = /<button type="button" id="[^"]+-mode"[^>]*>(.*?)<\/button>/.exec(html);
  assert.ok(rangee, 'la rangée du programme ouvre Réglages');
  assert.ok(rangee[1].includes('>Programme de l’appareil<') && rangee[1].includes('>Ce sont vos automatisations qui servent<'), rangee[1]);
  assert.match(rangee[1], />Manuel<i[^>]*fi-rr-angle-small-right/, 'le mode et son chevron');
  assert.ok(!html.includes('Mode de distribution'), 'l’ancienne ligne « Mode de distribution » est restée');
  // Une automatisation qui ne sert plus : la rangée ne prétend pas qu'elles servent.
  assert.ok(!repas({ matin: 'off' }).includes('Ce sont vos automatisations qui servent'), 'aucune automatisation active, et la phrase reste');
});

test('I24 : « VOS AUTOMATISATIONS » — nom 14 / 700, heures 17 / 800, la note seulement quand elle sert ; « Associer » à l’accent', () => {
  const html = repas();
  assert.match(html, /text-transform:uppercase[^"]*">Vos automatisations</, 'le titre en petites capitales');
  assert.ok(!html.includes('Les automatisations de Home Assistant qui commandent ce distributeur.'), 'la phrase que sa maquette n’a pas');
  assert.match(html, /font-size:14px;font-weight:700[^"]*">Croquettes matin et soir</);
  assert.match(html, /font-size:17px;font-weight:800[^"]*">07:30 · 19:00</);
  assert.equal((html.match(/Couper cette automatisation coupe ses 2 repas\./g) || []).length, 1, 'la note de celle qui sert deux repas');
  assert.ok(!repas({ matin: 'off' }).includes('Couper cette automatisation'), 'coupée, « couper » ne veut plus rien dire');
  assert.match(html, /color:var\(--o-accent-soft\)[^>]*>(?:<i[^>]*fi-rr-add[^>]*><\/i>)Associer une automatisation/, 'le lien « Associer », à l’accent');
  assert.ok(html.includes('background:var(--o-s3)'), 'les panneaux de sa maquette');
});

test('I8 : plus d’orange de fiche — ni `.rb-distributeur`, ni lavis `--rb-`', () => {
  const html = repas();
  // `--rb-n` est le compte des onglets (fichecommune.jsx), pas une teinte.
  assert.ok(!html.includes('rb-distributeur') && !/--rb-(rgb|doux|fond)/.test(html), 'la fiche porte encore l’orange de l’ancienne');
  assert.ok(!CSS.includes('.rb-distributeur'), 'index.css garde l’orange de la fiche');
});
