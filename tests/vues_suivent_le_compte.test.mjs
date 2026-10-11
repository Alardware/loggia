// ─────────────────────────────────────────────────────────────────────────────
// Le menu suit le COMPTE, pas l'appareil (10/10).
//
// « Je me suis connecté en tant que Guillaume sur PC, j'ai activé désactivé des
// vues ; sur mobile, toujours en tant que Guillaume, rien, aucun changement. »
// Et l'issue #30 de Gunther1643, le même jour : « Il y a une différence
// d'interface entre la version PC et la version Téléphone. »
//
// La cause : `readViewsCfg` / `writeViewsCfg` parlaient au `localStorage` en
// direct, au lieu de passer par `cfgVal` / `cfgSet`. Chaque navigateur gardait
// donc son propre menu — alors que `loggia_customviews`, juste à côté, passait
// bien par le serveur. D'où le symptôme déroutant : les vues CRÉÉES arrivaient,
// celles MASQUÉES non.
//
// La règle qu'il a posée : « tout changement effectué sur l'un doit se faire
// sur l'autre, si je supprime ou ajoute quelque chose. La seule chose qui est
// propre à l'appareil, c'est ensuite la personnalisation, comme des cartes
// compactes sur l'un mais pas sur l'autre, ou des emplacements différents. »
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');

const UI = lire('src', 'ui.jsx');
const STATE = lire('src', 'state.js');
const STORE = lire('custom_components', 'loggia', 'store.py');

/** Le corps d'une fonction exportée de premier niveau. */
const corps = (src, nom) => {
  const i = src.indexOf('\nexport function ' + nom + '(');
  assert.ok(i >= 0, nom + ' a disparu');
  return src.slice(i + 1, src.indexOf('\n}\n', i) + 2);
};

const CLES = ['loggia-hiddenviews', 'loggia-shownviews', 'loggia-vueordre'];

test('la visibilité des vues passe par la configuration, jamais par le stockage local', () => {
  const lect = corps(UI, 'readViewsCfg');
  const ecr = corps(UI, 'writeViewsCfg');
  assert.ok(lect.includes('cfgVal('), 'readViewsCfg ne lit plus la configuration');
  assert.ok(ecr.includes('cfgSet('), 'writeViewsCfg n’écrit plus dans la configuration');
  // Le piège d'origine, nommé pour qu'il ne revienne pas en douce.
  for (const f of [lect, ecr]) {
    assert.ok(!/localStorage\.(get|set|remove)Item/.test(f),
      'les vues repassent par le stockage local : chaque appareil aurait de nouveau son propre menu');
  }
  for (const k of CLES) {
    assert.ok(lect.includes(k) || ecr.includes(k), k + ' n’est plus lue ni écrite');
  }
});

test('les trois clés du menu ne sont pas « propres à l’appareil », des deux côtés', () => {
  /* `estPersonnelle` (JS) et `est_personnelle` (Python) sont deux miroirs d'une
   * même liste. Une clé qui y entrerait cesserait de suivre le compte — et le
   * menu redeviendrait local sans que personne touche à `writeViewsCfg`. */
  const i = STATE.indexOf('const PERSONNELLES = new Set([');
  assert.ok(i > 0, 'la liste des réglages personnels a disparu de state.js');
  const listeJs = STATE.slice(i, STATE.indexOf(']);', i));
  const j = STORE.indexOf('PERSONAL_KEYS: frozenset[str] = frozenset(');
  assert.ok(j > 0, 'la liste des réglages personnels a disparu de store.py');
  const listePy = STORE.slice(j, STORE.indexOf('\n)', j));
  for (const k of CLES) {
    assert.ok(!listeJs.includes(k), k + ' est devenue personnelle côté écran');
    assert.ok(!listePy.includes(k), k + ' est devenue personnelle côté composant');
  }
  // Et aucune ne doit finir par « panel », suffixe qui bascule tout seul.
  for (const k of CLES) assert.ok(!k.endsWith('panel'), k + ' tomberait dans le suffixe personnel');
});

test('un compte ordinaire peut ranger son menu, et ça tient au rechargement', () => {
  /* « Et ça garde bien en mémoire ? Si je rafraîchis, ça ne revient pas comme
   * avant ? »
   *
   * Le passage à la configuration ne suffisait pas : `_set_locked` refuse une
   * clé de la maison à un compte qui n'est pas administrateur. Le geste se
   * serait affiché, puis serait revenu au rechargement — le symptôme décrit
   * dans la note d'APPARENCE, à deux pas dans le même fichier.
   *
   * Ranger son menu est de l'AGENCEMENT : une vue masquée se réaffiche, donc
   * l'erreur ne coûte rien. Créer une vue perso reste réservé, elle décide de
   * ce qu'elle montre. */
  const i = STORE.indexOf('AGENCEMENT: frozenset[str] = frozenset(');
  assert.ok(i > 0, 'la liste AGENCEMENT a disparu');
  const liste = STORE.slice(i, STORE.indexOf('\n)', i));
  for (const k of CLES) {
    assert.ok(liste.includes('"' + k + '"'),
      k + ' est sortie d’AGENCEMENT : un compte ordinaire verrait son menu revenir au rechargement');
  }
  // La frontière, dans l'autre sens : créer une vue reste réservé.
  assert.ok(!liste.includes('"loggia_customviews"'), 'créer une vue perso ne devrait pas être ouvert à tous');
});

test('le menu se relit quand la configuration arrive', () => {
  /* La barre lit les vues UNE fois, au montage. La réponse du composant arrive
   * après : sans ce signal, il faudrait recharger la page pour voir le menu
   * d'un changement fait ailleurs. */
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes('const sigVues = JSON.stringify(['), 'la signature des vues a disparu');
  for (const k of CLES) {
    assert.ok(new RegExp('sigVues[^;]*' + k, 's').test(app), k + ' ne déclenche plus la relecture du menu');
  }
  assert.ok(/useEffect\(\(\) => \{[\s\S]{0,200}?loggia-views-changed[\s\S]{0,120}?\[sigVues\]\)/.test(app),
    'le signal n’est plus émis quand la configuration change');
  // L'écoute, en face : c'est elle qui relit.
  assert.ok(app.includes("window.addEventListener('loggia-views-changed', f)"), 'la barre n’écoute plus le signal');
});
