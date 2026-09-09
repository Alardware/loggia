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

test('les couleurs sortent prémultipliées, comme le navigateur les attend', () => {
  /* Ce test disait l'inverse, et il avait tort.
   *
   * Passer `premultipliedAlpha` à FAUX faisait composer `fond × (1 − a) + c × a`.
   * Comme `a` vaut ici l'éclat de la couleur, `c × a` est de l'ordre de `a` au
   * carré : négligeable là où `a` est faible. Le halo retirait donc du fond
   * sans rien rendre à la place, et déposait un carré SOMBRE autour de l'orbe.
   *
   * Invisible sur la feuille noire de la popup, flagrant sur la miniature de
   * l'appui long, qui se pose sur le tableau de bord. Mesuré le 09/09/2026 en
   * plaçant le canevas sur un gris uni : le carré était nettement plus foncé
   * que la plaque autour.
   *
   * Le défaut — prémultiplié — est le bon régime pour ce qui ÉMET : le
   * navigateur calcule `fond × (1 − a) + c`, donc le halo ajoute sa lumière au
   * lieu d'en retirer. */
  // L'OPTION, pas le mot : le commentaire qui explique ce choix le contient
  // forcément, et une expression trop large échouerait sur sa propre raison.
  assert.doesNotMatch(SRC, /premultipliedAlpha\s*:/,
    'laisser `premultipliedAlpha` à son défaut : le préciser ici, c’est le mettre à faux');
});

test('l’orbe ne remplit pas son cadre', () => {
  /* C'etait la vraie cause du carre, signale cinq fois.
   *
   * Dans la page d'origine l'orbe remplissait son cadre, et c'etait sans
   * consequence : le cadre etait l'ecran. Ici il fait deux cents pixels, et
   * l'orbe VARIE — elle respire, elle pulse, elle s'etale quand elle repond.
   * A chaque battement elle atteignait le bord du canevas et s'y coupait net.
   * Aucun reglage de couleur ne pouvait retirer ce trait : il fallait lui
   * laisser de la place.
   *
   * Mesure du 09/09/2026, alpha maximum par anneau, dans l'etat le plus
   * etale — quand elle repond :
   *
   *      avant (cadre 200)   0,75 -> 128     bord -> 17
   *      apres (cadre 230)   0,70 ->  83     0,80 -> 8     bord -> 0
   *
   * La camera recule d'un tiers, et les appelants agrandissent le cadre
   * d'autant : l'orbe garde sa taille a l'ecran, elle a seulement de l'air. */
  assert.match(SRC, /camera\.position\.set\(0, \.34, 5\.81\);/);
  assert.doesNotMatch(SRC, /camera\.position\.set\(0, \.25, 4\.3\);/);
});

test('la lumière s’éteint avant le bord du cadre', () => {
  /* Le carré signalé quatre fois. Ce n'était ni les couleurs, ni l'alpha, ni
   * le verre dépoli de la feuille — c'était un trait droit, et un trait droit
   * vient d'une coupure.
   *
   * Mesure du 09/09/2026, alpha lu sur TOUT le pourtour du canevas et non sur
   * les seuls coins : maximum 17 sur 255. Faible, mais tranché net au ras du
   * cadre — et c'est ce trait que l'œil voit, pas l'orbe. Après extinction :
   * 0 sur tout le pourtour, 10 à trois pixels du bord, 250 au cœur. L'orbe
   * elle-même est intacte, seule la frange coupée disparaît.
   *
   * La distance de Tchebychev et non un rayon : elle vaut 1 sur tout le
   * pourtour, coins compris, là où un cercle les manquerait. */
  assert.match(SRC, /vec2 q = abs\(vUv - 0\.5\) \* 2\.0;/);
  assert.match(SRC, /c \*= 1\.0 - smoothstep\(0\.86, 1\.0, max\(q\.x, q\.y\)\);/);
});

test('le fond uniforme du flou est ramené à zéro', () => {
  /* Le plus large des quatre flous porte jusqu'aux bords et dépose sur TOUT le
   * carré un fond faible mais uniforme. Aucun régime de composition ne le
   * rattrape : il se voit plus clair en additif, plus sombre en alpha droit.
   * Le seul remède est de le retrancher avant de composer — ce qui reste sous
   * le seuil vaut zéro, et zéro ne se compose pas. */
  assert.match(SRC, /c = max\(c - 0\.020, 0\.0\);/);
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

// ─────────────────────────────────────────────────────────────────────────────
// Le garde-fou de developpement.
//
// L'orbe nait dans un effet a dependances vides. Le remplacement a chaud de
// Vite echange le module sans rejouer cet effet : l'orbe qui tourne reste
// celle du chargement initial, batie avec l'ancien code. On corrige, on
// regarde l'ecran, et on voit l'ancien rendu.
//
// Mesure du 09/09/2026 : un temoin pose sur `window` survivait a l'edition du
// fichier — donc pas de rechargement. Avec le garde-fou, il disparait.
//
// Ce bloc ne part jamais en production : `import.meta.hot` vaut `undefined` au
// build, et le chunk produit garde exactement le meme condensat qu'avant son
// ajout. Ce test le garde en place, et surtout garde le rechargement SOUS la
// condition — un `location.reload()` qui s'echapperait rechargerait le
// dashboard de la maison.
// ─────────────────────────────────────────────────────────────────────────────

test('en developpement, une edition de ce fichier recharge la page', () => {
  assert.ok(SRC.includes('if (import.meta.hot) {'), 'garde-fou de developpement absent');
  assert.ok(SRC.includes('import.meta.hot.accept(() => { window.location.reload(); });'),
    'le garde-fou ne recharge plus la page');
});

test('aucun rechargement ne vit hors de cette garde', () => {
  const nb = SRC.split('location.reload').length - 1;
  assert.equal(nb, 1, 'un seul rechargement, et seulement sous `import.meta.hot`');
});
