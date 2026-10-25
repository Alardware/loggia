/* Les gestes sur la fiche d'une prise (chantier Prises, relecture finale
 * « Tâche 12 bis — B », 14/10).
 *
 * Ces tests JOUENT la fiche (tests/crochets.mjs) : on appuie sur sa bascule, sur
 * ses puces, sur la rangée Protéger ; on laisse passer six secondes ; on fait
 * échouer le serveur ; on lit ce que l'arbre porte. Le serveur est un double qui
 * enregistre chaque message (`monde`), l'horloge du magasin aussi. Ce qui est
 * garanti :
 *  - B1 une protection pas encore lue se traite comme une protection : la fiche
 *    demande avant de couper, sans cadenas, comme la carte ;
 *  - B2 « Ce mois-ci » : une lecture horaire qui échoue dit « — », jamais le jour ;
 *    la puissance est demandée avec le compteur, et fait le mois quand le compteur
 *    n'a pas de statistiques ;
 *  - B3 un minuteur ne se montre que sur une prise allumée ; toutes ses puces
 *    attendent la réponse d'un appel en vol ;
 *  - B4 le Journal du jour dit qu'il n'a pas pu être lu, au lieu d'une journée calme ;
 *  - B5 la confirmation se défait seule à 6 s, et ne survit pas à une prise coupée ;
 *  - B6 une relecture de la configuration qui échoue n'écrit rien : jamais de
 *    `protegees: []` sur un cache vide ;
 *  - B9 le coût d'un cycle égale celui de la tuile, ici sur la démo ; et, passé
 *    minuit, son MONTANT suit le temps passé à chacun de deux prix (« Tâche 14 bis »,
 *    F9) ;
 *  - F1 (« Tâche 14 bis ») la fiche lit le logbook depuis 24 h avant minuit : une
 *    prise muette depuis 23:00 revient « De retour », et la reprise d'un même état
 *    après un redémarrage ne fait aucune ligne ;
 *  - F6 la ligne sous les tuiles dit « estimés d'après la puissance » dès que les kWh
 *    du jour viennent de la courbe — un compteur sans statistiques aussi. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
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

// Ce mardi 13 octobre 2026, 20:40 à Paris : la fiche et le magasin lisent la même heure.
const T = new Date(2026, 9, 13, 20, 40).getTime();
const MINUIT = new Date(2026, 9, 13).getTime();
const iso = (h, m = 0, jour = 13) => new Date(2026, 9, jour, h, m).toISOString();
const NAS = 'switch.prise_nas', PC = 'switch.prise_pc', LV = 'switch.prise_lv';
const capteurs = (id) => ({ prise: true, puissance: id + '_power', energie: id + '_energy' });
const attendre = () => new Promise(r => setImmediate(r));

function etats({ pc = 'on', puissance = 146 } = {}) {
  const sw = (id, etat, nom, depuis) => [id, { entity_id: id, state: etat, last_changed: depuis, last_updated: depuis, attributes: { friendly_name: nom } }];
  const mesure = (id, classe, v, unite) => [id, { entity_id: id, state: String(v), attributes: { device_class: classe, unit_of_measurement: unite } }];
  return Object.fromEntries([
    sw(NAS, 'on', 'Prise NAS (Zephyr)', iso(2)), mesure(NAS + '_power', 'power', 23, 'W'), mesure(NAS + '_energy', 'energy', 212.6, 'kWh'),
    sw(PC, pc, 'Prise PC Bureau (Atlas)', iso(8, 50)), mesure(PC + '_power', 'power', puissance, 'W'), mesure(PC + '_energy', 'energy', 846.1, 'kWh'),
    sw(LV, 'on', 'Prise lave-vaisselle', iso(13, 40)), mesure(LV + '_power', 'power', 0.5, 'W'), mesure(LV + '_energy', 'energy', 507.3, 'kWh'),
  ]);
}
const entree = (o = {}) => ({ type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [], ...o });
const ETAT = (protegees = [NAS], o = {}) => ({ maintenant: iso(20, 40), notifier: true, config: { protegees, types: {}, prevenir: {} },
  prises: { [NAS]: entree({ type: 'nas', protegee: protegees.includes(NAS) }), [PC]: entree({ type: 'pc', protegee: protegees.includes(PC) }), [LV]: entree({ type: 'lv' }) }, ...o });

/* Le monde d'un test : un serveur qui répond (ou pas), qui note chaque message et chaque service appelé, le magasin
 * des prises branché dessus. `serveur[type]` remplace la réponse d'un message ; `etat: null`, aucune lecture de l'état ne revient. */
function monde({ etat = ETAT(), serveur = {}, minuteurs = {}, states = etats(), admin = true } = {}) {
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
  const hass = { states, callWS, config: { currency: 'EUR' }, user: { id: 'u', is_admin: admin },
    callService: (d, s, data) => { services.push(d + '.' + s + ' ' + ((data && data.entity_id) || '')); return Promise.resolve(); } };
  setLoggiaState({ index: null, resolved: { energy: { haids: {}, prix: [{ valeur: 0.25, entite: null, compteur: null }] } } });
  const horloge = { repeter: () => 0, arreter: () => {}, plusTard: (f) => { attentes.push(f); return attentes.length; }, annuler: () => {}, maintenant: () => T };
  E.reglerPrisesEtat({ hass: { callWS }, horloge });
  return {
    messages, services, hass, reponses,
    // L'état du serveur déjà lu : la première réponse n'a pas à passer par le réseau.
    lu(e = etat) { E.poserEtatPrises(JSON.parse(JSON.stringify(e))); },
    // Les lectures groupées des mesures (l'attente de 50 ms du magasin) partent.
    async mesures() { await attendre(); attentes.splice(0).forEach(f => f()); await attendre(); },
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
const bouton = (m, texte) => m.trouver(e => e.type === 'button' && texteDe(e) === texte)[0];
const cadenas = (m) => m.trouver(e => e.props && e.props['aria-label'] === 'Protégée');
const tuile = (m, titre) => m.trouver(e => e.props && e.props.titre === titre)[0].props;
const rangee = (m, ou) => texteDe(m.arbre).includes(ou);
const proteger = (m) => m.trouver(e => e.props && e.props.nom === 'Protéger' && typeof e.props.cb === 'function')[0];
const alertes = (m) => m.trouver(e => e.props && e.props.role === 'alert').map(e => texteDe(e));

// ── B1 : la protection pas encore lue ────────────────────────────────────────

test('B1 : protection pas encore lue — la fiche demande avant de couper, sans cadenas ; Annuler ne coupe rien, « Couper quand même » coupe', () => dans(async () => {
  const w = monde({ etat: null });                          // le serveur ne répond pas : rien n'est lu
  const m = monter(Fiche, w.props(PC));
  assert.equal(E.gardeDePrise(E.lireEtatPrises().etat, PC).inconnu, true, 'la garde est inconnue');
  assert.equal(cadenas(m).length, 0, 'pas de cadenas : on n’affirme pas ce qu’on ne sait pas');
  assert.ok(!texteDe(m.arbre).includes('protégée'));
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(demande(m), 'un appui : la question');
  assert.ok(texteDe(demande(m)).includes('Prise PC Bureau (Atlas) est en marche (146\u00A0W)'), '« 146 » et « W » ne se séparent pas en bout de ligne (F7)');
  assert.deepEqual(couper(w), [], 'rien n’est coupé');
  m.appuyer(bouton(m, 'Annuler'));
  assert.equal(demande(m), null, 'Annuler défait la question');
  assert.deepEqual(couper(w), []);
  m.appuyer(interrupteur(m), 'onToggle');
  m.appuyer(bouton(m, 'Couper quand même'));
  assert.equal(couper(w).length, 1, '« Couper quand même » coupe');
  assert.equal(demande(m), null);
}));

test('B1 : protection lue — protégée, la fiche met le cadenas et demande ; libre, elle coupe d’un appui', () => dans(async () => {
  const w = monde({ etat: ETAT([NAS]) });
  w.lu();
  const nas = monter(Fiche, w.props(NAS));
  assert.equal(E.gardeDePrise(E.lireEtatPrises().etat, NAS).inconnu, false);
  assert.equal(cadenas(nas).length, 1, 'protégée et lue : le cadenas');
  assert.ok(texteDe(nas.arbre).includes('protégée'), '« · protégée » dans la phrase');
  nas.appuyer(interrupteur(nas), 'onToggle');
  assert.ok(demande(nas) && couper(w).length === 0);
  const pc = monter(Fiche, w.props(PC));
  assert.equal(cadenas(pc).length, 0);
  pc.appuyer(interrupteur(pc), 'onToggle');
  assert.equal(couper(w).length, 1, 'lue et libre : un appui coupe, sans question');
  assert.equal(demande(pc), null);
}));

test('B1 : allumer une prise coupée ne demande jamais, protection lue ou non', () => dans(async () => {
  const w = monde({ etat: null, states: etats({ pc: 'off' }) });
  const m = monter(Fiche, w.props(PC));
  m.appuyer(interrupteur(m), 'onToggle');
  assert.equal(demande(m), null);
  assert.equal(w.services.length, 1, 'le geste part : on l’allume');
}));

test('B1 : la fiche protégée par SON geste (l’avance) montre le cadenas tout de suite, même avant la première lecture', () => dans(async () => {
  const w = monde({ etat: null, serveur: { 'loggia/prises/config': () => new Promise(() => {}) } });
  const m = monter(Fiche, w.props(PC));
  assert.equal(cadenas(m).length, 0);
  m.appuyer(proteger(m), 'cb');
  await attendre();
  m.rendre();
  assert.equal(cadenas(m).length, 1, 'le geste de l’utilisateur est une protection connue — son avance');
}));

// ── B2 : « Ce mois-ci » ─────────────────────────────────────────────────────

// Des statistiques qui ne rendent que les identifiants demandés, comme Home Assistant.
function statistiques(table) {
  return (msg) => Promise.resolve(Object.fromEntries((msg.statistic_ids || []).filter(id => table[msg.period] && table[msg.period][id]).map(id => [id, table[msg.period][id]])));
}
const heureMois = (jour, h, valeur) => ({ start: new Date(2026, 9, jour, h).getTime(), end: new Date(2026, 9, jour, h + 1).getTime(), ...valeur });
const cinqMin = (h, m, valeur) => ({ start: new Date(2026, 9, 13, h, m).getTime(), end: new Date(2026, 9, 13, h, m + 5).getTime(), ...valeur });

test('B2 : une lecture horaire qui ÉCHOUE dit « — » au mois, sans euros — jamais le jour recopié', () => dans(async () => {
  const w = monde({ serveur: { 'recorder/statistics_during_period': (msg) => (msg.period === 'hour' ? Promise.reject(new Error('pas d’enregistreur'))
    : statistiques({ '5minute': { [PC + '_energy']: [cinqMin(8, 50, { change: 0.1 }), cinqMin(9, 0, { change: 0.1 })], [PC + '_power']: [cinqMin(8, 50, { mean: 120 })] } })(msg)) } });
  const m = monter(Fiche, w.props(PC));
  await w.mesures();
  m.rendre();
  assert.deepEqual(w.de('recorder/statistics_during_period').map(x => x.period).sort(), ['5minute', 'hour']);
  assert.deepEqual([tuile(m, 'Aujourd’hui').kwh, tuile(m, 'Aujourd’hui').euros !== null], [0.2, true], 'le jour se lit');
  assert.deepEqual(tuile(m, 'Ce mois-ci'), { titre: 'Ce mois-ci', kwh: null, euros: null }, 'le mois : ni kWh ni euros');
}));

test('B2 : la lecture du mois demande le compteur ET la puissance ; le compteur sans statistiques laisse la puissance faire le mois', () => dans(async () => {
  // Le compteur n'a pas de statistiques (pas de `state_class`) : Home Assistant ne rend que la puissance.
  const heures = [heureMois(1, 0, { mean: 100 }), heureMois(1, 1, { mean: 300 }), heureMois(12, 23, { mean: 200 })];             // 0,1 + 0,3 + 0,2 = 0,6 kWh avant aujourd'hui
  const w = monde({ serveur: { 'recorder/statistics_during_period': statistiques({
    hour: { [PC + '_power']: heures },
    '5minute': { [PC + '_power']: [cinqMin(8, 50, { mean: 120 }), cinqMin(8, 55, { mean: 120 })] } }) } });                   // 120 W × 10 min = 0,02 kWh aujourd'hui
  const m = monter(Fiche, w.props(PC));
  await w.mesures();
  m.rendre();
  const lecture = w.de('recorder/statistics_during_period').find(x => x.period === 'hour');
  assert.ok(lecture.statistic_ids.includes(PC + '_energy') && lecture.statistic_ids.includes(PC + '_power'), 'les deux capteurs : ' + lecture.statistic_ids);
  assert.equal(lecture.statistic_ids.length, new Set(lecture.statistic_ids).size, 'sans doublon');
  assert.equal(Math.round(tuile(m, 'Aujourd’hui').kwh * 1000) / 1000, 0.02);
  assert.equal(Math.round(tuile(m, 'Ce mois-ci').kwh * 1000) / 1000, 0.62, 'les heures d’avant aujourd’hui (0,6) plus le jour (0,02) — pas le jour seul');
  assert.ok(tuile(m, 'Ce mois-ci').euros, 'et ses euros');
}));

test('B2 : un compteur qui compte fait le mois — la puissance de l’heure ne compte pas deux fois', () => dans(async () => {
  const w = monde({ serveur: { 'recorder/statistics_during_period': statistiques({
    hour: { [PC + '_energy']: [heureMois(1, 0, { change: 0.5 }), heureMois(2, 0, { change: 0.25 })], [PC + '_power']: [heureMois(1, 0, { mean: 9000 })] },
    '5minute': { [PC + '_energy']: [cinqMin(8, 50, { change: 0.05 })], [PC + '_power']: [cinqMin(8, 50, { mean: 120 })] } }) } });
  const m = monter(Fiche, w.props(PC));
  await w.mesures();
  m.rendre();
  assert.equal(Math.round(tuile(m, 'Ce mois-ci').kwh * 1000) / 1000, 0.8, 'le compteur (0,75) plus le jour (0,05) ; la puissance de l’heure ne compte pas deux fois');
}));

// ── B3 : le minuteur ─────────────────────────────────────────────────────────

const fin = (minutes) => Math.floor(T / 1000) + minutes * 60;
const puces = (m, textes) => textes.map(t => bouton(m, t));
const inerte = (b) => b.props['aria-disabled'] === true;

test('B3 : le minuteur qui tourne ne se montre que sur une prise ALLUMÉE — coupée, « Disponible une fois la prise allumée. », puces inertes', () => dans(async () => {
  const minuteurs = { [PC]: { fin: fin(30), duree: 30 } };
  // Allumée : la rangée d'un minuteur qui tourne.
  const on = monde({ minuteurs });
  const a = monter(Fiche, on.props(PC));
  await attendre(); a.rendre();
  assert.ok(texteDe(a.arbre).includes('Se coupe à 21:10 · dans 30\u00A0min'));
  assert.ok(puces(a, ['+15 min', '+1 h', 'Annuler']).every(b => b && !inerte(b)), 'trois puces actives');
  assert.equal(bouton(a, '30 min'), undefined, 'les durées font place aux ajouts');
  // Coupée ailleurs : le serveur annulera le minuteur, mais le sondage ne le saura que dans 15 s.
  const off = monde({ minuteurs, states: etats({ pc: 'off' }) });
  const c = monter(Fiche, off.props(PC));
  await attendre(); c.rendre();
  assert.ok(texteDe(c.arbre).includes('Disponible une fois la prise allumée.'));
  assert.ok(!texteDe(c.arbre).includes('Se coupe à'), 'plus de « Se coupe à… » fantôme');
  assert.equal(bouton(c, '+15 min'), undefined);
  assert.equal(bouton(c, '+1 h'), undefined);
  assert.ok(puces(c, ['15 min', '30 min', '1 h', '2 h']).every(b => b && inerte(b)), 'les durées sont là, inertes');
  puces(c, ['15 min', '30 min', '1 h', '2 h']).forEach(b => c.appuyer(b));
  assert.equal(off.de('loggia/minuteurs/poser').length, 0, 'aucun minuteur posé sur une prise coupée');
  // Muette, de même.
  const muette = monde({ minuteurs, states: etats({ pc: 'unavailable' }) });
  const u = monter(Fiche, muette.props(PC));
  await attendre(); u.rendre();
  assert.ok(texteDe(u.arbre).includes('Disponible une fois la prise allumée.') && bouton(u, '+1 h') === undefined);
}));

test('B3 : coupée par SON geste, la rangée change aussitôt — l’avance de la bascule suffit', () => dans(async () => {
  const w = monde({ minuteurs: { [PC]: { fin: fin(30), duree: 30 } }, etat: ETAT([]) });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.ok(bouton(m, '+1 h'));
  m.appuyer(interrupteur(m), 'onToggle');                  // la prise est libre : un appui la coupe
  assert.equal(couper(w).length, 1);
  assert.equal(bouton(m, '+1 h'), undefined, 'plus de minuteur à prolonger sur une prise qu’on vient de couper');
  assert.ok(texteDe(m.arbre).includes('Disponible une fois la prise allumée.'));
}));

test('B3 : un appel en vol rend TOUTES les puces inertes — « 30 min » tapé deux fois ne pose qu’une fois, le serveur AJOUTANT à ce qui reste', () => dans(async () => {
  let repondre;
  const w = monde({ serveur: { 'loggia/minuteurs/poser': () => new Promise((ok) => { repondre = ok; }) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.ok(puces(m, ['15 min', '30 min', '1 h', '2 h']).every(b => !inerte(b)), 'prête : les quatre durées sont actives');
  m.appuyer(bouton(m, '30 min'));
  assert.deepEqual(w.de('loggia/minuteurs/poser').map(x => x.minutes), [30]);
  assert.ok(puces(m, ['15 min', '30 min', '1 h', '2 h']).every(b => inerte(b)), 'en vol : les quatre sont inertes');
  m.appuyer(bouton(m, '30 min'));
  m.appuyer(bouton(m, '2 h'));
  assert.equal(w.de('loggia/minuteurs/poser').length, 1, 'un deuxième appui n’envoie rien : 60 min n’ont pas été posées');
  // La réponse arrive : la rangée du minuteur qui tourne, ses puces actives, qui peuvent s'ajouter — volontairement.
  repondre({ minuteurs: { [PC]: { fin: fin(30), duree: 30 } }, maintenant: T / 1000 });
  await attendre(); m.rendre();
  assert.ok(texteDe(m.arbre).includes('Se coupe à 21:10 · dans 30\u00A0min'));
  assert.ok(puces(m, ['+15 min', '+1 h', 'Annuler']).every(b => b && !inerte(b)), 'la réponse rend la main');
}));

test('B3 : deux appuis dans le MÊME tour — avant que la fiche ne se redessine — ne posent qu’un minuteur', () => dans(async () => {
  const w = monde({ serveur: { 'loggia/minuteurs/poser': () => new Promise(() => {}) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  // Le même élément, le même rendu : la puce qu'on tient est encore « active » pour le second appui, et seule la garde de l'envoi l'arrête.
  const trente = bouton(m, '30 min');
  trente.props.onClick(); trente.props.onClick();
  m.effets();
  assert.equal(w.de('loggia/minuteurs/poser').length, 1, 'un seul appel parti : 60 min n’ont pas été posées');
}));

test('B3 : les ajouts et Annuler attendent aussi la réponse ; un appel qui échoue rend la main et le dit', () => dans(async () => {
  let echouer;
  const w = monde({ minuteurs: { [PC]: { fin: fin(30), duree: 30 } }, serveur: { 'loggia/minuteurs/poser': () => new Promise((ok, ko) => { echouer = ko; }) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  m.appuyer(bouton(m, '+15 min'));
  assert.ok(puces(m, ['+15 min', '+1 h', 'Annuler']).every(b => inerte(b)), 'les trois puces attendent');
  m.appuyer(bouton(m, 'Annuler'));
  m.appuyer(bouton(m, '+1 h'));
  assert.equal(w.de('loggia/minuteurs/poser').length, 1);
  assert.equal(w.de('loggia/minuteurs/annuler').length, 0, 'Annuler n’est pas parti non plus');
  echouer(Object.assign(new Error('x'), { code: 'home_assistant_error' }));
  await attendre(); m.rendre();
  assert.ok(puces(m, ['+15 min', '+1 h', 'Annuler']).every(b => !inerte(b)), 'la main revient');
  assert.deepEqual(alertes(m), ['Le minuteur n’a pas pu être enregistré.']);
  m.appuyer(bouton(m, 'Annuler'));
  assert.equal(w.de('loggia/minuteurs/annuler').length, 1, 'et Annuler repart');
}));

// ── B4 : le Journal du jour ──────────────────────────────────────────────────

const evenement = (h, m, etat, o = {}) => ({ when: new Date(2026, 9, 13, h, m).getTime() / 1000, state: etat, entity_id: PC, ...o });
const journal = (m) => m.trouver(e => e.props && e.props.lu !== undefined && e.props.minuit !== undefined)[0].props;

test('B4 : un logbook qui échoue DIT que le journal n’a pas pu être lu — pas « Rien depuis minuit. »', () => dans(async () => {
  const w = monde({ serveur: { 'logbook/get_events': () => Promise.reject(new Error('logbook')) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  const { lu, minuit } = journal(m);
  assert.equal(lu.evenements, null, 'le logbook illisible n’est pas une liste vide');
  assert.equal(minuit, MINUIT);
  const j = monter(FICHE.JournalDuJour, { lu, minuit });
  assert.ok(j.texte().includes('Le journal n’a pas pu être lu.'));
  assert.ok(!j.texte().includes('Rien depuis minuit.'));
}));

test('B4 : un logbook lu et vide dit « Rien depuis minuit. » ; avant la lecture, « Chargement… »', () => dans(async () => {
  const w = monde();
  const m = monter(Fiche, w.props(PC));
  assert.equal(journal(m).lu, null, 'avant la première lecture');
  assert.ok(monter(FICHE.JournalDuJour, { lu: null, minuit: MINUIT }).texte().includes('Chargement…'));
  await attendre(); m.rendre();
  const j = monter(FICHE.JournalDuJour, { lu: journal(m).lu, minuit: MINUIT });
  assert.ok(j.texte().includes('Rien depuis minuit.') && !j.texte().includes('n’a pas pu'));
}));

test('B4 : si seul le journal de Loggia échoue, on montre ce que dit le logbook — sans message d’erreur', () => dans(async () => {
  const w = monde({ serveur: { 'loggia/volets/manoeuvres': () => Promise.reject({ code: 'unknown_command' }),
    'logbook/get_events': () => Promise.resolve([evenement(8, 50, 'on')]) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  const { lu, minuit } = journal(m);
  assert.deepEqual(lu.lignes, []);
  const j = monter(FICHE.JournalDuJour, { lu, minuit });
  assert.ok(j.texte().includes('Allumée') && j.texte().includes('Bouton de la prise'), 'le logbook parle : ' + j.texte());
  assert.ok(!j.texte().includes('n’a pas pu être lu'));
}));

test('B4 : le logbook illisible mais le journal de Loggia lu — ses lignes se montrent, et la lacune se dit après elles', () => dans(async () => {
  const cycle = { module: 'prises', regle: 'cycle', quoi: 'cycle terminé', cibles: [PC], n: 1, ts: T / 1000 - 3000, motif: 'à 16:14 · 1.08 kWh', detail: '', simule: false,
    g: { motif: [['à {h}', { h: '16:14', ts: new Date(2026, 9, 13, 16, 14).getTime() / 1000 }], ['{kwh} kWh', { kwh: 1.08 }]] } };
  const w = monde({ serveur: { 'logbook/get_events': () => Promise.reject(new Error('x')), 'loggia/volets/manoeuvres': () => Promise.resolve({ lignes: [cycle] }) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  const j = monter(FICHE.JournalDuJour, journal(m));
  const texte = j.texte();
  assert.ok(texte.includes('Cycle terminé · 1,08\u00A0kWh'));
  assert.ok(texte.indexOf('Cycle terminé') < texte.indexOf('Le journal n’a pas pu être lu.'), 'la lacune se dit après les lignes');
}));

/* F1 (tâche 14 bis) : la fiche lit le logbook depuis la VEILLE — 24 h avant minuit. Le serveur double celui de Home Assistant : il ne rend que ce qui est
 * postérieur à `start_time`. Lu depuis minuit, la panne de 23:00 manquait, et le retour de 07:00 faisait « Allumée · Bouton de la prise ». */
const hier = (h, m, etat, o = {}) => ({ when: new Date(2026, 9, 12, h, m).getTime() / 1000, state: etat, entity_id: PC, ...o });
const logbookDe = (evts) => (msg) => Promise.resolve(evts.filter(e => e.when * 1000 >= Date.parse(msg.start_time)));
const texteDuJournal = (m) => monter(FICHE.JournalDuJour, journal(m)).texte();

test('F1 : la fiche lit le logbook depuis 24 h avant minuit — une prise muette depuis 23:00 revient « De retour » (Réseau), pas « Allumée · Bouton de la prise »', () => dans(async () => {
  const w = monde({ serveur: { 'logbook/get_events': logbookDe([hier(8, 0, 'on'), hier(23, 0, 'unavailable'), evenement(7, 0, 'on')]) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.equal(w.de('logbook/get_events')[0].start_time, new Date(MINUIT - 24 * 3600000).toISOString(), 'depuis la veille, 24 h avant minuit');
  assert.equal(w.de('loggia/volets/manoeuvres')[0].depuis, MINUIT / 1000, 'le journal de Loggia, lui, se lit depuis minuit');
  const texte = texteDuJournal(m);
  assert.ok(texte.includes('De retour') && texte.includes('Réseau'), texte);
  assert.ok(!texte.includes('Allumée') && !texte.includes('Bouton de la prise'), 'plus de geste inventé : ' + texte);
  assert.ok(!texte.includes('Ne répond plus'), 'la panne d’hier n’est pas dans le journal d’aujourd’hui');
  assert.ok(!texte.includes('Rien depuis minuit'));
}));

test('F1 : après un redémarrage de Home Assistant, la prise qui reprend son état ne fait aucune ligne — « Rien depuis minuit. »', () => dans(async () => {
  // Le logbook omet le premier état de l'entité (pas d'`old_state_id`) : il rend le `on` d'hier soir, puis le `on` de 03:00.
  const w = monde({ serveur: { 'logbook/get_events': logbookDe([hier(18, 0, 'on'), evenement(3, 0, 'on')]) } });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.equal(journal(m).lu.evenements.length, 2, 'les deux événements sont lus');
  const texte = texteDuJournal(m);
  assert.ok(texte.includes('Rien depuis minuit.') && !texte.includes('Allumée'), texte);
}));

/* F6 : `estime` valait « pas de compteur » — un compteur qui existe mais n'a pas de statistiques de somme (pas de `state_class`) donnait des kWh calculés
 * d'après la puissance (`mesuresDe`), et la ligne sous les tuiles ne le disait pas : elle affichait le compteur total à côté de kWh qui n'en viennent pas. */
test('F6 : la ligne sous les tuiles dit « estimés d’après la puissance » dès que les kWh du jour viennent de la courbe — un compteur sans statistiques aussi', () => dans(async () => {
  // Le compteur existe (846,1 kWh) mais Home Assistant n'en rend aucune statistique : les kWh du jour sont ceux de la courbe intégrée.
  const sans = monde({ serveur: { 'recorder/statistics_during_period': statistiques({ '5minute': { [PC + '_power']: [cinqMin(8, 50, { mean: 120 }), cinqMin(8, 55, { mean: 120 })] } }) } });
  const a = monter(Fiche, sans.props(PC));
  await sans.mesures(); a.rendre();
  assert.ok(tuile(a, 'Aujourd’hui').kwh > 0, 'les kWh du jour existent, calculés');
  const ta = texteDe(a.arbre);
  assert.ok(ta.includes('estimés d’après la puissance'), ta);
  assert.ok(!ta.includes('Compteur total'), 'le compteur total ne dit pas des kWh qui n’en viennent pas');
  // Un compteur qui compte : sa somme fait foi, et la ligne dit le compteur total.
  const avec = monde({ serveur: { 'recorder/statistics_during_period': statistiques({ '5minute': { [PC + '_energy']: [cinqMin(8, 50, { change: 0.05 })], [PC + '_power']: [cinqMin(8, 50, { mean: 120 })] } }) } });
  const b = monter(Fiche, avec.props(PC));
  await avec.mesures(); b.rendre();
  const tb = texteDe(b.arbre);
  assert.ok(tb.includes('Compteur total : 846,1') && !tb.includes('estimés d’après la puissance'), tb);
  // Pas de compteur du tout : « estimés », dès le premier rendu — la ligne ne saute pas quand la courbe arrive.
  const sansCompteur = monde();
  const c = monter(Fiche, { ...sansCompteur.props(PC), prise: { prise: true, puissance: PC + '_power', energie: null } });
  assert.ok(texteDe(c.arbre).includes('estimés d’après la puissance'), 'avant même la lecture de la courbe');
}));

test('B4 : sans websocket, le journal n’a rien lu — il le dit aussi', () => dans(async () => {
  const w = monde();
  const m = monter(Fiche, { ...w.props(PC), hass: { ...w.hass, callWS: undefined } });
  await attendre(); m.rendre();
  assert.equal(journal(m).lu.evenements, null);
}));

// ── B5 : la confirmation ─────────────────────────────────────────────────────

test('B5 : la confirmation se défait seule au bout de 6 s — pas avant — et rend le focus à la bascule', () => dans(async ({ h }) => {
  const w = monde({ etat: null });
  const m = monter(Fiche, w.props(PC));
  // Un « DOM » minimal pour la racine : le focus est sur Annuler dans la question, la bascule est son frère.
  const focus = [];
  const bascule = { focus: () => focus.push('bascule') };
  const pied = { contains: (x) => !!x && x.annuler === true };
  m.arbre.ref.current = { querySelector: (s) => (s === '[data-demande]' ? pied : s === '[role="switch"]' ? bascule : s === '[data-annuler]' ? { focus: () => { focus.push('annuler'); document.activeElement = { annuler: true }; } } : null) };
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(demande(m));
  assert.deepEqual(focus, ['annuler'], 'la demande prend le focus');
  h.avancer(5999); m.effets();
  assert.ok(demande(m), 'à 5,999 s : elle tient encore');
  h.avancer(1); m.effets();
  assert.equal(demande(m), null, 'à 6 s : défaite');
  assert.deepEqual(focus, ['annuler', 'bascule'], 'le focus qui était sur Annuler revient à la bascule, avant que les boutons ne partent');
  assert.deepEqual(couper(w), [], 'et rien n’a été coupé');
  // Un deuxième appui rouvre la question pour 6 s de plus.
  m.appuyer(interrupteur(m), 'onToggle');
  h.avancer(3000); m.effets();
  assert.ok(demande(m));
  h.avancer(3000); m.effets();
  assert.equal(demande(m), null);
}));

test('B5 : la prise coupée ailleurs, puis rallumée par une automatisation — la question n’est PAS revenue', () => dans(async () => {
  const w = monde({ etat: null });
  const m = monter(Fiche, w.props(PC));
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(demande(m));
  // Quelqu'un coupe la prise ailleurs : la question n'a plus d'objet…
  const coupee = { ...w.hass.states, [PC]: { ...w.hass.states[PC], state: 'off', last_changed: iso(20, 41) } };
  m.proprietes({ hass: { ...w.hass, states: coupee } });
  m.effets();
  assert.equal(demande(m), null, 'cachée, bien sûr…');
  // …et une automatisation la rallume : « Couper quand même » ne réapparaît pas, personne ne l'a demandé.
  const rallumee = { ...w.hass.states, [PC]: { ...w.hass.states[PC], state: 'on', last_changed: iso(20, 42) } };
  m.proprietes({ hass: { ...w.hass, states: rallumee } });
  m.effets();
  assert.equal(demande(m), null, 'la prise rallumée ne rouvre pas la question');
  assert.deepEqual(couper(w), []);
  // Un nouvel appui la pose de nouveau, normalement.
  m.appuyer(interrupteur(m), 'onToggle');
  assert.ok(demande(m));
}));

test('B5 : une prise qui devient muette emporte la question aussi', () => dans(async () => {
  const w = monde({ etat: null });
  const m = monter(Fiche, w.props(PC));
  m.appuyer(interrupteur(m), 'onToggle');
  m.proprietes({ hass: { ...w.hass, states: { ...w.hass.states, [PC]: { ...w.hass.states[PC], state: 'unavailable' } } } });
  m.proprietes({ hass: { ...w.hass, states: w.hass.states } });
  assert.equal(demande(m), null);
}));

// ── B6 : la file d'écriture ──────────────────────────────────────────────────

const ecritures = (w) => w.de('loggia/prises/config').map(x => x.patch);
// Le serveur de la configuration : il range ce qu'on lui envoie, comme le vrai, et rend l'état entier.
const rangeur = (w) => (msg) => Promise.resolve({ config: { protegees: msg.patch.protegees || [], types: {}, prevenir: {} }, etat: ETAT(msg.patch.protegees || []) });
const echoue = () => Promise.reject({ code: 'unknown_command' });

test('B6 : une relecture qui ÉCHOUE sur un cache VIDE n’écrit RIEN — l’avance s’annule et la rangée touchée dit l’échec', () => dans(async () => {
  const w = monde({ serveur: { 'loggia/prises/etat': echoue } });
  w.reponses['loggia/prises/config'] = rangeur(w);
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.deepEqual([E.lireEtatPrises().etat, E.lireEtatPrises().erreur], [null, true], 'rien n’a jamais été lu');
  m.appuyer(proteger(m), 'cb');
  assert.equal(cadenas(m).length, 1, 'l’avance se montre aussitôt');
  await attendre(); await attendre(); m.rendre();
  assert.deepEqual(ecritures(w), [], 'AUCUNE écriture : bâti sur `{}`, le patch aurait remplacé la liste de TOUTES les protections');
  assert.deepEqual(alertes(m), ['Enregistrement impossible — le composant ne répond pas.'], 'la rangée touchée le dit');
  assert.equal(cadenas(m).length, 0, 'et l’avance est annulée : le PC n’est pas protégé');
}));

test('B6 : « ne plus protéger » sur un serveur qui ne répond plus — jamais `protegees: []`, jamais un patch bâti sur un cache de 15 s', () => dans(async () => {
  const w = monde({ etat: ETAT([NAS, PC]) });
  w.reponses['loggia/prises/config'] = rangeur(w);
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  assert.equal(cadenas(m).length, 1, 'le PC est protégé, la fiche le sait (cache)');
  // Entre-temps, un autre appareil a protégé la lave-vaisselle ; la relecture de la fiche, elle, ne revient plus.
  w.reponses['loggia/prises/etat'] = () => Promise.reject(new Error('coupure'));
  m.appuyer(proteger(m), 'cb');                               // « ne plus protéger »
  assert.equal(cadenas(m).length, 0, 'l’avance : le cadenas part');
  await attendre(); await attendre(); m.rendre();
  assert.deepEqual(ecritures(w), [], 'pas d’écriture bâtie sur un vieux cache : elle effacerait la protection de la lave-vaisselle');
  assert.equal(E.lireEtatPrises().erreur, true, 'le magasin publie l’erreur de cette lecture');
  assert.equal(alertes(m).length, 1);
  assert.equal(cadenas(m).length, 1, 'l’avance est annulée : le PC reste protégé à l’écran');
  // Le serveur revient : l'appui suivant écrit, sur la configuration relue.
  w.reponses['loggia/prises/etat'] = () => Promise.resolve(ETAT([LV, NAS, PC]));
  m.appuyer(proteger(m), 'cb');
  await attendre(); await attendre(); m.rendre();
  assert.deepEqual(ecritures(w), [{ protegees: [LV, NAS] }], 'bâti sur la relecture : la lave-vaisselle posée ailleurs est gardée');
  assert.deepEqual(alertes(m), [], 'et l’erreur s’efface avec le geste qui réussit');
}));

test('B6 : la relecture RÉUSSIE fait la base du patch — `protegees` part ENTIÈRE, triée', () => dans(async () => {
  const w = monde({ etat: ETAT([NAS]) });
  w.reponses['loggia/prises/config'] = rangeur(w);
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  // Un autre appareil a protégé la lave-vaisselle : le serveur le sait, le cache de la fiche pas encore.
  w.reponses['loggia/prises/etat'] = () => Promise.resolve(ETAT([LV, NAS]));
  m.appuyer(proteger(m), 'cb');
  await attendre(); await attendre(); m.rendre();
  assert.deepEqual(ecritures(w), [{ protegees: [LV, NAS, PC] }], 'la lave-vaisselle n’est pas effacée');
  assert.deepEqual(alertes(m), []);
  assert.deepEqual(E.lireEtatPrises().etat.config.protegees, [LV, NAS, PC], 'et la réponse du serveur remplace le cache');
}));

test('B6 : une réponse DÉPASSÉE par une plus fraîche n’est pas une panne — le cache, le plus frais, sert de base', () => dans(async () => {
  let repondre;
  const w = monde({ etat: ETAT([NAS]) });
  w.reponses['loggia/prises/config'] = rangeur(w);
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  // La relecture de la file part, mais sa réponse tarde ; une écriture plus fraîche a posé l'état entre-temps.
  w.reponses['loggia/prises/etat'] = () => new Promise((ok) => { repondre = ok; });
  m.appuyer(proteger(m), 'cb');
  await attendre();
  E.poserEtatPrises(ETAT([LV, NAS]));                          // plus frais que la lecture en vol
  repondre(ETAT([]));                                          // la vieille réponse arrive : elle est ignorée, sans erreur
  await attendre(); await attendre(); m.rendre();
  assert.equal(E.lireEtatPrises().erreur, false, 'aucune erreur publiée');
  assert.deepEqual(ecritures(w), [{ protegees: [LV, NAS, PC] }], 'le cache le plus frais est la base — pas la vieille réponse (qui aurait donné [PC])');
  assert.deepEqual(alertes(m), []);
}));

test('B6 : deux écritures de suite — la relecture qui échoue emporte la première, la seconde se relit et passe', () => dans(async () => {
  const w = monde({ etat: ETAT([NAS]) });
  w.reponses['loggia/prises/config'] = rangeur(w);
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  let n = 0;
  w.reponses['loggia/prises/etat'] = () => (++n === 1 ? Promise.reject(new Error('coupure')) : Promise.resolve(ETAT([NAS])));
  m.appuyer(proteger(m), 'cb');
  m.appuyer(proteger(m), 'cb');
  await attendre(); await attendre(); await attendre(); m.rendre();
  assert.equal(n, 2, 'une relecture par écriture : l’échec de la première ne ferme pas la file');
  assert.equal(ecritures(w).length, 1, 'la seconde écrit');
  assert.ok(ecritures(w)[0].protegees.includes(NAS), 'sur la configuration relue');
}));

test('B6 : un compte ordinaire n’écrit rien et ne touche pas à la file ; la rangée dit le refus et nomme la clé', () => dans(async () => {
  const w = monde({ admin: false });
  const m = monter(Fiche, w.props(PC));
  await attendre(); m.rendre();
  m.appuyer(proteger(m), 'cb');
  assert.deepEqual(ecritures(w), []);
  assert.equal(alertes(m).length, 1);
  assert.ok(alertes(m)[0].includes('loggia_prises'), 'le refus nomme la clé');
  assert.equal(w.de('loggia/prises/etat').length, 1, 'aucune relecture pour rien : celle de l’abonnement seulement');
}));

// ── B9 : le coût du cycle, sur la démo ───────────────────────────────────────

const { maisonPrisesDemo } = await import('../src/demo.js');
const LVD = 'switch.prise_lave_vaisselle', LV_W = 'sensor.prise_lave_vaisselle_power', LV_E = 'sensor.prise_lave_vaisselle_energy';   // les identifiants de la démo, pas ceux des autres tests

/* La fiche du lave-vaisselle de la démo, à `quand` : le serveur est la démo (état du § 6.1, statistiques sur 5 minutes et à l'heure, logbook), deux tarifs
 * dont les compteurs — creuses et pleines — se lisent dans les statistiques horaires de la démo (13 h à 16 h, et 2 h à 7 h, en creuses). */
async function ficheDemo(quand) {
  const dm = maisonPrisesDemo({ quand });
  const callWS = (msg) => {
    switch (msg.type) {
      case 'loggia/prises/etat': return Promise.resolve(dm.etat());
      case 'recorder/statistics_during_period': return Promise.resolve(dm.statistiques(msg));
      case 'logbook/get_events': return Promise.resolve(dm.logbook(msg));
      case 'loggia/minuteurs/etat': return Promise.resolve({ minuteurs: {}, maintenant: quand / 1000 });
      case 'loggia/volets/manoeuvres': return Promise.resolve({ lignes: [] });
      default: return Promise.reject({ code: 'unknown_command' });
    }
  };
  setLoggiaState({ index: null, resolved: { energy: { haids: {}, prix: [{ valeur: 0.1605, entite: null, compteur: 'sensor.conso_jour_hc' }, { valeur: 0.2092, entite: null, compteur: 'sensor.conso_jour_hp' }] } } });
  const attentes = [];
  E.reglerPrisesEtat({ hass: { callWS }, horloge: { repeter: () => 0, arreter: () => {}, plusTard: (f) => { attentes.push(f); return attentes.length; }, annuler: () => {}, maintenant: () => quand } });
  const hass = { states: dm.states, callWS, config: { currency: 'EUR' }, user: { id: 'demo', is_admin: true }, callService: () => Promise.resolve() };
  const m = monter(Fiche, { hass, id: LVD, prise: { prise: true, puissance: LV_W, energie: LV_E }, piece: 'Cuisine', bascule: Interrupteur, onFiche: () => {}, maintenant: quand });
  await attendre(); attentes.splice(0).forEach(f => f()); await attendre(); await attendre();
  m.rendre();
  return m;
}
const ligneDuCycle = (m) => m.trouver(e => e.props && e.props.cycles !== undefined && e.props.ligne !== undefined)[0].props.ligne;
const eurosDe = (texte) => ((texte || '').match(/([\d.,]+\s€)\s*$/) || [])[1] || null;
const A = (h, mn) => new Date(2026, 9, 13, h, mn).getTime();

test('B9 : sur la démo, le coût du cycle est celui de la tuile Aujourd’hui — quand le cycle est toute la consommation du jour', () => dans(async () => {
  for (const [h, mn] of [[20, 40], [15, 10], [9, 0]]) {
    const m = await ficheDemo(A(h, mn));
    const ligne = ligneDuCycle(m), jour = tuile(m, 'Aujourd’hui');
    const nom = h + ':' + String(mn).padStart(2, '0');
    assert.match(ligne, /^Cycle de \d\d:\d\d à \d\d:\d\d · 1,08\u00A0kWh · \d,\d\d\s€$/, nom + ' : ' + ligne);
    assert.equal(Math.round(jour.kwh * 100) / 100, 1.08, nom + ' : le cycle est toute la consommation du lave-vaisselle aujourd’hui');
    assert.ok(eurosDe(ligne), nom);
    assert.equal(eurosDe(ligne), jour.euros, nom + ' — « ' + ligne + ' » et la tuile « ' + jour.euros + ' » pour les mêmes kWh');
  }
}));

test('B9 : à 20:40 la démo disait 0,18 € au cycle et 0,17 € à la tuile ; elle dit 0,17 € aux deux — l’énergie, pas le temps, pèse le prix', () => dans(async () => {
  const m = await ficheDemo(A(20, 40));
  assert.match(ligneDuCycle(m), /^Cycle de 13:40 à 16:14 · 1,08\u00A0kWh · 0,17\s€$/);
  assert.match(tuile(m, 'Aujourd’hui').euros, /^0,17\s€$/);
}));

test('B9 : un cycle qui passe minuit garde la pondération par le temps — des euros quand même, mais pas ceux d’une nuit qu’il n’a pas passée', () => dans(async () => {
  const m = await ficheDemo(A(0, 30));
  const ligne = ligneDuCycle(m);
  assert.match(ligne, /^Cycle de 21:36 à 00:10 · 1,08\u00A0kWh · \d,\d\d\s€$/, ligne);
  assert.ok(tuile(m, 'Aujourd’hui').kwh < 0.01, 'la tuile du jour ne compte que ce qui est d’après minuit');
}));

/* F9 (tâche 14 bis) : le test d'avant ne lisait que la FORME de la ligne (« \d,\d\d € ») — n'importe quel prix la satisfaisait. Ici le MONTANT, avec DEUX
 * prix qui diffèrent d'une heure à l'autre : un cycle de 22:30 hier à 00:30, 1,2 kWh, qui passe minuit (les points de la journée, eux, ne couvrent que
 * 00:00 à 00:10 : sous 90 % du cycle, la pondération par le temps reste). Heures pleines à 0,20 € (22 h), creuses à 0,16 € (23 h et 0 h) — celles dont le compteur
 * a avancé. Le cycle passe 30 min en pleines, puis 60 + 30 min en creuses : 1,2 × (30 × 0,20 + 90 × 0,16) / 120 = 0,204 € → « 0,20 € ». Le prix de l'heure
 * de DÉPART (0,24 €), la moyenne des deux tarifs (0,22 €) et celle des trois heures (0,21 €) donneraient un autre chiffre. */
test('B9 : un cycle qui passe minuit — le MONTANT suit le temps passé à chacun des deux prix, ni le prix du départ ni leur moyenne', () => dans(async () => {
  const cycle = { debut: new Date(2026, 9, 12, 22, 30).toISOString(), fin: new Date(2026, 9, 13, 0, 30).toISOString(), kwh: 1.2 };
  const w = monde({ etat: ETAT([], { prises: { [LV]: entree({ type: 'lv', cycles: [cycle] }) } }), serveur: { 'recorder/statistics_during_period': statistiques({
    hour: { 'sensor.hc': [heureMois(12, 23, { change: 0.5 }), heureMois(13, 0, { change: 0.3 })], 'sensor.hp': [heureMois(12, 22, { change: 0.8 })] },
    '5minute': { [LV + '_power']: [cinqMin(0, 0, { mean: 500 }), cinqMin(0, 5, { mean: 500 })] } }) } });
  setLoggiaState({ index: null, resolved: { energy: { haids: {}, prix: [{ valeur: 0.16, entite: null, compteur: 'sensor.hc' }, { valeur: 0.20, entite: null, compteur: 'sensor.hp' }] } } });
  const m = monter(Fiche, w.props(LV));
  await w.mesures();
  m.rendre();
  const ligne = ligneDuCycle(m);
  const attendu = 1.2 * (30 * 0.20 + 60 * 0.16 + 30 * 0.16) / 120;
  assert.ok(Math.abs(attendu - 0.204) < 1e-12);
  assert.match(ligne, /^Cycle de 22:30 à 00:30 · 1,20\u00A0kWh · 0,20\s€$/, ligne);
  // Les trois façons de se tromper tombent sur un autre chiffre : le prix du départ, la moyenne des deux tarifs, la moyenne des trois heures.
  const centimes = (v) => Math.round(v * 100);
  assert.equal(centimes(attendu), 20);
  for (const faux of [1.2 * 0.20, 1.2 * (0.20 + 0.16) / 2, 1.2 * (0.20 + 0.16 + 0.16) / 3]) assert.notEqual(centimes(faux), 20, 'un autre prix donnerait ' + faux);
}));
