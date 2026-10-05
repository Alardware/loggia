/* Relecture du lot 14 (audit du 03/10) : deux corrections sans test à elles.
 *
 * 1. Au réveil après plus de 30 s, le direct d'une caméra se renégocie ; la
 *    tuile restait vide le temps de la piste. Une vignette tient la place —
 *    seulement après une coupure par le regard, jamais au premier chargement.
 * 2. Pendant l'attente du premier tic du pont, la barre latérale disait
 *    « Connexion… » en haut, mais « Home Assistant · En ligne » en vert à
 *    quatre autres endroits, même Home Assistant injoignable. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

test('au réveil, une vignette tient la place du direct qui se renégocie', () => {
  const cam = lire('camera.jsx');
  const debut = cam.indexOf('export function CamLive(');
  const corps = cam.slice(debut, cam.indexOf('\n}\n', debut));
  assert.ok(corps.includes('const [reprise, setReprise] = useState(false);'), 'l’état de reprise');
  assert.ok(corps.includes('if (!regardee) { setReprise(true); return; }'), 'coupé par le regard : la reprise est notée');
  assert.ok(corps.includes("{mode === 'loading' && reprise && <HaImage "), 'pendant la renégociation, la tuile restait vide');
  assert.ok(!corps.includes("{mode === 'loading' && <HaImage "), 'une vignette au PREMIER chargement changerait l’écran d’avant le lot');
});

test('la barre latérale dit « Connexion… » partout pendant l’attente, jamais « En ligne »', () => {
  const app = lire('App.jsx');
  const debut = app.indexOf('function Sidebar(');
  const corps = app.slice(debut, app.indexOf('\nfunction ', debut + 1));
  // Sans `ha`, « ha && !ha.online » est faux : il tombait sur le VERT et sur « En ligne ».
  // (Ceux qui tombent sur le gris neutre ou sur rien restent permis.)
  assert.ok(!corps.includes("ha && !ha.online ? 'var(--o-bad)' : 'var(--o-ok)'"), 'sans `ha`, l’état tombe sur le vert « en ligne »');
  assert.ok(!corps.includes('ha && !ha.online ? tr('), 'sans `ha`, l’état tombe sur le texte « En ligne »');
  assert.equal(corps.split("!ha ? tr('Connexion…')").length - 1, 3, 'les trois textes de l’état disent l’attente');
  assert.ok(corps.includes("tr('CONNEXION…')"), 'l’en-tête du logo garde son « CONNEXION… »');
});
