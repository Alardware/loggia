// ─────────────────────────────────────────────────────────────────────────────
// La fiche Système COMPLÈTE la découverte, elle ne la remplace plus (07/10).
//
// « Une personne autre que moi qui installe Loggia pour sa propre maison, tout
// doit être opérationnel. » La fiche faisait foi seule dès qu'elle existait :
// remplir UN emplacement de machine faisait perdre les deux autres, que la
// découverte connaissait pourtant.
//
// La granularité est l'EMPLACEMENT. Celui que la fiche déclare lui appartient —
// même vide, c'est un choix, et on ne ressuscite pas une machine qu'on vient
// d'en retirer. Les autres restent à la découverte.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { sysSensors, sysNames } = await import('../src/sysconf.js');
const { setLoggiaState } = await import('../src/state.js');

/* Trois machines découvertes, toutes fictives. `clients` manque exprès : la
 * découverte ne le remplit que pour une passerelle réseau. */
const machine = (n) => ({
  name: 'Machine decouverte ' + n,
  cpu: 'sensor.cpu_' + n, memPct: 'sensor.mem_' + n, disk: 'sensor.disk_' + n,
  temp: 'sensor.temp_' + n, uptime: 'sensor.up_' + n, online: 'binary_sensor.on_' + n, clients: null,
});
const DECOUVERTE = { energy: null, system: { available: true, hosts: [machine('a'), machine('b'), machine('c')] } };

/* `sysNames` n'a pas d'alias dans `ENT_ALIAS` : il se lit dans la description
 * d'entites (`LOGGIA_ENT`), pas dans la configuration. On remplit donc les deux
 * canaux, chacun par sa porte. */
/* Ni `system` ni `sysNames` n'ont d'alias dans `ENT_ALIAS` : tous deux se
 * lisent dans la DESCRIPTION d'entites (`LOGGIA_ENT`), que le composant
 * remplit, et pas dans la configuration de l'appareil. */
const avec = (resolved, ent, quoi) => {
  setLoggiaState({ resolved, ent: ent || {}, cfg: {} });
  try { return quoi(); } finally { setLoggiaState({ resolved: null, ent: null, cfg: {} }); }
};

test('sans fiche, les trois emplacements viennent de la découverte', () => {
  const s = avec(DECOUVERTE, {}, sysSensors);
  assert.equal(s.host.cpu, 'sensor.cpu_a');
  assert.equal(s.nebula.cpu, 'sensor.cpu_b');
  assert.equal(s.ucg.cpu, 'sensor.cpu_c');
});

test('un emplacement renseigné à la main ne fait plus perdre les autres', () => {
  /* LE DÉFAUT CORRIGÉ. On rendait la fiche seule : `nebula` et `ucg`
   * repartaient vides parce qu'on avait nommé une machine. */
  const s = avec(DECOUVERTE, { system: { host: { cpu: 'sensor.mon_cpu', online: 'binary_sensor.mon_hote' } } }, sysSensors);
  assert.equal(s.host.cpu, 'sensor.mon_cpu', 'le capteur choisi à la main fait foi');
  assert.equal(s.nebula.cpu, 'sensor.cpu_b', 'la deuxième machine se perdait');
  assert.equal(s.ucg.cpu, 'sensor.cpu_c', 'la troisième aussi');
});

test('un emplacement VIDÉ dans la fiche reste vide', () => {
  /* L'autre moitié de la règle : on ne ressuscite pas une machine qu'on vient
   * d'en retirer, même si la découverte la connaît encore. */
  const s = avec(DECOUVERTE, { system: { nebula: {} } }, sysSensors);
  assert.deepEqual(s.nebula, {}, 'la machine retirée revient par la découverte');
  assert.equal(s.host.cpu, 'sensor.cpu_a', 'les autres emplacements ne bougent pas');
  assert.equal(s.ucg.cpu, 'sensor.cpu_c');
});

test('sans découverte ni fiche, trois emplacements vides — pas une erreur', () => {
  const s = avec({ system: { available: false, hosts: [] } }, {}, sysSensors);
  assert.deepEqual(Object.keys(s).sort(), ['host', 'nebula', 'ucg']);
  assert.deepEqual(s.nebula, {});
});

test('les noms : le libellé d’attente, puis l’appareil, puis le choix', () => {
  // Rien : le libellé d'attente.
  assert.match(avec({ system: { available: false, hosts: [] } }, {}, sysNames).nebula, /2/);
  // La découverte : le nom que l'appareil porte dans Home Assistant.
  assert.equal(avec(DECOUVERTE, {}, sysNames).nebula, 'Machine decouverte b');
  // Le choix explicite gagne sur les deux.
  assert.equal(avec(DECOUVERTE, { sysNames: { nebula: 'Mon serveur' } }, sysNames).nebula, 'Mon serveur');
});

test('un nom choisi survit à une fiche de capteurs', () => {
  /* La découverte était coupée dès qu'une fiche de capteurs existait, ET elle
   * passait après le nom choisi, qu'elle écrasait : une machine désignée à la
   * main restait « Machine 2 ». */
  const n = avec(DECOUVERTE,
    { system: { host: { cpu: 'sensor.mon_cpu' } }, sysNames: { host: 'Mon hôte' } },
    sysNames);
  assert.equal(n.host, 'Mon hôte');
  assert.equal(n.ucg, 'Machine decouverte c', 'les emplacements non touchés gardent le nom de leur appareil');
});
