// ─────────────────────────────────────────────────────────────────────────────
// « Pendant votre absence » (05/11, étape 3 du rapport sur l'usage).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD } from './monolithe.mjs'; // l'Accueil en entier (ADR 0283)

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const A = await import('../src/absence.js');

const H = 3600000, MIN = 60000;
const T = Date.parse('2026-11-05T18:00:00Z');
const serie = (...pts) => pts.map(([t, etat]) => ({ t, etat }));
const personnes = { ids: ['person.a', 'person.b'], absent: (e) => e !== 'home' };

test('l’historique se lit en séries, dans l’ordre du temps', () => {
  const s = A.lireHistorique([[
    { entity_id: 'person.a', state: 'home', last_changed: '2026-11-05T08:00:00Z' },
    { state: 'not_home', last_changed: '2026-11-05T09:00:00Z' },
  ], [], 'rien']);
  assert.deepEqual(Object.keys(s), ['person.a']);
  assert.deepEqual(s['person.a'].map(p => p.etat), ['home', 'not_home']);
});

test('les personnes disent l’absence ; sans elles, l’alarme ; sans l’une ni l’autre, rien', () => {
  const S = { 'person.b': { state: 'home' }, 'person.a': { state: 'not_home' }, 'person.muet': { state: 'unknown' }, 'alarm_control_panel.m': { state: 'disarmed' } };
  assert.deepEqual(A.sujetsAbsence(S).ids, ['person.a', 'person.b'], 'une personne muette ne compte pas');
  const al = A.sujetsAbsence({ 'alarm_control_panel.m': { state: 'armed_away' } });
  assert.deepEqual(al.ids, ['alarm_control_panel.m']);
  assert.ok(al.absent('armed_away') && al.absent('armed_vacation') && !al.absent('disarmed') && !al.absent('armed_home'));
  assert.equal(A.sujetsAbsence({ 'light.x': { state: 'on' } }), null);
});

test('la maison est vide quand tout le monde est parti ; l’absence finit au premier retour', () => {
  const s = {
    'person.a': serie([T - 72 * H, 'home'], [T - 8 * H, 'not_home'], [T - 1 * H, 'home']),
    'person.b': serie([T - 72 * H, 'home'], [T - 7 * H, 'work'], [T - 0.5 * H, 'home']),
  };
  assert.deepEqual(A.derniereAbsence(s, personnes.ids, personnes.absent, T), { debut: T - 7 * H, fin: T - 1 * H });
});

test('encore absent, trop court ou trop ancien : rien à dire', () => {
  const encore = { 'person.a': serie([T - 9 * H, 'not_home']), 'person.b': serie([T - 9 * H, 'not_home']) };
  assert.equal(A.derniereAbsence(encore, personnes.ids, personnes.absent, T), null, 'personne n’est rentré');
  const court = { 'person.a': serie([T - 9 * H, 'home'], [T - 2 * H, 'not_home'], [T - 1.75 * H, 'home']), 'person.b': serie([T - 9 * H, 'not_home']) };
  assert.equal(A.derniereAbsence(court, personnes.ids, personnes.absent, T), null, 'un quart d’heure n’est pas une absence');
  const vieux = { 'person.a': serie([T - 40 * H, 'not_home'], [T - 13 * H, 'home']), 'person.b': serie([T - 40 * H, 'not_home']) };
  assert.equal(A.derniereAbsence(vieux, personnes.ids, personnes.absent, T), null, 'rentré il y a treize heures : la carte s’est tue');
});

test('un téléphone muet ne dit ni départ ni retour', () => {
  const s = {
    'person.a': serie([T - 9 * H, 'home'], [T - 6 * H, 'not_home'], [T - 4 * H, 'unavailable'], [T - 1 * H, 'home']),
    'person.b': serie([T - 9 * H, 'not_home']),
  };
  assert.deepEqual(A.derniereAbsence(s, personnes.ids, personnes.absent, T), { debut: T - 6 * H, fin: T - 1 * H });
});

test('un retour d’à l’instant, que l’historique n’a pas encore, se lit dans l’état du moment', () => {
  const s = { 'person.a': serie([T - 9 * H, 'home'], [T - 5 * H, 'not_home']), 'person.b': serie([T - 9 * H, 'not_home']) };
  const S = { 'person.a': { state: 'home', last_changed: new Date(T - 2 * MIN).toISOString() }, 'person.b': { state: 'not_home', last_changed: new Date(T - 9 * H).toISOString() } };
  const avec = A.avecEtatActuel(s, S, personnes.ids);
  assert.deepEqual(A.derniereAbsence(avec, personnes.ids, personnes.absent, T), { debut: T - 5 * H, fin: T - 2 * MIN });
});

test('ce qu’on écoute : la porte, les ouvrants, le mouvement, l’alarme — sans les masqués ni les groupes', () => {
  const S = {
    'event.sonnette': { state: '2026-11-05T10:00:00Z', attributes: { friendly_name: 'Sonnette' } },
    'binary_sensor.porte': { state: 'off', attributes: { device_class: 'door', friendly_name: 'Porte' } },
    'binary_sensor.fenetre': { state: 'off', attributes: { device_class: 'window' } },
    'binary_sensor.radar': { state: 'off', attributes: { device_class: 'occupancy' } },
    'binary_sensor.masque': { state: 'off', attributes: { device_class: 'door' } },
    'binary_sensor.groupe': { state: 'off', attributes: { device_class: 'window', entity_id: ['binary_sensor.fenetre'] } },
    'binary_sensor.fumee': { state: 'off', attributes: { device_class: 'smoke' } },
    'alarm_control_panel.m': { state: 'disarmed', attributes: {} },
  };
  const e = A.entitesAbsence(S, { porte: [{ id: 'event.sonnette', genre: 'sonnette' }], masque: (id) => id.endsWith('.masque') });
  assert.deepEqual(Object.keys(e).sort(), ['alarm_control_panel.m', 'binary_sensor.fenetre', 'binary_sensor.porte', 'binary_sensor.radar', 'event.sonnette']);
  assert.equal(e['binary_sensor.porte'].famille, 'portes');
  assert.equal(e['binary_sensor.fenetre'].famille, 'fenetres');
});

test('les faits : chaque appui, chaque ouverture — pas ceux d’avant, ni les dix minutes du retour', () => {
  const debut = T - 7 * H, fin = T - 1 * H;
  const iso = (ms) => new Date(ms).toISOString();
  const entites = {
    'event.sonnette': { genre: 'sonnette', nom: 'Sonnette' },
    'binary_sensor.porte': { genre: 'ouverture', nom: 'Porte', famille: 'portes' },
    'binary_sensor.jardin': { genre: 'mouvement', nom: 'Jardin' },
    'alarm_control_panel.m': { genre: 'alarme', nom: 'Alarme' },
  };
  const series = {
    'event.sonnette': serie([debut, iso(T - 30 * H)], [T - 5 * H, iso(T - 5 * H)], [T - 4 * H, 'unknown'], [T - 3.9 * H, iso(T - 5 * H)], [T - 2 * H, iso(T - 2 * H)]),
    'binary_sensor.porte': serie([debut, 'off'], [T - 4 * H, 'on'], [T - 3.9 * H, 'off'], [fin - 5 * MIN, 'on']),
    'binary_sensor.jardin': serie([debut, 'off'], [T - 6 * H, 'on'], [T - 5.9 * H, 'off'], [T - 3 * H, 'on'], [T - 2.9 * H, 'off']),
    'alarm_control_panel.m': serie([debut, 'armed_away'], [T - 3 * H, 'triggered'], [T - 2.9 * H, 'armed_away']),
  };
  const f = A.trierFaits(A.faitsAbsence({ debut, fin, series, entites }));
  assert.deepEqual(f.map(l => [l.genre, l.fois.length]), [['alarme', 1], ['sonnette', 2], ['ouverture', 1], ['mouvement', 2]],
    'la sonnette rendue telle quelle après un redémarrage ne compte pas deux fois ; la porte du retour ne compte pas');
});

test('les machines qui ont fini pendant l’absence viennent des cycles du serveur', () => {
  const abs = { debut: T - 7 * H, fin: T - 1 * H };
  const etat = { prises: {
    'switch.lv': { type: 'lv', cycles: [{ fin: new Date(T - 3 * H).toISOString() }, { fin: new Date(T - 20 * H).toISOString() }] },
    'switch.tv': { type: 'tv', cycles: [] },
  } };
  const f = A.faitsCycles(etat, abs, (id, type) => type === 'lv' ? 'Lave-vaisselle' : id);
  assert.deepEqual(f.map(l => [l.nom, l.fois.length]), [['Lave-vaisselle', 1]]);
  assert.deepEqual(A.faitsCycles(null, abs), []);
});

test('les mots de la carte et du bandeau', () => {
  const l = { genre: 'sonnette', fois: [T - 5 * H, T - 2 * H] };
  assert.match(A.texteFait(l, T).detail, /^On a sonné 2 fois : /);
  assert.match(A.texteFait({ ...l, fois: [T - 5 * H] }, T).detail, /^On a sonné à /);
  assert.match(A.texteFait({ genre: 'ouverture', nom: 'Porte', fois: [T - 4 * H] }, T).detail, /^Ouverture à /);
  assert.match(A.texteFait({ genre: 'machine', nom: 'Lave-vaisselle', fois: [T - 3 * H] }, T).detail, /^Cycle terminé à /);
  assert.equal(A.phraseAbsence({ lignes: [l, { genre: 'mouvement', fois: [T] }] }), '3 événements pendant votre absence');
  assert.equal(A.phraseAbsence({ lignes: [{ genre: 'colis', fois: [T] }] }), '1 événement pendant votre absence');
});

test('l’Accueil la montre en tête du rail, hors édition, et le bandeau la dit', () => {
  assert.ok(DASHBOARD.includes("if (absence && !editMode) renduRail.unshift(<CarteAbsence key=\"absence\" absence={absence} />);"));
  assert.ok(DASHBOARD.includes('const absence = useAbsence(dashHass, !editMode);'));
  assert.ok(DASHBOARD.includes('faits={absence && faits ? { ...faits, txt: [...faits.txt, phraseAbsence(absence)] } : faits}'));
});
