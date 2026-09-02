// ─────────────────────────────────────────────────────────────────────────────
// Regroupement des automatisations par famille.
//
// Les cas de départ viennent d'une installation réelle (87 automatisations,
// 25 familles avant correction) : « Lumière » et « Lumières » se retrouvaient
// dans deux groupes distincts, et « Force veilleuse Liam » dans un groupe
// « Force » qui ne voulait rien dire.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoFamille } from '../src/autos.js';

test('le pluriel ne fait plus une famille a part', () => {
  assert.equal(autoFamille('Lumière salon'), 'Lumières');
  assert.equal(autoFamille('Lumières cuisine'), 'Lumières');
  assert.equal(autoFamille('LUMIERE couloir'), 'Lumières');
});

test('un verbe en tete ne devient pas une famille', () => {
  assert.equal(autoFamille('Force veilleuse Liam'), 'Lumières');
  assert.equal(autoFamille('Allume lampe entrée'), 'Lumières');
  assert.equal(autoFamille('Coupe le chauffage la nuit'), 'Climat');
});

test('le mot de metier gagne, ou qu il soit dans le nom', () => {
  assert.equal(autoFamille('Le soir, fermeture des volets'), 'Volets');
  assert.equal(autoFamille('Départ maison → alarme'), 'Sécurité');
  assert.equal(autoFamille('Notification si la porte du garage reste ouverte'), 'Ouvrants');
});

test('la securite passe avant le reste quand les deux sont nommes', () => {
  assert.equal(autoFamille('Alarme déclenchée : lumières à fond'), 'Sécurité');
});

test('sans mot reconnu, le premier mot significatif au singulier', () => {
  assert.equal(autoFamille('Poubelles jaunes'), 'Poubelle');
  assert.equal(autoFamille('Poubelle verte'), 'Poubelle');
  // le verbe est saute, le mot suivant sert de famille — accents gardes
  assert.equal(autoFamille('Lance le café'), 'Café');
});

test('un nom vide ou muet tombe dans Divers', () => {
  assert.equal(autoFamille(''), 'Divers');
  assert.equal(autoFamille('   '), 'Divers');
  assert.equal(autoFamille(null), 'Divers');
});
