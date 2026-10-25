/* TEST AJOUTÉ (étape 2 IoT, 19/10 ; § 10 de la conception) — la démo du distributeur porte chaque cas de sa maquette « Cartes IoT »,
 * 1e, et ce que Loggia dira sans que la maquette le montre :
 *  - par défaut, l'Aqara de la maison : le bac à 38 % (760 g sur 2 000), servi par « Croquettes matin et soir » à 07:30 et 19:00 —
 *    « Repas à 19:00 · ≈ 8 j » sur la carte —, « Croquettes du midi » coupée, et une ration donnée au bouton de l'appareil samedi à
 *    16:10 : l'Historique les nomme, l'automatisation et « Repas à la main » ;
 *  - `?demo&distributeur=bas` : le bac sous 15 % — la phrase en ambre ;
 *  - `?demo&distributeur=probleme` : l'appareil signale un problème — « Problème signalé » sur la carte, et la rangée « État du
 *    distributeur » de la popup ;
 *  - « Je l'ai rempli » remet l'aide à son maximum (2 000 g) ; « Distribuer » : l'appareil met un instant à servir — d'abord la
 *    demande (la fiche dit « Demande envoyée »), puis le compteur du jour monte (« Servi à … »).
 * L'horloge de la démo est réglée au lundi 19/10/2026, 18:20, le « maintenant » de la maquette (`maisonDistributeurDemo(v, { quand })`). */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonDistributeurDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const { lireDistributeur, carteDistributeur, estMasse } = await import('../src/distributeur.js');
const { repasDepuisHistorique, septJoursRepas } = await import('../src/distributeurfiche.js');

const T = new Date(2026, 9, 19, 18, 20).getTime(); // lundi 19/10/2026, 18:20
const BAC = 'input_number.croquettes_reservoir', GJOUR = 'sensor.distributeur_weight_per_day';
/* L'index de la démo bâti comme l'écran le bâtit (le contrat de la démo des robots) : l'appareil se retrouve par ses entités, et ses
 * sœurs avec lui — le capteur qui dit d'où vient un repas compris. */
const maison = (variante = null) => {
  const m = maisonDistributeurDemo(variante, { quand: T });
  const r = m.index;
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  return { ...m, ix };
};
const carte = (m) => carteDistributeur({ index: m.ix, states: m.states, cfg: m.feeder, etat: m.etat(), maintenant: T });

/* L'Historique tel que la fiche le lit : l'historique minimal des compteurs, du « dernier repas » et des événements, celui des
 * automatisations reconnues AVEC leurs attributs (leur `last_triggered`), sur dix jours. */
function semaine(m) {
  const hs = lireDistributeur(m.ix, m.states, m.feeder).historique;
  const e = m.etat();
  const autos = e.automatisations.filter(a => !a.indice).map(a => a.entity_id);
  const debut = new Date(T - 10 * 86400000).toISOString(), fin = encodeURIComponent(new Date(T).toISOString());
  const url = (ids, minimal) => 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(ids.join(',')) + '&end_time=' + fin + (minimal ? '&minimal_response&no_attributes' : '');
  const brut = [...m.historique(url([...hs.compteurs, hs.dernier, ...hs.evenements].filter(Boolean), true)), ...m.historique(url(autos, false))];
  const lignes = repasDepuisHistorique(brut, { compteurs: hs.compteurs, dernier: hs.dernier, evenements: hs.evenements, automatisations: autos,
    journal: e.journal || [], states: m.states, depuis: T - 10 * 86400000, maintenant: T });
  return septJoursRepas(lignes, { noms: Object.fromEntries(e.automatisations.map(a => [a.entity_id, a.nom])), maintenant: T });
}
const quand = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

test('par défaut : le bac à 38 %, « Repas à 19:00 · ≈ 8 j », une automatisation qui sert et une coupée', () => {
  const m = maison();
  const c = carte(m);
  assert.deepEqual([c.pct, c.grammes, c.phrase.texte, c.phrase.encre], [38, 760, 'Repas à 19:00 · ≈ 8 j', 'var(--o-text2)']);
  const e = m.etat();
  assert.deepEqual(e.automatisations.map(a => [a.nom, a.etat]), [['Croquettes matin et soir', 'on'], ['Croquettes du midi', 'off']], 'une automatisation coupée');
  assert.equal(c.alerte, null, 'aucun problème : pas de rangée d’état');
});

/* TEST AJOUTÉ (passe bis 2 de l'étape 2, 19/10 ; relecture de contrôle) : la démo par défaut avait perdu son pas à pas — son number
 * désigné est en grammes, donc un POIDS (D1), et l'Aqara n'avait pas de taille de ration ; le cas de sa maquette n'était visible que
 * dans `?demo&distributeur=z2m`, pas depuis le lien public. L'appareil en a une, comme Zigbee2MQTT la publie
 * (`number.distributeur_serving_size`, en « portion », de 1 à 10) : le pas à pas de « Servir maintenant » revient, et la carte dit le
 * vrai total — la taille de ration × le poids d'une portion. À 1 portion, le reste de la maison ne bouge pas (45 g, ≈ 8 j). */
test('par défaut : la taille de ration de l’appareil (1 portion) — le pas à pas revient, la carte dit 1 × 45 g ; réglée à 2, « Distribuer 90 g »', () => {
  const m = maison();
  const lu = lireDistributeur(m.ix, m.states, m.feeder);
  assert.deepEqual(lu.portion, { entity_id: 'number.distributeur_serving_size', unite: 'portion', min: 1, max: 10, pas: 1 }, 'la taille de ration, en portions');
  assert.deepEqual(lu.poidsPortion, { entity_id: 'number.distributeur_portion', unite: 'g' }, 'le number désigné en grammes est le poids');
  assert.ok(lu.portion && !estMasse(lu.portion.unite), 'le pas à pas de « Servir maintenant » règle une taille, jamais un poids (D1)');
  const c = carte(m);
  assert.deepEqual([c.mesure, c.ration], [{ grammesParPortion: 45, portionsParAppui: 1 }, 45]);
  // Réglée à 2 portions (le « + » du pas à pas) : la carte, la réserve et la ration servie suivent.
  m.states['number.distributeur_serving_size'] = { ...m.states['number.distributeur_serving_size'], state: '2' };
  const c2 = carte(m);
  assert.deepEqual([c2.mesure, c2.ration, c2.phrase.texte], [{ grammesParPortion: 45, portionsParAppui: 2 }, 90, 'Repas à 19:00 · ≈ 4 j']);
  const attente = [];
  const avant = Number(m.states[GJOUR].state);
  m.distribuer(1, (f, ms) => attente.push([f, ms]));
  attente[0][0]();
  assert.equal(Number(m.states[GJOUR].state), avant + 90, 'deux portions de 45 g');
  // Hors ligne, la taille tombe avec le reste de l'appareil.
  assert.equal(maison('horsligne').states['number.distributeur_serving_size'].state, 'unavailable');
});

test('l’Historique de la démo : les repas de l’automatisation, et la ration donnée au bouton de l’appareil samedi', () => {
  const s = semaine(maison());
  const rangs = s.rangees.map(r => [quand(r.t), r.titre, r.origine]);
  assert.deepEqual(rangs.slice(0, 2), [['lun. 07:30', 'Croquettes matin et soir', 'automatisme'], ['dim. 19:00', 'Croquettes matin et soir', 'automatisme']], JSON.stringify(rangs));
  assert.ok(rangs.some(r => r[0] === 'sam. 16:10' && r[1] === 'Repas à la main' && r[2] === 'main'), 'la ration au bouton : ' + JSON.stringify(rangs));
  assert.ok(s.n >= 13 && s.grammes === s.n * 45, '« {n} repas · {g} g » : ' + s.n + ' repas, ' + s.grammes + ' g');
});

test('`?demo&distributeur=bas` : le bac sous 15 % — la phrase en ambre', () => {
  const c = carte(maison('bas'));
  assert.ok(c.pct < 15, 'le bac : ' + c.pct + ' %');
  assert.deepEqual([c.phrase.texte, c.phrase.encre], ['Repas à 19:00 · ≈ 2 j', 'var(--o-warn)']);
});

test('`?demo&distributeur=probleme` : l’appareil signale un problème — la carte le dit, la popup a sa rangée d’état', () => {
  const m = maison('probleme');
  const c = carte(m);
  assert.deepEqual([c.alerte, c.phrase.texte, c.phrase.encre], ['autre', 'Problème signalé · Repas à 19:00', 'var(--o-warn)']);
  const lu = lireDistributeur(m.ix, m.states, m.feeder);
  /* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point B) : l'erreur a ses deux formes — avec `device_class`, et SANS, comme
   * Zigbee2MQTT la publie (« Erreur moteur ») : reconnue à son suffixe `_error`, elle aussi. */
  assert.deepEqual(lu.anomalies.filter(a => a.actif).map(a => [a.entity_id, a.type]), [['binary_sensor.distributeur_error', 'autre'], ['binary_sensor.distributeur_motor_error', 'autre']]);
  assert.equal(m.states['binary_sensor.distributeur_motor_error'].attributes.device_class, undefined, 'témoin : la seconde erreur n’a pas de classe');
  assert.ok(c.envoi, 'l’appareil répond encore : « Distribuer » reste');
});

/* TESTS AJOUTÉS (passe bis de l'étape 2, 19/10 ; D1, points G et § 10) : la démo porte chaque cas. */
test('`?demo&distributeur=z2m` : la mangeoire telle que Zigbee2MQTT la publie — « Distribuer 12 g », ≈ 31 j, « 2 portions · 12 g »', () => {
  const m = maison('z2m');
  const c = carte(m);
  const lu = lireDistributeur(m.ix, m.states, m.feeder);
  assert.deepEqual([lu.portion.entity_id, lu.portion.unite, lu.poidsPortion.entity_id, lu.poidsPortion.unite],
    ['number.mangeoire_serving_size', 'portion', 'number.mangeoire_portion_weight', 'g'], 'la taille en « portion », le poids désigné en g');
  assert.deepEqual([c.mesure, c.ration], [{ grammesParPortion: 6, portionsParAppui: 2 }, 12], '2 portions × 6 g — ce que la popup dit « 2 portions · 12 g »');
  // 760 g, deux repas de 12 g par jour : 31 jours — les mêmes jours sur la carte et dans la popup.
  assert.deepEqual([c.pct, c.grammes, c.jours, c.phrase.texte], [38, 760, 31, 'Repas à 19:00 · ≈ 31 j']);
  assert.deepEqual(c.envoi, { domaine: 'select', service: 'select_option', data: { entity_id: 'select.mangeoire_feed', option: 'START' } });
  assert.deepEqual(m.states['select.mangeoire_feed'].attributes.options, ['', 'START']);
  assert.equal(m.states['binary_sensor.mangeoire_error'].attributes.device_class, undefined, 'l’erreur sans classe, à off');
  assert.deepEqual(lu.anomalies, [{ entity_id: 'binary_sensor.mangeoire_error', type: 'autre', actif: false }]);
  // Les deux compteurs de la journée : 24 g, 4 portions (les repas de 07:30 et 19:00… celui du soir n'est pas encore parti à 18:20).
  assert.deepEqual([m.states['sensor.mangeoire_weight_per_day'].state, m.states['sensor.mangeoire_portions_per_day'].state], ['12', '2']);
  // L'Historique : chaque appui, 2 portions de 6 g ; la ration au bouton de samedi, 1 portion.
  const s = semaine(m);
  assert.ok(s.n >= 13 && s.rangees.some(r => r.titre === 'Repas à la main' && r.grammes === 6), JSON.stringify(s.rangees.slice(0, 3)));
  // « Distribuer » : le compteur en grammes ET celui en portions montent.
  const attente = [];
  m.distribuer(1, (f, ms) => attente.push([f, ms]));
  attente[0][0]();
  assert.deepEqual([m.states['sensor.mangeoire_weight_per_day'].state, m.states['sensor.mangeoire_portions_per_day'].state], ['24', '4']);
});

test('`?demo&distributeur=reservoir` : l’aide du bac seule muette — « Réservoir indisponible », la vis répond', () => {
  const c = carte(maison('reservoir'));
  assert.deepEqual([c.mort, c.raison, c.reservoirMort, c.pct, c.phrase.texte, c.phrase.panne], [true, 'reservoir', true, null, 'Réservoir indisponible', true]);
  assert.ok(c.envoi && c.ration === 45, '« Distribuer 45 g » reste');
});

test('`?demo&distributeur=programme` : le programme de l’appareil, présent mais illisible — « Programme de l’appareil » sur la carte', () => {
  const m = maison('programme');
  const c = carte(m);
  const e = m.etat();
  assert.deepEqual([e.programme.presente, e.programme.lisible, e.programme.mode, e.automatisations.length], [true, false, 'programme', 0]);
  assert.deepEqual([c.phrase.texte, c.prochain, c.jours], ['Programme de l’appareil', null, null], 'rien ne s’invente : ni repas, ni réserve');
  assert.ok(c.envoi, '« Distribuer » reste');
});

test('« Je l’ai rempli » : l’aide du bac est vivante, son maximum est 2 000 g', () => {
  /* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point G) : `rempli` n'est plus à la carte — la popup seule décide, sur une aide
   * `input_number` vivante (tests/fiche_distributeur_accueil.test.mjs). La démo lui donne ce qu'il faut : l'aide, vivante, et son maximum. */
  const m = maison();
  const c = carte(m);
  assert.deepEqual([c.reservoir, c.max, c.reservoirMort, c.pct], [BAC, 2000, false, 38]);
  assert.ok(BAC.indexOf('input_number.') === 0 && m.states[BAC].state !== 'unavailable' && Number(m.states[BAC].attributes.max) === 2000);
  const hors = carte(maison('horsligne'));
  assert.deepEqual([hors.reservoir, hors.reservoirMort, hors.mort, hors.raison], [BAC, false, true, 'commande'], 'l’aide ne tombe pas avec le Zigbee2MQTT');
});

test('« Distribuer » : l’appareil met un instant à servir — la demande d’abord, puis le compteur du jour monte', () => {
  const m = maison();
  const attente = [];
  const avant = Number(m.states[GJOUR].state);
  m.distribuer(1, (f, ms) => attente.push([f, ms]));
  assert.equal(Number(m.states[GJOUR].state), avant, 'le compteur bouge aussitôt : la fiche ne dirait jamais « Demande envoyée »');
  assert.equal(attente.length, 1);
  assert.ok(attente[0][1] >= 1000 && attente[0][1] <= 5000, 'un instant, pas une minute (la fiche n’attend le compteur qu’une minute) : ' + attente[0][1]);
  attente[0][0]();
  assert.equal(Number(m.states[GJOUR].state), avant + 45, 'une portion de 45 g');
  assert.equal(m.states['sensor.distributeur_feeding_source'].state, 'remote', 'l’appareil dit d’où vient la ration');
});
