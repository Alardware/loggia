/* TEST AJOUTÉ (étape 3 IoT, 25/10 ; sa maquette « Cartes IoT », 1f ; I27, I28, I29, I30, I32, I33) — la popup d'une vanne
 * (`src/fichevanne.jsx`, chargée à la demande).
 *
 * On JOUE son contenu (tests/crochets.mjs), sur un `hass` doublé et l'état du serveur posé ; lundi 19/10/2026, 18:20. Garanti :
 *  - I27 : sans onglets ; l'en-tête commun (la plaque, « {pièce} · vanne d'eau », une croix) ; la tête dit POURQUOI (« Depuis
 *    14:02 · fuite Sous l'évier », sur le fond rouge à 0,08) ; « Rouvrir l'eau » DEMANDE — « Le détecteur … est sec depuis 14:40. La
 *    fuite est réparée ? » · « Pas encore » · « Oui, rouvrir l'eau » ; tant qu'un détecteur voit de l'eau, « Rouvrir quand même ? » ;
 *    la question posée par une carte étroite est là à l'ouverture ;
 *  - les détecteurs : le résumé, une rangée chacun, « Sec » NEUTRE, « Fuite » rouge, « Indisponible » gris, la pile ;
 *  - I29, I32 : « Fermer en cas de fuite » — un administrateur la règle par la commande ÉTROITE (`loggia/eau/regle`, jamais
 *    `loggia/config/set`) ; la rangée attend tant que l'état du serveur n'est pas lu ; un refus NOMME la clé ; un compte ordinaire
 *    lit « Activé » ; I30 : « Faute d'en avoir choisi une, la maison ferme toutes les vannes d'eau en cas de fuite » ;
 *  - I28 : le journal du jour, les plus récentes d'abord, une personne nommée ;
 *  - en pied, « L'appareil » ouvre la fiche universelle ;
 *  - I31 : une vanne de gaz — ni détecteurs, ni règle ; « Ouvrir le gaz ? ». */
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
const { setLoggiaState } = await import('../src/state.js');
const F = await import('../src/fichevanne.jsx');
const EE = await import('../src/eauetat.js');
const { reglerPartage } = await import('../src/optimiste.js');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (h, m) => new Date(2026, 9, 19, h, m).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = a(14, 2)) => ({ entity_id: id, state, last_changed: iso(depuis), last_updated: iso(depuis), attributes });
const VANNE = 'valve.arrivee_eau', EVIER = 'binary_sensor.fuite_sous_evier', LINGE = 'binary_sensor.fuite_lave_linge';
const ETAT = ({ cause = 'fuite', regle = {}, journal = [] } = {}) => ({
  maintenant: T / 1000,
  vannes: { [VANNE]: { ferme: !!cause, cause, detecteur: cause === 'fuite' ? EVIER : null, nom: cause === 'fuite' ? 'Sous l’évier' : null, user_id: null, depuis: cause ? a(14, 2) / 1000 : null } },
  detecteurs: { [EVIER]: { mouille_depuis: a(14, 2) / 1000, sec_depuis: a(14, 40) / 1000 } },
  journal, regle: { actif: true, reagit: true, entite: '', toutes: true, vannes: [VANNE], ...regle },
});
const PIECES = { [VANNE]: 'Buanderie', [EVIER]: 'Cuisine', [LINGE]: 'Buanderie' };

function poser({ etats = {}, etat = ETAT(), admin = true, refus = null } = {}) {
  const courants = {
    [VANNE]: st(VANNE, 'closed', { device_class: 'water', friendly_name: 'Arrivée d’eau' }),
    [EVIER]: st(EVIER, 'off', { device_class: 'moisture', friendly_name: 'Sous l’évier' }, a(14, 40)),
    [LINGE]: st(LINGE, 'off', { device_class: 'moisture', friendly_name: 'Lave-linge' }),
    'person.camille': st('person.camille', 'home', { friendly_name: 'Camille', user_id: 'u-camille' }),
    ...etats,
  };
  setLoggiaState({ index: { entityMeta: new Map(), deviceMeta: new Map(), areaList: [], areaNameOf: (id) => PIECES[id] || null }, ent: {}, cfg: {}, resolved: {} });
  const appels = [], ws = [];
  const hass = {
    states: courants, user: { is_admin: admin },
    callService: (d, s, data) => { appels.push(d + '.' + s + ' ' + data.entity_id); return Promise.resolve(); },
    callWS: (msg) => { ws.push(msg); if (refus) return Promise.reject(refus); return Promise.resolve(msg.type === 'loggia/eau/regle' ? { ...(etat || ETAT()), regle: { ...(etat || ETAT()).regle, actif: msg.actif } } : etat); },
  };
  EE.reglerEauEtat({ hass });
  if (etat) EE.poserEtatEau(etat);
  return { appels, ws, hass, courants };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  Date.now = () => T;
  reglerPartage();
  try { return await fn({ h, d }); } finally { reglerPartage(); Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = () => new Promise(r => setImmediate(r));
const bouton = (m, texte) => m.trouver(e => e.type === 'button' && (texteDe(e).trim() === texte || e.props['aria-label'] === texte))[0];
const parAttr = (m, attr, v) => m.trouver(e => e.props && e.props[attr] === v)[0];
const fiche = (w, props = {}) => monter(F.ContenuVanne, { id: VANNE, hass: w.hass, onFiche: () => {}, epingle: null, ...props });

test('I27 : l’en-tête commun, la tête qui dit pourquoi, « Rouvrir l’eau » qui demande', () => dans(() => {
  const w = poser();
  const m = fiche(w);
  const entete = m.trouver(e => e.type && e.type.name === 'EnteteFiche')[0];
  assert.deepEqual([entete.props.nom, entete.props.sousNom, entete.props.plaque.fond], ['Arrivée d’eau', 'Buanderie · vanne d’eau', 'rgba(var(--o-bad-rgb),.16)']);
  const tete = parAttr(m, 'data-tete', '');
  assert.equal(tete.props.style.background, 'rgba(var(--o-bad-rgb),.08)');
  assert.ok(texteDe(tete).indexOf('Fermée') === 0 && texteDe(tete).indexOf('Depuis 14:02 · fuite : Sous l’évier') > 0);
  m.appuyer(bouton(m, 'Rouvrir l’eau Arrivée d’eau'));
  assert.ok(m.texte().indexOf('Le détecteur Sous l’évier est sec depuis 14:40. La fuite est réparée ?') >= 0);
  assert.ok(!bouton(m, 'Rouvrir l’eau Arrivée d’eau'), 'la question prend la place de la puce');
  m.appuyer(bouton(m, 'Pas encore'));
  assert.ok(m.texte().indexOf('La fuite est réparée ?') < 0 && w.appels.length === 0);
  m.appuyer(bouton(m, 'Rouvrir l’eau Arrivée d’eau'));
  m.appuyer(bouton(m, 'Oui, rouvrir l’eau'));
  assert.deepEqual(w.appels, ['valve.open_valve valve.arrivee_eau']);
}));

test('I27 : la question posée par la carte étroite est là à l’ouverture ; un détecteur mouillé fait demander « quand même »', () => dans(() => {
  const w = poser({ etats: { [LINGE]: st(LINGE, 'on', { device_class: 'moisture', friendly_name: 'Lave-linge' }) } });
  EE.poserQuestion(VANNE);
  const m = fiche(w);
  assert.ok(m.texte().indexOf('Lave-linge voit encore de l’eau. Rouvrir quand même ?') >= 0);
  assert.ok(bouton(m, 'Rouvrir quand même') && bouton(m, 'Pas encore'));
}));

/* TESTS AJOUTÉS (passe bis de l'étape 3, 25/10 ; relectures, points 2 et 3). */
test('passe bis, point 2 : pendant `closing`, la puce de la popup est inerte — un appui ne rouvre rien', () => dans(() => {
  const w = poser({ etats: { [VANNE]: st(VANNE, 'closing', { device_class: 'water', friendly_name: 'Arrivée d’eau' }) } });
  const m = fiche(w);
  const p = bouton(m, 'Fermer l’eau Arrivée d’eau');
  assert.ok(p, 'la puce reste sur son sens');
  assert.equal(p.props['aria-disabled'], 'true');
  m.appuyer(p);
  assert.ok(!bouton(m, 'Rouvrir l’eau Arrivée d’eau') && w.appels.length === 0 && m.texte().indexOf('?') < 0, 'ni geste, ni question');
}));

test('passe bis, point 3 : le carnet muet, la popup DEMANDE « Rouvrir l’eau ? » avant de rouvrir', () => dans(() => {
  const w = poser({ etat: null });
  const m = fiche(w);
  m.appuyer(bouton(m, 'Rouvrir l’eau Arrivée d’eau'));
  assert.ok(m.texte().indexOf('Rouvrir l’eau ?') >= 0 && w.appels.length === 0);
  m.appuyer(bouton(m, 'Oui, rouvrir l’eau'));
  assert.deepEqual(w.appels, ['valve.open_valve valve.arrivee_eau']);
}));

test('les détecteurs : le résumé, une rangée chacun, « Sec » neutre, la pile', () => dans(() => {
  const w = poser({ etats: { [LINGE]: st(LINGE, 'unavailable', { device_class: 'moisture', friendly_name: 'Lave-linge' }) } });
  const m = fiche(w);
  const bloc = parAttr(m, 'data-detecteurs', '');
  assert.ok(texteDe(bloc).indexOf('1 détecteur indisponible') >= 0);
  const etats = m.trouver(e => e.props && e.props['data-etat-detecteur'] != null).map(e => [texteDe(e), e.props.style.color]);
  assert.deepEqual(etats, [['Indisponible', 'var(--o-text3)'], ['Sec', 'var(--o-text2)']], 'le calme se dit en neutre');
  assert.ok(texteDe(bloc).indexOf('Cuisine · sec depuis 14:40') >= 0);
}));

test('I29, I32 : « Fermer en cas de fuite » — la commande étroite, la rangée qui attend, un refus qui nomme la clé', async () => dans(async () => {
  const w = poser({ etat: null });
  const m = fiche(w);
  const bascule = () => m.trouver(e => e.type && e.type.name === 'Bascule')[0];
  assert.ok(!bascule(), 'en attente de l’état du serveur : pas de bascule qui mentirait');
  assert.ok(parAttr(m, 'data-regle', '') && texteDe(parAttr(m, 'data-regle', '')).indexOf('…') >= 0);
  EE.poserEtatEau(ETAT());
  m.rendre();
  assert.equal(bascule().props.on, true);
  m.appuyer(bascule(), 'cb');
  await attendre(); m.rendre();
  assert.deepEqual(w.ws.filter(x => x.type !== 'loggia/eau/etat'), [{ type: 'loggia/eau/regle', actif: false }], 'la valeur seule ; jamais loggia/config/set');
  assert.equal(bascule().props.on, false);
  // Un refus nomme la clé.
  const r = poser({ refus: { code: 'not_admin', message: 'reglages reserves aux administrateurs Home Assistant : loggia_alertes' } });
  const m2 = fiche(r);
  m2.appuyer(m2.trouver(e => e.type && e.type.name === 'Bascule')[0], 'cb');
  await attendre(); m2.rendre();
  assert.ok(m2.texte().indexOf('loggia_alertes') >= 0, 'le refus nomme la clé');
}));

test('I32 : un compte ordinaire lit la règle sans la régler', () => dans(() => {
  const w = poser({ admin: false });
  const m = fiche(w);
  assert.ok(!m.trouver(e => e.type && e.type.name === 'Bascule').length);
  assert.ok(texteDe(parAttr(m, 'data-regle', '')).indexOf('Activé') >= 0);
}));

test('I30 : sans vanne choisie, la popup dit que la maison les ferme toutes', () => dans(() => {
  const w = poser({ etat: ETAT({ regle: { vannes: [VANNE, 'valve.arrosage'] } }) });
  assert.ok(fiche(w).texte().indexOf('Faute d’en avoir choisi une, la maison ferme toutes les vannes d’eau en cas de fuite') >= 0);
  const choisie = poser({ etat: ETAT({ regle: { toutes: false, entite: 'switch.prise_arrivee', vannes: ['switch.prise_arrivee'] } }), etats: { 'switch.prise_arrivee': st('switch.prise_arrivee', 'on', { friendly_name: 'Prise de l’arrivée' }) } });
  assert.ok(fiche(choisie).texte().indexOf('En cas de fuite, la maison ferme Prise de l’arrivée.') >= 0);
}));

test('I28 : le journal du jour, et « L’appareil » en pied', () => dans(() => {
  const journal = [
    { when: a(14, 2) / 1000, quoi: 'fuite', entity_id: EVIER, cause: null, detecteur: null, nom: null, user_id: null },
    { when: a(14, 2) / 1000 + 3, quoi: 'fermee', entity_id: VANNE, cause: 'fuite', detecteur: EVIER, nom: 'Sous l’évier', user_id: null },
    { when: a(18, 0) / 1000, quoi: 'rouverte', entity_id: VANNE, cause: 'personne', detecteur: null, nom: null, user_id: 'u-camille' },
  ];
  const w = poser({ etat: ETAT({ journal }) });
  const ouvertes = [];
  const m = fiche(w, { onFiche: () => ouvertes.push(VANNE) });
  const lignes = m.trouver(e => e.props && e.props['data-ligne'] != null).map(e => texteDe(e));
  assert.deepEqual(lignes, ['18:00Eau rouverteCamille', '14:02Eau ferméeFermeture sur fuiteAutomatisme', '14:02Fuite détectéeSous l’évier · CuisineDétecteur']);
  m.appuyer(bouton(m, 'L’appareil'));
  assert.deepEqual(ouvertes, [VANNE]);
}));

test('I31 : une vanne de gaz — ni détecteurs, ni règle, « Ouvrir le gaz ? »', () => dans(() => {
  const w = poser({ etats: { 'valve.gaz': st('valve.gaz', 'closed', { device_class: 'gas', friendly_name: 'Gaz' }) } });
  const m = fiche(w, { id: 'valve.gaz' });
  assert.ok(!parAttr(m, 'data-detecteurs', '') && !parAttr(m, 'data-regle', ''));
  m.appuyer(bouton(m, 'Ouvrir Gaz'));
  assert.ok(m.texte().indexOf('Ouvrir le gaz ?') >= 0);
  m.appuyer(bouton(m, 'Ouvrir'));
  assert.deepEqual(w.appels, ['valve.open_valve valve.gaz']);
}));
