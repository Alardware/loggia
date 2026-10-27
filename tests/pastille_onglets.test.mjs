// ─────────────────────────────────────────────────────────────────────────────
// La pastille qui coule (26/10) : dans `FicheOnglets`, le bleu plein n'est plus
// le fond du bouton choisi mais UNE pastille commune, derrière les onglets, qui
// glisse vers celui qu'on choisit — le bord avant d'abord, l'arrière ensuite.
// Toutes les fiches à onglets en profitent : chauffage, robot, distributeur,
// volets.
//
// Ce que ce fichier tient : qu'elle reste UNE et commune, qu'elle ne bouge pas
// en « réduire les animations » ni à l'ouverture, qu'elle ne fausse pas le
// compte des onglets du téléphone, et que le clavier n'a rien perdu.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const COMMUNE = lire('src', 'fichecommune.jsx');
const CSS = lire('src', 'index.css');

/** Le corps de `FicheOnglets`, jusqu'au composant suivant. */
function corps() {
  const i = COMMUNE.indexOf('export function FicheOnglets(');
  assert.notEqual(i, -1, 'FicheOnglets a disparu de fichecommune.jsx');
  return COMMUNE.slice(i, COMMUNE.indexOf('\nexport const PanneauOnglet', i));
}

test('une seule pastille, commune, derrière les onglets', () => {
  const c = corps();
  const pastilles = c.match(/className="rb-pastille"/g) || [];
  assert.equal(pastilles.length, 1, 'il n’y a plus UNE pastille commune : chaque onglet repeint son propre fond');
  assert.match(c, /<span aria-hidden="true" className="rb-pastille"/,
    'la pastille est lue par le lecteur d’écran : elle ne dit rien, elle doit se taire');
  // Elle vient APRÈS les onglets : avant eux, elle comptait dans
  // `.rb-onglet:nth-child(5)` et serrait au téléphone une barre de QUATRE.
  assert.ok(c.indexOf('className="rb-pastille"') > c.indexOf('className="rb-onglet"'),
    'la pastille précède les onglets : la règle des cinq onglets du téléphone se déclenche dès quatre');
  // Le fond du bouton ne revient que tant qu'elle n'est pas mesurée (premier
  // rendu, rendu serveur des tests) : jamais d'onglet choisi sans bleu.
  assert.ok(c.includes("background: actuel === id && !pastille ? 'var(--o-accent-fond)' : 'transparent'"),
    'le bouton choisi garde son fond bleu sous la pastille, ou le perd avant qu’elle soit posée');
  assert.ok(c.includes("color: actuel === id ? '#fff' : 'var(--o-text1)'"), 'l’onglet choisi n’est plus écrit en blanc');
});

test('la pastille est peinte par le thème, et s’efface derrière les mots', () => {
  const r = CSS.match(/\.rb-pastille \{[^}]*\}/);
  assert.ok(r, 'la règle de la pastille a disparu d’index.css');
  assert.match(r[0], /background: var\(--o-accent-fond\);/, 'la pastille n’est plus du bleu plein du thème');
  assert.ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(r[0]), 'une couleur est écrite en dur dans la pastille : aucun thème ne la suivra');
  assert.match(r[0], /position: absolute;/);
  assert.match(r[0], /pointer-events: none;/, 'la pastille capte les clics destinés aux onglets');
  assert.ok(CSS.includes('.rb-onglets { position: relative; }'), 'la barre ne situe plus la pastille');
  assert.ok(CSS.includes('.rb-onglets > .rb-onglet { position: relative; z-index: 1;'), 'les mots passent sous la pastille');
});

test('le bord avant part le premier, l’arrière rattrape', () => {
  for (const [sens, avant, arriere] of [['avant', 'right', 'left'], ['arriere', 'left', 'right']]) {
    const r = CSS.match(new RegExp('\\.rb-pastille\\[data-anime\\]\\[data-sens="' + sens + '"\\] \\{ transition: ([^;]*); \\}'));
    assert.ok(r, `la pastille ne glisse plus vers l’${sens === 'avant' ? 'avant' : 'arrière'}`);
    const [premier, second] = r[1].split(/,\s*(?=[a-z])/);
    assert.ok(premier.startsWith(avant + ' ') && !/\d+s \.\d+s$/.test(premier.trim()),
      `sens ${sens} : le bord ${avant} ne part plus le premier`);
    assert.ok(second.startsWith(arriere + ' ') && /\.\d+s$/.test(second.trim()),
      `sens ${sens} : le bord ${arriere} ne rattrape plus avec un temps de retard — elle glisse d’un bloc`);
  }
  // Le sens vient de l'ordre des onglets.
  assert.ok(corps().includes("avant != null && ici < avant ? 'arriere' : 'avant'"), 'le sens du glissement ne suit plus l’ordre des onglets');
});

test('aucun mouvement en « réduire les animations », ni à l’ouverture', () => {
  // Les transitions n'existent que sous `data-anime` : sans lui, posée net.
  const transitions = [...CSS.matchAll(/\.rb-pastille([^{]*)\{[^}]*transition/g)].map(m => m[1].trim());
  assert.ok(transitions.length >= 2 && transitions.every(s => s.startsWith('[data-anime]')),
    'la pastille glisse aussi sans data-anime : elle glisserait depuis le bord à l’ouverture d’une popup');
  const reduit = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(m => m[1])
    .find(b => b.includes('.rb-pastille'));
  assert.ok(reduit, '« réduire les animations » ne coupe plus la pastille');
  assert.match(reduit, /\.rb-pastille\[data-anime\], \.rb-onglets > \.rb-onglet \{ transition: none; \}/,
    'en « réduire les animations », la pastille ou le mot bougent encore');
  // `data-anime` seulement quand on CHANGE d'onglet après le premier affichage ;
  // un redimensionnement la replace sans glisser.
  const c = corps();
  assert.ok(c.includes('placer(avant != null && avant !== ici,'), 'la pastille glisse au premier affichage');
  assert.ok(c.includes("const replacer = () => placer(false, 'avant');"), 'le redimensionnement fait glisser la pastille au lieu de la poser');
  assert.match(c, /new ResizeObserver\(replacer\)/, 'la pastille ne suit plus la largeur de la popup');
  assert.match(c, /window\.addEventListener\('resize', replacer\)/);
  assert.match(c, /window\.removeEventListener\('resize', replacer\)/, 'l’écouteur de la fenêtre survit à la popup');
});

test('le clavier et l’ARIA n’ont rien perdu', () => {
  const c = corps();
  assert.ok(c.includes('<div role="tablist" aria-label={nom} className="rb-onglets"'), 'la barre a perdu son rôle ou son nom');
  for (const motif of ['role="tab" aria-selected={actuel === id}', 'tabIndex={actuel === id ? 0 : -1}',
    "aria-controls={actuel === id ? idBase + '-p-' + id : undefined}", 'onKeyDown={(e) => aller(e, i)}',
    'const j = ongletVoisin(onglets.length, i, e.key);', 'if (voisin) voisin.focus();']) {
    assert.ok(c.includes(motif), 'le motif ARIA des onglets a perdu : ' + motif);
  }
});
