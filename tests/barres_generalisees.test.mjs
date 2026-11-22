// ─────────────────────────────────────────────────────────────────────────────
// Les deux barres de Prisme, dans tous les thèmes (15/11).
//
// Sa demande, avec cinq captures : « applique le patch prisme, d'ailleurs reprend
// la top barre et la latérale pour généraliser, ce qui supprime ce tiret ou même
// le trait de la top barre. aussi corrige l'icône de l'avatar qui ne s'affiche
// plus avec prisme ».
//   • le tiret : la barre d'accent de la pastille glissante (barrelaterale.jsx) ;
//   • le trait : le filet sous l'en-tête (entete.jsx) ;
//   • l'avatar : Prisme imposait un fond d'accent au bouton du profil, qui porte
//     sa photo EN FOND.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const css = lire('src', 'index.css'), prisme = lire('src', 'prisme.css');
const debut = css.indexOf('/* ── LES DEUX BARRES, DANS TOUS LES THÈMES (15/11)');
// Le bloc s'arrête où commence le lot E17 de l'audit du 12/11, qui doit rester le dernier de la feuille (son propre test).
const finBloc = css.indexOf("/* ── Lot E17 de l'audit du 12/11", debut);
const bloc = css.slice(debut, finBloc > 0 ? finBloc : undefined);
const CMD = '.loggia-hdr > button, .loggia-hdr .o-hdr-search, .loggia-hdr .o-hdr-assist > button, .loggia-hdr > div:last-child > button:not(:last-of-type)';

test('barre latérale — des entrées à l’arrondi du thème, l’active en tonal : plus de pastille glissante ni de tiret, dans tous les thèmes', () => {
  assert.ok(debut > 0, 'le bloc des deux barres a disparu');
  assert.ok(finBloc > debut, 'le bloc des deux barres doit précéder le lot E17, qui ferme la feuille');
  assert.ok(bloc.includes('\n.o-navpill { display: none !important; }'), 'le tiret d’accent reviendrait');
  assert.ok(bloc.includes('\n.o-nav-item { box-sizing: border-box; min-height: 44px; padding: 0 14px !important; border-radius: var(--o-radius, 16px) !important; color: var(--o-text2) !important; font-weight: 600 !important; }'));
  // Sa correction du 15/11 : « l'arrondi doit suivre celui du thème appliqué ». La pilule est le dessin de Prisme, pas celui des autres.
  assert.ok(!bloc.includes('999px'), 'une pilule est revenue dans les barres de tous les thèmes');
  assert.ok(prisme.includes('html.loggia-prisme .o-nav-item { box-sizing: border-box; min-height: 44px; padding: 0 14px !important; border-radius: 999px !important;'), 'Prisme a perdu ses pilules');
  assert.ok(bloc.includes('\n.o-nav-item[aria-current] { background: rgba(var(--o-accent-rgb), .16); color: var(--o-accent-soft) !important; }'));
  // Les règles ne sont bornées à aucun thème, et le FOND de la barre reste celui du thème.
  assert.ok(!/html\.loggia-prisme/.test(bloc));
  assert.ok(!/\.loggia-aside\s*\{[^}]*background/.test(bloc), 'le fond de la barre latérale ne serait plus celui du thème');
  // Ce que ces règles visent existe toujours dans le composant.
  const b = lire('src', 'chrome', 'barrelaterale.jsx');
  assert.ok(b.includes('className="o-navpill"') && b.includes('className="o-nav-item"') && b.includes("aria-current={active ? 'page' : undefined}"));
  assert.ok(b.includes("className={'loggia-aside ' + (open ? 'is-open' : 'is-closed')}"));
});

test('barre du haut — ni bande ni trait, sur la page comme sur le ciel ; le bloc vient APRÈS les règles du ciel', () => {
  assert.ok(bloc.includes('\n.loggia-hdr,\nmain:has(.o-wx3d) .loggia-hdr,\nhtml.loggia-light main:has(.o-wx3d) .loggia-hdr,\nhtml.loggia-light main:has(.o-wx3d-sombre) .loggia-hdr { background: transparent !important; border: 0 !important; box-shadow: none !important;'));
  assert.ok(bloc.includes('\n.loggia-hdr .o-hdr-div { display: none !important; }'));
  // À poids égal, c'est l'ordre qui tranche : une règle d'en-tête écrite après ce bloc lui rendrait sa bande.
  const avant = css.slice(0, debut);
  for (const r of ['main:has(.o-wx3d) .loggia-hdr { background:', 'html.loggia-light main:has(.o-wx3d-sombre) .loggia-hdr { background:', 'main:has(.o-wx3d) .loggia-hdr { -webkit-backdrop-filter: none']) {
    assert.ok(avant.includes(r), r + ' : la règle du ciel n’est plus avant le bloc');
  }
  assert.equal((bloc.match(/\.loggia-hdr \{ background:/g) || []).length, 1, 'une règle d’en-tête écrite après le bloc lui rendrait sa bande');
  const e = lire('src', 'chrome', 'entete.jsx');
  assert.ok(e.includes('className="loggia-hdr"') && e.includes('className="o-hdr-search"') && e.includes('className="o-hdr-div"'));
});

test('barre du haut — des commandes de 44 px à l’arrondi du thème ; « Mode édition » allumé garde son accent', () => {
  assert.ok(bloc.includes('\n.loggia-hdr > button,\n.loggia-hdr .o-hdr-search,\n.loggia-hdr .o-hdr-assist > button,\n.loggia-hdr > div:last-child > button:not(:last-of-type) { border-radius: var(--o-radius, 16px) !important; box-shadow: none !important;'));
  assert.ok(bloc.includes('.loggia-hdr > div:last-child > button { width: 44px !important; height: 44px !important; }'));
  assert.ok(bloc.includes('\n:is(' + CMD + '):not([style*="--o-accent-rgb"]) { background: var(--o-s2) !important; border: var(--o-bw, 1px) solid var(--o-bd3) !important; color: var(--o-text1); }'));
  // Le bouton allumé écrit bien cet accent en ligne : c'est ce qui l'écarte de la règle.
  assert.ok(lire('src', 'chrome', 'entete.jsx').includes("const editBtn = editMode ? { ...hbtn, background: 'rgba(var(--o-accent-rgb),.18)'"));
  // Sans flou derrière (cartes pleines, verre léger), la commande prend la surface des cartes ; en relief, sa petite ombre.
  assert.ok(bloc.includes('\n:is(html:not(.loggia-frosted), html.loggia-verre-leger) :is(' + CMD + '):not([style*="--o-accent-rgb"]) { background: linear-gradient(var(--o-s2), var(--o-s2)), var(--o-surfA) !important;'));
  assert.ok(bloc.includes('\nhtml[style*="--o-relief"] :is(' + CMD + ') { box-shadow: var(--o-shadow-rangee) !important; }'));
});

test('le profil garde son image — un anneau, jamais de fond imposé ; il est le dernier BOUTON, pas le dernier enfant', () => {
  // Le bouton porte sa photo en fond : `background: curBg`.
  const e = lire('src', 'chrome', 'entete.jsx');
  assert.ok(/aria-label=\{tr\('Profil'\)\}[^\n]*background: curBg/.test(e));
  for (const [nom, f, sel] of [['index.css', bloc, '\n.loggia-hdr > div:last-child > button:last-of-type {'], ['prisme.css', prisme, '\nhtml.loggia-prisme .loggia-hdr > div:last-child > button:last-of-type {']]) {
    const i = f.indexOf(sel); assert.ok(i >= 0, nom + ' : la règle du profil a disparu');
    const regle = f.slice(i, f.indexOf('}', i));
    assert.ok(!/background/.test(regle), nom + ' : un fond imposé efface la photo du profil');
    assert.ok(regle.includes('box-shadow: 0 0 0 3px rgba(var(--o-accent-rgb), .22) !important'));
    // Un menu ouvert vient APRÈS le bouton : visé comme « dernier enfant », il prenait alors le gris de ses voisins.
    assert.ok(!f.includes('> button:last-child') && !f.includes('> button:not(:last-child)'), nom + ' : le profil est encore visé comme dernier enfant');
  }
});

test('barre du haut, en clair — sur un ciel clair, la date et l’heure prennent l’encre du thème, foncée ; sur un ciel sombre, le blanc gagne', () => {
  const claire = 'html.loggia-light main:has(.o-wx3d) .loggia-hdr .o-noel-entete { color: var(--o-text) !important; }';
  const foncee = '  html.loggia-light main:has(.o-wx3d) .loggia-hdr .o-noel-entete { color: color-mix(in srgb, var(--o-text) 60%, #000) !important; }';
  assert.ok(bloc.includes('html.loggia-light main:has(.o-wx3d) .loggia-hdr .o-hdr-date,\nhtml.loggia-light main:has(.o-wx3d) .loggia-hdr .o-hdr-date *,\n' + claire));
  const sombre = 'html.loggia-light main:has(.o-wx3d-sombre) .loggia-hdr .o-hdr-date,';
  assert.ok(bloc.includes(claire), 'sans bande, une encre douce se perd dans le bleu du ciel');
  assert.ok(bloc.includes('@supports (color: color-mix(in srgb, red, blue)) {') && bloc.includes(foncee));
  // À poids égal, l'ordre tranche : la règle du ciel sombre vient APRÈS.
  assert.ok(bloc.indexOf(sombre) > bloc.indexOf(foncee), 'sur un ciel sombre, la date serait écrite en encre foncée');
});

test('Prisme — la feuille de son patch du 15/11 : une règle pour les chiffres, une pour les boutons, les scénarios en puces', () => {
  assert.ok(prisme.includes('Chiffres : UNE règle, partout') && prisme.includes('Boutons : UNE règle, partout'));
  assert.ok(prisme.includes('html.loggia-prisme .loggia-content h1:not(.o-vh) { font-family: var(--o-serif) !important;'));
  assert.ok(prisme.includes('Scénarios de l\'Accueil : les puces de Loggia, telles quelles'));
  assert.ok(!prisme.includes('.grid-qscenes > button:nth-child(6n+1)'), 'les tuiles de scénarios de la première version sont revenues');
  // Son patch du 15/11 à 17 h 15, « correction de la barre latérale » : le voile seul était transparent, et la barre dépliée
  // au téléphone laissait lire la page. Il est posé sur le fond de barre du thème, celui que le composant peint déjà.
  assert.ok(prisme.includes('\nhtml.loggia-prisme .loggia-aside { background: linear-gradient(var(--o-s4), var(--o-s4)), linear-gradient(180deg, var(--o-side1), var(--o-side2)) !important;'), 'la barre latérale de Prisme est redevenue transparente');
  assert.ok(lire('src', 'chrome', 'barrelaterale.jsx').includes("background: 'linear-gradient(180deg,var(--o-side1)"), 'le fond de barre que Prisme reprend n’est plus celui du composant');
  // Sa mise à jour du 15/11 à 18 h 28 étend les pilules aux fonds creusés (les sélecteurs à segments, tous à 12 px). Les
  // tuiles de chiffres de la vue Énergie sont creusées elles aussi, à 14 px, sur trois lignes : la règle s'arrête à 12,
  // sinon elles deviennent des gélules (« corrige les tuiles Énergie », 15/11).
  const creux = prisme.split('\n').find(l => l.startsWith('html.loggia-prisme [style*="var(--o-well)"]:is('));
  assert.ok(creux && creux.includes('[style*="border-radius: 12px"]') && !creux.includes('14px'), 'la règle des fonds creusés de Prisme attrape de nouveau les tuiles à 14 px');
  for (const f of ['energie.jsx', 'energiehisto.jsx']) assert.ok(/background: 'var\(--o-well\)'[^\n]*borderRadius: 14\b|borderRadius: 14, background: 'var\(--o-well\)'/.test(lire('src', 'views', f)), f + ' : les tuiles de chiffres ne sont plus creusées à 14 px');
  // 16/11, « corrige la carte qui ne se réduit plus à l'appui » : la montée du survol de Prisme, plus précise que
  // l'enfoncement commun d'index.css, l'emportait — la carte restait en l'air sous le doigt, carte d'appareil comme carte
  // pièce. Prisme redit l'enfoncement à l'échelle commune, APRÈS sa règle de survol (pour `.o-piece` les deux pèsent
  // autant : l'ordre tranche), et le coupe lui aussi quand les animations sont réduites.
  const echelle = (css.match(/\n\.o-rmcard:has\(> \.o-surface\):active \{ transform: (scale\([.\d]+\)); \}/) || [])[1];
  const echellePiece = (css.match(/\.o-piece:active,[^{]*\{\n {2}transform: (scale\([.\d]+\));\n\}/) || [])[1];
  assert.ok(echelle && echelle === echellePiece, 'les deux enfoncements communs (carte pièce, carte d’appareil) ne sont plus à la même échelle');
  // ASSERTIONS MODIFIÉES (17/11 au soir) : la montée du survol et l'enfoncement qui la bat sont devenus ceux de TOUS les
  // thèmes (« les effets ne sont plus liés au seul thème prisme ») : ils vivent dans index.css, préfixés `html:root` (le
  // poids de `html.loggia-prisme`). Même ordre exigé : l'appui APRÈS le survol.
  const effets = css.slice(css.indexOf('/* ── LES EFFETS, DANS TOUS LES THÈMES'), css.indexOf('/* ── fin des effets dans tous les thèmes ── */'));
  assert.ok(effets.length > 100, 'le bloc des effets communs a disparu d’index.css');
  for (const [survol, appui] of [['.o-piece:hover {', '.o-piece:active {'], ['.o-rmcard:hover {', '.o-rmcard:has(> .o-surface):active {']]) {
    const iSurvol = effets.indexOf('html:root ' + survol), iAppui = effets.indexOf('\nhtml:root ' + appui + ' transform: ' + echelle + '; }');
    assert.ok(iSurvol > 0 && iAppui > iSurvol, appui.slice(0, -2) + ' ne réduit plus la carte : la montée du survol l’emporte');
    assert.ok(!prisme.includes(survol), 'Prisme redit sa propre montée de survol : ' + survol);
  }
  assert.ok(effets.includes('\n  html:root .o-piece:hover, html:root .o-piece:active { transform: none; }'), 'animations réduites : la carte pièce bouge encore à l’appui');
  assert.ok(effets.includes(', html:root .o-rmcard:hover, html:root .o-rmcard:has(> .o-surface):active { transform: none !important; }'), 'animations réduites : la carte d’appareil bouge encore à l’appui');
  assert.ok(lire('src', 'main.jsx').includes("import './prisme.css';"));
});
