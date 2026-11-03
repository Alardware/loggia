/* TEST AJOUTÉ (01/11, lot 9 Gladys, R2, R3 ; ADR 0313) — la tondeuse au travail.
 *
 * R2 : l'avance d'une tonte, « Tond · 45 % · 20 min restantes », d'après les capteurs de progression et de temps restant de SON
 * appareil, reconnus à leur CLÉ (`progress`, `left_time`), jamais à leur nom ; sur la carte (sa phrase) et dans la popup (sa barre).
 * R3 : la dernière erreur que le carnet du serveur garde se dit encore dans la popup, vingt-quatre heures, avec son heure — et plus
 * seulement pendant la phase d'erreur. En option : « Pluie en cours », d'après le binaire `moisture` de son appareil. Aucune
 * commande nouvelle. Le « maintenant » des tests : samedi 17/10/2026, 18:20. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const R = { ...(await import('../src/robots.js')), ...(await import('../src/robotsfiche.js')) };
const { maisonRobotsDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const MAINTENANT = new Date(2026, 9, 17, 18, 20).getTime();
const st = (state, attributes = {}) => ({ state: String(state), attributes });
const MIN = { unit_of_measurement: 'min' };
// Une sœur telle que `decrireSoeurs` la décrit.
const soeur = (id, cle, etat, x = {}) => ({ id, domaine: id.split('.')[0], cle, etat: String(etat), attributs: x.attributs || {}, classe: x.classe || null, texte: (cle || '') + ' ' + id.split('.')[1] });

test('R2 : l’avance se dit « 45 % · 20 min restantes »', () => {
  assert.equal(R.avanceTonte(st(45), st(20, MIN)), '45 % · 20 min restantes');
  assert.equal(R.avanceTonte(st('44.6'), st(80, MIN)), '45 % · 1 h 20 restantes', 'arrondi ; au-delà d’une heure, la durée lisible');
});

test('R2 : le temps restant suit l’unité choisie dans Home Assistant', () => {
  assert.equal(R.avanceTonte(null, st(1.5, { unit_of_measurement: 'h' })), '1 h 30 restantes');
  assert.equal(R.avanceTonte(null, st(1200, { unit_of_measurement: 's' })), '20 min restantes');
  assert.equal(R.avanceTonte(null, st(20)), '20 min restantes', 'sans unité : des minutes, celles de Mammotion');
});

test('R2 : ce qui ne se lit pas part — rien de lisible, rien', () => {
  assert.equal(R.avanceTonte(st('unknown'), st(20, MIN)), '20 min restantes');
  assert.equal(R.avanceTonte(st(45), st('unavailable', MIN)), '45 %');
  assert.equal(R.avanceTonte(st(45), st(0, MIN)), '45 %', 'zéro minute restante ne se dit pas');
  assert.equal(R.avanceTonte(st(140), null), null, 'un pourcentage hors de 0–100 n’en est pas un');
  assert.equal(R.avanceTonte(st(-1), null), null);
  assert.equal(R.avanceTonte(undefined, undefined), null, 'sans capteur');
  assert.equal(R.avanceTonte(st('unknown'), st('unknown')), null);
});

test('R2 : la phrase de la carte d’une tondeuse au travail dit son avance, devant ses aires', () => {
  const ph = (x) => R.phraseRobot({ domaine: 'lawn_mower', phase: 'travail', maintenant: MAINTENANT, ...x }).texte;
  assert.equal(ph({ avance: '45 % · 20 min restantes', pieces: ['Pelouse arrière'] }), 'Tond · 45 % · 20 min restantes');
  assert.equal(ph({ pieces: ['Pelouse arrière'] }), 'Tond · Pelouse arrière', 'sans avance : ses aires, comme avant');
  assert.equal(ph({}), 'Tonte en cours');
  assert.equal(R.phraseRobot({ domaine: 'lawn_mower', phase: 'base', avance: '45 %', maintenant: MAINTENANT }).texte, 'Sur la base', 'sur la base, rien');
  assert.equal(R.phraseRobot({ domaine: 'vacuum', phase: 'travail', avance: '45 %', maintenant: MAINTENANT }).texte, 'Nettoyage en cours', 'un aspirateur n’en dit rien');
});

test('R2 : la popup lit les capteurs à leur CLÉ, jamais à leur nom', () => {
  const a = R.avanceeRobot([soeur('sensor.t_progression', 'progress', 45), soeur('sensor.t_temps_restant', 'left_time', 20, { attributs: MIN })]);
  assert.deepEqual(a, { pct: 45, texte: '45 % · 20 min restantes' });
  assert.equal(R.avanceeRobot([soeur('sensor.t_progression', null, 45), soeur('sensor.t_temps_restant', null, 20)]), null, 'des noms sans clé ne valent rien');
  assert.equal(R.avanceeRobot([soeur('number.t_depart_de_la_progression', 'progress', 0)]), null, 'un réglage n’est pas un capteur');
  assert.deepEqual(R.avanceeRobot([soeur('sensor.t_temps_restant', 'left_time', 20, { attributs: MIN })]), { pct: null, texte: '20 min restantes' }, 'sans pourcentage, pas de barre');
  assert.equal(R.avanceeRobot([soeur('sensor.t_progression', 'progress', 'unavailable')]), null);
});

const ERR = (texte, ilYaMin, x = {}) => ({ erreurs: { 'lawn_mower.t': { texte, t: (MAINTENANT - ilYaMin * 60000) / 1000, date: null, ...x } } });
const lignes = (etat, x = {}) => R.lignesEtat({ etat, robot: 'lawn_mower.t', domaine: 'lawn_mower', phase: 'base', soeurs: [], maintenant: MAINTENANT, ...x });

test('R3 : la dernière erreur reste dans la popup, avec son heure', () => {
  assert.deepEqual(lignes(ERR('Lame bloquée', 130)), [{ cle: 'erreur', glyphe: 'triangle-warning', encre: 'var(--o-text2)', texte: 'Dernière erreur à 16:10 : Lame bloquée' }]);
  assert.equal(lignes(ERR('Lame bloquée', 20 * 60))[0].texte, 'Dernière erreur hier à 22:20 : Lame bloquée', 'la veille : « hier »');
});

test('R3 : vingt-quatre heures, pas une de plus', () => {
  assert.equal(lignes(ERR('Lame bloquée', 24 * 60 - 1)).length, 1);
  assert.deepEqual(lignes(ERR('Lame bloquée', 24 * 60 + 1)), []);
});

test('R3 : l’heure de l’appareil passe avant l’instant où le serveur l’a vue', () => {
  // Relue au démarrage de Home Assistant : vue à l'instant, datée par l'appareil d'il y a trois jours — trop vieille.
  assert.deepEqual(lignes(ERR('Mauvais contact', 1, { date: (MAINTENANT - 3 * 86400000) / 1000 })), []);
  assert.equal(lignes(ERR('Mauvais contact', 300, { date: (MAINTENANT - 60 * 60000) / 1000 }))[0].texte, 'Dernière erreur à 17:20 : Mauvais contact');
  assert.deepEqual(lignes(ERR('Mauvais contact', 0, { date: (MAINTENANT + 3600000) / 1000 })), [], 'une heure dans le futur : une horloge fausse');
});

test('R3 : en erreur, le mot d’état la dit déjà ; sans erreur gardée, rien', () => {
  assert.deepEqual(lignes(ERR('Lame bloquée', 5), { phase: 'erreur' }), []);
  assert.deepEqual(lignes({ erreurs: {} }), []);
  assert.deepEqual(lignes(null), [], 'un serveur muet');
  assert.deepEqual(lignes(ERR('', 5)), [], 'un texte vide');
  assert.deepEqual(lignes(ERR('Lame bloquée', 5), { robot: 'lawn_mower.autre' }), [], 'l’erreur d’un autre robot');
});

test('option : « Pluie en cours », d’après le binaire de pluie de SON appareil', () => {
  const pluie = (etat) => soeur('binary_sensor.t_pluie_detectee', 'rain_detected', etat, { classe: 'moisture' });
  assert.deepEqual(lignes(null, { soeurs: [pluie('on')] }), [{ cle: 'pluie', glyphe: 'raindrops', encre: 'var(--o-text2)', texte: 'Pluie en cours' }]);
  assert.deepEqual(lignes(null, { soeurs: [pluie('off')] }), []);
  assert.deepEqual(lignes(null, { soeurs: [pluie('on')], domaine: 'vacuum' }), [], 'un aspirateur n’a pas de pluie');
  assert.deepEqual(lignes(null, { soeurs: [soeur('switch.t_detection_de_pluie', 'rain_detection', 'on')] }), [], 'l’interrupteur de détection n’est pas la pluie');
  assert.deepEqual(lignes(null, { soeurs: [soeur('binary_sensor.t_en_charge', null, 'on', { classe: 'battery_charging' })] }), [], 'un autre binaire allumé non plus');
  assert.deepEqual(lignes(null, { soeurs: [soeur('sensor.t_humidite', null, 'on', { classe: 'moisture' })] }), [], 'seul un binaire dit la pluie');
  assert.deepEqual(lignes(ERR('Lame bloquée', 5), { soeurs: [pluie('on')] }).map(l => l.cle), ['erreur', 'pluie']);
});

test('la carte suit ses deux capteurs à leur clé, et ne commande rien de plus', () => {
  const carte = lire('src/cartes/robot.jsx');
  assert.ok(carte.includes("const idPct = soeur('sensor', 0, ['progress']), idReste = soeur('sensor', 0, ['left_time']);"));
  assert.ok(carte.includes('useHass(actif ? [id, idBat, idCharge, idPct, idReste, ...aires]'), 'abonnée à leurs états');
  assert.ok(carte.includes('avance: avanceTonte(S[idPct], S[idReste])'));
  assert.ok(carte.includes('pickSibling(LOGGIA_INDEX, S0, id, { domain, deviceClass, cles })'), 'la clé va jusqu’à la découverte');
  assert.ok(!/_progression|temps_restant/.test(carte), 'aucun nom');
});

test('la popup dit l’avance, l’erreur gardée et la pluie — et la logique vit dans robotsfiche.js, chargé avec elle', () => {
  const fiche = lire('src/ficherobot.jsx');
  assert.ok(fiche.includes("avance={vue.phase === 'travail' || vue.phase === 'pause' ? avanceeRobot(soeurs) : null}"));
  assert.ok(fiche.includes('lignesEtat({ etat: vue.etat, robot: idRobot, domaine, phase: vue.phase, soeurs, maintenant })'));
  assert.ok(fiche.includes('role="progressbar"'), 'la barre se dit au lecteur d’écran');
  assert.ok(lire('src/appareils/fiches.jsx').includes("lazyRecharge(() => import('../ficherobot.jsx'))"), 'la fiche se charge à la demande');
  // `resumeJours` part du démarrage (robots.js) pour la fiche : la place de l'avance (ADR 0313).
  assert.ok(!lire('src/robots.js').includes('export function resumeJours'));
  assert.ok(lire('src/distributeurfiche.js').includes("import { niveauUsure, resumeJours } from './robotsfiche.js';"));
});

/* La démo, comme l'écran la lit : l'index bâti par la découverte, puis `decrireSoeurs`. */
function soeursDemo(m, id) {
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  return R.decrireSoeurs(ix, m.states, id);
}

test('la démo porte une tonte en cours, avec son avance, et une erreur récente', () => {
  const m = maisonRobotsDemo({ quand: MAINTENANT });
  assert.equal(m.states['lawn_mower.tondeuse'].state, 'mowing');
  assert.deepEqual(R.avanceeRobot(soeursDemo(m, 'lawn_mower.tondeuse')), { pct: 45, texte: '45 % · 20 min restantes' });
  const e = m.etat();
  const l = R.lignesEtat({ etat: e, robot: 'vacuum.aspirateur', domaine: 'vacuum', phase: 'base', maintenant: MAINTENANT });
  assert.deepEqual(l.map(x => x.texte), ['Dernière erreur à 16:20 : Bloqué sous le canapé']);
});
