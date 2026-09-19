// ─────────────────────────────────────────────────────────────────────────────
// Les jauges des cartes capteurs (retours du 19/09, captures Netatmo à l'appui).
//
// « Je pense qu'il faut revenir à la carte de base, celle-ci ; pour le CO₂,
// ajouter une jauge en dessous comme sur ces images » — puis « un trait, pas un
// rond, et les chiffres sont les uns sur les autres » — puis « les valeurs sont
// inscrites sur les photos ». La table de confort.js prend les bornes et les
// couleurs des captures ; les cartes, leur jauge, la fiche de confort, la
// bannière et « À surveiller » la lisent toutes. Voir l'ADR 0057.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { echelleMesure, jaugeMesure, cleMesure, barresPile, verdictMesure } = await import('../src/confort.js');
const { SEUIL_CO2 } = await import('../src/attention.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const fonction = (nom) => {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  return APP.slice(i, APP.indexOf('\n}\n', i) + 3);
};

test('les repères sont les chiffres écrits sur les photos', () => {
  assert.deepEqual(echelleMesure('co2').reperes.map(r => r.v), [900, 1150, 1400, 1600]);
  assert.deepEqual(echelleMesure('temp').reperes.map(r => r.v), [15, 17, 23, 26, 29]);
  assert.deepEqual(echelleMesure('hum').reperes.map(r => r.v), [15, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(echelleMesure('bruit').reperes.map(r => r.v), [50, 65, 70, 80]);
  assert.equal(echelleMesure('lumiere'), null);
});

test('les couleurs des photos, dans leur ordre : bleu idéal, puis vert, jaune, orange, rouge', () => {
  const B = 'var(--o-cold)', V = 'var(--o-ok)', J = 'var(--o-warn)', O = 'var(--o-warn2)', R = 'var(--o-bad)';
  assert.deepEqual(echelleMesure('co2').bandes.map(b => b.c), [B, V, J, O, R]);
  assert.deepEqual(echelleMesure('bruit').bandes.map(b => b.c), [B, V, J, O, R]);
  // Des deux côtés de l'idéal pour la température et l'humidité.
  assert.deepEqual(echelleMesure('temp').bandes.map(b => b.c), [R, O, J, V, B, V, J, O, R]);
  assert.deepEqual(echelleMesure('hum').bandes.map(b => b.c), [R, O, J, V, B, V, J, O, R]);
  // Les bandes se suivent sans trou, de 0 à 100 %.
  for (const cle of ['co2', 'temp', 'hum', 'bruit']) {
    const b = echelleMesure(cle).bandes;
    assert.equal(b[0].de, 0, cle);
    assert.equal(b[b.length - 1].a, 100, cle);
    for (let i = 1; i < b.length; i++) assert.equal(b[i].de, b[i - 1].a, cle + ' : un trou entre deux bandes');
  }
});

test('le trait suit la valeur sur une échelle linéaire, bornée aux extrémités', () => {
  const co2 = (v) => jaugeMesure('co2', v).pos;
  assert.ok(co2(900) < co2(1150) && co2(1150) < co2(1400) && co2(1400) < co2(1600));
  // Sous l'échelle, le trait reste au bout gauche — comme 447 ppm sur la photo.
  assert.equal(co2(447), 0);
  assert.equal(co2(5000), 100);
  // Le trait tombe dans la bande de son verdict.
  for (const [cle, v] of [['co2', 1280], ['co2', 1480], ['temp', 20], ['hum', 47], ['bruit', 67]]) {
    const j = jaugeMesure(cle, v);
    const bande = j.bandes.find(b => j.pos >= b.de && j.pos <= b.a);
    assert.equal(bande.c, j.verdict.c, cle + ' ' + v + ' : le trait et le mot ne disent pas la même chose');
  }
  assert.equal(jaugeMesure('co2', null), null);
  assert.equal(jaugeMesure('co2', 'unknown'), null);
});

test('les chiffres ne se chevauchent pas, même dans une carte de téléphone (barre de 144 px)', () => {
  // 10 px, gras, chiffres à chasse fixe : environ 6 px par chiffre.
  for (const cle of ['co2', 'temp', 'hum', 'bruit']) {
    const r = echelleMesure(cle).reperes;
    for (let i = 1; i < r.length; i++) {
      const ecart = (r[i].pos - r[i - 1].pos) / 100 * 144;
      const place = (String(r[i].v).length + String(r[i - 1].v).length) * 3 + 2;
      assert.ok(ecart >= place, cle + ' : ' + r[i - 1].v + ' et ' + r[i].v + ' se touchent (' + Math.round(ecart) + ' px)');
    }
  }
});

test('la pile en cinq barres, comme la capture : 100 → 5 vertes … 20 → 1 rouge', () => {
  assert.deepEqual([100, 80, 60, 40, 20].map(p => barresPile(p).n), [5, 4, 3, 2, 1]);
  assert.deepEqual([100, 80, 60, 40, 20].map(p => barresPile(p).c), ['var(--o-ok)', 'color-mix(in srgb, var(--o-ok) 55%, var(--o-warn))', 'var(--o-warn)', 'var(--o-warn2)', 'var(--o-bad)']);
  assert.equal(barresPile(81).n, 4, 'au plus proche : 81 % se lit comme 80 %');
  assert.equal(barresPile(3).n, 1, 'jamais moins d’une barre');
  assert.equal(barresPile(null), null);
});

test('les classes Home Assistant qui ont une jauge', () => {
  assert.deepEqual(['temperature', 'humidity', 'carbon_dioxide', 'sound_pressure', 'battery', 'illuminance'].map(cleMesure), ['temp', 'hum', 'co2', 'bruit', null, null]);
});

test('la jauge : un TRAIT à la valeur, pas un rond ; fine et sans chiffres dans la compacte', () => {
  const j = fonction('JaugeMesure');
  assert.ok(j.includes('className="o-jauge-trait"') && j.includes('width: 3, height: haut, borderRadius: 2'), 'le repère est un trait');
  assert.ok(!/borderRadius: '50%'/.test(j), 'un rond est revenu');
  assert.ok(j.includes('{!fine && (') && j.includes("left: 'clamp(' + demi + 'px, ' + r.pos + '%, calc(100% - ' + demi + 'px))'"), 'les chiffres restent dans la barre ; la compacte n’en a pas');
  assert.ok(j.includes('aria-hidden="true"'), 'la valeur et son mot sont déjà écrits : la jauge ne se lit pas');
  const c = fonction('CvCard');
  assert.ok(c.includes('{jaugeMes && <JaugeMesure jauge={jaugeMes} fine={dense} />}') && c.includes('{barresMes && <JaugePile barres={barresMes} fine={dense} />}'), 'la compacte a sa jauge');
});

test('une seule table : « Élevé » commence à 1 400 ppm partout', () => {
  assert.equal(verdictMesure('co2', SEUIL_CO2).t, 'Élevé', 'le point « À surveiller » tombe au début de « Élevé »');
  assert.equal(verdictMesure('co2', SEUIL_CO2 - 1).t, 'Moyen');
  assert.ok(APP.includes('function airPalier(co2) { return co2 == null || co2 < 1150 ? 0 : co2 < ' + SEUIL_CO2 + ' ? 1 : 2; }'), 'la bannière et le badge');
  assert.ok(fonction('CvAir').includes("const vAir = air.co2V == null ? null : verdictMesure('co2', air.co2V);"), 'la carte « Qualité air » du catalogue');
  assert.ok(!APP.includes("tr('Mauvais'), 'var(--o-bad)'"), 'plus de seconde échelle 800 / 1200 dans la carte « Qualité air »');
  const py = lire('custom_components', 'loggia', 'veilles.py');
  assert.ok(py.includes('"co2": {"actif": False, "seuil": ' + SEUIL_CO2 + ','), 'le défaut de la veille du serveur');
  assert.ok(lire('src', 'views', 'veilles.jsx').includes('value={co2.seuil != null ? co2.seuil : SEUIL_CO2}'), 'l’écran des veilles');
});
