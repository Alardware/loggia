// ─────────────────────────────────────────────────────────────────────────────
// Le scan de sécurité de GitHub (CodeQL), au propre.
//
// Retour du 19/09 (« sur GitHub, niveau sécurité ? ») : CodeQL relevait cinq
// travaux de validation sans bloc `permissions` — chacun recevait les droits
// par défaut du jeton, alors qu'aucun ne publie rien. Voir l'ADR 0056.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = readFileSync(join(RACINE, '.github', 'workflows', 'validate.yml'), 'utf8').replace(/\r\n/g, '\n');

test('les travaux de validation n’ont que le droit de lire le dépôt', () => {
  assert.match(WF, /^permissions:\n  contents: read\n/m, 'le bloc des droits a disparu, ou donne plus que la lecture');
  // Au niveau du workflow, avant `jobs:` : il couvre tous les travaux, y compris
  // ceux qu'on ajoutera.
  assert.ok(WF.indexOf('\npermissions:') >= 0 && WF.indexOf('\npermissions:') < WF.indexOf('\njobs:'), 'le bloc doit couvrir tous les travaux');
  assert.doesNotMatch(WF, /write/, 'un travail de validation reçoit un droit d’écriture');
});
