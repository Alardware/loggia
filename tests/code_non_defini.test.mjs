/* Jamais défini, aucun code n'ouvre rien (audit du 28/10, H1 ; ADR 0279).
 *
 * Tant qu'aucun administrateur n'avait défini le code de la maison, `0000`
 * ouvrait le laissez-passer à tout compte connecté : le passage vers un profil
 * Admin, et les réglages du mode enfant — dont la phrase pour dormir, que
 * l'Echo exécute comme une phrase prononcée. Le composant refuse désormais
 * `pin/verifier` par un refus NOMMÉ, `code_non_defini`, et le pavé s'adapte :
 *  - un administrateur de Home Assistant CRÉE le code, en le tapant deux fois ;
 *  - les autres apprennent qui peut le créer, et où ; rien à taper.
 *
 * Le rendu montre le premier affichage (ADR 0069) ; ce qui se passe au fil des
 * touches se lit dans la source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { setLoggiaState } = await import('../src/state.js');
const { raisonEchec } = await import('../src/refus.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, 'src', f), 'utf8').replace(/\r\n/g, '\n');
const SRC = lire('pinmodal.jsx');
const points = (html) => (html.match(/<span aria-hidden="true" style="width:14px;height:14px/g) || []).length;

async function ouvrir(hass, cfg = { loggia_admin_pin_defini: false }) {
  setLoggiaState({ cfg });
  try { return rendre(await composant('pinmodal.jsx', 'PinModal'), { hass, onClose: () => {}, onSuccess: () => {} }); }
  finally { setLoggiaState({ cfg: {} }); }
}

test('jamais défini, un compte ordinaire n’a rien à taper : la boîte dit qui crée le code, et où', async () => {
  const html = await ouvrir({ user: { is_admin: false }, callWS: () => Promise.resolve({ ok: true }) });
  assert.ok(html.includes('Aucun code n’est encore défini'), 'la boîte ne dit pas qu’il n’y a pas de code');
  assert.ok(html.includes('Un administrateur de Home Assistant doit d’abord le créer, dans Paramètres › Profils.'));
  assert.equal(points(html), 0, 'des points à remplir, alors qu’aucun code ne passerait');
  assert.ok(!html.includes('⌫'), 'le pavé est là, alors qu’aucun code ne passerait');
  assert.ok(!html.includes('0000'), '0000 est encore proposé');
});

test('jamais défini, un administrateur crée le code : choisi, retapé, puis posé par sa commande', async () => {
  const html = await ouvrir({ user: { is_admin: true }, callWS: () => Promise.resolve({ defini: true }) });
  assert.ok(html.includes('Créer le code administrateur'), 'le titre dit ce qu’on fait');
  assert.ok(html.includes('Choisissez un code de 4 à 8 chiffres'), 'la première étape se dit');
  assert.ok(/<button[^>]*disabled=""[^>]*aria-label="Valider"/.test(html), 'un code qu’on crée se valide par ✓, fermé tant qu’il manque des chiffres');
  assert.equal(points(html), 4, 'quatre points au départ, la rangée s’allonge avec la saisie');
  const confirmer = SRC.slice(SRC.indexOf('const confirmer = () =>'), SRC.indexOf('const valider'));
  assert.ok(confirmer.includes("if (premier == null) { setPremier(pin); setPin(''); return; }"), 'le premier ✓ garde le code et redemande');
  assert.ok(confirmer.includes('if (pin !== premier) { setEcart(true);'), 'deux codes différents se refusent');
  assert.ok(SRC.includes("await h.callWS({ type: 'loggia/pin/definir', pin: code });"), 'le code part par la commande réservée aux administrateurs');
  assert.ok(SRC.includes("tr('Retapez-le pour confirmer')") && SRC.includes("tr('Les deux codes ne correspondent pas.')"));
});

test('un code défini : le pavé ordinaire, rien de la création', async () => {
  const html = await ouvrir({ user: { is_admin: true }, callWS: () => Promise.resolve({ ok: true }) }, { loggia_admin_pin_defini: true, loggia_admin_pin_longueur: 4 });
  assert.ok(html.includes('Requis pour ce profil') && !html.includes('Créer le code administrateur'));
  assert.equal(points(html), 4);
});

test('la configuration en retard : le refus nommé du composant fait passer le pavé en « aucun code »', () => {
  const verifier = SRC.slice(SRC.indexOf('const verifier = async'), SRC.indexOf('const partiDuVoile'));
  assert.ok(verifier.includes("if (e && e.code === 'code_non_defini') { setPin(''); setNonDefini(true); return; }"),
    'un refus « code_non_defini » serait lu comme Home Assistant injoignable');
  assert.equal(raisonEchec({ code: 'code_non_defini', message: 'x' }),
    'Aucun code administrateur n’est défini — un administrateur de Home Assistant doit le créer', 'le refus a sa phrase');
});

test('Paramètres ne promet plus « Encore 0000 »', () => {
  const par = lire('views/parametres.jsx');
  assert.ok(!par.includes("tr('Encore 0000')"), 'la pastille annonce encore un code par défaut qui n’ouvre plus rien');
  assert.ok(par.includes("tr('Pas encore défini')"));
});

test('la démo suit le composant : jamais défini au départ, refus nommé, un code posé referme tout', () => {
  const demo = lire('demo.js');
  assert.ok(demo.includes('const PIN_DEMO = { code: null, rates: 0, passe: 0 };'), 'la démo a encore un code par défaut');
  assert.ok(demo.includes("if (PIN_DEMO.code == null) return Promise.reject(refusDemo('code_non_defini'"));
  assert.ok(demo.includes('PIN_DEMO.code = String(msg.pin); PIN_DEMO.rates = 0; PIN_DEMO.passe = 0;'));
});
