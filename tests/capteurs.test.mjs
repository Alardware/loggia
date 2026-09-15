// La carte capteur (retour user du 15/09 : « pas tres parlant ») : la mesure
// en grand, le verdict d'air quand la regle existe, les soeurs en puces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('un seul jeu de seuils d’air : la banniere et les cartes lisent airPalier', () => {
  assert.ok(src.includes('function airPalier(co2) { return co2 == null || co2 < 800 ? 0 : co2 < 1200 ? 1 : 2; }'), 'les seuils, une fois');
  assert.ok(src.includes("function airLabel(co2) { return [tr('BON'), tr('MOYEN'), tr('ÉLEVÉ')][airPalier(co2)]; }"), 'le mot de la banniere en decoule');
});

test('la carte capteur : la mesure en grand en haut a droite, le verdict ou le nom de la mesure, les soeurs en puces', () => {
  const c = bloc('function RoomGenericCard(', NL + 'function ');
  assert.ok(c.includes("mesure = isNaN(n) ? { v: String(s), u: '' } : { v: fmtN(n), u: unite };"), 'la mesure, valeur et unite');
  assert.ok(c.includes('avis = airPalier(n);') && c.includes("sub = tr('Qualité d’air') + ' · ' + airLabel(n);"), 'le CO2 prend le verdict de la banniere');
  assert.ok(c.includes("couleur = ['var(--o-ok)', 'var(--o-warn)', 'var(--o-bad)'][avis]; teinte = ['ok', 'or', 'bad'][avis];"), 'vert, ambre, rouge selon le palier');
  assert.ok(c.includes("sub = MESURES_NOMS()[a.device_class] || unite || tr('Mesure');"), 'sans regle : le nom de la mesure, rien d’invente');
  assert.ok(c.includes("(dom === 'sensor' && mesure && !mort)") && c.includes('fontSize: 22, fontWeight: 800') && c.includes("color: avis != null ? couleur : 'var(--o-text)'"), 'la valeur en grand, coloree par le verdict seulement');
  assert.ok(c.includes('{soeurs.map(x => <span key={x.dc} style={PUCE_MESURE}>') && c.includes("x.dc === 'temperature' ? 'thermometer-half' : x.dc === 'humidity' ? 'raindrops' : 'smog'"), 'les soeurs en puces, avec leur icone');
  assert.ok(!c.includes("parts.join(' · ')"), 'plus la ligne « 579 ppm · 25,7 °C · 50 % »');
  assert.ok(src.includes('const PUCE_MESURE = {') && src.includes('borderRadius: 9, background:'), 'la puce a l’arrondi 9, pas une pilule');
});

test('les noms de mesure ont leur traduction', () => {
  ['Particules fines', 'Particules', 'Tension', 'Courant', 'Signal', 'COV', 'Humidité du sol', 'Vent', 'Précipitations', 'Gaz', 'Eau', 'Mesure', 'Qualité d’air']
    .forEach(k => assert.ok(en.includes("  '" + k + "':"), k + ' manque dans en.js'));
});
