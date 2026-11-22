// ─────────────────────────────────────────────────────────────────────────────
// Les effets de Prisme dans TOUS les thèmes (17/11 au soir).
//
// Sa remarque : « j'ai demandé de reporter les effets du thème prisme sur les
// autres thèmes. en fait les effets ne sont plus liés au seul thème prisme mais
// deviennent généraux à tout le dashboard ». Le 15/11, seules les deux barres
// avaient été généralisées. Sur la planche du 17/11, son accord : « Oui, avec le
// rythme ». Et deux remarques sur captures, réglées dans le même lot : les
// entrées de la barre latérale se touchaient ; sous Prisme, le ciel s'effaçait
// bien plus haut qu'ailleurs (tests/accueil_ciel_fondu.test.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const css = lire('src', 'index.css'), prisme = lire('src', 'prisme.css');
const DEBUT = '/* ── LES EFFETS, DANS TOUS LES THÈMES', FIN = '/* ── fin des effets dans tous les thèmes ── */';
const bloc = css.slice(css.indexOf(DEBUT), css.indexOf(FIN));

test('les effets vivent dans la feuille commune, une seule fois', () => {
  assert.ok(css.indexOf(DEBUT) > 0 && css.indexOf(FIN) > css.indexOf(DEBUT), 'le bloc des effets communs');
  assert.equal(css.split(DEBUT).length - 1, 1);
  // Il reste AVANT les rayons, les deux barres et le lot E17 (qui doit fermer la feuille).
  assert.ok(css.indexOf(FIN) < css.indexOf('/* ── LES RAYONS SUIVENT LE THÈME'), 'le bloc des effets doit précéder celui des rayons');
});

test('le même poids que sous Prisme : `html:root` à la place de `html.loggia-prisme`', () => {
  // `html:root` pèse (0,1,1), comme `html.loggia-prisme` : chaque règle bat et cède là où elle le faisait sous Prisme.
  const regles = bloc.split('\n').filter((l) => /^\s*[^/*\s@}][^{]*\{/.test(l) && !l.trimStart().startsWith('.loggia-aside'));
  assert.ok(regles.length >= 12, 'les règles d’effets');
  for (const r of regles) {
    const sel = r.slice(0, r.indexOf('{'));
    for (const morceau of sel.split(/,\s*(?![^(]*\))/)) assert.ok(morceau.trim().startsWith('html:root'), 'règle sans le préfixe `html:root` : ' + morceau.trim());
  }
  assert.ok(!regles.some((r) => r.includes('loggia-prisme')), 'un effet est de nouveau réservé à Prisme');
  // Pas de bloc « racine » (le premier `:root {` de la feuille doit rester celui des couleurs sombres).
  assert.ok(!bloc.includes(':root {'), 'un bloc `:root {` dans les effets');
});

test('ce que la planche montrait : cartes, puces de scénarios, boutons, fiches', () => {
  for (const r of [
    // Cartes, à la souris : montée de 2 px ; l'appui la bat, APRÈS.
    'html:root .o-piece:hover { transform: translateY(-2px); }',
    'html:root .o-rmcard:hover { box-shadow: var(--o-shadow-hover) !important; transform: translateY(-2px); }',
    'html:root .o-piece:active { transform: scale(.955); }',
    // Puces de scénarios : le verre (thèmes en verre seulement), la lumière dedans au survol.
    'html:root:where(.loggia-frosted:not(.loggia-verre-leger)) .grid-qscenes > button { -webkit-backdrop-filter: blur(20px) saturate(1.4); backdrop-filter: blur(20px) saturate(1.4); }',
    // ASSERTION MODIFIÉE le 18/11 : la lueur n'est plus l'ombre de la puce survolée, elle vit sur sa couche ::after (fondu).
    'html:root .grid-qscenes > button:hover { border-color: rgba(var(--o-accent-rgb), .5) !important; }',
    'box-shadow: inset 0 0 0 1px rgba(var(--o-accent-rgb), .28), inset 0 0 16px rgba(var(--o-accent-rgb), .2); opacity: 0;',
    // Boutons : le rythme de Prisme, l'enfoncement de 3 %.
    'html:root :is(button, [role="button"]):not(.o-surface):not(:disabled) { transition: box-shadow .28s cubic-bezier(.2, .8, .2, 1), transform .12s ease-out, border-color .28s, background-color .2s; }',
    'html:root :is(button, [role="button"]):not(.o-surface):not(:disabled):active { transform: scale(.97); }',
    // Fiches : filet de lumière, ombre profonde, flou de 28 px (thèmes en verre seulement).
    'html:root:where(.loggia-frosted:not(.loggia-verre-leger)) .o-sheet:not(.o-sheet-opaque) { -webkit-backdrop-filter: blur(28px) saturate(1.4); backdrop-filter: blur(28px) saturate(1.4); }',
  ]) assert.ok(bloc.includes(r), 'manque : ' + r);
  assert.ok(bloc.indexOf('html:root .o-piece:hover') < bloc.indexOf('html:root .o-piece:active'), 'l’appui de la carte pièce doit venir après son survol');
  // La lueur intérieure suit la FORME du bouton de chaque thème : elle ne pose aucun rayon.
  const lueur = bloc.split('\n').find((l) => l.includes('inset 0 0 14px'));
  assert.ok(lueur && lueur.includes(':hover {') && !/border-radius:\s*\d/.test(lueur.slice(lueur.indexOf('{'))), 'la lueur des boutons pose un rayon');
});

test('le verre suit la matière du thème : ni sous un thème opaque, ni en verre « Léger », ni sur une fiche opaque', () => {
  // Relecture du 17/11 : sans cette condition, Neumorphix, Google, GitHub… (« ni verre ni flou ») recevaient du verre dépoli.
  const verre = bloc.split('\n').filter((l) => /backdrop-filter: blur/.test(l));
  assert.equal(verre.length, 2, 'deux flous : les puces de scénarios et les fiches');
  for (const l of verre) assert.ok(l.startsWith('html:root:where(.loggia-frosted:not(.loggia-verre-leger)) '), 'un flou hors des thèmes en verre : ' + l.slice(0, 80));
  // `:where()` ne pèse rien : la règle des thèmes qui posent leur propre fenêtre (`--o-fenetre`, plus lourde) garde son flou.
  assert.ok(css.indexOf('html[style*="--o-fenetre"]:not(.loggia-verre-leger) .o-sheet:not(.o-sheet-opaque),') > 0, 'la fenêtre propre à un thème');
  assert.ok(bloc.includes('html:root.loggia-light .o-sheet { box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9),'), 'l’ombre de la fiche en clair');
});

test('relecture du 17/11 : onglets des fiches, Favoris, micro, relief de Neumorphix', () => {
  // Onglets : le mot passe au blanc quand la pastille arrive — `color` et son retard, que la règle des boutons retirait.
  const boutons = bloc.indexOf('html:root :is(button, [role="button"]):not(.o-surface):not(:disabled) { transition:');
  const onglets = bloc.indexOf('html:root .rb-onglets > .rb-onglet:not(:disabled) { transition: color .16s ease,');
  assert.ok(boutons > 0 && onglets > boutons, 'à poids égal, la règle des onglets doit suivre celle des boutons');
  assert.ok(bloc.includes('html:root .rb-onglets > .rb-onglet[aria-selected="true"] { transition-delay: .18s, 0s, 0s, 0s, 0s; }'), 'le retard ne vaut que pour la couleur');
  assert.ok(css.includes('.rb-onglets > .rb-onglet { position: relative; z-index: 1; transition: color .16s ease; }'), 'la règle d’origine des onglets a changé');
  // Favoris : pas d'ombre de survol dans la rangée qui défile (elle serait rognée net).
  assert.ok(bloc.includes('html:root .o-favrow .o-cvfit > .o-rmcard:hover { box-shadow: none !important; }'));
  // Micro de l'assistant : son fondu et son appui à .94, d'un poids au-dessus de la règle des boutons.
  assert.ok(bloc.includes('html:root button.o-assist-mic:not(.o-surface):not(:disabled) { transition: transform .12s ease, background-color .2s ease, opacity .2s ease; }'));
  assert.ok(bloc.includes('html:root button.o-assist-mic:not(.o-surface):not(:disabled):active { transform: scale(.94); }'));
  // Neumorphix : son ombre de survol est son relief, en sombre comme en clair.
  const theme = lire('src', 'theme.js'), d = theme.indexOf('\n  neumorphix: {'), neu = theme.slice(d, theme.indexOf('\n  },', d));
  const relief = [...neu.matchAll(/shadow: '([^']+)'/g)].map((m) => m[1]), survol = [...neu.matchAll(/'--o-shadow-hover': '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(survol, relief, 'Neumorphix : l’ombre de survol n’est plus son relief');
});

test('animations réduites : rien ne bouge', () => {
  const reduit = bloc.slice(bloc.indexOf('@media (prefers-reduced-motion: reduce) {'));
  // ASSERTION MODIFIÉE le 18/11 : la couche de la lueur des puces (::after) s'arrête aussi.
  assert.ok(reduit.includes('html:root .grid-qscenes > button, html:root .grid-qscenes > button::after, html:root :is(button, [role="button"]), html:root .o-rmcard { transition: none !important; }'));
  assert.ok(reduit.includes('html:root .o-piece:hover, html:root .o-piece:active { transform: none; }'));
  assert.ok(reduit.includes('html:root :is(button, [role="button"]):active, html:root .o-rmcard:hover, html:root .o-rmcard:has(> .o-surface):active { transform: none !important; }'));
});

test('Prisme ne garde que sa forme et son écriture', () => {
  for (const effet of ['translateY(-2px)', 'scale(.97)', 'blur(28px)', '.o-sheet', 'inset 0 0 14px', '.grid-qscenes > button:hover', 'transform .12s'])
    assert.ok(!prisme.includes(effet), 'Prisme redit un effet commun : ' + effet);
  // Ses puces de scénarios restent sans ombre : c'est son dessin.
  assert.ok(prisme.includes('html.loggia-prisme .grid-qscenes > button { box-shadow: none !important; }'));
  // Et ses pilules, ses titres en Outfit restent à lui.
  assert.ok(prisme.includes('html.loggia-prisme .o-nav-item { box-sizing: border-box; min-height: 44px; padding: 0 14px !important; border-radius: 999px !important;'));
  assert.ok(prisme.includes('html.loggia-prisme .o-greet-name { font-weight: 300 !important;'));
});

test('barre latérale : 4 px entre deux entrées, dans tous les thèmes', () => {
  assert.ok(bloc.includes('\n.loggia-aside .o-nav-item + .o-nav-item { margin-top: 4px; }'), 'les entrées se touchent de nouveau');
});

// ── 18/11 : les deux restes signalés à l'installation, planche validée (« Oui, les deux »). ──

test('la lueur d’une puce de scénario arrive en fondu, dans tous les thèmes', () => {
  // La transition écrite sur la puce (`background .25s`) retenait l'ombre : la règle commune la remplace, !important.
  const sc = lire('src', 'app', 'scenarios.jsx');
  assert.ok(sc.includes("transition: 'background .25s'"), 'la transition en ligne de la puce a changé : relire ce test');
  assert.ok(bloc.includes('html:root .grid-qscenes > button { position: relative; isolation: isolate; overflow: hidden; transition: background .25s, border-color .28s, transform .12s ease-out !important; }'));
  // Une ombre extérieure ne s'anime pas vers une lueur intérieure : la lueur est sur sa couche, qui se fond (opacité).
  const couche = bloc.split('\n').find((l) => l.startsWith('html:root .grid-qscenes > button::after {'));
  assert.ok(couche && couche.includes('z-index: -1') && couche.includes('border-radius: inherit') && couche.includes('pointer-events: none'), 'la couche de la lueur');
  assert.ok(couche.includes('opacity: 0; transition: opacity .28s cubic-bezier(.2, .8, .2, 1);'), 'le fondu de la lueur');
  // À la souris seulement : au doigt, rien ne reste allumé.
  const souris = bloc.indexOf('html:root .grid-qscenes > button:hover::after { opacity: 1; }');
  assert.ok(souris > 0 && bloc.lastIndexOf('@media (hover: hover) and (pointer: fine) {', souris) > bloc.indexOf(couche), 'la lueur hors de la condition « souris »');
  // La lueur des boutons laisse les puces (sinon elle repasse par l'ombre, d'un coup) — sans changer de poids (`:where`).
  const boutons = bloc.split('\n').find((l) => l.includes('inset 0 0 14px'));
  assert.ok(boutons.includes(':not(:where(.grid-qscenes > *)):hover {'), 'la lueur des boutons reprend les puces');
  // L'ombre de la puce reste la sienne au survol : plus aucune ombre posée sur la puce survolée.
  assert.ok(!/\.grid-qscenes > button:hover \{[^}]*box-shadow/.test(css), 'une ombre de survol sur la puce');
});

test('barre latérale : 40 px par entrée à la souris, 44 px au doigt', () => {
  // 40 + 4 d'écart = les 44 px d'avant le 17/11 : la barre ne défile pas plus tôt qu'avant.
  const i = bloc.indexOf('  html:root:not(.loggia-tactile) .loggia-aside .o-nav-item { min-height: 40px; }');
  assert.ok(i > 0, 'la hauteur à la souris');
  assert.ok(bloc.lastIndexOf('@media (hover: hover) and (pointer: fine) {', i) > bloc.indexOf('.loggia-aside .o-nav-item + .o-nav-item { margin-top: 4px; }'), 'hors de la condition « souris » : le doigt perdrait ses 44 px');
  // Au doigt, les 44 px restent écrits (commun et Prisme).
  assert.ok(css.includes('\n.o-nav-item { box-sizing: border-box; min-height: 44px;'));
  assert.ok(prisme.includes('html.loggia-prisme .o-nav-item { box-sizing: border-box; min-height: 44px;'));
});
