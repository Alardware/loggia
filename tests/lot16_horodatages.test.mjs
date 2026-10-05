/* Une date ne se lit pas comme un nombre (lot 16, relecture du 05/10).
 *
 * Deux défauts vus par les suites « heure future » et « état unknown », restés
 * hors de leur périmètre :
 *
 * 1. Un capteur HORODATÉ (`device_class: timestamp` — prochaine alarme du
 *    téléphone, dernier passage du facteur — ou un état qui est une date ISO)
 *    posé en tuile (`CvCard`) affichait « 2026 » : `parseFloat` lit l'année.
 *    Le même `parseFloat` le rendait « ouvrable » comme une mesure — un tap
 *    ouvrait une courbe d'années. La fiche (`LigneEntite`) le disait déjà par
 *    `relTime` : passé relatif, futur en heure absolue. La tuile fait pareil.
 *    Une date seule (`device_class: date`) s'écrit par Intl (« 12 oct. ») —
 *    `relTime` la lirait minuit UTC —, une heure seule (« 07:30 », que
 *    `parseFloat` lisait « 7 ») telle quelle.
 * 2. La pastille (`chipTexte`, cartes « chip » et « chips ») écrivait l'état
 *    BRUT : « unknown » en anglais, l'horodatage ISO en clair d'une scène, d'un
 *    bouton, d'un événement, d'une entité `datetime` — et, sans valeur, une
 *    alarme injoignable s'y disait « Armée », une serrure « Déverrouillée ».
 *    Même règle que la tuile : « — » sans valeur ou jamais déclenché,
 *    `relTime` sinon, et la date d'un capteur horodaté au lieu de « 2 026 ».
 *
 * On REND la tuile et la pastille (React côté serveur, ADR 0069) : un crochet
 * de chargement ajoute à App.jsx, pour CE test seul, l'export de `CvCard`,
 * `CvChip` et `chipTexte` sous `?l16hor` — le fichier n'est pas touché. La
 * langue est fixée avant le premier import (règle de la CI), le fuseau aussi,
 * et `Date.now` est figé le temps d'un rendu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?l16hor')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -7), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CvCard as __CvCard, CvChip as __CvChip, chipTexte as __chipTexte };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const { __CvCard: CvCard, __CvChip: CvChip, __chipTexte: chipTexte } = await import(new URL('../src/App.jsx?l16hor', import.meta.url).href);
const { relTime } = await import('../src/format.js');

/* Lundi 5 octobre 2026, 14 h à Paris. */
const MAINTENANT = Date.UTC(2026, 9, 5, 12, 0, 0);
function aFige(fn) {
  const avant = Date.now;
  Date.now = () => MAINTENANT;
  try { return fn(); } finally { Date.now = avant; }
}
const iso = (s) => new Date(MAINTENANT + s * 1000).toISOString();
const PASSE = iso(-2 * 3600), FUTUR = iso(3 * 3600);

const etat = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: PASSE, attributes: { friendly_name: 'Essai', ...attributes } });
const tuile = (st, dense) => aFige(() => renderToStaticMarkup(createElement(CvCard, {
  id: st.entity_id, hass: { states: { [st.entity_id]: st }, callService: () => {} }, onOpen: () => {}, dense,
})));
const pastille = (st) => aFige(() => renderToStaticMarkup(createElement(CvChip, {
  id: st.entity_id, hass: { states: { [st.entity_id]: st } }, dc: { ouvrir: () => {} },
})));
const texte = (st) => aFige(() => chipTexte(st.entity_id, st));
/* Le texte affiché, sans balises : `>Il y a 2 h<` et non une valeur d'attribut. */
const montre = (html, mot) => html.includes('>' + mot + '<');
const ouvrable = (html) => html.includes('class="o-surface"');
const ATTENDU_PASSE = 'Il y a 2 h';
const ATTENDU_FUTUR = aFige(() => relTime(FUTUR)); // « 17:00 » : l'heure, pas « À l'instant »
/* Une date seule, dite par Intl — comparée à Intl et non à une chaîne CLDR. */
const jour = (a, m, j, annee) => new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(annee ? { year: 'numeric' } : {}) });

test('témoin : le futur se dit en heure, le passé en « il y a »', () => {
  assert.equal(aFige(() => relTime(PASSE)), ATTENDU_PASSE);
  assert.match(ATTENDU_FUTUR, /^17:00$/);
});

test('tuile : un capteur horodaté dit sa date comme la fiche, jamais « 2026 »', () => {
  const cas = [
    ['passé, device_class timestamp', etat('sensor.facteur', PASSE, { device_class: 'timestamp' }), ATTENDU_PASSE],
    ['futur, device_class timestamp', etat('sensor.reveil', FUTUR, { device_class: 'timestamp' }), ATTENDU_FUTUR],
    ['passé, état ISO sans device_class', etat('sensor.maj', PASSE), ATTENDU_PASSE],
    ['futur, état ISO sans device_class', etat('sensor.collecte', FUTUR), ATTENDU_FUTUR],
  ];
  for (const [nom, st, attendu] of cas) {
    for (const dense of [true, false]) {
      const html = tuile(st, dense);
      const ou = nom + (dense ? ' (compacte)' : ' (standard)');
      assert.ok(!/>2026\b/.test(html), ou + ' : « 2026 », l’année lue par parseFloat');
      assert.ok(montre(html, attendu), ou + ' : doit dire « ' + attendu + ' »');
      assert.ok(!ouvrable(html), ou + ' : une date n’est pas une mesure, pas de fiche à courbe');
    }
  }
});

test('tuile : une date seule se dit dans la langue, une heure seule telle quelle', () => {
  const cas = [
    ['date de cette année', etat('sensor.vidange', '2026-10-12', { device_class: 'date' }), jour(2026, 10, 12)],
    ['date d’une autre année', etat('sensor.certificat', '2027-01-15', { device_class: 'date' }), jour(2027, 1, 15, true)],
    ['heure seule', etat('sensor.lever', '07:30'), '07:30'],
  ];
  for (const [nom, st, attendu] of cas) {
    const html = tuile(st, true);
    assert.ok(montre(html, attendu), nom + ' : doit dire « ' + attendu + ' »');
    assert.ok(!/>(2026|2027|7)</.test(html), nom + ' : pas le nombre lu par parseFloat');
    assert.ok(!ouvrable(html), nom + ' : pas une mesure');
  }
  // Minuit LOCAL : à l'ouest de Greenwich, `new Date('2026-10-12')` (minuit
  // UTC) tombe le 11 au soir — la date dite serait la veille.
  process.env.TZ = 'America/New_York';
  try {
    assert.ok(montre(tuile(etat('sensor.vidange', '2026-10-12', { device_class: 'date' }), true), jour(2026, 10, 12)), 'le 12, pas le 11');
  } finally { process.env.TZ = 'Europe/Paris'; }
});

test('tuile : une mesure reste une mesure (témoin)', () => {
  const html = tuile(etat('sensor.salon_t', '21.5', { unit_of_measurement: '°C', device_class: 'temperature' }), true);
  assert.ok(montre(html, '21.5 °C'));
  assert.ok(ouvrable(html), 'une mesure s’ouvre');
});

test('pastille : scène, bouton, événement disent « — » ou leur date, jamais l’état brut', () => {
  for (const id of ['scene.cinema', 'button.filtre', 'input_button.sonnette', 'event.sonnette']) {
    assert.equal(texte(etat(id, 'unknown')), '—', id + ' jamais déclenché');
    assert.equal(texte(etat(id, PASSE)), ATTENDU_PASSE, id + ' déclenché');
    const html = pastille(etat(id, 'unknown'));
    assert.ok(!/>unknown</.test(html), id + ' : pas de « unknown » en clair');
    assert.ok(!/\d{4}-\d\d-\d\dT/.test(pastille(etat(id, PASSE))), id + ' : pas d’ISO en clair');
  }
  // Script et automatisation : leur état est on/off — la tuile dit « — », la pastille aussi.
  for (const [id, s] of [['script.depart', 'off'], ['automation.nuit', 'on']]) {
    assert.equal(texte(etat(id, s)), '—', id);
  }
  // Une entité `datetime` : sa date, pas l'ISO.
  assert.equal(texte(etat('datetime.depart', FUTUR)), ATTENDU_FUTUR);
});

test('pastille : sans valeur, « — » — ni l’anglais ni un état inventé', () => {
  const cas = [
    ['sensor.salon_t', 'unknown', { unit_of_measurement: '°C' }],
    ['sensor.salon_t', 'unavailable', { unit_of_measurement: '°C' }],
    ['alarm_control_panel.maison', 'unavailable', {}], // disait « Armée »
    ['lock.porte', 'unavailable', {}], // disait « Déverrouillée »
    ['cover.volet', 'unavailable', {}], // disait « Fermé »
  ];
  for (const [id, s, attrs] of cas) {
    assert.equal(texte(etat(id, s, attrs)), '—', id + ' à ' + s);
    assert.ok(!/>(unknown|unavailable)</.test(pastille(etat(id, s, attrs))), id + ' : pas d’anglais');
  }
});

test('pastille : un capteur horodaté dit sa date, une mesure reste une mesure', () => {
  assert.equal(texte(etat('sensor.facteur', PASSE, { device_class: 'timestamp' })), ATTENDU_PASSE);
  assert.equal(texte(etat('sensor.reveil', FUTUR, { device_class: 'timestamp' })), ATTENDU_FUTUR);
  assert.equal(texte(etat('sensor.vidange', '2026-10-12', { device_class: 'date' })), jour(2026, 10, 12));
  assert.equal(texte(etat('sensor.lever', '07:30')), '07:30');
  assert.equal(texte(etat('sensor.salon_t', '21.54', { unit_of_measurement: '°C' })), '21,5 °C');
  assert.equal(texte(etat('light.salon', 'on', { brightness: 255 })), '100 %', 'témoin : une lumière ne change pas');
  assert.equal(texte(etat('lock.porte', 'locked')), 'Verrouillée', 'témoin : une serrure joignable ne change pas');
});
