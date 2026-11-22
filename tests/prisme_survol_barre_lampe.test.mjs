// ─────────────────────────────────────────────────────────────────────────────
// Deux remarques du 16/11, sur des captures de chez lui (Prisme).
//
// 1. « l'effet lumineux comme ceci je sais pas trop, ça fait peut-être de trop » :
//    sous Prisme, une carte survolée prenait un liseré clair et une lueur bleue
//    de 32 px. Son choix sur planche : « C, sans lueur » — la carte monte, son
//    ombre s'accentue, rien de plus. Et la règle n'était pas réservée à la
//    souris : au doigt, la carte touchée gardait son survol (mesuré : encore là
//    4 s après). Elle l'est maintenant, comme les ombres de survol d'index.css.
//
// 2. « par contre la couleur de la barre en clair ça va pas » : en thème clair,
//    `--o-lampe` et `--o-lampe-b` sont des ENCRES (des bruns, lisibles en texte).
//    La barre de luminosité d'une lampe « or » s'en peignait : un brun foncé uni
//    à côté d'une bascule ambre. Elle prend l'ambre de la bascule.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js'), prisme = lire('src', 'prisme.css'), css = lire('src', 'index.css');
const SOURIS = '@media (hover: hover) and (pointer: fine) {';

test('Prisme — une carte survolée monte, sans liseré ni lueur (son choix « C »)', () => {
  const d = theme.indexOf('\n  prisme: {'); assert.ok(d > 0, 'le thème Prisme');
  const bloc = theme.slice(d, theme.indexOf('\n  },', d));
  const survols = [...bloc.matchAll(/'--o-shadow-hover': '([^']+)'/g)].map((m) => m[1]);
  assert.equal(survols.length, 2, 'une ombre de survol en sombre, une en clair');
  for (const s of survols) {
    const couches = s.split(/,(?![^(]*\))/).map((x) => x.trim());
    assert.equal(couches.length, 2, 'deux couches : le filet du haut et l’ombre portée — ' + s);
    assert.ok(couches[0].startsWith('inset 0 1px 0 '), 'le filet de lumière du haut reste');
    assert.match(couches[1], /^0 1[68]px \d+px -14px rgba\(/, 'l’ombre portée reste : la carte se détache');
    // La lueur était une couche `0 0 <flou>px` (sans décalage) teintée de bleu ; le liseré, une couche `0 0 0 calc(…)`.
    assert.ok(!couches.some((c) => /^0 0 /.test(c)), 'une lueur ou un liseré est revenu : ' + s);
  }
});

// TEST MODIFIÉ (17/11 au soir) : la montée et l'ombre de survol de Prisme sont devenues celles de TOUS les thèmes ; elles
// vivent dans index.css (préfixe `html:root`), toujours dans un bloc « souris ».
test('Tous les thèmes — la montée et l’ombre de survol sont réservées à une vraie souris', () => {
  const REGLES = ['html:root .o-piece:hover { transform: translateY(-2px); }',
    'html:root .o-rmcard:hover { box-shadow: var(--o-shadow-hover) !important; transform: translateY(-2px); }'];
  /* Au doigt, `:hover` reste collé à la dernière carte touchée. Les deux règles vivent donc, l'une après l'autre, dans un
   * bloc « souris » ouvert sur la ligne d'avant et refermé sur celle d'après. */
  const bloc = SOURIS + '\n  ' + REGLES.join('\n  ') + '\n}';
  assert.ok(css.includes(bloc), 'les deux règles de survol ne sont plus seules dans leur bloc « souris »');
  for (const regle of REGLES) assert.equal(css.split(regle).length, 2, 'la règle ne doit pas exister une seconde fois hors du bloc');
  assert.ok(!prisme.includes('translateY(-2px)'), 'Prisme redit sa propre montée de survol');
  // index.css fait de même pour l'ombre de survol des autres thèmes (10/10) : la même condition, mot pour mot.
  assert.ok(css.includes(SOURIS + '\n  .o-piece:hover { box-shadow: var(--o-shadow-hover); }'));
});

test('thème clair — la barre d’une lampe « or » ou réglée sur un blanc prend l’ambre de la bascule, pas l’encre brune', async () => {
  const bascule = css.match(/html\.loggia-light \{ --o-bascule-lampe: linear-gradient\(135deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\); \}/);
  assert.ok(bascule, 'l’ambre de la bascule en thème clair (lot 4, E14)');
  const regle = css.match(/\nhtml\.loggia-light:not\(\[style\*="--o-bascule-lampe"\]\) \[data-fill\]\[style\*="var\(--o-lampe-b\)"\] \{ background: linear-gradient\(90deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\) !important; \}/);
  assert.ok(regle, 'la règle de la barre en thème clair manque');
  assert.deepEqual([regle[1], regle[2]], [bascule[1], bascule[2]], 'la barre et la bascule d’une même lampe doivent avoir le même ambre');
  /* Ce que la règle attrape : le dégradé « or » de lumieres.js, écrit en ligne sur le remplissage (`data-fill`). S'il
   * changeait de forme, la règle ne trouverait plus rien et la barre redeviendrait brune sans qu'un test le dise. */
  assert.ok(lire('src', 'lumieres.js').includes("degrade: 'linear-gradient(90deg,var(--o-lampe),var(--o-lampe-b))'"), 'le dégradé « or » de la barre a changé de forme');
  assert.ok(lire('src', 'cartes', 'briques.jsx').includes('<span data-fill style={{'), 'le remplissage de la jauge ne porte plus `data-fill`');
  /* Un thème qui donne SA couleur à la bascule d'une lampe la pose sur la racine : sa barre garde les couleurs du
   * thème. C'est le cas de Google, en clair comme en sombre. */
  const g = theme.indexOf('\n  google: {'), google = theme.slice(g, theme.indexOf('\n  },', g));
  assert.equal((google.match(/'--o-bascule-lampe': 'var\(--o-accent-fond\)'/g) || []).length, 2, 'Google ne pose plus sa bascule : sa barre passerait à l’ambre');
  /* « Oui, les blancs aussi » (16/11) : en thème clair, une lampe réglée sur un BLANC écrit le dégradé de l'or — la règle
   * l'attrape donc elle aussi. Une couleur garde un dégradé tiré de son encre ; le thème sombre, la teinte vraie. */
  const { encreLumiere, couleursLumiere } = await import('../src/lumieres.js');
  const OR = couleursLumiere(null).degrade, BLANC = { color_mode: 'color_temp', color_temp_kelvin: 6500 }, BLEU = { color_mode: 'xy', rgb_color: [0, 0, 255] };
  assert.ok(OR.includes('var(--o-lampe-b)'), 'le dégradé de l’or ne nomme plus `--o-lampe-b` : la règle ne l’attraperait plus');
  assert.equal(encreLumiere(BLANC, null, { clair: true }).degrade, OR, 'thème clair : un blanc allumé prend la barre de l’or');
  assert.equal(encreLumiere({}, { mode: 'color_temp', kelvin: 2700 }, { clair: true }).degrade, OR, 'thème clair : éteinte, le blanc que garde le carnet aussi');
  assert.ok(!encreLumiere(BLEU, null, { clair: true }).degrade.includes('var('), 'thème clair : une couleur garde sa teinte, tirée de son encre');
  /* Une Hue annonce souvent son blanc chaud comme une COULEUR (la lampe du salon de la démo : `rgb`, [255, 176, 92]) : son
   * encre est le même brun, sa barre prend donc l'ambre aussi — de l'orangé au jaune, et presque sans teinte. Les autres
   * couleurs gardent la leur. */
  const couleur = (rgb) => encreLumiere({ color_mode: 'rgb', rgb_color: rgb }, null, { clair: true }).degrade;
  for (const [nom, rgb] of [['le blanc chaud de la démo', [255, 176, 92]], ['un orangé', [255, 128, 0]], ['un jaune', [255, 230, 0]], ['un blanc pur', [255, 255, 255]], ['un blanc froid', [255, 249, 253]]]) assert.equal(couleur(rgb), OR, 'thème clair, ' + nom + ' : la barre de l’or');
  for (const [nom, rgb] of [['un rouge', [255, 0, 0]], ['un vert', [0, 200, 60]], ['un bleu', [0, 0, 255]], ['un violet', [149, 0, 255]], ['un rose', [255, 0, 140]]]) assert.ok(!couleur(rgb).includes('var('), 'thème clair, ' + nom + ' : sa teinte, pas l’ambre');
  assert.equal(encreLumiere({}, { mode: 'hs', hs: [31, 64] }, { clair: true }).degrade, OR, 'thème clair : éteinte, la couleur chaude que garde le carnet aussi');
  assert.ok(!encreLumiere({ color_mode: 'rgb', rgb_color: [255, 176, 92] }, null, { clair: false }).degrade.includes('var('), 'thème sombre : cette couleur chaude garde sa teinte vraie');
  assert.ok(!encreLumiere(BLANC, null, { clair: false }).degrade.includes('var('), 'thème sombre : un blanc garde sa teinte vraie');
  assert.ok(encreLumiere(BLANC, null, { clair: true }).encre.startsWith('rgb(') || encreLumiere(BLANC, null, { clair: true }).encre.startsWith('#'), 'le repère d’un blanc garde son encre, il ne passe pas à l’or');
  // En thème sombre, rien ne change : la règle ne vaut que sous `html.loggia-light`.
  assert.ok(!/\n(?:html|:root)[^{\n]*\[data-fill\]\[style\*="var\(--o-lampe-b\)"\]/.test(css.replace(regle[0], '')), 'une autre règle repeint la barre « or »');
});
