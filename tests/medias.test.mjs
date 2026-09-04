// ─────────────────────────────────────────────────────────────────────────────
// Le navigateur de médias : on demande au lecteur, on ne devine pas.
//
// Home Assistant expose l'arbre PAR LECTEUR — un Chromecast propose les
// sources partagées, un Apple TV ses applications. Rien ne doit donc être
// codé en dur sur ce qu'une installation contient : Loggia affiche ce que le
// lecteur répond, et rien d'autre.
//
// Le piège est le silence. Un lecteur qui ne sait rien proposer, une requête
// qui échoue, un dossier réellement vide : trois situations différentes qui
// produisent toutes une liste sans élément. Les confondre donnerait un écran
// blanc qu'on prendrait pour un chargement sans fin.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

function corps(entete) {
  const i = src.indexOf(entete);
  assert.notEqual(i, -1, `${entete} introuvable`);
  const fin = src.indexOf('\nfunction ', i + entete.length);
  assert.notEqual(fin, -1, `fin de ${entete} introuvable`);
  return src.slice(i, fin);
}

test('l’arbre est demandé au lecteur, pas deviné', () => {
  const c = corps('function NavigateurMedias(');
  assert.match(c, /type: 'media_player\/browse_media', entity_id: id/,
    'l’arbre n’est plus demandé au lecteur lui-même');
  // Le premier niveau n'envoie PAS de media_content_id : c'est ce qui demande
  // la racine. En envoyer un vide ferait répondre « introuvable ».
  assert.match(c, /\.\.\.\(niveau\.cid \? \{ media_content_id/,
    'la racine n’est plus demandée sans identifiant');
});

test('les trois silences ne se confondent pas', () => {
  const c = corps('function NavigateurMedias(');
  for (const [quoi, jeton] of [
    ['le chargement', "setEtat('charge')"],
    ['l’échec', "setEtat('erreur')"],
    ['le dossier vide', "'vide'"],
  ]) {
    assert.ok(c.includes(jeton), `${quoi} n’a plus son propre état`);
  }
  // Et chacun dit quelque chose à l'écran.
  assert.match(c, /etat === 'erreur' &&/, 'l’échec ne s’affiche plus');
  assert.match(c, /etat === 'vide' &&/, 'le dossier vide ne s’affiche plus');
});

test('on n’ouvre que ce qui s’ouvre, on ne joue que ce qui se joue', () => {
  const c = corps('function NavigateurMedias(');
  const i = c.indexOf('const ouvrir =');
  const f = c.slice(i, c.indexOf('const remonter', i));
  assert.match(f, /if \(c\.can_expand\)/, 'un dossier n’est plus reconnu comme tel');
  assert.match(f, /if \(!c\.can_play\) return;/,
    'un élément non jouable partirait quand même au lecteur');
  assert.match(f, /'media_player', 'play_media'/, 'la lecture n’est plus envoyée');
});

test('revenir en arrière relit, plutôt que de tout garder', () => {
  const c = corps('function NavigateurMedias(');
  // Un lecteur peut offrir des milliers de radios : garder l'arbre entier en
  // mémoire pour pouvoir remonter serait payer cher un simple retour.
  assert.match(c, /setPile\(p => \(p\.length > 1 \? p\.slice\(0, -1\) : p\)\)/,
    'le retour ne dépile plus');
  assert.match(c, /\[id, niveau\.cid, niveau\.ctype\]/,
    'changer de niveau ne relance plus la lecture de l’arbre');
});
