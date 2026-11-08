// ─────────────────────────────────────────────────────────────────────────────
// « Enregistrer la maison telle qu'elle est » (06/11, étape 8 du rapport sur l'usage) : on règle lumières et volets
// à la main, on touche le bouton, on donne un nom — le scénario les remet ainsi.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versEnregistrement, compterEtats, libelleEtats, resumeScenario, scenarioVide } from '../src/scenarios.js';

const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const FILM = {
  'light.salon': { on: true, niveau: 20, blanc: 2700 },
  'light.chambre': { on: false },
  'light.cuisine': { on: false },
  'cover.volet_salon': { position: 0 },
};

test('un état retenu se compte et se dit', () => {
  assert.deepEqual(compterEtats(FILM), { lampes: 3, allumees: 1, volets: 1 });
  assert.deepEqual(compterEtats(null), { lampes: 0, allumees: 0, volets: 0 });
  assert.equal(libelleEtats(FILM), '1 lumière allumée · 1 volet');
  assert.equal(libelleEtats({ 'cover.a': { ouvert: true }, 'cover.b': { position: 30 } }), '2 volets', 'des volets seuls');
  assert.equal(resumeScenario({ nom: 'Film', etats: FILM, piece: 'Salon', actions: [] }), 'État enregistré · Salon · 1 lumière allumée · 1 volet');
  assert.equal(resumeScenario({ nom: 'Film', etats: FILM, actions: [] }), 'État enregistré · 1 lumière allumée · 1 volet');
  assert.equal(scenarioVide().etats, null);
});

test('ce que la fiche envoie : l’état remplace les actions ; null l’efface', () => {
  const doc = versEnregistrement({ nom: 'Film', etats: FILM, actions: [{ famille: 'lumieres', geste: 'eteindre' }], piece: 'Salon' });
  assert.deepEqual(doc.etats, FILM);
  assert.deepEqual(doc.actions, [], 'un état retenu : plus d’actions');
  assert.equal(doc.piece, 'Salon');
  // Redevenu composé, ou lié : l'état part à null — le serveur l'efface.
  assert.equal(versEnregistrement({ nom: 'Film', etats: null, actions: [] }).etats, null);
  const lie = versEnregistrement({ nom: 'Film', lien: 'scene.film', etats: FILM });
  assert.equal(lie.etats, null);
  assert.deepEqual(lie.actions, []);
  // Un scénario qui n'en parle pas n'envoie rien : un composant d'avant n'y voit pas de champ inconnu.
  assert.equal('etats' in versEnregistrement({ nom: 'x', actions: [] }), false);
});

test('la fiche : une troisième nature, lue au serveur, relue à chaque choix', () => {
  const f = src('fichescenario.jsx');
  assert.match(f, /\(capturer \|\| nature === 'maison'\) && <button aria-pressed=\{nature === 'maison'\}/, 'la puce, seulement si le serveur sait capturer');
  assert.match(f, /useEffect\(\(\) => \{ if \(nature === 'maison' && !etatsInit\) reprendre\(\); \}, \[\]\);/, 'ouverte par le bouton, la fiche lit la maison tout de suite');
  assert.match(f, /const basculerFamille = [^\n]*reprendre\(v\);/);
  assert.match(f, /const choisirEtendue = [^\n]*reprendre\(familles, e\);/);
  assert.match(f, /const choisirPiece = [^\n]*reprendre\(familles, 'piece', p\);/);
  assert.match(f, /etats: maison \? s\.etats : null,/, 'composé ou lié, l’état part à null');
  assert.match(f, /if \(maison && !\(s\.etats && Object\.keys\(s\.etats\)\.length\)\) \{ setErr\(/, 'rien de retenu : rien d’enregistré');
  assert.match(f, /nature === 'maison' \? blocMaison : nature === 'lie' \?/);
  assert.match(f, /<ListeChoix value=\{pieceCap\}/, 'la pièce par la liste maison, jamais un <select>');
});

test('la vue : le bouton, visible hors édition, pour un administrateur et un serveur qui sait', () => {
  const v = src('vues/scenarios.jsx');
  assert.match(v, /const peutCapturer = !!\(sc\.etat && sc\.etat\.instantane\) && !compteOrdinaire\(hass\);/);
  assert.match(v, /\{peutCapturer && \(\s*<button type="button" onClick=\{\(\) => setFiche\('maison'\)\}/);
  assert.match(v, /natureInitiale=\{fiche === 'maison' \? 'maison' : null\} capturer=\{peutCapturer \? sc\.capturer : null\}/);
  const a = src('app/scenarios.jsx');
  assert.match(a, /type: 'loggia\/scenarios\/capturer', familles, portee/);
  assert.match(a, /s\.etats \? trN\(Object\.keys\(s\.etats\)\.length, '\{n\} appareil', '\{n\} appareils'\)/);
  assert.match(src('refus.js'), /trop_d_etats: /);
});

test('la démo porte le cas : elle capture, elle garde, elle relance', () => {
  const d = src('demo.js');
  assert.match(d, /msg\.type === 'loggia\/scenarios\/capturer'\) return Promise\.resolve\(scenariosCapturer\(msg, states\)\)/);
  assert.match(d, /lampes: scnCapacites\(states\), instantane: true \};/);
  assert.match(d, /if \(\(st\.state !== 'on' && st\.state !== 'off'\) \|\| scnEpargnee\(id, states\)\) return;/, 'jamais la veilleuse');
  assert.match(d, /const r = appliquerLumiereDemo\(st, hid, v\.on \? 'turn_on' : 'turn_off', data\);/);
  assert.match(d, /etats: s\.etats \|\| null, accueil:/);
});

test('la démo lit `brightness` comme Home Assistant : Annuler rend le niveau exact', async () => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
  const { appliquerLumiereDemo } = await import('../src/demo.js');
  const cur = { state: 'on', attributes: { brightness: 51, supported_color_modes: ['brightness'] } };
  assert.equal(appliquerLumiereDemo(cur, 'light.x', 'turn_on', { brightness: 255 }).attributes.brightness, 255);
  assert.equal(appliquerLumiereDemo(cur, 'light.x', 'turn_on', { brightness_pct: 50 }).attributes.brightness, 128);
  // Les cibles d'une maison enregistrée : ce qui diffère, comme au serveur — juste enregistrée, aucune.
  assert.match(readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8'), /n: Object\.keys\(s\.etats\)\.filter\(id => scnDiffere\(id, s\.etats\[id\], states\)\)\.length/);
});
