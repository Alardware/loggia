/* Ce qui ne va jamais dans le dépôt (28/10, ADR 0281).
 *
 * Les plans de chantier (`docs/chantier-*`) et les audits (`docs/audit-*`)
 * sont des notes de travail : ils nomment des pièces, des appareils, des
 * étapes abandonnées. La règle était dite, pas gardée — `docs/chantier-etages-
 * cartes-veille.md` est entré au commit de la v3.87.0 sans que rien ne le
 * signale. `.gitignore` les écarte désormais ; ce test refuse ceux qu'un
 * `git add -f` y ferait entrer quand même.
 *
 * Il lit l'INDEX (`git ls-files`), pas le disque : les notes vivent à côté du
 * code, ignorées. Une entrée de l'index dont le fichier a été retiré du disque
 * est déjà sur le départ (une suppression pas encore commitée) : elle ne
 * compte pas. Hors d'un dépôt git (une archive), il n'y a rien à garder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const INTERDITS = /^docs\/(chantier|audit)-/;

function indexGit() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

test('aucun plan de chantier ni audit dans l’index git', (t) => {
  const fichiers = indexGit();
  if (fichiers == null) { t.skip('pas de dépôt git ici'); return; }
  assert.ok(fichiers.length > 100, 'le balayage de l’index est cassé : ' + fichiers.length + ' fichiers');
  const fautifs = fichiers.filter(f => INTERDITS.test(f) && existsSync(join(RACINE, f)));
  assert.deepEqual(fautifs, [], 'une note de travail est entrée dans le dépôt : retire-la (git rm --cached) et garde-la à côté');
});

test('.gitignore écarte les plans de chantier et les audits', () => {
  const lignes = readFileSync(join(RACINE, '.gitignore'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  for (const motif of ['docs/chantier-*', 'docs/audit-*']) assert.ok(lignes.includes(motif), motif + ' manque à .gitignore');
});
