/* TEST AJOUTÉ (étape 3 IoT, 25/10 ; I36, § 10) — la démo porte chaque cas de l'arrivée d'eau, à 18:20 (le « maintenant » de sa
 * maquette) : la vanne ouverte et ses trois détecteurs secs, leurs piles (76, 91, 54 %) ; `?demo&eau=fuite` (fermée par la maison à
 * 14:02, l'évier sec depuis 14:40, le journal du jour) ; `mouillee` (« Rouvrir quand même ? ») ; `fermee` (à la main, par Camille) ;
 * `plusieurs` (deux vannes d'eau, aucune choisie : toutes fermées) ; `prise` (une prise désignée) ; `gaz` (« Ouvrir le gaz ? ») ;
 * `muet` (un détecteur indisponible, une pile faible). Le faux serveur rend `loggia/eau/etat`, note un geste de la démo au relevé
 * suivant, refuse « Fermer en cas de fuite » au compte ordinaire et fait tourner une vanne trois secondes. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const D = await import('../src/demo.js');
const E = await import('../src/eau.js');
const { personnesDe } = await import('../src/prisesfiche.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const VANNE = 'valve.arrivee_eau', EVIER = 'binary_sensor.fuite_evier', LINGE = 'binary_sensor.fuite_lave_linge', CHAUFFE = 'binary_sensor.fuite_chauffe_eau';
const maison = (variante = null) => D.maisonDeLEauDemo({ variante, quand: T });
const vue = (m, id = VANNE, designee = '') => E.vueVanne({ id, S: m.states, etat: m.etat(), designee, plateforme: () => 'mqtt', maintenant: T });

test('par défaut : la vanne ouverte, trois détecteurs secs et leurs piles', () => {
  const m = maison();
  assert.equal(m.states[VANNE].state, 'open');
  assert.deepEqual([EVIER, LINGE, CHAUFFE].map(id => m.states[id].state), ['off', 'off', 'off']);
  assert.deepEqual(['sensor.fuite_evier_pile', 'sensor.fuite_lave_linge_pile', 'sensor.fuite_chauffe_eau_pile'].map(id => Number(m.states[id].state)), [76, 91, 54]);
  assert.equal(vue(m).phrase.texte, 'Ouverte · aucune fuite');
  assert.deepEqual(m.etat().regle, { actif: true, reagit: true, entite: '', toutes: true, vannes: [VANNE] });
  assert.deepEqual(m.etat().journal, []);
});

test('`fuite` : fermée par la maison à 14:02, l’évier sec depuis 14:40, le journal du jour', () => {
  const m = maison('fuite');
  const v = vue(m);
  assert.deepEqual([v.phrase.texte, v.geste.demander], ['Fermée · fuite à 14:02', 'fuite']);
  assert.equal(E.teteVanne(v, null, T).phrase, 'Depuis 14:02 · fuite : Fuite sous l’évier');
  assert.equal(E.questionVanne(v, { detecteurs: m.etat().detecteurs, noms: { [EVIER]: 'Fuite sous l’évier' }, maintenant: T }).texte, 'Le détecteur Fuite sous l’évier est sec depuis 14:40. La fuite est réparée ?');
  assert.deepEqual(E.journalEau(m.etat().journal, [VANNE, EVIER]).map(l => [l.heure, l.quoi, l.qui]),
    [['14:40', 'Détecteur sec', 'Détecteur'], ['14:02', 'Eau fermée', 'Automatisme'], ['14:02', 'Fuite détectée', 'Détecteur']]);
});

test('`mouillee` : un détecteur voit encore de l’eau — « Rouvrir quand même ? »', () => {
  const m = maison('mouillee');
  const v = vue(m);
  assert.equal(v.geste.demander, 'mouillee');
  assert.equal(E.questionVanne(v).texte, 'Fuite lave-linge voit encore de l’eau. Rouvrir quand même ?');
});

test('`fermee` : fermée à la main, par Camille', () => {
  const m = maison('fermee');
  const v = vue(m);
  assert.deepEqual([v.phrase.texte, v.geste.demander], ['Fermée à 09:15', null], 'rien de mouillé : rouvrir d’un appui');
  assert.equal(E.teteVanne(v, null, T).phrase, 'Depuis 09:15 · fermée à la main');
  assert.deepEqual(E.journalEau(m.etat().journal, [VANNE], { personnes: personnesDe(m.states) }).map(l => l.qui), ['Camille']);
});

test('`plusieurs` : deux vannes d’eau, aucune choisie — toutes fermées, et la règle le dit', () => {
  const m = maison('plusieurs');
  assert.deepEqual([m.states[VANNE].state, m.states['valve.arrosage_jardin'].state], ['closed', 'closed']);
  assert.deepEqual([m.etat().regle.toutes, m.etat().regle.vannes], [true, ['valve.arrivee_eau', 'valve.arrosage_jardin']]);
  assert.equal(vue(m, 'valve.arrosage_jardin').phrase.texte, 'Fermée · fuite à 14:02');
});

test('`prise` : la prise désignée est la vanne d’eau', () => {
  const m = maison('prise');
  const cfg = m.cfg();
  assert.equal(E.vanneDesignee(cfg), 'switch.prise_arrivee_eau');
  assert.ok(!m.states[VANNE], 'la vanne motorisée n’est pas là');
  const v = vue(m, 'switch.prise_arrivee_eau', 'switch.prise_arrivee_eau');
  assert.deepEqual([v.genre, v.phrase.texte, v.geste.mot], ['eau', 'Ouverte · aucune fuite', 'Fermer l’eau']);
  assert.deepEqual(m.etat(cfg).regle.vannes, ['switch.prise_arrivee_eau']);
});

test('`gaz` : une vanne de gaz fermée — « Ouvrir le gaz ? »', () => {
  const m = maison('gaz');
  const v = vue(m, 'valve.gaz_cuisine');
  assert.deepEqual([v.genre, v.phrase.texte, v.geste.demander], ['gaz', 'Fermée', 'gaz']);
});

test('`muet` : un détecteur indisponible, une pile faible', () => {
  const m = maison('muet');
  assert.deepEqual([m.states[LINGE].state, m.states['sensor.fuite_chauffe_eau_pile'].state], ['unavailable', '9']);
  const r = E.rangeesDetecteurs([EVIER, LINGE, CHAUFFE], m.states, {}, { pile: (id) => (id === CHAUFFE ? 9 : 76), maintenant: T });
  assert.equal(E.resumeDetecteurs(r), '1 détecteur indisponible');
  assert.equal(r.find(x => x.id === CHAUFFE).ligne[0].encre, 'var(--o-warn)', 'la pile faible, à la règle des piles');
});

test('le faux serveur : un geste de la démo se note au relevé suivant, au compte de la démo', () => {
  const m = maison();
  m.states[VANNE] = { ...m.states[VANNE], state: 'closed' };
  const e = m.etat(undefined, T + 60000);
  assert.deepEqual([e.vannes[VANNE].ferme, e.vannes[VANNE].cause, e.journal.map(l => [l.quoi, l.user_id])], [true, 'personne', [['fermee', 'demo']]]);
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/eau/etat') return Promise.resolve(eauEtatDemo(states, lireCfgDemo('loggia_alertes')));"));
  const regle = DEMO.slice(DEMO.indexOf("if (msg && msg.type === 'loggia/eau/regle') {"));
  assert.ok(regle.indexOf("if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });") > 0
    && regle.indexOf("vanne: { ...(actions.vanne || {}), actif: !!msg.actif }") > 0, 'refusée au compte ordinaire ; la valeur seule');
  assert.ok(DEMO.includes("toucher(x, vers === 'open' ? 'opening' : 'closing');"), 'une vanne tourne trois secondes');
});
