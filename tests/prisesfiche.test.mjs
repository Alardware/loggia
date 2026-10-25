/* Ce que la fiche d'une prise calcule (chantier Prises, § 3.6 à 3.8, § 7 ;
 * ADR 0195, 0196) : src/prisesfiche.js, pur.
 *
 *  - la courbe des 24 heures : son plafond rond, ses étiquettes, ses chemins,
 *    le trait de l'heure, la bande de chaque cycle et la ligne du dernier ;
 *  - ce que dit la confirmation, et le réseau d'une prise Zigbee ;
 *  - la configuration : la liste des protégées part ENTIÈRE, un type `null`
 *    rend la prise à son nom, treize appareils et jamais la sirène ;
 *  - l'énergie heure par heure, le coût d'un cycle, les tarifs de la maison,
 *    la devise, la ligne sous les tuiles ;
 *  - les durées du minuteur ;
 *  - le Journal du jour : « qui », la veille lue et la reprise au même état (F1) ;
 *  - un nombre et son unité, liés par une espace insécable dans les phrases (F7).
 * À l'heure de Paris : la fiche dit l'heure du navigateur. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const F = await import('../src/prisesfiche.js');
const { TYPES_PRISE } = await import('../src/prises.js');
const T = await import('../src/tarif.js');

const MINUIT = new Date(2026, 9, 13).getTime();
const h = (n, m = 0) => MINUIT + (n * 60 + m) * 60000;
const iso = (n, m = 0) => new Date(h(n, m)).toISOString();
const LENDEMAIN = new Date(2026, 9, 14).getTime();

test('le plafond de l’échelle : 10, 20, 25 ou 50 × 10ⁿ W, 10 W au moins ; son étiquette', () => {
  assert.deepEqual([4, 10, 11, 23, 146, 200, 201, 1950, 2100, 7400].map(F.maxRond), [10, 10, 20, 25, 200, 200, 250, 2000, 2500, 10000]);
  assert.equal(F.maxRond(null), 10, 'rien de lu : une échelle quand même');
  assert.deepEqual([10, 200, 1000, 2500].map(F.etiquetteW), ['10 W', '200 W', '1 kW', '2,5 kW']);
});

test('la courbe des 24 heures : de minuit au minuit suivant, la puissance du moment en dernier point, le trait de l’heure', () => {
  const c = F.courbeJournee([{ t: h(6), w: 100 }, { t: h(12), w: 150 }], { watts: 50, maintenant: h(18), minuit: MINUIT, lendemain: LENDEMAIN });
  assert.equal(c.max, 200);
  assert.equal(c.ligne, 'M100 55 L200 27.5 L300 82.5', '6 h au quart, midi au milieu, 18 h aux trois quarts — sur 400 × 110');
  assert.ok(c.aire.endsWith(' L300 110 L100 110 Z'));
  assert.equal(c.x, 300);
  assert.deepEqual(F.courbeJournee([], { watts: null, maintenant: h(9), minuit: MINUIT, lendemain: LENDEMAIN }), { ligne: null, aire: null, max: 10, x: 150 }, 'rien à tracer : le cadre et l’heure');
});

test('les cycles du jour : leurs bandes, celle d’un cycle en cours jusqu’à maintenant ; la ligne du DERNIER fini', () => {
  const cycles = [{ debut: iso(-20), fin: iso(-18), kwh: 0.9 }, { debut: iso(6), fin: iso(9), kwh: 0.5 }, { debut: iso(13, 40), fin: iso(16, 14), kwh: 1.08 }];
  const b = F.bandesCycles(cycles, { debut: iso(19) }, { minuit: MINUIT, lendemain: LENDEMAIN, maintenant: h(20) });
  assert.deepEqual(b, [{ x: 100, l: 50 }, { x: 227.8, l: 42.8 }, { x: 316.7, l: 16.7 }], 'celui d’hier soir n’est pas d’aujourd’hui');
  assert.equal(F.ligneCycle(cycles, h(20)), 'Cycle de 13:40 à 16:14 · 1,08\u00A0kWh', 'les cycles vont du plus ancien au plus récent : la ligne dit le dernier — « 1,08 » et « kWh » ne se séparent pas (F7)');
  assert.equal(F.ligneCycle(cycles, h(20), () => '0,27 €'), 'Cycle de 13:40 à 16:14 · 1,08\u00A0kWh · 0,27 €');
  assert.equal(F.ligneCycle([{ debut: iso(13, 40), fin: iso(16, 14), kwh: null }], h(20)), 'Cycle de 13:40 à 16:14', 'des kWh illisibles se taisent');
  assert.equal(F.ligneCycle(cycles.slice(0, 1), h(20)), null, 'aucun cycle aujourd’hui');
});

test('la confirmation : un serveur, ses disques ; le reste, l’arrêt net ; sans mesure, « allumée »', () => {
  // Le nombre et son unité ne se séparent pas en bout de ligne (F7) : à 360 px, « (4 » finissait la ligne et « W). Le couper… » commençait la suivante.
  assert.equal(F.texteConfirmation('nas', 'Prise NAS (Zephyr)', 23), 'Prise NAS (Zephyr) est en marche (23\u00A0W). Le couper d’un coup peut abîmer ses disques.');
  assert.equal(F.texteConfirmation('pc', 'Prise PC', 1950), 'Prise PC est en marche (1,95\u00A0kW). L’appareil s’arrêtera net.');
  assert.equal(F.texteConfirmation('prise', 'Prise séjour', null), 'Prise séjour est allumée. L’appareil s’arrêtera net.');
});

test('une prise Zigbee : son appareil passe par le pont de Zigbee2MQTT, ou elle est de ZHA', () => {
  const index = { entityMeta: new Map([['switch.z2m', { deviceId: 'd1', platform: 'mqtt' }], ['switch.zha', { deviceId: 'd2', platform: 'zha' }], ['switch.wifi', { deviceId: 'd3', platform: 'tuya' }], ['switch.libre', {}]]),
    deviceMeta: new Map([['d1', { via: 'pont' }], ['pont', { manufacturer: 'Zigbee2MQTT', model: 'Bridge' }], ['d2', {}], ['d3', { integration: 'tuya', via: null }]]) };
  assert.deepEqual(['switch.z2m', 'switch.zha', 'switch.wifi', 'switch.libre', 'switch.absente'].map(id => F.estZigbee(index, id)), [true, true, false, false, false]);
  assert.equal(F.estZigbee(null, 'switch.z2m'), false);
});

test('la configuration : les protégées partent ENTIÈRES, un type nul rend la prise à son nom, prévenir faux se retire', () => {
  const c = { protegees: ['switch.nas'], types: { 'switch.poele': 'radia' }, prevenir: { 'switch.lv': true } };
  assert.deepEqual(F.patchProtegee(c, 'switch.pc', true), { protegees: ['switch.nas', 'switch.pc'] });
  assert.deepEqual(F.patchProtegee(c, 'switch.nas', false), { protegees: [] });
  assert.deepEqual(F.patchProtegee({ protegees: ['switch.b', 'switch.a', 'switch.a'] }, 'switch.c', true), { protegees: ['switch.a', 'switch.b', 'switch.c'] }, 'triée, sans doublon');
  assert.deepEqual(F.patchType('switch.poele', null), { types: { 'switch.poele': null } });
  assert.deepEqual(F.patchPrevenir('switch.lv', false), { prevenir: { 'switch.lv': false } });
  assert.deepEqual(F.fusionPrises(c, { types: { 'switch.poele': null, 'switch.pc': 'pc' }, prevenir: { 'switch.lv': false } }),
    { protegees: ['switch.nas'], types: { 'switch.pc': 'pc' }, prevenir: {} });
  assert.deepEqual(F.fusionPrises(null, { protegees: ['switch.x'] }), { protegees: ['switch.x'], types: {}, prevenir: {} });
});

test('« Ce qu’elle alimente » : treize appareils, dans l’ordre du serveur, jamais la sirène, puis « Deviner d’après le nom »', () => {
  assert.deepEqual(F.TYPES_IMPOSABLES, ['nas', 'pc', 'lv', 'll', 'sl', 'fer', 'frigo', 'tv', 'cafe', 'radia', 'box', 've', 'prise']);
  assert.ok(F.TYPES_IMPOSABLES.every(t => TYPES_PRISE[t]) && !F.TYPES_IMPOSABLES.includes('siren'));
  const o = F.optionsType();
  assert.equal(o.length, 14);
  assert.deepEqual(o[0], { id: 'nas', label: 'Serveur NAS' });
  assert.deepEqual(o.at(-1), { id: 'deviner', label: 'Deviner d’après le nom' });
});

test('l’énergie heure par heure : le compteur, sinon la puissance moyenne ; aujourd’hui fait le total de la carte', () => {
  const stats = { 'sensor.e': [{ start: h(1), change: 0.2 }, { start: new Date(h(2)).toISOString(), change: 0.3 }], 'sensor.p': [{ start: h(1), mean: 500 }, { start: h(2), mean: null }] };
  assert.deepEqual(F.kwhParHeure(stats, 'sensor.e', 'sensor.p'), [{ debut: h(1), kwh: 0.2 }, { debut: h(2), kwh: 0.3 }]);
  assert.deepEqual(F.kwhParHeure(stats, null, 'sensor.p'), [{ debut: h(1), kwh: 0.5 }], 'sans compteur : 500 W pendant une heure, 0,5 kWh');
  assert.deepEqual(F.kwhParHeure({}, 'sensor.e', null), []);
  const jour = F.heuresAujourdhui([{ debut: h(-1), kwh: 9 }, { debut: h(8), kwh: 0.25 }], 0.42, { minuit: MINUIT, maintenant: h(9, 30) });
  assert.deepEqual(jour.map(x => [x.debut, Math.round(x.kwh * 100) / 100]), [[h(8), 0.25], [h(9), 0.17]], 'l’heure en cours prend ce qui manque au total du jour');
  assert.deepEqual(F.heuresAujourdhui([], null, { minuit: MINUIT, maintenant: h(9) }), []);
});

test('le coût d’un cycle : ses kWh au prix des heures qu’il traverse, au prorata du temps', () => {
  const HC = { prix: 0.16, heures: { [h(13)]: 0.4, [h(14)]: 0.5 } }, HP = { prix: 0.2, heures: { [h(15)]: 0.3 } };
  assert.ok(Math.abs(F.coutCycle({ debut: iso(14), fin: iso(16), kwh: 1 }, [HC, HP]) - (0.16 + 0.2) / 2) < 1e-9);
  assert.equal(F.coutCycle({ debut: iso(14), fin: iso(15), kwh: 2 }, [{ prix: 0.25, heures: {} }]), 0.5);
  assert.equal(F.coutCycle({ debut: iso(14), fin: iso(15), kwh: null }, [{ prix: 0.25, heures: {} }]), null);
  assert.equal(F.coutCycle({ debut: iso(14), fin: iso(15), kwh: 1 }, []), null, 'aucun prix : aucun euro');
});

test('les tarifs de la maison : les deux prix de la fiche Énergie et leurs compteurs, sinon le tableau de bord, sinon le seul prix', () => {
  const num = (x) => ({ 'sensor.prix_hc': 0.1605, 'sensor.prix_hp': 0.2092, 'sensor.prix': 0.25 })[x] ?? null;
  assert.deepEqual(F.tarifsMaison({ hcPrice: 'sensor.prix_hc', hpPrice: 'sensor.prix_hp', consoJourHc: 'sensor.hc', consoJourHp: 'sensor.hp' }, [{ valeur: 0.3 }], num),
    [{ prix: 0.1605, compteur: 'sensor.hc' }, { prix: 0.2092, compteur: 'sensor.hp' }]);
  assert.deepEqual(F.tarifsMaison({}, [{ valeur: 0.21, compteur: 'sensor.c1' }, { entite: 'sensor.prix', compteur: 'sensor.c2' }, { entite: 'sensor.rien' }], num),
    [{ prix: 0.21, compteur: 'sensor.c1' }, { prix: 0.25, compteur: 'sensor.c2' }]);
  assert.deepEqual(F.tarifsMaison({ hpPrice: 'sensor.prix_hp' }, [], num), [{ prix: 0.2092, compteur: null }]);
  assert.deepEqual(F.tarifsMaison({}, [], num), []);
  assert.deepEqual(F.connexionsHeures([{ prix: 0.16, compteur: 'sensor.hc' }, { prix: 0.2, compteur: null }], { 'sensor.hc': [{ start: h(2), change: 0.5 }] }),
    [{ prix: 0.16, heures: { [h(2)]: 0.5 } }, { prix: 0.2, heures: {} }]);
});

test('la devise de la maison, le prix d’un kWh, et la ligne sous les tuiles', () => {
  assert.match(F.enDevise(0.27, 'EUR'), /^0,27\s€$/);
  assert.match(F.enDevise(1.5, 'CHF'), /^1,50\sCHF$/);
  assert.match(F.prixKwh(0.2516, 'EUR'), /^0,2516 €\/kWh$/);
  assert.match(F.prixKwh(0.25, 'EUR'), /^0,25 €\/kWh$/);
  // Les kWh et le prix ne se coupent pas de leur unité en bout de ligne (F7).
  assert.match(F.ligneCompteur({ total: 212.6, tarifs: [{ prix: 0.2516 }], devise: 'EUR' }), /^Compteur total : 212,6\u00A0kWh · tarif 0,2516\u00A0€\/kWh \(vue Énergie\)$/);
  assert.equal(F.ligneCompteur({ total: 212.6, tarifs: [{ prix: 0.16 }, { prix: 0.21 }], devise: 'EUR' }), 'Compteur total : 212,6\u00A0kWh · au tarif de chaque heure (vue Énergie)');
  assert.equal(F.ligneCompteur({ estime: true, tarifs: [], devise: 'EUR' }), 'estimés d’après la puissance', 'sans compteur : estimés, et pas de compteur total');
  assert.equal(F.ligneCompteur({ total: null, tarifs: [] }), '');
});

test('le minuteur : 15 min, 30 min, 1 h, 2 h d’un appui ; +15 min et +1 h quand il tourne', () => {
  assert.deepEqual(F.DUREES_MINUTEUR, [15, 30, 60, 120]);
  assert.deepEqual(F.AJOUTS_MINUTEUR, [15, 60]);
});

/* ── Le journal du jour, et qui (tâche 11 ; § 3.9, § 8, P9) ── */
const evt = (hh, mm, state, o = {}) => ({ when: h(hh, mm) / 1000, state, entity_id: 'switch.p', ...o });
const ligne = (o) => ({ cibles: ['switch.p'], n: 1, detail: '', simule: false, ...o });

test('qui : chaque cas du § 8, dans son ordre', () => {
  const j = F.journalDuJour({ minuit: MINUIT, evenements: [
    evt(6, 30, 'on', { context_event_type: 'automation_triggered', context_name: 'Matin', context_user_id: null }),
    evt(8, 50, 'off'),
    evt(9, 0, 'on', { context_user_id: 'abc' }),
    evt(10, 0, 'off'),
    evt(14, 20, 'unavailable'),
    evt(14, 50, 'on'),
  ], lignes: [ligne({ ts: h(10, 0, 30) / 1000, module: 'minuteurs', regle: 'minuteur', quoi: 'eteindre', motif: 'minuteur' })] });
  assert.deepEqual(j.map(x => [new Date(x.t).getHours() + ':' + new Date(x.t).getMinutes(), x.quoi, x.qui, x.note]), [
    ['14:50', 'De retour', 'reseau', null],
    ['14:20', 'Ne répond plus', 'reseau', null],
    ['10:0', 'Coupée', 'loggia', null],
    // ASSERTION MODIFIÉE (audit du 19/10, seconde tranche ; B5) : un geste porté par un compte que Loggia n'a pas fait dit la PERSONNE (`personne`, son nom si une `person.*` répond du compte), plus « Loggia ».
    ['9:0', 'Allumée', 'personne', null],
    ['8:50', 'Coupée', 'bouton', null],
    ['6:30', 'Allumée', 'automatisme', '« Matin »'],
  ], 'Réseau, puis une ligne de Loggia à ± 60 s, un compte, le bouton ; l’automatisation et son nom');
});

test('les lignes de Loggia : les cycles à l’instant réel (Mesure), la pose d’un minuteur (Loggia) ; six au plus, depuis minuit', () => {
  const lignes = [
    ligne({ ts: h(13, 41) / 1000, module: 'prises', regle: 'cycle', quoi: 'cycle démarré', motif: 'à 13:40', g: { motif: [['à {h}', { h: '13:40', ts: h(13, 40) / 1000 }]] } }),
    ligne({ ts: h(16, 24) / 1000, module: 'prises', regle: 'cycle', quoi: 'cycle terminé', motif: 'à 16:14 · 1.08 kWh', g: { motif: [['à {h}', { h: '16:14', ts: h(16, 14) / 1000 }], ['{kwh} kWh', { kwh: 1.08 }]] } }),
    ligne({ ts: h(20, 40) / 1000, module: 'minuteurs', regle: 'minuteur', quoi: 'poser', motif: '30 min', g: { motif: [['{n} min', { n: 30 }]] } }),
    ligne({ ts: h(-2) / 1000, module: 'prises', regle: 'cycle', quoi: 'cycle terminé', motif: 'à 22:00', g: { motif: [['à {h}', { h: '22:00', ts: h(-2) / 1000 }]] } }),
    // Six heures sans retomber : une veille, pas un cycle (le serveur exécuté, relecture du 13/10).
    ligne({ ts: h(7, 0) / 1000, module: 'prises', regle: 'cycle', quoi: 'cycle interrompu', motif: 'à 07:00', g: { motif: [['à {h}', { h: '07:00', ts: h(7, 0) / 1000 }]] } }),
  ];
  const j = F.journalDuJour({ minuit: MINUIT, lignes, evenements: [evt(20, 40, 'on', { context_user_id: null })] });
  assert.deepEqual(j.map(x => [x.t, x.quoi, x.qui]), [[h(20, 40), 'Minuteur · 30\u00A0min', 'loggia'], [h(20, 40), 'Allumée', 'bouton'],
    [h(16, 14), 'Cycle terminé · 1,08\u00A0kWh', 'mesure'], [h(13, 40), 'Cycle démarré', 'mesure'], [h(7, 0), 'Cycle interrompu', 'mesure']],
    'la pose n’attribue pas le geste ; hier ne compte pas ; le nombre et son unité ne se séparent pas (F7)');
  const beaucoup = Array.from({ length: 9 }, (_, i) => evt(8 + i, 0, i % 2 ? 'off' : 'on'));
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: beaucoup }).length, 6, 'six au plus');
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT }), [], 'rien : rien');
});

test('les pastilles : un mot et son glyphe — « Loggia » ne se traduit pas', () => {
  // ASSERTION MODIFIÉE (chantier Lumières, tâche 9) : la règle est commune ; l'interrupteur d'une lumière a sa pastille.
  // ASSERTION MODIFIÉE (seconde tranche des lumières, B5) : une pastille de plus, la personne derrière un compte — « Un compte » quand on ne sait pas qui.
  assert.deepEqual(F.PASTILLES_QUI(), { reseau: ['Réseau', 'signal-alt-slash'], mesure: ['Mesure', 'chart-histogram'], loggia: ['Loggia', 'home'],
    automatisme: ['Automatisme', 'magic-wand'], bouton: ['Bouton de la prise', 'hand'], interrupteur: ['Interrupteur', 'hand'], personne: ['Un compte', 'user'] });
  // Le mot de la pastille d'une ligne : le nom de la personne quand la ligne en porte un, sinon celui de sa famille.
  assert.equal(F.motQui({ qui: 'personne', quiNom: 'Camille' }, F.PASTILLES_QUI()), 'Camille');
  assert.equal(F.motQui({ qui: 'personne', quiNom: null }, F.PASTILLES_QUI()), 'Un compte');
  assert.equal(F.motQui({ qui: 'loggia' }, F.PASTILLES_QUI()), 'Loggia');
});

/* ── Relecture finale, tâche 12 bis — B ── */

const qui = (j) => j.map(x => [new Date(x.t).getHours() + ':' + String(new Date(x.t).getMinutes()).padStart(2, '0'), x.quoi, x.qui]);
const auto = { context_event_type: 'automation_triggered', context_name: 'Matin', context_user_id: null };

test('qui, B7 : deux règles en concurrence — la première du § 8 l’emporte, et rien de la perdante ne reste', () => {
  const agit = (s, o = {}) => ligne({ ts: s, module: 'minuteurs', regle: 'minuteur', quoi: 'eteindre', motif: 'minuteur', ...o });
  // Loggia agit à 45 s ET le contexte dit « Matin » : Loggia gagne — et la note de l'automatisme ne paraît pas.
  let j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(7, 0, 'off', auto)], lignes: [agit(h(7, 0) / 1000 + 45)] });
  assert.deepEqual([j[0].qui, j[0].note], ['loggia', null]);
  // À 61 s, la ligne de Loggia ne couvre plus le geste : l'automatisme reprend la main.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(7, 0, 'off', auto)], lignes: [agit(h(7, 0) / 1000 + 61)] });
  assert.deepEqual([j[0].qui, j[0].note], ['automatisme', '« Matin »']);
  // Un contexte d'automatisation ET un compte (`context_user_id`) : l'automatisme gagne (règle 4 avant la 5).
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(7, 0, 'on', { ...auto, context_user_id: 'abc' })] });
  assert.deepEqual([j[0].qui, j[0].note], ['automatisme', '« Matin »']);
  // Un script, de même.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(7, 0, 'on', { context_event_type: 'script_started', context_name: 'Soir', context_user_id: 'abc' })] });
  assert.deepEqual([j[0].qui, j[0].note], ['automatisme', '« Soir »']);
  // Un compte seul : la personne (règle 5 ; ASSERTION MODIFIÉE (audit du 19/10, seconde tranche ; B5) : un geste porté par un compte que Loggia n'a pas fait dit la PERSONNE (`personne`, son nom si une `person.*` répond du compte), plus « Loggia ».) ; rien : le bouton.
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: [evt(7, 0, 'on', { context_user_id: 'abc' })] })[0].qui, 'personne');
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: [evt(7, 0, 'on')] })[0].qui, 'bouton');
  // Un `unavailable` suivi d'un retour : Réseau, même quand le retour a TOUT le reste — une ligne de Loggia à ± 60 s, une
  // automatisation, un compte. La panne elle-même est du Réseau, qu'une ligne de Loggia passe à côté ou non.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(14, 0, 'unavailable', auto), evt(14, 30, 'on', { ...auto, context_user_id: 'abc' })],
    lignes: [agit(h(14, 30) / 1000 - 20), agit(h(14, 0) / 1000 + 5)] });
  assert.deepEqual(qui(j), [['14:30', 'De retour', 'reseau'], ['14:00', 'Ne répond plus', 'reseau']]);
  // Et le geste d'après retrouve ses règles : à 30 min de toute ligne de Loggia, l'automatisation l'emporte sur le compte.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(14, 0, 'unavailable'), evt(14, 30, 'on'), evt(15, 0, 'off', { ...auto, context_user_id: 'abc' })],
    lignes: [agit(h(14, 30) / 1000 - 20)] });
  assert.deepEqual(qui(j).map(x => x[2]), ['automatisme', 'reseau', 'reseau']);
});

test('qui, B4 : une ligne SIMULÉE (« Observer sans agir ») n’attribue jamais un geste à Loggia', () => {
  const ligneLoggia = (o = {}) => ligne({ ts: h(10, 0) / 1000 + 10, module: 'minuteurs', regle: 'minuteur', quoi: 'eteindre', motif: 'minuteur', ...o });
  // Réelle : le geste est le sien.
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: [evt(10, 0, 'off')], lignes: [ligneLoggia()] })[0].qui, 'loggia');
  // Simulée : Loggia l'AURAIT fait, il n'a rien fait — quelqu'un a appuyé sur le bouton.
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: [evt(10, 0, 'off')], lignes: [ligneLoggia({ simule: true })] })[0].qui, 'bouton');
  // Elle ne prend pas non plus la place d'une automatisation ou d'un compte.
  const sim = ligneLoggia({ simule: true });
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, evenements: [evt(10, 0, 'off', auto)], lignes: [sim] }).map(x => [x.qui, x.note]), [['automatisme', '« Matin »']]);
  // ASSERTION MODIFIÉE (audit du 19/10, seconde tranche ; B5) : un geste porté par un compte que Loggia n'a pas fait dit la PERSONNE (`personne`, son nom si une `person.*` répond du compte), plus « Loggia ».
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: [evt(10, 0, 'off', { context_user_id: 'abc' })], lignes: [sim] })[0].qui, 'personne', 'le compte reste le sien, par la règle 5');
  // Une ligne réelle ET une ligne simulée à côté : la réelle suffit.
  assert.equal(F.journalDuJour({ minuit: MINUIT, evenements: [evt(10, 0, 'off')], lignes: [sim, ligneLoggia()] })[0].qui, 'loggia');
  // La forme des lignes : le serveur (`regles.noter`) écrit `simule` ; la démo (`ligneJournal`) le passe tel quel.
  assert.ok(/"simule": bool\(simule\)/.test(readFileSync(new URL('../custom_components/loggia/regles.py', import.meta.url), 'utf8')));
});

test('qui, B4 : `unknown` (le redémarrage de Home Assistant) ne fait pas de ligne ; la reprise au même état non plus', () => {
  // Allumée, Home Assistant redémarre : `unknown`, puis `on`. Hier, « Allumée · Bouton de la prise » à l'heure du redémarrage.
  let j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(6, 0, 'on'), evt(8, 0, 'unknown'), evt(8, 1, 'on')] });
  assert.deepEqual(qui(j), [['6:00', 'Allumée', 'bouton']], 'la reprise, au même état : aucune ligne');
  // `unknown` seul ne fait rien non plus.
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, evenements: [evt(8, 0, 'unknown')] }), []);
  // Coupée avant, allumée après : elle est « De retour » — pas un geste, une prise qui revient dans un autre état.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(6, 0, 'off'), evt(8, 0, 'unknown'), evt(8, 1, 'on', { context_user_id: 'abc' })] });
  assert.deepEqual(qui(j), [['8:01', 'De retour', 'reseau'], ['6:00', 'Coupée', 'bouton']]);
  // Aucun état connu avant l'`unknown` (le journal commence à minuit) : on ne peut pas dire que c'est le même — « De retour ».
  assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, evenements: [evt(3, 0, 'unknown'), evt(3, 1, 'on')] })), [['3:01', 'De retour', 'reseau']]);
  // La reprise est un état connu : le geste qui suit retrouve ses règles, et se compare à CE dernier état.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(6, 0, 'on'), evt(8, 0, 'unknown'), evt(8, 1, 'on'), evt(9, 0, 'off', auto), evt(9, 30, 'unknown'), evt(9, 31, 'off')] });
  assert.deepEqual(qui(j), [['9:00', 'Coupée', 'automatisme'], ['6:00', 'Allumée', 'bouton']], 'la reprise de 9:31 est « off », comme avant : rien');
  // Un `unavailable` suivi d'un `unknown` reste une indisponibilité : son retour dit « De retour » — même au même état qu'avant.
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(6, 0, 'on'), evt(14, 0, 'unavailable'), evt(14, 5, 'unknown'), evt(14, 10, 'on')] });
  assert.deepEqual(qui(j), [['14:10', 'De retour', 'reseau'], ['14:00', 'Ne répond plus', 'reseau'], ['6:00', 'Allumée', 'bouton']]);
  // Une panne qui n'a pas fini ne se redit pas : `unavailable`, `unknown`, `unavailable` — une seule fois « Ne répond plus ».
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(14, 0, 'unavailable'), evt(14, 5, 'unknown'), evt(14, 6, 'unavailable'), evt(14, 20, 'off')] });
  assert.deepEqual(qui(j), [['14:20', 'De retour', 'reseau'], ['14:00', 'Ne répond plus', 'reseau']]);
  // `unknown` après un retour : le retour est un état connu (la reprise ne fait rien).
  j = F.journalDuJour({ minuit: MINUIT, evenements: [evt(14, 0, 'unavailable'), evt(14, 10, 'on'), evt(15, 0, 'unknown'), evt(15, 1, 'on')] });
  assert.deepEqual(qui(j), [['14:10', 'De retour', 'reseau'], ['14:00', 'Ne répond plus', 'reseau']]);
});

/* ── Relecture finale, tâche 14 bis — F1 : le logbook se lit depuis la VEILLE ──
 * Lu depuis minuit, il ignorait l'état d'avant minuit : le premier événement du jour était pris pour un geste. `hier(hh, mm)` : le même
 * instant, la veille. Le journal n'affiche que les lignes d'aujourd'hui ; les autres ne servent qu'à savoir l'état d'où l'on vient. */
const hier = (hh, mm, state, o = {}) => evt(hh - 24, mm, state, o);

test('F1 : l’état d’avant minuit se SAIT — une prise muette depuis 23:00 qui revient à 07:00 est « De retour » (Réseau), pas « Allumée · Bouton de la prise »', () => {
  // Revenue dans l'état d'avant, dans un autre, ou sans état connu avant la panne : la fin de la panne que « Ne répond plus » (hier) a ouverte.
  for (const [nom, evenements] of [
    ['même état', [hier(8, 0, 'on'), hier(23, 0, 'unavailable'), evt(7, 0, 'on')]],
    ['un autre état', [hier(8, 0, 'on'), hier(23, 0, 'unavailable'), evt(7, 0, 'off')]],
    ['sans état connu avant', [hier(23, 0, 'unavailable'), evt(7, 0, 'on')]],
    ['un `unknown` glissé dans la panne', [hier(8, 0, 'on'), hier(23, 0, 'unavailable'), hier(23, 30, 'unknown'), evt(7, 0, 'on')]],
  ]) assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, evenements })), [['7:00', 'De retour', 'reseau']], nom + ' : la panne d’hier n’est pas d’aujourd’hui, son retour si');
  // Les lignes d'hier ne s'affichent pas, même celles que la veille fait naître : « Ne répond plus » de 23:00 n'est pas dans le journal d'aujourd'hui.
  const j = F.journalDuJour({ minuit: MINUIT, evenements: [hier(8, 0, 'on'), hier(23, 0, 'unavailable'), evt(7, 0, 'on')] });
  assert.ok(j.every(x => x.t >= MINUIT) && j.length === 1);
  // Un geste d'aujourd'hui se compare au dernier état d'hier : `on` hier soir, `off` ce matin — « Coupée ».
  assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, evenements: [hier(22, 0, 'on'), evt(7, 30, 'off')] })), [['7:30', 'Coupée', 'bouton']]);
});

test('F1 : un `unknown` en tête du jour ne fait « De retour » que si l’état a CHANGÉ depuis la veille', () => {
  // Le même qu'hier soir : une reprise après le redémarrage de Home Assistant — aucune ligne.
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, evenements: [hier(18, 0, 'on'), evt(3, 0, 'unknown'), evt(3, 1, 'on')] }), []);
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, evenements: [hier(18, 0, 'off'), evt(3, 0, 'unknown'), evt(3, 1, 'off')] }), []);
  // Changé : la prise revient dans un autre état.
  assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, evenements: [hier(18, 0, 'off'), evt(3, 0, 'unknown'), evt(3, 1, 'on')] })), [['3:01', 'De retour', 'reseau']]);
  // Rien dans la veille non plus : on ne peut pas dire que c'est le même — « De retour », comme avant.
  assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, evenements: [evt(3, 0, 'unknown'), evt(3, 1, 'on')] })), [['3:01', 'De retour', 'reseau']]);
});

test('F1 : après un redémarrage, le logbook de Home Assistant omet le premier état de l’entité — `on` puis `on` n’est pas un geste', () => {
  // La ligne de l'`unknown` n'a pas d'`old_state_id` : le logbook ne la rend pas. Reste un `on` à l'heure du redémarrage, après celui d'hier soir.
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, evenements: [hier(18, 0, 'on'), evt(3, 0, 'on')] }), [], 'aucune ligne « Allumée · Bouton de la prise »');
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, evenements: [hier(18, 0, 'off'), evt(3, 0, 'off')] }), [], 'éteinte de même');
  // Chaque redémarrage de la journée, de même ; un vrai geste entre deux (le changement d'état) se voit.
  const j = F.journalDuJour({ minuit: MINUIT, evenements: [hier(18, 0, 'on'), evt(3, 0, 'on'), evt(8, 0, 'off'), evt(9, 0, 'on'), evt(9, 30, 'on'), evt(12, 0, 'off'), evt(12, 5, 'off')] });
  assert.deepEqual(qui(j), [['12:00', 'Coupée', 'bouton'], ['9:00', 'Allumée', 'bouton'], ['8:00', 'Coupée', 'bouton']]);
  // Un geste de Loggia garde son « qui », et un geste qui ne change rien n'en est pas un.
  const loggia = ligne({ ts: h(8, 0) / 1000 + 20, module: 'minuteurs', regle: 'minuteur', quoi: 'eteindre', motif: 'minuteur' });
  assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, lignes: [loggia], evenements: [hier(18, 0, 'on'), evt(8, 0, 'off')] })), [['8:00', 'Coupée', 'loggia']]);
  assert.deepEqual(F.journalDuJour({ minuit: MINUIT, lignes: [loggia], evenements: [hier(18, 0, 'off'), evt(8, 0, 'off')] }), [], 'la ligne de Loggia n’invente pas un geste que le logbook ne voit pas');
  // La limite : sans état connu avant (la prise n'a pas bougé depuis plus d'un jour), rien ne dit que c'est une reprise — on garde le geste.
  assert.deepEqual(qui(F.journalDuJour({ minuit: MINUIT, evenements: [evt(3, 0, 'on')] })), [['3:00', 'Allumée', 'bouton']]);
});

test('F1 : la veille se lit sur 24 heures avant minuit', () => {
  assert.equal(F.VEILLE_MS, 24 * 3600000);
});

test('l’énergie heure par heure, B2 : le compteur ne fait foi que s’il porte une SOMME — sinon la puissance moyenne', () => {
  const p = [{ start: h(1), mean: 500 }, { start: h(2), mean: 250 }];
  // Un compteur sans `state_class` de somme : des moyennes, ou un `change` nul de HA, jamais une somme — la puissance prend le relais.
  const sansSomme = { 'sensor.e': [{ start: h(1), mean: 846.1 }, { start: h(2), mean: 846.2, change: null }], 'sensor.p': p };
  assert.deepEqual(F.kwhParHeure(sansSomme, 'sensor.e', 'sensor.p'), [{ debut: h(1), kwh: 0.5 }, { debut: h(2), kwh: 0.25 }], 'pas « 0 kWh » comptés sur rien');
  // Un compteur absent des statistiques (HA ne rend pas l'identifiant) : la puissance.
  assert.deepEqual(F.kwhParHeure({ 'sensor.p': p }, 'sensor.e', 'sensor.p'), [{ debut: h(1), kwh: 0.5 }, { debut: h(2), kwh: 0.25 }]);
  // Un compteur qui a compté fait foi, même si la puissance dit autre chose.
  assert.deepEqual(F.kwhParHeure({ 'sensor.e': [{ start: h(1), change: 0.2 }], 'sensor.p': p }, 'sensor.e', 'sensor.p'), [{ debut: h(1), kwh: 0.2 }]);
  // Un compteur qui a vraiment compté zéro reste un zéro.
  assert.deepEqual(F.kwhParHeure({ 'sensor.e': [{ start: h(1), change: 0 }], 'sensor.p': p }, 'sensor.e', 'sensor.p'), [{ debut: h(1), kwh: 0 }]);
  // Ni l'un ni l'autre : rien — le mois ne s'invente pas.
  assert.deepEqual(F.kwhParHeure({}, 'sensor.e', 'sensor.p'), []);
  // Les compteurs des tarifs n'ont que leur somme : jamais la puissance.
  assert.deepEqual(F.connexionsHeures([{ prix: 0.16, compteur: 'sensor.hc' }], { 'sensor.hc': [{ start: h(2), mean: 5 }] }), [{ prix: 0.16, heures: {} }]);
});

/* B9 — un cycle de 13:40 à 16:14 : 1 950 W jusqu'à 14:00, 60 W de 14:00 à 15:00 et de 15:00 à 16:00, 14 W après. Les moyennes sur 5 minutes de la
 * journée ; deux tarifs : les heures creuses de 13 h à 16 h, les pleines après. */
const pointsCycle = () => {
  const points = [];
  for (let m = 13 * 60 + 40; m < 16 * 60 + 15; m += 5) points.push({ t: h(0) + m * 60000, w: m < 14 * 60 ? 1950 : m < 16 * 60 ? 60 : 14 });
  return points;
};
const enCents = (v) => Math.round(v * 100);
const kwhDans = (points, a, b) => points.reduce((s, p) => s + p.w * Math.max(0, Math.min(b, p.t + 300000) - Math.max(a, p.t)) / 3600000 / 1000, 0);

test('le coût d’un cycle, B9 : heure par heure d’après l’énergie de chaque heure — comme la tuile Aujourd’hui', () => {
  const points = pointsCycle();
  const cycle = { debut: iso(13, 40), fin: iso(16, 14) };
  const parHeure = [13, 14, 15, 16].map(n => ({ debut: h(n), kwh: kwhDans(points, Math.max(h(n), Date.parse(cycle.debut)), Math.min(h(n + 1), Date.parse(cycle.fin))) }));
  const total = parHeure.reduce((s, x) => s + x.kwh, 0);
  assert.ok(total > 0.7 && total < 0.85, 'sa forme : 0,65 kWh de pic, 0,12 kWh de lavage… ' + total);
  const HC = { prix: 0.1605, heures: { [h(13)]: parHeure[0].kwh, [h(14)]: parHeure[1].kwh, [h(15)]: parHeure[2].kwh } }, HP = { prix: 0.2092, heures: { [h(16)]: parHeure[3].kwh } };
  const connexions = [HC, HP];
  const complet = { ...cycle, kwh: total };
  // Le cycle est TOUTE la consommation du jour : son euro est celui de la tuile (`coutHoraire`, kWh de chaque heure × prix de l'heure).
  const tuile = T.coutHoraire(parHeure, connexions);
  const euros = F.coutCycle(complet, connexions, points);
  assert.ok(Math.abs(euros - tuile) < 1e-9, 'le cycle ' + euros + ' € · la tuile ' + tuile + ' €');
  // L'ancienne pondération par le TEMPS donnait un autre euro : 14 minutes sur 154 aux heures pleines, alors que l'énergie y est infime.
  const pondere = F.coutCycle(complet, connexions);
  assert.ok(pondere - euros > 0.002, 'au prorata du temps : ' + pondere + ' contre ' + euros);
  assert.equal(enCents(euros), enCents(tuile));
  // Les kWh du serveur font foi : les points donnent la FORME, le compteur le total (mis à l'échelle).
  const k = F.coutCycle({ ...cycle, kwh: total * 2 }, connexions, points);
  assert.ok(Math.abs(k - 2 * euros) < 1e-9, 'deux fois plus d’énergie, deux fois le prix');
  assert.deepEqual(F.kwhCycleParHeure({ ...cycle, kwh: total * 2 }, points).map(x => [x.debut, Math.round(x.kwh * 1e6) / 1e6]), parHeure.map(x => [x.debut, Math.round(x.kwh * 2e6) / 1e6]));
});

test('le coût d’un cycle, B9 : sans points qui le disent — passé minuit, sans statistiques — la pondération par le temps reste', () => {
  const HC = { prix: 0.16, heures: { [h(13)]: 0.4, [h(14)]: 0.5 } }, HP = { prix: 0.2, heures: { [h(15)]: 0.3 } };
  const connexions = [HC, HP];
  const cycle = { debut: iso(14), fin: iso(16), kwh: 1 };
  const temps = F.coutCycle(cycle, connexions);
  assert.ok(Math.abs(temps - (0.16 + 0.2) / 2) < 1e-9);
  // Pas de points, des points vides, des points qui ne touchent pas le cycle, de la puissance nulle : le temps.
  for (const pts of [null, undefined, [], [{ t: h(9), w: 100 }], [{ t: h(14), w: 0 }, { t: h(14, 5), w: 0 }]]) assert.equal(F.coutCycle(cycle, connexions, pts), temps, JSON.stringify(pts));
  assert.equal(F.kwhCycleParHeure(cycle, null), null);
  // Un cycle passé minuit : les points de la journée n'en couvrent que la fin (de 00:00 à 00:10) — toute l'énergie tomberait là, aux prix d'après minuit.
  const nuit = { debut: iso(-3, 36), fin: iso(0, 10), kwh: 1.08 };           // 21:36 → 00:10
  const apres = [{ t: h(0), w: 14 }, { t: h(0, 5), w: 14 }];
  assert.equal(F.kwhCycleParHeure(nuit, apres), null, '10 minutes sur 154 : pas assez pour dire le cycle');
  assert.equal(F.coutCycle(nuit, connexions, apres), F.coutCycle(nuit, connexions), 'le temps, comme avant');
  // Un trou au milieu du cycle (le capteur muet un moment) : sous 90 % de couverture, le temps aussi.
  const trou = pointsCycle().filter(p => p.t < h(14, 30) || p.t >= h(15, 40));
  assert.equal(F.kwhCycleParHeure({ ...cycle, debut: iso(13, 40), fin: iso(16, 14), kwh: 1 }, trou), null);
  // Un trou léger (5 minutes sur 154) : les points servent.
  const leger = pointsCycle().filter(p => p.t !== h(15, 0));
  assert.ok(F.kwhCycleParHeure({ debut: iso(13, 40), fin: iso(16, 14), kwh: 1 }, leger));
  // Sans kWh, ou sans prix : pas d'euros.
  assert.equal(F.coutCycle({ ...cycle, kwh: null }, connexions, pointsCycle()), null);
  assert.equal(F.coutCycle({ debut: iso(13, 40), fin: iso(16, 14), kwh: 1 }, [], pointsCycle()), null);
});

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B5) : qui est derrière un compte. Les `person.*` du relevé disent, par leur
 * `user_id`, qui tient le compte ; la pastille dit alors son NOM — un nom venu de Home Assistant, jamais traduit —, « Un compte »
 * quand aucune personne ne répond du compte. Ce que Loggia fait elle-même (une ligne qui agit à ± 60 s) reste « Loggia ». */
test('B5 : un geste depuis un compte dit la personne — son nom si une `person.*` répond du compte, « Un compte » sinon ; Loggia reste Loggia pour ce qu’elle fait', () => {
  const S = { 'person.camille': { entity_id: 'person.camille', state: 'home', attributes: { friendly_name: 'Camille', user_id: 'abc' } },
    'person.invite': { entity_id: 'person.invite', state: 'not_home', attributes: { friendly_name: 'Invité' } },
    'light.x': { entity_id: 'light.x', state: 'on', attributes: {} } };
  assert.deepEqual(F.personnesDe(S), { abc: 'Camille' }, 'une personne sans compte ne répond de rien ; une lampe n’est pas une personne');
  assert.deepEqual(F.personnesDe(null), {});
  const personnes = F.personnesDe(S);
  const ligneLoggia = ligne({ ts: h(10, 0) / 1000 + 10, module: 'minuteurs', regle: 'minuteur', quoi: 'eteindre', motif: 'minuteur' });
  const j = F.journalDuJour({ minuit: MINUIT, personnes, evenements: [evt(7, 0, 'on', { context_user_id: 'abc' }), evt(8, 0, 'off', { context_user_id: 'zzz' }), evt(9, 0, 'on'), evt(10, 0, 'off', { context_user_id: 'abc' })],
    lignes: [ligneLoggia] });
  assert.deepEqual(j.map(x => [x.quoi, x.qui, x.quiNom]), [['Coupée', 'loggia', null], ['Allumée', 'bouton', null], ['Coupée', 'personne', null], ['Allumée', 'personne', 'Camille']],
    'Loggia pour son minuteur, même depuis un compte ; le bouton ; un compte sans personne, sans nom ; la personne nommée');
  assert.deepEqual(j.map(x => F.motQui(x, F.PASTILLES_QUI())), ['Loggia', 'Bouton de la prise', 'Un compte', 'Camille']);
  // Une lumière suit la même règle (L12).
  const l = F.journalDuJour({ minuit: MINUIT, personnes, vocabulaire: 'lumiere', evenements: [evt(7, 0, 'on', { bri: 45, context_user_id: 'abc' })] });
  assert.deepEqual([l[0].qui, l[0].quiNom], ['personne', 'Camille']);
});

