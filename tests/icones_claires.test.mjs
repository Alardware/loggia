/* Les icônes météo en thème clair (25/10, « moi je veux comme sur le modèle »).
 *
 * Le jeu clair est DÉRIVÉ du sombre par une seule règle — le contour des
 * nuages en gris-bleu (#93a5bd, 1,5 px quelle que soit la taille), les traits
 * du vent assombris — et rien d'autre : l'animation reste, un dessin retouché
 * d'un côté doit l'être de l'autre. Le boot n'en porte que les adresses
 * (`?no-inline`), le CSS ne filtre plus rien en clair, et sans document
 * l'icône est la sombre. ADR 0273. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { composant, rendre } from './rendu.mjs';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (p) => readFileSync(racine + p, 'utf8');

const CONTOUR = [['stroke="#e6effc" stroke-miterlimit="10" stroke-width="6"',
  'stroke="#93a5bd" stroke-miterlimit="10" stroke-width="1.5" vector-effect="non-scaling-stroke"']];
const VENT = [['stop-color="#d4d7dd"', 'stop-color="#9aa3b2"'], ['stop-color="#bec1c6"', 'stop-color="#848e9e"']];
const NUAGES = ['cloudy', 'partly-cloudy-day', 'partly-cloudy-night', 'rain', 'thunderstorms',
  'thunderstorms-rain', 'fog', 'hail', 'sleet', 'snow'];
const CLAIRES = [...NUAGES, 'wind'];

const deriver = (nom) => {
  let t = lire(`src/assets/wx/${nom}.svg`);
  for (const [avant, apres] of (nom === 'wind' ? VENT : CONTOUR)) {
    assert.ok(t.includes(avant), `${nom}.svg : le trait ${avant} n'y est plus — la règle de dérivation ne s'applique plus`);
    t = t.replaceAll(avant, apres);
  }
  return t;
};

test('chaque icône claire est le dessin sombre au contour clair, animation comprise', () => {
  for (const nom of CLAIRES) {
    const claire = lire(`src/assets/wx/clair/${nom}.svg`);
    assert.equal(claire, deriver(nom), `${nom}.svg : le clair ne se déduit plus du sombre`);
    const animations = (lire(`src/assets/wx/${nom}.svg`).match(/<animate/g) || []).length;
    assert.equal((claire.match(/<animate/g) || []).length, animations, `${nom}.svg : l'animation ne suit pas`);
  }
});

test('le jeu clair : ni orphelin, ni manquant', () => {
  const fichiers = readdirSync(racine + 'src/assets/wx/clair').sort();
  assert.deepEqual(fichiers, CLAIRES.map(n => n + '.svg').sort());
});

test('wxutil sert chaque icône claire en fichier, hors du boot, sous une condition connue', () => {
  const src = lire('src/wxutil.jsx');
  for (const nom of CLAIRES) {
    assert.ok(src.includes(`'./assets/wx/clair/${nom}.svg?no-inline'`), `${nom}.svg : pas importée en fichier (?no-inline)`);
  }
  assert.equal((src.match(/assets\/wx\/clair\//g) || []).length, CLAIRES.length, 'une icône claire importée de trop, ou en double');
  const cles = (bloc) => [...(src.match(bloc)[1]).matchAll(/(\w+):/g)].map(m => m[1]);
  const meteo = cles(/const WX_METEO = \{([^}]*)\}/);
  const clair = cles(/const WX_CLAIR = \{([^}]*)\}/);
  assert.equal(clair.length, CLAIRES.length);
  for (const c of clair) assert.ok(meteo.includes(c), `WX_CLAIR.${c} : condition inconnue de WX_METEO`);
});

test('en clair, le CSS ne filtre plus l’icône : le jeu clair fait le travail', () => {
  const css = lire('src/index.css');
  assert.ok(!/loggia-light[^{]*\.o-wx-ico[^{]*\{[^}]*filter/.test(css), 'un filtre sur .o-wx-ico en clair est revenu');
});

test('sans document (rendu serveur), WeatherIco rend le jeu sombre', async () => {
  const WeatherIco = await composant('wxutil.jsx', 'WeatherIco');
  const html = rendre(WeatherIco, { wx: 'clouds' });
  assert.ok(/assets\/wx\/cloudy\.svg/.test(html), html);
  assert.ok(!html.includes('clair/'), html);
});
