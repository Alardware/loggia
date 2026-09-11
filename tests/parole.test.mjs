// ─────────────────────────────────────────────────────────────────────────────
// Ce que dit l'assistant : de quoi il parle, et quel mot il prononce.
//
// Exécuté pour de vrai — le module est pur. Relire son texte ne dirait pas si
// « Aucune alerte » teinte l'orbe en rouge ; l'appeler, si.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teinteDe, mots, poidsDesMots, motAuTemps, phraseAutour } from '../src/parole.js';

test('chaque sujet de la maison a sa teinte', () => {
  assert.equal(teinteDe('Le chauffage tient dix-neuf degrés dans le salon.'), 'chaud');
  assert.equal(teinteDe('La clim est coupée depuis midi.'), 'froid');
  assert.equal(teinteDe('C’est fait : la lumière du salon est allumée.'), 'bien');
  assert.equal(teinteDe('Fuite détectée sous l’évier !'), 'alerte');
});

test('elle répond dans la langue qu’on lui parle', () => {
  assert.equal(teinteDe('The heating is on in the bedroom.'), 'chaud');
  assert.equal(teinteDe('Smoke detected in the kitchen.'), 'alerte');
  assert.equal(teinteDe('I closed the shutters.'), 'bien');
});

test('une phrase qui rassure ne teinte pas en rouge', () => {
  /* « Aucune alerte » parle d'une alerte pour dire qu'il n'y en a pas. En
   * rouge, l'orbe dirait l'inverse de la phrase. */
  assert.equal(teinteDe('Aucune alerte en cours.'), 'base');
  assert.equal(teinteDe('No smoke, no leak.'), 'base');
  // La négation vaut pour SA phrase : la suivante peut encore alerter.
  assert.equal(teinteDe('Pas de fuite ce matin. Mais le détecteur de fumée sonne au garage !'), 'alerte');
  // Et elle ne retire que l'alerte : le reste du sujet demeure.
  assert.equal(teinteDe('Pas de fuite, et les volets sont fermés.'), 'bien');
});

test('une négation se lit en mots entiers, des deux côtés', () => {
  // « No » ouvre « Nouvelle » : cherchée hors des mots entiers, la négation
  // aurait fait taire justement l'alerte qui compte.
  assert.equal(teinteDe('Nouvelle alerte : fuite dans la buanderie.'), 'alerte');
  // Et de l'autre côté : « piano » finit par « no ». Sans la frontière de
  // DÉBUT de mot, la fumée détectée près du piano ne donnait plus l'alerte.
  assert.equal(teinteDe('Fumée détectée près du piano.'), 'alerte');
  assert.equal(teinteDe('Smoke near the piano!'), 'alerte');
});

test('l’alerte l’emporte sur le reste', () => {
  assert.equal(teinteDe('J’ai allumé la lumière : une fuite coule sous l’évier.'), 'alerte');
});

test('la météo ne chauffe pas l’orbe', () => {
  // « degré » et « température » disent la météo autant que le chauffage.
  assert.equal(teinteDe('Il fait trois degrés dehors, et la température va baisser.'), 'base');
});

test('sans sujet, la couleur propre de l’orbe', () => {
  assert.equal(teinteDe(''), 'base');
  assert.equal(teinteDe(null), 'base');
  assert.equal(teinteDe('Bonjour.'), 'base');
});

test('les mots se comptent sans les blancs', () => {
  assert.deepEqual(mots('  Bonjour   le\nmonde  '), ['Bonjour', 'le', 'monde']);
  assert.deepEqual(mots(''), []);
  assert.deepEqual(mots(undefined), []);
});

test('un mot long dure plus qu’un court, et un point s’arrête', () => {
  const [court, long] = poidsDesMots(['le', 'maintenant']);
  assert.ok(long > court);
  const [sans, avec] = poidsDesMots(['oui', 'oui.']);
  assert.ok(avec > sans, 'le point marque une pause');
  const [virgule, point] = poidsDesMots(['oui,', 'oui.']);
  assert.ok(point > virgule, 'une virgule respire, un point s’arrête');
  // « 19 » se dit dix-neuf : pas une syllabe.
  const [un, dixneuf] = poidsDesMots(['a', '19']);
  assert.ok(dixneuf > un);
});

test('le mot lu avance avec la lecture, sans jamais reculer', () => {
  const poids = poidsDesMots(mots('Le chauffage tient dix-neuf degrés, et la chambre remonte doucement.'));
  assert.equal(motAuTemps(poids, 0), 0);
  assert.equal(motAuTemps(poids, 1), poids.length - 1);
  let avant = -1;
  for (let k = 0; k <= 100; k += 1) {
    const i = motAuTemps(poids, k / 100);
    assert.ok(i >= avant, 'le surlignage est revenu en arrière à ' + k + ' %');
    avant = i;
  }
  // Hors bornes : collé aux extrémités plutôt qu'égaré.
  assert.equal(motAuTemps(poids, -3), 0);
  assert.equal(motAuTemps(poids, 7), poids.length - 1);
  assert.equal(motAuTemps(poids, Number.NaN), 0);
  assert.equal(motAuTemps([], 0.5), -1);
});

test('à mi-lecture, on est au milieu du TEMPS — pas au milieu des mots', () => {
  /* Deux mots longs, puis cinq courts. Couper au milieu des mots allumerait le
   * quatrième à mi-lecture, alors que la voix est encore dans le deuxième. */
  const liste = mots('Anticonstitutionnellement, extraordinairement. Un de ce le la.');
  const i = motAuTemps(poidsDesMots(liste), 0.5);
  assert.ok(i <= 1, 'la moitié du temps se passe dans les deux premiers mots, pas au mot ' + i);
});

test('la phrase autour du mot lu', () => {
  const liste = mots('Il pleut. Prends un parapluie, vraiment. Bonne journée !');
  // 0 Il · 1 pleut. · 2 Prends · 3 un · 4 parapluie, · 5 vraiment. · 6 Bonne · 7 journée · 8 !
  assert.deepEqual(phraseAutour(liste, 4), [2, 5]);
  assert.deepEqual(phraseAutour(liste, 0), [0, 1]);
  assert.deepEqual(phraseAutour(liste, 8), [6, 8]);
  // Hors bornes, la phrase la plus proche ; sans mots, rien.
  assert.deepEqual(phraseAutour(liste, 99), [6, 8]);
  assert.deepEqual(phraseAutour([], 0), [0, -1]);
});
