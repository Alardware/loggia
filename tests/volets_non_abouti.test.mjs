/* Un seul mecanisme « ordre non abouti » (ADR 0007, 22/09).
 *
 * Le composant verifie deux minutes apres chaque ordre parti et redemande ;
 * l'ecran regle le nombre de reprises et montre l'echec en rouge. Ce qui se
 * calcule est teste en Python (tests/python/test_volets.py) ; ici, l'ecran. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('l’onglet Volets regle les reprises par trois puces, et rien d’autre', () => {
  const v = lire('src/views/volets.jsx');
  assert.ok(v.includes("const verification = cfg.verification || {};") && v.includes("const tentatives = [1, 2, 3].indexOf(verification.tentatives) >= 0 ? verification.tentatives : 2;"), 'le reglage, avec son defaut');
  assert.ok(v.includes("onClick={() => enregistrer({ verification: { tentatives: n } })} style={puce(tentatives === n)}"), 'trois puces, la choisie en bleu plein');
  assert.ok(v.includes("{tr('Manœuvre non confirmée')}") && v.includes("{tr('Tentatives')}"), 'les mots');
  assert.ok(!v.includes('verification: { actif'), 'pas d’interrupteur : la verification n’est pas une regle qu’on debraye');
});

test('la ligne rouge : dans l’onglet Volets et dans le Journal', () => {
  const v = lire('src/views/volets.jsx');
  assert.ok(v.includes("<span style={j.echec ? { color: 'var(--o-bad)' } : undefined}>") && v.includes("color: j.echec ? 'var(--o-bad)' : 'var(--o-text2)'"), 'Dernieres manoeuvres');
  const j = lire('src/views/journal.jsx');
  assert.ok(j.includes("color: j.echec ? 'var(--o-bad)' : 'var(--o-text)'") && j.includes("color: j.echec ? 'var(--o-bad)' : 'var(--o-text2)'"), 'Journal');
  // Le drapeau vient du socle, et seulement sur les lignes d'echec.
  const r = lire('custom_components/loggia/regles.py');
  assert.ok(r.includes('echec: bool = False') && r.includes('if echec:\n            entree["echec"] = True'), 'regles.noter pose le drapeau');
});

test('les mots ont leur traduction', () => {
  const en = lire('src/langues/en.js');
  for (const k of ['Manœuvre non confirmée', 'Tentatives', 'Deux minutes après un ordre, un volet joignable qui n’a pas bougé se voit redemander. Après la dernière tentative, la manœuvre est notée en rouge ci-dessous.']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
});
