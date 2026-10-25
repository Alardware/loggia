/* TEST AJOUTÉ (étape 2 IoT, 19/10 ; sa maquette « Cartes IoT », 1e ; I21, I22, I23, I26) — la popup du distributeur : le socle et
 * l'Accueil.
 *
 * Ces tests JOUENT la fiche (tests/crochets.mjs) : on la monte sur un `hass` et une réponse du serveur, on lit l'Accueil — ses props,
 * puis ce qu'il dessine, monté à son tour —, on appuie. L'heure est celle de la démo, lundi 19/10/2026, 18:20. Ce qui est garanti :
 *  - I21 : l'en-tête commun — la plaque de la carte, « Distributeur » sous le nom, la roue (I4 A) ; Accueil · Repas · Historique,
 *    et Entretien seulement s'il y a de quoi (I26) — plus pour une aide de réservoir ;
 *  - I22 : le réservoir en grand, « ≈ 18 jours de réserve · 450 g », la barre ; « Je l'ai rempli » DEMANDE — « Remettre le niveau
 *    à 100 % ? » · « Annuler » · « Oui, 100 % » — et seulement sur une aide `input_number` vivante ; puis le maximum de l'aide, montré
 *    tout de suite ; les tuiles « Prochain repas » et « Aujourd'hui » ; « État du distributeur » seulement quand l'appareil se plaint ;
 *  - I23 : « Servir maintenant » selon la commande de l'appareil — la taille de ration de l'appareil, écrite aussitôt ; les portions de
 *    CE geste pour une commande qui écrit une quantité ; rien pour un bouton sans taille — et « Distribuer », le geste partagé : deux
 *    appuis, une ration ; « Demande envoyée à 18:20 », puis « Servi à 18:21 · 12 g » quand le compteur de l'appareil bouge. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const Fiche = (await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href)).default;
const { reglerPartage } = await import('../src/optimiste.js');
// Les briques de la lecture (passe bis 2 de l'étape 2, 19/10) : ce que la fiche écarte, la brique du serveur le garde — la fixture le fige.
const { lireDistributeur } = await import('../src/distributeur.js');
const { consommablesDistributeur } = await import('../src/distributeurfiche.js');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (j, h, m, s = 0) => new Date(2026, 9, 19 + j, h, m, s).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = iso(a(0, 14, 20))) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });

/* La maison type : un distributeur sous Zigbee2MQTT — un `select` START, sa taille de ration (2 portions de 6 g), son compteur du
 * jour (12 g, servis à 07:30), son erreur —, un bac tenu par une aide `input_number` (450 g sur 1 500), deux automatisations. */
const FEED = 'select.distributeur_feed', TAILLE = 'number.distributeur_serving_size', POIDS = 'number.distributeur_portion_weight';
const GJOUR = 'sensor.distributeur_weight_per_day', ERREUR = 'binary_sensor.distributeur_error', BAC = 'input_number.croquettes_reservoir';
const MATIN = 'automation.croquettes_matin_et_soir', MIDI = 'automation.croquettes_du_midi';
const APPAREIL = [FEED, TAILLE, POIDS, GJOUR, ERREUR];
const CFG = { haid: FEED, haids: { reservoir: BAC } };
function maison() {
  return {
    [FEED]: st(FEED, 'unknown', { friendly_name: 'Distributeur Feed', options: ['START'] }),
    [TAILLE]: st(TAILLE, '2', { friendly_name: 'Distributeur Serving size', min: 1, max: 10, step: 1 }),
    [POIDS]: st(POIDS, '6', { friendly_name: 'Distributeur Portion weight', min: 1, max: 20, step: 1, unit_of_measurement: 'g' }),
    [GJOUR]: st(GJOUR, '12', { friendly_name: 'Distributeur Weight per day', unit_of_measurement: 'g' }, iso(a(0, 7, 30))),
    [ERREUR]: st(ERREUR, 'off', { friendly_name: 'Distributeur Error', device_class: 'problem' }),
    [BAC]: st(BAC, '450', { friendly_name: 'Réservoir', min: 0, max: 1500, step: 1, unit_of_measurement: 'g' }),
    [MATIN]: st(MATIN, 'on', { friendly_name: 'Croquettes matin et soir' }),
    [MIDI]: st(MIDI, 'off', { friendly_name: 'Croquettes du midi' }),
  };
}
const auto = (entity_id, nom, etat, heures, jours = null) => ({ entity_id, nom, etat, heures, jours, conditionnel: false, portions: null, declencheurs: heures.map(heure => ({ type: 'heure', heure })), pilotable: true, modifiable: false, indice: null, dernier: null });
const ETAT = () => ({
  source: 'automatisations',
  sources: { programme: { presente: false, active: false }, automatisations: { presente: true, active: true }, loggia: { presente: false, active: false } },
  appareil: { device_id: 'dev1', nom: 'Distributeur de croquettes', fabricant: 'Aqara', modele: 'ZNCWWSQ01LM' },
  programme: { source: 'aqara', connu: true, presente: false, active: false, lisible: false, mode: 'manuel', note: 'mode_manuel', repas: [] },
  automatisations: [auto(MATIN, 'Croquettes matin et soir', 'on', ['07:30', '19:00']), auto(MIDI, 'Croquettes du midi', 'off', ['12:30'], [0, 1, 2, 3, 4])],
  planning: { appareil: null, repas: [] }, peutPlanifier: false, commande: { domaine: 'select', quantite: false, min: null, max: null, pas: null },
  ancienne_liste: { n: 0, relies: 0, non_relies: [] }, notes: [], journal: [],
});
/* L'historique du compteur du jour, au format de `history/period` : minuit à zéro, puis le repas de 07:30. */
const HISTOIRE = () => [[{ entity_id: GJOUR, state: '0', last_changed: iso(a(0, 0, 0)) }, { entity_id: GJOUR, state: '12', last_changed: iso(a(0, 7, 30)) }]];
function poser({ retouche = null, index = null, ids = APPAREIL } = {}) {
  const courants = maison();
  if (retouche) retouche(courants);
  const appels = [];
  const hass = () => ({
    user: { is_admin: true },
    states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    callApi: () => Promise.resolve(HISTOIRE()),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), (data && (data.option ?? data.value))].filter(x => x != null).join(' ')); return Promise.resolve(); },
  });
  const entityMeta = new Map(ids.map(id => [id, { deviceId: 'dev1', platform: 'mqtt', device: 'Distributeur' }]));
  return { appels, courants, hass, index: index || { entityMeta, deviceMeta: new Map([['dev1', { id: 'dev1', name: 'Distributeur', manufacturer: 'Aqara', model: 'ZNCWWSQ01LM' }]]) } };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  Date.now = () => T;
  reglerPartage();
  try { return await fn({ h, d, horloge: (t) => { Date.now = () => t; } }); } finally { reglerPartage(); Date.now = vraiNow; h.restaurer(); d.restaurer(); }
}
const attendre = () => new Promise(r => setImmediate(r));
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
const bouton = (m, texte) => m.trouver(e => e.type === 'button' && (texteDe(e).includes(texte) || e.props['aria-label'] === texte))[0];
const PLAQUE = { fond: 'rgba(var(--o-piece-ambre-rgb),.18)', encre: 'var(--o-piece-ambre)', icone: 'paw' };
async function fiche(w, { etat = ETAT(), cfg = CFG, ongletDepart = 'accueil' } = {}) {
  const m = monter(Fiche, { hass: w.hass(), index: w.index, cfg, etat, ongletDepart, maintenant: T, plaque: PLAQUE, sousNom: 'Distributeur', epingle: null });
  await attendre();
  m.rendre();
  const accueil = () => { const el = de(m, 'OngletAccueil')[0]; return el ? monter(el.type, el.props) : null; };
  return { m, accueil, relire: () => m.proprietes({ hass: w.hass() }) };
}

test('I21, I26 : le socle — la plaque, « Distributeur », la roue ; Accueil · Repas · Historique, et Entretien seulement s’il y a de quoi', () => dans(async () => {
  const w = poser();
  const { m } = await fiche(w);
  const e = de(m, 'EnteteFiche')[0];
  assert.deepEqual([e.props.nom, e.props.plaque, e.props.sousNom, e.props.reglages], ['Distributeur de croquettes', PLAQUE, 'Distributeur', true], 'la roue reste (I4 A)');
  const o = de(m, 'FicheOnglets')[0];
  assert.deepEqual(o.props.onglets.map(x => [x[1], x[2]]), [['Accueil', 'home'], ['Repas', 'calendar-clock'], ['Historique', 'time-past']], 'pas d’onglet Entretien pour une aide de réservoir');
  // Un consommable de l'appareil (le déshydratant d'un Petlibro) : l'onglet Entretien revient.
  const DESH = 'sensor.distributeur_remaining_desiccant';
  const w2 = poser({ retouche: (c) => { c[DESH] = st(DESH, '12', { unit_of_measurement: 'd' }); }, ids: [...APPAREIL, DESH] });
  w2.index.entityMeta.set(DESH, { deviceId: 'dev1', platform: 'mqtt', translationKey: 'remaining_desiccant' });
  const { m: m2 } = await fiche(w2);
  assert.deepEqual(de(m2, 'FicheOnglets')[0].props.onglets.map(x => x[1]), ['Accueil', 'Repas', 'Historique', 'Entretien']);
}));

test('I22 : le réservoir — 30 %, « ≈ 18 jours de réserve · 450 g », la barre ; « Je l’ai rempli » demande, « Annuler » ne fait rien', () => dans(async () => {
  const w = poser();
  const { accueil } = await fiche(w);
  const ma = accueil();
  const t = ma.texte();
  assert.ok(t.includes('Réservoir') && t.includes('30') && t.includes('≈ 18 jours de réserve · 450 g'), t);
  const barre = ma.trouver(e => e.props && e.props['data-barre'] !== undefined)[0];
  assert.deepEqual([barre.props.style.width, barre.props.style.background], ['30%', 'var(--o-piece-ambre)']);
  assert.ok(!t.includes('Remettre le niveau'), 'témoin : pas de question avant l’appui');
  ma.appuyer(bouton(ma, 'Je l’ai rempli'));
  assert.ok(ma.texte().includes('Remettre le niveau à 100 % ?'), 'la question, à la place de la puce');
  assert.equal(bouton(ma, 'Je l’ai rempli'), undefined);
  ma.appuyer(bouton(ma, 'Annuler'));
  assert.deepEqual(w.appels, [], '« Annuler » ne remet rien');
  assert.ok(!ma.texte().includes('Remettre le niveau') && bouton(ma, 'Je l’ai rempli'), 'la question se referme, la puce revient');
}));

test('I22 : « Oui, 100 % » — le maximum de l’aide par `input_number.set_value`, montré tout de suite', () => dans(async () => {
  const w = poser();
  const { m, accueil } = await fiche(w);
  const ma = accueil();
  ma.appuyer(bouton(ma, 'Je l’ai rempli'));
  ma.appuyer(bouton(ma, 'Oui, 100 %'));
  await attendre();
  assert.deepEqual(w.appels, ['input_number.set_value ' + BAC + ' 1500']);
  m.rendre();
  const apres = accueil().texte();
  assert.ok(apres.includes('100') && !apres.includes('Remettre le niveau'), 'le bac plein, tout de suite : ' + apres);
}));

test('I22 : « Je l’ai rempli » seulement sur une aide vivante — ni sur une sonde de bac, ni sur une aide muette', () => dans(async () => {
  assert.ok(bouton((await fiche(poser())).accueil(), 'Je l’ai rempli'), 'témoin : sur l’aide vivante, la puce est là');
  const sonde = poser({ retouche: (c) => { c['sensor.bac'] = st('sensor.bac', '64', { unit_of_measurement: '%' }); } });
  const ms = (await fiche(sonde, { cfg: { haid: FEED, haids: { reservoir: 'sensor.bac' } } })).accueil();
  assert.ok(ms.texte().includes('64') && !bouton(ms, 'Je l’ai rempli'), 'un vrai capteur se remplit tout seul');
  const muette = poser({ retouche: (c) => { c[BAC] = st(BAC, 'unavailable', {}); } });
  const mm = (await fiche(muette)).accueil();
  assert.ok(mm.texte().includes('Indisponible') && !bouton(mm, 'Je l’ai rempli'), mm.texte());
  assert.equal(mm.trouver(e => e.props && e.props['data-barre'] !== undefined).length, 0, 'ni barre ni « 0 % »');
}));

test('I23 : « Servir maintenant » — la taille de ration de l’appareil, écrite aussitôt ; « Distribuer », une ration pour deux appuis', () => dans(async () => {
  const w = poser();
  const { accueil } = await fiche(w);
  const ma = accueil();
  const t = ma.texte();
  assert.ok(t.includes('Servir maintenant') && t.includes('2 portions · 12 g') && t.includes('Elle vaut pour les rations suivantes.'), t);
  ma.appuyer(bouton(ma, 'Portion plus grande'));
  await attendre();
  assert.deepEqual(w.appels, ['number.set_value ' + TAILLE + ' 3'], 'la taille de l’appareil, écrite aussitôt');
  assert.ok(ma.texte().includes('3 portions · 18 g'), 'et montrée tout de suite');
  w.appels.length = 0;
  const distribuer = bouton(ma, 'Distribuer');
  ma.appuyer(distribuer);
  ma.appuyer(distribuer);
  await attendre();
  assert.deepEqual(w.appels, ['select.select_option ' + FEED + ' START'], 'deux appuis, une ration');
  assert.equal(bouton(ma, 'Distribuer').props['aria-disabled'], 'true', 'en vol, sans effet');
  assert.ok(ma.texte().includes('Demande envoyée à 18:20'), ma.texte());
}));

test('I23 : « Servi à 18:21 · 12 g » quand le compteur de l’appareil bouge — sinon la demande, rien de plus', () => dans(async ({ horloge }) => {
  const w = poser();
  const { m, accueil } = await fiche(w);
  let ma = accueil();
  ma.appuyer(bouton(ma, 'Distribuer'));
  assert.ok(ma.texte().includes('Demande envoyée à 18:20'));
  // Le compteur du jour monte d'une ration, une minute plus tard.
  horloge(a(0, 18, 21));
  w.courants[GJOUR] = st(GJOUR, '24', { unit_of_measurement: 'g' }, iso(a(0, 18, 21)));
  m.proprietes({ hass: w.hass() });
  ma.proprietes(de(m, 'OngletAccueil')[0].props);
  const servi = ma.trouver(e => e.props && typeof e.props.children === 'string' && e.props.children.startsWith('Servi à'))[0];
  assert.deepEqual([servi && servi.props.children, servi && servi.props.style.color], ['Servi à 18:21 · 12 g', 'var(--o-ok)']);
  // Sans compteur qui bouge : la demande seule, jamais « Servi » inventé (une autre maison, à 18:20, le verrou du premier geste tombé).
  horloge(T);
  reglerPartage();
  const w2 = poser();
  const f2 = await fiche(w2);
  ma = f2.accueil();
  ma.appuyer(bouton(ma, 'Distribuer'));
  assert.ok(ma.texte().includes('Demande envoyée à 18:20') && !ma.texte().includes('Servi à'), ma.texte());
}));

test('I23 : une commande qui écrit une quantité compte les portions de CE geste ; un bouton sans taille n’a pas de pas à pas ; muet, rien', () => dans(async () => {
  // Un `number` feed de PetKit : chaque portion est un pas de l'entité (10).
  const PK = 'number.distributeur_feed';
  const pk = poser({ retouche: (c) => { delete c[FEED]; delete c[TAILLE]; delete c[POIDS]; c[PK] = st(PK, '0', { min: 0, max: 100, step: 10 }); }, ids: [PK] });
  pk.index.entityMeta.set(PK, { deviceId: 'dev1', platform: 'petkit', translationKey: 'feed' });
  const etatPk = ETAT(); etatPk.commande = { domaine: 'number', quantite: true, min: 0, max: 100, pas: 10 };
  const mp = (await fiche(pk, { cfg: { appareil: 'dev1', haids: { reservoir: BAC } }, etat: etatPk })).accueil();
  assert.ok(mp.texte().includes('1 portion') && !mp.texte().includes('Elle vaut pour les rations suivantes.'), mp.texte());
  mp.appuyer(bouton(mp, 'Portion plus grande'));
  assert.ok(mp.texte().includes('2 portions'));
  assert.deepEqual(pk.appels, [], 'les portions de ce geste ne s’écrivent pas à l’appareil');
  mp.appuyer(bouton(mp, 'Distribuer'));
  await attendre();
  assert.deepEqual(pk.appels, ['number.set_value ' + PK + ' 20'], 'deux portions, deux pas');
  // Un bouton sans taille de ration : « Distribuer » seul.
  const BTN = 'button.distributeur_manual_feed';
  const bt = poser({ retouche: (c) => { delete c[FEED]; delete c[TAILLE]; delete c[POIDS]; c[BTN] = st(BTN, 'unknown', {}); }, ids: [BTN] });
  bt.index.entityMeta.set(BTN, { deviceId: 'dev1', platform: 'petlibro', translationKey: 'manual_feed' });
  const mb = (await fiche(bt, { cfg: { appareil: 'dev1', haids: { reservoir: BAC } } })).accueil();
  assert.ok(bouton(mb, 'Distribuer') && !bouton(mb, 'Portion plus grande'), 'pas de pas à pas');
  // Muet : pas de « Servir maintenant » du tout — rien d'inerte.
  const muet = poser({ retouche: (c) => { c[FEED] = st(FEED, 'unavailable', { options: ['START'] }); } });
  const mm = (await fiche(muet)).accueil();
  assert.ok(!mm.texte().includes('Servir maintenant') && !bouton(mm, 'Distribuer'), mm.texte());
}));

/* TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; D1, I23) : « Poids d'une portion » de Paramètres désigne l'entité de POIDS (un number en
 * g, ce que le champ demande), sur un Aqara tel que Zigbee2MQTT le publie (la taille en « portion »). Le pas à pas de « Servir
 * maintenant » règle la TAILLE de ration (« 2 portions · 12 g » → 3 sur `serving_size`), jamais le poids : il aurait réglé
 * l'étalonnage de l'appareil. Un poids seul, sans taille, n'a pas de pas à pas du tout. */
test('D1 : le pas à pas écrit la taille de ration (« portion »), jamais l’entité de poids ; un poids seul n’a pas de pas à pas', () => dans(async () => {
  const z2m = (c) => { c[TAILLE] = st(TAILLE, '2', { ...c[TAILLE].attributes, unit_of_measurement: 'portion' }); c[FEED] = st(FEED, 'unknown', { ...c[FEED].attributes, options: ['', 'START'] }); };
  const w = poser({ retouche: z2m });
  const ma = (await fiche(w, { cfg: { haid: FEED, haids: { reservoir: BAC, portionWeight: POIDS } } })).accueil();
  assert.ok(ma.texte().includes('2 portions · 12 g') && ma.texte().includes('≈ 18 jours de réserve · 450 g'), ma.texte());
  ma.appuyer(bouton(ma, 'Portion plus grande'));
  await attendre();
  assert.deepEqual(w.appels, ['number.set_value ' + TAILLE + ' 3'], 'la taille, jamais le poids');
  assert.ok(ma.texte().includes('3 portions · 18 g'));
  ma.appuyer(bouton(ma, 'Distribuer'));
  await attendre();
  assert.deepEqual(w.appels.slice(1), ['select.select_option ' + FEED + ' START']);
  // Le poids seul (l'appareil n'a pas de taille de ration) : « Distribuer » sans pas à pas, et rien n'est écrit sur le poids.
  const seul = poser({ retouche: (c) => { z2m(c); delete c[TAILLE]; }, ids: [FEED, POIDS, GJOUR, ERREUR] });
  const ms = (await fiche(seul, { cfg: { haid: FEED, haids: { reservoir: BAC, portionWeight: POIDS } } })).accueil();
  assert.ok(bouton(ms, 'Distribuer') && !bouton(ms, 'Portion plus grande') && !bouton(ms, 'Portion plus petite'), ms.texte());
  assert.ok(!ms.texte().includes('Elle vaut pour les rations suivantes.') && !ms.texte().includes('6 g'), ms.texte());
  assert.deepEqual(seul.appels, []);
}));

test('I22 : les tuiles — « 19:00 » · « Croquettes matin et soir », « 1 repas · 12 g » · « 07:30 » ; « Aucun » quand rien n’est allumé', () => dans(async () => {
  const w = poser();
  const { m, accueil } = await fiche(w);
  await attendre();
  m.rendre();
  const tuiles = de(accueil(), 'Tuile').map(x => x.props);
  assert.deepEqual(tuiles.map(x => [x.nom, x.titre, x.sous]), [['Prochain repas', '19:00', 'Croquettes matin et soir'], ['Aujourd’hui', '1 repas · 12 g', '07:30']]);
  tuiles[0].onClick();
  m.rendre();
  assert.equal(de(m, 'FicheOnglets')[0].props.actuel, 'planning', 'la tuile ouvre Repas');
  // Toutes les automatisations coupées : « Aucun » · « Aucune automatisation active ».
  const etat = ETAT(); etat.automatisations = etat.automatisations.map(x => ({ ...x, etat: 'off' }));
  const w2 = poser({ retouche: (c) => { c[MATIN] = st(MATIN, 'off'); } });
  const p2 = de((await fiche(w2, { etat })).accueil(), 'Tuile')[0].props;
  assert.deepEqual([p2.titre, p2.sous], ['Aucun', 'Aucune automatisation active']);
  // Sans compteur ni capteur du dernier repas : pas de tuile « Aujourd'hui » — l'historique ne voit que Home Assistant.
  const w3 = poser({ ids: [FEED, TAILLE, POIDS, ERREUR] });
  assert.deepEqual(de((await fiche(w3)).accueil(), 'Tuile').map(x => x.props.nom), ['Prochain repas']);
}));

/* TEST AJOUTÉ (passe bis de l'étape 2, 19/10 ; point E, ajustement 2 : rien ne s'invente) : le programme de l'appareil existe mais ne se
 * lit pas, sans automatisation ni capteur du prochain repas — la carte dit « Programme de l'appareil », et la tuile disait « Aucun ·
 * Rien de planifié » (sonde G). Elle dit ce que la carte dit. */
test('point E : la tuile « Prochain repas » dit « Programme de l’appareil » quand il existe sans se lire — jamais « Rien de planifié »', () => dans(async () => {
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources = { programme: { presente: true, active: true }, automatisations: { presente: false, active: false }, loggia: { presente: false, active: false } };
  etat.programme = { source: 'tuya', connu: true, presente: true, active: true, lisible: false, mode: 'programme', note: 'non_lisible', repas: [] };
  const w = poser({ retouche: (c) => { c[GJOUR] = st(GJOUR, '0', { unit_of_measurement: 'g' }, iso(a(0, 0, 0))); delete c[MATIN]; delete c[MIDI]; } });
  const tuiles = de((await fiche(w, { etat })).accueil(), 'Tuile').map(x => x.props);
  assert.deepEqual(tuiles.filter(x => x.nom === 'Prochain repas').map(x => [x.titre, x.sous]), [['Programme de l’appareil', null]]);
  assert.ok(!JSON.stringify(tuiles).includes('Rien de planifié') && !JSON.stringify(tuiles).includes('Aucun'), JSON.stringify(tuiles));
  // Le programme lisible mais VIDE, ou inexistant : « Aucun · Rien de planifié », comme avant.
  etat.programme = { source: 'aqara', connu: true, presente: false, active: false, lisible: true, mode: 'programme', note: null, repas: [] };
  etat.sources.programme = { presente: false, active: false };
  const t2 = de((await fiche(w, { etat })).accueil(), 'Tuile').map(x => x.props).find(x => x.nom === 'Prochain repas');
  assert.deepEqual([t2.titre, t2.sous], ['Aucun', 'Rien de planifié']);
}));

test('I22 : « État du distributeur » seulement quand l’appareil se plaint — jamais « Aucun problème »', () => dans(async () => {
  const calme = (await fiche(poser())).accueil();
  assert.ok(!calme.texte().includes('État du distributeur') && !calme.texte().includes('Aucun problème'), 'rien quand tout va');
  const w = poser({ retouche: (c) => { c[ERREUR] = st(ERREUR, 'on', { device_class: 'problem' }); } });
  const ma = (await fiche(w)).accueil();
  const rangee = ma.trouver(e => e.props && e.props.role === 'status')[0];
  assert.ok(rangee && texteDe(rangee).includes('État du distributeur') && texteDe(rangee).includes('Problème signalé par l’appareil'), ma.texte());
  const mot = ma.trouver(e => e.type === 'span' && e.props.children === 'Problème signalé par l’appareil')[0];
  assert.equal(mot.props.style.color, 'var(--o-warn)');
}));

/* ── TEST AJOUTÉ (étape 2 IoT, tâche 8, 19/10) : ce que la vérification dans `?demo` a appris ─────────────────────────────────── */

test('« Je l’ai rempli » n’existe pas sur un bac déjà plein : rien d’inerte', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[BAC] = st(BAC, '1500', { ...c[BAC].attributes }); } });
  const ma = (await fiche(w)).accueil();
  assert.ok(ma.texte().includes('100'), 'témoin : le bac plein');
  assert.equal(bouton(ma, 'Je l’ai rempli'), undefined, 'remettre à 100 % un bac à 100 % ne ferait rien');
}));

test('« Je l’ai rempli » au clavier : le focus va à « Annuler », puis revient à la puce — jamais sur <body>', () => dans(async ({ h }) => {
  const vus = [];
  const { m, accueil } = await fiche(poser());
  const ma = accueil();
  // Le document ne connaît que ce que l'Accueil dessine à l'instant : `focaliser` prend le premier point d'arrivée qui existe.
  globalThis.document.getElementById = (id) => (id && ma.trouver(e => e.props && e.props.id === id).length ? { focus: () => vus.push(id) } : null);
  const puce = bouton(ma, 'Je l’ai rempli');
  assert.ok(puce.props.id, 'la puce a un point d’arrivée');
  ma.appuyer(puce);
  h.avancer(1);
  const annuler = bouton(ma, 'Annuler');
  assert.equal(vus[vus.length - 1], annuler.props.id, 'la puce démontée, le focus va à « Annuler »');
  ma.appuyer(annuler);
  h.avancer(1);
  assert.equal(vus[vus.length - 1], puce.props.id, 'la question refermée, il revient à la puce');
  // « Oui, 100 % » : le bac plein, la puce s'en va — le focus va alors à « Distribuer », le geste suivant.
  ma.appuyer(bouton(ma, 'Je l’ai rempli'));
  h.avancer(1);
  ma.appuyer(bouton(ma, 'Oui, 100 %'));
  m.rendre();
  assert.equal(bouton(accueil(), 'Je l’ai rempli'), undefined, 'remis à 100 %, le bac n’offre plus de le remettre à 100 %');
  // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point G) : tenu par le comportement, plus par une chaîne de la source — la fiche
  // redessine l'Accueil sans la puce (le bac plein), puis le focus, différé d'une image, va à « Distribuer ».
  ma.proprietes(de(m, 'OngletAccueil')[0].props);
  const distribuer = bouton(ma, 'Distribuer');
  assert.ok(distribuer.props.id, '« Distribuer » a un point d’arrivée');
  h.avancer(1);
  assert.equal(vus[vus.length - 1], distribuer.props.id, 'sans la puce, le focus va à « Distribuer »');
}));

/* ── TESTS AJOUTÉS (passe bis de l'étape 2, 19/10 ; point G) : ce que les deux relectures ont vu ─────────────────────────────────── */

test('G : l’aide du bac seule muette — l’en-tête ne dit pas « ne répond plus », le liseré est sur le réservoir, « Distribuer » reste', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[BAC] = st(BAC, 'unavailable', {}); } });
  const { m, accueil } = await fiche(w);
  assert.equal(de(m, 'EnteteFiche')[0].props.panne, null, 'la vis répond : l’en-tête ne crie pas à la panne');
  const ma = accueil();
  const bac = ma.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf('o-panne') >= 0);
  assert.equal(bac.length, 1, 'le liseré, sur le panneau du réservoir');
  assert.ok(texteDe(bac[0]).includes('Indisponible') && bouton(ma, 'Distribuer'), ma.texte());
  // L'appareil muet, lui : l'en-tête le dit.
  const muet = poser({ retouche: (c) => { c[FEED] = st(FEED, 'unavailable', { options: ['START'] }); } });
  assert.equal(de((await fiche(muet)).m, 'EnteteFiche')[0].props.panne, 'Ce distributeur ne répond plus.');
}));

test('G : « Oui, 100 % » sur une aide en kg — 2 kg se montrent « 2 000 g », pas « 2 g »', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[BAC] = st(BAC, '0.45', { friendly_name: 'Réservoir', min: 0, max: 2, step: 0.01, unit_of_measurement: 'kg' }); } });
  const { m, accueil } = await fiche(w);
  const ma = accueil();
  assert.ok(ma.texte().includes('· 450 g') && ma.texte().includes('23'), 'témoin : 0,45 kg sur 2, 23 % — ' + ma.texte());
  ma.appuyer(bouton(ma, 'Je l’ai rempli'));
  ma.appuyer(bouton(ma, 'Oui, 100 %'));
  await attendre();
  assert.deepEqual(w.appels, ['input_number.set_value ' + BAC + ' 2'], 'le maximum de l’aide, dans SON unité');
  m.rendre();
  const apres = accueil().texte();
  assert.ok(apres.includes('100') && /· 2 000 g|· 2 000 g/.test(apres) && !/· 2 g/.test(apres), 'l’avance dit « 2 g » : ' + apres);
}));

test('G : « État du distributeur » — jamais deux fois le même message, et le nom propre d’une anomalie qui en a un', () => dans(async () => {
  const MOTEUR = 'binary_sensor.distributeur_motor_error';
  const w = poser({ retouche: (c) => {
    c[ERREUR] = st(ERREUR, 'on', { friendly_name: 'Distributeur Error', device_class: 'problem' });
    c[MOTEUR] = st(MOTEUR, 'on', { friendly_name: 'Erreur moteur' });
  }, ids: [...APPAREIL, MOTEUR] });
  const ma = (await fiche(w)).accueil();
  const rangee = ma.trouver(e => e.props && e.props.role === 'status')[0];
  assert.ok(rangee, 'la rangée d’état');
  const mots = ma.trouver(e => e.type === 'span' && e.props.style && e.props.style.color === 'var(--o-warn)')[0];
  assert.equal(mots.props.children, 'Error · Erreur moteur', 'chaque anomalie sous son nom propre, une fois');
  // Deux anomalies du même mot (deux « bac presque vide ») : le mot une seule fois ; sans nom propre, la phrase générale.
  const BAS1 = 'binary_sensor.distributeur_food_low', BAS2 = 'binary_sensor.distributeur_food_shortage', SANS = 'binary_sensor.distributeur_error';
  const w2 = poser({ retouche: (c) => {
    delete c[ERREUR];
    c[BAS1] = st(BAS1, 'on', { device_class: 'problem' }); c[BAS2] = st(BAS2, 'on', { device_class: 'problem' }); c[SANS] = st(SANS, 'on', {});
  }, ids: [FEED, TAILLE, POIDS, GJOUR, BAS1, BAS2, SANS] });
  const m2 = (await fiche(w2)).accueil();
  const mots2 = m2.trouver(e => e.type === 'span' && e.props.style && e.props.style.color === 'var(--o-warn)')[0];
  // Dans l'ordre des entités (l'erreur d'abord, puis les deux « bac presque vide », dits une fois).
  assert.equal(mots2.props.children, 'Problème signalé par l’appareil · Bac presque vide');
}));

test('G : la tuile « Aujourd’hui » après minuit — un compteur qui n’a pas bougé AUJOURD’HUI ne compte pas (jamais « 0 repas · 24 g »)', () => dans(async ({ horloge }) => {
  const { tuileAujourdhui } = await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href);
  const { compteDuJour } = await import('../src/distributeurfiche.js');
  // À 00:20, le compteur dit encore les 24 g d'hier (changé hier à 19:00) : rien aujourd'hui.
  horloge(a(1, 0, 20));
  const S = { [GJOUR]: st(GJOUR, '24', { unit_of_measurement: 'g' }, iso(a(0, 19, 0))) };
  const lecture = { soeurs: [], historique: { dernier: null, compteurs: [GJOUR] } };
  assert.deepEqual(compteDuJour(lecture, S, a(1, 0, 20)), { repas: null, portions: null, grammes: null }, 'un compteur d’hier ne dit rien d’aujourd’hui');
  assert.deepEqual(compteDuJour(lecture, S, a(0, 20, 0)), { repas: null, portions: null, grammes: 24 }, 'hier à 20:00, il comptait');
  const tuile = tuileAujourdhui(compteDuJour(lecture, S, a(1, 0, 20)), [], { aveugle: false, maintenant: a(1, 0, 20) });
  assert.ok(!tuile || !/24/.test(tuile.titre), 'la tuile dit « 0 repas · 24 g » : ' + JSON.stringify(tuile));
  // Remis à zéro à minuit (changé à 00:00) : « 0 repas · 0 g » est vrai.
  const S0 = { [GJOUR]: st(GJOUR, '0', { unit_of_measurement: 'g' }, iso(a(1, 0, 0))) };
  assert.deepEqual(compteDuJour(lecture, S0, a(1, 0, 20)), { repas: null, portions: null, grammes: 0 });
  // Sans date (une fixture, un état sans `last_changed`) : la valeur se croit, comme avant.
  assert.deepEqual(compteDuJour(lecture, { [GJOUR]: { state: '24', attributes: { unit_of_measurement: 'g' } } }, a(1, 0, 20)).grammes, 24);
}));

test('G : « Servi à » exige une vraie HAUSSE du compteur — pas un battement par « unavailable »', () => dans(async ({ horloge }) => {
  const w = poser();
  const { m, accueil } = await fiche(w);
  const ma = accueil();
  ma.appuyer(bouton(ma, 'Distribuer'));
  assert.ok(ma.texte().includes('Demande envoyée à 18:20'));
  // Le compteur bat : « unavailable » puis la MÊME valeur, avec un `last_changed` neuf.
  horloge(a(0, 18, 21));
  w.courants[GJOUR] = st(GJOUR, 'unavailable', { unit_of_measurement: 'g' }, iso(a(0, 18, 21)));
  m.proprietes({ hass: w.hass() }); ma.proprietes(de(m, 'OngletAccueil')[0].props);
  w.courants[GJOUR] = st(GJOUR, '12', { unit_of_measurement: 'g' }, iso(a(0, 18, 21, 10)));
  m.proprietes({ hass: w.hass() }); ma.proprietes(de(m, 'OngletAccueil')[0].props);
  assert.ok(!ma.texte().includes('Servi à') && ma.texte().includes('Demande envoyée'), 'un battement n’est pas un repas : ' + ma.texte());
  // Puis la vraie hausse : « Servi à 18:21 · 12 g ».
  w.courants[GJOUR] = st(GJOUR, '24', { unit_of_measurement: 'g' }, iso(a(0, 18, 21, 30)));
  m.proprietes({ hass: w.hass() }); ma.proprietes(de(m, 'OngletAccueil')[0].props);
  assert.ok(ma.texte().includes('Servi à 18:21 · 12 g'), ma.texte());
}));

test('G : une commande qui écrit une quantité relève sa valeur au minimum de l’entité — la popup annonce ce qui part VRAIMENT', () => dans(async () => {
  const PK = 'number.distributeur_feed';
  const pk = poser({ retouche: (c) => { delete c[FEED]; delete c[TAILLE]; c[PK] = st(PK, '0', { min: 2, max: 10, step: 1, unit_of_measurement: 'portion' }); }, ids: [PK, POIDS] });
  pk.index.entityMeta.set(PK, { deviceId: 'dev1', platform: 'tuya', translationKey: 'feed' });
  const etatPk = ETAT(); etatPk.commande = { domaine: 'number', quantite: true, min: 2, max: 10, pas: 1 };
  const mp = (await fiche(pk, { cfg: { appareil: 'dev1', haids: { reservoir: BAC } }, etat: etatPk })).accueil();
  assert.ok(mp.texte().includes('2 portions · 12 g') && !mp.texte().includes('1 portion'), 'moins que ce qui part : ' + mp.texte());
  assert.equal(bouton(mp, 'Portion plus petite').props.disabled, true, 'pas sous le minimum');
  mp.appuyer(bouton(mp, 'Distribuer'));
  await attendre();
  assert.deepEqual(pk.appels, ['number.set_value ' + PK + ' 2']);
}));

test('G : au clavier, après « Oui, 100 % », le focus va à « Distribuer » — et, l’appareil muet, à l’onglet, jamais sur <body>', () => dans(async ({ h }) => {
  const vus = [];
  const brancher = (ma) => { globalThis.document.getElementById = (id) => (id && ma.trouver(e => e.props && e.props.id === id).length ? { focus: () => vus.push(id) } : null); };
  const { m, accueil } = await fiche(poser());
  const ma = accueil();
  brancher(ma);
  ma.appuyer(bouton(ma, 'Je l’ai rempli')); h.avancer(1);
  ma.appuyer(bouton(ma, 'Oui, 100 %'));
  // La fiche redessine l'Accueil sans la puce (le bac plein), puis le focus, différé d'une image, cherche son point d'arrivée.
  m.rendre(); ma.proprietes(de(m, 'OngletAccueil')[0].props); h.avancer(1);
  assert.equal(vus[vus.length - 1], bouton(ma, 'Distribuer').props.id, 'le bac plein, la puce partie : le focus va à « Distribuer »');
  // L'appareil muet : ni la puce ni « Distribuer » — le focus va à l'onglet Accueil.
  const muet = poser({ retouche: (c) => { c[FEED] = st(FEED, 'unavailable', { options: ['START'] }); } });
  const f2 = await fiche(muet);
  const m2 = f2.accueil();
  // L'onglet existe dans la barre des onglets (`FicheOnglets`, que le harnais ne rend pas) : le document le connaît, comme l'Accueil.
  const onglet = de(f2.m, 'FicheOnglets')[0].props.idBase + '-t-accueil';
  globalThis.document.getElementById = (id) => (id && (id === onglet || m2.trouver(e => e.props && e.props.id === id).length) ? { focus: () => vus.push(id) } : null);
  assert.ok(!bouton(m2, 'Distribuer'), 'témoin : muet, pas de « Distribuer »');
  m2.appuyer(bouton(m2, 'Je l’ai rempli')); h.avancer(1);
  m2.appuyer(bouton(m2, 'Oui, 100 %'));
  f2.m.rendre(); m2.proprietes(de(f2.m, 'OngletAccueil')[0].props); h.avancer(1);
  assert.equal(vus[vus.length - 1], onglet, 'le focus tombe sur <body>');
}));

test('G : l’Entretien sur le modèle du robot — « Remplacé » demande, l’ambre sous 35 %, le rouge sous 15 %, aucune phrase quand tout va bien', () => dans(async () => {
  const DESH = 'sensor.distributeur_remaining_desiccant', RESET = 'button.distributeur_desiccant_reset', FILTRE = 'sensor.distributeur_filter_percent';
  const maisonDe = (jours, pct = null) => {
    const w = poser({ retouche: (c) => {
      c[DESH] = st(DESH, String(jours), { unit_of_measurement: 'd' }); c[RESET] = st(RESET, 'unknown', {});
      if (pct != null) c[FILTRE] = st(FILTRE, String(pct), { unit_of_measurement: '%' });
    }, ids: [...APPAREIL, DESH, RESET, ...(pct != null ? [FILTRE] : [])] });
    w.index.entityMeta.set(DESH, { deviceId: 'dev1', platform: 'petlibro', translationKey: 'remaining_desiccant' });
    w.index.entityMeta.set(RESET, { deviceId: 'dev1', platform: 'petlibro', translationKey: 'desiccant_reset' });
    return w;
  };
  const entretien = async (w) => { const { m } = await fiche(w, { ongletDepart: 'entretien' }); const el = de(m, 'OngletEntretien')[0]; return { m, e: monter(el.type, el.props) }; };
  // 12 jours : tout va bien — aucune phrase, le neutre ; « Remplacé » DEMANDE, « Annuler » ne fait rien, « Oui, 100 % » presse le bouton.
  const w = maisonDe(12);
  const { e } = await entretien(w);
  assert.ok(e.texte().includes('Déshydratant') && e.texte().includes('12 jours restants'), e.texte());
  assert.ok(!e.texte().includes('à changer bientôt') && !e.texte().includes('Tout est en ordre'), 'aucune phrase quand tout va bien : ' + e.texte());
  e.appuyer(bouton(e, 'Remplacé'));
  assert.ok(e.texte().includes('Remettre Déshydratant à 100 % ?'), 'la question du robot (I20)');
  e.appuyer(bouton(e, 'Annuler'));
  assert.deepEqual(w.appels, []);
  assert.ok(!e.texte().includes('Remettre Déshydratant'));
  e.appuyer(bouton(e, 'Remplacé'));
  e.appuyer(bouton(e, 'Oui, 100 %'));
  await attendre();
  assert.deepEqual(w.appels, ['button.press ' + RESET]);
  // 2 jours : le rouge, et la phrase ; un filtre à 30 % : l'ambre.
  const { e: e2 } = await entretien(maisonDe(2, 30));
  assert.ok(e2.texte().includes('2 jours restants') && e2.texte().includes('2 pièces à changer bientôt.') && e2.texte().includes('Touchez « Remplacé »'), e2.texte());
  const rouge = e2.trouver(x => x.props && x.props.style && x.props.style.color === 'var(--o-bad)');
  const ambre = e2.trouver(x => x.props && x.props.style && x.props.style.color === 'var(--o-warn)');
  assert.ok(rouge.length >= 1 && ambre.length >= 1, 'le rouge du déshydratant, l’ambre du filtre');
  assert.ok(e2.trouver(x => x.type === 'span' && x.props.children === '30 %').length === 1, 'le pourcentage du filtre');
}));

test('au téléphone, la mise en page cède : la puce du bac passe sous le chiffre, la valeur d’une tuile se resserre', () => dans(async () => {
  const ma = (await fiche(poser())).accueil();
  // La rangée du chiffre et de la puce revient à la ligne ; le chiffre et son « % » ne se séparent jamais.
  const rangee = ma.trouver(e => e.type === 'div' && e.props && e.props.style && e.props.style.flexWrap === 'wrap'
    && texteDe(e).includes('Réservoir') && texteDe(e).includes('Je l’ai rempli'))[0];
  assert.ok(rangee, '« Ich habe nachgefüllt » écrase « 38 % » à 320 px');
  const chiffre = ma.trouver(e => e.type === 'div' && e.props && e.props.style && e.props.style.whiteSpace === 'nowrap' && texteDe(e).includes('%'))[0];
  assert.ok(chiffre, 'le « % » passe sur le chiffre');
  // La question : trop étroite, ses deux puces passent dessous (« Füllstand / auf / 100 % / setzen? » à 320 px).
  ma.appuyer(bouton(ma, 'Je l’ai rempli'));
  const question = ma.trouver(e => e.type === 'span' && e.props && e.props.children === 'Remettre le niveau à 100 % ?')[0];
  assert.equal(question.props.style.flex, '1 1 140px', 'la question réduite à un mot par ligne');
  // La valeur des tuiles : la classe que les requêtes de conteneur resserrent (index.css), jamais une taille en ligne.
  const t = de(ma, 'Tuile')[0];
  const mt = monter(t.type, t.props);
  const valeur = mt.trouver(e => e.props && e.props.className === 'rb-d-tuile-titre')[0];
  assert.ok(valeur && valeur.props.style.fontSize === undefined, '« Mahlzeite / n: 1 · 45 g » à 320 px');
  assert.ok(CSS.includes('@container (max-width: 290px) { .rb-d-tuile-titre { font-size: 15px; } }'), 'la valeur ne se resserre pas');
}));

/* TESTS AJOUTÉS (passe bis 2 de l'étape 2, 19/10 ; relecture de contrôle) : deux gestes qui mentaient.
 *  - « Remplacé » pouvait être inerte : le robot écarte un bouton de remise à zéro qui ne répond plus (`piecesUsure`), le distributeur
 *    non — la fiche l'écarte (`piecesDe`), et la brique du serveur (`consommablesDistributeur`) le garde telle quelle : la parité avec le
 *    Python la fige ;
 *  - « Servi à » sans repas : le capteur « dernier repas » muet (« unavailable ») à l'appui, puis revenu à son ANCIENNE heure, passait pour
 *    un repas — `Date.parse('unavailable')` ne vaut rien, et « différent » suffisait. Il faut une heure NOUVELLE, postérieure à l'appui. */
test('passe bis 2 : « Remplacé » n’est pas là quand le bouton de remise à zéro ne répond plus — rien d’inerte, comme le robot', () => dans(async () => {
  const DESH = 'sensor.distributeur_remaining_desiccant', RESET = 'button.distributeur_desiccant_reset';
  const maisonDe = (etatBouton) => {
    const w = poser({ retouche: (c) => { c[DESH] = st(DESH, '2', { unit_of_measurement: 'd' }); c[RESET] = st(RESET, etatBouton, {}); }, ids: [...APPAREIL, DESH, RESET] });
    w.index.entityMeta.set(DESH, { deviceId: 'dev1', platform: 'petlibro', translationKey: 'remaining_desiccant' });
    w.index.entityMeta.set(RESET, { deviceId: 'dev1', platform: 'petlibro', translationKey: 'desiccant_reset' });
    return w;
  };
  const entretien = async (w) => { const { m } = await fiche(w, { ongletDepart: 'entretien' }); const el = de(m, 'OngletEntretien')[0]; return monter(el.type, el.props); };
  // Témoin : un bouton qui n'a jamais servi (« unknown ») s'offre, et la phrase invite à le toucher.
  const temoin = await entretien(maisonDe('unknown'));
  assert.ok(bouton(temoin, 'Remplacé') && temoin.texte().includes('Touchez « Remplacé »'), temoin.texte());
  // Le bouton muet : ni « Remplacé », ni la phrase qui y invite — la pièce et ses jours restent.
  const w = maisonDe('unavailable');
  const muet = await entretien(w);
  assert.ok(!bouton(muet, 'Remplacé'), '« Remplacé » s’offre sur un bouton qui ne répond plus : ' + muet.texte());
  assert.ok(muet.texte().includes('2 jours restants') && muet.texte().includes('1 pièce à changer bientôt.') && !muet.texte().includes('Touchez'), muet.texte());
  // La parité avec le serveur ne bouge pas : la brique garde le bouton, c'est la fiche qui l'écarte.
  const lu = lireDistributeur(w.index, w.hass().states, CFG);
  assert.deepEqual(consommablesDistributeur(lu.soeurs).map(c => c.reset), [RESET], 'la brique du serveur écarte le bouton : la fixture partagée rougirait');
}));

test('passe bis 2 : « Servi à » sur le capteur « dernier repas » — une heure NOUVELLE, après l’appui ; l’ancienne heure revenue après « unavailable » n’est pas un repas', () => dans(async ({ horloge }) => {
  const DERNIER = 'sensor.distributeur_last_feed_time';
  // Le capteur est muet à l'appui : le relevé d'avant ne vaut rien.
  const w = poser({ retouche: (c) => { c[DERNIER] = st(DERNIER, 'unavailable', { device_class: 'timestamp' }, iso(a(0, 18, 19))); }, ids: [...APPAREIL, DERNIER] });
  const { m, accueil } = await fiche(w);
  const ma = accueil();
  assert.equal(lireDistributeur(w.index, w.hass().states, CFG).historique.dernier, DERNIER, 'témoin : le capteur du dernier repas est reconnu');
  ma.appuyer(bouton(ma, 'Distribuer'));
  assert.ok(ma.texte().includes('Demande envoyée à 18:20'), ma.texte());
  // Il revient, à son ANCIENNE heure — le repas de 07:30 : ce n'est pas un repas.
  horloge(a(0, 18, 21));
  w.courants[DERNIER] = st(DERNIER, iso(a(0, 7, 30)), { device_class: 'timestamp' }, iso(a(0, 18, 21)));
  m.proprietes({ hass: w.hass() }); ma.proprietes(de(m, 'OngletAccueil')[0].props);
  assert.ok(!ma.texte().includes('Servi à') && ma.texte().includes('Demande envoyée'), 'l’ancienne heure revenue passe pour un repas : ' + ma.texte());
  // Puis une heure NOUVELLE, après l'appui : « Servi à 18:21 · 12 g » (la ration de l'appareil, le compteur en grammes n'ayant pas bougé).
  w.courants[DERNIER] = st(DERNIER, iso(a(0, 18, 21, 5)), { device_class: 'timestamp' }, iso(a(0, 18, 21, 30)));
  m.proprietes({ hass: w.hass() }); ma.proprietes(de(m, 'OngletAccueil')[0].props);
  assert.ok(ma.texte().includes('Servi à 18:21 · 12 g'), ma.texte());
}));
