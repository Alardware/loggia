// ─────────────────────────────────────────────────────────────────────────────
// Deux mises en page qui se cassent en silence.
//
// Aucune ne lève d'erreur, aucune ne fait échouer un rendu : elles déplacent
// des choses. C'est pour cela qu'elles méritent un test — rien d'autre ne les
// rattraperait avant l'écran de quelqu'un.
//
// 1. Le pied des tuiles pièce. `justify-content: space-between` pousse
//    l'interrupteur à droite TANT QU'il a un voisin. Quand la carte devient
//    étroite, les minis volets/clim passent en `display: none` et sortent du
//    flux : il ne reste qu'un item, que `space-between` colle à gauche.
//    `margin-left: auto` ne dépend, lui, d'aucun voisin.
//
// 2. Le résumé sous le prénom. Un nœud texte nu dans un conteneur flex devient
//    un item anonyme — et un flex ne coupe pas un item, il le renvoie à la
//    ligne entier. Trop long, le résumé basculait donc SOUS la pastille d'état
//    au lieu de s'enrouler à côté d'elle.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');

/** Le corps de `tailleParDefaut`, tel qu'écrit. */
function regleDeTaille() {
  const i = src.indexOf('function tailleParDefaut(');
  assert.notEqual(i, -1, 'tailleParDefaut introuvable');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}

test('chaque appareil a sa taille de tuile', () => {
  const c = regleDeTaille();
  // Trois appareils, trois réponses, dans cet ordre : le clavier-souris passe
  // AVANT la largeur, sinon une petite fenêtre de bureau tomberait en puces.
  const iTactile = c.indexOf('if (!tactile) return');
  const iLarge = c.indexOf('if (!large) return');
  assert.notEqual(iTactile, -1, 'le cas de l’ordinateur a disparu');
  assert.notEqual(iLarge, -1, 'le cas du téléphone a disparu');
  assert.ok(iTactile < iLarge, 'la largeur passe avant le type d’appareil');
  assert.match(c.slice(iTactile, iLarge), /return 's'/, 'l’ordinateur n’est plus en standard');
  assert.match(c.slice(iLarge), /return 'c'/, 'le téléphone n’est plus en compact');
});

test('la tablette pose sa mosaïque sur trois colonnes', () => {
  const c = regleDeTaille();
  // Mesuré dans le navigateur à 1180 px tactile : ScScSc, soit
  //   [GRANDE][petite][GRANDE]
  //   [petite][GRANDE][petite]
  // La colonne du milieu est l'inverse des bords, et la parité de la rangée
  // renverse le tout — c'est ce qui fait alterner le motif.
  assert.match(c, /const col = i % 3;/, 'la mosaïque ne compte plus en trois colonnes');
  assert.match(c, /Math\.floor\(i \/ 3\) % 2 === 0/, 'la parité des rangées ne renverse plus le motif');
  // Et la grille DOIT valoir trois colonnes, sinon les grandes tuiles
  // tomberaient n'importe où.
  assert.match(src, /\(tactile && wide\) \? 'repeat\(3,1fr\)'/,
    'les trois colonnes de la tablette ne sont plus imposées');
});

test('la mosaïque impose la colonne, jamais la rangée', () => {
  // `.grid-chips` coule sur des rangées de 88 px : une standard en occupe
  // deux, une puce une seule.
  //
  // Sans colonne imposée, les tuiles se bousculent et la mosaïque part en
  // escalier. Avec la rangée imposée EN PLUS, chaque colonne s'aligne sur la
  // plus haute et laisse un trou sous les puces — la grande du milieu restait
  // clouée en bas au lieu de remonter combler le vide.
  //
  // Mesuré à 1180 px tactile : la tuile du milieu démarre à y=546, juste sous
  // la puce qui finit à 538, et non à 642 comme ses voisines de rangée.
  assert.match(src, /gridColumn: \(i % 3\) \+ 1/,
    'la colonne de chaque tuile n’est plus imposée : la mosaïque partira en escalier');
  const i = src.indexOf('gridColumn: (i % 3) + 1');
  assert.ok(!src.slice(i, i + 160).includes('gridRow'),
    'la rangée est de nouveau imposée : les tuiles cesseront de combler les vides');
});

test('un choix explicite prime sur l’appareil', () => {
  const i = src.indexOf('const choisi = (grille.tailles || {})[p.name];');
  assert.notEqual(i, -1, 'la lecture du choix de taille a disparu (elle passe par la grille du format)');
  assert.match(src.slice(i, i + 260), /\(choisi === 's' \|\| choisi === 'c'\) \? choisi : tailleParDefaut/,
    'le bouton de taille ne prime plus sur le défaut de l’appareil');
});

test('l’interrupteur d’une tuile pièce ne dépend pas de ses voisins', () => {
  const i = src.indexOf('function PieceCard(');
  assert.notEqual(i, -1, 'PieceCard introuvable');
  const c = src.slice(i, src.indexOf('\nfunction ', i + 20));
  // PieceCard rend DEUX interrupteurs — un par format. Seul celui du pied
  // standard (38 × 21) partage sa rangée avec les minis masquables ; le chip,
  // lui, n'utilise pas `space-between` et n'a jamais eu le défaut. On vise
  // donc le bon par sa taille, pas par son rôle.
  const j = c.indexOf('width: 38, height: 21, borderRadius: 999');
  assert.notEqual(j, -1, 'l’interrupteur du pied standard introuvable');
  const style = c.slice(j, c.indexOf('}}', j));
  assert.match(style, /marginLeft: 'auto'/,
    'sans marginLeft:auto, l’interrupteur repasse à gauche dès que les minis sont masqués');
});

test('les minis ne cèdent que lorsque la place manque vraiment', () => {
  const m = css.match(/@container \(max-width: (\d+)px\) \{\s*\/\*[^*]*\*\/\s*\.o-piecestd \.o-piece-minis/);
  assert.ok(m, 'la règle de masquage des minis a disparu ou changé de forme');
  const seuil = Number(m[1]);
  // `container-type: inline-size` interroge la CONTENT-BOX. Deux minis
  // (38 + 6 + 38) et l'interrupteur (38) font 120 px : au-dessus, ils tiennent
  // et doivent rester visibles. Un seuil exprimé comme s'il s'agissait de la
  // carte entière masquerait des icônes sur des tuiles assez larges.
  assert.ok(seuil < 120, `seuil de ${seuil}px : des tuiles assez larges perdent leurs icônes`);
});

test('le résumé d’accueil s’enroule à côté de la pastille, pas dessous', () => {
  const i = src.indexOf('className="o-greet-facts"');
  assert.notEqual(i, -1, 'la ligne de résumé introuvable');
  const bloc = src.slice(i, src.indexOf('</span></span>', i));
  // Le texte doit être un item À LUI, capable de s'enrouler à l'intérieur de
  // sa propre colonne.
  assert.match(bloc, /<span style=\{\{ flex: 1, minWidth: 0 \}\}>\{faits\.txt\.join/,
    'le résumé redevient un nœud texte nu : il rebasculera sous la pastille');
  // Et la pastille s'aligne sur la première ligne, pas au milieu du bloc.
  assert.match(bloc, /alignItems: 'flex-start'/, 'la pastille se recentre sur tout le bloc');
});
