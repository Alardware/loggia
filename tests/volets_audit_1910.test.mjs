// Audit des volets du 19/10 — les corrections qu'il a acceptées (« ok »).
//
// 1. Les commandes GROUPÉES ne touchent que les volets (V3, ouvrants.py) :
//    « Ouvrir / Stop / Fermer » de la vue « modes et planning », le bouton de
//    pièce de l'Accueil et « Aérer » prenaient tout le domaine `cover` —
//    garage, portail, velux, groupes compris. Le serveur, lui, les écartait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const A = await import('../src/air.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

test('« Aérer » n’ouvre que les volets de la zone, jamais le garage ni le portail', () => {
  const S = {
    'cover.volet': { state: 'closed', attributes: { supported_features: 15, device_class: 'shutter' } },
    'cover.store': { state: 'closed', attributes: { supported_features: 15, device_class: 'awning' } },
    'cover.garage': { state: 'closed', attributes: { supported_features: 3, device_class: 'garage' } },
    'cover.portail': { state: 'closed', attributes: { supported_features: 3, device_class: 'gate' } },
    'cover.sans_classe': { state: 'closed', attributes: { supported_features: 15 } },
  };
  const index = { areaOf: () => 'z', areaList: [{ id: 'z', entities: Object.keys(S) }] };
  assert.deepEqual(A.voletsDeLaZone(index, S, 'sensor.co2'), ['cover.volet', 'cover.store']);
});

/* La fonction entière, de sa signature à son accolade de fin. */
function corps(src, debut) {
  const i = src.indexOf(debut);
  assert.ok(i >= 0, 'introuvable : ' + debut);
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j + 2);
}

test('un seul filtre pour les commandes groupées : la classe du volet', () => {
  const app = (lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx'));
  const f = corps(app, 'function voletsCommandables(S)');
  assert.ok(f.includes('estVolet('), 'le filtre lit la classe, comme le serveur');
  assert.ok(f.includes('voletCovers(S)'), 'il part de la liste configurée ou découverte');
});

test('la vue « modes et planning » : Ouvrir, Stop et Fermer ne visent que les volets', () => {
  const v = corps((lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx')), 'function VoletsContent(');
  const ouvrir = v.slice(v.indexOf('const allOpen'), v.indexOf('\n', v.indexOf('const allOpen')));
  const fermer = v.slice(v.indexOf('const allClose'), v.indexOf('\n', v.indexOf('const allClose')));
  /* ASSERTION MODIFIÉE (19/10) : Ouvrir, Fermer et Stop passent par `chaqueVolet` — un ordre par volet, celui qu'il accepte
   * (`gestesCover`), et sa course ; le filtre reste `voletsCommandables(S)`. */
  const chaque = v.slice(v.indexOf('const chaqueVolet'), v.indexOf('const allStop'));
  assert.ok(chaque.includes('voletsCommandables(S)') && chaque.includes('gestesCover('), chaque);
  for (const [l, f] of [[ouvrir, 'ordreEtCourse(id, 100'], [fermer, 'ordreEtCourse(id, 0']]) assert.ok(l.includes("chaqueVolet(") && l.includes(f), l);
  assert.ok(/const allStop = \(\) => \{ chaqueVolet\('stop', ordreEtArret\); \};/.test(v), 'Stop fige la course de chaque volet');
  assert.ok(!/call\('cover', '(open|close|stop)_cover', \{ entity_id: voletCovers\(/.test(v), 'plus aucun ordre groupé sur tout le domaine');
});

test('la vue « modes et planning » compte les volets, et un volet muet n’est pas « ouvert »', () => {
  const v = corps((lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx')), 'function VoletsContent(');
  const l = v.slice(v.indexOf('const volets = covers'), v.indexOf('\n', v.indexOf('const openCount')));
  assert.ok(l.includes('estVolet('), l);
  assert.ok(/const openCount = volets\.filter\(c => !estMuetVolet\(/.test(l), l);
  assert.ok(v.includes("trN(nVolets, '{n} volet', '{n} volets')"), 'le sous-titre compte les volets seulement');
});

test('le bouton de pièce de l’Accueil ne commande que les volets de la pièce', () => {
  const app = (lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx'));
  const i = app.indexOf('const roomExtras = useMemo(');
  const bloc = app.slice(i, app.indexOf('}, [dashHass, a]);', i));
  assert.ok(bloc.includes('voletsCommandables(S)'), 'la pastille ne prend plus le garage ou le portail de la pièce');
});

// 2. Le mode de la maison n'a plus de commande dans Paramètres (sa règle
//    « rien en double dans Paramètres », décision du 19/10) : il s'y DIT, et
//    se choisit dans la popup d'un volet ou la vue « modes et planning ». Après
//    une écriture, le cache des cartes se relit.

test('Paramètres dit le mode sans le commander, et relit le cache des cartes', () => {
  const v = lire('src', 'views', 'volets.jsx');
  assert.ok(!v.includes("enregistrer({ planning: { mode: id } })"), 'plus de puces de mode');
  assert.ok(v.includes("tr('Mode : {mode}. Il se choisit dans la popup d’un volet, ou dans Volets › modes et planning.'"));
  const e = v.slice(v.indexOf('const enregistrer = async'), v.indexOf('} catch (e) {', v.indexOf('const enregistrer = async')));
  assert.ok(e.includes('rafraichirVolets()'), e);
  const app = (lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx'));
  const p = app.slice(app.indexOf('const pickModeLoggia'), app.indexOf('};', app.indexOf('const pickModeLoggia')));
  assert.ok(p.includes('rafraichirVolets()'), p);
  assert.ok(lire('src', 'fichevolet.jsx').includes("tr('Mode de la maison')"), 'la popup garde le mode');
});

test('l’avertissement « sans classe » ne dépend plus du pli ni du planning', () => {
  const v = lire('src', 'views', 'volets.jsx');
  const pli = v.indexOf('{plan.actif && !pliPlan && (');
  const fin = v.indexOf('{/* ── La protection solaire ── */}');
  const avert = v.indexOf("tr('Ouvrants sans classe dans Home Assistant");
  assert.ok(pli > 0 && avert > pli && avert < fin, 'dans la carte du planning');
  // Le bloc conditionnel se ferme AVANT la ligne « Chaque volet se règle… ».
  const ligne = v.indexOf("tr('Chaque volet se règle dans sa popup");
  const entre = v.slice(pli, ligne);
  assert.ok(entre.includes('\n        )}\n'), 'hors du bloc conditionnel du planning');
  assert.ok(ligne < avert);
});

// 3. La fiche d'un ouvrant qui n'est pas un volet ne dit plus « Suit le
//    soleil » (le planning ne le pilote pas) ; sans classe, elle dit pourquoi.

test('la fiche d’un garage ou d’un ouvrant sans classe ne ment plus sur le planning', () => {
  const app = (lire('src', 'App.jsx') + lire('src', 'views', 'voletsplan.jsx'));
  const f = app.slice(app.indexOf('function RoomCoverSheet('), app.indexOf('function RoomClimateSheet('));
  assert.ok(!f.includes("'loggia/volets/etat'"), 'plus de lecture du planning');
  assert.ok(!f.includes("'loggia/volets/config'"), 'plus d’écriture du planning');
  assert.ok(!f.includes('Suit le soleil'), 'plus de « Suit le soleil »');
  assert.ok(f.includes('const sansClasse = !!st && !a.device_class;'));
  assert.ok(f.includes("tr('Il n’a pas de classe dans Home Assistant. Donnez-lui la classe Volet ou Store pour qu’il suive le planning.')"));
});

// 4. Le français VOUVOIE (sa règle, 19/10) : trois textes des volets tutoyaient
//    (« Donne-lui », « Donne-leur », « chez toi »). L'allemand et l'espagnol, eux,
//    tutoient comme Home Assistant ; le polonais ne se réécrit jamais.
test('les textes français des volets vouvoient', () => {
  const fichiers = [['src', 'fichevolet.jsx'], ['src', 'views', 'volets.jsx'], ['src', 'voletsfiche.js'],
    ['src', 'voletecran.js'], ['src', 'entetevolets.jsx'], ['src', 'views', 'voletsplan.jsx']];
  const textes = fichiers.flatMap((p) => [...lire(...p).matchAll(/tr\('((?:[^'\\]|\\.)*)'/g)].map(m => [p.join('/'), m[1]]));
  assert.ok(textes.length > 50, 'les textes ne sont plus lus : ' + textes.length);
  const tutoie = textes.filter(([, t]) => /(^|[.:!?]\s)(Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Tape|Fais|Va|Donne|Règle|Mets|Garde)\b/.test(t)
    || /\b(tu|ton|ta|tes|toi|te)\b/i.test(t) || /Donne-(lui|leur)/.test(t));
  assert.deepEqual(tutoie, [], 'tutoiement');
  assert.ok(lire('src', 'App.jsx').includes("tr('Il n’a pas de classe dans Home Assistant. Donnez-lui la classe Volet ou Store pour qu’il suive le planning.')"));
});

// 5. Le store banne au soleil (sa demande du 25/10) : la protection le DÉPLOIE
//    au lieu de le « baisser » à 30 % ; l'écran le dit.
test('la fiche et Paramètres disent qu’un store banne se déploie au soleil', () => {
  const f = lire('src', 'fichevolet.jsx');
  assert.ok(f.includes("=== 'awning' ? tr('Se déploie quand le soleil tape et qu’il fait chaud') : tr('Descend quand le soleil tape et qu’il fait chaud')"));
  assert.ok(lire('src', 'views', 'volets.jsx').includes("tr('Un store banne, lui, se déploie en entier, puis se replie quand le soleil quitte sa façade.')"));
});
