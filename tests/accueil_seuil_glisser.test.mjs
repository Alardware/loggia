/* LE PANNEAU PIÈCES NE PREND PLUS LE DESSUS (19/10).
 *
 * « Il y a toujours ce bug avec le bouton pour agrandir / rétrécir quand c'est
 * dans une fenêtre comme ici : la fenêtre Pièces prend le dessus avec le
 * déplacement, ce qui rend difficile de gérer les cartes à l'intérieur. »
 * (vidéo à l'appui : des clics sur le ⤢ d'une carte compacte restent sans
 * effet, et le panneau entier se décale.)
 *
 * Mesuré en démonstration, à la souris :
 *   1. les sections et les cartes de l'Accueil se SAISISSAIENT dès l'appui —
 *      un clic qui manquait le ⤢ de quelques pixels saisissait la carte, ou,
 *      dans les 8 px entre deux cartes, le panneau tout entier ;
 *   2. ces 8 px, les cases vides et « Ajouter une pièce » appartenaient au
 *      PANNEAU : vouloir prendre une carte y attrapait la section.
 * La grille d'Appareils (`useLayoutEditor`) attend cinq pixels de mouvement :
 * « en deçà du seuil, l'intention est de cliquer, pas de déplacer » — d'où
 * « dans Appareils ça fonctionne ». L'Accueil prend la même règle. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = MONOLITHE;
const corps = (nom) => {
  const i = app.indexOf('const ' + nom + ' = (');
  assert.ok(i >= 0, nom + ' existe');
  return app.slice(i, app.indexOf('\n  };', i));
};

test('à la souris, une section ne se saisit qu’au-delà de cinq pixels', () => {
  const debut = corps('debutSec');
  assert.ok(!/e\.preventDefault\(\);\s*secFantome\.current = poserFantome\(hote, e\.clientX, e\.clientY\);/.test(debut),
    'plus de fantôme posé dès l’appui');
  assert.ok(debut.includes('secSouris.current = { hote, x: e.clientX, y: e.clientY, zone, id };'), 'l’appui est seulement retenu');
  const mouv = corps('mouvSec');
  assert.ok(mouv.includes('Math.abs(e.clientX - s.x) < 5 && Math.abs(e.clientY - s.y) < 5'), 'le seuil d’Appareils');
  assert.ok(corps('finSec').includes('secSouris.current = null;'), 'un clic sans mouvement ne laisse rien en attente');
});

test('à la souris, une carte de pièce ne se saisit qu’au-delà de cinq pixels', () => {
  const debut = corps('debutPiece');
  assert.ok(!/e\.preventDefault\(\);\s*pieceFantome\.current = poserFantome\(hote, e\.clientX, e\.clientY\);/.test(debut),
    'plus de fantôme posé dès l’appui');
  assert.ok(debut.includes('pieceSouris.current = { hote, x: e.clientX, y: e.clientY, id, noms };'), 'l’appui est seulement retenu');
  const mouv = corps('mouvPiece');
  assert.ok(mouv.includes('Math.abs(e.clientX - s.x) < 5 && Math.abs(e.clientY - s.y) < 5'), 'le même seuil');
  assert.ok(corps('finPiece').includes('pieceSouris.current = null;'), 'un clic sans mouvement ne laisse rien en attente');
});

/* LA VRAIE CAUSE DU ⤢ QUI NE RÉPOND PAS. `:active` gagne les ANCÊTRES de ce
 * qu'on presse : appuyer sur le ⤢ enfonçait la carte (`.o-pointille:active`)
 * ET le panneau entier (`[data-sec]…:active`), chacun à 95,5 % autour de son
 * centre. Mesuré : `pointerdown` sur le bouton, `pointerup` et `click` sur la
 * carte — le bouton avait glissé de sous la souris, d'autant plus qu'il est
 * loin du centre du panneau (la colonne de droite). Le panneau qui « se
 * décale » de la vidéo, c'est lui qui s'enfonce. */
test('appuyer sur un bouton ou une carte n’enfonce plus ce qui les contient', () => {
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  const i = css.indexOf('.o-pointille:has(button:not(.o-surface):active),');
  assert.ok(i >= 0, 'la carte ne s’enfonce plus sous son ⤢, son Modifier ou son Supprimer');
  const regle = css.slice(i, css.indexOf('}', i) + 1);
  assert.ok(regle.includes('[data-sec]:has(> .o-surface):has(button:not(.o-surface):active)'), 'le panneau non plus sous un bouton');
  assert.ok(regle.includes('[data-sec]:has(> .o-surface):has(.o-pointille:active)'), 'ni sous une carte qu’on saisit');
  assert.ok(/\{\s*transform: none;\s*\}/.test(regle), 'ils restent en place');
  assert.ok(i > css.indexOf('.o-pointille:active, [data-sec]:has(> .o-surface):active { transform: scale(.955); }'),
    'posée APRÈS l’enfoncement qu’elle annule');
});

/* LE PANNEAU QUI NE SE POSAIT PAS. Chaque mouvement au-dessus d'une autre
 * section rejouait l'échange sur l'ordre DÉJÀ échangé : au-dessus de
 * « Caméras », un mouvement mettait Pièces après, le suivant le remettait
 * avant — mesuré : `cameras,pieces` puis `pieces,cameras` puis le lâcher sur
 * l'ordre de départ. L'issue tenait à la parité des mouvements. L'ordre visé
 * part désormais de l'ordre enregistré, qui ne bouge pas pendant le geste. */
test('survoler une section donne toujours le même ordre, quel que soit le nombre de mouvements', () => {
  const mouv = corps('mouvSec');
  assert.ok(mouv.includes('const a = [...ordreDe(d.zone)];'), 'l’ordre visé part de l’ordre enregistré');
  assert.ok(!mouv.includes('const a = [...d.ordre];'), 'et non de l’ordre déjà échangé');
});

test('la grille des cartes appartient aux cartes, pas au panneau', () => {
  assert.ok(app.includes('<div ref={poserGrillePieces} data-cartes="1" className="grid-chips"'), 'la grille se déclare');
  assert.ok(corps('debutSec').includes("if (e.target.closest && e.target.closest('[data-cartes]')) return;"),
    'un appui entre deux cartes, ou dans une case vide, ne saisit plus la section');
});
