/* Ce qu'il y a au bout d'une prise (26/09).
 *
 * « Modifie les cartes prises avec celles-ci, et de façon à ce que l'appareil
 * soit bien reconnu pour afficher la bonne carte. »
 *
 * La reconnaissance se joue sur le NOM — Home Assistant ne publie ni marque ni
 * modèle pour une prise commandée. Les pièges sont donc des pièges de mots :
 * « sèche-linge » contient « linge », « lave-vaisselle » contient « lave », et
 * les gens écrivent avec ou sans accents. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES_PRISE, NOMS_PRISE, typeDePrise, modePrise, motDuMode, animationPrise, couleurPrise, libelleType } from '../src/prises.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('l’appareil se reconnaît à son nom, pièges compris', () => {
  assert.equal(typeDePrise('Prise Lave-vaisselle'), 'lv');
  assert.equal(typeDePrise('Prise lave vaisselle cuisine'), 'lv');
  // Le piege : « seche-linge » contient « linge ».
  assert.equal(typeDePrise('Sèche-linge'), 'sl', 'un sèche-linge n’est pas un lave-linge');
  assert.equal(typeDePrise('Lave-linge buanderie'), 'll');
  assert.equal(typeDePrise('PRISE FRIGO'), 'frigo', 'la casse ne compte pas');
  assert.equal(typeDePrise('Réfrigérateur'), 'frigo');
  assert.equal(typeDePrise('refrigerateur'), 'frigo', 'les accents non plus');
  assert.equal(typeDePrise('Prise NAS'), 'nas');
  assert.equal(typeDePrise('Cafetière cuisine'), 'cafe');
  assert.equal(typeDePrise('Borne de recharge garage'), 've');
  assert.equal(typeDePrise('Box fibre'), 'box');
  assert.equal(typeDePrise('Radiateur bureau'), 'radia');
  assert.equal(typeDePrise('Sirène extérieure'), 'siren');
});

test('ce qu’on ne reconnaît pas reste une prise, et un choix explicite prime', () => {
  assert.equal(typeDePrise('Prise Séjour'), 'prise', 'rien n’est inventé');
  assert.equal(typeDePrise(''), 'prise');
  assert.equal(typeDePrise(null), 'prise');
  assert.equal(typeDePrise('Prise Séjour', 'cafe'), 'cafe', 'le choix passe devant le nom');
  assert.equal(typeDePrise('Prise Séjour', 'inconnu'), 'prise', 'un type qui n’existe pas est ignoré');
});

test('un mot court ne se cache plus dans un autre', () => {
  /* Le defaut vu par Seba882 (issue #6, 29/09) a propos du fer : « `iron` est
   * un mot court qui se cache dans d'autres, alors que les autres entrees de
   * `MOTS_PRISE` se contentent d'un `indexOf` ». C'etait vrai, et ca valait
   * pour d'autres : `environnement` contient `iron`, `boxe` contient `box`,
   * `television` contient `tele`. La recherche compare des mots entiers. */
  assert.equal(typeDePrise('Prise environnement bureau'), 'prise', '« environnement » contient « iron »');
  assert.equal(typeDePrise('Salle de boxe'), 'prise', '« boxe » contient « box »');
  assert.equal(typeDePrise('Prise telephone'), 'prise', '« telephone » contient « tele »');
  assert.equal(typeDePrise('Prise pcb atelier'), 'prise', '« pcb » contient « pc »');
  // Et les sigles marchent sans qu'on doive les entourer d'espaces a la main.
  assert.equal(typeDePrise('Prise LV'), 'lv');
  assert.equal(typeDePrise('Prise 3', null, 'switch.ll_buanderie'), 'll');
});

test('le fer a repasser, et sa veille qui compte', () => {
  // « Un fer ne consomme rien ou tire 2 000 W, il n'y a pas d'entre-deux. »
  assert.equal(typeDePrise('Fer à repasser'), 'fer');
  assert.equal(typeDePrise('Prise fer'), 'fer');
  assert.equal(typeDePrise('Iron'), 'fer');
  assert.equal(typeDePrise('Centrale vapeur'), 'fer');
  assert.equal(typeDePrise('Prise 2', null, 'switch.repassage'), 'fer');
  assert.equal(motDuMode('fer', 'marche'), 'Chauffe');
  assert.equal(motDuMode('fer', 'veille'), 'En veille');
  assert.equal(NOMS_PRISE().fer, 'Fer à repasser');
  assert.equal(TYPES_PRISE.fer.ico, 'iron');
});

test('l’identifiant compte quand le nom ne dit rien', () => {
  // Une prise peut s'appeler « Prise 3 » et s'appeler `switch.lave_vaisselle`
  // dessous : c'est le cas signale le 26/09.
  assert.equal(typeDePrise('Prise 3'), 'prise', 'le nom seul ne dit rien');
  assert.equal(typeDePrise('Prise 3', null, 'switch.lave_vaisselle'), 'lv', 'l’identifiant, lui, le dit');
  assert.equal(typeDePrise('Prise cuisine', null, 'switch.seche_linge'), 'sl');
  assert.equal(typeDePrise('Prise LV'), 'lv', 'le sigle, s’il est un mot a lui');
  assert.equal(typeDePrise('Prise salon'), 'prise', 'un sigle noye dans un mot ne compte pas');
});

test('« allumée » ne veut rien dire seule : veille, marche, ou on ne sait pas', () => {
  assert.equal(modePrise(false, 0), 'eteinte');
  assert.equal(modePrise(false, 1200), 'eteinte', 'coupée, la puissance ne compte pas');
  assert.equal(modePrise(true, null), 'inconnu', 'sans capteur, on ne tranche pas');
  assert.equal(modePrise(true, NaN), 'inconnu');
  assert.equal(modePrise(true, 0), 'veille');
  assert.equal(modePrise(true, 2.9), 'veille');
  assert.equal(modePrise(true, 3), 'marche', 'le seuil compte pour la marche');
  assert.equal(modePrise(true, 2050), 'marche');
});

test('chaque appareil a ses mots quand il en a', () => {
  assert.equal(motDuMode('frigo', 'marche'), 'Compresseur');
  assert.equal(motDuMode('frigo', 'veille'), 'Au repos');
  assert.equal(motDuMode('ve', 'veille'), 'Branchée');
  assert.equal(motDuMode('ve', 'marche'), 'Charge');
  assert.equal(motDuMode('cafe', 'marche'), 'Chauffe');
  assert.equal(motDuMode('nas', 'marche'), 'En marche', 'sans mot à lui, le mot commun');
  assert.equal(motDuMode('nas', 'veille'), 'En veille');
  assert.equal(motDuMode('prise', 'eteinte'), 'Éteinte');
  assert.equal(motDuMode('prise', 'inconnu'), 'Allumée', 'faute de mesure, le mot d’avant');
  assert.equal(motDuMode('type-inconnu', 'marche'), 'En marche', 'un type inconnu ne casse rien');
});

test('rien ne bouge tant que l’appareil ne travaille pas', () => {
  /* Depuis les icones dessinees (26/09), un appareil porte son mouvement DANS
   * son trace : le lave-linge n'a plus besoin d'une animation posee autour de
   * lui, la carte le fige tant qu'il ne travaille pas. `fx` ne sert donc plus
   * qu'aux types rendus par la FONTE, qui, eux, ne bougent pas tout seuls. */
  assert.equal(animationPrise('siren', 'marche'), 'shake');
  assert.equal(animationPrise('siren', 'veille'), null);
  assert.equal(animationPrise('siren', 'eteinte'), null);
  assert.equal(animationPrise('ve', 'marche'), 'bob');
  assert.equal(animationPrise('ve', 'inconnu'), null, 'sans mesure, aucune animation');
  /* RIEN ne s'allume DERRIERE une icone. Il y avait la une lueur qui respirait
   * (`glow`) et deux temoins qui clignotaient (`leds`) : ils venaient de la
   * premiere maquette, avant que les appareils ne soient dessines. « Derriere
   * l'icone il y a un pulse lumineux, j'en veux pas » (26/09). */
  assert.equal(animationPrise('nas', 'marche'), null, 'le NAS rallume des temoins derriere son glyphe');
  assert.equal(animationPrise('pc', 'marche'), null, 'l’ordinateur rallume sa lueur');
  assert.equal(animationPrise('ll', 'marche'), null, 'le lave-linge s’anime par son dessin, pas par une classe');
  assert.equal(animationPrise('prise', 'marche'), null, 'une prise ordinaire ne s’agite pas');
});

test('l’étiquette ne répète pas ce que le nom dit déjà', () => {
  const noms = NOMS_PRISE();
  assert.equal(libelleType('radia', 'Radiateur chambre', noms), null, '« RADIATEUR » au-dessus de « Radiateur chambre » : deux fois le même mot');
  assert.equal(libelleType('radia', 'Prise chambre', noms), 'Radiateur', 'là, elle apprend quelque chose');
  assert.equal(libelleType('frigo', 'FRIGO cuisine', noms), 'Réfrigérateur', 'le surnom ne vaut pas le nom de l’appareil');
  assert.equal(libelleType('prise', 'Prise séjour', noms), null, '« PRISE » au-dessus d’une prise n’apprend rien');
  assert.equal(libelleType(null, 'Prise séjour', noms), null);
  assert.equal(libelleType('radia', 'Prise chambre', null), null, 'sans table de noms, rien ne s’invente');
});

test('la couleur vive est réservée au travail', () => {
  assert.equal(couleurPrise('frigo', 'marche'), 'var(--o-cold)');
  assert.equal(couleurPrise('frigo', 'veille'), 'var(--o-text1)', 'en veille, sobre — sinon veille et marche se ressemblent');
  assert.equal(couleurPrise('frigo', 'eteinte'), 'var(--o-text3)');
  assert.equal(couleurPrise('type-inconnu', 'marche'), 'var(--o-accent-soft)');
});

test('la table : des jetons, des glyphes qui existent, et un nom pour chacun', () => {
  const noms = NOMS_PRISE();
  const css = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');
  const maison = readFileSync(join(RACINE, 'src', 'icones.jsx'), 'utf8');
  const dessins = readFileSync(join(RACINE, 'src', 'dessins.js'), 'utf8');
  for (const [id, t] of Object.entries(TYPES_PRISE)) {
    assert.match(t.col, /^var\(--o-[a-z0-9-]+\)$/, id + ' : une couleur en dur');
    assert.match(t.rgb, /^var\(--o-[a-z0-9-]+-rgb\)$/, id + ' : le rgb doit aller avec la couleur');
    assert.equal(t.rgb, t.col.replace(')', '-rgb)'), id + ' : la couleur et son rgb ne vont pas ensemble');
    /* Trois sources possibles, dans l'ordre ou `Ico` les lit : l'appareil
     * DESSINE (`dessins.js`), le trace maison (`icones.jsx`), le glyphe de la
     * fonte. L'electromenager n'existe dans aucune fonte — d'ou les dessins. */
    if (t.ico) assert.ok(dessins.includes("\n  '" + t.ico + "':") || maison.includes('\n  ' + t.ico + ':') || css.includes('fi-rr-' + t.ico + ':'),
      id + ' : le glyphe ' + t.ico + ' n’existe ni en dessin, ni en trace maison, ni dans la fonte');
    assert.ok(noms[id], id + ' n’a pas de nom traduit');
  }
  assert.equal(TYPES_PRISE.prise.ico, null, 'la prise ordinaire garde le dessin de prise de Loggia');
});
