// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 4 (ADR 0384).
//
//  — A1 : la fuite lente de nuit. Le serveur (`veilles.py`) signale `fuite:<compteur>`
//    quand le compteur d'eau a avancé quatre heures de suite, de 01 h à 05 h ; la
//    règle 7 du rail (`attention.js`) en fait une alerte « De l’eau a coulé toute la
//    nuit », au nom du compteur, qui mène à l'Énergie.
//  — P9 : la sauvegarde ratée part au téléphone des administrateurs ; l'écran la dit
//    déjà dans la vue Système (ADR 0314), le rail ne la double donc pas.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

const { pointsAttention, iconePoint, ICONES_ATTENTION } = await import('../src/attention.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const COMPTEUR = 'sensor.compteur_eau';
const S = { [COMPTEUR]: { entity_id: COMPTEUR, state: '103.6', attributes: { friendly_name: 'Compteur eau', unit_of_measurement: 'm³' } } };
const rail = (signales, etats = S) => pointsAttention({ S: etats, veilles: { signales } });

test('A1 — la règle 7 dit « De l’eau a coulé toute la nuit » pour fuite:<compteur>', () => {
  const pts = rail(['fuite:' + COMPTEUR]);
  assert.equal(pts.length, 1);
  assert.deepEqual({ ...pts[0], icone: undefined }, {
    cle: 'fuite:' + COMPTEUR, niveau: 'alerte', icone: undefined, titre: 'De l’eau a coulé toute la nuit',
    sous: 'Compteur eau', vue: 'energie', haid: COMPTEUR,
  });
  assert.equal(iconePoint(pts[0]), 'raindrops');
  assert.equal(ICONES_ATTENTION.fuite, 'raindrops');
});

test('A1 — sans fiche d’état, le sous-titre est l’identifiant, et le point reste', () => {
  const [p] = rail(['fuite:' + COMPTEUR], {});
  assert.equal(p.sous, COMPTEUR);
  assert.equal(p.titre, 'De l’eau a coulé toute la nuit');
});

test('A1 — une clé fuite: sans entité, ou d’un genre inconnu, ne fait pas de point', () => {
  assert.deepEqual(rail(['fuite:', 'fuite', 'inconnu:' + COMPTEUR, 42]), []);
});

test('P9 — sauvegarde:<tentative> ne double pas la vue Système : aucun point', () => {
  assert.deepEqual(rail(['sauvegarde:sensor.backup_last_attempted_automatic_backup']), []);
});

test('A1 — la fuite et les autres veilles se suivent sans se mêler', () => {
  const etats = { ...S, 'sensor.pile': { state: '9', attributes: { device_class: 'battery', friendly_name: 'Porte' } } };
  const pts = rail(['bat:sensor.pile', 'fuite:' + COMPTEUR, 'sauvegarde:sensor.x'], etats);
  assert.deepEqual(pts.map(p => p.cle).sort(), ['fuite:' + COMPTEUR, 'pile:sensor.pile']);
});

test('attention.js garde ./i18n.js pour SEUL import', () => {
  const code = lire('src/attention.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const imports = [...code.matchAll(/^\s*import\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm), ...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  assert.deepEqual(imports, ['./i18n.js']);
});

test('les trois textes du serveur partent au téléphone, dans les six langues', async () => {
  const { CLES_TELEPHONE } = await import('../scripts/textes_serveur.mjs');
  const cles = ['La sauvegarde de cette nuit a échoué', 'La dernière sauvegarde a échoué', '{nom} : de l’eau a coulé toute la nuit, une fuite ?'];
  for (const c of cles) assert.ok(CLES_TELEPHONE.includes(c), c);
  for (const code of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const cat = (await import('../src/langues/' + code + '.js')).default;
    for (const c of [...cles, 'De l’eau a coulé toute la nuit']) {
      assert.equal(typeof cat[c], 'string', code + ' : ' + c);
      assert.ok(cat[c] && cat[c] !== c, code + ' : « ' + c + ' » laissé en français');
    }
    assert.equal((cat['{nom} : de l’eau a coulé toute la nuit, une fuite ?'].match(/\{nom\}/g) || []).length, 1, code + ' : le repère {nom}');
  }
});
