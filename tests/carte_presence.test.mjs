// La carte Présence pour une famille nombreuse (24/09/2026, ADR 0088).
//
// « la carte présences est limitée à 3 en affichage il me semble, pour des
// familles plus nombreuses comment je fais ? » — la carte coupait à trois
// lignes, par respect du format standard (184 px). Elle garde ses lignes
// jusqu'à trois ; à partir de quatre elle passe en grille d'avatars (quatre
// par rangée, deux rangées, « +n » au-delà de huit) ; et un toucher l'ouvre
// en feuille, où toute la maisonnée tient sans limite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const css = lire('src', 'index.css');

/** Le corps d'une fonction de premier niveau, par son nom. */
const fonction = (nom) => {
  const i = app.indexOf('\nfunction ' + nom + '(');
  assert.ok(i >= 0, nom + ' introuvable');
  const j = app.indexOf('\nfunction ', i + 1);
  return app.slice(i, j < 0 ? undefined : j);
};

test('jusqu’à trois, des lignes ; à partir de quatre, une grille d’avatars — jamais plus de huit cases', () => {
  const c = fonction('CvPresence');
  assert.ok(!c.includes('liste.slice(0, 3)'), 'la coupe à trois est revenue');
  assert.ok(c.includes('{liste.length <= 3 && liste.map((p) => ('), 'les lignes ne valent que jusqu’à trois');
  assert.ok(c.includes('{liste.length > 3 && ('), 'la grille manque');
  assert.ok(c.includes('className="o-presence-grille"'));
  assert.ok(c.includes("gridTemplateColumns: 'repeat(4, minmax(0, 1fr))'"), 'quatre par rangée');
  assert.ok(c.includes('(liste.length > 8 ? liste.slice(0, 7) : liste).map('), 'au-delà de huit : sept personnes et un « +n »');
  assert.ok(c.includes("trN(liste.length - 7, tr('{n} autre personne'), tr('{n} autres personnes'))"), 'le « +n » se lit au lecteur d’écran');
  // Chaque case porte le nom et l'état, même quand le prénom est caché.
  assert.ok(c.includes("title={p.name + ' · ' + etat(p)} aria-label={p.name + ' · ' + etat(p)}"));
  assert.ok(c.includes('className="o-presence-nom"'));
});

test('la carte s’ouvre — à la souris, au clavier — sur une feuille qui montre tout le monde', () => {
  const c = fonction('CvPresence');
  assert.ok(c.includes('const [ouvert, setOuvert] = useState(false);'));
  assert.ok(c.includes("role={ouvrable ? 'button' : undefined} tabIndex={ouvrable ? 0 : undefined}"));
  assert.ok(c.includes("aria-label={ouvrable ? tr('Ouvrir') + ' ' + tr('Présence') : undefined}"));
  assert.ok(c.includes("if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(true); }"), 'Entrée et Espace ouvrent');
  assert.ok(c.includes('{ouvert && <FeuillePresence liste={liste} onClose={() => setOuvert(false)} />}'));
  const f = fonction('FeuillePresence');
  assert.ok(f.includes('<BottomSheet onClose={onClose}>') && f.includes('<TitreFeuille marge={12}>'), 'le patron des autres feuilles (ADR 0055)');
  assert.ok(f.includes('{liste.map((p) => ('), 'la feuille ne coupe rien');
  /* `liste.slice(`, et pas `slice(` tout court : la feuille prend DEUX LETTRES
   * du prénom pour l'avatar sans photo (`p.name.slice(0, 2)`). Ce qui ne doit
   * pas être coupé, c'est la maisonnée. */
  assert.ok(!f.includes('liste.slice('), 'la feuille ne coupe rien');
  assert.ok(f.includes("relTime(p.lc).toLowerCase()"), 'depuis quand, comme la carte d’une personne');
});

test('sous 230 px les prénoms s’effacent, l’avatar et sa pastille restent', () => {
  assert.ok(css.includes('@container (max-width: 230px) { .o-presence-ou { display: none; } }'), 'la règle existante');
  assert.ok(css.includes('@container (max-width: 230px) { .o-presence-nom { display: none; } }'));
});

test('les nouveaux textes parlent sept langues', () => {
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = lire('src', 'langues', l + '.js');
    for (const k of ["'{n} autre personne':", "'{n} autres personnes':", "'Famille nombreuse':"]) assert.ok(cat.includes('  ' + k), l + ' : ' + k);
  }
  // Le polonais décline le pluriel en trois formes.
  assert.match(lire('src', 'langues', 'pl.js'), /'\{n\} autres personnes': \{ few: '[^']+', many: '[^']+', other: '[^']+' \}/);
});

test('la Bibliothèque montre une famille de neuf, avec des présents et des absents', () => {
  assert.ok(app.includes("<Item l={tr('Famille nombreuse')} w={280}><CvPresence hass={hb} gens={FAMILLE_BIBLIO} /></Item>"));
  const b = fonction('biblioStates');
  assert.ok(b.includes("'person.biblio_4': s('home'") && b.includes("'person.biblio_11': s('not_home'"), 'neuf personnes, de biblio à biblio_11');
});
