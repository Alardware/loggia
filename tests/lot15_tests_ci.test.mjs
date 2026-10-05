// ─────────────────────────────────────────────────────────────────────────────
// Lot 15 de l'audit du 03/10 — la porte des commandes, EXÉCUTÉE, et ce que la
// CI vérifie à chaque PR.
//
// `commander` et `commanderService` sont le dernier mètre de cinquante et
// quelques gestes du dashboard : le code d'alarme, la route directe de ce qui
// n'a pas de capacité, le rejet que l'écoute globale d'App.jsx transforme en
// toast. Aucun test ne les appelait — on relisait leur texte. Perdre le code
// d'alarme, avaler un refus du serveur ou une transition laissait les 1 532
// tests verts (rejoué le 04/10, quatre mutations sur quatre).
// Ici, un faux `hass` reçoit les appels, et l'on regarde ce qui est PARTI.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commander, commanderService } from '../src/actions.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const et = (state, attributes = {}) => ({ state: String(state), attributes });

const SERVICES = {
  homeassistant: { turn_on: {}, turn_off: {}, toggle: {} },
  light: { turn_on: {}, turn_off: {}, toggle: {} },
  cover: { open_cover: {}, close_cover: {}, stop_cover: {}, set_cover_position: {} },
  climate: { set_temperature: {}, set_hvac_mode: {} },
  media_player: { play_media: {}, media_play: {}, media_pause: {} },
  alarm_control_panel: { alarm_arm_home: {}, alarm_arm_away: {}, alarm_disarm: {} },
};
const ETATS = {
  'alarm_control_panel.entree': et('armed_away', { supported_features: 3 }),
  'light.salon': et('off', { supported_color_modes: ['brightness'] }),
  'cover.salon': et('open', { supported_features: 15 }),
  'cover.garage': et('closed', { supported_features: 3 }),   // ni position ni arrêt
  'climate.chambre': et('heat', { supported_features: 1, min_temp: 7, max_temp: 22, target_temp_step: 0.5 }),
  'media_player.salon': et('idle', { supported_features: 512 }),
};

/** Un `hass` qui note ce qu'on lui envoie, et qui peut refuser comme le serveur. */
function fauxHass({ states = ETATS, services = SERVICES, refus = null } = {}) {
  const appels = [];
  return {
    states, services, appels,
    callService(...args) {
      appels.push(args);
      // PAS `Promise.reject` : il est intercepté plus bas, et ce refus-ci est
      // celui du serveur, que `runPlan` attrape lui-même.
      return refus ? new Promise((_, ko) => ko(refus)) : Promise.resolve();
    },
    callWS() { throw new Error('aucune commande WebSocket attendue ici'); },
  };
}

/* Les rejets que `commander` lance pour l'écoute globale (`unhandledrejection`
 * d'App.jsx, le seul canal d'erreur visible). Sous node:test, un rejet non
 * traité fait échouer le test qui le porte : on les recueille à la source, ce
 * qui permet aussi de vérifier qu'ils partent bien — et avec quel `code`. */
async function rejetsPendant(geste) {
  const vrai = Promise.reject;
  const vus = [];
  Promise.reject = function (e) {
    vus.push(e);
    const p = vrai.call(Promise, e);
    p.catch(() => {});
    return p;
  };
  try {
    const rendu = geste();
    // `runPlan` est asynchrone : la relance part quelques micro-tâches plus tard.
    await new Promise(r => setImmediate(r));
    return { rendu, vus };
  } finally {
    Promise.reject = vrai;
  }
}

test('le code d’alarme arrive à Home Assistant, par la route vérifiée', async () => {
  const hass = fauxHass();
  const { rendu, vus } = await rejetsPendant(() => commanderService(hass, 'alarm_control_panel.entree',
    'alarm_control_panel', 'alarm_disarm', { entity_id: 'alarm_control_panel.entree', code: '4321' }));
  assert.deepEqual(hass.appels, [['alarm_control_panel', 'alarm_disarm', { code: '4321' }, { entity_id: 'alarm_control_panel.entree' }]],
    'le code d’alarme s’est perdu en chemin : un panneau protégé refuse la commande');
  assert.deepEqual(rendu, { code: '4321' }, 'la charge rendue est celle envoyée');
  assert.deepEqual(vus, [], 'une commande acceptée ne lance aucun rejet');

  // Par la capacité directement, le code passe par `options`.
  const h2 = fauxHass();
  await rejetsPendant(() => commander(h2, 'alarm_control_panel.entree', 'arm_home', undefined, null, { code: '4321' }));
  assert.deepEqual(h2.appels, [['alarm_control_panel', 'alarm_arm_home', { code: '4321' }, { entity_id: 'alarm_control_panel.entree' }]]);
  // Sans code, rien n'est inventé : un panneau non protégé n'en veut pas.
  const h3 = fauxHass();
  await rejetsPendant(() => commanderService(h3, 'alarm_control_panel.entree', 'alarm_control_panel', 'alarm_arm_away', { entity_id: 'alarm_control_panel.entree' }));
  assert.deepEqual(h3.appels, [['alarm_control_panel', 'alarm_arm_away', {}, { entity_id: 'alarm_control_panel.entree' }]]);
});

test('ce que le moteur ne sait pas vérifier garde sa route directe, ENTIÈRE', async () => {
  // Sans capacité (`play_media` n'en a pas) : l'appel part tel quel, rien ne tombe.
  const lecture = { entity_id: 'media_player.salon', media_content_id: 'radio', media_content_type: 'music' };
  const h1 = fauxHass();
  const r1 = await rejetsPendant(() => commanderService(h1, 'media_player.salon', 'media_player', 'play_media', lecture));
  assert.deepEqual(h1.appels, [['media_player', 'play_media', lecture]]);
  assert.equal(r1.rendu, null, 'la route directe ne prétend pas savoir ce qui a été appliqué');

  // Un champ que la capacité ne déclare pas (une transition) : la validation le
  // perdrait, donc l'appel garde la route directe, transition comprise.
  const fondu = { entity_id: 'light.salon', brightness_pct: 40, transition: 2 };
  const h2 = fauxHass();
  await rejetsPendant(() => commanderService(h2, 'light.salon', 'light', 'turn_on', fondu));
  assert.deepEqual(h2.appels, [['light', 'turn_on', fondu]], 'la transition est tombée en chemin');

  // Sans entité désignée, pas de plan possible : la route directe aussi.
  const h3 = fauxHass();
  await rejetsPendant(() => commanderService(h3, null, 'light', 'turn_off', { entity_id: ['light.salon'] }));
  assert.deepEqual(h3.appels, [['light', 'turn_off', { entity_id: ['light.salon'] }]]);

  // Et sans Home Assistant, rien ne casse.
  assert.equal(commanderService(null, null, 'light', 'turn_off', {}), null);
});

test('la route vérifiée rend ce qui a été ENVOYÉ, bornes de l’entité appliquées', async () => {
  const h1 = fauxHass();
  const r1 = await rejetsPendant(() => commanderService(h1, 'light.salon', 'light', 'turn_on', { entity_id: 'light.salon', brightness_pct: 140 }));
  assert.deepEqual(h1.appels, [['light', 'turn_on', { brightness_pct: 100 }, { entity_id: 'light.salon' }]]);
  assert.deepEqual(r1.rendu, { brightness_pct: 100 });
  // 34° demandés, 22° au plus sur ce plancher chauffant : l'écran affiche 22.
  const h2 = fauxHass();
  const r2 = await rejetsPendant(() => commander(h2, 'climate.chambre', 'set_temperature', 34, 'temperature'));
  assert.equal(r2.rendu, 22);
  assert.deepEqual(h2.appels, [['climate', 'set_temperature', { temperature: 22 }, { entity_id: 'climate.chambre' }]]);
  assert.deepEqual(r2.vus, []);
});

test('une carte de services VIDE (la démo) n’interdit rien', async () => {
  // `{}` dit « je ne sais pas », pas « aucun service » : sans cela, chaque
  // commande vérifiée était refusée dans la démo, masquée par l'optimisme.
  const hass = fauxHass({ services: {} });
  const { vus } = await rejetsPendant(() => commander(hass, 'light.salon', 'turn_off'));
  assert.deepEqual(hass.appels, [['light', 'turn_off', {}, { entity_id: 'light.salon' }]]);
  assert.deepEqual(vus, []);
});

test('un plan refusé ne part pas, et le dit : rejet « service_error » motivé', async () => {
  const hass = fauxHass();
  const { rendu, vus } = await rejetsPendant(() => commander(hass, 'cover.garage', 'set_position', 40, 'position'));
  assert.equal(rendu, null, 'la vue ne doit afficher aucun changement : il n’y en aura pas');
  assert.deepEqual(hass.appels, [], 'une commande refusée est partie quand même');
  assert.equal(vus.length, 1, 'le refus est redevenu muet');
  assert.equal(vus[0].code, 'service_error', 'sans ce code, l’écoute globale ignore le rejet');
  assert.match(vus[0].message, /set_position/, 'le motif de `planAction` s’est perdu');

  // Même chose quand on passe par le nom du service.
  const h2 = fauxHass();
  const r2 = await rejetsPendant(() => commanderService(h2, 'cover.garage', 'cover', 'set_cover_position', { entity_id: 'cover.garage', position: 40 }));
  assert.equal(r2.rendu, null);
  assert.deepEqual(h2.appels, []);
  assert.deepEqual(r2.vus.map(e => e.code), ['service_error']);
});

test('un refus de Home Assistant remonte à l’écoute globale', async () => {
  const hass = fauxHass({ refus: Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }) });
  const { rendu, vus } = await rejetsPendant(() => commander(hass, 'cover.salon', 'set_position', 30, 'position'));
  assert.equal(rendu, 30, 'la valeur envoyée est rendue tout de suite, avant la réponse');
  assert.equal(hass.appels.length, 1);
  assert.equal(vus.length, 1, '`runPlan` a avalé le refus : le toast « Commande non exécutée » ne viendra pas');
  assert.equal(vus[0].code, 'service_error');
  assert.equal(vus[0].message, 'Unauthorized', 'la raison du serveur doit arriver jusqu’au toast');
});

// ─────────────────────────────────────────────────────────────────────────────
// Ce que la CI vérifie à chaque PR (validate.yml — PAS eslint.config.mjs,
// protégé). Trois trous : la démo ne se construisait qu'APRÈS la fusion (alors
// que son greffon de vite.config.js la fait échouer, un gabarit de `site/`
// renommé suffit, quand `npm run build` passe), `--quiet` cachait les
// avertissements d'eslint, et la couverture ne se voyait nulle part.
// ─────────────────────────────────────────────────────────────────────────────

const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const WF = lire('.github', 'workflows', 'validate.yml');

/** Le texte d'un travail de validate.yml, jusqu'au suivant. */
function travail(nom) {
  const debut = WF.indexOf('\n  ' + nom + ':\n');
  assert.ok(debut >= 0, `le travail « ${nom} » a disparu de validate.yml`);
  const suite = WF.slice(debut + 1).search(/\n {2}[A-Za-z_-]+:\n/);
  return suite < 0 ? WF.slice(debut) : WF.slice(debut, debut + 1 + suite);
}

test('la démo en ligne se construit à chaque PR, pas seulement après la fusion', () => {
  assert.match(WF, /^ {2}pull_request:/m, 'la validation ne tourne plus sur les PR');
  const front = travail('frontend');
  assert.ok(front.includes('\n      - run: npm run build:demo\n'),
    'la démo ne se construit qu’après la fusion : un gabarit de site/ renommé casse la publication sans que la PR le voie');
  assert.ok(front.indexOf('npm ci') < front.indexOf('npm run build:demo'), 'la démo se construit avant que les dépendances soient là');
});

test('le cliquet des avertissements d’eslint ne se desserre pas', () => {
  const front = travail('frontend');
  const m = front.match(/\n {6}- run: npm run lint:tout -- --max-warnings (\d+)\n/);
  assert.ok(m, 'plus de cliquet : un avertissement de plus passe sans bruit, `npm run lint` (--quiet) ne les compte pas');
  // 56 avant le lot 15 de l'audit du 03/10 (51 exhaustive-deps, 3 jsx-a11y,
  // 2 directives inutiles), 53 après lui, 48 après le lot 16 (05/10 : les
  // directives des faux positifs jsx-a11y posées sur leur ligne, il ne reste
  // que des exhaustive-deps). Le chiffre ne peut que DESCENDRE : le
  // relever est une décision, et elle se prend ici.
  assert.ok(Number(m[1]) <= 48, `le cliquet est passé de 48 à ${m[1]} : il ne doit que descendre`);
  // Le cliquet compte ce que `lint:tout` lit : un périmètre réduit le
  // desserrerait sans toucher au chiffre.
  const pkg = JSON.parse(lire('package.json'));
  assert.equal(pkg.scripts['lint:tout'], 'eslint src', '`lint:tout` ne lit plus tout src/ : le cliquet compte moins qu’il ne prétend');
});

test('la couverture se montre à chaque PR, sans jamais bloquer', () => {
  const front = travail('frontend');
  // Les tests, eux, bloquent toujours.
  assert.ok(front.includes('\n      - run: npm test\n'), 'la suite de tests ne bloque plus la PR');
  const i = front.indexOf('- run: npm test -- --experimental-test-coverage');
  assert.ok(i > 0, 'la couverture n’est plus affichée');
  const etape = front.slice(i, front.indexOf('\n      - ', i + 1) >= 0 ? front.indexOf('\n      - ', i + 1) : undefined);
  assert.match(etape, /\n {8}continue-on-error: true/, 'la couverture bloque une PR : c’est un chiffre à lire, pas un seuil');
  assert.doesNotMatch(WF, /--test-coverage-(lines|branches|functions)/, 'un seuil de couverture s’est glissé : le chiffre ne compte que les fichiers chargés, il ment sur App.jsx et les vues');
});

test('le travail Python garde son analyse des noms (ruff --select F)', () => {
  const py = travail('python');
  assert.ok(py.includes('- run: ruff check --select F custom_components'), 'les noms non définis ne sont plus cherchés');
  assert.ok(py.indexOf('ruff check') < py.indexOf('python -m pytest'), 'l’analyse doit passer avant les tests');
});

// ─────────────────────────────────────────────────────────────────────────────
// Relecture du lot 15 (04/10) : les épingles ci-dessus ne cherchent que la
// ligne `- run:`. Un `if:` ou un `continue-on-error:` posé sous l'étape, ou sur
// le travail, la neutralisait — YAML valide, tests verts (seize mutations
// rejouées, seize fois vert). Ces clés se lisent au retrait que YAML impose :
// 4 espaces pour un travail, 8 pour une étape ouverte par `- run:`. Une clé
// explicite (`? continue-on-error`) ou de fusion (`<<: *alias`) y échappait :
// ces deux formes sont refusées dans les deux travaux.
// ─────────────────────────────────────────────────────────────────────────────

const CLE_PILOTE = String.raw`["']?(?:if|continue-on-error)["']?[ \t]*:`;
const PILOTE_TRAVAIL = new RegExp(String.raw`\n {4}` + CLE_PILOTE);
const PILOTE_ETAPE = new RegExp(String.raw`\n {8}` + CLE_PILOTE);

/** Le texte de l'étape `- run: <ligne>` d'un travail, jusqu'à l'étape suivante. */
function etapeRun(bloc, ligne) {
  const i = bloc.indexOf('\n      - run: ' + ligne + '\n');
  assert.ok(i >= 0, `l’étape « ${ligne} » a disparu de validate.yml`);
  const j = bloc.indexOf('\n      - ', i + 1);
  return j < 0 ? bloc.slice(i) : bloc.slice(i, j);
}

test('les garde-fous de la CI bloquent pour de bon : ni `if:` ni `continue-on-error`', () => {
  const front = travail('frontend');
  const py = travail('python');
  for (const [nom, bloc] of [['frontend', front], ['python', py]]) {
    assert.doesNotMatch(bloc, PILOTE_TRAVAIL, `le travail ${nom} est devenu conditionnel, ou ne bloque plus la PR`);
    assert.doesNotMatch(bloc, /\n *(?:- )?(?:\?[ \t]|<<[ \t]*:)/, `le travail ${nom} porte une clé explicite ou de fusion : un \`if\` ou un \`continue-on-error\` s’y cache`);
  }
  const lint = front.match(/\n {6}- run: (npm run lint:tout -- --max-warnings \d+)\n/);
  const couv = front.match(/\n {6}- run: (npm test -- --experimental-test-coverage[^\n]*)\n/);
  assert.ok(lint && couv, 'le cliquet ou la couverture a disparu de validate.yml');
  for (const [bloc, ligne] of [[front, lint[1]], [front, 'npm test'], [front, 'npm run audit'], [front, 'npm run build:demo'],
    [py, 'ruff check --select F custom_components'], [py, 'python -m pytest tests/python -q']]) {
    assert.doesNotMatch(etapeRun(bloc, ligne), PILOTE_ETAPE, `l’étape « ${ligne} » est devenue conditionnelle, ou ne bloque plus la PR`);
  }
  // La couverture se montre à CHAQUE PR (aucun `if:`), et son
  // `continue-on-error` voulu reste le seul de ces deux travaux.
  assert.doesNotMatch(etapeRun(front, couv[1]), /\n {8}["']?if["']?[ \t]*:/, 'la couverture ne se montre plus à chaque PR');
  const nb = bloc => (bloc.match(/\n *(?:- )?["']?continue-on-error["']?[ \t]*:/g) || []).length;
  assert.deepEqual([nb(front), nb(py)], [1, 0], 'un `continue-on-error` s’est glissé ailleurs que sur la couverture');
});
