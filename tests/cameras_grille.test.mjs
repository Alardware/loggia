// Les cameras sur telephone : UNE par ligne — la grille de deux (v3.24.2) n'a
// pas plu (retour user du 15/09 : « pas fan finalement la grille de 2 »).
//
// Depuis le 20/09 (v3.61.0, ADR 0061), c'est le REGLAGE qui le dit : « moi
// j'en ai 2 mais d'autres en ont peut-etre plus, on pourrait ajouter un
// reglage d'affichage ». « Automatique » vaut toujours une seule colonne au
// telephone — le defaut ne bouge pas —, mais un `!important` dans le CSS
// rendrait tout choix sans effet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colonnesCam, camDispoDe, poserCamDispo, camDisposDe, CAM_AUTO } from '../src/camdispo.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const NL = String.fromCharCode(10);

test('sans reglage, le telephone garde UNE camera par ligne', () => {
  assert.equal(CAM_AUTO.mobile, 1, 'le defaut du telephone');
  assert.equal(colonnesCam(null, 'mobile'), 1);
  assert.equal(colonnesCam(null, 'pc'), 2, 'et deux sur l’ordinateur, comme avant');
  assert.equal(colonnesCam(null, 'tablette'), 2);
  // Une valeur abimee ne casse rien : on retombe sur l'automatique.
  assert.equal(colonnesCam('nimporte quoi', 'mobile'), 1);
  assert.equal(colonnesCam({ mobile: '9' }, 'mobile'), 1, 'un identifiant inconnu vaut « automatique »');
  // Quatre est un choix valide — de l'ordinateur. Vu du telephone, il se plie.
  assert.equal(colonnesCam({ mobile: '4' }, 'mobile'), 2, 'jamais plus que ce que le format supporte');
});

test('le choix se range par format, et « automatique » ne s’ecrit pas', () => {
  assert.equal(camDispoDe(null, 'pc'), 'auto');
  const v = poserCamDispo(null, 'pc', '3');
  assert.deepEqual(v, { pc: '3' }, 'seul le format retouche est ecrit');
  assert.equal(colonnesCam(v, 'pc'), 3);
  assert.equal(colonnesCam(v, 'mobile'), 1, 'le telephone n’a pas bouge');
  // Revenir a l'automatique EFFACE l'entree ; le dernier format efface la cle.
  assert.equal(poserCamDispo(v, 'pc', 'auto'), null);
  assert.deepEqual(poserCamDispo({ pc: '3', mobile: '2' }, 'pc', 'auto'), { mobile: '2' });
});

test('un format ne propose que ce qu’il peut montrer', () => {
  assert.deepEqual(camDisposDe('pc'), ['auto', '1', '2', '3', '4']);
  assert.deepEqual(camDisposDe('tablette'), ['auto', '1', '2', '3']);
  assert.deepEqual(camDisposDe('mobile'), ['auto', '1', '2'], 'quatre vignettes de front sur un telephone ne montrent rien');
});

test('le CSS du telephone ne force plus les grilles de cameras', () => {
  const uneColonne = css.split(NL).find(l => l.includes('.grid-rappels, .grid-scenes') && l.includes('grid-template-columns: 1fr !important'));
  assert.ok(uneColonne, 'la liste « une colonne » du media mobile existe');
  assert.ok(!uneColonne.includes('.grid-cams') && !uneColonne.includes('.grid-sec-cams'), 'un !important rendrait le reglage sans effet');
  assert.ok(!css.includes('.grid-cams, .grid-sec-cams { grid-template-columns: 1fr 1fr'), 'plus de grille de deux en dur');
  assert.ok(!css.includes('.grid-cams .o-campied'), 'plus de tuile resserree');
});

test('les deux vues posent leurs colonnes depuis le reglage', () => {
  assert.ok(src.includes('gridTemplateColumns: `repeat(${colonnesCam(camDispo, formatGrille)},minmax(0,1fr))`'), 'la section Cameras de l’Accueil');
  assert.ok(src.includes('gridTemplateColumns: `repeat(${colonnesCam(camDispo, formatCam)},minmax(0,1fr))`'), 'les cameras en direct de la vue Securite');
  // Le menu passe par ListeChoix, comme tous les autres (jamais de <select>).
  assert.ok(src.includes('<ListeChoix value={courant} options={options} onChange={onChoisir} label={tr(\'Caméras par ligne\')}'), 'le menu est un ListeChoix');
  // Une seule camera : il n'y a rien a disposer.
  assert.equal(src.split('cams.length > 1 && <ChoixCamDispo').length, 3, 'le choix n’apparait qu’a partir de deux cameras, des deux cotes');
  assert.ok(src.includes('cfgSet({ loggia_camdispo: n })'), 'le reglage vit dans la maison');
});

test('toute la tuile agrandit : le clic ne vise plus un bouton de 36 px', () => {
  // Retour du 20/09 : « un clic pourrait la zoomer, l'afficher en plus gros ».
  assert.ok(src.includes("aria-label={tr('Agrandir') + ' ' + (c.label || '')}"), 'la tuile 16/9 porte le bouton, en entier');
  assert.ok(src.includes("aria-label={tr('Agrandir') + ' ' + nom}"), 'la carte camera 1×1 aussi');
  // Le ⤢ du coin n'est plus qu'un repere : deux boutons l'un sur l'autre
  // donneraient deux cibles pour un seul geste.
  assert.ok(!src.includes("<button aria-label={tr('Agrandir')} onClick={() => setGrand(true)}"), 'plus de petit bouton concurrent');
});
