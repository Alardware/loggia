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

test('l’orbe occupe son cadre, et s’y éteint en cercle', () => {
  /* Deux temps, et le second défait une part du premier.
   *
   * Le 09/09/2026, pour ne plus toucher le bord, la caméra avait reculé d'un
   * tiers : l'orbe ne se coupait plus, mais elle paraissait petite, ramassée
   * au milieu d'un grand vide (5,81 contre 4,3 à l'origine).
   *
   * Le 11/09/2026 elle revient près — la distance de la maquette Sentinel
   * Mobile, demandée à la vue des deux orbes côte à côte : « l'autre est plus
   * grosse, s'estompe sur les bords ». C'est un FONDU qui protège désormais
   * le bord : la lumière décroît en cercle et vaut zéro sur le cercle inscrit
   * dans le cadre, donc sur tout le pourtour. */
  assert.ok(SRC.includes('camera.position.set(0, .25, 4.2);'), 'la caméra a bougé');
  assert.ok(SRC.includes('vec2 e = (vUv - 0.5) * 2.0 * vec2(max(uAspect, 1.0), max(1.0 / uAspect, 1.0));'));
  assert.ok(SRC.includes('c *= 1.0 - smoothstep(0.6, 1.0, length(e));'),
    'sans fondu, l’orbe rapprochée se couperait de nouveau au bord du cadre');
  // Le rapport du cadre suit le cadre : sans lui, un canevas plus large que
  // haut aurait un fondu ovale, et la lumière toucherait le haut et le bas.
  assert.ok(SRC.includes('compMat.uniforms.uAspect.value = w / h;'));
});

test('au repos elle tourne lentement, à la même allure sur tout écran', () => {
  /* La rotation avançait d'un pas PAR IMAGE : deux fois plus vite sur un
   * écran à 120 Hz qu'à 60. Elle avance maintenant par seconde. Et le repos
   * tourne plus lentement que les autres régimes — un tour en trois quarts
   * de minute. */
  assert.ok(SRC.includes('if (this.autoRotate) this.theta -= this.autoRotateSpeed * 0.72 * dt;'));
  assert.ok(SRC.includes('controls.update(dt);'), 'la boucle ne passe plus le temps écoulé');
  assert.ok(SRC.includes("controls.autoRotateSpeed = (S.mode === 'repos' ? .08 : .2) + M.spin*1.2;"));
});

test('dans la popup, l’orbe remplit sa zone', () => {
  // Un carré taillé sur le plus petit côté la laissait petite dans une zone
  // plus large que haute.
  assert.ok(SRC.includes("? { width: '100%', height: '100%', display: 'block', position: 'relative' }"));
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

// ─────────────────────────────────────────────────────────────────────────────
// Les teintes de la maison.
//
// L'orbe prend la couleur de ce dont l'assistant parle : le chauffage en
// orangé, ce qui est fait en vert, l'alerte en rouge. Sa couleur à ELLE ne
// bouge pas — c'est celle qu'on a choisi de garder ; les teintes s'y ajoutent
// sans la remplacer.
// ─────────────────────────────────────────────────────────────────────────────

test('la couleur propre de l’orbe ne change pas', () => {
  assert.ok(SRC.includes('{ deep:[.02,.16,.62], mid:[.22,.66,1.0], hot:[.92,.99,1.0] },'),
    'la première palette — la couleur de l’orbe — a été touchée');
});

test('les teintes existent : celles de la maison, et le cyan de sa voix', () => {
  const debut = SRC.indexOf('const TEINTES = {');
  assert.notEqual(debut, -1, 'plus de teintes');
  const bloc = SRC.slice(debut, SRC.indexOf('};', debut));
  for (const nom of ['parle:', 'chaud:', 'froid:', 'bien:', 'alerte:']) assert.ok(bloc.includes(nom), 'teinte absente : ' + nom);
});

/** Les trois crans d'une teinte, lus dans la source : deep, mid, hot. */
function palette(nom) {
  const debut = SRC.indexOf('const TEINTES = {');
  const ligne = SRC.slice(debut).split(String.fromCharCode(10)).find((l) => l.trim().startsWith(nom + ':'));
  assert.ok(ligne, 'teinte introuvable : ' + nom);
  const n = (ligne.match(/[.0-9]+/g) || []).map(Number);
  return { deep: n.slice(0, 3), mid: n.slice(3, 6), hot: n.slice(6, 9) };
}

test('« fait » est vert, l’alerte rouge — jusqu’au cœur des veines', () => {
  /* Repris de la maquette, « fait » sortait sarcelle, trop proche du cyan de
   * la voix, et l'alerte rose : le `hot`, qu'on voit d'abord, y restait
   * presque blanc. Demandé le 11/09/2026 : « fait en vert, alerte en rouge ». */
  const bien = palette('bien');
  const alerte = palette('alerte');
  for (const cran of ['mid', 'hot']) {
    const [r, g, b] = bien[cran];
    assert.ok(g - Math.max(r, b) >= 0.25, '« fait » n’est plus franchement vert (' + cran + ')');
    const [r2, g2, b2] = alerte[cran];
    assert.ok(r2 - Math.max(g2, b2) >= 0.4, 'l’alerte n’est plus franchement rouge (' + cran + ')');
  }
  // Et le vert ne se confond pas avec le cyan de la voix : le bleu les sépare.
  assert.ok(palette('parle').mid[2] - bien.mid[2] >= 0.4, '« fait » et la voix se confondraient');
});

test('une teinte se pilote, et se rend', () => {
  // Tout nom inconnu, « base » compris, rend la couleur propre ; et seules les
  // clés PROPRES comptent — « toString » est aussi une propriété de l'objet.
  assert.ok(SRC.includes('setTeinte(nom) { S.teinte = Object.prototype.hasOwnProperty.call(TEINTES, nom) ? nom : null; },'));
  assert.ok(SRC.includes('const P = (S.teinte && TEINTES[S.teinte]) || PAL[S.pal]'),
    'la boucle ne fond plus vers la teinte demandée');
  assert.ok(SRC.includes("teinte = 'base', remplir = false }) {"), 'le composant ne prend plus de teinte');
  assert.ok(SRC.includes('useEffect(() => { if (orbeRef.current) orbeRef.current.setTeinte(teinte); }, [teinte]);'));
});
