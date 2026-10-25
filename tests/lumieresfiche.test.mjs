/* Ce que la fiche d'une lumière calcule (chantier Lumières, § 3.5 à 3.8 ; L9) :
 * src/lumieresfiche.js, pur, chargé avec la fiche seulement.
 *
 * À l'heure de Paris, en français : les phrases disent l'heure du navigateur. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const L = await import('../src/lumieresfiche.js');
const { contraste } = await import('../src/contraste.js');

const T = Date.parse('2026-10-14T20:40:00+02:00');   // mercredi 14 octobre, 20:40 à la maison
const NBSP = '\u00a0';

test('L9 : quatre blancs et six couleurs nommés ; le plus proche', () => {
  assert.deepEqual(L.BLANCS_NOMMES(), [[2200, 'Chaude', 'blanc chaud'], [2700, 'Douce', 'blanc doux'], [4000, 'Neutre', 'blanc neutre'], [6500, 'Froide', 'blanc froid']]);
  assert.deepEqual(L.COULEURS_NOMMEES(), [[0, 'Rouge'], [30, 'Orange'], [55, 'Jaune'], [130, 'Vert'], [215, 'Bleu'], [275, 'Violet']]);
  assert.equal(L.blancProche(2900)[2], 'blanc doux');
  assert.equal(L.blancProche(3500)[2], 'blanc neutre');
  assert.equal(L.blancProche(9000)[1], 'Froide');
  assert.equal(L.couleurProche(280)[1], 'Violet');
  assert.equal(L.couleurProche(350)[1], 'Rouge', 'le tour du cercle : 350° est près de 0°');
  assert.equal(L.ecartTeintes(350, 10), 20);
});

test('§ 3.6, 3.7 : le réglage du moment — « Douce · 2 700 K », « Violet » ; « blanc doux », « violet »', () => {
  const blanc = L.reglageLumiere({ color_mode: 'color_temp', color_temp_kelvin: 2702 });
  assert.equal(blanc.mode, 'blancs');
  assert.equal(blanc.kelvin, 2702);
  assert.equal(blanc.etiquette, 'Douce · 2\u202f702' + NBSP + 'K', 'le nombre et son unité ne se séparent pas');
  assert.equal(blanc.phrase, 'blanc doux');
  // ASSERTION MODIFIÉE (seconde tranche, B1) : le réglage dit aussi s'il est un blanc (`blanc`) ; une couleur saturée ne l'est pas.
  assert.deepEqual(L.reglageLumiere({ color_mode: 'xy', hs_color: [275.3, 100] }), { mode: 'couleurs', kelvin: null, teinte: 275.3, blanc: false, etiquette: 'Violet', phrase: 'violet' });
  assert.equal(L.reglageLumiere({ color_mode: 'brightness' }), null);
  assert.equal(L.reglageLumiere(null), null);
});

test('L9 : les bornes du blanc d’une ampoule, ses blancs bornés, les pistes des deux curseurs', () => {
  assert.deepEqual(L.bornesBlanc({ min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 }), { min: 2000, max: 6535 }, 'ses Hue');
  assert.deepEqual(L.bornesBlanc({}), { min: 2200, max: 6500 }, 'sans bornes publiées, celles de sa maquette');
  assert.deepEqual(L.bornesBlanc({ min_color_temp_kelvin: 2700, max_color_temp_kelvin: 2000 }), { min: 2700, max: 6500 }, 'des bornes à l’envers ne font pas une piste vide');
  const b = { min: 2700, max: 6500 };
  assert.deepEqual([2200, 2700, 4000, 6500].map(k => L.blancBorne(k, b)), [2700, 2700, 4000, 6500]);
  assert.equal(L.degradeBlanc({ min: 2200, max: 6500 }), 'linear-gradient(90deg,rgb(255,147,44),rgb(255,188,122),rgb(255,216,178),rgb(255,234,219),rgb(255,249,253))');
  assert.ok(L.degradeTeinte().startsWith('linear-gradient(90deg,rgb(236,81,81),') && L.degradeTeinte().endsWith(',rgb(236,81,81))'), 'du rouge au rouge');
});

test('§ 3.5 : la ligne du type, sous le nom de la fiche', () => {
  assert.deepEqual([{ variable: true, blancs: true, couleurs: true }, { variable: true, blancs: true, couleurs: false }, { variable: true, blancs: false, couleurs: false }, { variable: false }].map(L.typeLumiere),
    ['couleur', 'blanc réglable', 'variateur', 'tout ou rien']);
});

test('§ 3.7 : l’encre des blancs nommés — le brun de sa maquette, calculé : elle se lit sur les quatre', () => {
  const encre = L.encreBlancs();
  assert.match(encre, /^#[0-9a-f]{6}$/);
  const rgb = [1, 3, 5].map(i => parseInt(encre.slice(i, i + 2), 16));
  assert.ok(rgb[0] > rgb[1] && rgb[1] > rgb[2], 'un brun, comme le #3b2410 de sa maquette : rouge, puis vert, puis bleu');
  for (const fond of [[255, 147, 44], [255, 169, 87], [255, 209, 163], [255, 249, 253]]) {
    assert.ok(contraste(rgb, fond) >= 4.5, fond.join(',') + ' : 4,5:1 au moins, sans couleur écrite en dur');
  }
});

test('§ 3.6 : la phrase du panneau du haut — allumée et sa couleur, éteinte et son niveau gardé, muette', () => {
  const blanc = L.reglageLumiere({ color_mode: 'color_temp', color_temp_kelvin: 2700 });
  assert.equal(L.phraseFiche({ phrase: 'Allumée depuis 20:10', on: true, muette: false, reglage: blanc, maintenant: T }), 'Allumée depuis 20:10 · blanc doux');
  assert.equal(L.phraseFiche({ phrase: 'S’éteint à 21:10', on: true, muette: false, reglage: null, maintenant: T }), 'S’éteint à 21:10', 'un variateur n’a pas de couleur à nommer');
  assert.equal(L.phraseFiche({ phrase: 'Éteinte', on: false, muette: false, depuis: '2026-10-14T07:50:00+02:00', dernier: 80, maintenant: T }), 'Depuis 07:50 · se rallumera à 80' + NBSP + '%');
  assert.equal(L.phraseFiche({ phrase: 'Éteinte', on: false, muette: false, depuis: '2026-10-14T07:50:00+02:00', dernier: null, maintenant: T }), 'Depuis 07:50', 'sans le carnet : pas de niveau inventé');
  assert.equal(L.phraseFiche({ phrase: 'Éteinte', on: false, muette: false, depuis: '2026-10-13T23:10:00+02:00', dernier: 30, maintenant: T }), 'Depuis hier · se rallumera à 30' + NBSP + '%');
  assert.equal(L.phraseFiche({ phrase: 'Indisponible depuis 14:20', on: false, muette: true, maintenant: T }), 'Indisponible depuis 14:20');
});

test('§ 3.8 : le minuteur qui tourne — « S’éteint à 21:10 · dans 30 min »', () => {
  assert.equal(L.phraseMinuteur(Date.parse('2026-10-14T21:10:00+02:00'), T), 'S’éteint à 21:10 · dans 30' + NBSP + 'min');
  assert.equal(L.phraseMinuteur(Date.parse('2026-10-14T22:10:00+02:00'), T), 'S’éteint à 22:10 · dans 1' + NBSP + 'h' + NBSP + '30');
});

/* ── Audit du 19/10, seconde tranche ───────────────────────────────────────── */

test('B1 : sous 20 % de saturation, le réglage du moment dit « Blanc » — l’étiquette, la phrase —, et aucune couleur n’est à cercler', () => {
  const pastel = L.reglageLumiere({ color_mode: 'hs', hs_color: [30, 12] });
  assert.deepEqual(pastel, { mode: 'couleurs', kelvin: null, teinte: 30, blanc: true, etiquette: 'Blanc', phrase: 'blanc' });
  const orange = L.reglageLumiere({ color_mode: 'hs', hs_color: [30, 20] });
  assert.deepEqual([orange.etiquette, orange.blanc], ['Orange', false], 'à 20 %, une couleur');
  // Le mode `white` d’un ruban : un blanc sans teinte, la palette des couleurs (c’est là que vit la puce « Blanc »).
  assert.deepEqual(L.reglageLumiere({ color_mode: 'white', brightness: 200 }), { mode: 'couleurs', kelvin: null, teinte: null, blanc: true, etiquette: 'Blanc', phrase: 'blanc' });
  assert.equal(L.reglageLumiere({ color_mode: 'xy', hs_color: [275, 100] }).blanc, false);
  assert.equal(L.reglageLumiere({ color_mode: 'color_temp', color_temp_kelvin: 2700 }).blanc, false);
});

test('B7 : le réglage et les bornes du blanc se lisent aussi en mireds ; sans bornes, celles de sa maquette', () => {
  const r = L.reglageLumiere({ color_mode: 'color_temp', color_temp: 370 });
  assert.deepEqual([r.mode, r.kelvin, r.phrase], ['blancs', 2703, 'blanc doux']);
  // min_kelvin = 1e6 / max_mireds, max_kelvin = 1e6 / min_mireds.
  assert.deepEqual(L.bornesBlanc({ min_mireds: 153, max_mireds: 500 }), { min: 2000, max: 6536 });
  assert.deepEqual(L.bornesBlanc({ min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, min_mireds: 153, max_mireds: 500 }), { min: 2200, max: 6500 }, 'les kelvins d’abord');
  assert.deepEqual(L.bornesBlanc({ supported_color_modes: ['rgbww'] }), { min: 2200, max: 6500 }, 'B6 : une rgbww sans bornes publiées prend celles de sa maquette');
});

test('B4 : la phrase du panneau du haut nomme l’effet en cours — après la couleur, ou seul ; éteinte, rien', () => {
  assert.equal(L.phraseFiche({ phrase: 'Allumée depuis 20:10', on: true, reglage: { phrase: 'blanc doux' }, effet: 'Candle' }), 'Allumée depuis 20:10 · blanc doux · effet Candle');
  assert.equal(L.phraseFiche({ phrase: 'Allumée depuis 20:10', on: true, reglage: null, effet: 'Candle' }), 'Allumée depuis 20:10 · effet Candle');
  assert.equal(L.phraseFiche({ phrase: 'Allumée depuis 20:10', on: true, reglage: null, effet: null }), 'Allumée depuis 20:10');
  assert.equal(L.phraseFiche({ phrase: 'Éteinte', on: false, depuis: null, effet: 'Candle' }), 'Éteinte', 'éteinte, pas d’effet');
});

test('B4 : les effets d’une lampe — les noms tels que Home Assistant les donne, « aucun » reconnu dans la liste (off, none, None, stop_effect)', () => {
  assert.deepEqual(L.effetsLumiere({ effect_list: ['Candle', 'Fireplace', 'off'], effect: 'Candle' }), { aucun: 'off', effets: ['Candle', 'Fireplace'], courant: 'Candle' });
  assert.deepEqual(L.effetsLumiere({ effect_list: ['None', 'Blink'], effect: 'None' }), { aucun: 'None', effets: ['Blink'], courant: null }, '« aucun » n’est pas un effet en cours');
  assert.deepEqual(L.effetsLumiere({ effect_list: ['stop_effect', 'Blink'] }), { aucun: 'stop_effect', effets: ['Blink'], courant: null });
  assert.deepEqual(L.effetsLumiere({ effect_list: ['Blink', 'Breathe'], effect: 'Breathe' }), { aucun: null, effets: ['Blink', 'Breathe'], courant: 'Breathe' }, 'sans « aucun » dans la liste, on ne l’offre pas');
  assert.deepEqual(L.effetsLumiere({ effect_list: ['Blink'], effect: 'Inconnu' }), { aucun: null, effets: ['Blink'], courant: 'Inconnu' }, 'un effet que la liste ne nomme pas reste dit');
  assert.equal(L.effetsLumiere({ effect_list: [] }), null);
  assert.equal(L.effetsLumiere({}), null);
});


/* TEST AJOUTÉ (retouches du 19/10, R3). « Aucun » se reconnaît SANS la casse, dans la liste comme dans l'effet courant (`effect:
 * 'Off'`, `'None'`) ; `finish_effect` et `stop_hue_effect` — les commandes de Zigbee2MQTT et de Hue pour arrêter un effet — ne
 * sont pas des effets : ni listés, ni « aucun », ni jamais « en cours » ; `stop_effect` (Shelly) reste « aucun ». */
test('R3 : « aucun » sans la casse ; finish_effect et stop_hue_effect ne sont pas des effets ; stop_effect reste « aucun »', () => {
  assert.deepEqual(L.effetsLumiere({ effect_list: ['OFF', 'Candle'], effect: 'Off' }), { aucun: 'OFF', effets: ['Candle'], courant: null }, 'l’effet courant « Off » vaut « aucun », quelle que soit sa casse');
  assert.deepEqual(L.effetsLumiere({ effect_list: ['Blink'], effect: 'None' }), { aucun: null, effets: ['Blink'], courant: null }, '« None » n’est jamais un effet en cours, même hors liste');
  assert.deepEqual(L.effetsLumiere({ effect_list: ['candle', 'fireplace', 'finish_effect', 'stop_hue_effect'], effect: 'candle' }), { aucun: null, effets: ['candle', 'fireplace'], courant: 'candle' }, 'les commandes de Zigbee2MQTT / Hue ne sont pas listées');
  assert.deepEqual(L.effetsLumiere({ effect_list: ['stop_effect', 'Blink'], effect: 'Stop_Effect' }), { aucun: 'stop_effect', effets: ['Blink'], courant: null }, '`stop_effect` reste « aucun »');
  assert.equal(L.effetsLumiere({ effect_list: ['finish_effect', 'stop_hue_effect'] }), null, 'rien que des commandes : aucun effet à offrir');
  assert.deepEqual(L.effetsLumiere({ effect_list: ['Blink'], effect: 'finish_effect' }), { aucun: null, effets: ['Blink'], courant: null }, 'une commande n’est pas un effet en cours');
});
