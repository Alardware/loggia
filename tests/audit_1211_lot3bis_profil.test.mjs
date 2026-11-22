// ─────────────────────────────────────────────────
// Supprimer un profil demande deux appuis (audit du 12/11, lot 3 bis).
//
// Le bouton « Supprimer » de la feuille d'un profil partait d'un seul appui :
// la feuille se fermait, le profil n'était plus là, et avec lui ses favoris,
// son menu et son thème — rien ne se rattrape. Le premier appui arme le
// bouton, qui passe au rouge plein et dit « Confirmer ? » ; le second
// supprime ; sans second appui, il se désarme seul au bout de 4 s.
//
// Ce que le retrait emporte, et ce que gardent les profils suivants :
// tests/audit_1211_lot3_profils.test.mjs.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAR = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
const debut = PAR.indexOf('function UserEditor(');
assert.ok(debut >= 0, 'UserEditor introuvable dans parametres.jsx');
const PROFIL = PAR.slice(debut, PAR.indexOf('\n}\n', debut) + 2);

test('le premier appui sur « Supprimer » arme le bouton, il ne supprime pas', () => {
  assert.ok(!PROFIL.includes('onClick={onDelete}'), 'la suppression d’un profil part de nouveau d’un seul appui');
  assert.ok(PROFIL.includes('onClick={() => { if (armeSuppr) onDelete(); else setArmeSuppr(true); }}'),
    'le bouton ne passe plus par l’armement avant de supprimer');
  // Une seule suppression dans la feuille : rien d'autre n'appelle onDelete.
  assert.equal(PROFIL.split('onDelete()').length - 1, 1, 'un autre geste de la feuille supprime le profil sans confirmation');
});

test('armé, le bouton le dit et le montre ; il se désarme seul', () => {
  assert.ok(PROFIL.includes("{armeSuppr ? tr('Confirmer ?') : tr('Supprimer')}"), 'armé, le bouton ne dit pas « Confirmer ? »');
  // Au repos, son dessin d'avant, que tests/etats.test.mjs épingle ; armé, le rouge plein par-dessus.
  assert.ok(PROFIL.includes("transition: 'background .2s, color .2s', ...(armeSuppr ? SUPPR_ARME : null) }}>"), 'armé, le bouton ne change pas de fond');
  // ASSERTION MODIFIÉE (14/11, audit des thèmes, M5) : le rouge qui porte du blanc est `--o-bad-fond` (4,7:1) — `--o-bad` n'y tenait que 3,3:1.
  assert.ok(PAR.includes("const SUPPR_ARME = { background: 'var(--o-bad-fond)', color: '#fff' };"), 'le rouge plein du bouton armé a changé');
  assert.ok(PROFIL.includes('const [armeSuppr, setArmeSuppr] = useState(false);'), 'la feuille s’ouvre avec un bouton déjà armé');
  assert.ok(PROFIL.includes('const t = setTimeout(() => setArmeSuppr(false), 4000); return () => clearTimeout(t);'),
    'un bouton armé le reste : un appui distrait, plus tard, supprimerait le profil');
});

test('« Confirmer ? » se lit dans les six autres langues', async () => {
  for (const code of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = (await import(pathToFileURL(join(RACINE, 'src', 'langues', code + '.js')).href)).default;
    assert.ok(typeof cat['Confirmer ?'] === 'string' && cat['Confirmer ?'].length > 0, code + ' : « Confirmer ? » n’est pas traduit');
    assert.ok(typeof cat['Supprimer'] === 'string' && cat['Supprimer'].length > 0, code + ' : « Supprimer » n’est pas traduit');
  }
});
