/* La configuration en direct entre les ecrans (ADR 0067, 22/09).
 *
 * Un reglage fait sur le telephone n'arrivait sur l'ordinateur qu'au
 * rechargement. Le composant dit desormais aux ecrans abonnes le compte et
 * les cles qui ont change ; chaque ecran decide s'il relit, et relit sous
 * ses propres droits. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { doitRelire } from '../src/config.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('doitRelire : les cles communes concernent tout le monde, les personnelles le seul compte qui les a ecrites', () => {
  assert.equal(doitRelire({ user_id: 'u1', perso: [], communes: ['loggia_rooms'] }, { userId: 'u2' }), true, 'la maison change : tout le monde relit');
  assert.equal(doitRelire({ user_id: 'u1', perso: ['loggia_look'], communes: [] }, { userId: 'u1' }), true, 'mon autre ecran');
  assert.equal(doitRelire({ user_id: 'u1', perso: ['loggia_look'], communes: [] }, { userId: 'u2' }), false, 'le reglage personnel d’un autre compte ne me regarde pas');
  assert.equal(doitRelire({ user_id: 'u1', perso: [], communes: [] }, { userId: 'u1' }), false, 'rien n’a change');
  assert.equal(doitRelire(null, { userId: 'u1' }), false);
  assert.equal(doitRelire({ user_id: 'u1', perso: ['x'] }, {}), false, 'sans compte connu, une cle personnelle ne dit rien');
  assert.equal(doitRelire({ communes: 'loggia_rooms' }, {}), false, 'un champ mal forme ne vaut rien');
});

test('App : l’ecran s’abonne au flux, relit groupe, et jamais pendant l’edition', () => {
  const app = lire('src/App.jsx');
  assert.ok(/import \{[^}]*doitRelire[^}]*\} from '\.\/config\.js';/.test(app), 'importe de config.js');
  assert.ok(app.includes("h.connection.subscribeMessage((chg) => { if (alive && doitRelire(chg, { userId: monId })) relire(); }, { type: 'loggia/config/suivre' })"), 'l’abonnement, filtre par doitRelire');
  assert.ok(app.includes("if (editRef.current) { enAttenteRef.current = true; return; }") && app.includes('}, 300);'), 'en edition on attend ; sinon relecture groupee');
  assert.ok(app.includes("configProbe(h).then(frais => { if (alive && frais.available) setServerCfg(frais.config || {}); });"), 'la relecture passe par loggia/config/get, sous ses droits');
  assert.ok(app.includes("if (!editMode && enAttenteRef.current && relireRef.current) { enAttenteRef.current = false; relireRef.current(); }"), 'a la sortie de l’edition, ce qui attendait se relit');
  assert.ok(app.includes("if (desabonner) { try { desabonner(); } catch {} }"), 'l’abonnement se retire avec l’ecran');
});

test('la demo tient l’abonnement, muet ; le composant range la commande parmi les ouvertes', () => {
  assert.ok(lire('src/demo.js').includes("msg.type === 'loggia/config/suivre') return Promise.resolve(() => {});"), 'la demo');
  const ws = lire('custom_components/loggia/websocket_api.py');
  assert.ok(ws.includes('WS_CFG_SUIVRE = "loggia/config/suivre"') && ws.includes('connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_CONFIG, transmettre)'), 'un flux, par le dispatcher');
  assert.ok(lire('tests/python/test_websocket_api.py').includes('"WS_CFG_SUIVRE",'), 'classee ouverte, a dessein : des noms de cles seulement');
});
