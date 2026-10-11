/* La hauteur du titre d'une pièce (01/10).
 *
 * « Il n'est pas aligné avec Bonjour, bonsoir de l'accueil. » Dit deux fois,
 * parce que la première correction visait une mesure fausse : j'avais relevé
 * +30 px alors que la salutation tombe à +40. Ce fichier épingle le calcul,
 * pour qu'il se vérifie sans rouvrir un navigateur.
 *
 * LE CALCUL, EN UNE LIGNE :
 *
 *   Accueil  : padding du contenu + 14 px que la bannière s'ajoute en dedans.
 *   Pièce    : padding du contenu + la marge du bloc de titre.
 *
 * Les deux s'égalisent si, et seulement si, la marge du titre vaut les 14 px
 * de la bannière. Une MARGE et non un padding plus grand : sous 820 px,
 * `.loggia-content` est repassé à 16 px par un `!important`, qui écraserait un
 * padding écrit à la main — et les deux écrans cesseraient d'être d'accord.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const CSS = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');

/* 10/10 — les deux remontent AU NIVEAU DES AUTRES VUES.
 *
 * « Je voudrais que tu remontes Pièces au même niveau que les autres vues, et
 *   fais de même pour l'Accueil. »
 *
 * L'égalité du 01/10 tient toujours, et c'est elle qui compte : Accueil et
 * Pièce se valent. Ce qu'elles valent a changé — ZÉRO en plus du rembourrage
 * de la page, soit 26 px, comme Objets, Sécurité et Énergie. Mesuré avant :
 * Accueil 39, Pièce 40, les autres 26.
 *
 * Le test garde donc les deux bouts : chacun ne s'ajoute plus rien, et ils
 * s'ajoutent la MÊME chose — si quelqu'un remet 14 px d'un seul côté, il
 * tombe. */

/** Le bloc qui porte la salutation de l'Accueil, et ce qu'il s'ajoute en haut. */
const BANNIERE = /\{\/\* BANNER[\s\S]{0,400}?\*\/\}\s*\n\s*<div style=\{\{[^}]*padding: '([^']+)' \}\}>/;

/** Ce qu'une tête s'ajoute au-dessus d'elle, en pixels. */
const hautAccueil = () => {
  const m = APP.match(BANNIERE);
  assert.ok(m, 'le bloc de la bannière a bougé : le calcul d’alignement est à refaire');
  return parseInt(m[1].trim().split(/\s+/)[0], 10);   // « 0 8px 14px » → 0
};
const hautPiece = () => {
  const tete = APP.match(/<div className="o-room-head" style=\{\{([^}]*)\}\}/);
  assert.ok(tete, 'la tête de la vue d’une pièce est introuvable');
  const marge = tete[1].match(/marginTop: (?:edit \? 0 : )?(\d+)/);
  return marge ? parseInt(marge[1], 10) : 0;
};

test('la salutation de l’Accueil ne descend plus : elle est au niveau des autres vues', () => {
  assert.equal(hautAccueil(), 0,
    'la bannière se rajoute un rembourrage en haut : la salutation retombe sous le titre des autres vues');
});

test('le titre d’une pièce arrive au même niveau que la salutation', () => {
  assert.equal(hautPiece(), 0, 'la tête d’une pièce a repris une marge : son titre redescend');
  // La règle du 01/10, intacte : les deux se valent, quoi qu'ils vaillent.
  assert.equal(hautPiece(), hautAccueil(),
    'le titre d’une pièce et la salutation de l’Accueil ne tombent plus à la même hauteur');
});

test('une marge, parce qu’un padding serait écrasé sous 820 px', () => {
  /* La raison d'être du choix. Si cette règle disparaissait, un padding
   * redeviendrait possible — et quelqu'un le remettrait. */
  assert.match(CSS, /\.loggia-content \{ padding: 16px 14px 96px !important; \}/,
    'le `!important` qui écrase le padding sous 820 px a disparu : relire le commentaire de la vue d’une pièce');

  // La vue d'une pièce garde le padding commun, comme toutes les autres.
  assert.match(APP, /<div className="loggia-content" style=\{\{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 \}\}>\s*\n\s*\{edit && <BandeauEdition/,
    'la vue d’une pièce ne porte plus le padding commun');
});

test('rien ne revient se poser au-dessus du titre', () => {
  /* L'illustration de pièce a été construite puis RETIRÉE le 01/10 : « retire
   * moi ça, on laisse tomber pour le moment l'intégration d'une image ». Ce
   * qu'elle avait de dangereux pour cette page tient en une phrase : tout bloc
   * glissé avant la tête repousse le titre, et l'alignement avec la salutation
   * de l'Accueil est perdu sans que rien ne le signale.
   *
   * La tête doit donc rester le PREMIER enfant du contenu, après le seul
   * bandeau d'édition. */
  const i = APP.indexOf("<div className=\"loggia-content\" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>");
  assert.notEqual(i, -1, 'la vue d’une pièce est introuvable');
  const tete = APP.indexOf('<div className="o-room-head"', i);
  const entre = APP.slice(i, tete);
  assert.ok(!/<[A-Z]\w*(?<!BandeauEdition)[\s/>]/.test(entre.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')),
    'un composant s’est glissé entre le contenu et le titre : il repousserait le titre sous la salutation');
});
