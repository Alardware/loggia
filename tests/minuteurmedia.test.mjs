/* Le minuteur d'un lecteur (10/11, ADR 0341) : src/minuteurmedia.js, pur.
 *
 * Ce qui compte : la fin fait ce que le serveur fera (`fin_lecteur`, minuteurs.py) — la TV et la barre de son s'éteignent, une Echo
 * s'arrête de jouer —, le minuteur se lit sur l'une ou l'autre entité d'une paire, et les phrases disent l'heure de fin.
 * À l'heure de Paris, en français : les phrases disent l'heure du navigateur. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const M = await import('../src/minuteurmedia.js');
const { BITS } = await import('../src/lecteur.js');
const { finMinuteurLecteurDemo } = await import('../src/demo.js');

const T = Date.parse('2026-11-10T20:40:00+01:00');
const NBSP = ' ';
// Une Apple TV, la barre de son : PAUSE, STOP, PLAY, TURN_ON, TURN_OFF (relus au registre le 09/11).
const BITS_TV = BITS.PAUSE | BITS.STOP | BITS.PLAY | BITS.TURN_ON | BITS.TURN_OFF;

test('la règle du serveur, mot pour mot : éteindre ce qui s’éteint, arrêter le reste', () => {
  assert.deepEqual(M.finServeur(BITS_TV, false), { quoi: 'eteindre', service: 'turn_off' });
  assert.deepEqual(M.finServeur(BITS_TV, true), { quoi: 'arreter', service: 'media_pause' }, 'une Echo ne s’éteint pas');
  assert.deepEqual(M.finServeur(BITS.STOP, true), { quoi: 'arreter', service: 'media_stop' });
  for (const b of [0, null, 'x', BITS.PLAY]) assert.deepEqual(M.finServeur(b, false), { quoi: 'eteindre', service: 'turn_off' }, String(b));
});

test('la démo joue la même règle, qu’elle recopie sans l’importer', () => {
  const gestes = [0, BITS.PAUSE, BITS.STOP, BITS.TURN_OFF, BITS.PLAY, BITS_TV, BITS.STOP | BITS.TURN_OFF, BITS.PAUSE | BITS.TURN_OFF];
  for (const b of gestes) {
    for (const p of [null, 'apple_tv', 'cast', 'alexa_media', 'alexa_devices']) {
      assert.deepEqual(finMinuteurLecteurDemo(b, p), M.finServeur(b, p === 'alexa_media' || p === 'alexa_devices'), b + ' / ' + p);
    }
  }
});

test('le minuteur d’un lecteur : la TV par son entité, l’Echo par celle qui commande, rien sans pause ni arrêt', () => {
  const tv = { haid: 'media_player.salon', ma: null, ctl: 'media_player.salon', bitsCtl: BITS_TV, alexa: false };
  assert.deepEqual(M.minuteurDe(tv, { marche: true }), { cible: 'media_player.salon', geste: 'eteindre' });
  const echo = { haid: 'media_player.chambre_echo_dot', ma: 'media_player.echo_dot_chambre', ctl: 'media_player.echo_dot_chambre', bitsCtl: BITS_TV, alexa: true };
  assert.deepEqual(M.minuteurDe(echo, { marche: false }), { cible: 'media_player.echo_dot_chambre', geste: 'arreter' });
  assert.equal(M.minuteurDe({ ...echo, bitsCtl: BITS.PLAY }, { marche: false }), null, 'rien à arrêter : pas de minuteur');
  assert.equal(M.minuteurDe({ ...tv, indispo: true }, { marche: true }), null, 'indisponible : pas de minuteur');
  assert.equal(M.minuteurDe(null, null), null);
});

test('en cours sur l’une ou l’autre entité de la paire', () => {
  const echo = { haid: 'media_player.a', ma: 'media_player.b' };
  const fins = { 'media_player.b': T + 60000 };
  assert.deepEqual(M.minuteurEnCours((id) => fins[id] || null, echo), { id: 'media_player.b', fin: T + 60000 });
  assert.equal(M.minuteurEnCours(() => null, echo), null);
});

test('les phrases : l’heure de fin, le décompte des lampes, la consigne', () => {
  const fin = Date.parse('2026-11-10T22:10:00+01:00');
  assert.equal(M.phraseMinuteurMedia('eteindre', fin, T), 'S’éteint à 22:10 · dans 1' + NBSP + 'h' + NBSP + '30');
  assert.equal(M.phraseMinuteurMedia('arreter', Date.parse('2026-11-10T21:10:00+01:00'), T), 'S’arrête à 21:10 · dans 30' + NBSP + 'min');
  assert.equal(M.consigneMinuteur('eteindre', { tv: true }), 'Éteint la TV au bout du temps choisi.');
  assert.equal(M.consigneMinuteur('eteindre', { tv: false }), 'Éteint l’enceinte au bout du temps choisi.');
  assert.equal(M.consigneMinuteur('eteindre', { peut: false }), 'Disponible une fois l’appareil allumé.');
  assert.equal(M.consigneMinuteur('arreter'), 'Arrête la lecture au bout du temps choisi.');
  assert.equal(M.consigneMinuteur('arreter', { peut: false }), 'Disponible pendant une lecture.');
});

test('la carte : l’heure de fin devant la phrase, jamais devant une panne', () => {
  const fin = Date.parse('2026-11-10T22:41:00+01:00');
  const phrase = { texte: 'Stranger Things · S4 E1', encre: 'var(--o-text1)', panne: false };
  assert.deepEqual(M.phraseAvecMinuteur(phrase, 'eteindre', fin), { ...phrase, texte: 'S’éteint à 22:41 · Stranger Things · S4 E1' });
  assert.equal(M.phraseAvecMinuteur(phrase, 'eteindre', null), phrase);
  const panne = { texte: 'Indisponible', encre: 'var(--o-bad)', panne: true };
  assert.equal(M.phraseAvecMinuteur(panne, 'eteindre', fin), panne);
});

test('les durées : six en un appui, « Autre durée » de 5 min à 4 h', () => {
  assert.deepEqual(M.DUREES_MEDIA, [15, 30, 45, 60, 90, 120]);
  assert.deepEqual(M.AUTRE_DUREE, { min: 5, max: 240, pas: 5, depart: 25 });
  assert.deepEqual(M.AJOUTS_MEDIA, [15, 60]);
});
