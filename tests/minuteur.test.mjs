// Le minuteur d'extinction (21/09) : « pourquoi Loggia doit rester ouvert,
// c'est absurde, et je n'ai pas le décompte ». Il vit dans Home Assistant
// (`custom_components/loggia/minuteurs.py`) ; l'écran lit l'heure de fin et
// compte à la seconde, calé sur l'heure du serveur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decalageServeur, resteMinuteur, decompte } from '../src/minuteur.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');

test('le décompte se lit comme une minuterie de cuisine', () => {
  assert.equal(decompte(1800), '30:00');
  assert.equal(decompte(1781), '29:41');
  assert.equal(decompte(245), '4:05');
  assert.equal(decompte(59), '0:59');
  assert.equal(decompte(3725), '1:02:05', 'au-delà d’une heure, les heures s’ajoutent');
  assert.equal(decompte(0), '0:00');
  assert.equal(decompte(-3), '0:00');
  assert.equal(decompte('n’importe quoi'), '0:00');
});

test('le reste se compte sur l’heure du SERVEUR, pas sur celle de l’appareil', () => {
  const etat = { minuteurs: { 'light.a': { fin: 2000, duree: 30 } }, maintenant: 1000 };
  // Un appareil juste : 1000 s restent.
  assert.equal(resteMinuteur(etat, 'light.a', 1_000_000, decalageServeur(etat, 1_000_000)), 1000);
  // Une tablette qui retarde de trois minutes : l'écart compense, le reste est le même.
  const enRetard = 1_000_000 - 180_000;
  assert.equal(resteMinuteur(etat, 'light.a', enRetard, decalageServeur(etat, enRetard)), 1000);
  // Pas de minuteur, un minuteur échu, une réponse vide : rien.
  assert.equal(resteMinuteur(etat, 'light.b', 1_000_000, 0), null);
  assert.equal(resteMinuteur(etat, 'light.a', 2_500_000, 0), null);
  assert.equal(resteMinuteur(null, 'light.a', 0, 0), null);
  assert.equal(decalageServeur(null, 123), 0);
});

test('la rangée lit le serveur, et ne tient plus rien dans l’onglet', () => {
  const d = src.indexOf('function RangeeMinuteur(');
  assert.ok(d >= 0, 'la rangée existe');
  const bloc = src.slice(d, src.indexOf('\n}\n', d));
  assert.ok(bloc.includes("useEtatServeur(hass, 'loggia/minuteurs/etat', 15000, '')"), 'elle lit les minuteurs du composant');
  assert.ok(bloc.includes("type: 'loggia/minuteurs/poser', entity_id: id, minutes: 30"), '+30 min part au serveur');
  assert.ok(bloc.includes("type: 'loggia/minuteurs/annuler', entity_id: id"), 'annuler aussi');
  assert.ok(bloc.includes('useSeconde(reste != null);'), 'le décompte bat à la seconde, seulement s’il y a un minuteur');
  assert.ok(bloc.includes('<FicheValeur>{decompte(reste)}</FicheValeur>'), 'le décompte se voit, en chiffres tabulaires');
  assert.ok(bloc.includes('if (!etat) return null;'), 'sans composant, pas de minuteur qui mourrait avec l’onglet');
  // L'ancien minuteur du navigateur a disparu, et sa mise en garde avec lui.
  assert.ok(!src.includes('const MINUTEURS = new Map()'), 'plus de table dans l’onglet');
  assert.ok(!src.includes('minuteurPoser(') && !src.includes('minuteurAnnuler('), 'plus de setTimeout d’extinction');
  assert.ok(!src.includes('tant que Loggia reste ouvert'), 'plus de mise en garde : ce n’est plus vrai');
});

test('la démo répond comme le composant, et les mots sont traduits', () => {
  for (const t of ['loggia/minuteurs/etat', 'loggia/minuteurs/poser', 'loggia/minuteurs/annuler']) {
    assert.ok(demo.includes("msg.type === '" + t + "'"), t);
  }
  assert.ok(!en.includes('tant que Loggia reste ouvert'), 'l’ancienne phrase ne traîne plus dans le catalogue');
});
