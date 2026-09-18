// Les cameras disent leur dernier evenement (16/09, ADR 0031, etape 4 de la
// refonte) : la detection en cours, sinon le dernier declenchement du journal,
// sinon « Direct » — jamais un last_changed, jamais un evenement invente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIFS_DETECTION, GENRES_DETECTION, ICONES_DETECTION, FENETRE_EVENEMENT,
  libelleDetection, detecteursDe, instantDe, reduireDerniers, evenementCamera, depuis,
} from '../src/evenement.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const histo = readFileSync(join(RACINE, 'src', 'historique.jsx'), 'utf8');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

const T0 = Date.parse('2026-09-16T17:00:00Z');
const MIN = 60000;
const CAM = { id: 'camera.entree', name: 'Entrée', motion: 'binary_sensor.cam_mouvement', person: 'binary_sensor.cam_personne', sonnette: 'binary_sensor.cam_sonnette' };

test('les detecteurs d’une camera : dans l’ordre des genres, seulement ceux qui existent', () => {
  assert.deepEqual(detecteursDe(CAM), [
    { genre: 'sonnette', id: 'binary_sensor.cam_sonnette' }, { genre: 'person', id: 'binary_sensor.cam_personne' }, { genre: 'motion', id: 'binary_sensor.cam_mouvement' },
  ]);
  assert.deepEqual(detecteursDe({ id: 'camera.x', motion: null, vehicle: '', colis: 3 }), [], 'null, vide ou pas une chaine : pas un detecteur');
  assert.deepEqual(detecteursDe(null), []);
  assert.deepEqual(GENRES_DETECTION, ['sonnette', 'person', 'vehicle', 'colis', 'motion'], 'la sonnette prime, le mouvement ferme la marche');
  GENRES_DETECTION.forEach(g => assert.ok(ICONES_DETECTION[g], 'une icone pour ' + g));
});

test('un instant : secondes du journal, millisecondes, ISO — ou null', () => {
  assert.equal(instantDe(1789578000.5), 1789578000500);
  assert.equal(instantDe(1789578000500), 1789578000500);
  assert.equal(instantDe('2026-09-16T17:00:00Z'), T0);
  assert.equal(instantDe('pas une date'), null);
  assert.equal(instantDe(null), null);
  assert.equal(instantDe(''), null);
  assert.equal(instantDe(NaN), null);
});

test('le journal se reduit au dernier declenchement par entite, et ne bouge pas pour rien', () => {
  const ev = (id, state, min) => ({ entity_id: id, state, when: (T0 - min * MIN) / 1000 });
  const d1 = reduireDerniers(null, [ev('binary_sensor.a', 'on', 30), ev('binary_sensor.a', 'off', 29), ev('binary_sensor.a', 'on', 3), ev('binary_sensor.b', 'off', 1), ev('binary_sensor.c', 'detected', 10)]);
  assert.deepEqual(d1, { 'binary_sensor.a': T0 - 3 * MIN, 'binary_sensor.c': T0 - 10 * MIN }, 'le plus recent des actifs ; un « off » n’est pas un declenchement');
  const d2 = reduireDerniers(d1, [ev('binary_sensor.a', 'on', 50)]);
  assert.equal(d2, d1, 'un declenchement plus ancien ne change rien — meme objet, pas de rendu');
  const d3 = reduireDerniers(d1, [ev('binary_sensor.a', 'on', 1)]);
  assert.notEqual(d3, d1);
  assert.equal(d3['binary_sensor.a'], T0 - 1 * MIN);
  assert.equal(d1['binary_sensor.a'], T0 - 3 * MIN, 'le precedent n’est pas modifie en place');
  assert.deepEqual(reduireDerniers({}, [{ entity_id: 'binary_sensor.x', state: 'on', when: 'hier' }, { state: 'on', when: 1 }, null]), {}, 'sans instant lisible ou sans entite : rien');
  assert.deepEqual(ACTIFS_DETECTION, ['on', 'true', 'True', 'detected', 'Detected']);
});

test('la detection en cours prime, le genre le plus parlant d’abord', () => {
  const S = { 'binary_sensor.cam_mouvement': { state: 'on', last_changed: '2026-09-16T16:58:00Z' }, 'binary_sensor.cam_sonnette': { state: 'on', last_changed: '2026-09-16T16:59:30Z' } };
  const ev = evenementCamera(CAM, S, { 'binary_sensor.cam_personne': T0 - 5 * MIN }, T0);
  assert.equal(ev.genre, 'sonnette');
  assert.equal(ev.enCours, true);
  assert.equal(ev.quand, Date.parse('2026-09-16T16:59:30Z'), 'depuis quand : le last_changed du detecteur allume');
  assert.equal(ev.libelle, 'Sonnette');
  assert.equal(ev.icone, 'bell');
  const ev2 = evenementCamera(CAM, { 'binary_sensor.cam_personne': { state: 'detected' } }, {}, T0);
  assert.equal(ev2.genre, 'person');
  assert.equal(ev2.libelle, 'Personne détectée');
  assert.equal(ev2.quand, null, 'sans last_changed : pas d’instant, pas d’invention');
});

test('sans detection en cours : le dernier declenchement du journal, dans les 24 h, sinon rien', () => {
  const S = { 'binary_sensor.cam_mouvement': { state: 'off' }, 'binary_sensor.cam_personne': { state: 'off' } };
  const ev = evenementCamera(CAM, S, { 'binary_sensor.cam_mouvement': T0 - 3 * MIN, 'binary_sensor.cam_personne': T0 - 41 * MIN }, T0);
  assert.deepEqual(ev, { genre: 'motion', enCours: false, quand: T0 - 3 * MIN, libelle: 'Mouvement', icone: 'eye' }, 'le plus recent, quel que soit son rang');
  const ev2 = evenementCamera(CAM, S, { 'binary_sensor.cam_mouvement': T0 - 30 * 3600000, 'binary_sensor.cam_personne': T0 - 41 * MIN }, T0);
  assert.equal(ev2.genre, 'person', 'un mouvement d’il y a trente heures ne compte plus');
  assert.equal(ev2.libelle, 'Quelqu’un', '« Personne » seul dirait le contraire');
  assert.equal(evenementCamera(CAM, S, { 'binary_sensor.cam_mouvement': T0 - FENETRE_EVENEMENT - 1 }, T0), null, 'au-dela de 24 h : rien');
  assert.equal(evenementCamera(CAM, S, { 'binary_sensor.cam_mouvement': T0 + 5 * MIN }, T0), null, 'dans le futur (horloge fausse) : rien');
  assert.equal(evenementCamera(CAM, S, {}, T0), null, 'sans journal : rien — jamais last_changed');
  assert.equal(evenementCamera(CAM, S, null, T0), null);
  assert.equal(evenementCamera({ id: 'camera.seule' }, S, { 'binary_sensor.cam_mouvement': T0 }, T0), null, 'sans detecteur : rien');
  assert.equal(evenementCamera(CAM, { 'binary_sensor.cam_mouvement': { state: 'unavailable' } }, {}, T0), null, 'indisponible n’est pas une detection');
});

test('les mots des genres', () => {
  assert.equal(libelleDetection('vehicle', true), 'Véhicule présent');
  assert.equal(libelleDetection('vehicle'), 'Véhicule');
  assert.equal(libelleDetection('colis', true), 'Colis livré');
  assert.equal(libelleDetection('colis'), 'Colis');
  assert.equal(libelleDetection('motion', true), 'Mouvement');
  assert.equal(libelleDetection('inconnu'), null);
});

test('« depuis » : a l’instant, minutes, heures, puis le jour et l’heure — dans la langue voulue', () => {
  assert.equal(depuis(T0 - 20000, T0, 'fr'), 'à l’instant');
  // Le francais met une espace fine insecable entre le nombre et l'unite.
  assert.match(depuis(T0 - 3 * MIN, T0, 'fr'), /il y a 3[\s  ]min/);
  assert.match(depuis(T0 - 2 * 3600000, T0, 'fr'), /il y a 2[\s  ]h/);
  assert.match(depuis(T0 - 3 * MIN, T0, 'en'), /3[\s  ]min/);
  assert.match(depuis(T0 - 30 * 3600000, T0, 'fr'), /\d{2}:\d{2}/, 'au-dela d’un jour : une heure, pas « il y a 30 h »');
  assert.equal(depuis(null, T0, 'fr'), '');
  assert.equal(depuis(T0 + 5 * MIN, T0, 'fr'), 'à l’instant', 'un instant dans le futur ne devient pas negatif');
});

test('la tuile : hors ligne, en cours, dernier evenement, sinon Direct — le meme mot partout', () => {
  const s = bloc('function sousCamera(', NL + '}');
  assert.ok(s.includes("if (!online) return <><span style={POINT_CAMERA('var(--o-bad)')} />{tr('Hors ligne')}</>;"), 'hors ligne d’abord');
  assert.ok(s.includes("if (!ev) return <><span style={POINT_CAMERA('var(--o-ok)')} />{tr('Direct')}</>;"), 'sans evenement : Direct, rien d’invente');
  assert.ok(s.includes("if (ev.enCours) return <><span style={POINT_CAMERA(ev.genre === 'sonnette' ? 'var(--o-bad)' : ev.genre === 'colis' ? 'var(--o-accent)' : 'var(--o-warn)')} />{ev.libelle}</>;"), 'en cours : le point de la vue Securite');
  assert.ok(s.includes("return <><Fi i={ev.icone} size={11} color=\"var(--o-lampe)\" />{ev.libelle + ' · ' + depuis(ev.quand)}</>;"), 'le dernier evenement, et depuis quand');
  const t = bloc('function tuileCamera(', NL + '}');
  assert.ok(t.includes('sub: sousCamera(cam.online, cam.evenement || null),') && t.includes('evenement: cam.evenement || null,'), 'la tuile de l’Accueil passe par la meme sous-ligne');
  assert.ok(src.includes("{grand && <CamSheet haid={c.haid} nom={c.label} hass={c.hass} evenement={c.evenement} onClose={() => setGrand(false)} />}"), 'la fiche recoit l’evenement');
  assert.ok(src.includes('function CamSheet({ haid, nom, hass, onClose, onNav = null, evenement = null }) {') && src.includes('<CameraTile c={tuileCamera({ name: nom, haid, online, evenement }, 0, hass)} agrandir={false} />'), 'et le montre dans sa tuile');
});

test('l’Accueil et la vue Securite lisent la resolution et le journal — jamais last_changed', () => {
  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes('const camsResolues = (LOGGIA_RESOLVED && LOGGIA_RESOLVED.cameras && LOGGIA_RESOLVED.cameras.list) || [];'), 'les cameras resolues, avec leurs detecteurs');
  assert.ok(d.includes('const derniersCams = useDerniersEvenements(a && a.hass, camsResolues.flatMap(c => detecteursDe(c).map(d => d.id)), reduireDerniers);'), 'le journal des detecteurs');
  assert.ok(d.includes('return rc ? evenementCamera(rc, (a && a.hass && a.hass.states) || {}, derniersCams) : null;') && d.includes('a.cams.map((cam, i) => tuileCamera({ ...cam, evenement: evenementDe(cam.haid) }, i, a.hass))'), 'chaque tuile recoit son evenement');
  const sc = bloc('function SecuriteContent(', NL + '}');
  assert.ok(sc.includes('const derniersCams = useDerniersEvenements(hass, camList.flatMap(c => detecteursDe(c).map(d => d.id)), reduireDerniers);'), 'la vue Securite aussi');
  assert.ok(sc.includes('const ev = evenementCamera(c, S, derniersCams);') && sc.includes('const active = !!(ev && ev.enCours);') && sc.includes('sub: sousCamera(online, ev),'), 'meme sous-ligne, meme notion d’activite');
  assert.ok(!sc.includes("tr('RAS')"), 'plus de RAS : le dernier evenement, ou Direct');
  assert.ok(sc.includes('...camList.flatMap(c => detecteursDe(c).map(d => d.id))'), 'le journal de la securite raconte aussi les detections');
  const hd = histo.indexOf('export function useDerniersEvenements(');
  assert.ok(hd >= 0, 'le crochet vit dans historique.jsx');
  const h = histo.slice(hd, histo.indexOf(NL + '}', hd));
  assert.ok(h.includes("{ type: 'logbook/event_stream', start_time: debut, entity_ids: sig.split('|') }") && h.includes('setDerniers(prev => reduire(prev, msg.events));'), 'le flux du journal, reduit au dernier declenchement par entite');
  const k = bloc('  const accueilKeys = [', '];');
  assert.ok(k.trimEnd().endsWith('...secKeys'), 'les detecteurs sont relus sur l’Accueil : « en cours » suit le direct');
});

test('la demo a de quoi le montrer, et les mots ont leur traduction', () => {
  assert.ok(demo.includes("'binary_sensor.camera_entree_mouvement': s('off', { friendly_name: 'Caméra entrée Mouvement', device_class: 'motion' }),") && demo.includes("'binary_sensor.camera_entree_personne': s('off', { friendly_name: 'Caméra entrée Personne' }),"), 'deux detecteurs sur la camera de l’entree');
  assert.ok(demo.includes("const APPAREIL_DE = (id) => /^(camera\\.entree$|switch\\.camera_entree_|binary_sensor\\.camera_entree_)/.test(id) ? 'cam_entree' : null;"), 'du meme appareil : c’est ainsi que la resolution les retrouve');
  assert.ok(demo.includes("if (msg && msg.type === 'logbook/event_stream') {") && demo.includes("entity_id: 'binary_sensor.camera_entree_mouvement', state: 'on'"), 'un journal qui les a vus declencher');
  for (const k of ['Quelqu’un', 'Véhicule', 'Colis', 'Personne détectée', 'Véhicule présent', 'Colis livré', 'Sonnette', 'Mouvement', 'Direct', 'Hors ligne', 'à l’instant']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
