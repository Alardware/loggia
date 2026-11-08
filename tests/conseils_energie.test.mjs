/* Les conseils d'énergie qu'on peut suivre (07/11, usage étape 11).
 *
 * Le rapport du 04/11 : la vue Énergie montre ce qui s'est passé, pas quoi
 * faire. Ses choix du 07/11 : le geste est « Me prévenir » (un rappel tenu par
 * Home Assistant, rappels.py — jamais couper puis rallumer la prise), et les
 * quatre conseils : heures creuses bientôt, cycle en heures pleines, jour rouge
 * demain, moment le moins cher. Ce qui est garanti ici :
 *  - les heures creuses À VENIR se lisent dans les attributs du capteur
 *    (« 22:30 - 06:30 ») ou s'apprennent de deux journées d'accord ; le
 *    capteur a le dernier mot ; « Heures creuses à partir de… » s'affiche enfin ;
 *  - un cycle fini en heures pleines se dit, avec ce qu'il a coûté de plus ;
 *  - la puce « Me prévenir » : rien sans téléphone, bleu plein une fois posée ;
 *  - la carte du tarif, la fiche d'une prise d'électroménager, le journal et la
 *    démo portent le geste. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const T = await import('../src/tarif.js');
const C = await import('../src/conseils.js');
const { ConseilsEnergie } = await import(new URL('../src/conseilsui.jsx', import.meta.url).href);
const Fiche = (await import(new URL('../src/ficheprise.jsx', import.meta.url).href)).default;
const E = await import('../src/prisesetat.js');
const { setLoggiaState } = await import('../src/state.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const le = (j, h, m = 0) => new Date(2026, 10, j, h, m).getTime();   // novembre 2026, heure de Paris
const iso = (ms) => new Date(ms).toISOString();
/* L'historique d'un capteur binaire, au format de `history/period`, d'après une règle heure par heure. */
function historique(debut, fin, enHc, pas = 1800e3) {
  const out = [];
  for (let t = debut; t <= fin; t += pas) {
    const s = enHc(new Date(t)) ? 'on' : 'off';
    if (!out.length || out[out.length - 1].state !== s) out.push({ state: s, last_changed: iso(t) });
  }
  return out;
}

// ── Les heures creuses à venir (tarif.js) ──────────────────────────────────

test('les plages annoncées se lisent par leur forme, sans liste d’intégrations', () => {
  // Octopus Energy France : `hc_range_1: "22:30 - 06:30"`, au milieu d'autres attributs.
  assert.deepEqual(T.plagesAnnoncees({ hc_schedule_available: true, total_hc_hours: 8, hc_range_1: '22:30 - 06:30', hc_range_1_duration_h: 8, hc_type: 'Unknown' }),
    [{ de: 1350, a: 390 }]);
  // Deux plages, en liste ou en objets ; doublons fondus ; « 00:00 » en fin vaut minuit.
  assert.deepEqual(T.plagesAnnoncees({ plages: ['13:00-16:00', '02h00 – 07h00'], autre: { start: '13:00', end: '16:00' }, soir: { debut: '22:00', fin: '00:00' } }),
    [{ de: 120, a: 420 }, { de: 780, a: 960 }, { de: 1320, a: 1440 }]);
  // Ce qui n'a pas la forme ne dit rien : une date, une heure seule, une plage vide.
  assert.deepEqual(T.plagesAnnoncees({ derniere: '2026-11-07T22:30:00', a: '22:30', b: '10:00 - 10:00', c: 12, d: null }), []);
  assert.deepEqual(T.plagesAnnoncees(null), []);
});

test('les plages apprises : celles d’hier, si avant-hier a eu les mêmes', () => {
  const maintenant = le(7, 18, 20);
  const regle = (d) => (d.getHours() >= 2 && d.getHours() < 7) || (d.getHours() >= 13 && d.getHours() < 16);
  const etats = historique(le(5, 0), maintenant, regle);
  assert.deepEqual(T.plagesApprises(etats, maintenant), [{ de: 120, a: 420 }, { de: 780, a: 960 }]);
  // Le week-end change d'horaires : sans accord des deux jours, on se tait.
  const varie = historique(le(5, 0), maintenant, (d) => (d.getDate() === 6 ? d.getHours() >= 1 && d.getHours() < 7 : regle(d)));
  assert.deepEqual(T.plagesApprises(varie, maintenant), []);
  // Une plage qui passe minuit, apprise en deux morceaux, se refond une fois posée.
  const nuit = historique(le(5, 0), maintenant, (d) => d.getHours() * 60 + d.getMinutes() >= 1350 || d.getHours() * 60 + d.getMinutes() < 390);
  const apprises = T.plagesApprises(nuit, maintenant);
  assert.deepEqual(apprises, [{ de: 0, a: 390 }, { de: 1350, a: 1440 }]);
  assert.deepEqual(T.heuresCreusesAVenir({ apprises, enHc: false, maintenant }), { enHc: false, debut: le(7, 22, 30), fin: le(8, 6, 30) });
});

test('en heures pleines la prochaine plage ; en creuses celle où l’on est ; le capteur a le dernier mot', () => {
  const annoncees = [{ de: 1350, a: 390 }];
  assert.deepEqual(T.heuresCreusesAVenir({ annoncees, enHc: false, maintenant: le(7, 18, 20) }), { enHc: false, debut: le(7, 22, 30), fin: le(8, 6, 30) });
  assert.deepEqual(T.heuresCreusesAVenir({ annoncees, enHc: true, maintenant: le(8, 2, 0) }), { enHc: true, debut: le(7, 22, 30), fin: le(8, 6, 30) });
  // Les plages disent « pleines », le capteur « creuses » : elles sont fausses, rien ne s'annonce.
  assert.equal(T.heuresCreusesAVenir({ annoncees, enHc: true, maintenant: le(7, 18, 20) }), null);
  assert.equal(T.heuresCreusesAVenir({ annoncees, enHc: null, maintenant: le(7, 18, 20) }), null);
  assert.equal(T.heuresCreusesAVenir({ annoncees: [], apprises: [], enHc: false, maintenant: le(7, 18, 20) }), null);
  // Le passage à l'heure d'hiver (25/10/2026) ne décale pas 22:30.
  assert.equal(new Date(T.heuresCreusesAVenir({ annoncees, enHc: false, maintenant: new Date(2026, 9, 25, 12).getTime() }).debut).getHours(), 22);
});

test('la part d’un intervalle dans des plages', () => {
  assert.equal(T.partDans(0, 100, [{ debut: 50, fin: 80 }]), 0.3);
  assert.equal(T.partDans(0, 100, [{ debut: -10, fin: 200 }]), 1);
  assert.equal(T.partDans(5, 5, [{ debut: 0, fin: 10 }]), 0);
});

// ── Les conseils (conseils.js) ─────────────────────────────────────────────

test('le moment le moins cher : les heures creuses d’abord, sinon le creux d’un prix qui varie', () => {
  const t = le(7, 18, 20);
  assert.deepEqual(C.momentEco({ hc: { enHc: false, debut: le(7, 22, 30), fin: le(8, 6, 30) }, maintenant: t }), { sorte: 'hc', enCours: false, debut: le(7, 22, 30), fin: le(8, 6, 30) });
  assert.deepEqual(C.momentEco({ creux: { debut: le(7, 13), fin: le(7, 15), prix: 0.1 }, maintenant: le(7, 14) }), { sorte: 'creux', enCours: true, debut: le(7, 13), fin: le(7, 15) });
  assert.equal(C.momentEco({ creux: { debut: le(7, 13), fin: le(7, 15) }, maintenant: le(7, 16) }), null, 'un creux passé ne dit plus rien');
  assert.equal(C.momentEco({ maintenant: t }), null);
});

test('le dernier cycle, s’il a tourné en heures pleines, et ce qu’il a coûté de plus', () => {
  const plages = [{ debut: le(7, 2), fin: le(7, 7) }, { debut: le(7, 13), fin: le(7, 16) }];
  const prix = { hc: 0.1605, hp: 0.2092 };
  const soir = { debut: iso(le(7, 16, 36)), fin: iso(le(7, 19, 10)), kwh: 1.08 };
  const r = C.dernierCycleHp([{ debut: iso(le(6, 13, 40)), fin: iso(le(6, 16, 14)), kwh: 1.08 }, soir], plages, prix, le(7, 20));
  assert.equal(r.fin, le(7, 19, 10));
  assert.ok(Math.abs(r.surcout - 1.08 * (0.2092 - 0.1605)) < 1e-9);
  // Sans deux prix : le fait, sans chiffre.
  assert.equal(C.dernierCycleHp([soir], plages, null, le(7, 20)).surcout, null);
  // Le cycle de 13:40 à 16:14 a eu ses heures creuses : rien à dire.
  assert.equal(C.dernierCycleHp([{ debut: iso(le(7, 13, 40)), fin: iso(le(7, 16, 14)), kwh: 1.08 }], plages, prix, le(7, 20)), null);
  // Plus de vingt-quatre heures : oublié.
  assert.equal(C.dernierCycleHp([soir], plages, prix, le(8, 20)), null);
});

test('l’électroménager suivi et au repos ; le rappel d’un appareil ; les heures calmes', () => {
  const etat = { prises: {
    'switch.lv': { type: 'lv', suivi: true, cycle: null, cycles: [] },
    'switch.ll': { type: 'll', suivi: true, cycle: { debut: iso(le(7, 18)) }, cycles: [] },
    'switch.sl': { type: 'sl', suivi: false, cycle: null, cycles: [] },
    'switch.nas': { type: 'nas', suivi: false, cycle: null, cycles: [] },
  } };
  assert.deepEqual(C.appareilsAuRepos(etat, ['lv', 'll', 'sl']).map(a => a.id), ['switch.lv']);
  const rappels = { rappels: [{ id: 'a', quand: le(7, 22, 30) / 1000, entite: 'switch.lv', sorte: 'hc' }, { id: 'b', quand: le(7, 22, 30) / 1000, entite: null, sorte: 'hc' }] };
  assert.equal(C.rappelDe(rappels, 'switch.lv', le(7, 18)).id, 'a');
  assert.equal(C.rappelDe(rappels, null, le(7, 18)).id, 'b');
  assert.equal(C.rappelDe(rappels, 'switch.lv', le(7, 23)), null, 'passé, il n’est plus à venir');
  assert.equal(C.dansCalme({ debut: '22:00', fin: '07:00' }, le(7, 22, 30)), true);
  assert.equal(C.dansCalme({ debut: '22:00', fin: '07:00' }, le(7, 21)), false);
  assert.equal(C.dansCalme(null, le(7, 22, 30)), false);
});

// ── À l'écran ───────────────────────────────────────────────────────────────

const LV = 'switch.prise_lv';
const STATES = { [LV]: { entity_id: LV, state: 'on', attributes: { friendly_name: 'Prise lave-vaisselle' } },
  'sensor.tempo_demain': { entity_id: 'sensor.tempo_demain', state: 'Rouge', attributes: {} } };
async function poserEtats({ prises, rappels }) {
  E.reglerPrisesEtat({ hass: { callWS: () => Promise.resolve(prises) }, horloge: { repeter: () => 0, arreter: () => {}, plusTard: () => 0, annuler: () => {}, maintenant: () => Date.now() } });
  E.poserEtatPrises(prises);
  await C.ecrireRappel({ callWS: () => Promise.resolve(rappels) }, {});
}
const prisesLv = (o = {}) => ({ maintenant: iso(Date.now()), notifier: true, config: { protegees: [], types: {}, prevenir: {} },
  prises: { [LV]: { type: 'lv', impose: false, protegee: false, prevenir: false, suivi: true, cycle: null, cycles: [], ...o } } });
const rendre = (eco, EN = { tempoDemain: 'sensor.tempo_demain' }) => renderToStaticMarkup(createElement(ConseilsEnergie, {
  hass: { states: STATES, callWS: () => Promise.resolve({}) }, EN, eco, devise: '€' }));

test('la carte du tarif conseille : le jour rouge, l’appareil à lancer, « Me prévenir »', async () => {
  const debut = Date.now() + 3 * 3600e3;
  await poserEtats({ prises: prisesLv(), rappels: { rappels: [], maintenant: Date.now() / 1000, peut: true, calme: null } });
  const h = new Date(debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const html = rendre({ moment: { sorte: 'hc', enCours: false, debut, fin: debut + 8 * 3600e3 }, plagesHc: [], prix: null });
  for (const mot of ['Conseils', 'Demain : jour rouge', 'Ce qui peut attendre se lance en heures creuses, dès ' + h + '.',
    'Prise lave-vaisselle', 'À lancer en heures creuses, dès ' + h + '.', 'Me prévenir']) assert.ok(html.includes(mot), mot);
  assert.match(html, new RegExp('aria-pressed="false" aria-label="Me prévenir à ' + h + '"'));
});

test('posé, le rappel se lit en bleu plein et s’annule d’un appui ; sans téléphone, pas de puce', async () => {
  const debut = Date.now() + 3 * 3600e3;
  const h = new Date(debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const eco = { moment: { sorte: 'hc', enCours: false, debut, fin: debut + 8 * 3600e3 }, plagesHc: [], prix: null };
  await poserEtats({ prises: prisesLv(), rappels: { rappels: [{ id: 'r1', quand: debut / 1000, entite: LV, sorte: 'hc' }], maintenant: Date.now() / 1000, peut: true, calme: null } });
  let html = rendre(eco, {});
  assert.ok(html.includes('Prévenu à ' + h) && html.includes('aria-pressed="true"') && html.includes('var(--o-accent-fond)'));
  assert.ok(html.includes('aria-label="Prévenu à ' + h + ' — annuler"'));
  await poserEtats({ prises: prisesLv(), rappels: { rappels: [], maintenant: Date.now() / 1000, peut: false, calme: null } });
  html = rendre(eco, {});
  assert.ok(html.includes('À lancer en heures creuses') && !html.includes('Me prévenir'), 'le conseil reste, la puce part');
});

test('un cycle fini en heures pleines se dit ; en heures creuses, « le bon moment », sans puce', async () => {
  const fin = Date.now() - 3600e3;
  const cycles = [{ debut: iso(fin - 154 * 60e3), fin: iso(fin), kwh: 1.08 }];
  await poserEtats({ prises: prisesLv({ cycles }), rappels: { rappels: [], maintenant: Date.now() / 1000, peut: true, calme: null } });
  const finHc = Date.now() + 5 * 3600e3;
  const html = rendre({ moment: { sorte: 'hc', enCours: true, debut: Date.now() - 600e3, fin: finHc }, plagesHc: [{ debut: Date.now() - 600e3, fin: finHc }], prix: { hc: 0.1605, hp: 0.2092 } }, {});
  const h = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  assert.ok(html.includes('Heures creuses jusqu’à ' + h(finHc) + ' : le bon moment pour le lancer.'));
  assert.ok(html.includes('Dernier cycle en heures pleines, fini à ' + h(fin) + ' : 0,05 € de plus qu’en heures creuses.'));
  assert.ok(!html.includes('Me prévenir'));
  // Un appareil en plein cycle n'a rien à lancer ; sans jour rouge ni moment, la section n'existe pas.
  await poserEtats({ prises: prisesLv({ cycle: { debut: iso(Date.now() - 600e3) } }), rappels: { rappels: [], maintenant: Date.now() / 1000, peut: true, calme: null } });
  assert.ok(!rendre({ moment: { sorte: 'hc', enCours: false, debut: finHc, fin: finHc + 3600e3 }, plagesHc: [], prix: null }, {}).includes('Prise lave-vaisselle'));
  assert.equal(rendre({ moment: null, plagesHc: [], prix: null }, {}), '');
});

test('la fiche d’une prise d’électroménager : les heures creuses à venir et « Me prévenir »', async () => {
  const hm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const debut = Date.now() + 2 * 3600e3, fin = Date.now() + 4 * 3600e3;
  const HC = 'binary_sensor.creuses';
  setLoggiaState({ index: null, resolved: { energy: { haids: { hcActive: HC }, prix: [{ valeur: 0.2516, entite: null, compteur: null }] } } });
  await poserEtats({ prises: prisesLv(), rappels: { rappels: [], maintenant: Date.now() / 1000, peut: true, calme: null } });
  const S = { ...STATES, [HC]: { entity_id: HC, state: 'off', attributes: { hc_range_1: hm(debut) + ' - ' + hm(fin) } },
    [LV + '_power']: { entity_id: LV + '_power', state: '0.5', attributes: { device_class: 'power', unit_of_measurement: 'W' } } };
  const html = renderToStaticMarkup(createElement(Fiche, { hass: { states: S, callWS: () => Promise.resolve({}), config: { currency: 'EUR' } },
    id: LV, prise: { prise: true, puissance: LV + '_power', energie: null }, piece: 'Cuisine', bascule: () => null, onFiche: () => {} }));
  assert.ok(html.includes('Heures creuses à partir de ' + hm(debut)), 'la rangée de la fiche');
  assert.ok(html.includes('Une notification à cette heure-là, pour le lancer.') && html.includes('Me prévenir'));
  setLoggiaState({ index: null, resolved: null });
});

// ── Le câblage ──────────────────────────────────────────────────────────────

test('la carte du tarif, la fiche, le journal et la démo portent le geste', () => {
  const histo = lire('src/views/energiehisto.jsx');
  assert.ok(histo.includes("import { ConseilsEnergie, useMomentEco } from '../conseilsui.jsx';"));
  assert.ok(histo.includes('const bascule = mo ? { versHc: !mo.enCours, instant: mo.enCours ? mo.fin : mo.debut } : prochainTarif(plages, Date.now(), enHc);'));
  assert.ok(histo.includes('<ConseilsEnergie hass={hass} EN={EN} eco={eco} devise={devise} />'));
  const fiche = lire('src/ficheprise.jsx');
  assert.ok(fiche.indexOf('<RangeeMomentEco hass={hass} id={id} enCycle={!!(e && e.cycle)} />') > fiche.indexOf("{alerte('prevenir')}"),
    'sous « Prévenir à la fin du cycle », dans le bloc de l’électroménager suivi');
  assert.ok(lire('src/views/journal.jsx').includes("rappels: tr('Rappels'),"));
  const demo = lire('src/demo.js');
  for (const t of ["msg.type === 'loggia/rappels/etat'", "msg.type === 'loggia/rappels/poser'", "msg.type === 'loggia/rappels/annuler'",
    "'binary_sensor.heures_creuses': s(enCreuse(", "VARIANTE_PRISES === 'soir'"]) assert.ok(demo.includes(t), t);
  // Le geste part au serveur, jamais d'un minuteur de l'onglet (ADR 0064).
  const ui = lire('src/conseilsui.jsx');
  assert.ok(!/setTimeout|setInterval/.test(ui) && !/setTimeout|setInterval/.test(lire('src/conseils.js')));
  assert.ok(ui.includes("type: 'loggia/rappels/poser', quand: Math.round(quand / 1000), sorte"));
});
