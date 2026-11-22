// ─────────────────────────────────────────────────────────────────────────────
// Le mouvement (audit des thèmes du 13/11, V5 à V7) et le sélecteur « Préréglage »
// (sa capture du 17/11). Son accord sur planche, le 17/11 : « Oui, prépare ».
//
// V5. Selon la carte qu'on touchait, elle s'enfonçait d'un coup, en 0,16 s avec
//     un rebond, ou mollement en 0,3 s : chaque cadre de carte écrit sa propre
//     transition en ligne, qui l'emportait sur la règle commune. UNE règle, dans
//     la feuille commune, pour toutes les cartes.
// V6. Cinq réglages nommés (durées, courbes) qu'un thème peut changer. Prisme y
//     pose son rythme : 0,28 s, sans rebond.
// V7. Les restes : une fiche figée 0,42 s à la fermeture en mouvement réduit ;
//     deux couleurs fixes (le halo du point rouge, le conduit du flux d'énergie).
// Sélecteur. Sous Prisme, un sélecteur à segments sur deux rangées devenait une
//     gélule : il prend le rayon d'une puce plus sa marge.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const css = lire('src', 'index.css'), theme = lire('src', 'theme.js'), prisme = lire('src', 'prisme.css');
const ui = lire('src', 'ui.jsx'), energie = lire('src', 'views', 'energie.jsx');
const APPUI = 'transition: transform var(--o-dur-rapide) var(--o-rebond);';
const CARTES = ':is(.o-piece, .o-rmcard, .o-light-card, .o-carte-meteo)';
const REGLE_CARTES = CARTES + ':not(:where([style*="transition: none"])) {';

test('V6 — cinq réglages du mouvement, posés une fois sur la racine', () => {
  // Sur `html` (la racine, sous un autre nom) : le premier bloc `:root {` de la feuille reste celui des couleurs sombres.
  const ligne = css.split('\n').find((l) => l.startsWith('html { --o-dur-rapide:'));
  assert.ok(ligne, 'les jetons du mouvement ne sont plus posés sur la racine');
  assert.ok(css.indexOf(':root {') < css.indexOf('\n  --o-bg:') && css.indexOf('\n  --o-bg:') < css.indexOf('\n}', css.indexOf(':root {')), 'le premier bloc `:root {` n’est plus celui des couleurs');
  const jetons = Object.fromEntries([...ligne.matchAll(/(--o-[a-z-]+): ([^;]+);/g)].map((m) => [m[1], m[2]]));
  // ASSERTION MODIFIÉE (17/11 au soir, « Oui, avec le rythme ») : l'appui de TOUS les thèmes prend le rythme de Prisme,
  // 0,28 s sans rebond (il valait .16s et cubic-bezier(.34, 1.45, .56, 1)).
  assert.deepEqual(jetons, {
    '--o-dur-rapide': '.28s', '--o-dur': '.25s', '--o-dur-lente': '.45s',
    '--o-courbe': 'cubic-bezier(.22, .61, .36, 1)', '--o-rebond': 'cubic-bezier(.2, .8, .2, 1)',
  });
  assert.equal(css.split('--o-dur-rapide:').length - 1, 1, 'une seule définition');
});

// TEST MODIFIÉ (17/11 au soir) : depuis que les effets de Prisme valent pour tous les thèmes, les BOUTONS s'enfoncent en
// 0,12 s, écrit dans la règle commune des boutons (effets_partout.test.mjs). Les jetons règlent les cartes, les lignes, les
// aperçus, les intertitres et les interrupteurs.
test('V6 — l’appui des cartes, lignes et aperçus lit ces réglages ; plus d’ancien rebond en dur', () => {
  const tete = css.indexOf('button, .o-nav-item, .o-piece, .o-light-card, .o-scene-room, .grid-par-pal button, [role="switch"], [role="button"] {\n  ' + APPUI);
  assert.ok(tete > 0, 'la règle d’appui de départ');
  for (const s of ['.o-apercu', '.o-ligne-moment', '.o-pointille']) assert.ok(css.includes(s + ' { ' + APPUI + ' }'), s + ' ne suit plus la charte');
  assert.ok(!/transition: transform \.16s cubic-bezier\(\.34, ?1\.45/.test(css), 'l’ancien rebond de l’appui est revenu, écrit en dur');
});

test('V5 — une seule règle d’appui pour toutes les cartes, plus forte que leur transition en ligne', () => {
  const d = css.indexOf(REGLE_CARTES);
  assert.ok(d > 0, 'la règle commune des cartes');
  assert.equal(css.split(REGLE_CARTES).length - 1, 1, 'une seule règle');
  const regle = css.slice(d, css.indexOf('}', d));
  assert.ok(regle.includes('transition: transform var(--o-dur-rapide) var(--o-rebond), box-shadow var(--o-dur) var(--o-courbe), border-color var(--o-dur) var(--o-courbe), opacity var(--o-dur) var(--o-courbe), filter var(--o-dur) var(--o-courbe) !important;'),
    'l’appui au rythme rapide, et ce que les cartes animaient d’utile (ombre, liseré, opacité, filtre) au rythme normal');
  // PAS le fond : celui des cartes est un dégradé (non animable), et la couleur unie sous celui de la carte météo passait
  // en fondu du sombre au clair à chaque chargement en thème clair (mesuré le 17/11). `color` non plus : lot 7 du 28/10, V9.
  assert.ok(!/\b(background|background-color|color|all) var\(/.test(regle.replace(/border-color/g, '')), 'la règle anime de nouveau le fond ou la couleur du texte');
  // Le filtre : la carte météo s'éclaircit au survol (`filter: brightness(1.07)`), et sa règle `transition: filter .2s` est écrasée par celle-ci.
  assert.ok(css.includes('.o-carte-meteo[role="button"]:hover { filter: brightness(1.07); }'), 'le survol de la carte météo a changé : revoir la liste des propriétés animées');
  // Les cadres écrivent `transition: all .3s` (ou `.25s`) en ligne : sans `!important`, la règle ne s'applique à aucun.
  assert.ok(regle.includes('!important'), 'sans `!important`, le style en ligne de chaque carte l’emporte de nouveau');
});

test('V5 — un élément qui se déclare sans transition le reste : la copie qui suit le pointeur', () => {
  // Les trois fantômes du rangement (glisser.js, accueil/briques.jsx, edition/disposition.jsx) clonent l'hôte de la carte
  // et lui posent `transition: none` en ligne. Aujourd'hui cet hôte est une enveloppe ; si c'était un jour la carte
  // elle-même, une règle `!important` sans cette exclusion la ferait traîner derrière le doigt.
  assert.ok(css.includes(REGLE_CARTES), 'l’exclusion a disparu : une carte clonée traînerait derrière le pointeur');
  const glisser = lire('src', 'glisser.js'), briques = lire('src', 'accueil', 'briques.jsx'), dispo = lire('src', 'edition', 'disposition.jsx');
  assert.ok(glisser.includes("transition: 'none'"), 'glisser.js : le fantôme ne déclare plus `transition: none`, l’exclusion ne le reconnaît plus');
  assert.ok(briques.includes("st.transition = 'none';"), 'accueil/briques.jsx : idem');
  assert.ok(dispo.includes("st.transition = 'none';"), 'edition/disposition.jsx : idem');
});

test('V5 — en mouvement réduit, aucune carte ne garde de transition : la coupure pèse autant que la règle, et vient après', () => {
  const COUPURE = '@media (prefers-reduced-motion: reduce) {\n  ' + CARTES + ' { transition: none !important; }\n}';
  const regle = css.indexOf(REGLE_CARTES), coupure = css.indexOf(COUPURE);
  assert.ok(regle > 0 && coupure > 0, 'la règle des cartes et sa coupure');
  // Deux déclarations `!important` se départagent au POIDS du sélecteur, puis à l'ordre. La règle des cartes porte une
  // exclusion `:not(...)` : nue, elle compterait un attribut de plus (0,2,0) et battrait toujours sa coupure (0,1,0) —
  // les cartes gardaient leurs transitions en mouvement réduit (relecture du 17/11). Dans `:where()`, elle ne pèse rien.
  const selecteur = css.slice(regle, css.indexOf(' {', regle));
  assert.equal(selecteur, CARTES + ':not(:where([style*="transition: none"]))');
  assert.ok(!/:not\(\[/.test(selecteur), 'l’exclusion est sortie de `:where()` : la règle bat de nouveau sa coupure');
  assert.equal((selecteur.replace(/:where\([^)]*\)/g, '').match(/\.[a-z-]+|\[[^\]]*\]/g) || []).length, 4, 'hors `:where()`, rien d’autre que les quatre classes du `:is()` (poids d’une classe)');
  assert.ok(coupure > regle, 'à poids égal l’ordre tranche : la coupure doit venir APRÈS la règle');
});

// TEST MODIFIÉ (17/11 au soir) : il disait « Prisme pose son rythme par son thème ». Le rythme de Prisme est devenu celui de
// tous les thèmes (« Oui, avec le rythme ») : il est sur la racine, et plus aucun thème ne le règle.
test('V6 — un seul rythme pour tous les thèmes : celui de Prisme, et aucun thème ne le change', () => {
  assert.equal(theme.split("'--o-dur-rapide':").length - 1, 0, 'un thème règle de nouveau son appui : ce n’est plus le même partout');
  assert.equal(theme.split("'--o-rebond':").length - 1, 0, 'un thème règle de nouveau la courbe de son appui');
  // Prisme n'écrit plus de transition pour ses cartes : la règle commune (plus bas) les anime au rythme commun.
  assert.ok(!/html\.loggia-prisme \.o-(piece|rmcard) \{ transition/.test(prisme), 'Prisme écrit de nouveau sa propre transition de carte');
});

test('V6 — un rythme de thème ne reste pas au thème suivant', () => {
  const i = theme.indexOf('const THEME_KEYS = [');
  const purges = theme.slice(i, theme.indexOf('];', i));
  for (const k of ['--o-dur-rapide', '--o-dur', '--o-dur-lente', '--o-courbe', '--o-rebond']) assert.ok(purges.includes("'" + k + "'"), k + ' n’est pas retiré au changement de thème');
});

test('V7 — en mouvement réduit, une fiche se ferme tout de suite', () => {
  // `* { animation: none !important; }` coupe l'animation de sortie : son `animationend` n'arrive jamais.
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\n  \* \{ animation: none !important; \}/.test(css), 'la coupure générale des animations a changé : revoir la fermeture');
  assert.ok(ui.includes('setClosing(true); if (REDUCE_MOTION) { onClose(); return; } filet.current = setTimeout(onClose, 420);'),
    'la fiche attend de nouveau le filet de 0,42 s alors que rien ne s’anime');
});

test('V7 — le halo du point rouge et le conduit du flux d’énergie suivent le thème', () => {
  assert.ok(css.includes('.o-livedot::before { background: rgba(var(--o-bad-rgb), .55);'), 'le halo du point rouge a repris une couleur fixe');
  assert.ok(!css.includes('rgba(248,113,113,.55)'), 'l’ancien rouge fixe du halo est revenu');
  const d = energie.indexOf('const FlowCable = ');
  const cable = energie.slice(d, energie.indexOf('\n};', d));
  assert.ok(cable.includes('<path d={d} fill="none" stroke="var(--o-bd1)" strokeWidth="5"'), 'le conduit ne prend plus le trait du thème');
  assert.ok(!/stroke="(rgba?\(|#)/.test(cable), 'une couleur fixe est revenue dans le câble');
});

test('Sélecteur — sous Prisme, des segments sur plusieurs rangées gardent des coins, pas une gélule', () => {
  const PILULE = 'html.loggia-prisme [style*="var(--o-well)"]:is([style*="border-radius: 10px"], [style*="border-radius: 11px"], [style*="border-radius: 12px"]):not([style*="flex-direction: column"]),';
  const RANGEES = 'html.loggia-prisme [role="group"][style*="var(--o-well)"]:is([style*="grid-template-columns"], [style*="flex-wrap: wrap"]):is([style*="border-radius: 10px"], [style*="border-radius: 11px"], [style*="border-radius: 12px"]) { border-radius: 23px !important; }';
  assert.ok(prisme.includes(PILULE), 'la règle « fond creusé en pilule » a changé : revoir celle des rangées');
  assert.ok(prisme.includes(RANGEES), 'un sélecteur sur deux rangées redevient une gélule');
  // La règle des rangées est plus précise (un attribut de plus) et vient après : à poids égal, l'ordre trancherait encore.
  assert.ok(prisme.indexOf(RANGEES) > prisme.indexOf(PILULE), 'la règle des rangées précède celle de la pilule');
  // Le sélecteur de sa capture déclare bien ce que la règle cherche.
  const chauffage = lire('src', 'fichechauffage.jsx');
  const d = chauffage.indexOf('function Puces('); assert.ok(d > 0, 'fichechauffage.jsx : `Puces`');
  const puces = chauffage.slice(d, chauffage.indexOf('\n}', d));
  for (const m of ['role="group"', "gridTemplateColumns: 'repeat(' + colonnes", "borderRadius: 12, background: 'var(--o-well)'"]) {
    assert.ok(puces.includes(m), 'fichechauffage.jsx : le groupe de puces ne se déclare plus comme la règle l’attend — ' + m);
  }
});
