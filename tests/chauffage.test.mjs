// ─────────────────────────────────────────────────────────────────────────────
// Le calcul du chauffage, côté écran (chantier Chauffage, § 5.2 et § 12).
//
// `src/chauffage.js` est le jumeau de `custom_components/loggia/chauffage_calcul.py` :
// l'écran dessine la barre du planning et dit « jusqu'à 23:00, puis Éco » avec
// le MÊME calcul que celui qui décide côté serveur. Une seule fixture,
// tests/fixtures/chauffage_parite.json, lue ici ET par
// tests/python/test_chauffage_parite.py : si l'un bouge, l'autre rougit.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MODES, JOURS, lireHeure, ecrireHeure, changementEnCours, modePlanning, prochainChangement, modeVoulu,
} from '../src/chauffage.js';

const PARITE = JSON.parse(readFileSync(new URL('./fixtures/chauffage_parite.json', import.meta.url), 'utf8'));

test('les six modes et les sept jours, dans l’ordre du serveur', () => {
  assert.deepEqual(MODES, ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret']);
  assert.deepEqual(JOURS, ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']);
});

test('une heure se lit comme le serveur la lit', () => {
  assert.ok(PARITE.heures.length >= 10, 'la fixture a perdu ses heures');
  for (const [texte, attendu] of PARITE.heures) {
    assert.equal(lireHeure(texte), attendu, JSON.stringify(texte));
  }
  assert.equal(ecrireHeure(390), '06:30');
  assert.equal(ecrireHeure(0), '00:00');
  assert.equal(ecrireHeure(1439), '23:59');
});

test('le changement en vigueur : parité avec le serveur', () => {
  assert.ok(PARITE.en_cours.length >= 5, 'la fixture a perdu ses cas');
  for (const cas of PARITE.en_cours) {
    const semaine = PARITE.semaines[cas.semaine];
    assert.deepEqual(changementEnCours(semaine, cas.jour, cas.minute), cas.attendu, cas.id);
    assert.equal(modePlanning(semaine, cas.jour, cas.minute), cas.attendu ? cas.attendu[2] : null, cas.id);
  }
});

test('ce que le chauffage doit faire : parité avec le serveur, cas par cas', () => {
  assert.ok(PARITE.cas.length >= 15, 'la fixture de parité a perdu des cas');
  for (const cas of PARITE.cas) {
    const e = cas.entree;
    const lu = modeVoulu(PARITE.semaines[e.semaine], e.maison, e.reprise, e.fenetre, e.jour, e.minute, e.reglage_fenetre);
    assert.deepEqual(lu, cas.attendu, cas.id);
  }
  /* Une fin de reprise illisible n'abat rien : la reprise tient, sans « jusqu'à ». */
  const sansFin = { mode: 'confort', source: 'main', fin: null, puis: null };
  for (const fin of [['lun', 600], [null, null], [true, 600], [9, 99999], [0, 1440], [-1, 0], [0.5, 600],
    [0], [0, 600, 5], '00:10', 450]) {
    const reprise = { mode: 'confort', reste: 30, fin };
    const lu = modeVoulu(PARITE.semaines.type, { mode: 'planning' }, reprise, false, 0, 420);
    assert.deepEqual(lu, sansFin, JSON.stringify(fin));
  }
});

test('le prochain changement saute ce qui ne change rien, et boucle la semaine', () => {
  const S = PARITE.semaines;
  assert.deepEqual(prochainChangement(S.eco_en_double, 0, 540), [0, 1080, 'confort']);
  assert.deepEqual(prochainChangement(S.type, 6, 1380), [0, 390, 'confort']);
  assert.equal(prochainChangement(S.un_seul_mode, 3, 0), null);
  assert.equal(prochainChangement(S.vide, 0, 0), null);
  /* Deux changements à la même minute n'en font qu'un : pas de faux Éco à 08:00. */
  assert.equal(prochainChangement(S.doublon, 0, 479), null);
  assert.deepEqual(prochainChangement(S.desordre, 0, 720), [0, 1350, 'eco']);
});

test('chauffage.js reste pur : ni React, ni Home Assistant, ni entité en dur', () => {
  const src = readFileSync(new URL('../src/chauffage.js', import.meta.url), 'utf8');
  assert.ok(!/from 'react'|callService|callWS|hass\./.test(src));
  assert.ok(!/['"`](select|climate|switch)\.[a-z0-9_]{3,}['"`]/.test(src));
});
