// La carte capteur (retour user du 15/09 : « pas tres parlant ») : la mesure
// en grand et le verdict de la table de confort ; depuis le 19/09, sa jauge
// dessous, et plus de puces soeurs.

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

test('une seule table d’air : la banniere et le badge tombent sur les bornes de confort.js', () => {
  // 1 150 ppm (fin du « Bon ») et 1 400 (debut de « Élevé ») : les captures du 19/09.
  assert.ok(src.includes('function airPalier(co2) { return co2 == null || co2 < 1150 ? 0 : co2 < 1400 ? 1 : 2; }'), 'les bornes de la table');
  assert.ok(src.includes("function airLabel(co2) { return [tr('BON'), tr('MOYEN'), tr('ÉLEVÉ')][airPalier(co2)]; }"), 'le mot de la banniere en decoule');
});

test('la carte capteur : la carte de base — la mesure en grand, le verdict de la table, la jauge dessous, plus de puces', () => {
  // Retour user du 19/09 : « il faut revenir a la carte de base, celle-ci, pour
  // le CO2 ajouter une jauge en dessous comme sur ces images ».
  const c = bloc('function RoomGenericCard(', NL + 'function ');
  assert.ok(c.includes("mesure = isNaN(n) ? { v: String(s), u: '' } : { v: fmtN(n), u: unite };"), 'la mesure, valeur et unite');
  assert.ok(c.includes('const cle = isNaN(n) ? null : cleMesure(a.device_class);') && c.includes('jauge = jaugeMesure(cle, n);'), 'la jauge des mesures que la table connait');
  assert.ok(c.includes("sub = (cle === 'co2' ? tr('Qualité d’air') : MESURES_NOMS()[a.device_class]) + ' · ' + jauge.verdict.t.toLocaleUpperCase(locale());"), 'le mot de la table, en capitales');
  assert.ok(c.includes("if (cle === 'co2') { avis = jauge.verdict; teinte = TEINTE_PALIER[couleur] || 'or'; }"), 'le CO2 allume sa carte dans la couleur de son palier');
  assert.ok(c.includes("sub = MESURES_NOMS()[a.device_class] || unite || tr('Mesure');"), 'sans regle : le nom de la mesure, rien d’invente');
  assert.ok(c.includes("(dom === 'sensor' && mesure && !mort)") && c.includes('fontSize: 22, fontWeight: 800') && c.includes("color: avis != null ? couleur : 'var(--o-text)'"), 'la valeur en grand, coloree par le verdict du CO2 seulement');
  assert.ok(c.includes('{jauge && !mort && <JaugeMesure jauge={jauge} />}') && c.includes('{barres && !mort && <JaugePile barres={barres} />}'), 'la jauge, ou les barres de la pile, sous le texte');
  assert.ok(!c.includes('soeurs.map') && !src.includes('PUCE_MESURE'), 'plus de puces soeurs');
  assert.ok(!c.includes("parts.join(' · ')"), 'plus la ligne « 579 ppm · 25,7 °C · 50 % »');
});

test('les noms de mesure ont leur traduction', () => {
  ['Particules fines', 'Particules', 'Tension', 'Courant', 'Signal', 'COV', 'Humidité du sol', 'Vent', 'Précipitations', 'Gaz', 'Eau', 'Mesure', 'Qualité d’air', 'Bruit', 'Pile', 'Pile faible']
    .forEach(k => assert.ok(en.includes("  '" + k + "':"), k + ' manque dans en.js'));
});
