// ─────────────────────────────────────────────────
// « Alimentée par », côté écran (audit du 12/11, lot X4 ; ADR 0369).
//
// Ce que l'écran fait de la relation, une fois lue (tests/audit_1211_lotx4_
// alimentation.test.mjs) :
//  - le relevé entre par UNE porte (`getHass`), c'est là que l'ampoule sans
//    courant devient « éteinte » ;
//  - au dernier mètre, aucun ordre ne lui parvient — seule, ou dans un groupe
//    dont le reste part ; on JOUE le moteur avec un faux Home Assistant ;
//  - sa phrase : « Hors tension », jamais une panne ;
//  - sa carte et sa fiche se taisent comme une lampe muette, sans son rouge ;
//  - la liste « Alimentée par » : sa pièce d'abord.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const S = await import('../src/state.js');
const A = await import('../src/actions.js');
const L = await import('../src/lumieres.js');
const F = await import('../src/lumieresfiche.js');
const { etatsAlimentes } = await import('../src/alimentation.js');

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const st = (state, attributes = {}) => ({ state, attributes, last_changed: '2026-11-14T18:00:00.000Z', last_updated: '2026-11-14T18:00:00.000Z' });
const LAMPE = { supported_color_modes: ['brightness'], color_mode: 'brightness' };
const AMPOULE = 'light.ampoule', AUTRE = 'light.autre', PLAFONNIER = 'light.plafonnier';

function maison(states) {
  const appels = [];
  const hass = {
    states,
    services: { light: { turn_on: {}, turn_off: {} }, switch: { turn_on: {}, turn_off: {} }, homeassistant: { turn_on: {}, turn_off: {} } },
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, [].concat((cible && cible.entity_id) || (data && data.entity_id) || []).slice().sort()]); return Promise.resolve(); },
  };
  return { hass, appels };
}
const laisser = () => new Promise((r) => setTimeout(r, 20));
const relation = (r) => S.setLoggiaState({ index: null, ent: null, cfg: r ? { loggia_alimentation: r } : {}, resolved: null });

// ── Le relevé entre par une seule porte ──────────────────────────────────────

test('`getHass` rend le relevé tel que l’écran le lit, sur la relation de la maison', () => {
  const etat = lire('src/state.js');
  assert.ok(etat.includes("import { CLE_ALIMENTATION, avecAlimentation } from './alimentation.js';"));
  assert.ok(etat.includes('return avecAlimentation((el && el.hass) || null, cfgBrute(CLE_ALIMENTATION, null));'), 'la porte unique du relevé');
});

// ── Au dernier mètre, rien ne lui parvient ───────────────────────────────────

test('une ampoule sans courant, seule : aucun ordre ne part', async () => {
  relation({ [AMPOULE]: PLAFONNIER });
  const { hass, appels } = maison({ [AMPOULE]: st('on', LAMPE), [PLAFONNIER]: st('off', LAMPE) });
  assert.equal(A.commanderService(hass, AMPOULE, 'light', 'turn_off', { entity_id: AMPOULE }), null);
  A.commanderService(hass, AMPOULE, 'light', 'turn_on', { entity_id: AMPOULE, hs_color: [30, 100] });
  A.commander(hass, AMPOULE, 'set_brightness', 60);
  await laisser();
  assert.deepEqual(appels, []);
});

test('dans un groupe, le reste part : « Tout éteindre », la tuile d’une pièce', async () => {
  relation({ [AMPOULE]: PLAFONNIER });
  const { hass, appels } = maison({ [AMPOULE]: st('on', LAMPE), [AUTRE]: st('on', LAMPE), [PLAFONNIER]: st('off', LAMPE) });
  A.commanderService(hass, [AMPOULE, AUTRE], 'homeassistant', 'turn_off', { entity_id: [AMPOULE, AUTRE] });
  await laisser();
  assert.deepEqual(appels, [['light.turn_off', [AUTRE]]]);
  // Un groupe dont tout est coupé : rien.
  appels.length = 0;
  A.commanderService(hass, [AMPOULE], 'homeassistant', 'turn_on', { entity_id: [AMPOULE] });
  await laisser();
  assert.deepEqual(appels, []);
});

test('le courant revenu, ou sans relation : elle se commande comme avant', async () => {
  relation({ [AMPOULE]: PLAFONNIER });
  const allume = maison({ [AMPOULE]: st('on', LAMPE), [PLAFONNIER]: st('on', LAMPE) });
  A.commanderService(allume.hass, AMPOULE, 'light', 'turn_off', { entity_id: AMPOULE });
  // Un plafonnier injoignable ne dit rien : l'ordre part.
  const muet = maison({ [AMPOULE]: st('on', LAMPE), [PLAFONNIER]: st('unavailable') });
  A.commanderService(muet.hass, AMPOULE, 'light', 'turn_off', { entity_id: AMPOULE });
  relation(null);
  const libre = maison({ [AMPOULE]: st('on', LAMPE), [PLAFONNIER]: st('off', LAMPE) });
  A.commanderService(libre.hass, AMPOULE, 'light', 'turn_off', { entity_id: AMPOULE });
  await laisser();
  for (const m of [allume, muet, libre]) assert.deepEqual(m.appels, [['light.turn_off', [AMPOULE]]]);
});

test('le plafonnier, lui, se commande toujours : c’est lui qui rend le courant', async () => {
  relation({ [AMPOULE]: PLAFONNIER });
  const { hass, appels } = maison({ [AMPOULE]: st('on', LAMPE), [PLAFONNIER]: st('off', LAMPE) });
  A.commanderService(hass, PLAFONNIER, 'light', 'turn_on', { entity_id: PLAFONNIER });
  await laisser();
  assert.deepEqual(appels, [['light.turn_on', [PLAFONNIER]]]);
  relation(null);
});

test('les deux routes du moteur passent par la garde', () => {
  const actions = lire('src/actions.js');
  assert.ok(actions.includes('function sansCoupees(hass, id) {'));
  assert.ok(actions.includes('const reste = sansEau === false ? false : sansCoupees(hass, sansEau);'), 'la route directe');
  assert.ok(actions.includes('id = sansCoupees(hass, id);\n  if (id === false) return {};'), 'la route vérifiée');
});

// ── Ce que sa carte et sa fiche en disent ────────────────────────────────────

test('sa phrase : « Hors tension », jamais une panne — même injoignable', () => {
  for (const reel of ['on', 'off', 'unavailable']) {
    const vu = etatsAlimentes({ [AMPOULE]: st(reel, LAMPE), [PLAFONNIER]: st('off', LAMPE) }, { [AMPOULE]: PLAFONNIER });
    assert.deepEqual(L.phraseLumiere({ st: vu[AMPOULE] }), { texte: 'Hors tension', panne: false, on: false, coupee: PLAFONNIER }, reel);
  }
  // Le courant là, les phrases d'avant.
  assert.equal(L.phraseLumiere({ st: st('off') }).texte, 'Éteinte');
  assert.equal(L.phraseLumiere({ st: st('unavailable') }).panne, true);
});

test('sa carte se tait comme une lampe muette, sans le rouge ni le liseré d’une panne', () => {
  const carte = lire('src/cartes/lumiere.jsx');
  assert.ok(carte.includes('const source = coupeePar(st);') && carte.includes('const coupee = source ? { par: source, nom: cvName(S[source], source) } : null;'));
  assert.ok(carte.includes("phrase: coupee ? { texte: tr('Hors tension · coupée par {nom}', { nom: coupee.nom }), court: tr('Hors tension'), panne: false, on: false }"), 'le mot d’abord, puis qui la coupe');
  // La carte étroite n'a pas la place du nom : elle dit « Hors tension », la feuille ne montre qu'une des deux écritures.
  assert.ok(carte.includes('{v.phrase.court ? <><span className="o-seul-large">{v.phrase.texte}</span><span className="o-seul-etroit">{v.phrase.court}</span></> : v.phrase.texte}</div>'));
  assert.ok(carte.includes('commander: (allumer) => { if (coupee) return;') && carte.includes('regler: (pct) => { if (coupee) return;'), 'ni ordre, ni geste d’abord');
  assert.ok(carte.includes("const voulu = coupee ? null : ov != null ? ov : muette ? null : avanceDe(id, st, maintenant);"), 'un appui d’avant la coupure ne la rallume pas à l’écran');
  assert.ok(carte.includes('const inerte = v.muette || !!v.coupee;') && carte.includes('actif={!inerte}'), 'la bascule et la barre');
  // Le liseré qui respire reste celui d'une panne.
  assert.ok(carte.includes("(v.muette ? ' o-panne' : '')"));
});

test('sa fiche : le mot, qui la coupe, plus aucune commande — et la rangée où cela se règle', () => {
  const fiche = lire('src/fichelumiere.jsx');
  assert.ok(fiche.includes("const grand = v.coupee ? motGrand(tr('Hors tension'), 'var(--o-text2)')"), 'en gris, pas en rouge');
  assert.ok(fiche.includes("const phrase = v.coupee ? tr('Coupée par {nom} : sans courant, elle ne reçoit plus d’ordre.', { nom: v.coupee.nom })"));
  for (const garde of ['{Interrupteur && !inerte && <Interrupteur', '{v.variable && !inerte && Jauge && (', '{(cap.blancs || cap.couleurs) && !inerte && (', '{effets && !inerte && (', '{!inerte && (() => {']) {
    assert.ok(fiche.includes(garde), garde);
  }
  assert.ok(fiche.includes("className={v.muette ? 'o-panne' : undefined}"), 'le liseré d’une panne reste celui d’une panne');
  assert.ok(fiche.includes('{connue && <RangeeAlimentation id={id} hass={H} haut={inerte ? 0 : 1} />}'), 'là tant que la lampe existe');
  // La configuration de la maison : un compte ordinaire la lit, un administrateur l'écrit — en transformant ce qui est là.
  assert.ok(fiche.includes('if (compteOrdinaire(hass)) {') && fiche.includes('aria-disabled="true"'));
  assert.ok(fiche.includes('cfgSet({ [CLE_ALIMENTATION]: (brut) => poserAlimentation(brut, id, neuve) });'));
  assert.ok(fiche.includes('if (neuve === source) return;'), 'rien ne s’écrit pour rien');
});

test('la recherche n’offre pas « Basculer » pour une ampoule sans courant', () => {
  const entete = lire('src/chrome/entete.jsx');
  assert.ok(entete.includes("const togglable = !pont && !sirene && !garde && !coupeePar(st) && (dom === 'light' || dom === 'switch' || dom === 'fan');"));
});

// ── La liste « Alimentée par » ───────────────────────────────────────────────

test('la liste : sa pièce d’abord — lumières puis interrupteurs —, puis les lumières d’ailleurs', () => {
  const pieces = { 'light.ampoule': 'Séjour', 'light.plafonnier': 'Séjour', 'light.lampadaire': 'Séjour', 'switch.prise': 'Séjour', 'light.cuisine': 'Cuisine', 'switch.four': 'Cuisine', 'light.sans': null };
  const noms = { 'light.plafonnier': 'Plafonnier', 'light.lampadaire': 'Lampadaire', 'switch.prise': 'Prise du coin', 'light.cuisine': 'Plafonnier cuisine', 'light.sans': 'Lampe sans pièce' };
  const liste = F.sourcesAlimentation({ id: 'light.ampoule', lampes: ['light.ampoule', 'light.plafonnier', 'light.lampadaire', 'light.cuisine', 'light.sans'],
    switchs: ['switch.prise', 'switch.four'], alim: { 'light.lampadaire': 'switch.prise' }, pieceDe: (x) => pieces[x] || null, nomDe: (x) => noms[x] || x });
  assert.deepEqual(liste, [
    { id: 'light.plafonnier', label: 'Plafonnier' },
    { id: 'switch.prise', label: 'Prise du coin' },
    { id: 'light.sans', label: 'Lampe sans pièce' },
    { id: 'light.cuisine', label: 'Plafonnier cuisine · Cuisine' },
  ]);
  // Ni elle-même, ni une lampe déjà alimentée (le lampadaire), ni l'interrupteur d'une autre pièce (le four).
  assert.equal(liste.some(o => ['light.ampoule', 'light.lampadaire', 'switch.four'].includes(o.id)), false);
});

test('une lampe sans pièce : toutes les lumières de la maison, leur pièce dite', () => {
  const liste = F.sourcesAlimentation({ id: 'light.a', lampes: ['light.a', 'light.b'], switchs: ['switch.x'], pieceDe: (x) => (x === 'light.b' ? 'Bureau' : null), nomDe: (x) => x });
  assert.deepEqual(liste, [{ id: 'light.b', label: 'light.b · Bureau' }]);
});

// ── Les quatre textes neufs, dans les six catalogues ─────────────────────────

test('les textes neufs existent dans les six catalogues', async () => {
  const cles = ['Hors tension · coupée par {nom}', 'Coupée par {nom} : sans courant, elle ne reçoit plus d’ordre.', 'Alimentée par', 'Choisissez l’interrupteur qui lui coupe le courant'];
  for (const lg of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const catalogue = Object.values(await import('../src/langues/' + lg + '.js'))[0];
    for (const c of cles) assert.equal(typeof catalogue[c], 'string', lg + ' : ' + c);
    for (const c of cles.slice(0, 2)) assert.ok(catalogue[c].includes('{nom}'), lg + ' garde le nom');
  }
});
