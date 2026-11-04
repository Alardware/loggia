// ─────────────────────────────────────────────────────────────────────────────
// Le README anglais dit la même chose que le français, et rien de plus (04/11).
//
// `README.md` est en anglais : c'est lui que GitHub et HACS montrent à tout le
// monde. `README.fr.md` garde le français, que `readme_vrai.test.mjs` tient
// contre le code. Ce test tient l'anglais contre le même code — et contre
// l'interface : un libellé cité doit être celui que l'écran affiche en anglais.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const EN = lire('README.md');
const FR = lire('README.fr.md');

const MOTS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two'];

test('les deux README se citent l’un l’autre, en tête', () => {
  assert.ok(EN.slice(0, 900).includes('[README.fr.md](README.fr.md)'), 'le README anglais ne mène plus au français');
  assert.ok(FR.slice(0, 900).includes('[README.md](README.md)'), 'le README français ne mène plus à l’anglais');
});

test('le nombre de commandes réservées aux administrateurs, en anglais aussi', () => {
  const py = lire('tests', 'python', 'test_websocket_api.py');
  const bloc = py.slice(py.indexOf('ADMIN_SEULEMENT = ['));
  const n = (bloc.slice(0, bloc.indexOf(']')).match(/"WS_[A-Z_]+"/g) || []).length;
  const m = EN.match(/on the ([a-z-]+) WebSocket commands/);
  assert.ok(m, 'le README anglais ne dit plus combien de commandes sont réservées');
  assert.equal(m[1], MOTS[n] || String(n), `le README anglais annonce « ${m[1]} », il y en a ${n}`);
});

test('les mêmes promesses que le français', () => {
  assert.match(EN, /access token is only read \*\*for images\*\*/);
  assert.match(EN, /device TYPE that decides, never the width/);
  assert.match(EN, /a \*\*pet feeder\*\*/);
  assert.match(EN, /the \*\*consumable sensors\*\*/);
  assert.match(EN, /\*\*guest mode\*\*/);
  const debut = EN.indexOf('- a **pet feeder**');
  const ligne = EN.slice(debut, EN.indexOf('\n- ', debut + 3)).replace(/\s+/g, ' ');
  const ordre = ["**device's own schedule**", '**automations**', '**Loggia schedule**'].map(m => ligne.indexOf(m));
  assert.ok(ordre.every(i => i >= 0) && ordre[0] < ordre[1] && ordre[1] < ordre[2], 'les trois sources du distributeur, dans l’ordre du serveur : ' + ligne);
  assert.match(ligne, /never by their name/);
  assert.match(ligne, /if Loggia knows how to command it/);
});

test('chaque README montre l’image de tête dans sa langue', () => {
  // Le 04/11 : la même composition, l'interface en anglais (captures de la démo, ?lang=en).
  assert.ok(EN.includes('](docs/loggia-presentation-en.webp)'), 'le README anglais ne montre plus l’image anglaise');
  assert.ok(FR.includes('](docs/loggia-presentation.webp)'), 'le README français ne montre plus l’image française');
  for (const f of ['loggia-presentation-en.webp', 'loggia-presentation.webp']) assert.ok(readFileSync(join(RACINE, 'docs', f)).length > 50000, f);
});

test('la démo, une seule fois, dans « Try it without installing anything »', () => {
  assert.ok(EN.includes('**[The live demo](https://alardware.github.io/loggia/)**'));
  assert.equal(EN.split('alardware.github.io/loggia').length - 1, 1, 'le lien de la démo, une seule fois');
  assert.ok(EN.includes('## Try it without installing anything'));
  assert.ok(!EN.includes('docs/captures/'), 'pas de captures par appareil');
});

test('chaque libellé d’interface cité est celui que l’écran affiche en anglais', () => {
  const en = lire('src', 'langues', 'en.js');
  for (const l of ['Keep an eye on it', 'Entities of this view', 'Edit mode', 'Rules', 'Watches', 'Presence', 'Profiles',
    'Diagnostics', 'A new version of Loggia is installed.', 'Reload', 'No code has been set yet', 'Meals', 'History', 'Maintenance']) {
    assert.ok(EN.includes(l), `« ${l} » n’est plus cité : retire-le de cette liste`);
    assert.ok(en.includes(`: '${l}',`), `« ${l} » n’est pas un libellé de l’interface anglaise`);
  }
});
