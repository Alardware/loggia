/* TEST AJOUTÉ (passe bis de l'étape 3 IoT, 25/10 ; relectures, points 5 et 6) — Paramètres › Alertes ÉCRIT, par le comportement.
 *
 * L'étape 3 faisait relire la configuration (`loggia/config/get`) à chaque réglage, avant de l'écrire, pour ne pas réécrire
 * « Fermer en cas de fuite » depuis une copie périmée. Deux défauts en sortaient :
 *  - point 5 : la bascule passait sur la valeur relue avant l'écriture, et un refus (`not_admin`) ne la ramenait plus — elle
 *    mentait (la régression de l'audit du 03/10) ;
 *  - point 6 : deux réglages rapides sur deux clés différentes relisaient la même configuration, et le second effaçait le premier.
 * La garde vit maintenant au SERVEUR (`loggia/config/set` garde `actions.vanne.actif` du disque, sous le verrou du magasin ;
 * tests/python/test_eau.py) : Paramètres écrit comme avant l'étape 3.
 *
 * Ces tests JOUENT le panneau (tests/crochets.mjs) sur un faux Home Assistant : on appuie, on lit ce qui part et ce qui reste à
 * l'écran. Sous `?alertes_ecriture`, parametres.jsx exporte le panneau — le fichier n'est pas touché. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/views/parametres.jsx?alertes_ecriture')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?alertes_ecriture'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { AlertesTele };' };",
  '}',
].join('\n')));
const { AlertesTele } = await import(new URL('../src/views/parametres.jsx?alertes_ecriture', import.meta.url).href);

const DISQUE = { actif: true, service: 'mobile_app_pixel', calme: { actif: false, debut: '22:00', fin: '07:00' },
  actions: { actif: true, lumieres: true, volets: true, vanne: { actif: true, entite: '' } } };
/* Le faux Home Assistant : `loggia/config/get` rend toujours le disque d'AVANT ; `loggia/config/set` note ce qu'il reçoit, et
 * répond quand le test le décide (`repondre`) — ou refuse. */
function maison({ refus = null } = {}) {
  const ecrits = [], attentes = [];
  return {
    ecrits,
    repondre: () => attentes.splice(0).forEach(f => f()),
    states: {},
    callWS(msg) {
      if (msg.type === 'loggia/config/get') return Promise.resolve({ config: { loggia_alertes: JSON.parse(JSON.stringify(DISQUE)) } });
      if (msg.type === 'get_services') return Promise.resolve({ notify: { mobile_app_pixel: {} } });
      if (msg.type === 'loggia/config/set') {
        ecrits.push(msg.config.loggia_alertes);
        return new Promise((ok, non) => attentes.push(() => (refus ? non(refus) : ok({ config: msg.config }))));
      }
      return Promise.reject({ code: 'unknown_command' });
    },
    callService: () => Promise.resolve(),
  };
}
const tic = () => new Promise(resolve => setImmediate(resolve));
async function ouvrir(options) {
  const hass = maison(options);
  const m = monter(AlertesTele, { hass });
  await tic();
  m.effets();
  return { hass, m };
}
const bascule = (m, label) => m.trouver(e => e.type && e.type.name === 'Tgl' && e.props.label === label)[0];

test('point 5 : un refus (`not_admin`) RAMÈNE la bascule — elle ne ment pas', async () => {
  const { hass, m } = await ouvrir({ refus: { code: 'not_admin', message: 'reglages reserves aux administrateurs Home Assistant : loggia_alertes' } });
  assert.equal(bascule(m, 'Heures calmes').props.on, false);
  m.appuyer(bascule(m, 'Heures calmes'), 'cb');
  await tic(); await tic(); m.effets();
  assert.equal(hass.ecrits.length, 1, 'l’écriture est partie');
  assert.equal(bascule(m, 'Heures calmes').props.on, true, 'le doigt voit sa bascule tout de suite');
  hass.repondre();
  await tic(); await tic(); m.effets();
  assert.equal(bascule(m, 'Heures calmes').props.on, false, 'refusée : elle revient à sa valeur d’avant');
  // Le message vit dans la description de la ligne de l'essai (`Ligne desc`), comme celui de « Envoyer un test ».
  const dit = m.trouver(e => e.props && typeof e.props.desc === 'string' && /administrat|loggia_alertes/i.test(e.props.desc));
  assert.ok(dit.length > 0, 'et le refus se dit');
});

test('point 6 : deux réglages rapides sur deux clés différentes — le second ne perd pas le premier', async () => {
  const { hass, m } = await ouvrir();
  m.appuyer(bascule(m, 'Heures calmes'), 'cb');
  m.appuyer(bascule(m, 'Lumières à 100 %'), 'cb');
  await tic(); await tic(); m.effets();
  const dernier = hass.ecrits[hass.ecrits.length - 1];
  assert.ok(dernier, 'les écritures sont parties');
  assert.deepEqual([dernier.calme.actif, dernier.actions.lumieres], [true, false], 'les deux réglages, dans la dernière écriture');
  hass.repondre();
  await tic(); m.effets();
  assert.deepEqual([bascule(m, 'Heures calmes').props.on, bascule(m, 'Lumières à 100 %').props.on], [true, false]);
});
