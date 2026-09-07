// ─────────────────────────────────────────────────────────────────────────────
// De la capacité à l'appel de service.
//
// Ces tests fixent surtout ce que le moteur REFUSE. Le code appelait jusqu'ici
// les services à l'aveugle, dans un `try { … } catch (e) {}` : un volet sans
// position recevait `set_cover_position`, une consigne de 34° était rabotée à 30
// par une constante, et un refus de permission ne laissait aucune trace.
//
// Les bornes utilisées ici viennent d'une installation réelle : la clim monte à
// 35°, un `number` va de -180 à 180.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planAction, runAction, availableActions, capaciteDe } from '../src/actions.js';

const et = (state, attributes = {}) => ({ state: String(state), attributes });

/** Les services de l'installation, tels que la découverte les rend. */
const services = {
  homeassistant: { turn_on: {}, turn_off: {}, toggle: {} },
  light: { turn_on: {}, turn_off: {}, toggle: {} },
  cover: {
    open_cover: {}, close_cover: {}, stop_cover: {}, set_cover_position: {},
    set_cover_tilt_position: {}, toggle: {},
  },
  climate: { set_temperature: {}, set_hvac_mode: {}, set_preset_mode: {} },
  vacuum: { start: {}, stop: {}, return_to_base: {}, set_fan_speed: {}, locate: {} },
  media_player: { volume_set: {}, media_play: {}, select_source: {}, turn_on: {}, turn_off: {}, toggle: {} },
  number: { set_value: {} },
};

// ── La traduction ───────────────────────────────────────────────────────────

test('une position de volet devient set_cover_position', () => {
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const p = planAction('cover.x', 'set_position', 40, { states, services });
  assert.equal(p.ok, true);
  assert.equal(p.domain, 'cover');
  assert.equal(p.service, 'set_cover_position');
  assert.deepEqual(p.data, { position: 40 });
  assert.deepEqual(p.target, { entity_id: 'cover.x' });
});

test('la luminosité passe par light.turn_on, pas par un service dédié', () => {
  const states = { 'light.x': et('on', { supported_color_modes: ['brightness'] }) };
  const p = planAction('light.x', 'set_brightness', 60, { states, services });
  assert.equal(p.service, 'turn_on');
  assert.deepEqual(p.data, { brightness_pct: 60 });
});

test('le volume est un rapport, pas un pourcentage', () => {
  const states = { 'media_player.x': et('playing', { supported_features: 4 }) };
  const p = planAction('media_player.x', 'set_volume', 0.35, { states, services });
  assert.equal(p.service, 'volume_set');
  assert.deepEqual(p.data, { volume_level: 0.35 });
});

test('allumer passe par le domaine quand il sait le faire', () => {
  // `light.turn_on` accepte la luminosité, `homeassistant.turn_on` non : le
  // service du domaine vaut mieux dès qu'il existe.
  const states = { 'light.x': et('off') };
  assert.equal(planAction('light.x', 'turn_on', null, { states, services }).domain, 'light');
});

test('… et retombe sur homeassistant quand le domaine n’en a pas', () => {
  // Un domaine chargé peut n'offrir aucun `turn_on` : `homeassistant.turn_on`
  // agit alors sur n'importe quelle entité, et c'est le seul recours.
  const states = { 'humidifier.x': et('on', { supported_features: 1 }) };
  const svc = { ...services, humidifier: { set_mode: {} } };
  const p = planAction('humidifier.x', 'turn_on', null, { states, services: svc });
  assert.equal(p.domain, 'homeassistant');
  assert.equal(p.service, 'turn_on');
});

test('une scène s’active par son propre service', () => {
  const states = { 'scene.x': et('on') };
  const svc = { ...services, scene: { turn_on: {} } };
  assert.equal(planAction('scene.x', 'turn_on', null, { states, services: svc }).domain, 'scene');
});

// ── Les bornes viennent de l'entité ─────────────────────────────────────────

test('une consigne de 34° passe sur une clim qui monte à 35', () => {
  // Le code plafonnait à 30 par une constante. C'est l'entité qui sait.
  const states = { 'climate.x': et('heat', { supported_features: 401, min_temp: 5, max_temp: 35 }) };
  const p = planAction('climate.x', 'set_temperature', 34, { states, services });
  assert.deepEqual(p.data, { temperature: 34 });
  assert.equal(p.clamped, false);
  assert.deepEqual(p.bounds, { min: 5, max: 35, step: null });
});

test('… et 42° est ramené à 35, en le signalant', () => {
  const states = { 'climate.x': et('heat', { supported_features: 401, min_temp: 5, max_temp: 35 }) };
  const p = planAction('climate.x', 'set_temperature', 42, { states, services });
  assert.deepEqual(p.data, { temperature: 35 });
  assert.equal(p.clamped, true, 'l’appelant doit pouvoir le montrer');
});

test('la consigne se cale sur le pas publié', () => {
  const states = {
    'climate.x': et('heat', {
      supported_features: 401, min_temp: 5, max_temp: 35, target_temp_step: 0.5,
    }),
  };
  assert.deepEqual(planAction('climate.x', 'set_temperature', 20.3, { states, services }).data,
    { temperature: 20.5 });
});

test('un number garde ses propres bornes, même négatives', () => {
  // Relevé réel : un `number` de -180 à 180. Les borner à 0–100 le casserait.
  const states = { 'number.x': et('0', { min: -180, max: 180, step: 1 }) };
  assert.deepEqual(planAction('number.x', 'set_value', -175, { states, services }).data, { value: -175 });
  assert.deepEqual(planAction('number.x', 'set_value', 500, { states, services }).data, { value: 180 });
});

test('un pas très fin ne produit pas de flottant sale', () => {
  const states = { 'number.x': et('0', { min: 0, max: 1, step: 0.0001 }) };
  const v = planAction('number.x', 'set_value', 0.30000000000000004, { states, services }).data.value;
  assert.equal(v, 0.3);
});

// ── Ce que le moteur refuse ─────────────────────────────────────────────────

test('un volet sans inclinaison refuse l’inclinaison', () => {
  // Le service `cover.set_cover_tilt_position` EXISTE — il appartient au
  // domaine. C'est l'entité qui ne le supporte pas, et l'appel était perdu.
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const p = planAction('cover.x', 'set_tilt_position', 50, { states, services });
  assert.equal(p.ok, false);
  assert.match(p.reason, /ne déclare pas/);
});

test('une lampe sans couleur refuse la couleur', () => {
  const states = { 'light.x': et('on', { supported_color_modes: ['brightness'] }) };
  assert.equal(planAction('light.x', 'set_color', [255, 0, 0], { states, services }).ok, false);
});

test('un mode absent de la liste est refusé', () => {
  const states = {
    'climate.x': et('heat', { supported_features: 401, hvac_modes: ['off', 'heat'] }),
  };
  assert.equal(planAction('climate.x', 'set_hvac_mode', 'heat', { states, services }).ok, true);
  const p = planAction('climate.x', 'set_hvac_mode', 'cool', { states, services });
  assert.equal(p.ok, false);
  assert.match(p.reason, /option inconnue/);
});

test('une couleur mal formée est refusée plutôt qu’envoyée', () => {
  const states = { 'light.x': et('on', { supported_color_modes: ['xy'] }) };
  assert.equal(planAction('light.x', 'set_color', [255, 0], { states, services }).ok, false);
  assert.equal(planAction('light.x', 'set_color', [255, 0, 300], { states, services }).ok, false);
  assert.equal(planAction('light.x', 'set_color', [255, 0, 40], { states, services }).ok, true);
});

test('un service absent de l’installation est refusé', () => {
  // L'intégration a été retirée, l'entité est restée dans le registre.
  const states = { 'vacuum.x': et('docked', { supported_features: 13116 }) };
  const p = planAction('vacuum.x', 'start', null, { states, services: { light: { turn_on: {} } } });
  assert.equal(p.ok, false);
});

test('une entité inconnue ne fait rien deviner', () => {
  assert.equal(planAction('', 'turn_on', null, {}).ok, false);
  assert.equal(planAction('light.absente', 'turn_on', null, { states: {}, services }).ok, false);
});

test('une entité muette garde un plan valide', () => {
  // Elle est peut-être injoignable à l'instant ; la commande reste correcte, et
  // l'appelant décide s'il la propose ou non.
  const states = { 'cover.x': { state: 'unavailable', attributes: { supported_features: 15 } } };
  const p = planAction('cover.x', 'open', null, { states, services });
  assert.equal(p.ok, true);
  assert.equal(p.available, false);
});

// ── L'envoi rapporte l'échec ────────────────────────────────────────────────

test('un appel qui réussit rend ok et le plan', async () => {
  const envois = [];
  const hass = { callService: (d, s, data, target) => { envois.push([d, s, data, target]); } };
  const states = { 'light.x': et('off') };
  const r = await runAction(hass, 'light.x', 'turn_on', null, { states, services });
  assert.equal(r.ok, true);
  assert.deepEqual(envois, [['light', 'turn_on', {}, { entity_id: 'light.x' }]]);
});

test('un refus de Home Assistant remonte au lieu d’être avalé', async () => {
  // C'est le point de tout le module : le `catch (e) {}` du code actuel laisse
  // l'utilisateur croire qu'il a agi.
  const hass = { callService: () => { throw new Error('non autorisé'); } };
  const states = { 'light.x': et('off') };
  const r = await runAction(hass, 'light.x', 'turn_on', null, { states, services });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'non autorisé');
  assert.equal(r.plan.service, 'turn_on', 'le plan reste lisible pour le diagnostic');
});

test('sans Home Assistant, on ne prétend pas avoir agi', async () => {
  const states = { 'light.x': et('off') };
  const r = await runAction(null, 'light.x', 'turn_on', null, { states, services });
  assert.equal(r.ok, false);
});

test('une capacité refusée n’envoie rien', async () => {
  let appele = false;
  const hass = { callService: () => { appele = true; } };
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const r = await runAction(hass, 'cover.x', 'set_tilt_position', 50, { states, services });
  assert.equal(r.ok, false);
  assert.equal(appele, false);
});

// ── Ce qu'une carte peut proposer ───────────────────────────────────────────

test('les actions réellement possibles, avec leurs bornes', () => {
  const states = {
    'climate.x': et('heat', {
      supported_features: 401, min_temp: 5, max_temp: 35,
      hvac_modes: ['off', 'heat'], preset_modes: ['eco'],
    }),
  };
  const a = availableActions('climate.x', { states, services });
  assert.equal(a.has('set_temperature'), true);
  assert.deepEqual(a.get('set_temperature').bounds, { min: 5, max: 35, step: null });
  // Sans valeur plausible, une commande à option ne peut pas être planifiée :
  // c'est à la vue de proposer la liste, pas au moteur de choisir.
  assert.equal(a.has('set_hvac_mode'), false);
  // Le domaine ne publie pas set_fan_mode, et l'entité ne le déclare pas.
  assert.equal(a.has('set_fan_mode'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Un `catch` qui ne pouvait rien attraper.
//
// Trente-six endroits écrivaient `try { hass.callService(…) } catch {}`.
// `callService` rend une PROMESSE : un refus du serveur — permission manquante,
// entité disparue, service inexistant — la rejette PLUS TARD, hors de portée
// d'un bloc synchrone. Ce `catch` n'aurait attrapé qu'une erreur levée
// sur-le-champ, ce que la garde `if (hass && hass.callService)` juste devant
// rend déjà improbable.
//
// Il ne protégeait donc rien, et faisait croire le contraire.
//
// Ce qu'il ne cachait PAS, contrairement à ce qu'on pourrait croire : l'échec
// est visible depuis toujours. Le rejet remonte jusqu'à l'écoute globale
// d'`App.jsx`, qui affiche « Commande non exécutée — Home Assistant a refusé ou
// n'a pas répondu ». Vérifié dans le navigateur en provoquant un rejet.
//
// C'est même pour cela que `commander()` RELANCE le rejet après l'avoir lu :
// `runPlan` l'attrape pour en donner la raison, et sans cette relance le seul
// canal d'erreur visible du dashboard ne verrait jamais passer une commande
// refusée.
// ─────────────────────────────────────────────────────────────────────────────

const RACINE_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sansCommentaires(s) {
  const sansBloc = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return sansBloc.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
}

function sources(dossier = RACINE_SRC) {
  const out = [];
  for (const f of readdirSync(dossier)) {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) { out.push(...sources(p)); continue; }
    if (/\.(js|jsx)$/.test(f)) out.push([f, p]);
  }
  return out;
}

test('aucun appel de service n’est enveloppé d’un catch qui ne peut rien attraper', () => {
  const menteurs = [];
  for (const [nom, p] of sources()) {
    // Les commentaires sont retirés : ceux qui décrivent ce motif se
    // compteraient eux-mêmes.
    const src = sansCommentaires(readFileSync(p, 'utf8'));
    for (const m of src.matchAll(/try\s*\{([\s\S]{0,400}?)\}\s*catch\s*\{\s*\}/g)) {
      if (!/call(Service|WS|Api)/.test(m[1])) continue;
      /* `await` change tout : il ramène le rejet DANS le bloc, et le `catch`
       * l'attrape pour de bon. Deux appels s'écrivent ainsi — la résolution
       * d'un média, la lecture de la config — et ils ont raison.
       *
       * La première version de ce test les signalait aussi, faute de faire la
       * différence. Elle demandait de retirer un `try/catch` qui, lui,
       * fonctionne. */
      if (/\bawait\b/.test(m[1])) continue;
      menteurs.push(`${nom} → ${m[1].trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(menteurs, [],
    'un appel de service est de nouveau enveloppé d’un try/catch : il ne peut pas attraper le rejet de la promesse, et laisse croire que si');
});

test('le rejet d’une commande atteint le seul canal visible', () => {
  const app = readFileSync(join(RACINE_SRC, 'App.jsx'), 'utf8');
  // L'écoute globale est le seul endroit où un refus devient visible. Sans
  // elle, tous les appels directs échouent en silence.
  assert.match(app, /window\.addEventListener\('unhandledrejection', h\)/,
    'l’écoute globale des rejets a disparu : une commande refusée redevient invisible');
  assert.match(app, /setToast\('Commande non exécutée/,
    'le toast d’échec a disparu');
  /* Et `commander` doit relancer : `runPlan` attrape le rejet pour en donner la
   * raison, ce qui l'empêcherait d'atteindre l'écoute.
   *
   * Il vit désormais dans `actions.js` : il n'a jamais rendu de vue, et les
   * vues, elles, ne pouvaient pas l'appeler — deux commandes des Paramètres
   * gardaient la route directe pour cette seule raison. */
  const moteur = readFileSync(join(RACINE_SRC, 'actions.js'), 'utf8');
  const i = moteur.indexOf('export function commander(');
  const corps = moteur.slice(i, moteur.indexOf('\n}', i));
  assert.match(corps, /Promise\.reject\(Object\.assign\(new Error\(motif\), \{ code: 'service_error' \}\)\)/,
    'commander avale de nouveau le rejet : les commandes qui passent par lui échoueront sans un mot');
});

// ─────────────────────────────────────────────────────────────────────────────
// D'un service à sa capacité, pour que les appels par leur nom soient vérifiés.
//
// Le dashboard gardait des aides locales prenant un domaine et un service —
// `call('light', 'turn_on', { entity_id, brightness_pct })`. Les réécrire une
// par une, c'étaient cinquante retouches à la main dans douze mille lignes.
// `capaciteDe` fait le chemin inverse à partir de la même table, une fois.
// ─────────────────────────────────────────────────────────────────────────────

test('le champ tranche entre deux capacités du même service', () => {
  // `light.turn_on` en sert quatre : sans le champ, on ne saurait pas laquelle.
  assert.deepEqual(capaciteDe('light', 'turn_on', { brightness_pct: 40 }),
    { capacite: 'set_brightness', champ: 'brightness_pct', accepte: [] });
  assert.deepEqual(capaciteDe('light', 'turn_on', { rgb_color: [1, 2, 3] }),
    { capacite: 'set_color', champ: 'rgb_color', accepte: [] });
  assert.deepEqual(capaciteDe('light', 'turn_on', {}),
    { capacite: 'turn_on', champ: null, accepte: [] });
});

test('les services sans champ se retrouvent aussi', () => {
  assert.deepEqual(capaciteDe('cover', 'close_cover', {}), { capacite: 'close', champ: null, accepte: [] });
  assert.deepEqual(capaciteDe('cover', 'set_cover_position', { position: 30 }),
    { capacite: 'set_position', champ: 'position', accepte: [] });
  assert.deepEqual(capaciteDe('select', 'select_option', { option: 'nuit' }),
    { capacite: 'select_option', champ: 'option', accepte: [] });
});

test('allumer et éteindre valent pour tout domaine', () => {
  // `turn_on` / `turn_off` / `toggle` ne sont pas dans la table : `planAction`
  // les traite à part, pour tout domaine allumable.
  assert.deepEqual(capaciteDe('switch', 'toggle', {}), { capacite: 'toggle', champ: null, accepte: [] });
  assert.deepEqual(capaciteDe('script', 'turn_on', {}), { capacite: 'turn_on', champ: null, accepte: [] });
});

test('ce qui n’a pas de capacité le dit', () => {
  // Rendre une capacité fausse ferait disparaître la commande : mieux vaut
  // rendre null et laisser l'appelant garder sa route directe.
  assert.equal(capaciteDe('media_player', 'play_media', { media_content_id: 'x' }), null);
  assert.equal(capaciteDe('homeassistant', 'update_entity', {}), null);
});

test('désarmer est une capacité comme les autres', () => {
  // Elle n'a pas de bit dans `supported_features` — celui-ci dit quels MODES
  // d'armement un panneau accepte, pas qu'on puisse en sortir. Le moteur ne
  // savait donc pas planifier la seule commande qu'aucune alarme ne refuse.
  assert.deepEqual(capaciteDe('alarm_control_panel', 'alarm_disarm', {}),
    { capacite: 'disarm', champ: null, accepte: ['code'] });
  assert.deepEqual(capaciteDe('alarm_control_panel', 'alarm_arm_night', {}),
    { capacite: 'arm_night', champ: null, accepte: ['code'] });
});

test('une carte de services vide vaut « je ne sais pas »', () => {
  const moteur = readFileSync(join(RACINE_SRC, 'actions.js'), 'utf8');
  /* `planAction` refuse un service absent de la carte fournie. Mais `{}` ne dit
   * pas « aucun service n'existe » : il dit qu'on ne sait pas. La démo annonçait
   * `services: {}`, et chaque commande passée par `commander` y était refusée —
   * masquée par l'affichage optimiste, qui basculait puis revenait. */
  assert.match(moteur, /services: \(svc && Object\.keys\(svc\)\.length\) \? svc : null/,
    'une carte de services vide redevient une interdiction : tout le chemin vérifié serait inerte');
});

test('la démo lit l’entité dans la cible autant que dans les données', () => {
  const demo = readFileSync(join(RACINE_SRC, 'demo.js'), 'utf8');
  // `planAction` met l'entité dans `target`, comme Home Assistant le recommande.
  // La démo n'en prenait que trois arguments : la cible tombait, et la commande
  // ne touchait rien.
  assert.match(demo, /const callService = \(domaine, service, data, target\) =>/,
    'la démo ignore de nouveau la cible : les commandes vérifiées n’y feront plus rien');
  assert.match(demo, /\(data && data\.entity_id\) \|\| \(target && target\.entity_id\)/,
    'la démo ne lit plus l’entité dans la cible');
});

test('un plan refusé ne meurt plus en silence', () => {
  const moteur = readFileSync(join(RACINE_SRC, 'actions.js'), 'utf8');
  const i = moteur.indexOf('export function commander(');
  const corps = moteur.slice(i, moteur.indexOf('\n}', i));
  /* `planAction` dit POURQUOI il refuse. Cette raison mourait ici : on appuyait,
   * rien ne se passait, rien ne l'expliquait.
   *
   * On cherche le message du REFUS, pas un `Promise.reject` quelconque : une
   * première version acceptait `if (!p.ok) { … } … Promise.reject` avec un
   * joker gourmand, et attrapait la relance qui suit l'envoi. Le test passait
   * alors qu'on avait rendu le refus muet. */
  assert.match(corps, /new Error\(p\.reason \|\| 'commande impossible'\)/,
    'un plan refusé redevient muet : la commande disparaît sans un mot');
});

// ─────────────────────────────────────────────────────────────────────────────
// Le code d'alarme, et les commandes qui visent un groupe.
//
// Six appels gardaient la route directe pour deux raisons précises. Trois
// portaient un code : `planAction` ne bâtissait que le champ de la capacité, le
// code tombait, et un panneau protégé aurait refusé la commande. Trois visaient
// plusieurs entités à la fois, quand le moteur n'en prenait qu'une — donc aucune
// vérification, et le lot partait entier même si la moitié ne savait pas obéir.
// ─────────────────────────────────────────────────────────────────────────────

const svcAlarme = {
  alarm_control_panel: {
    alarm_arm_home: {}, alarm_arm_away: {}, alarm_arm_night: {},
    alarm_arm_vacation: {}, alarm_disarm: {}, alarm_trigger: {},
  },
};

test('désarmer se planifie, sans bit dans supported_features', () => {
  // Le masque dit quels MODES d'armement le panneau accepte. En sortir se fait
  // toujours : sans capacité `disarm`, la seule commande qu'aucune alarme ne
  // refuse était la seule que le moteur ne savait pas planifier.
  const states = { 'alarm_control_panel.x': et('armed_home', { supported_features: 3 }) };
  const p = planAction('alarm_control_panel.x', 'disarm', null, { states, services: svcAlarme });
  assert.equal(p.ok, true);
  assert.equal(p.service, 'alarm_disarm');
});

test('le code accompagne la commande', () => {
  const states = { 'alarm_control_panel.x': et('disarmed', { supported_features: 3 }) };
  const ctx = { states, services: svcAlarme };
  assert.deepEqual(planAction('alarm_control_panel.x', 'arm_home', null, ctx, { code: '1234' }).data,
    { code: '1234' });
  // Sans code, rien n'est ajouté : un panneau non protégé n'en veut pas.
  assert.deepEqual(planAction('alarm_control_panel.x', 'arm_home', null, ctx).data, {});
  assert.deepEqual(planAction('alarm_control_panel.x', 'arm_home', null, ctx, { code: '' }).data, {});
});

test('on ne fait pas passer n’importe quoi par cette porte', () => {
  // `accepte` nomme les champs légitimes, service par service. Sans cette
  // liste, `options` deviendrait un tunnel vers la charge utile et la
  // vérification ne voudrait plus rien dire.
  const states = { 'alarm_control_panel.x': et('disarmed', { supported_features: 3 }) };
  const p = planAction('alarm_control_panel.x', 'arm_home', null,
    { states, services: svcAlarme }, { code: '1234', entity_id: 'light.pirate', bidon: 1 });
  assert.deepEqual(p.data, { code: '1234' });
});

test('un groupe ne garde que les entités qui savent obéir', () => {
  const states = {
    'cover.a': et('open', { supported_features: 15 }),
    'cover.b': et('open', { supported_features: 15 }),
    'cover.c': et('open', { supported_features: 3 }),   // ni position ni inclinaison
  };
  const p = planAction(['cover.a', 'cover.b', 'cover.c'], 'set_position', 40, { states, services });
  assert.equal(p.ok, true);
  assert.deepEqual(p.target, { entity_id: ['cover.a', 'cover.b'] });
  // Et il dit qui reste dehors, plutôt que de le taire.
  assert.deepEqual(p.ecartees, ['cover.c']);
});

test('une valeur ramenée différemment sépare le lot', () => {
  // Deux thermostats, l'un qui accepte 34°, l'autre plafonné à 22 : les envoyer
  // ensemble ferait recevoir au second autre chose que ce qu'on a demandé.
  const states = {
    'climate.a': et('heat', { supported_features: 401, min_temp: 5, max_temp: 35 }),
    'climate.b': et('heat', { supported_features: 401, min_temp: 5, max_temp: 22 }),
  };
  const p = planAction(['climate.a', 'climate.b'], 'set_temperature', 34, { states, services });
  assert.deepEqual(p.data, { temperature: 34 });
  assert.deepEqual(p.target, { entity_id: ['climate.a'] });
  assert.deepEqual(p.ecartees, ['climate.b']);
});

test('un groupe dont personne ne sait faire est refusé', () => {
  const states = { 'cover.c': et('open', { supported_features: 3 }) };
  const p = planAction(['cover.c'], 'set_position', 40, { states, services });
  assert.equal(p.ok, false);
  assert.deepEqual(p.ecartees, ['cover.c']);
});

test('un groupe unanime ne signale personne', () => {
  const states = {
    'light.a': et('on', { supported_color_modes: ['brightness'] }),
    'light.b': et('off', { supported_color_modes: ['brightness'] }),
  };
  const p = planAction(['light.a', 'light.b'], 'turn_off', null, { states, services });
  assert.equal(p.ok, true);
  assert.deepEqual(p.target, { entity_id: ['light.a', 'light.b'] });
  assert.equal(p.ecartees, null, 'personne d’écarté ne doit pas se lire comme une liste vide');
});

// ─────────────────────────────────────────────────────────────────────────────
// Le moteur ne doit rien devoir à la vue.
//
// `actionCtx`, `peut`, `commander` et `commanderService` vivaient dans
// `App.jsx`. Elles n'y avaient rien à faire — aucune ne rend quoi que ce soit —
// et surtout, les vues ne pouvaient pas les appeler : `parametres.jsx` gardait
// deux commandes sur la route directe pour cette seule raison, sans vérification
// ni bornes.
//
// Les ramener dans `App.jsx` par un import refermerait la boucle et rendrait le
// déplacement inutile.
// ─────────────────────────────────────────────────────────────────────────────

test('le moteur d’actions n’importe rien de la vue', () => {
  const moteur = readFileSync(join(RACINE_SRC, 'actions.js'), 'utf8');
  const cibles = [...moteur.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  const interdites = cibles.filter(c => /App\.jsx|ui\.jsx|views\//.test(c));
  assert.deepEqual(interdites, [],
    'le moteur importe la vue : le cycle est refermé, et les vues ne pourront plus l’appeler');
});

test('les quatre fonctions déplacées sont exportées', () => {
  const moteur = readFileSync(join(RACINE_SRC, 'actions.js'), 'utf8');
  for (const f of ['actionCtx', 'peut', 'commander', 'commanderService']) {
    assert.ok(moteur.includes('export function ' + f + '('),
      `${f} n’est plus exporté : la vue qui l’appelle ne le trouvera pas`);
  }
  // Et elles ne doivent pas être restées en double dans App.jsx.
  const app = readFileSync(join(RACINE_SRC, 'App.jsx'), 'utf8');
  assert.ok(!/\nfunction commander\(/.test(app),
    'commander existe de nouveau dans App.jsx : deux versions divergeront');
});
