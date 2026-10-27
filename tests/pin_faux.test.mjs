/* Un code faux se DIT, se VOIT, et les quatre points se LISENT (audit du
 * 03/10, constat « pin_faux »).
 *
 * La modale du code administrateur ne disait l'erreur que par la couleur : les
 * points viraient au rouge 650 ms et la boîte tremblait — un tremblement que
 * « réduire les animations » efface. Ni texte ni région vivante, et les quatre
 * points n'avaient aucun équivalent : au lecteur d'écran, un code faux et un
 * code en cours de saisie se ressemblaient exactement ; à un œil qui distingue
 * mal le rouge, aussi.
 *
 * Le rendu (ADR 0069) montre ce que porte le PREMIER affichage : les deux
 * régions y sont déjà, l'une vide, l'autre à zéro — une région qui naît
 * remplie peut se taire. Quand le message se pose et quand il s'efface se lit
 * dans la source : sans navigateur, aucun effet ni aucun minuteur ne tourne.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

// La langue se résout À L'IMPORT d'i18n.js : la fixer avant, sinon le texte
// attendu dépendrait de la machine qui lance les tests.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { trN, formePlurielle } = await import('../src/i18n.js');
const PL = (await import('../src/langues/pl.js')).default;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(RACINE, 'src', 'pinmodal.jsx'), 'utf8').replace(/\r\n/g, '\n');
const ouvrir = async () => rendre(await composant('pinmodal.jsx', 'PinModal'), { hass: null, onClose: () => {}, onSuccess: () => {} });

test('la région qui dit « Code incorrect » est là dès l’ouverture, vide', async () => {
  const html = await ouvrir();
  assert.match(html, /<div class="o-vh" role="alert">(?:<!-- -->)?<\/div>/,
    'pas de région vivante montée d’avance : la première erreur ne serait pas annoncée');
  assert.ok(SRC.includes("<div className=\"o-vh\" role=\"alert\">{faux ? tr('Code incorrect') : ''}</div>"),
    'c’est son TEXTE qui change, la région reste');
  assert.ok(!/\bfaux && </.test(SRC), 'une alerte montée avec son texte peut se taire');
});

test('un code faux se VOIT aussi, sans couleur ni animation, et sans décaler le pavé', async () => {
  /* Le rouge des points ne tient que 650 ms et le tremblement s'efface avec
   * « réduire les animations » : c'est le sous-titre qui le dit, sur sa propre
   * ligne — un message ajouté au-dessus des points ferait bouger le pavé. */
  const html = await ouvrir();
  assert.ok(html.includes('margin-top:4px">Requis pour ce profil</div>'), 'le sous-titre ordinaire, à l’ouverture');
  assert.ok(!/aria-hidden="true"[^>]*>Requis pour ce profil/.test(html), 'hors erreur, le sous-titre se lit');
  /* ASSERTION MODIFIÉE (chantier Mode enfant, tâche 5 ; E19) : le pavé dit POURQUOI il demande le code — « Requis pour ce profil » par
   * défaut, « Requis pour les réglages du mode enfant » quand la fiche d'un lecteur l'ouvre (`sousTitre`). Le code faux garde sa ligne. */
  assert.ok(SRC.includes("{faux ? tr('Code incorrect') : (sousTitre || tr('Requis pour ce profil'))}"),
    'l’erreur n’a toujours pas de texte visible : un œil qui distingue mal le rouge ne la voit pas');
  const enfant = rendre(await composant('pinmodal.jsx', 'PinModal'), { hass: null, onClose: () => {}, onSuccess: () => {}, sousTitre: 'Requis pour les réglages du mode enfant' });
  assert.ok(enfant.includes('margin-top:4px">Requis pour les réglages du mode enfant</div>'), 'le sous-titre de la fiche d’un lecteur');
  assert.ok(SRC.includes('aria-hidden={faux || undefined}'), 'lu deux fois : la région d’alerte le dit déjà');
});

test('les quatre points se lisent en mots, au bon pluriel, et se taisent eux-mêmes', async () => {
  const html = await ouvrir();
  const zero = trN(0, '{n} chiffre sur 4', '{n} chiffres sur 4');
  assert.ok(html.includes('<span class="o-vh" role="status">' + zero + '</span>'),
    'la rangée de points n’a pas d’équivalent : « ' + zero + ' » attendu');
  assert.equal((html.match(/<span aria-hidden="true" style="width:14px;height:14px/g) || []).length, 4,
    'les quatre points sont tus : leur équivalent parle pour eux');
  /* Les gabarits vont NUS à trN : passés d'abord par tr, l'objet de formes du
   * polonais serait tranché sans le nombre — toujours « other ». */
  assert.ok(SRC.includes("trN(pin.length, '{n} chiffre sur 4', '{n} chiffres sur 4')"),
    'les deux gabarits passent nus à trN');
  const pl = (n) => formePlurielle(PL[n === 1 ? '{n} chiffre sur 4' : '{n} chiffres sur 4'], n, 'pl').replace('{n}', String(n));
  assert.deepEqual([0, 1, 2, 3, 4].map(pl), ['0 cyfr z 4', '1 cyfra z 4', '2 cyfry z 4', '3 cyfry z 4', '4 cyfry z 4'],
    'en polonais, 2 à 4 ne s’accordent pas comme 0');
});

test('« Code incorrect » : sur un refus du serveur seulement, effacé à la touche suivante', () => {
  const verifier = SRC.slice(SRC.indexOf('const verifier = async'), SRC.indexOf('const partiDuVoile'));
  assert.ok(verifier.includes('setFaux(!(r && r.bloque));'),
    'un refus sans blocage : le code était faux ; un blocage a sa propre alerte');
  assert.equal((verifier.match(/setFaux\(/g) || []).length, 1,
    'ni Home Assistant absent ni une panne ne disent « Code incorrect » : rien n’a été vérifié');
  const debut = SRC.indexOf('const add = (d) =>');
  const add = SRC.slice(debut, SRC.indexOf('return (', debut));
  assert.ok(add.includes('setFaux(false);'), 'la touche suivante efface le message');
  assert.ok(!/setTimeout\([^;]*setFaux/.test(SRC),
    'pas de minuteur : effacé en 650 ms comme le rouge des points, une annonce en file d’attente peut se perdre');
});

/* Un code de huit chiffres se saisit (ticket #38, ADR 0278).
 *
 * Paramètres accepte un code de 4 à 8 chiffres ; le pavé vérifiait dès le
 * quatrième, et un code de huit ne passait jamais — essayé à quatre chiffres,
 * il comptait même un raté. Le composant dit maintenant la LONGUEUR (jamais le
 * code) : le pavé attend le bon nombre de points. Un code rangé avant le 27/10
 * ne la porte pas encore : ✓ valide, de 4 à 8 chiffres, et la première
 * réussite l'apprend au composant. */
test('le pavé attend autant de chiffres que le code en compte', async () => {
  const { setLoggiaState } = await import('../src/state.js');
  const points = (html) => (html.match(/<span aria-hidden="true" style="width:14px;height:14px/g) || []).length;
  try {
    setLoggiaState({ cfg: { loggia_admin_pin_defini: true, loggia_admin_pin_longueur: 8 } });
    const huit = await ouvrir();
    assert.equal(points(huit), 8, 'un code de huit chiffres montre huit points');
    assert.ok(huit.includes(trN(0, '{n} chiffre sur {t}', '{n} chiffres sur {t}', { t: 8 })), 'et le dit : « 0 chiffre sur 8 »');
    assert.ok(!huit.includes('aria-label="Valider"'), 'longueur connue : il vérifie seul, sans bouton');

    setLoggiaState({ cfg: { loggia_admin_pin_defini: true } });
    const inconnu = await ouvrir();
    assert.ok(/<button[^>]*disabled=""[^>]*aria-label="Valider"/.test(inconnu), 'longueur inconnue : ✓, fermé tant qu’il manque des chiffres');
    assert.equal(points(inconnu), 4, 'quatre points au départ, la rangée s’allonge avec la saisie');

    setLoggiaState({ cfg: { loggia_admin_pin_defini: false, loggia_admin_pin_longueur: 8 } });
    assert.equal(points(await ouvrir()), 4, 'jamais défini : 0000, quatre chiffres — une longueur restée là ne compte pas');
  } finally {
    setLoggiaState({ cfg: {} });
  }
  const add = SRC.slice(SRC.indexOf('const add = (d) =>'), SRC.indexOf('const valider'));
  assert.ok(add.includes('if (np.length === longueur)'), 'la vérification part au DERNIER chiffre, plus au quatrième');
  assert.ok(!/length === 4\)/.test(add), 'le quatrième chiffre ne déclenche plus rien de lui-même');
});
