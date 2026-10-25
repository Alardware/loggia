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
  /* ASSERTION MODIFIÉE (audit du 19/10, M16) : plus de paliers à part (`airPalier`, `airLabel`, `co2Style`) — la bannière et le badge
   * lisent le mot et la couleur de la table (`zoneMesure('co2')`). */
  assert.ok(!src.includes('function airPalier') && !src.includes('function airLabel') && !src.includes('function co2Style'), 'les paliers à part sont revenus');
  assert.ok(src.includes("const motCo2 = (co2) => { const z = zoneCo2(co2); return z ? z.t.toLocaleUpperCase(locale()) : ''; };"), 'le mot de la bannière vient de la table');
});

/* ASSERTIONS MODIFIÉES (chantier Capteurs, tâche 4 ; C6, C11) : une mesure de la table a sa carte, `RoomMesureCard` —
 * le chiffre en grand, la phrase de sa zone, la barre des zones (tests/carte_mesure.test.mjs). La carte de base garde
 * la pile et les mesures sans table ; la ligne « Libellé · VERDICT », la jauge et la teinte du CO₂ sont parties. */
test('la carte capteur : une mesure de la table a sa carte ; la carte de base garde la pile et le reste, plus de puces', () => {
  const c = bloc('function RoomGenericCard(', NL + "/* ── La carte d'une MESURE");
  // ASSERTION MODIFIÉE (audit du 19/10, point 13) : la valeur se lit STRICTEMENT (`lireNombre`).
  assert.ok(c.includes("mesure = n == null ? { v: String(s), u: '' } : { v: fmtN(n), u: unite };"), 'la mesure, valeur et unite');
  assert.ok(!c.includes('cleMesure(') && !c.includes('jaugeMesure(') && !c.includes('ligneVerdict') && !c.includes('<JaugeMesure'), 'la carte de base ne lit plus la table : la carte d’une mesure le fait');
  // ASSERTION MODIFIÉE (audit du 19/10, point 14) : UNE source de noms, confort.js (`nomClasse`), plus `MESURES_NOMS`.
  assert.ok(c.includes("sub = (nc && !nomDitFamille(nom, nc) ? nc : '') || unite || tr('Mesure');"), 'sans regle : le nom de la mesure, rien d’invente');
  assert.ok(c.includes("(dom === 'sensor' && mesure && !mort)") && c.includes('fontSize: 22, fontWeight: 800'), 'la valeur en grand');
  assert.ok(c.includes('{barres && !mort && <JaugePile barres={barres} />}'), 'les barres de la pile, sous le texte');
  const m = bloc('function RoomMesureCard(', NL + 'function ');
  // ASSERTION MODIFIÉE (chantier Capteurs, tâche 4 bis) : la phrase porte aussi la classe de la grille commune, et sa forme courte s'écrit à part.
  // ASSERTION MODIFIÉE (correction bis, point 6) : la phrase de la carte large vit dans son cadre ; la carte étroite écrit toujours la sienne à part.
  assert.ok(m.includes('<ChiffreMesure ') && m.includes('<BarreMesure ') && m.includes('className="o-mesure-phrases o-seul-large"') && m.includes('className="o-mesure-phrase-courte o-gab-phrase o-seul-etroit"'), 'la carte d’une mesure : le chiffre, la phrase, la barre');
  assert.ok(src.includes(": (d === 'sensor' && estMesure(S[k])) ? <RoomMesureCard id={id} hass={hass} onOpen={ouvrir} label={label} />"), 'la fabrique envoie une mesure de la table à sa carte');
  assert.ok(!c.includes('soeurs.map') && !src.includes('PUCE_MESURE'), 'plus de puces soeurs');
  assert.ok(!c.includes("parts.join(' · ')"), 'plus la ligne « 579 ppm · 25,7 °C · 50 % »');
});
