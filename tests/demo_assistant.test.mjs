// ─────────────────────────────────────────────────────────────────────────────
// L'assistant de la démonstration parle la langue de la démo (relecture du
// 03/10).
//
// Ses réponses — l'historique, l'agent intégré, les quatre phrases de
// `demo/chat` — étaient écrites en dur, en français sans accents : une démo
// anglaise montrait « Il fait quel temps dehors ? », et la suggestion
// « Briefing », envoyée traduite, recevait « Je suis la demonstration… ». Les
// mots qui reconnaissent une question n'étaient que français et anglais.
//
// Le bloc `PAROLES_DEMO` → `reponseDemo` est EXÉCUTÉ, pas relu : il ne dépend
// que de `LANGUE_DEMO`, posée ici comme `installerDemo` la pose. Les questions
// viennent des catalogues — ce que l'écran envoie vraiment —, et la teinte de
// `parole.js`, celle que l'orbe prend.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teinteDe } from '../src/parole.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const LANGUES = ['fr', 'en', 'de', 'nl', 'it', 'es', 'pl'];

const debut = demo.indexOf('const PAROLES_DEMO = {');
const fin = demo.indexOf('\n}\n', demo.indexOf('function reponseDemo('));

/** Le bloc de demo.js, exécuté dans la langue que `parler` lui donne. */
function assistantDemo() {
  assert.ok(debut >= 0 && fin > debut, 'PAROLES_DEMO … reponseDemo() introuvables dans demo.js');
  return new Function("let LANGUE_DEMO = 'fr';\n" + demo.slice(debut, fin + 2)
    + '\nreturn { parler: (l) => { LANGUE_DEMO = l; }, PAROLES_DEMO, reponseDemo };')();
}

// Le catalogue de chaque langue ; le français est la langue des sources.
const CATALOGUES = {};
for (const l of LANGUES.slice(1)) CATALOGUES[l] = (await import(`../src/langues/${l}.js`)).default;
function tr(l, cle) {
  if (l === 'fr') return cle;
  const v = CATALOGUES[l][cle];
  assert.equal(typeof v, 'string', `${l} : « ${cle} » manque au catalogue`);
  return v;
}

test('chaque phrase de l’assistant de démo existe dans les sept langues', () => {
  const { PAROLES_DEMO } = assistantDemo();
  for (const [cle, phrases] of Object.entries(PAROLES_DEMO)) {
    for (const l of LANGUES) assert.ok(phrases[l] && phrases[l].trim(), `${cle} : ${l} manque`);
    // Traduite pour de vrai : aucune langue ne recopie le français.
    for (const l of LANGUES.slice(1)) assert.notEqual(phrases[l], phrases.fr, `${cle} : ${l} recopie le français`);
  }
});

test('la démo reconnaît ce que l’écran envoie, et répond dans sa langue', () => {
  const { parler, PAROLES_DEMO: p, reponseDemo } = assistantDemo();
  for (const l of LANGUES) {
    parler(l);
    // La suggestion « Tout est fermé ? », telle qu'elle part dans cette langue.
    assert.equal(reponseDemo(tr(l, 'Est-ce que tout est bien fermé ?')), p.ferme[l], l + ' · fermé');
    assert.equal(reponseDemo(tr(l, 'Fumée')), p.fumee[l], l + ' · fumée');
    assert.equal(reponseDemo(tr(l, 'Chauffage')), p.chauffage[l], l + ' · chauffage');
    // Les trois autres suggestions n'ont pas de réponse écrite : la phrase
    // de la démo — dans la langue, et plus en français.
    for (const cle of ['Fais-moi le briefing.', 'Fais le point sur la maison.', 'Résume-moi la journée.']) {
      assert.equal(reponseDemo(tr(l, cle)), p.autre[l], l + ' · ' + cle);
    }
  }
});

test('chaque réponse garde la teinte de son sujet, dans chaque langue', () => {
  /* La démo reconnaît trois sujets POUR montrer la teinte de l'orbe : une
   * réponse traduite que `teinteDe` ne sait pas lire laisserait l'orbe
   * neutre en allemand, en italien, en espagnol et en polonais. */
  const { PAROLES_DEMO: p } = assistantDemo();
  for (const l of LANGUES) {
    assert.equal(teinteDe(p.fumee[l]), 'alerte', l + ' · fumée');
    assert.equal(teinteDe(p.chauffage[l]), 'chaud', l + ' · chauffage');
    assert.equal(teinteDe(p.ferme[l]), 'bien', l + ' · fermé');
    for (const cle of ['autre', 'agent', 'meteo']) assert.equal(teinteDe(p[cle][l]), 'base', l + ' · ' + cle);
  }
});

test('l’historique, l’agent intégré et le fil passent par la table', () => {
  assert.ok(demo.includes("{ role: 'user', text: parole('question'),"), 'la question de l’historique');
  assert.ok(demo.includes("{ role: 'assistant', text: parole('meteo'),"), 'sa réponse');
  assert.ok(demo.includes("language: LANGUE_DEMO, data: {}, speech: { plain: {\n            speech: parole('agent'),"), 'l’agent intégré');
  assert.ok(demo.includes('const phrase = reponseDemo(msg.text);'), 'le fil de demo/chat');
  // Plus aucune de ces phrases écrite en clair hors de la table.
  const apres = demo.slice(fin);
  for (const bout of ['Il fait quel temps', 'Onze degr', "Ici l'agent integre", 'de la fumee', 'Tout est ferme', 'je ne sais rien de ta maison']) {
    assert.ok(!apres.includes(bout), 'en dur, hors de PAROLES_DEMO : ' + bout);
  }
});
