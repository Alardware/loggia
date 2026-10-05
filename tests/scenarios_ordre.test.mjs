// ─────────────────────────────────────────────────────────────────────────────
// Ranger les scénarios n'est pas un privilège d'administrateur (audit du 03/10).
//
// Sur l'ordinateur, la flèche de la vue Scénarios passait par
// `loggia/scenarios/config`, réservée aux administrateurs, et la vue avalait
// le refus (`.catch(() => {})`) : sur un compte ordinaire, la carte revenait à
// sa place au sondage suivant, sans un mot. Contraire à l'ADR 0125 — l'ordre
// des scénarios est de l'agencement — et à l'ADR 0046 — un refus se dit.
//
// `rangerScenarios` est REJOUÉE ici avec une doublure de la connexion : ce qui
// part, ce qui se replie sur un composant pas encore redémarré, ce qui remonte
// au toast. Le composant : tests/python/test_websocket_api_execution.py.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rangerScenarios } from '../src/scenarios.js';
import { texteRefus } from '../src/refus.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const demo = lire('src', 'demo.js');
const fonction = (nom) => { const d = app.indexOf('function ' + nom + '('); return app.slice(d, app.indexOf('\n}\n', d)); };

/** Une connexion qui note ce qu'on lui envoie, et répond par `repondre`. */
function connexion(repondre) {
  const envois = [];
  return { envois, callWS: (msg) => { envois.push(msg); return repondre(msg); } };
}

test('l’ordinateur range par la commande ouverte, qui ne porte que l’ordre', async () => {
  const etat = { scenarios: [{ id: 'cinema' }, { id: 'nuit' }] };
  const h = connexion(() => Promise.resolve({ ordre: ['cinema', 'nuit'], etat }));
  const r = await rangerScenarios(h, ['cinema', 'nuit']);
  assert.deepEqual(h.envois, [{ type: 'loggia/scenarios/ordre', ordre: ['cinema', 'nuit'] }],
    'l’ordre repartirait par la commande réservée aux administrateurs');
  assert.equal(r.etat, etat, 'l’état revenu doit redessiner la vue sans attendre le sondage');
});

test('un refus remonte, reconnaissable par l’écoute globale, au lieu d’être avalé', async () => {
  const h = connexion(() => Promise.reject({ code: 'unauthorized', message: 'Unauthorized' }));
  await assert.rejects(rangerScenarios(h, ['nuit']), (e) => {
    assert.equal(e.code, 'scenarios_ordre', 'le toast ne saurait pas le dire tel quel');
    assert.ok(e.message && e.message !== 'Unauthorized', 'le message brut du serveur ne doit pas s’afficher');
    assert.equal(e.cause.code, 'unauthorized', 'le refus d’origine reste attaché');
    return true;
  });
});

test('un scénario inconnu du composant est NOMMÉ dans le refus', async () => {
  const h = connexion(() => Promise.reject({ code: 'not_found', message: 'scenarios inconnus : perso_fantome, perso_x' }));
  await assert.rejects(rangerScenarios(h, ['perso_fantome', 'perso_x', 'nuit']), (e) => {
    assert.equal(e.code, 'scenarios_ordre');
    assert.ok(e.message.includes('perso_fantome, perso_x'), e.message);
    return true;
  });
});

test('un plafond du magasin se dit par son code et nomme sa clé, au lieu d’une panne', async () => {
  // Relecture du 03/10 : le composant répondait `invalid_format`, et l'écran
  // ne lisait que `not_found` — « Home Assistant a refusé ou n’a pas
  // répondu », une panne à lire l'écran, la clé perdue.
  const lourd = { code: 'payload_too_large', message: 'valeur trop volumineuse (262200 > 262144 octets) : loggia_scenarios' };
  await assert.rejects(rangerScenarios(connexion(() => Promise.reject(lourd)), ['nuit']), (e) => {
    assert.equal(e.code, 'scenarios_ordre', 'le toast ne saurait pas le dire tel quel');
    assert.equal(e.message, texteRefus(lourd), 'le plafond se dit de nouveau comme une panne');
    assert.ok(e.message.includes('loggia_scenarios'), e.message);
    return true;
  });
  // Le commun entier plein ne nomme rien : c'est la clé où l'ordre se range qui n'a pas pris.
  const plein = { code: 'payload_too_large', message: 'stockage commun trop volumineux (1048600 > 1048576 octets)' };
  await assert.rejects(rangerScenarios(connexion(() => Promise.reject(plein)), ['nuit']),
    (e) => e.code === 'scenarios_ordre' && e.message.includes('loggia_scenarios'));
  // Par l'ancienne voie aussi : elle passe par le même refus.
  const k = connexion((m) => Promise.reject(m.type === 'loggia/scenarios/ordre' ? { code: 'unknown_command' } : lourd));
  await assert.rejects(rangerScenarios(k, ['nuit']), (e) => e.code === 'scenarios_ordre' && e.message === texteRefus(lourd));
});

test('un composant pas encore redémarré : l’ancienne voie reprend, et son refus se dit aussi', async () => {
  const h = connexion((m) => m.type === 'loggia/scenarios/ordre'
    ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' })
    : Promise.resolve({ config: { ordre: ['nuit'] }, etat: { scenarios: [] } }));
  const r = await rangerScenarios(h, ['nuit']);
  assert.deepEqual(h.envois.map(m => m.type), ['loggia/scenarios/ordre', 'loggia/scenarios/config']);
  assert.deepEqual(h.envois[1].patch, { ordre: ['nuit'] }, 'l’ancienne voie ne doit porter que l’ordre');
  assert.ok(r && r.etat);
  const k = connexion((m) => Promise.reject(m.type === 'loggia/scenarios/ordre' ? { code: 'unknown_command' } : { code: 'unauthorized' }));
  await assert.rejects(rangerScenarios(k, ['nuit']), (e) => e.code === 'scenarios_ordre');
});

test('la vue ne rattrape plus le refus ; l’écoute globale le dit tel quel ; la démo sait ranger', () => {
  const hook = fonction('useScenarios');
  assert.ok(hook.includes('const r = await rangerScenarios(h, ids);'), 'l’ordinateur ne range plus par la commande ouverte');
  assert.ok(!hook.includes('enregistrer({ ordre: ids })'), 'l’ordre repasse par la commande réservée');
  const vue = fonction('ScenariosView');
  assert.ok(vue.includes('sc.ordonner(ids);') && !vue.includes('sc.ordonner(ids).catch'), 'le refus est de nouveau avalé');
  assert.ok(app.includes("r && r.code === 'scenarios_ordre' ? String(r.message)"), 'le toast remplacerait le refus nommé par un message générique');
  assert.ok(demo.includes("msg.type === 'loggia/scenarios/ordre'"), 'la démo ne sait plus ranger sur ordinateur');
});
