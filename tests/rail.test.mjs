// ─────────────────────────────────────────────────────────────────────────────
// Ce que le rail pilote, `useHass` le surveille-t-il ?
//
// `useHass` ne re-rend PAS sur n'importe quel changement : il compare la
// signature des seules clés qu'on lui a désignées. Un composant qui appelle un
// service et lit ensuite `hass.states[id]` fonctionne donc à moitié — il
// affiche le premier changement (son propre `setState` le fait relire) puis
// se fige sur l'état transitoire, parce que plus rien ne le réveille.
//
// C'est arrivé à la glissière de la serrure : « Ouverture… » restait à l'écran
// alors que la porte était ouverte depuis longtemps. Rien ne le disait — pas
// d'erreur, pas de log, une interface simplement mensongère. Le domaine
// `lock.` manquait dans `GLOBAL_KEYS`.
//
// Le rail est le seul endroit où l'on commande sans ouvrir une vue : ses
// domaines doivent tous y figurer.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Le bloc `const GLOBAL_KEYS = [ ... ];`, tel qu'écrit. */
function globalKeys() {
  const i = src.indexOf('const GLOBAL_KEYS = [');
  assert.notEqual(i, -1, 'GLOBAL_KEYS a disparu ou changé de nom');
  const fin = src.indexOf('].filter(', i);
  assert.notEqual(fin, -1, 'fin de GLOBAL_KEYS introuvable');
  return src.slice(i, fin);
}

test('les domaines commandés depuis le rail sont surveillés', () => {
  const keys = globalKeys();
  // Un service appelé depuis le rail sur un domaine absent d'ici = interface
  // figée sur l'état transitoire (`locking`, `arming`…).
  for (const dom of ['alarm_control_panel.', 'lock.']) {
    assert.ok(keys.includes(`'${dom}'`), `${dom} absent de GLOBAL_KEYS`);
  }
});

test('la glissière de la serrure demande le geste entier', () => {
  // Une porte d'entrée ne s'ouvre pas d'un doigt qui dérape : le seuil existe,
  // et il est haut. S'il tombait à zéro, un simple clic ouvrirait la maison.
  const i = src.indexOf('function RailSerrure(');
  assert.notEqual(i, -1, 'RailSerrure introuvable');
  const corps = src.slice(i, src.indexOf('\nfunction ', i + 10));
  const seuil = corps.match(/v\s*>=\s*(0\.\d+)/);
  assert.ok(seuil, 'le seuil de validation a disparu');
  assert.ok(parseFloat(seuil[1]) >= 0.8, `seuil trop bas : ${seuil[1]}`);
  // Et le geste doit être continu : sans capture du pointeur, sortir de la
  // piste en glissant abandonne le geste au milieu.
  assert.ok(corps.includes('setPointerCapture'), 'le pointeur n’est pas capturé');
});

test('la serrure de l’entrée est préférée aux autres', () => {
  const i = src.indexOf('function serrureRailId(');
  assert.notEqual(i, -1, 'serrureRailId introuvable');
  const corps = src.slice(i, src.indexOf('\nfunction ', i + 10));
  // Le nom tranche quand une maison a plusieurs serrures ; sans ce filtre, le
  // rail proposerait au hasard celle du garage ou du portail.
  assert.match(corps, /porte/, 'le nom de l’entrée n’est plus reconnu');
  assert.match(corps, /friendly_name/, 'seul l’id est lu, pas le nom affiché');
});
