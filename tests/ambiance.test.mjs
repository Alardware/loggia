// L'ambiance d'une piece en une ligne (16/09, ADR 0029) : probleme, activite,
// calme — et la passe sur les etats qui range tout ca par zone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ambiancePiece, ambiancesParPiece, COULEURS_PIECE, NIVEAUX_PIECE } from '../src/ambiance.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const police = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');

test('le calme : rien d’allume, rien d’ouvert', () => {
  assert.deepEqual(ambiancePiece({}), { niveau: 'calme', texte: 'Tout est éteint', couleur: COULEURS_PIECE.calme, icone: null });
  assert.equal(ambiancePiece().niveau, 'calme');
  assert.equal(ambiancePiece({ lumieres: 0, medias: [], co2: 700 }).niveau, 'calme', 'un CO2 sous le palier ne dit rien');
  assert.deepEqual(NIVEAUX_PIECE, ['probleme', 'actif', 'calme']);
});

test('l’activite : lumieres, TV, musique, chauffe — dans cet ordre, sans redite', () => {
  assert.equal(ambiancePiece({ lumieres: 1 }).texte, '1 lumière');
  assert.equal(ambiancePiece({ lumieres: 4, medias: [{ tv: true }] }).texte, '4 lumières · TV');
  assert.equal(ambiancePiece({ medias: [{ tv: false }, { tv: false }, { tv: true }] }).texte, 'TV · Musique', 'deux enceintes = une Musique');
  assert.equal(ambiancePiece({ chauffe: true }).texte, 'Chauffe');
  assert.equal(ambiancePiece({ froid: true }).texte, 'Rafraîchit');
  assert.equal(ambiancePiece({ chauffe: true, froid: true }).texte, 'Chauffe', 'chauffe et rafraichit ensemble : on dit chauffe');
  const a = ambiancePiece({ lumieres: '2', chauffe: true });
  assert.deepEqual([a.niveau, a.texte, a.couleur, a.icone], ['actif', '2 lumières · Chauffe', COULEURS_PIECE.actif, null]);
});

test('le probleme passe avant tout : ouvrants ouverts, CO2 charge', () => {
  const f = ambiancePiece({ lumieres: 4, ouverts: [{ famille: 'fenetre' }] });
  assert.deepEqual([f.niveau, f.texte, f.couleur, f.icone], ['probleme', 'Fenêtre ouverte', COULEURS_PIECE.probleme, 'triangle-warning']);
  assert.equal(ambiancePiece({ ouverts: [{ famille: 'fenetre' }, { famille: 'fenetre' }] }).texte, '2 fenêtres ouvertes');
  assert.equal(ambiancePiece({ ouverts: [{ famille: 'porte' }] }).texte, 'Porte ouverte');
  assert.equal(ambiancePiece({ ouverts: [{ famille: 'porte' }, { famille: 'porte' }] }).texte, '2 portes ouvertes');
  assert.equal(ambiancePiece({ ouverts: [{ famille: 'porte' }, { famille: 'fenetre' }] }).texte, '2 ouvrants ouverts');
  assert.equal(ambiancePiece({ co2: 1400 }).texte, 'CO₂ élevé', 'le palier « élevé » de la table (captures du 19/09)');
  assert.equal(ambiancePiece({ co2: 1399, lumieres: 1 }).texte, '1 lumière');
  assert.equal(ambiancePiece({ co2: 1450, ouverts: [{ famille: 'fenetre' }] }).texte, 'Fenêtre ouverte · CO₂ élevé');
  assert.equal(ambiancePiece({ co2: 'abc', ouverts: [null] }).niveau, 'calme', 'du bruit ne fait pas un probleme');
  assert.ok(police.includes('.fi-rr-triangle-warning:before'), 'l’icone existe dans la police');
});

const etat = (state, attributes = {}) => ({ state, attributes });
const S = {
  'media_player.tv_salon': etat('playing', { device_class: 'tv' }),
  'media_player.enceinte_salon': etat('playing', { device_class: 'speaker' }),
  'media_player.chambre': etat('paused'),
  'media_player.perdu': etat('playing'),
  'climate.salon': etat('heat', { hvac_action: 'heating' }),
  'climate.bureau': etat('cool', { hvac_action: 'cooling' }),
  'climate.chambre': etat('heat', { hvac_action: 'idle' }),
  'binary_sensor.fenetre_chambre': etat('on', { device_class: 'window', friendly_name: 'Fenêtre chambre' }),
  'binary_sensor.porte_entree': etat('on', { device_class: 'door' }),
  'binary_sensor.fenetre_salon': etat('off', { device_class: 'window' }),
  'binary_sensor.mouvement_salon': etat('on', { device_class: 'motion' }),
  'binary_sensor.fenetre_sdb': etat('unavailable', { device_class: 'window' }),
  // Un thermostat muet garde parfois ses attributs d'avant : « heating »
  // sans etat n'est pas une chauffe.
  'climate.cave': etat('unavailable', { hvac_action: 'heating' }),
  'light.salon': etat('on'),
};
const ZONES = { 'media_player.tv_salon': 'Salon', 'media_player.enceinte_salon': 'Salon', 'media_player.chambre': 'Chambre', 'climate.salon': 'Salon', 'climate.bureau': 'Bureau', 'climate.chambre': 'Chambre', 'binary_sensor.fenetre_chambre': 'Chambre', 'binary_sensor.porte_entree': 'Entrée', 'binary_sensor.fenetre_salon': 'Salon', 'binary_sensor.mouvement_salon': 'Salon', 'binary_sensor.fenetre_sdb': 'Salle de bain', 'climate.cave': 'Cave', 'light.salon': 'Salon' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

test('une passe sur les etats range lecteurs, chauffage et ouvrants par zone', () => {
  const amb = ambiancesParPiece(S, (id) => ZONES[id] || null, norm);
  assert.deepEqual(Object.keys(amb).sort(), ['bureau', 'chambre', 'entree', 'salon']);
  assert.deepEqual(amb.salon.medias, [{ id: 'media_player.tv_salon', tv: true }, { id: 'media_player.enceinte_salon', tv: false }]);
  assert.equal(amb.salon.chauffe, true);
  assert.deepEqual(amb.salon.ouverts, [], 'une fenetre fermee, un mouvement : rien');
  assert.deepEqual(amb.chambre, { medias: [], chauffe: false, froid: false, ouverts: [{ id: 'binary_sensor.fenetre_chambre', nom: 'Fenêtre chambre', famille: 'fenetre' }] }, 'un lecteur en pause, un chauffage au repos ne comptent pas');
  assert.equal(amb.bureau.froid, true);
  assert.deepEqual(amb.entree.ouverts.map(o => o.famille), ['porte']);
  assert.equal(amb['salle de bain'], undefined, 'un capteur muet ne cree pas de piece');
  assert.equal(amb.cave, undefined, 'un thermostat muet non plus, meme avec « heating » dans ses attributs');
  assert.ok(!('perdu' in amb), 'une entite sans zone n’appartient a personne');
  assert.equal(ambiancePiece({ lumieres: 1, ...amb.salon }).texte, '1 lumière · TV · Musique · Chauffe');
  assert.equal(ambiancePiece({ ...amb.chambre, co2: 1480 }).texte, 'Fenêtre ouverte · CO₂ élevé');
});

test('sans etats ni zones : rien, sans erreur', () => {
  assert.deepEqual(ambiancesParPiece(null, null), {});
  assert.deepEqual(ambiancesParPiece(S, null), {}, 'sans zones, aucune piece');
  assert.deepEqual(ambiancesParPiece({ 'media_player.x': etat('playing') }, () => 'Salon'), { salon: { medias: [{ id: 'media_player.x', tv: false }], chauffe: false, froid: false, ouverts: [] } }, 'la normalisation par defaut : minuscules');
});
