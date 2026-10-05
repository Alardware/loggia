// ─────────────────────────────────────────────────────────────────────────────
// La barre du bas du téléphone : rien ne chevauche, dans aucune langue
// (audit du 03/10).
//
// Traduits, plusieurs libellés ne tenaient pas dans leur case : « Dispositivos »
// (es), « Dispositivi » (it), « Bezpieczeństwo » (pl) débordaient et
// chevauchaient leurs voisins. Décidé avec l'utilisateur :
//  - des formes propres à la barre, « X · court », lues par `trCourt` — SAUF en
//    polonais : sa traduction est relue par un Polonais, ses mots restent ;
//  - une case jamais plus étroite que son libellé (le `* { min-width: 0 }`
//    global les forçait égales), et un corps de texte AJUSTÉ à la place, de 11
//    à 9,5 px ; en dessous, la case la plus longue se coupe (« … »).
// Mesuré dans la démo : rien hors de sa case à 320, 360 et 390 px.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const debut = app.indexOf('function MobileNav(');
const nav = app.slice(debut, app.indexOf('</nav>', debut));

const charger = async (l) => (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default;
const COURTES = ['en', 'de', 'nl', 'it', 'es'];
const CATALOGUES = Object.fromEntries(await Promise.all([...COURTES, 'pl'].map(async l => [l, await charger(l)])));

const CLES = [...nav.matchAll(/trCourt\('([^']+)'\)/g)].map(m => m[1]);

test('la barre du bas lit ses libellés par trCourt', () => {
  assert.deepEqual(CLES, ['Accueil · court', 'Scénarios · court', 'Objets · court', 'Sécurité · court']);
});

test('chaque langue porte sa forme courte, et elle reste courte', () => {
  for (const l of COURTES) {
    for (const cle of CLES) {
      const v = CATALOGUES[l][cle];
      assert.equal(typeof v, 'string', `${l} : « ${cle} » manque`);
      // C'est la SOMME des libellés qui doit tenir : une forme courte qui
      // s'allonge mange la place de toutes les autres.
      assert.ok(v.length <= 9, `${l} : « ${v} » est trop long pour la barre`);
    }
  }
});

test('le polonais garde ses mots : aucune forme courte, ni aucune autre écriture', () => {
  for (const cle of CLES) assert.equal(CATALOGUES.pl[cle], undefined, `pl : « ${cle} » ne doit pas exister`);
  assert.equal(CATALOGUES.pl['Sécurité'], 'Bezpieczeństwo');
  assert.equal(CATALOGUES.pl['Objets'], 'Urządzenia');
  assert.equal(CATALOGUES.pl['Scénarios'], 'Scenariusze');
});

test('une case ne rétrécit pas sous son libellé tant que le texte reste lisible', () => {
  assert.ok(nav.includes("flex: corps.cap ? '1 1 auto' : 1, minWidth: corps.cap ? 0 : 'auto', ...(corps.cap ? { maxWidth: corps.cap } : {}),"));
  assert.ok(nav.includes("padding: '9px 2px 7px'"), '2 px de marge au lieu de 4');
  assert.ok(nav.includes('fontSize: corps.px,'));
  assert.ok(nav.includes('const px = Math.max(9.5, Math.min(11, Math.floor(110 * place / naturel) / 10));'), 'le corps s’ajuste de 11 à 9,5 px');
  assert.ok(nav.includes('if (naturel * px / 11 > place) {'), 'la coupe « … » seulement sous 9,5 px');
  assert.ok(nav.includes('if (tri[i] > part) { cap = Math.floor(part) + 4; break; }'), 'les courts entiers, les longs se partagent le reste');
  assert.equal((nav.match(/<span data-libelle="" style=\{libelle\}>/g) || []).length, 2, 'les cinq vues et le Menu');
  assert.ok(nav.includes('if (!nav.clientWidth) return;'), 'cachée, elle ne mesure rien');
  assert.ok(nav.includes("polices.addEventListener('loadingdone', ajuster)"), 'remesurée quand la police arrive');
});

test('trCourt se replie sur le libellé ordinaire', () => {
  const src = readFileSync(join(RACINE, 'src', 'i18n.js'), 'utf8');
  assert.ok(src.includes("return court || tr(cle.replace(/ · court$/, ''));"));
});
