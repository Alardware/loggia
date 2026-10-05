// Le gabarit de la carte PIÈCE compacte, étendu à toutes les compactes (05/10).
//
// « je te demande de faire comme la carte pieces compacte, il y a pas a
// chercher » : l'icône et la commande en haut, le nom et son détail dessous,
// sur toute la largeur. Au téléphone, le nom du distributeur avait 19 px.
//
// Ce qui se mesure (largeurs, hauteurs) l'a été dans le navigateur ; ce qui
// s'épingle ici, ce sont les décisions qui le tiennent — et surtout les STYLES
// EN LIGNE qu'il a fallu retirer, parce qu'un style en ligne bat toute règle de
// feuille et que la règle restait sans effet tant qu'ils étaient là.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const CSS = lire('src', 'index.css');
const APP = lire('src', 'App.jsx');
const compter = (t, m) => t.split(m).length - 1;

test('deux rangées : l’icône et la commande en haut, le texte sur toute la largeur', () => {
  assert.ok(CSS.includes('.o-cvdense > .o-cvrow { flex-wrap: wrap; row-gap: 4px; }'),
    'la rangée ne passe plus à la ligne : le nom retombe à quelques dizaines de pixels');
  assert.ok(CSS.includes('.o-cvdense > .o-cvrow > .o-cvtxt { order: 9; flex: 1 0 100%; min-width: 100%; line-height: 1.15; }'),
    '`order` met le texte après ses voisins, `flex-basis: 100%` le renvoie à la ligne');
});

test('SANS SEUIL, comme la carte de pièce : aucune largeur où une ligne en dise plus', () => {
  /* Premier essai : la règle vivait sous les 200 px du geste. Une carte de
   * 240 px montrait alors MOINS qu'une de 176 — 86 px de texte contre 148 —
   * parce qu'au-dessus du seuil la ligne unique revenait et que l'icône, la
   * valeur et le bouton reprenaient leurs 126 px. */
  const i = CSS.indexOf('.o-cvdense > .o-cvrow { flex-wrap: wrap;');
  assert.ok(i > 0, 'la règle du gabarit a disparu');
  // Aucune accolade ouverte au-dessus : la règle est au premier niveau. Les
  // commentaires s'en vont d'abord — l'un d'eux pourrait en contenir une.
  const avant = CSS.slice(0, i).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(compter(avant, '{'), compter(avant, '}'),
    'le gabarit est retombé dans une requête de conteneur : il lui faut toutes les largeurs');
});

test('seule l’ICÔNE est poussée — pas les commandes entre elles', () => {
  /* `justify-content: space-between` les répartissait sur toute la ligne : les
   * deux flèches du volet se retrouvaient aux deux bouts de la carte, « bien
   * trop espacé », et la vitesse du robot loin de son bouton. */
  assert.ok(CSS.includes('.o-cvdense > .o-cvrow > :first-child { margin-right: auto; }'),
    'sans cette marge, les commandes se collent à l’icône');
  const regle = CSS.slice(CSS.indexOf('.o-cvdense > .o-cvrow {'));
  assert.ok(!regle.slice(0, regle.indexOf('}')).includes('space-between'),
    'space-between est revenu : il écarte les commandes les unes des autres');
});

test('rien de ce que la feuille doit régler ne reste EN LIGNE', () => {
  /* Le cœur de l'affaire : la règle était écrite, juste, et sans effet. */
  assert.equal(compter(APP, '<div className="o-cvtxt">'), 4,
    'le bloc de texte reprend un style en ligne : `flex: 1 0 100%` ne pourra plus gagner');
  assert.ok(!APP.includes('className="o-cvtxt" style='), 'aucun style en ligne sur le texte');
  assert.ok(CSS.includes('.o-cvtxt { flex: 1; min-width: 0; }'), 'le flex du texte vit dans la feuille');

  assert.equal(compter(APP, `<div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>`), 4,
    'une rangée a repris un `gap` en ligne : la feuille ne pourra plus le resserrer');
  assert.ok(CSS.includes('.o-cvrow { gap: 8px; }'), 'l’écart des rangées vit dans la feuille');
  assert.ok(CSS.includes('.o-cvcarte.o-cvdense > .o-cvrow { gap: 9px; row-gap: 4px; }'),
    'sans `row-gap`, le `gap` de 9 px rouvre les 88 px de la compacte');

  // L'icône : deux cartes la posent en clair, la plante la passe à `portrait`.
  assert.equal(compter(APP, '<span className="o-cvico"'), 2);
  assert.ok(APP.includes("{portrait(34, 'o-cvico')}"), 'la plante passe sa classe au lieu de sa taille');
  assert.ok(!/className="o-cvico" style=\{\{ (width|height)/.test(APP), 'aucune taille en ligne sur l’icône');
  assert.ok(CSS.includes('.o-cvdense .o-cvpastille, .o-cvico { width: 26px; height: 26px; border-radius: 9px; }'),
    '34 px de pastille + 4 d’écart + le texte débordaient des 88 px de la compacte');
});

test('la pastille tient son `display` de la feuille, pas de la ligne', () => {
  /* En ligne, il empêchait toute règle de l'escamoter — et c'est par là qu'on
   * a d'abord cru pouvoir faire de la place au thermostat. */
  assert.ok(APP.includes('<span className="o-cvpastille" style={{ background:'),
    'le `display` est revenu en ligne sur la pastille');
  assert.ok(CSS.includes('.o-cvpastille { width: 40px; height: 40px; border-radius: 12px; display: flex;'),
    'la pastille perd sa mise en forme de base');
});

test('le thermostat garde SON ICÔNE : c’est le groupe de consigne qui se resserre', () => {
  /* « pour le thermostat il y a aucun changement » — une règle masquait son
   * nom sous 270 px et avait survécu au gabarit. Puis « il manque l'icône »,
   * quand je l'ai inversée en escamotant l'icône. Ni l'un ni l'autre : le
   * groupe. Mesuré : à 38 px de bouton et 8 d'écart il demande 126 px là où il
   * en reste 113 ; à 30 et 4, il en prend 102 — et 113 avec une consigne à
   * trois chiffres (« 101,5° »), soit PILE la place disponible. */
  assert.ok(APP.includes('const miniClim = { ...mini, width: 30 };'),
    'la largeur du bouton de consigne a changé : remesurer (113 px disponibles au téléphone)');
  assert.ok(APP.includes("<span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>"),
    'l’écart du groupe de consigne est remonté : le « + » retombe à la ligne');
  assert.equal(compter(APP, 'style={miniClim}'), 2, '− et + portent la largeur resserrée');
  // La classe du climat ne portait plus aucune règle : elle est partie avec.
  assert.equal(compter(APP, 'o-cvclim') + compter(CSS, 'o-cvclim'), 0,
    'une classe sans règle est revenue');
});
