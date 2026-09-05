// ─────────────────────────────────────────────────────────────────────────────
// L'historique des mises en page.
//
// Une version PAR SÉANCE, pas par geste. La distinction porte tout le reste :
// un journal des gestes déposerait cinquante entrées à trois secondes
// d'intervalle, toutes intitulées « il y a un instant », et l'on n'y
// retrouverait jamais l'accueil d'avant-hier. C'est pour cela que la capture
// se fait à l'ENTRÉE en édition et l'archivage à la SORTIE.
//
// Le piège moins visible est la taille. Chaque version garde une copie entière
// de l'agencement, et le serveur refuse toute valeur de plus de 256 Ko
// (`MAX_VALUE_BYTES`, store.py) — un refus qui porte sur la requête entière et
// n'affiche rien. Sans élagage côté navigateur, l'historique paraîtrait
// s'enregistrer, puis serait vide au rechargement suivant. Rien à l'écran ne
// l'aurait annoncé.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');

/** `elaguerHisto` telle qu'écrite, rendue exécutable.
 *
 * Le texte de la fonction ne dirait pas si l'élagage sacrifie les vieilles
 * versions ou les récentes — or c'est précisément ce qui compte. On l'exécute
 * donc pour de vrai ; elle est pure, elle ne touche que `JSON` et `Blob`.
 */
function elaguer() {
  const i = src.indexOf('const HISTO_MAX =');
  assert.notEqual(i, -1, 'les plafonds de l’historique ont disparu');
  const j = src.indexOf('\n}', src.indexOf('function elaguerHisto(', i)) + 2;
  return new Function(src.slice(i, j) + '\nreturn elaguerHisto;')();
}

test('l’historique s’arrête à dix versions', () => {
  const f = elaguer();
  const liste = Array.from({ length: 25 }, (_, k) => ({ ts: 1000 - k, grille: { caches: [] } }));
  assert.equal(f(liste).length, 10, 'le nombre de versions n’est plus plafonné');
});

test('élaguer sacrifie les vieilles versions, jamais les récentes', () => {
  const f = elaguer();
  // Chaque version pèse ~35 Ko : trois tiennent sous les 128 Ko, pas cinq.
  const gros = (n) => ({ ts: n, grille: { piecesOrdre: [String(n).repeat(35000)] } });
  const sortie = f([gros(5), gros(4), gros(3), gros(2), gros(1)]);
  assert.ok(sortie.length < 5, 'le plafond d’octets ne coupe plus rien : le serveur refusera la clé en silence');
  // La plus récente est en tête et doit survivre à toutes les autres.
  assert.equal(sortie[0].ts, 5, 'l’élagage retire par le haut : on perd les versions récentes');
  const poids = new Blob([JSON.stringify(sortie)]).size;
  assert.ok(poids <= 128 * 1024, `${poids} octets conservés : au-delà du plafond que l’on s’est donné`);
});

test('une très grande maison garde ses dix versions', () => {
  const f = elaguer();
  // Mesuré dans la démo : 40 pièces, 25 sections et les trois formats donnent
  // 7,6 Ko par version, soit 77 Ko pour dix. Si le plafond d'octets mordait
  // ici, il punirait les installations les plus fournies — précisément
  // celles qui ont le plus besoin d'un historique.
  const reelle = (n) => ({ ts: n, grille: { piecesOrdre: Array.from({ length: 40 }, (_, i) => 'Pièce numéro ' + i),
    caches: Array.from({ length: 25 }, (_, i) => 'section_' + i), tailles: {}, formats: { tablette: {}, mobile: {} } } });
  const dix = Array.from({ length: 10 }, (_, i) => reelle(10 - i));
  assert.equal(f(dix).length, 10, 'le plafond d’octets mord sur une maison normale, même très fournie');
});

test('une version, même énorme, n’est pas jetée', () => {
  const f = elaguer();
  // Sinon un seul agencement démesuré viderait l'historique à chaque séance,
  // sans que personne ne comprenne pourquoi rien ne s'enregistre.
  const enorme = [{ ts: 1, grille: { piecesOrdre: ['x'.repeat(200000)] } }];
  assert.equal(f(enorme).length, 1, 'la dernière version restante est jetée : l’historique resterait vide');
});

test('une version par séance, pas par geste', () => {
  const i = src.indexOf('const avantSeance = useRef(null);');
  assert.notEqual(i, -1, 'la capture d’avant-séance a disparu');
  const bloc = src.slice(i, i + 900);
  // Capture à l'ENTRÉE…
  assert.match(bloc, /if \(editMode\) \{ avantSeance\.current = accL; return; \}/,
    'l’état d’avant la séance n’est plus capturé à l’entrée en édition');
  // …et l'effet ne se rejoue QUE sur editMode. Ajouter `accL` aux dépendances
  // en ferait un journal des gestes : une entrée par déplacement de tuile.
  const deps = bloc.match(/\}, \[([^\]]*)\]\);/);
  assert.ok(deps, 'les dépendances de l’effet d’archivage sont introuvables');
  assert.equal(deps[1].trim(), 'editMode',
    'l’archivage se déclenche sur autre chose que la sortie d’édition : il déposera une version par geste');
});

test('une séance qui ne change rien ne dépose pas de version', () => {
  const i = src.indexOf('const avantSeance = useRef(null);');
  const bloc = src.slice(i, i + 900);
  // Sans cela, ouvrir puis refermer le mode édition suffirait à empiler des
  // versions identiques jusqu'à chasser les vraies.
  assert.match(bloc, /if \(JSON\.stringify\(av\) === JSON\.stringify\(accL\)\) return;/,
    'une séance blanche dépose de nouveau une version');
});

test('restaurer reste annulable', () => {
  const i = src.indexOf('const restaurer = (e) =>');
  assert.notEqual(i, -1, 'la restauration a disparu');
  // Écrire `loggia_accueil` directement contournerait la pile : la restauration
  // deviendrait le seul geste d'édition irréversible.
  assert.match(src.slice(i, i + 120), /saveAccL\(e\.grille\)/,
    'la restauration ne passe plus par le point qui empile : elle sera irréversible');
});

test('l’historique suit la maison, pas l’appareil', () => {
  // `est_personnelle` (store.py) ne garde sur l'appareil qu'une courte liste
  // nommée — les marges d'écran, la trace du dernier passage — et ce qui finit
  // par « panel ». Tout le reste suit la maison, `loggia_histo` compris. C'est
  // ce qu'on veut : on restaure depuis le téléphone un agencement fait sur
  // l'ordinateur.
  assert.match(src, /cfgVal\('loggia_histo', null\)/, 'la lecture de l’historique a changé de clé');
  assert.ok(!/loggia-histo/.test(src), 'l’historique est passé sur une clé personnelle : il ne suivrait plus la maison');
});

test('les dates de l’historique se traduisent', () => {
  const i = src.indexOf('function quandVersion(');
  assert.notEqual(i, -1, 'la date des versions a disparu');
  const corps = src.slice(i, src.indexOf('\n}', i));
  // `relTime` dit « Il y a 2 h » en français EN DUR : l'historique serait la
  // seule liste à parler français sur un dashboard anglais.
  assert.ok(!/relTime/.test(corps), 'les dates repassent par relTime, qui ne se traduit pas');
  assert.match(corps, /Intl\.RelativeTimeFormat\(locale\(\)/, 'les dates relatives ne suivent plus la langue');
});

test('les libellés de l’historique existent en anglais', () => {
  for (const cle of ['Historique des mises en page', 'Avant la séance', 'Restaurer',
    'Tout oublier', 'Agencement par défaut', '{n} sections masquées']) {
    assert.ok(en.includes(`'${cle}':`), `« ${cle} » n’est pas traduit : il s’affichera en français`);
  }
  // Le pluriel passe par un paramètre : sans le jeton, `tr` rendrait « {n} ».
  assert.match(en, /'\{n\} sections masquées': '\{n\} sections hidden'/,
    'la traduction du pluriel a perdu son jeton {n}');
});

test('la feuille reste lisible en thème clair', () => {
  const i = src.indexOf('function FeuilleHistorique(');
  assert.notEqual(i, -1, 'la feuille d’historique a disparu');
  const corps = src.slice(i, src.indexOf('\n}\n', i));
  // Mesuré dans la démo, thème clair : la feuille est translucide sur un scrim,
  // et son fond composite vaut rgb(210,211,214). `--o-text2` (#5a6884) n'y
  // atteint que 3,74:1 — sous le seuil AA — alors qu'il passe largement sur les
  // cartes opaques pour lesquelles il est calibré. `--o-text1` y vaut 8,5:1.
  // La hiérarchie tient par la taille (11 px contre 13 et 16) et par le poids.
  assert.ok(!/--o-text2/.test(corps),
    'un texte de la feuille repasse sur --o-text2 : il tombe sous 4,5:1 en thème clair');
});
