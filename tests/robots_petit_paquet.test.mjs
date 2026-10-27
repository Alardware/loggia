/* TEST AJOUTÉ (petit paquet du 25/10 ; tranche robots 2, ADR 0218) — quatre défauts mineurs laissés par la tranche :
 *  - point 2 : le faux serveur de la démo publie, comme le vrai, l'aspirateur PRINCIPAL qu'il retient (`principal`) ;
 *  - point 3 : « Localiser » se décide au SERVEUR — l'écran envoie `localiser: true` et ne lit plus la description de la maison dans
 *    le cache de son onglet (`cfgVal`) ni l'aspirateur que la découverte prend (`LOGGIA_RESOLVED`) ; la démo, comme le vrai : son
 *    script s'il en désigne un, sinon rien ne bouge — jamais un départ à la place ;
 *  - point 4 : une description de la maison illisible a son code, et l'écran le dit en une phrase, dans les sept langues.
 * Le point 1 (`fullmatch`) et le serveur des points 2 à 4 : tests/python/test_robots.py. La popup (point 2) : tests/fiche_robot.test.mjs. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { texteRefus, enregistrerRefus, raisonEchec } = await import('../src/refus.js');
const { REFUS_ROBOTS } = await import('../src/refusrobots.js');
enregistrerRefus(REFUS_ROBOTS);
const RE = await import('../src/robotsetat.js');
const { maisonRobotsDemo } = await import('../src/demo.js');

const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const QUAND = new Date(2026, 9, 17, 18, 20).getTime();
const ASP = 'vacuum.aspirateur';

test('point 4 : une description de la maison illisible se dit en une phrase — et pas par le refus générique', () => {
  const e = { code: 'description_illisible', message: 'description de la maison illisible : loggia_entities' };
  assert.equal(texteRefus(e), 'Script non désigné — la description de la maison est illisible');
  assert.equal(raisonEchec(e, 'loggia_entities'), 'Script non désigné — la description de la maison est illisible', 'la roue passe par `raisonEchec`');
  // Les six catalogues la traduisent ; le polonais l'ajoute à la fin, sous la consigne de relecture.
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    assert.ok(lire('src/langues/' + l + '.js').includes("'Script non désigné — la description de la maison est illisible': '"), l);
  }
  const pl = lire('src/langues/pl.js');
  const i = pl.indexOf("'Script non désigné — la description de la maison est illisible'");
  assert.ok(pl.lastIndexOf('Textes nouveaux, à relire par Seba882.', i) > pl.lastIndexOf("'Loggia ne rouvre jamais l’eau seule'"), 'un texte polonais neuf, sous la consigne, après les autres');
});

test('point 3 : « Localiser » part au serveur avec `localiser`, sans script ni rôle — l’onglet ne décide plus rien', async () => {
  const envois = [];
  const hass = { callWS: (msg) => { envois.push(msg); return Promise.resolve({ en_cours: {} }); } };
  RE.reglerRobotsEtat({ hass });
  const etat = await RE.lancerRobot(hass, ASP, [], { localiser: true, depart: false });
  assert.deepEqual(etat, { en_cours: {} });
  assert.deepEqual(envois.filter(m => m.type === 'loggia/robots/lancer'), [{ type: 'loggia/robots/lancer', robot: ASP, zones: [], localiser: true }]);
  assert.equal(RE.departRobot(ASP), null, 'un geste, pas un départ : rien ne se note pour la carte');
  RE.reglerRobotsEtat({});
  // Le geste de la carte : plus de cache de l'onglet, plus de l'aspirateur que la découverte prend.
  const app = lire('src/App.jsx');
  const corps = app.slice(app.indexOf('function localiserRobot('), app.indexOf('/* Ce que la carte, la compacte, la popup et « En ce moment » lisent'));
  assert.ok(corps.includes('localiser: true') && !corps.includes('cfgVal') && !corps.includes('LOGGIA_RESOLVED') && !corps.includes('script_inconnu'), corps);
  assert.ok(/invalid_format/.test(corps), 'un serveur d’avant refuse la clé : `locate` en direct, jamais un départ');
});

test('point 3, la démo : « Localiser » par le faux serveur — son script s’il en désigne un, sinon rien ne bouge ; jamais un départ', async () => {
  for (const variante of [null, 'scripts-sans-pieces']) {
    const m = maisonRobotsDemo({ quand: QUAND, variante });
    const avant = m.states[ASP].state;
    const etat = await m.lancer({ robot: ASP, zones: [], localiser: true });
    assert.equal(m.states[ASP].state, avant, (variante || 'défaut') + ' : le robot ne part pas');
    assert.ok(etat && etat.en_cours && !etat.en_cours[ASP], 'aucun passage ouvert');
  }
  const m = maisonRobotsDemo({ quand: QUAND });
  await assert.rejects(m.lancer({ robot: 'lawn_mower.tondeuse', zones: [], localiser: true }), { code: 'invalid_format' });
  m.states[ASP] = { ...m.states[ASP], state: 'unavailable' };
  await assert.rejects(m.lancer({ robot: ASP, zones: [], localiser: true }), { code: 'robot_injoignable' });
});

test('point 2, la démo : l’état publie l’aspirateur principal que le serveur retient', () => {
  const m = maisonRobotsDemo({ quand: QUAND, variante: 'scripts-sans-pieces' });
  const etat = m.etat();
  assert.equal(etat.principal, ASP, 'un seul aspirateur : lui');
  assert.ok(Object.keys(etat.pieces[ASP].scripts).length > 0, 'ses scripts, puisqu’il est le principal');
  // Nommé ailleurs, vers un aspirateur absent, et un seul présent : lui encore (la règle du serveur).
  assert.equal(m.etat({ ...m.config().loggia_entities, vacuum: { main: 'vacuum.parti' } }).principal, ASP);
});
