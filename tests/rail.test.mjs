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
// La glissiere de la serrure et son choix d'entree ont quitte l'Accueil avec
// le grand panneau (ADR 0035) : leurs tests avec.
