/* TEST AJOUTÉ (étape 2 IoT, 19/10 ; sa maquette « Cartes IoT », 1a et 1e ; I10, I22, § 6 de la conception) — ce que la carte du
 * distributeur CALCULE, à sec : sa phrase, la ration de « Distribuer », sa vue entière sur une maison.
 *
 * Pas de React ici : les fonctions pures de `distributeur.js`, au démarrage. L'heure est celle de la maquette, lundi 19/10/2026,
 * 18:20 (le « maintenant » de la démo). Ce qui est garanti :
 *  - § 6, `phraseDistributeur` : la première ligne qui s'applique, son encre — hors ligne en rouge, le liseré qui respire ; une
 *    anomalie en ambre ; le jour ordinaire en gris, en ambre sous 15 % de bac ; jamais une phrase qui rassure, et rien d'inventé tant
 *    que le serveur n'a pas répondu ;
 *  - I10 : « Distribuer 12 g » — les grammes d'une ration quand on les sait (`grammesRation`), sinon rien d'inventé ;
 *  - I22 : « Je l'ai rempli » n'existe que pour une aide `input_number` vivante ; « Distribuer » disparaît quand l'appareil ne
 *    répond pas, pas quand l'aide du bac se tait ;
 *  - § 12 : la mesure d'une portion et la réserve en jours reviennent au démarrage pour la carte — `distributeurfiche.js` les
 *    reprend telles quelles, la fiche et Paramètres n'y voient rien changer. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const D = await import('../src/distributeur.js');
const DF = await import('../src/distributeurfiche.js');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (j, h, m) => new Date(2026, 9, 19 + j, h, m).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = iso(a(0, 14, 20))) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });

/* La maison type : un distributeur sous Zigbee2MQTT — un `select` START, sa taille de ration (2 portions) et le poids d'une portion
 * (6 g), ses deux compteurs du jour, son erreur —, un bac tenu par une aide `input_number` (450 g sur 1 500) et deux automatisations
 * de repas, l'une allumée (07:30 et 19:00), l'autre coupée (12:30, en semaine). */
const FEED = 'select.distributeur_feed', TAILLE = 'number.distributeur_serving_size', POIDS = 'number.distributeur_portion_weight';
const GJOUR = 'sensor.distributeur_weight_per_day', ERREUR = 'binary_sensor.distributeur_error', BAC = 'input_number.croquettes_reservoir';
const MATIN = 'automation.croquettes_matin_et_soir', MIDI = 'automation.croquettes_du_midi';
const META = new Map([
  [FEED, { deviceId: 'dev1', platform: 'mqtt' }], [TAILLE, { deviceId: 'dev1', platform: 'mqtt' }], [POIDS, { deviceId: 'dev1', platform: 'mqtt' }],
  [GJOUR, { deviceId: 'dev1', platform: 'mqtt' }], [ERREUR, { deviceId: 'dev1', platform: 'mqtt' }],
]);
const INDEX = { entityMeta: META };
const CFG = { haid: FEED, haids: { reservoir: BAC } };
function etats(retouche = null) {
  const S = {
    [FEED]: st(FEED, 'unknown', { options: ['START'] }),
    [TAILLE]: st(TAILLE, '2', { min: 1, max: 10, step: 1 }),
    [POIDS]: st(POIDS, '6', { min: 1, max: 20, step: 1, unit_of_measurement: 'g' }),
    [GJOUR]: st(GJOUR, '24', { unit_of_measurement: 'g' }, iso(a(0, 7, 30))),
    [ERREUR]: st(ERREUR, 'off', { device_class: 'problem' }),
    [BAC]: st(BAC, '450', { min: 0, max: 1500, step: 1, unit_of_measurement: 'g' }),
    [MATIN]: st(MATIN, 'on', { friendly_name: 'Croquettes matin et soir' }),
    [MIDI]: st(MIDI, 'off', { friendly_name: 'Croquettes du midi' }),
  };
  if (retouche) retouche(S);
  return S;
}
const auto = (entity_id, nom, etat, heures, jours = null) => ({ entity_id, nom, etat, heures, jours, conditionnel: false, portions: null, declencheurs: heures.map(heure => ({ type: 'heure', heure })), pilotable: true, modifiable: false, indice: null, dernier: null });
const ETAT = () => ({
  source: 'automatisations',
  sources: { programme: { presente: false, active: false }, automatisations: { presente: true, active: true }, loggia: { presente: false, active: false } },
  programme: { source: 'aqara', connu: true, presente: false, active: false, lisible: false, mode: 'manuel', note: 'mode_manuel', repas: [] },
  automatisations: [auto(MATIN, 'Croquettes matin et soir', 'on', ['07:30', '19:00']), auto(MIDI, 'Croquettes du midi', 'off', ['12:30'], [0, 1, 2, 3, 4])],
  planning: { appareil: null, repas: [] }, peutPlanifier: false, commande: { domaine: 'select', quantite: false, min: null, max: null, pas: null },
  journal: [],
});
const carte = (retouche = null, { etat = ETAT(), cfg = CFG, index = INDEX, maintenant = T } = {}) => D.carteDistributeur({ index, states: etats(retouche), cfg, etat, maintenant });

test('§ 6 : la phrase, la première ligne qui s’applique, et son encre', () => {
  const p = (o) => { const r = D.phraseDistributeur({ maintenant: T, ...o }); return [r.texte, r.encre, r.panne]; };
  const ce_soir = { date: new Date(a(0, 19, 0)) }, demain = { date: new Date(a(1, 7, 30)) }, mercredi = { date: new Date(a(2, 7, 30)) };
  // 1. Hors ligne : l'appareil, depuis quand ; l'aide du bac seule, elle, se nomme.
  assert.deepEqual(p({ mort: true, raison: 'commande', depuis: iso(a(0, 14, 20)), prochain: ce_soir }), ['Indisponible depuis 14:20', 'var(--o-bad)', true]);
  assert.deepEqual(p({ mort: true, raison: 'connectivite' }), ['Indisponible', 'var(--o-bad)', true]);
  assert.deepEqual(p({ mort: true, raison: 'reservoir', prochain: ce_soir, jours: 8 }), ['Réservoir indisponible', 'var(--o-bad)', true]);
  // 2. Une anomalie active, en ambre, devant le prochain repas.
  assert.deepEqual(p({ alerte: 'bas', prochain: ce_soir, jours: 8 }), ['Bac presque vide · Repas à 19:00', 'var(--o-warn)', false]);
  assert.deepEqual(p({ alerte: 'bloque' }), ['Distribution bloquée', 'var(--o-warn)', false]);
  assert.deepEqual(p({ alerte: 'autre', prochain: demain }), ['Problème signalé · Repas demain 07:30', 'var(--o-warn)', false]);
  // 3. Le jour ordinaire : le prochain repas et la réserve, en gris — en ambre sous 15 % de bac.
  assert.deepEqual(p({ prochain: ce_soir, jours: 8, pct: 30 }), ['Repas à 19:00 · ≈ 8 j', 'var(--o-text2)', false]);
  assert.deepEqual(p({ prochain: demain, jours: 1, pct: 9 }), ['Repas demain 07:30 · ≈ 1 j', 'var(--o-warn)', false]);
  assert.deepEqual(p({ prochain: mercredi }), ['Repas mercredi 07:30', 'var(--o-text2)', false]);
  assert.deepEqual(p({ jours: 8 }), ['≈ 8 j de réserve', 'var(--o-text2)', false]);
  assert.deepEqual(p({ dernier: a(0, 7, 30) }), ['Dernier repas à 07:30', 'var(--o-text2)', false]);
  assert.deepEqual(p({ dernier: a(-1, 19, 0) }), ['Aucun repas prévu', 'var(--o-text2)', false], 'un repas d’hier n’est pas le dernier d’aujourd’hui');
  // Un programme que l'appareil tient sans le montrer : on ne dit pas « aucun ».
  assert.deepEqual(p({ programme: true }), ['Programme de l’appareil', 'var(--o-text2)', false]);
  // Le serveur n'a pas encore répondu : rien d'inventé, ni « aucun repas » ni programme.
  assert.deepEqual(p({ sources: false }), ['—', 'var(--o-text2)', false]);
  assert.deepEqual(p({ sources: false, prochain: ce_soir }), ['Repas à 19:00', 'var(--o-text2)', false], 'le capteur de l’appareil, lui, se dit');
  // L'ordre : la panne d'abord, puis l'anomalie, puis le jour ordinaire.
  assert.equal(p({ mort: true, raison: 'commande', alerte: 'bas' })[0], 'Indisponible');
  assert.equal(p({ alerte: 'bas', jours: 1, pct: 3 })[0], 'Bac presque vide');
});

test('I10 : les grammes d’une ration — la taille de l’appareil, une commande qui écrit, rien d’inventé', () => {
  // Une taille de ration (2 portions) et le poids d'une portion (6 g) : 12 g par appui.
  assert.equal(D.grammesRation({ grammesParPortion: 6, portionsParAppui: 2 }, { quantite: false }), 12);
  // Une portion réglée en grammes (45 g) : un appui, 45 g.
  assert.equal(D.grammesRation({ grammesParPortion: 45, portionsParAppui: 1 }, { quantite: false }), 45);
  // Une commande qui ÉCRIT une quantité : les portions de CE geste.
  assert.equal(D.grammesRation({ grammesParPortion: 10, portionsParAppui: 1 }, { quantite: true }, 3), 30);
  // TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; point G) : `valeurPortions` relève la valeur au minimum de l'entité (min 2 portions) :
  // la carte annonce ce qui part VRAIMENT — 2 portions × 6 g = 12 g, jamais 6.
  assert.equal(D.grammesRation({ grammesParPortion: 6, portionsParAppui: 1 }, { quantite: true, min: 2, max: 10, pas: 1 }, 1), 12);
  assert.equal(D.grammesRation({ grammesParPortion: 6, portionsParAppui: 1 }, { quantite: true, min: 20, max: 100, pas: 10 }, 1), 12, 'min 20 au pas de 10 : deux portions');
  assert.equal(D.grammesRation(null, { quantite: false }), null, 'sans mesure, pas de grammes');
  assert.equal(D.grammesRation({ grammesParPortion: 0, portionsParAppui: 1 }, { quantite: false }), null);
});

test('I10, I22, § 6 : la vue de la carte sur la maison type — « Repas à 19:00 · ≈ 18 j », 30 %, « Distribuer 12 g », « Je l’ai rempli »', () => {
  const c = carte();
  // 450 g, deux repas de 12 g par jour (le midi est coupé) : 18 jours.
  assert.deepEqual([c.pct, c.grammes, c.jours, c.ration], [30, 450, 18, 12]);
  assert.deepEqual([c.phrase.texte, c.phrase.encre, c.phrase.panne], ['Repas à 19:00 · ≈ 18 j', 'var(--o-text2)', false]);
  assert.deepEqual(c.envoi, { domaine: 'select', service: 'select_option', data: { entity_id: FEED, option: 'START' } }, 'START sur le select de l’appareil');
  // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point G) : `rempli` n'est plus à la carte — « Je l'ai rempli » est le geste de la
  // popup, sur une aide vivante (tests/fiche_distributeur_accueil.test.mjs) ; la carte rend le maximum de l'aide (`max`).
  assert.deepEqual([c.reservoir, c.max, 'rempli' in c], [BAC, 1500, false], 'l’aide du bac, et son maximum');
  assert.deepEqual([c.mort, c.alerte], [false, null]);
  // Le midi rallumé (l'état VIVANT de l'automatisation) : un repas de plus par jour de semaine.
  assert.equal(carte((S) => { S[MIDI] = st(MIDI, 'on'); }).jours, 13);
  // Sous 15 % : la phrase passe à l'ambre.
  const bas = carte((S) => { S[BAC] = st(BAC, '180', { max: 1500, unit_of_measurement: 'g' }); });
  assert.deepEqual([bas.pct, bas.phrase.texte, bas.phrase.encre], [12, 'Repas à 19:00 · ≈ 7 j', 'var(--o-warn)']);
  // L'erreur de l'appareil : en tête, en ambre.
  const erreur = carte((S) => { S[ERREUR] = st(ERREUR, 'on', { device_class: 'problem' }); });
  assert.deepEqual([erreur.alerte, erreur.phrase.texte, erreur.phrase.encre], ['autre', 'Problème signalé · Repas à 19:00', 'var(--o-warn)']);
  // Après le dernier repas du soir : demain matin.
  assert.equal(carte(null, { maintenant: a(0, 19, 5) }).phrase.texte, 'Repas demain 07:30 · ≈ 18 j');
});

test('I22, § 6 : l’appareil muet, l’aide du bac muette, une sonde de bac, le serveur muet', () => {
  // La commande muette : le liseré, depuis quand, plus de « Distribuer ».
  const muet = carte((S) => { S[FEED] = st(FEED, 'unavailable', { options: ['START'] }, iso(a(0, 14, 20))); });
  assert.deepEqual([muet.mort, muet.raison, muet.envoi, muet.ration, muet.phrase.texte, muet.phrase.panne], [true, 'commande', null, null, 'Indisponible depuis 14:20', true]);
  // L'aide du bac muette : le liseré, mais la vis répond — « Distribuer » reste ; ni pourcentage ni grammes.
  const bac = carte((S) => { S[BAC] = st(BAC, 'unavailable', {}); });
  assert.deepEqual([bac.mort, bac.raison, bac.pct, bac.reservoirMort, bac.phrase.texte], [true, 'reservoir', null, true, 'Réservoir indisponible']);
  assert.equal(bac.envoi.service, 'select_option');
  // Une sonde de bac (un `sensor` en %) : son pourcentage, tel quel.
  const sonde = carte((S) => { S['sensor.bac'] = st('sensor.bac', '64', { unit_of_measurement: '%' }); }, { cfg: { haid: FEED, haids: { reservoir: 'sensor.bac' } } });
  assert.deepEqual([sonde.pct, sonde.grammes], [64, null]);
  // Le serveur n'a pas répondu : ni prochain repas, ni réserve, ni « aucun repas » inventés — ce que dit le compteur de l'appareil, si.
  const nu = carte(null, { etat: null });
  assert.deepEqual([nu.jours, nu.phrase.texte], [null, 'Dernier repas à 07:30']);
  assert.equal(carte((S) => { S[GJOUR] = st(GJOUR, '0', { unit_of_measurement: 'g' }, iso(a(0, 0, 0))); }, { etat: null }).phrase.texte, '—', 'un compteur à zéro n’a rien servi');
  // Un compteur DÉSIGNÉ dans Paramètres, que l'appareil ne nomme pas comme un compteur : lui aussi dit le dernier repas — à zéro, muet ou
  // sans valeur, rien (la règle du 05/10).
  const CPT = 'sensor.croquettes_du_jour';
  const avec = (v) => carte((S) => { S[CPT] = st(CPT, v, { unit_of_measurement: 'g' }, iso(a(0, 12, 1))); S[GJOUR] = st(GJOUR, '0', {}, iso(a(0, 0, 0))); },
    { etat: null, cfg: { haid: FEED, haids: { reservoir: BAC, distribuees: CPT } } }).phrase.texte;
  assert.equal(avec('45'), 'Dernier repas à 12:01');
  for (const v of ['0', 'unavailable', 'unknown', '']) assert.equal(avec(v), '—', '« ' + v + ' » n’est pas un repas');
});

/* TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; D1) : un Aqara C1 tel que Zigbee2MQTT le publie — la taille de ration porte l'unité
 * « portion », le poids d'une portion est en g, le select de distribution propose « » et START, et « Poids d'une portion » de Paramètres
 * désigne l'entité de POIDS, comme son libellé y invite. La carte dit « Distribuer 12 g » (2 portions × 6 g) et ≈ 18 j, comme la popup
 * (« 2 portions · 12 g ») : toute unité qui n'est pas une masse compte des PORTIONS, et un number désigné dont l'unité est une masse est
 * le poids d'une portion, jamais sa taille — la carte disait « Distribuer 6 g » et ≈ 37 j, et le pas à pas aurait réglé l'étalonnage. */
test('D1 : un Aqara sous Zigbee2MQTT — la taille en « portion », le poids désigné dans Paramètres : « Distribuer 12 g », ≈ 18 j', () => {
  const z2m = (S) => { S[TAILLE] = st(TAILLE, '2', { min: 1, max: 10, step: 1, unit_of_measurement: 'portion' }); S[FEED] = st(FEED, 'unknown', { options: ['', 'START'] }); };
  const c = carte(z2m);
  assert.deepEqual([c.ration, c.jours, c.phrase.texte], [12, 18, 'Repas à 19:00 · ≈ 18 j'], 'l’unité « portion » compte des portions');
  assert.deepEqual(c.envoi.data, { entity_id: FEED, option: 'START' });
  // « Poids d'une portion » désigné sur l'entité de POIDS : c'est le poids, et la taille reste celle des sœurs.
  const designe = carte(z2m, { cfg: { haid: FEED, haids: { reservoir: BAC, portionWeight: POIDS } } });
  assert.deepEqual([designe.lecture.portion.entity_id, designe.lecture.portion.unite, designe.lecture.poidsPortion], [TAILLE, 'portion', { entity_id: POIDS, unite: 'g' }]);
  assert.deepEqual([designe.ration, designe.jours, designe.mesure], [12, 18, { grammesParPortion: 6, portionsParAppui: 2 }]);
  // Désigné sans unité de masse (l'installation d'avant : la taille elle-même) : la taille, comme avant.
  const taille = carte(null, { cfg: { haid: FEED, haids: { reservoir: BAC, portionWeight: TAILLE } } });
  assert.deepEqual([taille.lecture.portion.entity_id, taille.lecture.poidsPortion.entity_id, taille.ration], [TAILLE, POIDS, 12]);
  // Un poids désigné HORS des sœurs (une aide en g) : le poids quand même ; posé sur un AUTRE appareil : ignoré, le poids de l'appareil.
  const AIDE = 'number.poids_croquettes';
  const aide = carte((S) => { z2m(S); S[AIDE] = st(AIDE, '9', { min: 1, max: 30, step: 1, unit_of_measurement: 'g' }); }, { cfg: { haid: FEED, haids: { reservoir: BAC, portionWeight: AIDE } } });
  assert.deepEqual([aide.lecture.poidsPortion, aide.ration], [{ entity_id: AIDE, unite: 'g' }, 18]);
  const ailleurs = carte((S) => { z2m(S); S[AIDE] = st(AIDE, '9', { unit_of_measurement: 'g' }); },
    { cfg: { haid: FEED, haids: { reservoir: BAC, portionWeight: AIDE } }, index: { entityMeta: new Map([...META, [AIDE, { deviceId: 'dev2', platform: 'mqtt' }]]) } });
  assert.deepEqual([ailleurs.lecture.poidsPortion.entity_id, ailleurs.ration], [POIDS, 12]);
  // La mesure seule : « portion », « portions » ou rien comptent des portions ; une masse est une quantité par appui.
  const m = (unite) => D.mesurePortion({ a: { state: '3' }, b: { state: '5' } }, { entity_id: 'a', unite }, { entity_id: 'b', unite: 'g' });
  assert.deepEqual([m('portion'), m('portions'), m(null)], [{ grammesParPortion: 5, portionsParAppui: 3 }, { grammesParPortion: 5, portionsParAppui: 3 }, { grammesParPortion: 5, portionsParAppui: 3 }]);
  assert.deepEqual(m('g'), { grammesParPortion: 3, portionsParAppui: 1 }, 'une taille en grammes : un appui, cette quantité');
});

test('§ 12 : la mesure d’une portion et la réserve reviennent au démarrage ; la fiche et Paramètres les lisent pareil', () => {
  for (const nom of ['mesurePortion', 'repasPourReserve', 'joursDeReserveDistributeur']) {
    assert.equal(typeof D[nom], 'function', nom + ' n’est pas au démarrage : la carte ne dirait ni « ≈ 8 j » ni « 12 g »');
    assert.equal(DF[nom], D[nom], nom + ' : distributeurfiche.js doit reprendre la même fonction');
  }
  const S = etats();
  const lu = D.lireDistributeur(INDEX, S, CFG);
  assert.deepEqual(D.mesurePortion(S, lu.portion, lu.poidsPortion), { grammesParPortion: 6, portionsParAppui: 2 });
});
