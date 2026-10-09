// ─────────────────────────────────────────────────────────────────────────────
// Les heures creuses, retrouvées dans l'historique (06/10).
//
// Home Assistant ne publie nulle part les CRÉNEAUX d'un contrat : les
// intégrations de compteur donnent un capteur binaire, vrai quand on y est.
// La barre du tarif se reconstitue donc depuis son historique — la seule
// source qui dise ce qui s'est vraiment passé.
//
// Ce qui se vérifie ici : une plage encore ouverte se ferme sur la fenêtre et
// non sur son dernier changement, un trou coupe la plage au lieu d'être
// comblé, et aucun prix ne s'affirme quand rien ne permet de le choisir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plagesVraies, barreTarif, prixDuMoment, prochainTarif } from '../src/tarif.js';

// Minuit à minuit, le 6 octobre 2026.
const T0 = new Date(2026, 9, 6, 0, 0).getTime();
const T1 = new Date(2026, 9, 7, 0, 0).getTime();
const h = (n, m = 0) => new Date(2026, 9, 6, n, m).getTime();
const etat = (t, s) => ({ state: s, last_changed: new Date(t).toISOString() });

test('deux créneaux d’heures creuses se retrouvent dans l’historique', () => {
  // Le contrat de la maison : 2 h – 7 h et 13 h – 16 h.
  const p = plagesVraies([
    etat(T0, 'off'), etat(h(2), 'on'), etat(h(7), 'off'),
    etat(h(13), 'on'), etat(h(16), 'off'),
  ], T0, T1);
  assert.equal(p.length, 2);
  assert.equal(new Date(p[0].debut).getHours(), 2);
  assert.equal(new Date(p[0].fin).getHours(), 7);
  assert.equal(new Date(p[1].debut).getHours(), 13);
  assert.equal(new Date(p[1].fin).getHours(), 16);
});

test('une plage encore ouverte se ferme sur la fenêtre', () => {
  // À 14 h 33, le créneau de 13 h court toujours : il doit aller jusqu'au bout
  // de la fenêtre, pas s'arrêter à l'instant du dernier changement.
  const p = plagesVraies([etat(T0, 'off'), etat(h(13), 'on')], T0, h(14, 33));
  assert.equal(p.length, 1);
  assert.equal(p[0].fin, h(14, 33));
});

test('une plage commencée avant la fenêtre part de son bord', () => {
  // L'historique rend d'abord l'état qui courait : il est horodaté AVANT minuit.
  const p = plagesVraies([etat(T0 - 3600e3, 'on'), etat(h(2), 'off')], T0, T1);
  assert.equal(p.length, 1);
  assert.equal(p[0].debut, T0, 'la plage ne commence pas la veille');
});

test('un trou coupe la plage au lieu d’être comblé', () => {
  const p = plagesVraies([
    etat(T0, 'off'), etat(h(2), 'on'), etat(h(3), 'unavailable'), etat(h(4), 'on'), etat(h(7), 'off'),
  ], T0, T1);
  assert.equal(p.length, 2, 'le silence de 3 h à 4 h ne s’invente pas');
  assert.equal(new Date(p[0].fin).getHours(), 3);
  assert.equal(new Date(p[1].debut).getHours(), 4);
});

test('un historique vide ne donne aucune plage', () => {
  assert.deepEqual(plagesVraies([], T0, T1), []);
  assert.deepEqual(plagesVraies(null, T0, T1), []);
  assert.deepEqual(plagesVraies([etat(T0, 'off')], T0, T1), []);
});

test('la barre place chaque créneau à sa place sur la journée', () => {
  const b = barreTarif([{ debut: h(2), fin: h(7) }, { debut: h(13), fin: h(16) }], T0, T1);
  assert.equal(b.length, 2);
  // 2 h sur 24 font un douzième de la barre ; 5 h en font cinq vingt-quatrièmes.
  assert.ok(Math.abs(b[0].gauche - 100 / 12) < 0.01, String(b[0].gauche));
  assert.ok(Math.abs(b[0].largeur - 500 / 24) < 0.01, String(b[0].largeur));
  assert.ok(Math.abs(b[1].gauche - 1300 / 24) < 0.01, String(b[1].gauche));
});

test('un créneau de quelques minutes garde un filet visible', () => {
  const b = barreTarif([{ debut: h(2), fin: h(2, 1) }], T0, T1);
  assert.ok(b[0].largeur >= 0.4, 'une minute sur 24 h ne doit pas disparaître');
});

test('le prix du moment suit le capteur binaire', () => {
  const c = { hc: 0.1605, hp: 0.2092 };
  assert.equal(prixDuMoment({ ...c, enHc: true }).valeur, 0.1605);
  assert.equal(prixDuMoment({ ...c, enHc: true }).enHc, true);
  assert.equal(prixDuMoment({ ...c, enHc: false }).valeur, 0.2092);
});

test('sans capteur binaire, deux prix ne permettent pas d’en choisir un', () => {
  // On ne devine pas l'heure creuse à l'horloge : les contrats diffèrent.
  const r = prixDuMoment({ hc: 0.16, hp: 0.21, enHc: null });
  assert.equal(r.valeur, null);
  assert.equal(r.enHc, null);
  assert.equal(r.unique, false);
});

test('un contrat à tarif unique n’a pas de créneau à connaître', () => {
  const r = prixDuMoment({ hc: null, hp: 0.2516, enHc: null });
  assert.equal(r.valeur, 0.2516);
  assert.equal(r.unique, true);
  // Et sans aucun prix, rien ne s'affirme.
  assert.equal(prixDuMoment({}).valeur, null);
  assert.equal(prixDuMoment({ hc: 'cher', hp: undefined }).valeur, null);
});

test('le prochain changement de tarif ne se devine que s’il est dans la journée', () => {
  const plages = [{ debut: h(2), fin: h(7) }, { debut: h(13), fin: h(16) }];
  // En heures creuses à 14 h : la bascule est la fin du créneau en cours.
  const a = prochainTarif(plages, h(14), true);
  assert.equal(a.versHc, false);
  assert.equal(a.instant, h(16));
  // En heures pleines à 10 h : le prochain créneau commence à 13 h.
  const b = prochainTarif(plages, h(10), false);
  assert.equal(b.versHc, true);
  assert.equal(b.instant, h(13));
  // Après le dernier créneau, la journée ne dit rien de demain.
  assert.equal(prochainTarif(plages, h(20), false), null);
  // Sans capteur binaire, on se taît.
  assert.equal(prochainTarif(plages, h(10), null), null);
  assert.equal(prochainTarif([], h(10), false), null);
});
