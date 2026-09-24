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
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const WF = lire('.github', 'workflows', 'validate.yml');

test('les travaux de validation n’ont que le droit de lire le dépôt', () => {
  assert.match(WF, /^permissions:\n  contents: read\n/m, 'le bloc des droits a disparu, ou donne plus que la lecture');
  // Au niveau du workflow, avant `jobs:` : il couvre tous les travaux, y compris
  // ceux qu'on ajoutera.
  assert.ok(WF.indexOf('\npermissions:') >= 0 && WF.indexOf('\npermissions:') < WF.indexOf('\njobs:'), 'le bloc doit couvrir tous les travaux');
  assert.doesNotMatch(WF, /write/, 'un travail de validation reçoit un droit d’écriture');
});

// ── CodeQL en configuration avancée (« prépare la config CodeQL avancée pour
// exclure les assets », 19/09) : les quinze fausses alertes visaient three.js,
// minifié par le build dans frontend/assets. Seul ce dossier est écarté.

test('CodeQL avancé : le code tiers minifié du build est écarté, rien d’autre', () => {
  const cfg = lire('.github', 'codeql', 'codeql-config.yml');
  const ignores = cfg.split('paths-ignore:')[1].split('\n').filter(l => l.startsWith('  - '));
  assert.deepEqual(ignores, ['  - custom_components/loggia/frontend/assets'], 'le code source doit rester analysé en entier');
  assert.doesNotMatch(cfg, /^paths:/m, 'une liste `paths` restreindrait l’analyse à quelques dossiers');
});

test('CodeQL avancé : les mêmes langages et catégories que la configuration par défaut', () => {
  const wf = lire('.github', 'workflows', 'codeql.yml');
  assert.ok(wf.includes('config-file: ./.github/codeql/codeql-config.yml'), 'le workflow ne lit pas la configuration');
  assert.ok(wf.includes('language: [actions, javascript-typescript, python]'), 'un langage de la configuration par défaut manque');
  // Les catégories de la configuration par défaut : les alertes gardent leur historique.
  assert.ok(wf.includes('category: "/language:${{ matrix.language }}"'));
  /* Les deux etapes, sur la majeure 4. La reference est epinglee par SHA
   * depuis le 24/09 (plan M15) : on vise donc le chemin de l'action et la
   * version que le commentaire porte, pas le tag — qui n'existe plus ici.
   * Que le SHA SOIT la est verifie par `workflows_epingles.test.mjs`. */
  for (const etape of ['init', 'analyze']) {
    assert.match(wf, new RegExp('github/codeql-action/' + etape + '@[0-9a-f]{40} # v4\\.'),
      'l’etape ' + etape + ' de CodeQL v4 a change de forme');
  }
  // Le moins de droits possible : lire, et écrire les résultats dans Security.
  assert.match(wf, /^permissions:\n  contents: read\n/m);
  assert.equal((wf.match(/: write/g) || []).length, 1, 'un droit d’écriture de trop');
  assert.ok(wf.includes('security-events: write'));
});
