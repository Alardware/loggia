// ─────────────────────────────────────────────────────────────────────────────
// Audit des capteurs du 19/10 (lot 2) : ce que l'écran dit des règles du
// serveur.
//
// H3 — « Observer sans agir » couvre aussi les veilles (la VMC du CO₂, la
// prise des heures creuses) : l'interrupteur unique des Règles lit et pose
// leur drapeau avec ceux des six autres modules. La sûreté, elle, agit
// toujours : l'écran le dit à côté de l'interrupteur, « sauf la sûreté ».
//
// M1 — une seule règle « plante ou fuite » : Paramètres › Alertes compte les
// détecteurs de fuite comme le serveur et l'Accueil les jugent — ni un modèle
// ou un groupe, ni le besoin d'eau d'une plante de `loggia_plants`.
//
// M22 — une catégorie décochée coupe aussi la réaction de la maison : l'écran
// le dit sous chaque case qui fait réagir la maison.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
await import('./rendu.mjs');   // les crochets `.jsx`, avant le premier import d'une vue
const P = await import('../src/views/parametres.jsx');
const { bilanEcritures } = await import('../src/refus.js');

const PAR = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');
const INCONNUE = { code: 'unknown_command', message: 'Unknown command.' };

function faux(reponses) {
  const recus = [];
  return {
    recus,
    callWS(msg) {
      recus.push(msg);
      const r = Object.prototype.hasOwnProperty.call(reponses, msg.type) ? reponses[msg.type] : { rejet: INCONNUE };
      return r && r.rejet ? Promise.reject(r.rejet) : Promise.resolve(r);
    },
  };
}

test('H3 : le drapeau des veilles se lit dans leur configuration, comme celui des volets', async () => {
  const h = faux({ 'loggia/veilles/etat': { config: { simulation: { actif: true } } } });
  const lus = await P.lireObservation(h);
  assert.equal(lus.veilles, true);
  assert.deepEqual(h.recus.filter(m => m.type === 'loggia/veilles/etat'), [{ type: 'loggia/veilles/etat' }]);
  assert.equal((await P.lireObservation(faux({ 'loggia/veilles/etat': { config: {} } }))).veilles, false,
    'une configuration sans drapeau : les veilles agissent');
  // Les veilles muettes (`unknown_command`, `not_available`) ne comptent pas plus qu'un autre module muet.
  assert.equal((await P.lireObservation(faux({}))), null, 'personne ne répond : l’interrupteur attend');
});

test('H3 : la bascule écrit le patch des veilles sous leur clé, et un refus la nomme', async () => {
  const h = faux({ 'loggia/veilles/config': { config: { simulation: { actif: true } } } });
  const envois = P.ecrituresObservation(h, ['veilles'], true);
  assert.deepEqual(envois.map(([cle]) => cle), ['loggia_veilles']);
  assert.deepEqual(h.recus, [{ type: 'loggia/veilles/config', patch: { simulation: { actif: true } } }]);
  assert.equal(await bilanEcritures(envois), '');
  const refuse = faux({ 'loggia/veilles/config': { rejet: { code: 'unauthorized', message: 'Unauthorized' } } });
  assert.match(await bilanEcritures(P.ecrituresObservation(refuse, ['veilles'], true)), /loggia_veilles/);
});

test('H3 : l’écran nomme les veilles et dit que la sûreté n’observe pas', () => {
  assert.ok(PAR.includes("veilles: tr('Veilles')"), 'les veilles n’ont pas de nom dans la liste « En observation »');
  assert.ok(PAR.includes("tr('sauf la sûreté')"), 'à côté de l’interrupteur, rien ne dit que la sûreté agit toujours');
});

test('M1 : Paramètres › Alertes ne compte ni un modèle, ni un groupe, ni le besoin d’eau d’une plante', () => {
  const bin = (dc, etat = 'off') => ({ state: etat, attributes: { device_class: dc } });
  const S = {
    'binary_sensor.fuite_evier': bin('moisture'),
    'binary_sensor.dracaena_besoin_eau': bin('moisture'),
    'binary_sensor.ficus_sec': bin('moisture'),
    'binary_sensor.ficusx_fuite': bin('moisture'),
    'binary_sensor.fumee': bin('smoke'),
    'sensor.ficus_moisture': bin('moisture'),
  };
  const plateformes = { 'binary_sensor.dracaena_besoin_eau': 'template', 'binary_sensor.ficus_sec': 'threshold' };
  const ctx = { plateforme: (id) => plateformes[id] || null, plantes: ['binary_sensor.ficus', null, 42, ''] };
  assert.deepEqual(P.detecteursAlertes(S, ['moisture'], ctx).sort(), ['binary_sensor.ficusx_fuite', 'binary_sensor.fuite_evier'],
    'le seuil du ficus est sa soif, pas une fuite ; « ficusx » n’est pas le ficus');
  assert.deepEqual(P.detecteursAlertes(S, ['smoke'], ctx), ['binary_sensor.fumee'], 'la règle ne vaut que pour moisture');
  assert.equal(P.detecteursAlertes(S, ['moisture'], {}).length, 4, 'sans index ni plantes, tout binaire moisture compte — comme avant');
});

test('M22 : sous chaque case qui fait réagir la maison, l’écran dit que la décocher coupe aussi la réaction', () => {
  assert.ok(PAR.includes("tr('Décochée : ni alerte, ni réaction de la maison.')"), 'la conséquence d’une case décochée n’est pas dite');
  // La phrase n'a de sens que pour ce qui fait réagir la maison : pas pour l'ouverture sous alarme.
  assert.ok(/REAGISSENT = \['fumee', 'gaz', 'co', 'fuite', 'alarme'\]/.test(PAR), 'les catégories qui font réagir la maison ne sont plus nommées');
});
