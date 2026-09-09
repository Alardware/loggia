// ─────────────────────────────────────────────────────────────────────────────
// L'orbe se pose SUR la feuille, elle n'y découpe pas un carreau.
//
// Elle vient d'une page qui occupait tout l'écran. Là-bas, peindre le fond en
// noir opaque ne coûtait rien : il n'y avait rien derrière. Portée dans une
// popup, la même page a fait apparaître, l'un après l'autre, trois défauts que
// l'on ne voit qu'une fois l'orbe posée sur autre chose :
//
//   • un DISQUE NOIR — le fond opaque, rond parce qu'un masque CSS l'arrondissait ;
//   • un canevas DÉCENTRÉ, débordant par le bas et la droite — `setSize(w,h,false)`
//     posait les pixels sans poser la taille CSS, et sur un écran dense le
//     canevas se retrouvait une fois et demie trop grand ;
//   • un CARRÉ PÂLE tout autour — des couleurs droites rendues dans un contexte
//     que le navigateur croyait prémultiplié, donc un voile uniforme sur toute
//     la surface, invisible sur l'orbe mais net sur le vide qui l'entoure.
//
// Aucun de ces trois-là ne casse quoi que ce soit : le rendu marche, les tests
// passent, la console reste muette. Ils se voient, c'est tout — et c'est
// précisément ce qu'aucune autre vérification de ce dépôt ne sait attraper.
//
// D'où ce fichier. Il lit la source, parce que ce qu'il protège tient dans
// quelques options de construction qu'une reprise du code d'origine — copier
// une ligne de la page pour corriger autre chose — remettrait sans y penser.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'orbe.jsx'), 'utf8');

test('le canevas est transparent, et effacé en transparent', () => {
  // Les deux vont ensemble : `alpha` ouvre le canal, la couleur d'effacement
  // décide de ce qu'il y a dedans quand rien n'est dessiné.
  assert.match(SRC, /alpha\s*:\s*true/);
  assert.doesNotMatch(SRC, /alpha\s*:\s*false/);
  assert.match(SRC, /setClearColor\(0x000000,\s*0\)/);
});

test('le contexte attend des couleurs droites, comme celles qu’il reçoit', () => {
  // La passe finale rend `vec4(c, a)` : la lumière d'un côté, son intensité de
  // l'autre. Laisser le défaut — prémultiplié — ferait compter la couleur deux
  // fois et déposerait un voile sur tout le carré.
  assert.match(SRC, /premultipliedAlpha\s*:\s*false/);
});

test('la passe finale rend de la lumière, pas une image opaque', () => {
  // Une opacité constante à 1 redonnerait le disque, quelle que soit la
  // couleur d'effacement.
  assert.match(SRC, /float a = clamp\(max\(max\(c\.r, c\.g\), c\.b\), 0\.0, 1\.0\);/);
  assert.match(SRC, /gl_FragColor = vec4\(c, a\);/);
});

test('la taille CSS du canevas est posée avec ses pixels', () => {
  // `setSize(w, h, false)` ne pose que les pixels. L'hôte ne l'étire pas : le
  // canevas garderait sa taille de tampon, DPR compris.
  assert.doesNotMatch(SRC, /setSize\([^)]*,\s*false\s*\)/);
  assert.match(SRC, /renderer\.setSize\(w, h\)/);
});

test('rien ne rogne l’orbe : il n’y a plus de disque à arrondir', () => {
  // Le masque rond ne cachait pas le fond noir, il lui donnait sa forme. Le
  // fond parti, le masque ne ferait plus que couper la frange du halo.
  assert.doesNotMatch(SRC, /borderRadius/);
  assert.doesNotMatch(SRC, /overflow\s*:\s*'hidden'/);
});

test('aucune couleur de fond ne survit dans la passe finale', () => {
  // `uBg` teintait le vide autour de l'orbe. Sans lui, le vide reste vide ;
  // avec, il reviendrait sous forme de carré coloré à la première image.
  assert.doesNotMatch(SRC, /uBg/);
});

test('la boucle et ses écoutes se libèrent au démontage', () => {
  // Une popup s'ouvre et se ferme. Un contexte WebGL par ouverture, et le
  // navigateur refuse le suivant au bout d'une poignée.
  assert.match(SRC, /removeEventListener\('resize', resize\)/);
  assert.match(SRC, /suiviTaille\.disconnect\(\)/);
  assert.match(SRC, /renderer\.dispose\(\)/);
});
