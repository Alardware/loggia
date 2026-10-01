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

/** Le bloc qui porte la salutation de l'Accueil, et ce qu'il s'ajoute. */
const BANNIERE = /\{\/\* BANNER \*\/\}\s*\n\s*<div style=\{\{[^}]*padding: '(\d+)px (\d+)px' \}\}>/;

test('la salutation de l’Accueil descend de 14 px', () => {
  const m = APP.match(BANNIERE);
  assert.ok(m, 'le bloc de la bannière a bougé : le calcul d’alignement est à refaire');
  assert.equal(m[1], '14', 'la bannière ne descend plus de 14 px — la marge du titre de pièce doit suivre');
});

test('le titre d’une pièce reprend EXACTEMENT ces 14 px', () => {
  const tete = APP.match(/<div className="o-room-head" style=\{\{([^}]*)\}\}/);
  assert.ok(tete, 'la tête de la vue d’une pièce est introuvable');
  const marge = tete[1].match(/marginTop: edit \? 0 : (\d+)/);
  assert.ok(marge, 'la tête d’une pièce n’a plus de marge haute : le titre remonte de 14 px');
  assert.equal(marge[1], '14', 'la marge ne vaut plus les 14 px de la bannière de l’Accueil');

  /* Et elle ne vaut QUE si le titre arrive en premier : en édition, le bandeau
   * passe devant et tient le haut à sa place. */
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
