// ─────────────────────────────────────────────────────────────────────────────
// La fiche des robots : aspirateur et tondeuse.
//
// Les deux partagent un composant. Ce qui les sépare n'est pas leur nature
// mais ce qu'ils SAVENT dire : une tondeuse n'a pas de vitesse d'aspiration,
// certains robots ne publient pas leur batterie. Rien ne doit être inventé
// pour combler — un cadran vide vaut moins qu'un cadran absent.
//
// L'autre règle est celle de la couleur : elle dit l'ÉTAT, pas le niveau. Un
// robot qui travaille est vert même à 30 % ; une batterie à plat est rouge
// même sur sa base. L'inverse ferait clignoter l'alarme d'un robot qui va
// très bien, et rassurerait sur un robot qui ne repartira pas.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Le corps d'une fonction nommée, jusqu'à la suivante. */
function corps(entete) {
  const i = src.indexOf(entete);
  assert.notEqual(i, -1, `${entete} introuvable`);
  const fin = src.indexOf('\nfunction ', i + entete.length);
  assert.notEqual(fin, -1, `fin de ${entete} introuvable`);
  return src.slice(i, fin);
}

test('rien ne s’affiche de ce que le robot ne dit pas', () => {
  const c = corps('function FicheMachineHero(');
  // Sans batterie publiée, pas de cadran : une couronne à zéro se lirait
  // comme un robot vide, ce qui serait faux.
  assert.match(c, /\{bat != null && \(?\s*<CadranGradue/,
    'le cadran s’affiche même sans batterie connue');
  // Une tondeuse n'a pas de fan_speed_list : la rangée ne doit pas apparaître.
  assert.match(c, /vitesses\.length > 1/, 'la rangée de vitesses n’est plus conditionnée');
  assert.match(c, /dom === 'vacuum' && Array\.isArray\(a\.fan_speed_list\)/,
    'les vitesses ne sont plus réservées aux aspirateurs');
});

test('la couleur du cadran dit l’état, pas le niveau', () => {
  const c = corps('function FicheMachineHero(');
  const i = c.indexOf('const colDial =');
  assert.notEqual(i, -1, 'colDial a disparu');
  const regle = c.slice(i, c.indexOf(';', i));
  // L'erreur et la batterie à plat passent AVANT l'activité : un robot qui
  // travaille avec 8 % doit alerter, pas afficher un vert rassurant.
  //
  // La présence se vérifie SÉPARÉMENT de l'ordre : `indexOf` d'un motif absent
  // rend -1, et -1 précède tout — une règle supprimée passerait pour une règle
  // bien placée.
  const rang = (motif, quoi) => {
    const i = regle.indexOf(motif);
    assert.notEqual(i, -1, `la règle « ${quoi} » a disparu de colDial`);
    return i;
  };
  const activite = rang('en ?', 'robot en marche');
  assert.ok(rang("'error'", 'panne') < activite, 'l’erreur ne passe plus avant l’activité');
  assert.ok(rang('bat < 20', 'batterie à plat') < activite,
    'la batterie à plat ne passe plus avant l’activité');
  for (const [quoi, jeton] of [['tonte/nettoyage', 'o-ok'], ['retour', 'o-warn'], ['panne', 'o-bad']]) {
    assert.ok(regle.includes(jeton), `l’état « ${quoi} » n’a plus sa couleur (${jeton})`);
  }
});

test('le cadran gradué reste lisible sur le fond translucide de la fiche', () => {
  const c = corps('function CadranGradue(');
  // Mesuré : `--o-accent` tombe à 2,36:1 sur le fond de la feuille en thème
  // clair — sous le seuil de 3:1 des éléments graphiques. `--o-accent-soft`
  // y tient à 3,79:1, et à 7,5:1 en sombre.
  const dial = corps('function FicheMachineHero(');
  assert.ok(!/: 'var\(--o-accent\)';/.test(dial),
    'le cadran repasse sur --o-accent, illisible en thème clair');
  // Les traits éteints ne portent aucune information : ils n'ont pas de seuil,
  // mais ils doivent rester distincts des allumés.
  assert.match(c, /on \? couleur : 'var\(--o-bd1\)'/, 'les traits éteints ont changé de rôle');
});

test('les commandes restent au doigt', () => {
  const c = corps('function FicheMachineHero(');
  // 44 px : le minimum d'Apple HIG, déjà tenu par les boutons ronds. Les
  // chips de vitesse mesurent 54 px de haut à l'écran ; ce test garde le
  // rembourrage qui les y porte.
  assert.match(c, /width: 44, height: 44/, 'les boutons ronds ont perdu leur taille de cible');
  assert.match(c, /padding: '9px 4px 8px'/, 'les chips de vitesse ont maigri sous la cible tactile');
});
