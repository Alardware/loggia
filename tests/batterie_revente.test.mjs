// ─────────────────────────────────────────────────────────────────────────────
// La batterie domestique et la revente (audit du 07/10).
//
// Deux sources que le tableau de bord Énergie de Home Assistant déclare et que
// Loggia ne lisait pas :
//
//   — une source `battery`, avec ses deux compteurs (ce qu'elle rend à la
//     maison, ce qu'elle stocke). Le schéma de la maison n'avait donc jamais de
//     batterie chez qui n'avait pas rempli la fiche Entités à la main ;
//   — ce que l'injection RAPPORTE : le prix de rachat et la somme déjà gagnée
//     (`stat_compensation`), que Home Assistant tient comme il tient `stat_cost`.
//     L'injection s'affichait en kilowattheures, jamais en euros.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEnergy } from '../src/resolve.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = lire('src', 'App.jsx');
const HISTO = lire('src', 'views', 'energiehisto.jsx');
const STATE = lire('src', 'state.js');

/* Un index minimal : `entityMeta` vide, donc aucun voisinage — ce que les cas
 * ci-dessous n'utilisent pas. Les identifiants sont fictifs. */
const index = { nameOf: (id) => id, entityMeta: new Map(), byDevice: new Map(), siblingsOf: () => [] };
const resoudre = (energy_sources) => resolveEnergy({
  index, states: {}, energyPrefs: { energy_sources }, userCfg: {},
});

test('une source `battery` donne ses deux sens de puissance', () => {
  const r = resoudre([
    { type: 'grid', stat_energy_from: 'sensor.compteur' },
    {
      type: 'battery', stat_energy_from: 'sensor.bat_decharge', stat_energy_to: 'sensor.bat_charge',
      power_config: { stat_rate_from: 'sensor.bat_decharge_w', stat_rate_to: 'sensor.bat_charge_w' },
    },
  ]);
  assert.equal(r.haids.batChargeNow, 'sensor.bat_charge_w');
  assert.equal(r.haids.batDechargeNow, 'sensor.bat_decharge_w');
});

test('sans batterie déclarée, rien n’est inventé', () => {
  const r = resoudre([{ type: 'grid', stat_energy_from: 'sensor.compteur' }]);
  assert.equal(r.haids.batNow, null);
  assert.equal(r.haids.batChargeNow, null);
  assert.equal(r.haids.batDechargeNow, null);
  assert.equal(r.haids.batSoc, null);
});

test('une batterie sans `power_config` ne rend pas de taux', () => {
  /* La puissance se cherche alors sur l'appareil du compteur — ce que
   * `powerOf` fait, et qui demande un index peuplé. Ce qu'on vérifie ici :
   * aucun identifiant n'est fabriqué à partir du nom du compteur. */
  const r = resoudre([
    { type: 'battery', stat_energy_from: 'sensor.bat_decharge', stat_energy_to: 'sensor.bat_charge' },
  ]);
  assert.equal(r.haids.batChargeNow, null);
  assert.equal(r.haids.batDechargeNow, null);
});

test('ce que l’injection rapporte : la somme et le prix de rachat', () => {
  const r = resoudre([
    {
      type: 'grid', stat_energy_from: 'sensor.compteur', stat_energy_to: 'sensor.injection',
      number_energy_price: 0.21, number_energy_price_export: 0.13, stat_compensation: 'sensor.revente_eur',
    },
  ]);
  assert.equal(r.haids.revenuJour, 'sensor.revente_eur');
  assert.deepEqual(r.prixVente, [{ valeur: 0.13, entite: null, compteur: 'sensor.injection' }]);
  // Le prix d'ACHAT ne bouge pas.
  assert.deepEqual(r.prix, [{ valeur: 0.21, entite: null, compteur: 'sensor.compteur' }]);
});

test('un prix de rachat publié par une ENTITÉ passe aussi', () => {
  const r = resoudre([
    {
      type: 'grid', stat_energy_from: 'sensor.compteur', stat_energy_to: 'sensor.injection',
      entity_energy_price_export: 'sensor.tarif_rachat',
    },
  ]);
  assert.deepEqual(r.prixVente, [{ valeur: null, entite: 'sensor.tarif_rachat', compteur: 'sensor.injection' }]);
});

test('deux revenus : aucun ne vaut pour le tout, les parts restent', () => {
  /* Même règle que pour le coût (ADR 0030) : mieux vaut ne rien désigner que
   * d'élire une connexion au hasard. */
  const r = resoudre([
    { type: 'grid', stat_energy_from: 'sensor.a', stat_energy_to: 'sensor.inj_a', stat_compensation: 'sensor.rev_a' },
    { type: 'grid', stat_energy_from: 'sensor.b', stat_energy_to: 'sensor.inj_b', stat_compensation: 'sensor.rev_b' },
  ]);
  assert.equal(r.haids.revenuJour, null);
  assert.deepEqual(r.haids.revenuJourParts, ['sensor.rev_a', 'sensor.rev_b']);
});

test('sans revente déclarée, ni somme ni prix', () => {
  const r = resoudre([{ type: 'grid', stat_energy_from: 'sensor.compteur', stat_energy_to: 'sensor.injection' }]);
  assert.equal(r.haids.revenuJour, null);
  assert.equal(r.haids.revenuJourParts, null);
  assert.deepEqual(r.prixVente, []);
});

test('l’ancien format `flow_to` porte sa revente comme le nouveau', () => {
  const r = resoudre([{
    type: 'grid',
    flow_from: [{ stat_energy_from: 'sensor.compteur' }],
    flow_to: [{ stat_energy_to: 'sensor.injection', number_energy_price_export: 0.1, stat_compensation: 'sensor.rev' }],
  }]);
  assert.equal(r.haids.revenuJour, 'sensor.rev');
  assert.deepEqual(r.prixVente, [{ valeur: 0.1, entite: null, compteur: 'sensor.injection' }]);
});

test('le prix de rachat se lit comme celui d’achat', () => {
  assert.ok(STATE.includes('export function enVente()'), 'state.js n’expose plus le prix de rachat');
  assert.ok(STATE.includes("return (r && Array.isArray(r.prixVente)) ? r.prixVente : [];"),
    'vide par défaut : on ne devine pas un tarif de rachat');
});

test('la batterie se lit dans les DEUX sens, pas seulement signée', () => {
  /* Deux capteurs toujours positifs ne disent rien séparément : la puissance
   * de la batterie est leur différence, positive quand elle se remplit. */
  assert.ok(APP.includes('const batPresente = !!(EN.batNow || EN.batSoc || EN.batChargeNow || EN.batDechargeNow);'),
    'la batterie n’existe que si un capteur signé est renseigné');
  assert.ok(APP.includes("const c = avail(EN.batChargeNow) ? Math.max(0, numW(EN.batChargeNow)) : null;"), 'la charge');
  assert.ok(APP.includes("const d = avail(EN.batDechargeNow) ? Math.max(0, numW(EN.batDechargeNow)) : null;"), 'la décharge');
  assert.ok(APP.includes('return Math.round((c || 0) - (d || 0));'), 'la différence, positive en charge');
  assert.ok(APP.includes('if (avail(EN.batNow)) return Math.round(numW(EN.batNow));'),
    'un capteur signé doit rester prioritaire');
});

test('la revente s’affiche, et seulement quand elle existe', () => {
  assert.ok(APP.includes('const revenuJour = euroJour(EN.revenuJour);'),
    'le revenu se lit comme le coût : un cumul, pas une journée');
  assert.ok(APP.includes('EN.coutJour, EN.revenuJour];'), 'le revenu doit être demandé avec les autres compteurs du jour');
  assert.ok(APP.includes('venteHa={enVente()}') && APP.includes('revenuJour={revenuJour}'),
    'la carte du Tarif ne reçoit pas la revente');
  assert.ok(HISTO.includes("revenuJour != null && { l: tr('Revente du jour')"),
    'la ligne de revente n’existe plus, ou s’affiche sans chiffre');
  assert.ok(HISTO.includes("{tr('Revendu {p}', { p: dec(prixVente, 4) + ' ' + parKwh })}"),
    'le prix de rachat ne s’affiche plus sous celui d’achat');
  /* Une maison qui ne fait que revendre — prix d'achat inconnu, rachat déclaré
   * — garde sa carte. */
  assert.ok(HISTO.includes('if (prix.valeur == null && prixVente == null && !barre.length && !lignes.length) return null;'),
    'la carte disparaît alors qu’elle a un prix de rachat à montrer');
});

test('les deux mots nouveaux sont au catalogue anglais', () => {
  const EN = lire('src', 'langues', 'en.js');
  assert.ok(EN.includes("'Revente du jour':"), '« Revente du jour » sortirait en français partout');
  assert.ok(EN.includes("'Revendu {p}':"), '« Revendu … » sortirait en français partout');
});
