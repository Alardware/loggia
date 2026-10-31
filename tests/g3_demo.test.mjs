// ─────────────────────────────────────────────────────────────────────────────
// La démo porte les cas du chantier G3 (ADR 0302) : deux onduleurs, la batterie
// au sens de Home Assistant, la borne trouvée sans réglage, le chauffe-eau,
// Tempo, la prévision solaire — et `?demo&tarif=dynamique`.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maisonDeLEauDemo, prefsEnergieDemo, previsionSolaireDemo } from '../src/demo.js';
import { registresDuComposant, buildIndex } from '../src/discovery.js';
import { resolveEnergy } from '../src/resolve.js';
import { idsDe, sommeLue } from '../src/energieparts.js';
import { puissanceBatterie, niveauBatterie, reserveBatterieKwh } from '../src/energiebatterie.js';
import { vueBorne } from '../src/bornevue.js';
import { vueEauChaude } from '../src/eauchaude.js';
import { totauxPrevision } from '../src/previsionsolaire.js';
import { pointsAttention } from '../src/attention.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');

async function maison() {
  const m = maisonDeLEauDemo();
  const r = await registresDuComposant({ callWS: async () => ({ index: m.index() }) });
  const index = buildIndex({ ...r, states: m.states });
  const e = resolveEnergy({ index, states: m.states, energyPrefs: prefsEnergieDemo(), userCfg: {} });
  return { S: m.states, e };
}
const lecteur = (S) => (id) => { const n = S[id] ? parseFloat(S[id].state) : NaN; return Number.isFinite(n) ? n : null; };

test('deux onduleurs : 1 840 W et 4,32 kWh, comme le capteur unique d’avant', async () => {
  const { S, e } = await maison();
  assert.deepEqual(e.haids.solarNowParts, ['sensor.solaire_est_puissance', 'sensor.solaire_ouest_puissance']);
  assert.equal(sommeLue(idsDe(e.haids, 'solarNow'), lecteur(S)), 1840);
  assert.equal(Math.round(sommeLue(idsDe(e.haids, 'prodJour'), lecteur(S)) * 100) / 100, 4.32);
});

test('la batterie : 310 W rendus à la maison (positif chez Home Assistant), 78 %, 7,8 kWh', async () => {
  const { S, e } = await maison();
  assert.equal(puissanceBatterie(e.haids, lecteur(S)), -310);
  assert.equal(niveauBatterie({ EN: e.haids, batteries: e.batteries, lire: lecteur(S) }), 78);
  assert.equal(Math.round(reserveBatterieKwh({ batteries: e.batteries, lire: lecteur(S) }) * 10) / 10, 7.8);
});

test('la borne se trouve seule et remplit `evNow`', async () => {
  const { S, e } = await maison();
  assert.equal(e.haids.evNow, 'sensor.borne_recharge');
  assert.equal(e.borne.interrupteur, 'switch.borne_charge');
  const v = vueBorne({ borne: e.borne, S });
  assert.equal(v.etat, 'branchee');
  assert.equal(v.pause, 'pause');
  // La fiche de la démo ne la nomme plus : elle vient de la découverte.
  assert.doesNotMatch(DEMO, /evNow: 'sensor\.borne_recharge'/);
});

test('le chauffe-eau, Tempo et la prévision', async () => {
  const { S, e } = await maison();
  // Le chauffe-eau de G1 (`water_heater.ballon`), repris tel quel.
  assert.equal(vueEauChaude({ id: 'water_heater.ballon', S }).phrase.texte, 'Pompe à chaleur · 52,5° → 55°');
  assert.equal(e.haids.tempoDemain, 'sensor.rte_tempo_prochaine_couleur');
  assert.equal(pointsAttention({ S, tempoDemain: e.haids.tempoDemain }).filter(p => p.cle.indexOf('tempo:') === 0).length, 1);
  assert.deepEqual(e.previsionSolaire, ['demo_prevision']);
  const p = totauxPrevision(previsionSolaireDemo(), ['demo_prevision']);
  assert.equal(Math.round(p.aujourdhui * 10) / 10, 12.4);
  assert.equal(Math.round(p.demain * 10) / 10, 9.8);
});

test('le prix dynamique a sa variante', () => {
  assert.match(DEMO, /VARIANTES_TARIF = \['dynamique'\]/);
  assert.match(DEMO, /entity_energy_price: 'sensor\.prix_spot'/);
});
