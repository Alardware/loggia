/* Les consommables se designent, ils ne se devinent pas au nom (ADR 0006).
 *
 * La veille est testee en Python (tests/python/test_veilles.py) ; ici,
 * l'onglet Veilles : la designation, le seuil, et les mots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('l’onglet Veilles designe les capteurs par un selecteur, jamais par un nom', () => {
  const v = lire('src/views/veilles.jsx');
  assert.ok(v.includes("const conso = cfg.consommables || {};"), 'la section lit sa configuration');
  assert.ok(v.includes("enregistrer({ consommables: { actif: !conso.actif } })"), 'la regle se debraye comme les autres');
  assert.ok(v.includes("enregistrer({ consommables: { seuil:"), 'un seuil, dans l’unite du capteur');
  assert.ok(v.includes("<EntPicker hass={hass} domaines={['sensor']}") && v.includes("enregistrer({ consommables: { capteurs: [...designes, id] } })"), 'un selecteur d’entites pour designer');
  assert.ok(v.includes("{tr('Aucun capteur désigné : pointe le capteur d’usure d’un filtre, d’une brosse, ou le niveau d’un réservoir — le plus souvent un pourcentage restant.')}"), 'sans designation, la carte dit quoi designer');
  // Un nom de capteur devine serait une chaine ('filter', "brush"…) ; `.filter(` de JavaScript n'en est pas un.
  assert.ok(!/['"`](filter|brush|lifespan)['"`]/.test(v), 'aucun nom de capteur devine dans le code');
});

test('la veille cote serveur ne lit que ce qui est designe', () => {
  const p = lire('custom_components/loggia/veilles.py');
  assert.ok(p.includes('"consommables": {"actif": False, "seuil": 10, "capteurs": []}'), 'les defauts');
  assert.ok(p.includes('for haid in [h for h in (c.get("capteurs") or []) if isinstance(h, str)]:'), 'les capteurs designes, et eux seuls');
  assert.ok(!p.includes('capteurs_de(etats, "consommable'), 'pas de classe inventee');
});

test('les mots ont leur traduction', () => {
  const en = lire('src/langues/en.js');
});
