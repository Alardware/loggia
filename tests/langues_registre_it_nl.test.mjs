/* L'ITALIEN ET LE NÉERLANDAIS TUTOIENT, COMME HOME ASSISTANT (19/10).
 *
 * Sa décision, mot pour mot : « fais vérifier l'italien et le néerlandais : un seul
 * registre partout, le tutoiement comme HA, sans toucher au polonais ». Le français
 * vouvoie ; l'allemand et l'espagnol tutoient comme l'interface de Home Assistant ;
 * le polonais de Seba882 ne se réécrit jamais (tests/polonais_seba882.test.mjs).
 *
 * Relu valeur par valeur — compter ne suffit pas : « sua » est le plus souvent
 * l'appareil (« il suo programma »), « Le » et « La » sont des articles, et en
 * néerlandais « u » est surtout l'heure (« 24 u », « {n} u geleden ») ou l'unité
 * `°{u}`. Huit valeurs ne tutoyaient pas : en italien trois « finché non la
 * cambiate » (le pluriel, « voi »), en néerlandais trois « tot u die wijzigt »,
 * « Door u toegevoegd » et « door u toegestaan ». Modèle : tests/langues_iot.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAT = Object.fromEntries(await Promise.all(['it', 'nl'].map(async l =>
  [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));

// Toutes les valeurs, formes de pluriel comprises.
const valeurs = (cat) => Object.values(cat).flatMap(v => (typeof v === 'string' ? [v] : Object.values(v || {})))
  .filter(v => typeof v === 'string');

/* Italien : « Lei » et ses possessifs en majuscule au fil de la phrase, la 2e personne
 * du pluriel (« voi »), et les impératifs de politesse en tête de phrase. Bornes de mot
 * Unicode : « Suo » n'est pas pris dans « Suono ». */
const IMP_LEI = 'Scelga|Verifichi|Tocchi|Prema|Apra|Aggiunga|Inserisca|Riprovi|Selezioni|Clicchi|Imposti|Attenda|Controlli|'
  + 'Utilizzi|Usi|Faccia|Vada|Tenga|Dica|Metta|Crei|Colleghi|Indichi|Disattivi|Attivi|Spenga|Accenda|Rimuova|Elimini|'
  + 'Sposti|Ricarichi|Riavvii|Modifichi|Annulli|Salvi|Esegua|Chiuda|Scriva|Provi|Si assicuri|Si rivolga|La preghiamo';
/* « voi » : sans ambiguïté pour voi, vostro, potete, volete, dovete ; « cambiate » ou
 * « toccate » sont aussi des participes (« non vengono toccate ») — on ne les prend
 * qu'adressés, après « non », « se » ou « quando ». */
const LEI = new RegExp('(?<=\\p{Ll}[^.!?]*)(?<!\\p{L})(Lei|Le|La|Suo|Sua|Suoi|Sue)(?!\\p{L})'
  + '|(?<!\\p{L})(voi|vostr[oaie]|potete|volete|dovete)(?!\\p{L})'
  + '|(?<!\\p{L})(?:non|se|quando)\\s+(?:l[aeoi]\\s+|l’|ne\\s+|ci\\s+)?(cambiate|scegliete|toccate|premete|aprite|chiudete)(?!\\p{L})'
  + '|(?:^|[.:!?—]\\s+)(' + IMP_LEI + ')(?!\\p{L})', 'u');
const politesseIt = (v) => LEI.test(v);

/* Néerlandais : « uw », et « u » quand ce n'est pas l'heure (« 24 u », « {n} u », « +{h} u »)
 * ni l'unité `{u}`. */
function politesseNl(v) {
  if (/(?<!\p{L})[Uu]w(?!\p{L})/u.test(v)) return true;
  for (const m of v.matchAll(/(?<![\p{L}{])[Uu](?![\p{L}}])/gu)) {
    if (!/(\d|\})\s*$/.test(v.slice(0, m.index))) return true;
  }
  return false;
}

test('la règle voit la forme de politesse, et laisse passer les faux amis', () => {
  for (const v of ['Questo riscaldamento mantiene la sua impostazione finché non la cambiate.', 'Scelga una scena.',
    'Se non trova il dispositivo, Lei può aggiungerlo.', 'Verifichi la connessione.'])
    assert.ok(politesseIt(v), 'italien non vu : ' + v);
  for (const v of ['Le tue stanze', 'Il suo programma è attivo: spegnilo prima.', 'La casa reagisce', 'Gestite in Home Assistant',
    'Suono e luce', 'Scegli una scena.', 'Le sue schede e la sua Panoramica sono disposte a parte.',
    'Prima parte un backup. Le automazioni di Home Assistant non vengono toccate.', 'Impostazioni cambiate'])
    assert.ok(!politesseIt(v), 'italien vu à tort : ' + v);
  for (const v of ['Deze verwarming houdt haar instelling aan tot u die wijzigt.', 'Door u toegevoegd', 'Kiest u een scène.', 'Controleer uw telefoon.'])
    assert.ok(politesseNl(v), 'néerlandais non vu : ' + v);
  for (const v of ['{n} u geleden', 'LAATSTE 24 U', '°{u} buiten', '+{h} u', '{n} u van {m} u', 'Uitgeschakeld', 'Kies een scène.', 'Door jou toegevoegd'])
    assert.ok(!politesseNl(v), 'néerlandais vu à tort : ' + v);
});

test('aucune valeur italienne ne vouvoie', () => {
  const v = valeurs(CAT.it);
  assert.ok(v.length > 3000, 'la lecture du catalogue a échoué : ' + v.length);
  assert.deepEqual(v.filter(politesseIt), []);
});

test('aucune valeur néerlandaise ne vouvoie', () => {
  const v = valeurs(CAT.nl);
  assert.ok(v.length > 3000, 'la lecture du catalogue a échoué : ' + v.length);
  assert.deepEqual(v.filter(politesseNl), []);
});

test('les huit valeurs reprises', () => {
  for (const k of ['Ce chauffage garde sa consigne de {t} jusqu’à ce que vous la changiez.', 'Ce chauffage garde son mode, {mode}, jusqu’à ce que vous le changiez.',
    'Ce chauffage garde son réglage jusqu’à ce que vous le changiez.']) {
    assert.ok(CAT.it[k].endsWith('finché non la cambi.'), 'it : ' + k);
    assert.ok(CAT.nl[k].endsWith('aan tot je die wijzigt.'), 'nl : ' + k);
  }
  assert.equal(CAT.nl['Ajouté par vous'], 'Door jou toegevoegd');
  assert.ok(CAT.nl['restantes, dont {n} min accordées par vous'].includes('door jou toegestaan'));
});
