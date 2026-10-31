// ─────────────────────────────────────────────────────────────────────────────
// Toute ligne à verdict cède son libellé, jamais son verdict (lot 16, 05/10).
//
// La suite « co2_ligne » avait fait céder le libellé de la SEULE carte CO₂.
// La température, l'humidité et le bruit gardaient l'ancienne ligne, une seule
// chaîne à ellipse : c'est le MOT DU PALIER qui tombait. Mesuré dans la
// démonstration (vue Objets, 28 vrais capteurs semés un par palier, cartes
// standard), en pixels coupés au bout de la ligne :
//   • 360 px (carte 161) : « Température · TROP FROID » 23, « UN PEU CHAUD »
//     41, « TROP CHAUD » 30, « Humidité · TROP HUMIDE » 13, « TRÈS HUMIDE »
//     11 — en français ; « Temperatuur · EEN BEETJE WARM » 59, « Rumore ·
//     MOLTO RUMOROSO » 37, « Wilgotność · BARDZO WILGOTNO » 59 ;
//   • lignes coupées sur 28, dans les sept langues : 1 à 6 à 390 px, 2 à 9
//     à 375, 4 à 13 à 360, 12 à 20 à 320 px (au sous-pixel près). Après :
//     aucune à 390 et 375 ; à 320, seuls des verdicts plus larges que TOUTE
//     la ligne s'ellipsent encore (le repli de la rangée du CO₂).
// La mise en page cède, pas les mots : la MÊME rangée que le CO₂, pour toute
// mesure à verdict. Le nom accessible ne change pas (`subLu`), ni la ligne
// des cartes sans verdict.
//
// On REND la carte (React côté serveur, ADR 0069) : un crochet de chargement
// ajoute à App.jsx, pour CE test seul, l'export de `RoomGenericCard` sous
// `?l16vl` — le fichier n'est pas touché.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?l16vl')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -6), ctx);",
  // ASSERTION MODIFIÉE (chantier Capteurs, tâche 4) : une mesure de la table a sa carte, `RoomMesureCard`.
  "  return { ...r, source: String(r.source) + ';export { RoomGenericCard as __RoomGenericCard, RoomMesureCard as __RoomMesureCard };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const { __RoomGenericCard: RoomGenericCard, __RoomMesureCard: RoomMesureCard } = await import(new URL('../src/App.jsx?l16vl', import.meta.url).href);

const NL = String.fromCharCode(10);
const APP = MONOLITHE;
function fonction(nom) {
  const d = APP.indexOf(NL + 'function ' + nom + '(');
  assert.ok(d >= 0, nom + ' introuvable');
  return APP.slice(d, APP.indexOf(NL + '}' + NL, d) + 2);
}

const capteur = (id, v, dc, unite, nom) => ({ entity_id: id, state: String(v), last_changed: '2026-10-05T08:00:00Z', attributes: { friendly_name: nom, device_class: dc, unit_of_measurement: unite } });
// ASSERTION MODIFIÉE (chantier Capteurs, tâche 4) : une mesure à verdict se rend dans SA carte ; une mesure sans table, dans la carte de base.
const rendre = (C, st) => renderToStaticMarkup(createElement(C, {
  id: st.entity_id, hass: { states: { [st.entity_id]: st }, config: { unit_system: { temperature: '°C' } }, callService: () => {} }, onOpen: () => {},
}));
const carte = (st) => rendre(RoomMesureCard, st);
/* La ligne d'état : le premier `div` après celui du nom. */
const ligneDe = (html, nom) => {
  const i = html.indexOf('>' + nom + '</div>');
  assert.ok(i > 0, 'le nom « ' + nom + ' » n’est pas rendu');
  const d = html.indexOf('<div', i);
  return html.slice(d, html.indexOf('</div>', d) + 6);
};
/* Un palier coupé de chaque mesure (relevés ci-dessus), et le CO₂ qui l'avait déjà.
 * ASSERTIONS MODIFIÉES (chantier Capteurs, tâche 4 ; C8, C11) : la carte d'une mesure n'écrit plus « Libellé · VERDICT »,
 * mais la PHRASE de sa zone — le mot en tête, « · aérez » quand la zone le demande. Le mot ne peut donc plus être celui
 * qui cède : la fin de la phrase cède d'abord.
 * ASSERTIONS MODIFIÉES (chantier Capteurs, correction bis 2, point 1) : ces noms disent tous leur famille (« Cuisine température »,
 * « Salon CO2 ») — la carte la tait, et la surface ne la redit plus : « Cuisine température, 30,0 °C, Trop chaud ». */
const CAS = [
  [capteur('sensor.cuisine_temperature', 30, 'temperature', '°C', 'Cuisine température'), 'Trop chaud', '30,0 °C'],
  [capteur('sensor.cuisine_temperature', 26.5, 'temperature', '°C', 'Cuisine température'), 'Un peu chaud', '26,5 °C'],
  [capteur('sensor.cuisine_humidite', 75, 'humidity', '%', 'Cuisine humidité'), 'Trop humide · aérez', '75 %'],
  [capteur('sensor.salon_bruit', 85, 'sound_pressure', 'dB', 'Salon bruit'), 'Très bruyant', '85 dB'],
  // ASSERTION MODIFIÉE (correction bis, point 8) : le CO₂ écrit sa famille, et la surface la dit avec le chiffre, comme les autres — sauf quand son nom la dit (bis 2).
  [capteur('sensor.salon_co2', 1700, 'carbon_dioxide', 'ppm', 'Salon CO2'), 'Confiné · aérez', '1 700 ppm'],
];

test('toute mesure à verdict : sa phrase commence par le mot de sa zone, qui ne cède jamais', () => {
  for (const [st, phrase] of CAS) {
    const ligne = ligneDe(carte(st), st.attributes.friendly_name);
    // ASSERTION MODIFIÉE (chantier Capteurs, tâche 4 bis) : la phrase porte aussi la classe de la grille commune.
    // ASSERTION MODIFIÉE (correction bis, point 6) : sur la carte large, la phrase vit dans son cadre — la phrase entière d'abord.
    assert.ok(ligne.startsWith('<div class="o-mesure-phrases o-seul-large"><div class="o-mesure-phrase"'), st.attributes.device_class + ' : la ligne n’est pas la phrase de la carte — ' + ligne);
    assert.ok(ligne.endsWith('>' + phrase + '</div>'), st.attributes.device_class + ' : ' + ligne);
  }
});

test('le nom accessible dit ce que la carte affiche ; la ligne des cartes sans verdict ne change pas', () => {
  for (const [st, phrase, valeur] of CAS) {
    assert.ok(carte(st).includes('aria-label="' + st.attributes.friendly_name + ', ' + valeur + ', ' + phrase + '"'), st.attributes.device_class + ' : le nom lu a changé');
  }
  // Une mesure sans table de confort (une puissance) : la carte de base, la ligne d'avant, un seul texte.
  const ligne = ligneDe(rendre(RoomGenericCard, capteur('sensor.four', 1250, 'power', 'W', 'Four')), 'Four');
  assert.ok(!ligne.includes('display:flex') && !ligne.includes('<span'), 'une carte sans verdict a changé de ligne — ' + ligne);
  assert.ok(ligne.endsWith('>Puissance</div>'), ligne);
});

test('plus de rangée libellé + verdict : la carte d’une mesure n’écrit que sa phrase', () => {
  assert.ok(!APP.includes('ligneVerdict') && !APP.includes('ligneAir'), 'la rangée d’avant est restée');
  const f = fonction('RoomMesureCard');
  // ASSERTION MODIFIÉE (chantier Capteurs, tâche 4 bis) : une phrase, et sa forme courte pour la carte étroite — deux écritures voulues, pas une copie.
  // ASSERTION MODIFIÉE (correction bis, point 6) : la carte large écrit la phrase entière et sa forme de repli (tue au lecteur d'écran) ; chacune une fois.
  assert.equal(f.split('className="o-mesure-phrase" data-longue=').length - 1, 1, 'la phrase est écrite plus d’une fois');
  assert.equal(f.split('<div aria-hidden="true" className="o-mesure-phrase" data-repli=""').length - 1, 1, 'sa forme de repli, une fois, tue au lecteur d’écran');
  assert.equal(f.split('className="o-mesure-phrase-courte o-gab-phrase o-seul-etroit"').length - 1, 1, 'sa forme courte, une fois');
});
