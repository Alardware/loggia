// ─────────────────────────────────────────────────────────────────────────────
// Les deux chefs dans la démo (26/10) : le programme du poêle — le « Timer »
// d'un MCZ, un `switch` de SON appareil — et un planning de scheduler-component
// (nielsfaber) qui commande aussi le radiateur du bureau, au planning Loggia.
//
// Personne chez qui on essaie n'a scheduler-component : la démo est le seul
// endroit où ce chemin se voit. Le faux moteur les lit comme le serveur
// (`_programme_allume`, `_concurrents`, chauffage.py) — par l'index, la clé de
// traduction et la plateforme —, et refuse comme lui d'allumer un planning par
// dessus un programme qui tourne.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { maisonChauffageDemo } = await import(new URL('../src/demo.js', import.meta.url));

const LUNDI_10H = new Date(2026, 9, 12, 10, 0, 0);
const CHAMBRE = 'select.radiateur_chambre_fil_pilote';
const BUREAU = 'select.radiateur_bureau_fil_pilote';
const POELE = 'climate.poele';
const TIMER = 'switch.poele_timer';
const SCHEDULER = 'switch.schedule_radiateur_bureau';
const par = (etat, cle) => etat.chauffages.find((c) => c.cle === cle);
const etat = (m) => m.ws({ type: 'loggia/chauffage/etat' });
const refus = async (promesse) => { try { await promesse; } catch (e) { return e; } return null; };

test('l’index les range comme Home Assistant : le Timer sur l’appareil du poêle, le planning sans appareil', () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const timer = m.index.entities.find((e) => e.id === TIMER);
  assert.ok(timer, 'le Timer est à l’index');
  assert.equal(timer.device, m.index.entities.find((e) => e.id === POELE).device, 'sur l’appareil du poêle');
  assert.equal(timer.key, 'timer', 'reconnu à sa clé de traduction, jamais au nom affiché');
  const planning = m.index.entities.find((e) => e.id === SCHEDULER);
  assert.ok(planning, 'le planning Scheduler est à l’index');
  assert.deepEqual([planning.platform, planning.device], ['scheduler', null]);
  assert.equal(m.states[SCHEDULER].state, 'on');
  assert.deepEqual(m.states[SCHEDULER].attributes.entities, [BUREAU], 'ses créneaux commandent le radiateur du bureau');
});

test('le radiateur du bureau, au planning Loggia ET commandé par Scheduler : deux chefs, nommés', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const bu = par(await etat(m), BUREAU);
  assert.equal(bu.planning, true, 'le planning Loggia est allumé');
  assert.ok(bu.avertissements.includes('programme_concurrent'));
  assert.deepEqual(bu.concurrents, [{ type: 'scheduler', entite: SCHEDULER, nom: 'Planning radiateur bureau' }]);
  assert.equal(bu.programme, null);
  // Le planning Scheduler éteint ne commande plus rien : l'avertissement s'en va.
  m.states[SCHEDULER] = { ...m.states[SCHEDULER], state: 'off' };
  const apres = par(await etat(m), BUREAU);
  assert.deepEqual([apres.avertissements.includes('programme_concurrent'), apres.concurrents], [false, []]);
});

test('le poêle et son programme allumé : la fiche le nomme', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const po = par(await etat(m), POELE);
  assert.ok(po.avertissements.includes('programme_appareil'));
  assert.equal(po.programme, TIMER);
  assert.equal(m.states[TIMER].attributes.friendly_name, 'Poêle Timer', 'le nom que la fiche dit');
  m.states[TIMER] = { ...m.states[TIMER], state: 'off' };
  const apres = par(await etat(m), POELE);
  assert.deepEqual([apres.avertissements.includes('programme_appareil'), apres.programme], [false, null]);
});

test('les autres chauffages n’ont ni programme ni concurrent', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const ch = par(await etat(m), CHAMBRE);
  assert.deepEqual([ch.programme, ch.concurrents], [null, []]);
  assert.ok(!ch.avertissements.includes('programme_appareil') && !ch.avertissements.includes('programme_concurrent'));
});

test('allumer un planning par-dessus un programme qui tourne se refuse comme sur le serveur', async () => {
  const m = maisonChauffageDemo({ quand: LUNDI_10H });
  const e = await refus(m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } }));
  assert.ok(e, 'refusé');
  assert.equal(e.code, 'chauffage_programme_appareil');
  assert.match(e.message, /: switch\.poele_timer$/, 'il nomme le programme après les deux-points');
  assert.equal(par(await etat(m), POELE).planning, false, 'rien n’est écrit');
  // Le Timer coupé, le planning s'allume.
  m.states[TIMER] = { ...m.states[TIMER], state: 'off' };
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [POELE]: { planning: true } } } });
  assert.equal(par(await etat(m), POELE).planning, true);
  // Un planning DÉJÀ allumé reste allumé : le bureau, commandé par Scheduler, se règle encore.
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: { planning: true, fenetre: 'eco' } } } });
  assert.equal(par(await etat(m), BUREAU).fenetre, 'eco');
  // Éteint puis rallumé avec Scheduler allumé : refusé, en nommant le planning Scheduler.
  await m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: { planning: false } } } });
  const r = await refus(m.ws({ type: 'loggia/chauffage/config', patch: { chauffages: { [BUREAU]: { planning: true } } } }));
  assert.equal(r && r.code, 'chauffage_programme_concurrent');
  assert.match(r.message, /: switch\.schedule_radiateur_bureau$/);
});
