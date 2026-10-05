// ─────────────────────────────────────────────────────────────────────────────
// Les niveaux et les modes du robot, dans leur sens (relecture du 03/10).
//
// Les options d'un robot (`vacOption`, state.js) sont des clés du catalogue,
// traduites à l'affichage. Quatre reprenaient une clé traduite pour un autre
// écran. « Moyen », le niveau de CO₂ : le pas-à-pas de la fiche disait
// « Low → Fair → High » en anglais, « Bajo → Regular → Alto » (médiocre) en
// espagnol. « Normal », l'état d'un capteur, et « Standard », une taille de
// carte : le polonais changeait de genre d'un cran à l'autre (« Niski →
// Średnia → Wysoki », « Cichy → Normalnie »). « Serpillière », l'accessoire :
// « Panno » (le chiffon) en italien, à côté d'« Aspirazione + lavaggio ».
//
// Ils ont leurs clés à sens, lues par `trSens` — qui laisse à `tr` un mot sans
// sens : « Arrêt » garde celui de Home Assistant. Aucune valeur existante ne
// change, ni celle du CO₂ ni la polonaise.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const CATS = Object.fromEntries(await Promise.all(LANGUES.map(async l =>
  [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));

/* Le français d'abord : la langue se résout À L'IMPORT d'i18n.js ; les autres
 * se demandent ensuite comme l'application le fait, par `preparerLangue`.
 * Home Assistant est simulé dans la langue de l'écran : son mot pour « Arrêt »
 * (`CLES_HA`) se reconnaît à sa marque. */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const HA = { language: 'fr', localize: (k) => (k.endsWith('.operation_mode.state.off') ? 'HA:arrêt' : '') };
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass: HA } : null) };
const { vacOption } = await import(pathToFileURL(join(RACINE, 'src', 'state.js')).href);
const { trSens, langue, preparerLangue } = await import(pathToFileURL(join(RACINE, 'src', 'i18n.js')).href);

async function parler(code) {
  HA.language = code;
  for (let i = 0; i < 100 && langue() !== code; i++) {
    preparerLangue({ language: code });
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(langue(), code, 'le catalogue ' + code + ' ne s’est pas chargé');
}

// Ce que montre la fiche du robot (ficherobot.jsx) : l'option, lue par trSens.
const montre = (...opts) => opts.map(o => trSens(vacOption(o)));

test('en français, le mot nu : jamais la clé avec son sens', () => {
  assert.equal(langue(), 'fr', 'le test ne commence pas en français');
  assert.deepEqual(montre('low', 'medium', 'high', 'ultrahigh'), ['Faible', 'Moyen', 'Élevé', 'Maximum']);
  assert.deepEqual(montre('quiet', 'normal', 'standard', 'strong'), ['Silencieux', 'Normal', 'Standard', 'Fort']);
  assert.deepEqual(montre('mopping', 'mop', 'sweeping_and_mopping'), ['Serpillière', 'Serpillière', 'Aspiration + serpillière']);
  assert.deepEqual(montre('sweeping_turbo'), ['Sweeping turbo'], 'une option inconnue reste l’identifiant mis en forme');
});

/* Un niveau ou un mode de robot, langue par langue — plus le mot de l'écran
 * d'où venait la clé nue. */
const ATTENDU = {
  en: { medium: 'Medium', normal: 'Normal', standard: 'Standard', mopping: 'Mopping' },
  de: { medium: 'Mittel', normal: 'Normal', standard: 'Standard', mopping: 'Wischen' },
  nl: { medium: 'Gemiddeld', normal: 'Normaal', standard: 'Standaard', mopping: 'Dweilen' },
  it: { medium: 'Medio', normal: 'Normale', standard: 'Standard', mopping: 'Lavaggio' },
  es: { medium: 'Medio', normal: 'Normal', standard: 'Estándar', mopping: 'Fregado' },
  pl: { medium: 'Średni', normal: 'Normalny', standard: 'Standardowy', mopping: 'Mopowanie' },
};
// Le pas-à-pas relevé : « Fair » en anglais, « Regular » en espagnol.
const PAS = { en: ['Low', 'Medium', 'High', 'Maximum'], es: ['Bajo', 'Medio', 'Alto', 'Máximo'] };

test('dans les six langues, un niveau de robot : ni celui du CO₂, ni l’accessoire', async () => {
  for (const l of LANGUES) {
    await parler(l);
    const [medium, normal, standard, mopping, mop] = montre('medium', 'normal', 'standard', 'mopping', 'mop');
    assert.deepEqual({ medium, normal, standard, mopping }, ATTENDU[l], l);
    assert.equal(mop, mopping, l + ' : « mop » et « mopping » sont le même mode');
    if (PAS[l]) assert.deepEqual(montre('low', 'medium', 'high', 'ultrahigh'), PAS[l], l + ' : le pas-à-pas de la puissance');
  }
});

test('en polonais, un seul genre d’un cran à l’autre', async () => {
  await parler('pl');
  assert.deepEqual(montre('low', 'medium', 'high', 'ultrahigh'), ['Niski', 'Średni', 'Wysoki', 'Maksymalny']);
  assert.deepEqual(montre('quiet', 'normal', 'max'), ['Cichy', 'Normalny', 'Maksymalny']);
  assert.deepEqual(montre('quiet', 'standard', 'strong'), ['Cichy', 'Standardowy', 'Mocny']);
  /* Le masculin de « poziom » (niveau) et de « tryb » (mode), en -y ou -i :
   * ni le féminin en -a (« Średnia »), ni l'adverbe en -ie (« Normalnie »). */
  for (const m of montre('low', 'medium', 'high', 'ultrahigh', 'quiet', 'normal', 'max', 'standard', 'strong', 'customize')) assert.match(m, /[yi]$/, m);
});

test('« Arrêt » garde le mot de Home Assistant : un mot sans sens suit tr', async () => {
  for (const l of ['fr', ...LANGUES]) {
    await parler(l);
    assert.equal(montre('off')[0], 'HA:arrêt', l + ' : le mot du catalogue a pris la place de celui de Home Assistant');
  }
});

test('la table porte ses clés à sens, et les valeurs existantes ne changent pas', () => {
  const S = lire('src', 'state.js');
  const i = S.indexOf('const VAC_MOTS = {');
  assert.ok(i > 0, 'VAC_MOTS introuvable');
  const table = Object.fromEntries([...S.slice(i, S.indexOf('};', i)).matchAll(/(\w+):\s*'([^']*)'/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(table).filter(k => table[k].includes(' · ')).sort(), ['medium', 'mop', 'mopping', 'normal', 'standard']);
  for (const k of new Set(Object.values(table).filter(v => v.includes(' · ')))) {
    for (const l of LANGUES) assert.equal(typeof CATS[l][k], 'string', `${l} : « ${k} » manque`);
  }
  // Le polonais en place ne se réécrit pas : le CO₂, le capteur, la taille de carte.
  assert.deepEqual([CATS.pl['Moyen'], CATS.pl['Normal'], CATS.pl['Standard']], ['Średnia', 'Normalnie', 'Standardowa']);
});

test('la fiche et la carte du robot lisent ces mots par trSens', () => {
  const robot = lire('src', 'ficherobot.jsx');
  const appels = (robot.match(/vacOption\(/g) || []).length;
  assert.ok(appels >= 2, 'la fiche ne montre plus ses options');
  assert.equal((robot.match(/\btrSens\(vacOption\(/g) || []).length, appels, 'une option du robot se lit sans son sens');
  const fan = lire('src', 'App.jsx').split('\n').find(l => l.startsWith('const FAN_FR = () => ({'));
  assert.ok(fan, 'FAN_FR introuvable');
  assert.ok(!fan.includes("tr('Normal')") && fan.split("trSens('Normal · réglage')").length === 3, 'la carte du robot dit « Normalnie » en polonais');
});
