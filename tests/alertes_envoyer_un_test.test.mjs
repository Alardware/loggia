/* Paramètres › Alertes : « Envoyer un test » marche dès qu'un téléphone est choisi (retour du 15/10).
 *
 * « pour la prise lave vaisselle, j'ai testé, je ne reçois pas de notification quand c'est
 * terminer malgrer le reglage activé ». Le serveur avait bien envoyé la notification de fin de
 * cycle — mais le bouton d'essai était grisé tant que les alertes de SÛRETÉ étaient coupées
 * (`disabled={!cfg.actif || !cfg.service}`), alors que le téléphone choisi là sert aussi aux fins
 * de cycle des prises et aux veilles, sûreté coupée : `prevenir` (regles.py) ne lit que `service`.
 * Rien ne permettait de vérifier que le téléphone recevait.
 *
 * Ces tests JOUENT le panneau (tests/crochets.mjs) : on le monte sur un faux Home Assistant, on
 * lit le bouton, on appuie dessus, on lit ce que `notify` reçoit. Sous `?alertes_tele`,
 * parametres.jsx exporte le panneau — le fichier n'est pas touché. Ce qui est garanti :
 *  - un téléphone choisi, sûreté active OU coupée : le bouton est actif et envoie l'essai ;
 *  - sûreté coupée, le titre ne parle pas de sûreté : « Loggia » ; active, il garde « Loggia — sûreté » ;
 *  - sans téléphone, le bouton reste grisé, et un appui ne part nulle part ;
 *  - les messages ne changent pas : « Test envoyé — regardez votre téléphone. », « Envoi impossible… ». */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/views/parametres.jsx?alertes_tele')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?alertes_tele'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { AlertesTele };' };",
  '}',
].join('\n')));
const { AlertesTele } = await import(new URL('../src/views/parametres.jsx?alertes_tele', import.meta.url).href);
const PAR = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const TELEPHONE = 'mobile_app_pixel';
/* Un faux Home Assistant : la configuration des alertes que le composant sert (`loggia/config/get`), les services `notify` que l'installation
 * propose (`get_services`), et `callService`, qui note chaque envoi — ou le refuse. */
function maison({ actif, service = TELEPHONE, refuse = false }) {
  const envois = [];
  return {
    envois,
    states: {},
    callWS(msg) {
      if (msg.type === 'loggia/config/get') return Promise.resolve({ config: { loggia_alertes: { actif, service } } });
      if (msg.type === 'get_services') return Promise.resolve({ notify: { [TELEPHONE]: {}, notify: {} } });
      return Promise.reject({ code: 'unknown_command' });
    },
    callService(domaine, nom, donnees) {
      envois.push({ domaine, nom, donnees });
      return refuse ? Promise.reject(new Error('refusé')) : Promise.resolve();
    },
  };
}
const tic = () => new Promise(resolve => setImmediate(resolve));
/** Monte le panneau, laisse la configuration arriver, et le redessine. */
async function ouvrir(options) {
  const hass = maison(options);
  const m = monter(AlertesTele, { hass });
  await tic();
  m.effets();
  return { hass, m };
}
const bouton = (m) => m.trouver(e => e.type === 'button' && texteDe(e) === 'Envoyer un test')[0];
/** La ligne qui porte le bouton : sa description dit le message du dernier essai. */
const ligneDuBouton = (m) => m.trouver(e => e.props && Array.isArray([].concat(e.props.children)) && [].concat(e.props.children).includes(bouton(m)))[0];

test('un téléphone choisi, sûreté COUPÉE : le bouton est actif, et l’essai part avec un titre qui ne parle pas de sûreté', async () => {
  const { hass, m } = await ouvrir({ actif: false });
  const b = bouton(m);
  assert.ok(b, 'le bouton « Envoyer un test »');
  assert.equal(b.props.disabled, false, 'actif : un téléphone est choisi');
  assert.deepEqual([b.props.style.opacity, b.props.style.cursor], [1, 'pointer'], 'et il se dessine actif, pas grisé');
  m.appuyer(b);
  await tic();
  assert.deepEqual(hass.envois, [{ domaine: 'notify', nom: TELEPHONE, donnees: { title: 'Loggia', message: 'Notification de test — tout est en place.' } }],
    'une notification, au téléphone choisi, titrée « Loggia » — le titre des autres notifications du serveur');
  assert.ok(!/sûreté/i.test(hass.envois[0].donnees.title + ' ' + hass.envois[0].donnees.message), 'sûreté coupée, le texte du test n’en parle pas');
  m.effets();
  assert.equal(ligneDuBouton(m).props.desc, 'Test envoyé — regardez votre téléphone.', 'le message de succès ne change pas');
});

test('un téléphone choisi, sûreté ACTIVE : comme avant — le bouton est actif, le titre dit « Loggia — sûreté »', async () => {
  const { hass, m } = await ouvrir({ actif: true });
  const b = bouton(m);
  assert.equal(b.props.disabled, false);
  assert.deepEqual([b.props.style.opacity, b.props.style.cursor], [1, 'pointer']);
  m.appuyer(b);
  await tic();
  assert.deepEqual(hass.envois, [{ domaine: 'notify', nom: TELEPHONE, donnees: { title: 'Loggia — sûreté', message: 'Notification de test — tout est en place.' } }]);
  m.effets();
  assert.equal(ligneDuBouton(m).props.desc, 'Test envoyé — regardez votre téléphone.');
});

for (const actif of [true, false]) {
  test('sans téléphone (' + (actif ? 'sûreté active' : 'sûreté coupée') + ') : le bouton reste grisé, et un appui ne part nulle part', async () => {
    const { hass, m } = await ouvrir({ actif, service: '' });
    const b = bouton(m);
    assert.equal(b.props.disabled, true, 'grisé : personne à qui parler');
    assert.deepEqual([b.props.style.opacity, b.props.style.cursor], [.45, 'not-allowed']);
    // Un clavier ou un lecteur d'écran qui franchirait `disabled` : l'essai le refuse lui-même, et le dit.
    m.appuyer(b);
    await tic();
    m.effets();
    assert.deepEqual(hass.envois, [], 'rien ne part');
    assert.equal(ligneDuBouton(m).props.desc, 'Choisissez d’abord un téléphone.');
  });
}

test('un refus de Home Assistant se dit comme avant — sûreté coupée aussi', async () => {
  const { hass, m } = await ouvrir({ actif: false, refuse: true });
  m.appuyer(bouton(m));
  await tic();
  m.effets();
  assert.equal(hass.envois.length, 1, 'l’essai est parti, Home Assistant l’a refusé');
  assert.equal(ligneDuBouton(m).props.desc, 'Envoi impossible — Home Assistant a refusé ce service.');
});

test('le bouton ne lit plus l’interrupteur des alertes de sûreté — ni pour se griser, ni pour se dessiner', () => {
  assert.ok(!PAR.includes('disabled={!cfg.actif || !cfg.service}'), 'le bouton se grisait sûreté coupée');
  assert.ok(PAR.includes("disabled={!cfg.service} style={{ ...btnSecondaire, opacity: cfg.service ? 1 : .45, cursor: cfg.service ? 'pointer' : 'not-allowed' }}"));
  // Le titre neutre est le seul texte du test qui dépend de la sûreté.
  assert.ok(PAR.includes("title: cfg.actif ? tr('Loggia — sûreté') : tr('Loggia')"));
});
