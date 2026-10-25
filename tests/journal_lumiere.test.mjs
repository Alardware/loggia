/* Le journal du jour d'une lumière et « Aujourd'hui » (chantier Lumières, § 3.9, § 8 ; L12).
 *
 * La règle des prises devient commune : `journalDuJour` (prisesfiche.js), une
 * règle, deux vocabulaires. Pour une lumière : « Allumée à 45 % », « Éteinte »,
 * « Réglée à 60 % » ; qui, dans l'ordre du § 8 — Réseau, Loggia (une règle),
 * Automatisme, Loggia (un compte), Interrupteur — ; une télécommande
 * (`interrupteurs/<nom>`) est un interrupteur nommé ; le fondu d'une veilleuse
 * est à la règle Nuit, ses paliers ne font pas de ligne. La fiche lit le carnet
 * du serveur (le logbook pour un serveur d'avant ce chantier), le journal de
 * Loggia et le fondu ; un refus de lire la lampe se dit. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?journal_lumiere')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?journal_lumiere'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueLumiere, RmBascule, RmJauge };' };",
  '}',
].join('\n')));
const F = await import('../src/prisesfiche.js');
const LF = await import('../src/lumieresfiche.js');
const { maisonLumieresDemo } = await import('../src/demo.js');
const { setLoggiaState } = await import('../src/state.js');
const APP = await import(new URL('../src/App.jsx?journal_lumiere', import.meta.url).href);
const C = await import(new URL('../src/fichelumiere.jsx', import.meta.url).href);
const L = await import('../src/lumieresetat.js');

const NBSP = '\u00a0';
const h = (hh, mm, j = 14) => new Date(2026, 9, j, hh, mm).getTime();
const MINUIT = h(0, 0);
const s = (ms) => ms / 1000;
const evt = (hh, mm, state, o = {}) => ({ when: s(h(hh, mm)), state, bri: null, reglage: false, context_user_id: null, context_event_type: null, context_name: null, ...o });
const ligne = (o) => ({ module: 'nuit', regle: 'veilleuse', quoi: 'eteindre', cibles: ['light.x'], n: 1, motif: '', detail: '', simule: false, ...o });
const vu = (j) => j.map(x => [new Date(x.t).toTimeString().slice(0, 5), x.quoi, x.qui, x.note]);
const J = (o) => F.journalDuJour({ minuit: MINUIT, vocabulaire: 'lumiere', ...o });
const pct = (n) => n + NBSP + '%';

test('L12 : les mots d’une lumière — « Allumée à 45 % », « Allumée », « Éteinte », « Réglée à 60 % » ; une reprise ne fait pas de ligne', () => {
  const j = J({ evenements: [
    evt(23, 0, 'off', { when: s(h(23, 0, 12)) }),       // la note d’avant la fenêtre : l’état à son ouverture, jamais affichée
    evt(7, 5, 'on', { bri: 45, context_user_id: 'u1' }),
    evt(7, 20, 'on', { bri: 60, reglage: true, context_user_id: 'u1' }),
    evt(7, 40, 'off'),
    evt(7, 41, 'off'),                                   // une reprise au même état
    evt(18, 5, 'on'),                                    // sans niveau : un switch-lumière, ou le logbook d’un serveur d’avant
  ] });
  // ASSERTION MODIFIÉE (audit du 19/10, seconde tranche ; B5) : un geste porté par un compte que Loggia n'a pas fait dit la PERSONNE (`personne`, son nom si une `person.*` répond du compte), plus « Loggia ».
  assert.deepEqual(vu(j), [['18:05', 'Allumée', 'interrupteur', null], ['07:40', 'Éteinte', 'interrupteur', null],
    ['07:20', 'Réglée à ' + pct(60), 'personne', null], ['07:05', 'Allumée à ' + pct(45), 'personne', null]]);
});

test('L12 : qui — une règle de Loggia à ± 60 s, un automatisme et son nom, un compte, l’interrupteur sinon', () => {
  const j = J({ evenements: [evt(6, 0, 'on', { bri: 10 }), evt(6, 3, 'off'), evt(7, 5, 'on', { bri: 30, context_event_type: 'automation_triggered', context_name: 'Réveil' }),
    evt(8, 0, 'off', { context_user_id: 'u1' })],
  lignes: [ligne({ ts: s(h(6, 0)) + 20, regle: 'eclairage', quoi: 'allumer' }), ligne({ ts: s(h(6, 3)) - 30, regle: 'eclairage', quoi: 'eteindre' })] });
  // ASSERTION MODIFIÉE (audit du 19/10, seconde tranche ; B5) : un geste porté par un compte que Loggia n'a pas fait dit la PERSONNE (`personne`, son nom si une `person.*` répond du compte), plus « Loggia ».
  assert.deepEqual(vu(j), [['08:00', 'Éteinte', 'personne', null], ['07:05', 'Allumée à ' + pct(30), 'automatisme', '« Réveil »'],
    ['06:03', 'Éteinte', 'loggia', null], ['06:00', 'Allumée à ' + pct(10), 'loggia', null]]);
});

test('L12 : le réseau ; une télécommande (`interrupteurs/<nom>`) se dit « Interrupteur », avec son nom ; une ligne simulée ou « retenir » n’attribue rien', () => {
  const j = J({ evenements: [evt(9, 0, 'unavailable'), evt(9, 30, 'off'), evt(19, 0, 'on', { bri: 80 }), evt(22, 0, 'off'), evt(22, 30, 'on', { bri: 50 })],
    lignes: [ligne({ ts: s(h(19, 0)) + 2, module: 'interrupteurs', regle: 'Variateur Salon', quoi: 'bouton' }),
      ligne({ ts: s(h(22, 0)), regle: 'coucher', quoi: 'eteindre', simule: true }), ligne({ ts: s(h(22, 30)), regle: 'coucher', quoi: 'retenir' })] });
  assert.deepEqual(vu(j), [['22:30', 'Allumée à ' + pct(50), 'interrupteur', null], ['22:00', 'Éteinte', 'interrupteur', null],
    ['19:00', 'Allumée à ' + pct(80), 'interrupteur', '« Variateur Salon »'], ['09:30', 'De retour', 'reseau', null], ['09:00', 'Ne répond plus', 'reseau', null]]);
});

test('§ 8 : le fondu d’une veilleuse — l’extinction est à la règle Nuit (« Loggia », note « Veilleuse »), ses paliers ne font pas de ligne', () => {
  const evenements = [evt(5, 50, 'on', { bri: 15 }), evt(6, 51, 'on', { bri: 9, reglage: true }), evt(6, 53, 'on', { bri: 4, reglage: true }), evt(6, 55, 'off'),
    evt(7, 30, 'on', { bri: 15 }), evt(7, 31, 'on', { bri: 40, reglage: true })];
  const lignes = [ligne({ ts: s(h(6, 50)) })];
  assert.deepEqual(vu(J({ evenements, lignes, fondu: 5 })), [['07:31', 'Réglée à ' + pct(40), 'interrupteur', null], ['07:30', 'Allumée à ' + pct(15), 'interrupteur', null],
    ['06:55', 'Éteinte', 'loggia', 'Veilleuse'], ['05:50', 'Allumée à ' + pct(15), 'interrupteur', null]], 'passé le fondu et ses 60 s, un geste redevient un geste');
  const sans = vu(J({ evenements, lignes, fondu: 0 })).map(x => x[1] + ' · ' + x[2]);
  assert.ok(sans.includes('Éteinte · interrupteur') && sans.includes('Réglée à ' + pct(4) + ' · interrupteur'), 'sans le fondu, ce que la règle corrige : « Interrupteur » et « Réglée à… »');
  assert.deepEqual(vu(F.journalDuJour({ minuit: MINUIT, evenements: [evt(6, 55, 'off')], lignes })), [['06:55', 'Coupée', 'bouton', null]], 'une prise ne change pas');
});

test('§ 3.9 : le minuteur de Loggia — « Minuteur · 1 h », qui Loggia ; le geste qui suit sa pose reste celui de son auteur', () => {
  const j = J({ evenements: [evt(20, 10, 'on', { bri: 45, context_user_id: 'demo' })],
    lignes: [ligne({ ts: s(h(20, 10)) + 5, module: 'minuteurs', regle: 'minuteur', quoi: 'poser', g: { motif: [['{n} min', { n: 60 }]] } })] });
  // ASSERTION MODIFIÉE (audit du 19/10, seconde tranche ; B5) : un geste porté par un compte que Loggia n'a pas fait dit la PERSONNE (`personne`, son nom si une `person.*` répond du compte), plus « Loggia ». La pose d'un minuteur, elle, reste à Loggia.
  assert.deepEqual(vu(j), [['20:10', 'Minuteur · 1' + NBSP + 'h', 'loggia', null], ['20:10', 'Allumée à ' + pct(45), 'personne', null]]);
});

test('§ 3.9 : la durée allumée depuis minuit — depuis l’état d’avant minuit, jusqu’à maintenant ; « Pas allumée aujourd’hui »', () => {
  const maintenant = h(20, 40);
  assert.equal(LF.minutesAllumee([evt(23, 0, 'on', { when: s(h(23, 0, 13)) }), evt(0, 30, 'off'), evt(18, 5, 'on', { bri: 100 }), evt(19, 0, 'on', { bri: 60, reglage: true })], MINUIT, maintenant), 30 + 155);
  assert.equal(LF.minutesAllumee([evt(23, 0, 'off', { when: s(h(23, 0, 12)) })], MINUIT, maintenant), 0);
  assert.equal(LF.minutesAllumee([evt(9, 0, 'on'), evt(9, 30, 'unavailable'), evt(10, 0, 'on'), evt(10, 15, 'off')], MINUIT, maintenant), 45, 'une panne compte éteinte');
  assert.equal(LF.minutesAllumee([{ when: s(maintenant) - 20, state: 'on' }], MINUIT, maintenant), 1, 'allumée il y a 20 s : une minute, pas « Pas allumée aujourd’hui »');
  assert.equal(LF.minutesAllumee([{ when: s(maintenant) + 3, state: 'on' }], MINUIT, maintenant), 1, 'l’horloge du serveur en avance de 3 s : allumée quand même');
  // Le premier jour du carnet (plan 1, risque 4) : aucune note — l'état que l'écran montre.
  assert.equal(LF.minutesAllumee([], MINUIT, maintenant, { on: true, depuis: new Date(h(18, 5)).toISOString() }), 155);
  assert.equal(LF.minutesAllumee([], MINUIT, maintenant, { on: true, depuis: new Date(h(9, 0, 11)).toISOString() }), 20 * 60 + 40, 'allumée depuis trois jours : toute la journée');
  assert.equal(LF.minutesAllumee([], MINUIT, maintenant, { on: false, depuis: new Date(h(7, 50)).toISOString() }), 0);
  assert.equal(LF.texteDuree(155), 'Allumée 2' + NBSP + 'h' + NBSP + '35');
  assert.equal(LF.texteDuree(0), 'Pas allumée aujourd’hui');
  assert.equal(LF.fonduDe({ config: { veilleuse: { fondu: 5 } } }), 5);
  assert.equal(LF.fonduDe(null), 0, 'la règle Nuit pas lue : pas de fondu');
});

test('§ 8, § 9 : la démo — la veilleuse s’éteint en fondu dans sa journée, et son journal le dit', async () => {
  const m = maisonLumieresDemo({ quand: h(20, 40) });
  const id = 'light.veilleuse_chambre_lino';
  const { evenements } = await m.journal(id);
  const lignes = m.regles().filter(l => (l.cibles || []).includes(id));
  assert.deepEqual(vu(J({ evenements, lignes, fondu: m.nuit().veilleuse.fondu })), [['20:30', 'Allumée à ' + pct(15), 'automatisme', '« Coucher de Lino »'],
    ['06:55', 'Éteinte', 'loggia', 'Veilleuse'], ['05:50', 'Allumée à ' + pct(15), 'interrupteur', null]]);
  assert.equal(LF.minutesAllumee(evenements, MINUIT, h(20, 40)), 65 + 10);
});

/* ── La fiche : ce qu'elle lit, et ce qu'elle dit ──────────────────────────────── */

function poser(ws) {
  setLoggiaState({ index: null, ent: { switchLights: [] }, cfg: {}, resolved: null });
  L.reglerLumieresEtat({ hass: { callWS: () => new Promise(() => {}) }, horloge: { repeter: () => 0, arreter() {}, plusTard: () => 0, annuler() {}, maintenant: () => Date.now() } });
  const commandes = [];
  const debut = new Date(h(18, 5));   // le 14/10, le jour de la fiche (`T`)
  const hass = { states: { 'light.bureau': { entity_id: 'light.bureau', state: 'on', last_changed: debut.toISOString(), last_updated: debut.toISOString(),
    attributes: { friendly_name: 'Plafonnier Bureau', supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 255 } } },
  callService: () => Promise.resolve(), callWS: (msg) => { commandes.push(msg); return ws(msg); } };
  return { commandes, hass };
}
// La fiche telle que la coquille la monte, à 20:40 le 14/10 : sa journée ne dépend pas de l’heure où le test tourne.
const T = h(20, 40);
const Fiche = ({ hass, id }) => C.default({ id, vue: APP.useVueLumiere(hass, id), bascule: APP.RmBascule, jauge: APP.RmJauge, maintenant: T });
async function dans(fn) {
  const hf = horlogeFausse(), d = documentFaux();
  hf.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  try { return await fn(); } finally { hf.restaurer(); d.restaurer(); }
}
// Les réponses doublées arrivent en quelques tours de la file des promesses (le carnet, puis le logbook s'il ne dit rien).
const attendre = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const aujourdhui = (m) => m.trouver(e => e.type && e.type.name === 'Aujourdhui')[0];

test('§ 3.9 : la fiche lit le carnet, le journal de Loggia depuis la veille et le fondu ; quatre lignes au plus, la durée à droite', () => dans(async () => {
  const evenements = [14, 15, 16, 17, 18, 19].map((hh, i) => evt(hh, 0, i % 2 ? 'off' : 'on', { bri: i % 2 ? null : 70 }));
  const w = poser((msg) => Promise.resolve(msg.type === 'loggia/lumieres/journal' ? { evenements } : msg.type === 'loggia/volets/manoeuvres' ? { lignes: [], couvre_depuis: null }
    : msg.type === 'loggia/nuit/etat' ? { config: { veilleuse: { fondu: 5 } } } : {}));
  const m = monter(Fiche, { hass: w.hass, id: 'light.bureau' });
  await attendre();
  m.rendre();
  const depuis = Math.floor((MINUIT - 24 * 3600000) / 1000);
  assert.deepEqual(w.commandes.filter(c => c.type !== 'loggia/lumieres/etat' && c.type !== 'loggia/minuteurs/etat'), [
    { type: 'loggia/lumieres/journal', entity_id: 'light.bureau' }, { type: 'loggia/volets/manoeuvres', entity_id: 'light.bureau', depuis }, { type: 'loggia/nuit/etat' }]);
  const a = aujourdhui(m);
  assert.deepEqual(a.props.lu, { evenements, lignes: [], fondu: 5 });
  const vue = monter(C.Aujourdhui, a.props);
  const t = vue.texte();
  assert.ok(t.startsWith('Aujourd’hui' + 'Allumée 3' + NBSP + 'h'), 'le titre, et la durée allumée à droite : trois heures (14:00–15:00, 16:00–17:00, 18:00–19:00)');
  assert.ok(t.includes('19:00Éteinte') && t.includes('16:00Allumée à ' + pct(70)) && !t.includes('15:00'), 'les quatre plus récentes, dans l’ordre');
  assert.equal(vue.trouver(e => e.props && e.props.className === 'o-prise-journal-ligne').length, 4, 'les quatre plus récentes');
}));

test('§ 3.9 : un compte qui ne peut pas lire la lampe — « Le journal n’a pas pu être lu. », sans détour par le logbook ; un serveur d’avant — le logbook', () => dans(async () => {
  const refus = poser((msg) => (msg.type === 'loggia/lumieres/journal' ? Promise.reject({ code: 'unauthorized' }) : Promise.resolve({ lignes: [] })));
  const m = monter(Fiche, { hass: refus.hass, id: 'light.bureau' });
  await attendre();
  m.rendre();
  assert.ok(!refus.commandes.some(c => c.type === 'logbook/get_events'), 'un refus ne se contourne pas');
  const lu = aujourdhui(m).props.lu;
  assert.equal(lu.evenements, null);
  assert.ok(monter(C.Aujourdhui, { lu, minuit: MINUIT, maintenant: T }).texte().includes('Le journal n’a pas pu être lu.'));
  const avant = poser((msg) => (msg.type === 'loggia/lumieres/journal' ? Promise.reject({ code: 'unknown_command' })
    : msg.type === 'logbook/get_events' ? Promise.resolve([{ when: s(h(20, 10)), state: 'on', context_user_id: null }]) : Promise.resolve({ lignes: [] })));
  const m2 = monter(Fiche, { hass: avant.hass, id: 'light.bureau' });
  await attendre();
  m2.rendre();
  const lu2 = aujourdhui(m2).props.lu;
  assert.ok(avant.commandes.some(c => c.type === 'logbook/get_events' && c.entity_ids[0] === 'light.bureau'), 'le logbook de Home Assistant, depuis la veille');
  const t2 = monter(C.Aujourdhui, { lu: lu2, minuit: MINUIT, maintenant: T }).texte();
  assert.ok(t2.includes('20:10Allumée') && t2.includes('Allumée 30' + NBSP + 'min'), 'sans niveau : « Allumée », et la durée se compte quand même');
  assert.ok(monter(C.Aujourdhui, { lu: null, minuit: MINUIT, maintenant: T }).texte().includes('Chargement…'));
}));

test('le premier jour du carnet : il ne dit rien (`[]`) — le logbook de Home Assistant, et la durée prend l’état que la fiche montre', () => dans(async () => {
  const vide = poser((msg) => (msg.type === 'loggia/lumieres/journal' ? Promise.resolve({ evenements: [] })
    : msg.type === 'logbook/get_events' ? Promise.resolve([]) : Promise.resolve({ lignes: [] })));
  const m = monter(Fiche, { hass: vide.hass, id: 'light.bureau' });
  await attendre();
  m.rendre();
  assert.ok(vide.commandes.some(c => c.type === 'logbook/get_events'), 'le carnet ne sait pas ce qui précède son installation');
  const a = aujourdhui(m);
  assert.deepEqual(a.props.lu.evenements, [], 'un logbook vide n’est pas un échec');
  const t = monter(C.Aujourdhui, a.props).texte();
  assert.ok(t.includes('Allumée 2' + NBSP + 'h' + NBSP + '35') && t.includes('Rien depuis minuit.'), 'allumée depuis 18:05 : la durée le dit, sans ligne inventée');
}));

/* ── Passe de finition 9 bis B ─────────────────────────────────────────────────── */

test('point 12, scénario A : le premier jour du carnet — `[off 23:00]` seul : la lampe était allumée jusque-là, la durée ne dit plus « Pas allumée aujourd’hui »', () => {
  const tard = h(23, 40);
  // Le serveur ne note pas le premier état qu'il voit (`noter`), le logbook d'un serveur d'avant non plus : allumée au redémarrage, éteinte à 23:00, il ne reste que `off`.
  const minutes = LF.minutesAllumee([evt(23, 0, 'off')], MINUIT, tard);
  assert.equal(minutes, 23 * 60, 'allumée depuis minuit au moins — elle l’était avant sa première note : 23 h');
  assert.equal(LF.texteDuree(minutes), 'Allumée 23' + NBSP + 'h');
  assert.equal(LF.minutesAllumee([evt(23, 0, 'off')], MINUIT, tard, { on: false, depuis: new Date(h(23, 0)).toISOString() }), 23 * 60, 'une note l’emporte sur l’état montré, qui ne sert qu’à une lampe sans aucune note');
  // Un premier `on` : avant lui, éteinte — ce qui se comptait ne change pas.
  assert.equal(LF.minutesAllumee([evt(10, 0, 'on'), evt(11, 0, 'off')], MINUIT, tard), 60);
  // Un premier réglage : déjà allumée (un réglage ne change pas l'état), de minuit à maintenant.
  assert.equal(LF.minutesAllumee([evt(9, 0, 'on', { bri: 40, reglage: true })], MINUIT, h(20, 40)), 20 * 60 + 40);
  // Une panne en premier : on ne sait pas ce qui la précédait, elle compte éteinte comme avant.
  assert.equal(LF.minutesAllumee([evt(9, 0, 'unavailable'), evt(10, 0, 'on'), evt(10, 15, 'off')], MINUIT, tard), 15);
  // Une note d'AVANT minuit dit l'état à minuit : éteinte hier soir, elle l'est encore — une reprise `off` n'y change rien.
  assert.equal(LF.minutesAllumee([evt(23, 0, 'off', { when: s(h(23, 0, 13)) }), evt(8, 0, 'off')], MINUIT, tard), 0);
});

test('point 12, scénario B : la note d’avant minuit est un RÉGLAGE — elle dit « allumée », la durée la garde', () => {
  const maintenant = h(20, 40);
  // Allumée lundi à 20:00, réglée à 20:05, éteinte mercredi à 08:00 : le carnet garde la dernière note d'avant la fenêtre (`elaguer`), ici un réglage.
  const lundi = evt(20, 5, 'on', { when: s(h(20, 5, 12)), bri: 60, reglage: true });
  assert.equal(LF.minutesAllumee([lundi, evt(8, 0, 'off')], MINUIT, maintenant), 8 * 60, 'allumée de minuit à 08:00');
  assert.equal(LF.minutesAllumee([lundi, evt(8, 0, 'off'), evt(18, 5, 'on', { bri: 100 }), evt(19, 0, 'on', { bri: 60, reglage: true })], MINUIT, maintenant), 8 * 60 + 155);
  // Allumée depuis lundi, réglée dans la journée, jamais éteinte : toute la journée — sans le réglage d'avant, la fiche écrivait « Pas allumée aujourd'hui ».
  assert.equal(LF.minutesAllumee([lundi, evt(9, 0, 'on', { bri: 40, reglage: true }), evt(19, 0, 'on', { bri: 70, reglage: true })], MINUIT, maintenant), 20 * 60 + 40);
  assert.equal(LF.minutesAllumee([lundi], MINUIT, maintenant), 20 * 60 + 40, 'le réglage d’avant est la seule note : allumée depuis, jusqu’à maintenant');
});

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B5) : la fiche passe les `person.*` du relevé au journal — la pastille dit le nom. */
test('B5 : dans la fiche, la pastille d’un geste depuis un compte dit le NOM de la personne, « Un compte » quand aucune personne ne répond du compte', () => dans(async () => {
  const carnet = { evenements: [evt(7, 5, 'on', { bri: 45, context_user_id: 'abc' }), evt(8, 0, 'off', { context_user_id: 'zzz' })] };
  const w = poser((msg) => (msg.type === 'loggia/lumieres/journal' ? Promise.resolve(carnet) : msg.type === 'loggia/volets/manoeuvres' ? Promise.resolve({ lignes: [] }) : Promise.resolve({ config: { veilleuse: { fondu: 5 } } })));
  w.hass.states['person.camille'] = { entity_id: 'person.camille', state: 'home', attributes: { friendly_name: 'Camille', user_id: 'abc' } };
  const m = monter(Fiche, { hass: w.hass, id: 'light.bureau' });
  await attendre();
  m.rendre();
  const a = aujourdhui(m);
  assert.deepEqual(a.props.personnes, { abc: 'Camille' }, 'la fiche passe les personnes du relevé');
  // « Aujourd'hui » est un enfant : on le joue avec ce que la fiche lui passe.
  const r = monter(C.Aujourdhui, a.props);
  const pastilles = r.trouver(e => e.props && e.props['data-qui'] !== undefined).map(texteDe);
  assert.deepEqual(pastilles, ['Un compte', 'Camille'], 'la plus récente d’abord : le compte inconnu, puis Camille — ' + r.texte());
}));

