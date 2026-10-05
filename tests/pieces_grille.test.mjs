/* Renommer, retirer ou ajouter une pièce depuis un compte ordinaire (audit du
 * 03/10).
 *
 * La pièce (`loggia_rooms`) est réservée aux administrateurs ; sa place sur
 * l'Accueil (`loggia_accueil`) n'est que de l'agencement, ouvert à tous
 * (ADR 0125). Elles partaient en DEUX envois : la pièce était refusée, la
 * grille acceptée — et la carte perdait sa taille et sa place pour tout le
 * foyer, alors que la pièce n'avait pas bougé.
 *
 * Ces tests rejouent les vrais modules : `ecrirepiece.js` compose le lot,
 * `state.js` l'envoie. Seul le composant est en doublure, avec la règle de
 * `_set_locked` (store.py) : une clé de la maison depuis un compte ordinaire,
 * et le lot ENTIER est refusé avant la moindre écriture. Cette moitié-là,
 * tests/python/test_store.py la garde sur le vrai magasin. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cfgSet, setLoggiaState } from '../src/state.js';
import { lotPiece, lotSansPiece, grilleAvecPiece, grilleSansPiece } from '../src/ecrirepiece.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/* La maison : deux pièces, leur place sur l'Accueil, la grille de la vue du Salon. */
const ACCUEIL = {
  tailles: { Salon: 'c', Cuisine: 's' },
  places: { Salon: { c: 1, r: 1 }, Cuisine: { c: 2, r: 1 } },
  piecesOrdre: ['Salon', 'Cuisine'],
};
const maison = () => JSON.parse(JSON.stringify({
  loggia_rooms: [{ room: 'Salon' }, { room: 'Cuisine' }],
  loggia_roomlayout: { Salon: { larges: ['light.plafonnier'] } },
  loggia_accueil: ACCUEIL,
}));

/* Le composant en doublure : la règle de `_set_locked`, rien de plus. */
const RESERVEES = new Set(['loggia_rooms', 'loggia_users', 'loggia_cameras', 'loggia_alarm']);
let serveur;
let envois;
let admin;
const composant = async (patch) => {
  envois.push(Object.keys(patch).sort());
  if (!admin && Object.keys(patch).some(k => RESERVEES.has(k))) return false;
  Object.keys(patch).forEach((k) => { if (patch[k] == null) delete serveur[k]; else serveur[k] = patch[k]; });
  return true;
};

beforeEach(() => {
  serveur = maison();
  envois = [];
  admin = false;
  setLoggiaState({ cfg: maison(), server: true, save: composant });
});

/* Ce que fait l'Accueil (`saveAccL`) : sa grille et le lot de la pièce, en UN
 * envoi. Le câblage lui-même se vérifie dans App.jsx, en bas de ce fichier. */
const envoyer = (grille, lot) => cfgSet({ loggia_accueil: { ...ACCUEIL, ...grille }, ...lot });

test('renommer depuis un compte ordinaire : tout est refusé, la carte garde sa taille et sa place', async () => {
  const pris = await envoyer(grilleAvecPiece(ACCUEIL, 'Salon', 'Séjour', true), lotPiece('Salon', { room: 'Séjour' }));
  assert.equal(pris, false, 'le refus doit remonter jusqu’à l’Accueil, qui reprend sa grille à l’écran');
  assert.deepEqual(envois, [['loggia_accueil', 'loggia_roomlayout', 'loggia_rooms']],
    'la pièce, la grille de sa vue et sa place sur l’Accueil : UN envoi');
  assert.deepEqual(serveur, maison(), 'la grille commune a bougé sans la pièce');
});

test('retirer depuis un compte ordinaire : la pièce reste, et sa place avec elle', async () => {
  const pris = await envoyer(grilleSansPiece(ACCUEIL, 'Salon'), lotSansPiece('Salon'));
  assert.equal(pris, false);
  assert.equal(envois.length, 1, 'un seul envoi');
  assert.deepEqual(serveur, maison(), 'la grille a oublié une pièce qui existe toujours');
});

test('ajouter depuis un compte ordinaire : aucune taille orpheline', async () => {
  const pris = await envoyer(grilleAvecPiece(ACCUEIL, null, 'Grenier', true), lotPiece(null, { room: 'Grenier' }));
  assert.equal(pris, false);
  assert.deepEqual(serveur.loggia_accueil, ACCUEIL, 'la première pièce « Grenier » venue hériterait de cette taille');
});

test('un administrateur : la pièce, la grille de sa vue et sa place arrivent ensemble', async () => {
  admin = true;
  assert.equal(await envoyer(grilleAvecPiece(ACCUEIL, 'Salon', 'Séjour', true), lotPiece('Salon', { room: 'Séjour' })), true);
  assert.deepEqual(serveur.loggia_rooms.map(r => r.room), ['Séjour', 'Cuisine']);
  assert.deepEqual(serveur.loggia_roomlayout, { 'Séjour': { larges: ['light.plafonnier'] } }, 'la grille de la vue suit le nouveau nom');
  assert.deepEqual(serveur.loggia_accueil.tailles, { Cuisine: 's', 'Séjour': 'c' });
  assert.deepEqual(serveur.loggia_accueil.places['Séjour'], { c: 1, r: 1 }, 'la carte ne saute pas ailleurs');
  assert.deepEqual(serveur.loggia_accueil.piecesOrdre, ['Séjour', 'Cuisine'], 'elle garde son rang');
});

test('retirer en administrateur : sa ligne, la grille de sa vue et sa place partent ensemble', async () => {
  admin = true;
  assert.equal(await envoyer(grilleSansPiece(ACCUEIL, 'Salon'), lotSansPiece('Salon')), true);
  assert.deepEqual(serveur.loggia_rooms.map(r => r.room), ['Cuisine']);
  assert.equal(serveur.loggia_roomlayout, undefined, 'une table de grilles vide s’efface');
  assert.deepEqual(serveur.loggia_accueil, { tailles: { Cuisine: 's' }, places: { Cuisine: { c: 2, r: 1 } }, piecesOrdre: ['Cuisine'] });
});

test('contre-épreuve : en deux envois, la grille passait sans la pièce', async () => {
  // L'ordre d'avant le 03/10 : la pièce, puis la grille, chacune seule.
  assert.equal(await cfgSet(lotSansPiece('Salon')), false, 'la pièce est refusée…');
  assert.equal(await cfgSet({ loggia_accueil: { ...ACCUEIL, ...grilleSansPiece(ACCUEIL, 'Salon') } }), true, '… la grille acceptée');
  assert.deepEqual(serveur.loggia_rooms, maison().loggia_rooms, 'le Salon existe toujours');
  assert.equal(serveur.loggia_accueil.tailles.Salon, undefined, 'et la grille commune l’a oublié : le défaut, que la doublure sait donc voir');
});

test('le module compose, il n’envoie rien, et ne touche pas la grille reçue', () => {
  lotPiece('Salon', { room: 'Séjour' });
  lotSansPiece('Cuisine');
  grilleSansPiece(ACCUEIL, 'Salon');
  assert.deepEqual(grilleAvecPiece(ACCUEIL, null, 'Grenier', false).tailles, { Salon: 'c', Cuisine: 's', Grenier: 's' });
  assert.deepEqual(envois, [], 'un envoi parti d’ici serait un second lot');
  assert.deepEqual(ACCUEIL.tailles, { Salon: 'c', Cuisine: 's' }, 'la grille reçue a été modifiée en place');
});

test('cfgSet rend l’issue : faux au refus, vrai sans composant', async () => {
  assert.equal(await cfgSet({ loggia_rooms: [] }), false);
  setLoggiaState({ save: null });
  assert.equal(await cfgSet({ loggia_accueil: ACCUEIL }), true, 'sans composant, l’appareil garde le réglage : rien n’est refusé');
  assert.equal(await cfgSet(null), null);
});

test('le câblage : l’Accueil envoie la pièce et sa grille en UN lot, et rien de refusé ne reste à l’écran', () => {
  const corps = (debut) => {
    const i = APP.indexOf(debut);
    assert.ok(i >= 0, debut + ' introuvable');
    return APP.slice(i, APP.indexOf('\n  };', i));
  };
  const sauver = corps('const saveAccL = (n, avec) => {');
  assert.ok(sauver.includes('cfgSet({ loggia_accueil: n, ...avec })'), 'la grille et la pièce repartiraient en deux envois');
  assert.ok(sauver.includes('if (pris !== false) return;') && sauver.includes('setAccL(cur => (cur === n ? avant : cur));'),
    'refusée, la grille resterait à l’écran — et le geste suivant la réécrirait dans le commun');
  assert.equal(corps('const saveGrille = (g, avec) => {').split(', avec);').length - 1, 2, 'un format perd le lot en route');
  for (const [geste, appel] of [
    ['const enregistrerPieceIci = (', 'saveGrille(grilleAvecPiece(grille, avant, piece.room, compacte), lotPiece(avant, piece));'],
    ['const retirerPiece = (', 'saveGrille(grilleSansPiece(grille, nom), lotSansPiece(nom));'],
  ]) {
    const c = corps(geste);
    assert.ok(c.includes(appel), geste + ' n’envoie plus la pièce avec sa grille');
    assert.equal((c.match(/saveGrille\(|cfgSet\(|enregistrerPiece\(|supprimerPiece\(/g) || []).length, 1, geste + ' écrit en deux fois');
  }
  // `saveCfg` rend l'issue au lieu de la taire, raye du carnet ce qui est
  // refusé, et rend à chaque clé refusée sa valeur d'avant : sans ce dernier
  // point, revenir sur l'Accueil relisait la grille refusée (`accL` naît de
  // `cfgVal`), et le geste suivant, accepté, la réécrivait dans le commun.
  const debut = APP.indexOf('const saveCfg = useCallback((patch) => {');
  const save = APP.slice(debut, APP.indexOf('  }, []);', debut));
  assert.ok(save.includes("return h.callWS({ type: 'loggia/config/set', config: patch })") && save.includes('return false;') && save.includes('return Promise.resolve(true);'),
    'saveCfg tait de nouveau l’issue');
  // Rayé au succès comme au refus — sous le compte qui écrit (carnet par compte, audit du 03/10).
  assert.equal((save.match(/purgerEnAttente\(marques, compte\)/g) || []).length, 2, 'un lot refusé resterait au carnet');
  assert.ok(save.includes('const avantEnvoi = {};') && save.includes('avantEnvoi[k] = c[k];'), 'la valeur d’avant l’envoi n’est plus relevée');
  assert.ok(save.includes('if (avantEnvoi[k] === undefined) delete n[k]; else n[k] = avantEnvoi[k];'),
    'refusée, une clé garderait toute la séance sa valeur optimiste — et un écran remonté la relirait');
});
