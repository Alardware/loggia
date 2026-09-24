// ─────────────────────────────────────────────────────────────────────────────
// Ce que la CI exécute est nommé par son COMMIT (24/09, plan M15).
//
// Une action référencée par `@v7` n'est pas une version : c'est un tag, et un
// tag se déplace. Qui prend le contrôle du dépôt d'une action déplace `v7` sur
// son propre commit, et chaque dépôt du monde exécute son code au prochain
// push — sans qu'aucun fichier ait changé nulle part.
//
// Un SHA ne se déplace pas. Chaque `uses:` en porte un, avec sa version en
// commentaire pour qu'il reste lisible par un humain.
//
// DEUX EXCEPTIONS, volontaires et documentées à leur ligne : `hassfest@master`
// et `hacs/action@main`. Home Assistant et HACS publient leurs règles de
// validation sur une branche et ne posent pas de tag ; les figer ferait passer
// une CI qui ne vérifie plus ce que la version courante exige.
//
// L'envers indispensable : un SHA épinglé ne se met plus à jour tout seul.
// `.github/dependabot.yml` le relève — sur les actions SEULEMENT, jamais sur
// npm, dont le bundle versionné demande une reconstruction qu'une PR
// automatique ne fait pas.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, '.github', 'workflows');

/* Les seules références qui ont le droit de ne pas porter de SHA. Y ajouter
 * une ligne est une DÉCISION : elle rouvre la porte pour cette action-là. */
const FLOTTANTES = new Set([
  'home-assistant/actions/hassfest@master',
  'hacs/action@main',
]);

const USES = /^\s*-?\s*uses:\s*(\S+)/gm;

const references = [];
for (const f of readdirSync(DOSSIER).filter(n => /\.ya?ml$/.test(n))) {
  const texte = readFileSync(join(DOSSIER, f), 'utf8');
  for (const m of texte.matchAll(USES)) references.push([f, m[1]]);
}

test('les workflows existent, et on en lit bien les appels', () => {
  // Sans ce garde-fou, une expression régulière cassée rendrait tout le reste
  // vert en ne trouvant rien.
  assert.ok(references.length >= 10, `seulement ${references.length} « uses: » trouvés : le balayage est cassé`);
});

test('chaque action est nommée par son commit, sauf les deux exceptions dites', () => {
  const molles = references
    .filter(([, ref]) => !FLOTTANTES.has(ref) && !/@[0-9a-f]{40}$/.test(ref))
    .map(([f, ref]) => `${f} → ${ref}`);
  assert.deepEqual(molles, [],
    'un tag peut être déplacé sur un autre commit sans que rien ne change ici : épingle le SHA, et mets la version en commentaire');
});

test('chaque SHA garde sa version en clair, à côté', () => {
  /* Un SHA seul est illisible : personne ne sait s'il est vieux de six jours
   * ou de six ans, ni ce que Dependabot proposera de monter. */
  const nues = [];
  for (const f of readdirSync(DOSSIER).filter(n => /\.ya?ml$/.test(n))) {
    const lignes = readFileSync(join(DOSSIER, f), 'utf8').split('\n');
    lignes.forEach((l, i) => {
      const m = l.match(/uses:\s*\S+@([0-9a-f]{40})/);
      if (m && !/#\s*v\d/.test(l)) nues.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(nues, [], 'ce SHA n’a pas sa version en commentaire');
});

test('les deux branches flottantes disent pourquoi, à leur ligne', () => {
  const v = readFileSync(join(DOSSIER, 'validate.yml'), 'utf8');
  for (const ref of FLOTTANTES) {
    const i = v.indexOf('uses: ' + ref);
    assert.ok(i > 0, ref + ' a disparu de validate.yml');
    // Le commentaire qui précède, dans les six lignes au-dessus.
    const avant = v.slice(0, i).split('\n').slice(-7).join('\n');
    assert.match(avant, /#/, ref + ' flotte sans que rien ne dise pourquoi');
  }
});

test('Dependabot surveille les actions, et RIEN d’autre', () => {
  const dep = readFileSync(join(RACINE, '.github', 'dependabot.yml'), 'utf8');
  const ecos = [...dep.matchAll(/^\s*-?\s*package-ecosystem:\s*"?([\w-]+)"?/gm)].map(m => m[1]);
  assert.deepEqual(ecos, ['github-actions'],
    'npm y ferait des PR qu’il faudrait reconstruire et repackager à la main : les alertes suffisent');
  assert.ok(/interval:\s*"?weekly"?/.test(dep), 'sans rythme, un SHA épinglé fige une version vulnérable pour toujours');
});
