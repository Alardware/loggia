/* La fiche d'une prise après l'audit de l'écran des prises (19/10).
 *
 * Ces tests JOUENT la fiche (tests/crochets.mjs), comme tests/fiche_prise_gestes.test.mjs,
 * dont ils reprennent le monde : un serveur doublé qui note chaque message, l'horloge et le
 * `document` doublés. Ce qui est garanti :
 *  - point 1 « Prévenir à la fin du cycle » ne se propose que pour une prise dont le serveur
 *    SUIT le cycle (`suivi`) ; sans le champ, la prise qui a un capteur de puissance ;
 *  - point 5 un minuteur dont la fin est passée ne se dit plus (« dans 0 min ») ;
 *  - point 7 un échec passager de relecture garde la dernière lecture — le mois, le journal ;
 *  - point 8 un compte ordinaire voit « Protéger » et « Prévenir » inertes D'AVANCE ;
 *  - point 9 Échap défait la demande sans fermer la feuille ;
 *  - point 10 la protection inconnue se dit ;
 *  - point 11a la rangée Protéger dit sa portée. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const FICHE = await import(new URL('../src/ficheprise.jsx', import.meta.url).href);
const Fiche = FICHE.default;
const E = await import('../src/prisesetat.js');
const { setLoggiaState } = await import('../src/state.js');
const SOURCE = readFileSync(new URL('../src/ficheprise.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const T = new Date(2026, 9, 13, 20, 40).getTime();
const iso = (h, m = 0) => new Date(2026, 9, 13, h, m).toISOString();
const NAS = 'switch.prise_nas', PC = 'switch.prise_pc', LV = 'switch.prise_lv';
const capteurs = (id, puissance = true) => ({ prise: true, puissance: puissance ? id + '_power' : null, energie: id + '_energy' });
const attendre = () => new Promise(r => setImmediate(r));

function etats() {
  const sw = (id, etat, nom, depuis) => [id, { entity_id: id, state: etat, last_changed: depuis, last_updated: depuis, attributes: { friendly_name: nom } }];
  const mesure = (id, classe, v, unite) => [id, { entity_id: id, state: String(v), attributes: { device_class: classe, unit_of_measurement: unite } }];
  return Object.fromEntries([
    sw(NAS, 'on', 'Prise NAS (Zephyr)', iso(2)), mesure(NAS + '_power', 'power', 23, 'W'),
    sw(PC, 'on', 'Prise PC Bureau (Atlas)', iso(8, 50)), mesure(PC + '_power', 'power', 146, 'W'), mesure(PC + '_energy', 'energy', 846.1, 'kWh'),
    sw(LV, 'on', 'Prise lave-vaisselle', iso(13, 40)), mesure(LV + '_power', 'power', 0.5, 'W'), mesure(LV + '_energy', 'energy', 507.3, 'kWh'),
  ]);
}
const entree = (o = {}) => ({ type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [], ...o });
const ETAT = (lv = {}, protegees = [NAS]) => ({ maintenant: iso(20, 40), notifier: true, config: { protegees, types: {}, prevenir: {} },
  prises: { [NAS]: entree({ type: 'nas', protegee: protegees.includes(NAS) }), [PC]: entree({ type: 'pc', protegee: protegees.includes(PC) }), [LV]: entree({ type: 'lv', ...lv }) } });

function monde({ etat = ETAT(), serveur = {}, minuteurs = {}, admin = true } = {}) {
  const messages = [], services = [], attentes = [];
  const reponses = {
    'loggia/prises/etat': () => (etat ? Promise.resolve(JSON.parse(JSON.stringify(etat))) : new Promise(() => {})),
    'loggia/minuteurs/etat': () => Promise.resolve({ minuteurs, maintenant: T / 1000 }),
    'recorder/statistics_during_period': () => Promise.resolve({}),
    'logbook/get_events': () => Promise.resolve([]),
    'loggia/volets/manoeuvres': () => Promise.resolve({ lignes: [] }),
    ...serveur,
  };
  const callWS = (msg) => {
    messages.push(msg);
    const f = reponses[msg.type];
    return f ? f(msg) : Promise.reject({ code: 'unknown_command', message: msg.type });
  };
  const hass = { states: etats(), callWS, config: { currency: 'EUR' }, user: { id: 'u', is_admin: admin },
    callService: (d, s, data) => { services.push(d + '.' + s + ' ' + ((data && data.entity_id) || '')); return Promise.resolve(); } };
  setLoggiaState({ index: null, resolved: { energy: { haids: {}, prix: [{ valeur: 0.25, entite: null, compteur: null }] } } });
  const horloge = { repeter: () => 0, arreter: () => {}, plusTard: (f) => { attentes.push(f); return attentes.length; }, annuler: () => {}, maintenant: () => T };
  E.reglerPrisesEtat({ hass: { callWS }, horloge });
  return {
    messages, services, hass, reponses,
    lu(e = etat) { E.poserEtatPrises(JSON.parse(JSON.stringify(e))); },
    de: (type) => messages.filter(x => x.type === type),
    props: (id, o = {}) => ({ hass, id, prise: capteurs(id), piece: 'Bureau', bascule: Interrupteur, onFiche: () => {}, maintenant: T, ...o }),
  };
}
const Interrupteur = ({ on, nom, inerte }) => createElement('span', { role: 'switch', 'aria-checked': !!on, 'aria-disabled': inerte || undefined, 'aria-label': nom });
const couper = (w) => w.services.filter(x => /turn_off|toggle/.test(x));
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn({ h, d }); } finally { h.restaurer(); d.restaurer(); }
}
const interrupteur = (m) => m.trouver(e => e.props && typeof e.props.onToggle === 'function')[0];
const demande = (m) => m.trouver(e => e.props && e.props['data-demande'] !== undefined)[0] || null;
const reglage = (m, nom) => m.trouver(e => e.props && e.props.nom === nom && typeof e.props.cb === 'function')[0] || null;
const alertes = (m) => m.trouver(e => e.props && e.props.role === 'alert').map(e => texteDe(e));
const tuile = (m, titre) => m.trouver(e => e.props && e.props.titre === titre)[0].props;
const journal = (m) => m.trouver(e => e.props && e.props.lu !== undefined && e.props.minuit !== undefined)[0].props;
const rendu = (w, id, o = {}) => renderToStaticMarkup(createElement(Fiche, w.props(id, o)));

// ── Point 1 : « Prévenir à la fin du cycle », seulement si le serveur suit le cycle ──

test('point 1 : « Prévenir à la fin du cycle » suit `suivi` — vrai, faux ; sans le champ, la prise qui mesure', () => dans(async () => {
  const cas = [[{ suivi: true }, true, true], [{ suivi: false }, true, false], [{}, true, true], [{}, false, false]];
  for (const [lv, puissance, attendu] of cas) {
    const w = monde({ etat: ETAT(lv) });
    w.lu();
    const html = rendu(w, LV, { prise: capteurs(LV, puissance) });
    assert.equal(html.includes('Prévenir à la fin du cycle'), attendu, JSON.stringify(lv) + (puissance ? ' avec' : ' sans') + ' capteur de puissance');
  }
}));

// ── Point 5 : un minuteur échu ──

test('point 5 : un minuteur dont la fin est passée ne dit pas « dans 0 min » — la rangée propose les durées', () => dans(async () => {
  const w = monde({ minuteurs: { [PC]: { fin: T / 1000, duree: 30 } } });
  w.lu();
  E.poserMinuteurs({ minuteurs: { [PC]: { fin: T / 1000, duree: 30 } }, maintenant: T / 1000 });
  const html = rendu(w, PC);
  assert.ok(!html.includes('Se coupe à') && !html.includes('dans 0'), 'la fin est passée');
  assert.ok(html.includes('>Coupe la prise au bout du temps choisi.<'));
  E.poserMinuteurs({ minuteurs: { [PC]: { fin: T / 1000 + 600, duree: 30 } }, maintenant: T / 1000 + 1 });
  assert.ok(rendu(w, PC).includes('dans 10 min'), 'témoin : un minuteur qui tourne se dit');
}));

// ── Point 7 : un échec passager garde la dernière lecture ──

test('point 7 : le mois — une relecture qui échoue après une lecture réussie garde le chiffre ; avant, « — »', () => dans(async ({ h }) => {
  let echoue = false;
  const heure = (j, hh, o) => ({ start: new Date(2026, 9, j, hh).getTime(), end: new Date(2026, 9, j, hh + 1).getTime(), ...o });
  const w = monde({ serveur: { 'recorder/statistics_during_period': (msg) => (msg.period !== 'hour' ? Promise.resolve({})
    : echoue ? Promise.reject(new Error('enregistreur')) : Promise.resolve({ [PC + '_energy']: [heure(1, 0, { change: 1 }), heure(12, 23, { change: 2 })] })) } });
  w.lu();
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  const lue = tuile(m, 'Ce mois-ci');
  echoue = true;
  h.avancer(300000);
  await attendre(); m.rendre();
  assert.deepEqual(tuile(m, 'Ce mois-ci'), lue, 'la relecture ratée ne vide pas le mois');
  assert.ok(w.de('recorder/statistics_during_period').filter(x => x.period === 'hour').length >= 2, 'la relecture est bien partie');
}));

test('point 7 : le journal — un logbook qui échoue après une lecture réussie garde ses lignes ; « n’a pas pu être lu » seulement avant', () => dans(async ({ h }) => {
  let echoue = false;
  const ev = [{ when: new Date(2026, 9, 13, 8, 50).getTime() / 1000, state: 'on', entity_id: PC, context_user_id: 'u' }];
  const w = monde({ serveur: { 'logbook/get_events': () => (echoue ? Promise.reject(new Error('logbook')) : Promise.resolve(ev)) } });
  w.lu();
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.deepEqual(journal(m).lu.evenements, ev);
  echoue = true;
  h.avancer(60000);
  await attendre(); m.rendre();
  assert.deepEqual(journal(m).lu.evenements, ev, 'la lecture d’avant tient');
}));

// ── Point 8 : un compte ordinaire ──

test('point 8 : un compte ordinaire voit Protéger et Prévenir inertes d’avance — même apparence, et un appui dit le refus', () => dans(async () => {
  const w = monde({ admin: false, etat: ETAT({ suivi: true }) });
  w.lu();
  const html = rendu(w, LV);
  for (const nom of ['Protéger', 'Prévenir à la fin du cycle']) {
    const b = (html.match(new RegExp('<button type="button" role="switch"[^>]*aria-label="' + nom + '"[^>]*>')) || [''])[0];
    assert.ok(b.includes('aria-disabled="true"') && b.includes('cursor:default'), nom + ' : inerte d’avance — ' + b);
    assert.ok(b.includes('width:46px;height:26px;border-radius:999px'), nom + ' : l’apparence de la bascule de la maison');
  }
  const admin = monde({ etat: ETAT({ suivi: true }) });
  admin.lu();
  assert.ok(!/aria-label="Protéger" aria-disabled/.test(rendu(admin, LV)), 'témoin : un administrateur la manie');
  const m = monter(Fiche, w.props(LV));
  await attendre(); m.rendre();
  m.appuyer(reglage(m, 'Prévenir à la fin du cycle'), 'cb');
  assert.equal(alertes(m).length, 1);
  assert.ok(alertes(m)[0].includes('loggia_prises'), 'le refus nomme la clé');
  assert.equal(w.de('loggia/prises/config').length, 0, 'rien n’est écrit');
}));

// ── Point 9 : Échap ──

test('point 9 : Échap défait la demande — écouté à la capture et arrêté, la feuille ne se ferme pas ; rien n’est coupé', () => dans(async ({ d }) => {
  const w = monde();
  w.lu();
  const m = monter(Fiche, w.props(NAS));
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(demande(m), 'la prise protégée demande');
  let arrete = 0;
  d.emettre('keydown', { key: 'Enter', stopPropagation: () => { arrete += 1; } });
  m.effets();
  assert.ok(demande(m), 'une autre touche ne défait rien');
  assert.equal(arrete, 0, 'et ne s’arrête pas');
  d.emettre('keydown', { key: 'Escape', stopPropagation: () => { arrete += 1; }, preventDefault: () => {} });
  m.effets();
  assert.equal(demande(m), null, 'Échap défait la question');
  assert.equal(arrete, 1, 'l’événement s’arrête : la feuille ne l’entend pas');
  assert.deepEqual(couper(w), []);
  assert.equal(d.ecouteurs('keydown'), 0, 'l’écouteur part avec la question');
  assert.ok(SOURCE.includes("document.addEventListener('keydown', echap, true)"), 'à la capture');
}));

// ── Point 10 : la protection inconnue ──

test('point 10 : la protection pas encore lue — la demande et la rangée Protéger le disent ; lue, rien', () => dans(async () => {
  const w = monde({ etat: null });
  const m = monter(Fiche, w.props(PC));
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(texteDe(demande(m)).includes('Protection inconnue : Loggia demande par prudence.'));
  assert.ok(m.texte().split('Protection inconnue : Loggia demande par prudence.').length - 1 === 2, 'la rangée Protéger aussi');
  const lu = monde();
  lu.lu();
  assert.ok(!rendu(lu, PC).includes('Protection inconnue'), 'lue et libre : rien à dire');
}));

// ── Point 11a : la portée de la protection ──

test('point 11a : protégée, la rangée dit « depuis Loggia » et que la voix et les automatisations ne demandent pas', () => dans(async () => {
  const w = monde();
  w.lu();
  const html = rendu(w, NAS);
  assert.ok(html.includes('>Demande avant de couper depuis Loggia<'));
  assert.ok(html.includes('>L’assistant vocal et les automatisations de Home Assistant ne demandent pas.<'));
  const libre = rendu(w, PC);
  assert.ok(libre.includes('>Coupe sans demander<') && !libre.includes('L’assistant vocal'), 'libre : la phrase d’avant, sans l’aide');
}));

// ── Point 11e : les mots polonais d'une prise ──

test('point 11e : « Indisponible » de la fiche passe par la clé de la prise', () => {
  assert.ok(SOURCE.includes("trSens('Indisponible · prise')"));
  assert.ok(!/motGrand\(tr\('Indisponible'\)/.test(SOURCE));
});
