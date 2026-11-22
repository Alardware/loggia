// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11 — lot 5, lettre E (ADR 0385).
//
//  A3 — Tempo en clair : « Aujourd'hui bleu · demain blanc · encore 14 rouges »
//       sur la carte du tarif. La couleur du jour est le rôle `couleur` que le
//       serveur pose déjà ; les jours restants ne se disent que si
//       l'intégration les publie (clé de traduction, même intégration).
//  A7 — Plusieurs bornes : une liste, une carte et une popup par borne,
//       `enBorne()` reste la première ; « Dernière charge : 18 kWh, hier soir »
//       lu dans l'historique du compteur d'énergie.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// MODIFIÉ (21/11, ADR 0385) : le démarrage dépassait son budget ; la ligne de la carte (`ligneTempo`) vit à part, dans `tempoligne.js`.
import { couleurTempo, haidsTempo } from '../src/tempo.js';
import { joursRestants, ligneTempo } from '../src/tempoligne.js';
import { trouverBorne, trouverBornes, cleBorne, borneDeCle, statutsEnPanne, statutEnPanne } from '../src/borne.js';
import { derniereCharge, quandCharge } from '../src/bornevue.js';
import { pointsAttention } from '../src/attention.js';
import { resolveEnergy } from '../src/resolve.js';
import { area, device, entity, state, states, ctxOf, indexOf } from './fixtures.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// ════════════════════════ A3 — TEMPO EN CLAIR ════════════════════════

const ent = (id, o = {}) => ({ id, cle: '', desactive: false, tarif: null, plateforme: 'rtetempo', ...o });
/** `haidsTempo` lit la plateforme dans l'index : ici, dans le champ de l'entrée du test. */
const haids = (liste) => haidsTempo(liste, (id) => (liste.find(e => e.id === id) || {}).plateforme || null);

test('A3 — la couleur se lit mot par mot, accents et casse ignorés ; deux couleurs, aucune', () => {
  assert.equal(couleurTempo('Rouge'), 'rouge');
  assert.equal(couleurTempo('TEMPO_BLANC'), 'blanc');
  assert.equal(couleurTempo('blue'), 'bleu');
  assert.equal(couleurTempo('White'), 'blanc');
  assert.equal(couleurTempo('unknown'), null);
  assert.equal(couleurTempo(null), null);
  assert.equal(couleurTempo('bleu ou rouge'), null, 'deux couleurs : on ne tranche pas');
});

test('A3 — la couleur du jour est le rôle `couleur` du serveur, un seul candidat', () => {
  const jour = ent('sensor.rte_tempo_couleur_actuelle', { tarif: 'couleur' });
  const demain = ent('sensor.rte_tempo_prochaine_couleur', { tarif: 'couleur_demain' });
  assert.equal(haids([jour, demain]).tempoJour, 'sensor.rte_tempo_couleur_actuelle');
  assert.equal(haids([demain]).tempoJour, undefined, 'sans rôle `couleur`, pas de couleur du jour');
  assert.equal(haids([jour, { ...jour, id: 'sensor.autre' }]).tempoJour, undefined, 'deux candidats : on se tait');
  assert.equal(haids([{ ...jour, desactive: true }]).tempoJour, undefined);
  assert.deepEqual(haids([]), {});
  assert.deepEqual(haidsTempo(null), {});
});

test('A3 — les jours restants : seulement ce que l’intégration publie, par clé de traduction, dans la même intégration', () => {
  const jour = ent('sensor.couleur_jour', { tarif: 'couleur' });
  const bons = [ent('sensor.r', { cle: 'days_red' }), ent('sensor.b', { cle: 'jours_blancs' }), ent('sensor.bl', { cle: 'days_blue' })];
  const h = haids([jour, ...bons]);
  assert.equal(h.tempoRestantsRouge, 'sensor.r');
  assert.equal(h.tempoRestantsBlanc, 'sensor.b');
  assert.equal(h.tempoRestantsBleu, 'sensor.bl');
  // Sans clé : rien — on n'invente pas un nombre de jours (le cas de `rtetempo` si sa clé manque).
  assert.equal(haids([jour, ent('sensor.x', { cle: '' })]).tempoRestantsRouge, undefined);
  // Un prix « rouge » n'est pas un compte de jours : il lui faut un mot de jours.
  assert.equal(haids([jour, ent('sensor.prix', { cle: 'price_red' })]).tempoRestantsRouge, undefined);
  // Une autre intégration n'est pas la nôtre.
  assert.equal(haids([jour, ent('sensor.r2', { cle: 'days_red', plateforme: 'autre' })]).tempoRestantsRouge, undefined);
  // Deux candidats pour la même couleur : on se tait.
  assert.equal(haids([jour, ...bons, ent('sensor.r3', { cle: 'days_red' })]).tempoRestantsRouge, undefined);
  // Sans couleur du contrat, on ne sait pas de quelle intégration il s'agit.
  assert.deepEqual(haids(bons), {});
});

test('A3 — un nombre de jours lisible : un entier de 0 à 366', () => {
  assert.equal(joursRestants('14'), 14);
  assert.equal(joursRestants(' 22.0 '), 22);
  assert.equal(joursRestants('0'), 0);
  assert.equal(joursRestants('unknown'), null);
  assert.equal(joursRestants('-3'), null);
  assert.equal(joursRestants('1000'), null);
  assert.equal(joursRestants('3,5'), null);
});

test('A3 — « Aujourd’hui bleu · demain blanc · encore 14 rouges », chaque morceau se tait s’il ne se lit pas', () => {
  const t = (o) => (ligneTempo(o) || []).map(p => p.texte).join(' · ');
  assert.equal(t({ aujourdhui: 'Bleu', demain: 'Blanc', rouges: '14' }), 'Aujourd’hui bleu · demain blanc · encore 14 rouges');
  assert.equal(t({ aujourdhui: 'Bleu', demain: 'unknown', rouges: '14' }), 'Aujourd’hui bleu · encore 14 rouges');
  assert.equal(t({ aujourdhui: 'Bleu', demain: 'Blanc' }), 'Aujourd’hui bleu · demain blanc', 'sans compte publié, rien d’inventé');
  assert.equal(t({ aujourdhui: 'Bleu', demain: 'Blanc', rouges: 'unavailable' }), 'Aujourd’hui bleu · demain blanc');
  assert.equal(t({ aujourdhui: 'Rouge', demain: 'Blanc', rouges: '1' }), 'Aujourd’hui rouge · demain blanc · encore 1 rouge');
  assert.equal(ligneTempo({}), null);
  assert.equal(ligneTempo({ rouges: '14' }), null, 'des rouges seuls n’expliquent aucun prix');
  const rouge = ligneTempo({ aujourdhui: 'Bleu', demain: 'Rouge' });
  assert.deepEqual(rouge.map(p => p.rouge), [false, true], 'un jour rouge se met en alerte');
});

test('A3 — la résolution porte la couleur du jour et les restants, avec ou sans tableau Énergie', () => {
  const fx = {
    areas: [], devices: [],
    entities: [
      { ...entity('sensor.tempo_jour', { platform: 'rtetempo' }), tarif: 'couleur' },
      { ...entity('sensor.tempo_demain', { platform: 'rtetempo' }), tarif: 'couleur_demain' },
      entity('sensor.tempo_rouges', { platform: 'rtetempo', key: 'days_red' }),
    ],
    floors: [],
    states: states(
      state('sensor.tempo_jour', 'Bleu', { device_class: 'enum', options: ['Bleu', 'Blanc', 'Rouge'] }),
      state('sensor.tempo_demain', 'Blanc', { device_class: 'enum', options: ['Bleu', 'Blanc', 'Rouge'] }),
      state('sensor.tempo_rouges', '14', {}),
    ),
    energyPrefs: null,
  };
  const sans = resolveEnergy(ctxOf(fx)).haids;
  assert.equal(sans.tempoJour, 'sensor.tempo_jour');
  assert.equal(sans.tempoDemain, 'sensor.tempo_demain');
  assert.equal(sans.tempoRestantsRouge, 'sensor.tempo_rouges');
  const avec = resolveEnergy({ ...ctxOf(fx), energyPrefs: { energy_sources: [] } }).haids;
  assert.equal(avec.tempoJour, 'sensor.tempo_jour');
  assert.equal(avec.tempoRestantsRouge, 'sensor.tempo_rouges');
});

test('A3 — la carte du tarif écrit la ligne, sans couleur en dur ni serveur', () => {
  const src = lire('src', 'views', 'energiehisto.jsx');
  // ASSERTION MODIFIÉE (21/11, ADR 0385) : la ligne vit dans `tempoligne.js`, chargé avec la vue Énergie.
  assert.match(src, /import \{ ligneTempo \} from '\.\.\/tempoligne\.js'/);
  assert.match(src, /ligneTempo\(\{ aujourdhui: etatTempo\(EN\.tempoJour\), demain: etatTempo\(EN\.tempoDemain\), rouges: etatTempo\(EN\.tempoRestantsRouge\) \}\)/);
  assert.match(src, /data-tempo=""/);
  // Tempo seul ne garde pas la carte : la ligne qui la retire sans prix ni créneau ni coût reste telle quelle.
  assert.ok(src.includes('if (prix.valeur == null && prixVente == null && !barre.length && !lignes.length) return null;'));
  assert.match(src, /p\.rouge \? \{ color: 'var\(--o-bad\)' \}/, 'le rouge de la maison, pas une couleur en dur');
  // « Demain : jour rouge » du rail ne change pas.
  assert.match(lire('src', 'attention.js'), /ajouter\('tempo:' \+ td, 'info', tr\('Demain : jour rouge'\)/);
  // Le module de Tempo n'ajoute aucun import lourd au démarrage : l'i18n seulement.
  // ASSERTION MODIFIÉE (21/11, ADR 0385) : `tempo.js` (le démarrage) n'importe plus rien ; les mots de la ligne sont dans `tempoligne.js`.
  assert.deepEqual([...lire('src', 'tempo.js').matchAll(/^import .* from '(.+)';/gm)].map(m => m[1]), []);
  assert.deepEqual([...lire('src', 'tempoligne.js').matchAll(/^import .* from '(.+)';/gm)].map(m => m[1]), ['./i18n.js', './tempo.js']);
});

// ════════════════════════ A7 — PLUSIEURS BORNES ════════════════════════

/** Une maison à N bornes, chacune confirmée par le tableau Énergie ; la première charge. */
const garage = (n = 2) => {
  const fx = { areas: [area('garage', 'Garage')], devices: [], entities: [], states: {}, energyPrefs: { energy_sources: [], device_consumption: [] } };
  for (let i = 1; i <= n; i++) {
    const d = 'd_borne' + i, p = 'b' + i;
    fx.devices.push(device(d, 'Borne ' + i, 'garage'));
    fx.entities.push(entity('sensor.' + p + '_puissance', { device: d }), entity('sensor.' + p + '_energie', { device: d }),
      entity('number.' + p + '_courant', { device: d, category: 'config' }), entity('binary_sensor.' + p + '_prise', { device: d }),
      entity('sensor.' + p + '_statut', { device: d }));
    Object.assign(fx.states, states(
      state('sensor.' + p + '_puissance', i === 1 ? '7200' : '0', { device_class: 'power', unit_of_measurement: 'W' }),
      state('sensor.' + p + '_energie', '100', { device_class: 'energy', unit_of_measurement: 'kWh' }),
      state('number.' + p + '_courant', '16', { device_class: 'current', unit_of_measurement: 'A', min: 6, max: 32, step: 1 }),
      state('binary_sensor.' + p + '_prise', 'on', { device_class: 'plug' }),
      state('sensor.' + p + '_statut', i === 1 ? 'charging' : 'connected', { device_class: 'enum', options: ['disconnected', 'connected', 'charging'] })));
    fx.energyPrefs.device_consumption.push({ stat_consumption: 'sensor.' + p + '_energie' });
  }
  return fx;
};
const args = (fx) => ({ index: indexOf(fx), states: fx.states, energyPrefs: fx.energyPrefs });

test('A7 — deux bornes : une liste rangée par appareil, la première reste « la borne »', () => {
  const fx = garage(2);
  const l = trouverBornes(args(fx));
  assert.deepEqual(l.map(b => b.appareil), ['d_borne1', 'd_borne2']);
  assert.equal(trouverBorne(args(fx)).appareil, 'd_borne1');
  // Un ordre qui ne dépend pas de celui du registre.
  const inverse = garage(2);
  inverse.devices.reverse(); inverse.entities.reverse();
  assert.deepEqual(trouverBornes(args(inverse)).map(b => b.appareil), ['d_borne1', 'd_borne2']);
  assert.deepEqual(trouverBornes(args(garage(1))).map(b => b.appareil), ['d_borne1']);
  assert.deepEqual(trouverBornes(args(garage(0))), []);
  assert.equal(trouverBorne(args(garage(0))), null);
  // Une borne que le tableau Énergie ne confirme pas n'en est pas une.
  const non = garage(2);
  non.energyPrefs.device_consumption.pop();
  assert.deepEqual(trouverBornes(args(non)).map(b => b.appareil), ['d_borne1']);
});

test('A7 — la clé de chaque carte : `obj:borne` pour la première, l’appareil pour les suivantes', () => {
  const l = trouverBornes(args(garage(3)));
  assert.equal(cleBorne(l, l[0]), 'obj:borne');
  assert.equal(cleBorne(l, l[1]), 'obj:borne:d_borne2');
  assert.equal(cleBorne(l, l[2]), 'obj:borne:d_borne3');
  assert.equal(borneDeCle(l, 'obj:borne'), l[0]);
  assert.equal(borneDeCle(l, 'obj:borne:d_borne3'), l[2]);
  assert.equal(borneDeCle(l, 'obj:borne:inconnue'), null);
  assert.equal(borneDeCle([], 'obj:borne'), null);
  assert.equal(cleBorne(l, null), 'obj:borne');
});

test('A7 — la puissance du véhicule : la clé seule pour une borne, les parts pour plusieurs', () => {
  const une = resolveEnergy(ctxOf(garage(1)));
  assert.equal(une.haids.evNow, 'sensor.b1_puissance');
  assert.equal(une.haids.evNowParts, null);
  assert.equal(une.borne.appareil, 'd_borne1');
  assert.equal(une.bornes.length, 1);
  const deux = resolveEnergy(ctxOf(garage(2)));
  assert.equal(deux.haids.evNow, null, 'jamais l’une élue pour le tout');
  assert.deepEqual(deux.haids.evNowParts, ['sensor.b1_puissance', 'sensor.b2_puissance']);
  assert.equal(deux.borne.appareil, 'd_borne1', '`enBorne()` reste la première');
  assert.deepEqual(deux.bornes.map(b => b.appareil), ['d_borne1', 'd_borne2']);
  assert.equal(resolveEnergy(ctxOf(garage(0))).borne, null);
  assert.deepEqual(resolveEnergy(ctxOf(garage(0))).bornes, []);
});

test('A7 — la vue Énergie somme les parts, la fiche d’énergie garde la main', () => {
  const en = lire('src', 'views', 'energie.jsx');
  assert.match(en, /const evIds = idsDe\(EN, 'evNow'\);/);
  assert.match(en, /const evSomme = sommeLue\(evIds, /);
  assert.match(en, /const evBranche = evIds\.length > 0;/);
  // La fiche qui nomme `evNow` vide les parts découvertes : elle n'appartient qu'à elle.
  assert.match(lire('src', 'state.js'), /\['evNow', 'evNowParts'\],/);
});

test('A7 — « Borne en défaut » vaut pour chaque borne, une fois chacune', () => {
  const fx = garage(2);
  const l = trouverBornes(args(fx));
  const S = { ...fx.states, 'sensor.b1_statut': { state: 'faulted', attributes: {} }, 'sensor.b2_statut': { state: 'Error', attributes: {} } };
  assert.deepEqual(statutsEnPanne(l, S), ['sensor.b1_statut', 'sensor.b2_statut']);
  assert.deepEqual(statutsEnPanne(l, fx.states), []);
  assert.deepEqual(statutsEnPanne(null, S), []);
  const ctx = { S, borneEnPanne: statutEnPanne(l[0], S), bornesEnPanne: statutsEnPanne(l, S), nomAppareil: (id) => (id.indexOf('b2') >= 0 ? 'Borne 2' : 'Borne 1') };
  const pts = pointsAttention(ctx).filter(p => p.cle.indexOf('borne:') === 0);
  assert.equal(pts.length, 2, 'la première n’est pas dite deux fois');
  assert.deepEqual(pts.map(p => p.sous).sort(), ['Borne 1', 'Borne 2']);
  assert.ok(pts.every(p => p.titre === 'Borne en défaut' && p.niveau === 'alerte' && p.vue === 'objets'));
  // Une seule en panne : une seule ligne.
  const une = { ...S, 'sensor.b2_statut': { state: 'connected', attributes: {} } };
  assert.equal(pointsAttention({ S: une, borneEnPanne: statutEnPanne(l[0], une), bornesEnPanne: statutsEnPanne(l, une) }).filter(p => p.cle.indexOf('borne:') === 0).length, 1);
  for (const f of [['src', 'accueil', 'dashboard.jsx'], ['src', 'ecranveille.jsx']]) {
    const t = lire(...f);
    assert.match(t, /borneEnPanne: statutEnPanne\(enBorne\(\), /, 'la ligne épinglée reste');
    assert.match(t, /bornesEnPanne: statutsEnPanne\(enBornes\(\), /, f.join('/'));
  }
});

test('A7 — Objets : une carte et une popup par borne, sans toucher à la première', () => {
  const o = lire('src', 'vues', 'objets.jsx');
  assert.match(o, /bornes\.forEach\(borne => \{[^]*entree\(cleBorne\(bornes, borne\)/);
  assert.match(o, /<CarteBorne borne=\{suivante\}/);
  assert.match(o, /<FicheBorne key=\{x\.appareil\} borne=\{x\}/);
  // La première passe toujours par la fabrique commune (les lignes que `composeur.test` épingle).
  // ASSERTION MODIFIÉE (21/11, ADR 0386) : la voiture, la litière et la fontaine (`app`) se nomment aussi par leur clé.
  assert.match(o, /const cle = \(o\.type === 'feeder' \|\| o\.type === 'plant' \|\| o\.type === 'groupe' \|\| o\.type === 'borne' \|\| o\.type === 'app'\) \? o\.cle : o\.id;/);
  const eb = lire('src', 'cartes', 'eauborne.jsx');
  assert.match(eb, /export function CarteBorne\(\{ hass, borne = null, /);
  assert.match(eb, /export function FicheBorne\(\{ hass, borne = null, /);
  assert.match(eb, /const b = borne \|\| enBorne\(\);/);
  // L'API d'avant : `enBorne()` la première, `enBornes()` toutes.
  const st = lire('src', 'state.js');
  assert.match(st, /export function enBorne\(\)/);
  assert.match(st, /export function enBornes\(\)/);
});

// ── La dernière charge ──────────────────────────────────────────────────────

const T = (jour, h, m = 0) => new Date(2026, 10, jour, h, m).toISOString();
const rel = (jour, h, m, v) => ({ state: String(v), last_changed: T(jour, h, m) });
const KWH = { state: '120', attributes: { unit_of_measurement: 'kWh' } };

test('A7 — la dernière charge : le dernier relevé moins celui d’avant la montée', () => {
  const h = [rel(18, 8, 0, 100), rel(19, 22, 0, 100), rel(19, 22, 10, 102), rel(19, 22, 40, 108), rel(20, 1, 0, 114), rel(20, 1, 20, 118)];
  // Un écart de plus de 90 minutes sépare 22:40 de 01:00 : deux charges. La dernière part du relevé d'AVANT sa montée (108 à 22:40).
  const d = derniereCharge(h, KWH);
  assert.equal(d.kwh, 118 - 108);
  assert.equal(d.fin, Date.parse(T(20, 1, 20)));
  const continue_ = [rel(19, 22, 0, 100), rel(19, 22, 30, 108), rel(19, 23, 30, 114), rel(20, 0, 30, 118)];
  assert.equal(derniereCharge(continue_, KWH).kwh, 18, 'des relevés à moins de 90 minutes : une seule charge, 100 → 118');
  assert.equal(derniereCharge(continue_, KWH).fin, Date.parse(T(20, 0, 30)));
  assert.equal(derniereCharge(continue_, KWH).debut, Date.parse(T(19, 22, 30)));
});

test('A7 — la dernière charge : le bruit, les trous, les remises à zéro, les unités', () => {
  assert.equal(derniereCharge([], KWH), null);
  assert.equal(derniereCharge(null, KWH), null);
  assert.equal(derniereCharge([rel(19, 22, 0, 100)], KWH), null, 'un seul relevé : rien à comparer');
  assert.equal(derniereCharge([rel(19, 22, 0, 100), rel(19, 23, 0, 100)], KWH), null, 'un compteur qui ne bouge pas');
  assert.equal(derniereCharge([rel(19, 22, 0, 100), rel(19, 23, 0, 100.1)], KWH), null, 'moins de 0,2 kWh : du bruit');
  // Muets ignorés.
  const m = [rel(19, 22, 0, 100), { state: 'unavailable', last_changed: T(19, 22, 5) }, rel(19, 22, 10, 110), { state: 'unknown', last_changed: T(19, 22, 15) }];
  assert.equal(derniereCharge(m, KWH).kwh, 10);
  // Un compteur de session remis à zéro : la charge d'avant garde son total.
  const s = [rel(19, 20, 0, 0), rel(19, 20, 30, 7), rel(19, 21, 0, 18), rel(19, 23, 0, 0)];
  assert.equal(derniereCharge(s, KWH).kwh, 18);
  // Une charge en cours après la remise à zéro est la dernière.
  assert.equal(derniereCharge([...s, rel(20, 7, 0, 3), rel(20, 7, 30, 9)], KWH).kwh, 9);
  // Wh → kWh.
  assert.ok(Math.abs(derniereCharge([rel(19, 22, 0, 100000), rel(19, 22, 30, 118000)], { attributes: { unit_of_measurement: 'Wh' } }).kwh - 18) < 1e-9);
  // Hors ordre : trié par instant.
  assert.equal(derniereCharge([rel(19, 22, 30, 118), rel(19, 22, 0, 100)], KWH).kwh, 18);
});

test('A7 — quand elle s’est finie, en mots', () => {
  const maintenant = new Date(2026, 10, 21, 10, 0).getTime();
  const q = (jour, h) => quandCharge(new Date(2026, 10, jour, h).getTime(), maintenant);
  assert.equal(q(21, 3), 'cette nuit');
  assert.equal(q(21, 8), 'ce matin');
  assert.equal(q(20, 13), 'hier après-midi');
  assert.equal(q(20, 21), 'hier soir');
  assert.equal(q(20, 2), 'hier dans la nuit');
  assert.equal(q(20, 9), 'hier matin');
  assert.match(q(17, 21), /^le .+17/, 'au-delà d’hier : le jour');
  assert.equal(quandCharge(NaN, maintenant), null);
  assert.equal(quandCharge(new Date(2026, 10, 21, 7).getTime(), new Date(2026, 10, 21, 23).getTime()), 'ce matin');
  assert.equal(quandCharge(new Date(2026, 10, 21, 19).getTime(), maintenant), 'ce soir');
  assert.equal(quandCharge(new Date(2026, 10, 21, 15).getTime(), maintenant), 'cet après-midi');
});

test('A7 — la popup lit l’historique de la semaine, seulement quand rien ne charge', () => {
  const f = lire('src', 'ficheborne.jsx');
  assert.match(f, /import \{ vueBorne, bornerCourant, kwhDepuis, derniereCharge, quandCharge \} from '\.\/bornevue\.js'/);
  assert.match(f, /const lireDerniere = !!\(v && borne && borne\.energie && v\.etat !== 'charge'\);/);
  assert.match(f, /7 \* 86400000/);
  assert.match(f, /derniereCharge\(semaine, S\[borne\.energie\]\)/);
  assert.match(f, /data-derniere=""/);
  assert.match(f, /tr\('Dernière charge'\)/);
  // La charge en cours garde sa ligne.
  assert.match(f, /data-session=""/);
  // Le hook de lecture est avant le `return null` : l'ordre des hooks ne change jamais.
  assert.ok(f.indexOf('const semaine = useEtatsHist') < f.indexOf('if (!v) return null;'));
});
