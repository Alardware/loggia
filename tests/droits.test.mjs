// ─────────────────────────────────────────────────────────────────────────────
// Confier une seule chose, sans donner les clés de la maison.
//
// Un profil « Famille » voyait déjà moins — sa clé `vues` restreint les vues
// qu'il atteint. Mais il ne POUVAIT rien : automatisations, règles, entités,
// mises à jour, mode édition, tout était réservé à l'administrateur. Confier
// le réglage des volets à quelqu'un demandait d'en faire un administrateur,
// c'est-à-dire de lui donner du même geste la gestion des profils et le code
// admin.
//
// `DROITS` rouvre ces sections une par une. Ce fichier tient les deux bouts :
// que le catalogue et les gardes disent la même chose, et que ce qui ne doit
// jamais s'accorder ne s'accorde pas.
//
// Le second point est le seul qui compte vraiment. Accorder la gestion des
// profils laisserait quelqu'un cocher « Admin » sur son propre profil ; le
// réglage entier n'aurait plus de sens. Ce n'est pas une préférence, c'est ce
// qui rend le reste tenable — d'où un test, et pas un commentaire.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DROITS, DROITS_IDS, droitsDe } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

test('un administrateur a tout, sans que rien ne soit écrit dans son profil', () => {
  // Un admin n'a pas de liste : il a le rôle. Lui en stocker une ferait deux
  // vérités pour une seule, et la deuxième se périmerait au premier ajout.
  assert.deepEqual(droitsDe({ role: 'Admin' }), DROITS_IDS);
  assert.deepEqual(droitsDe({ role: 'Admin', droits: [] }), DROITS_IDS);
});

test('rien de coché = aucune autorisation', () => {
  // L'INVERSE de `vues`, où rien de coché veut dire « tout est visible ». Une
  // restriction se lève par défaut, un pouvoir se donne exprès.
  assert.deepEqual(droitsDe({ role: 'Famille' }), []);
  assert.deepEqual(droitsDe({ role: 'Famille', droits: [] }), []);
  assert.deepEqual(droitsDe(null), []);
  assert.deepEqual(droitsDe(undefined), []);
});

test('un profil ne reçoit que ce qu’on lui a coché', () => {
  assert.deepEqual(droitsDe({ role: 'Famille', droits: ['auto', 'regles'] }), ['auto', 'regles']);
});

test('un droit venu d’une version plus récente est ignoré', () => {
  // Les profils sont synchronisés entre appareils par `loggia_users`. Une
  // version plus récente peut nommer un droit que celle-ci ne connaît pas ; le
  // laisser passer ferait apparaître une section qu'aucun rendu n'attend.
  assert.deepEqual(droitsDe({ role: 'Famille', droits: ['auto', 'teleportation'] }), ['auto']);
  assert.deepEqual(droitsDe({ role: 'Famille', droits: 'auto' }), []);
});

test('la gestion des profils et le code admin ne sont jamais accordables', () => {
  // Les accorder laisserait quelqu'un se promouvoir administrateur lui-même.
  for (const interdit of ['users', 'profils', 'pin', 'admin', 'role']) {
    assert.ok(DROITS_IDS.indexOf(interdit) < 0,
      `« ${interdit} » est entré dans le catalogue : un profil pourrait se promouvoir lui-même`);
  }
  // Les trois gardes qui tiennent cette promesse, relues dans la source : le
  // bouton d'ajout, le crayon de chaque ligne, et l'éditeur du code.
  const par = lire('src', 'views', 'parametres.jsx');
  for (const garde of ['{isAdmin && <SecGroup label="Profils">',
    '{isAdmin && <AdminPinEditor />}',
    '{editing && isAdmin && <UserEditor']) {
    assert.ok(par.indexOf(garde) >= 0,
      `cette garde ne dépend plus du rôle : ${garde}`);
  }
});

test('chaque autorisation du catalogue commande vraiment quelque chose', () => {
  // Une case à cocher qui n'ouvre rien est pire qu'une case absente : elle
  // promet. Chaque identifiant est donc relu dans le code qu'il gouverne.
  const par = lire('src', 'views', 'parametres.jsx');
  const app = lire('src', 'App.jsx');
  const sansGarde = [];
  for (const [id] of DROITS) {
    // `edition` est le seul droit qui ne soit pas un onglet des Paramètres.
    const garde = id === 'edition'
      ? app.indexOf("const peutEditer = droits.indexOf('edition') >= 0;") >= 0
      : par.indexOf("{tab === '" + id + "' && aD('" + id + "') &&") >= 0;
    if (!garde) sansGarde.push(id);
  }
  assert.deepEqual(sansGarde, [],
    'une autorisation figure au catalogue sans rien commander : la case promet un pouvoir qu’elle ne donne pas');
});

test('aucun onglet accordable ne reste verrouillé sur le rôle', () => {
  // Le miroir du test précédent. Remettre `isAdmin` à la place de `aD('auto')`
  // rendrait la case inopérante sans que rien d'autre ne bronche.
  const par = lire('src', 'views', 'parametres.jsx');
  const verrouilles = DROITS_IDS
    .filter(id => id !== 'edition')
    .filter(id => par.indexOf("{tab === '" + id + "' && isAdmin &&") >= 0);
  assert.deepEqual(verrouilles, [],
    'un onglet accordable est encore gardé par le rôle : la case se coche et ne fait rien');
});

test('le sommaire des Paramètres suit les autorisations, pas le rôle', () => {
  // La liste des sections et leur rendu doivent s'accorder : une section
  // listée qui ne rend rien est un cul-de-sac, l'inverse est introuvable.
  const par = lire('src', 'views', 'parametres.jsx');
  assert.ok(par.indexOf('.filter(x => !x.admin || aD(x.id))') >= 0,
    'le sommaire est revenu au rôle : une section accordée n’y apparaîtrait plus');
});

test('le mode édition se ferme quand le droit disparaît', () => {
  // Changer de profil en cours d'édition laisserait autrement les poignées de
  // déplacement à l'écran, sous un profil qui n'y a pas droit.
  const app = lire('src', 'App.jsx');
  assert.ok(app.indexOf('useEffect(() => { if (!peutEditer) setEditMode(false); }, [peutEditer]);') >= 0,
    'plus rien ne referme le mode édition quand le droit est retiré');
  assert.ok(app.indexOf('editMode && isAdmin') < 0,
    'une vue éditable est restée gardée par le rôle : le bouton disparaît, les poignées restent');
});

test('la recherche ne propose pas une section qu’on ne peut pas ouvrir', () => {
  // La trouver pour tomber sur une page vide serait pire que ne pas la trouver.
  const app = lire('src', 'App.jsx');
  assert.ok(app.indexOf('if (droit && droits.indexOf(droit) < 0) return;') >= 0,
    'la recherche ne filtre plus les sections des Paramètres');
});

test('le rôle ne garde plus rien qui relève du mode édition', () => {
  // Le test précédent cherchait `editMode && isAdmin`. Il a laissé passer un
  // quatorzième usage, écrit autrement : sur l'Accueil, la barre d'édition
  // dépendait de `onEnt={isAdmin ? … : null}`, sans `editMode &&` devant.
  //
  // Le résultat n'était pas « rien ne se passe », ce qui aurait sauté aux yeux,
  // mais un mode édition à moitié : les poignées de déplacement apparaissaient,
  // les cartes se supprimaient, et la barre manquait — ni Défaire, ni Refaire,
  // ni « Entités de la vue », ni le réglage de la bannière.
  //
  // D'où un contrôle qui ne cherche plus une tournure mais compte les usages.
  // `isAdmin` n'a plus le droit d'apparaître que là où il désigne le rôle
  // lui-même, restreint les vues, ou passe aux Paramètres — qui gardent la
  // gestion des profils. En ajouter un oblige à passer par ici.
  const app = lire('src', 'App.jsx');
  const usages = (app.match(/isAdmin[^,}\n]{0,60}/g) || []).map(s => s.trim()).sort();
  assert.deepEqual(usages, [
    // Les vues autorisées : un admin n'en a aucune de restreinte.
    'isAdmin && users[userIdx] && Array.isArray(users[userIdx].vues) &&',
    // La définition, et la seule.
    "isAdmin = !!(users[userIdx] && users[userIdx].role === 'Admin');",
    // La signature de `ParametresView`, puis les deux passages de la prop.
    'isAdmin',
    'isAdmin={isAdmin',
    'isAdmin={isAdmin',
  ].sort(), 'le rôle sert de nouveau à garder un pouvoir : c’est `peutEditer` qu’il faut, ou une autorisation du catalogue');

  assert.ok(app.indexOf('onEnt={isAdmin') < 0,
    'la barre d’édition d’une vue dépend de nouveau du rôle : un profil autorisé aurait les poignées sans les commandes');
});
