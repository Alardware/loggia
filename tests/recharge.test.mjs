// ─────────────────────────────────────────────────────────────────────────────
// Un module chargé à la demande qui manque ne fait plus tomber l'écran
// (audit du 03/10).
//
// Le paquet ne garde que deux générations de bundles (ADR 0072), et les règles
// 3 et 4 de `pack_frontend.py` en retirent encore ce que plus rien ne sert : la
// page restée ouverte pendant une mise à jour HACS peut demander un fichier qui
// n'existe plus. Paramètres, Système, la fiche robot, l'assistant, l'accueil
// de première installation et même le fond météo n'avaient aucune barrière, et
// personne n'écoutait `vite:preloadError` : un 404 donnait « Loggia n'a pas pu
// s'afficher » et quatre boutons, dont « Réglages d'usine ». « Recharger »
// réparait. `src/recharge.js` fait ce geste, une fois.
//
// Le module est pur : un faux `sessionStorage`, un faux `location.reload`, de
// fausses fonctions d'import. Les trois derniers tests relisent les sources.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerRecharge, CLE_RECHARGE, FENETRE_RECHARGE } from '../src/recharge.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const NL = String.fromCharCode(10);
const ANTISLASH = String.fromCharCode(92);

/** Un navigateur de poche : une session qui survit au rechargement, une horloge qu'on avance. */
function monde({ enLigne = true, sansSession = false } = {}) {
  const m = { t: 1800000000000, recharges: 0, session: new Map() };
  m.stockage = () => {
    if (sansSession) throw new Error('SecurityError');
    return {
      getItem: (k) => (m.session.has(k) ? m.session.get(k) : null),
      setItem: (k, v) => { m.session.set(k, String(v)); },
      removeItem: (k) => { m.session.delete(k); },
    };
  };
  m.recharger = () => { m.recharges += 1; };
  m.enLigne = () => enLigne;
  m.maintenant = () => m.t;
  return m;
}

/** Le 404 d'un import à la demande, tel que Chrome le dit. */
const echoue = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

/** Vrai si la promesse n'a toujours rien rendu, la file des tâches vidée. */
async function enAttente(p) {
  let fini = false;
  p.then(() => { fini = true; }, () => { fini = true; });
  await new Promise(r => setTimeout(r, 10));
  return !fini;
}

test('un module absent recharge la page une fois, et l’écran attend au lieu de tomber', async () => {
  const m = monde();
  const p = creerRecharge(m).charger(echoue);
  assert.equal(await enAttente(p), true,
    'la promesse reste en attente : Suspense garde son repli jusqu’au départ de la page, jamais l’écran de secours');
  assert.equal(m.recharges, 1);
  assert.equal(m.session.get(CLE_RECHARGE), String(m.t), 'la date du rechargement survit à la page');
});

test('le même échec juste après le rechargement se dit : jamais de boucle', async () => {
  const m = monde();
  await enAttente(creerRecharge(m).charger(echoue));
  m.t += 3000;
  const erreur = new TypeError('Failed to fetch dynamically imported module');
  await assert.rejects(creerRecharge(m).charger(() => Promise.reject(erreur)), (e) => e === erreur,
    'l’erreur d’origine, intacte, pour l’écran de secours');
  assert.equal(m.recharges, 1, 'un module absent APRÈS le rechargement est un paquet cassé, pas une page périmée');
});

test('un décor introuvable après le rechargement ne rend rien — pas d’écran d’erreur', async () => {
  const m = monde();
  assert.equal(await enAttente(creerRecharge(m).charger(echoue, { decor: true })), true,
    'la première fois, c’est la page qui est périmée : elle repart');
  assert.equal(m.recharges, 1);
  m.t += 3000;
  const mod = await creerRecharge(m).charger(echoue, { decor: true });
  assert.equal(typeof mod.default, 'function', 'un composant, pour React');
  assert.equal(mod.default(), null, 'il ne dessine rien');
  assert.equal(m.recharges, 1, 'et ne recharge pas une seconde fois');
});

test('un chargement réussi efface le drapeau, passé la fenêtre seulement', async () => {
  const m = monde();
  m.session.set(CLE_RECHARGE, String(m.t - 5000));
  const r = creerRecharge(m);
  const mod = { default: () => null };
  assert.equal(await r.charger(() => Promise.resolve(mod)), mod, 'le module passe tel quel');
  assert.ok(m.session.has(CLE_RECHARGE),
    'effacé par un module sain chargé juste après le rechargement, le drapeau laisserait un module vraiment absent recharger en boucle');
  m.t += FENETRE_RECHARGE;
  await r.charger(() => Promise.resolve(mod));
  assert.equal(m.session.has(CLE_RECHARGE), false);
});

test('la mise à jour suivante recharge de nouveau, même sans chargement réussi entre-temps', async () => {
  const m = monde();
  await enAttente(creerRecharge(m).charger(echoue));
  m.t += FENETRE_RECHARGE + 1;
  assert.equal(await enAttente(creerRecharge(m).charger(echoue)), true);
  assert.equal(m.recharges, 2,
    'une tablette murale reste des semaines sur l’Accueil : le drapeau ne doit pas la priver du prochain rechargement');
});

test('l’écouteur de Vite recharge et retient l’erreur — une fois', () => {
  const m = monde();
  const fenetre = new EventTarget();
  const retirer = creerRecharge(m).ecouter(fenetre);
  const ev = new Event('vite:preloadError', { cancelable: true });
  fenetre.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'retenue : Vite rend undefined au lieu de lever');
  assert.equal(m.recharges, 1);
  retirer();
  m.t += 3000;
  creerRecharge(m).ecouter(fenetre);
  const ev2 = new Event('vite:preloadError', { cancelable: true });
  fenetre.dispatchEvent(ev2);
  assert.equal(ev2.defaultPrevented, false, 'dans la fenêtre, l’erreur suit son cours');
  assert.equal(m.recharges, 1);
});

test('l’import retenu par l’écouteur rend undefined : l’écran attend, sans second rechargement', async () => {
  const m = monde();
  const fenetre = new EventTarget();
  const r = creerRecharge(m);
  r.ecouter(fenetre);
  // Ce que fait le préchargement de Vite 7 : l'événement, puis undefined s'il a été retenu.
  const parVite = () => Promise.resolve().then(() => {
    const ev = new Event('vite:preloadError', { cancelable: true });
    fenetre.dispatchEvent(ev);
    if (!ev.defaultPrevented) throw new TypeError('Failed to fetch dynamically imported module');
    return undefined;
  });
  assert.equal(await enAttente(r.charger(parVite)), true);
  // Un export nommé, converti par .then, lève sur ce vide : même attente.
  assert.equal(await enAttente(r.charger(() => parVite().then(x => ({ default: x.ParametresContent })))), true,
    'Paramètres et la fiche d’entités passent par un .then : leur TypeError ne doit pas montrer l’écran de secours');
  assert.equal(m.recharges, 1);
});

test('sans mémoire de session, ou hors ligne, rien ne recharge', async () => {
  for (const m of [monde({ sansSession: true }), monde({ enLigne: false })]) {
    const erreur = new TypeError('Failed to fetch dynamically imported module');
    await assert.rejects(creerRecharge(m).charger(() => Promise.reject(erreur)), (e) => e === erreur);
    assert.equal(m.recharges, 0,
      'sans mémoire, une seule fois ne se garantit pas ; hors ligne, la page d’erreur du navigateur remplacerait la nôtre');
  }
});

/** Les modules de src, sous-dossiers compris. */
function sources(dossier = join(RACINE, 'src'), out = []) {
  for (const f of readdirSync(dossier)) {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (f.endsWith('.js') || f.endsWith('.jsx')) out.push(p);
  }
  return out;
}

const LAZY_NU = /(^|[^A-Za-z0-9_$])lazy *[(]/;
const commentaire = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'); };

test('aucun lazy nu dans src : tout module à la demande passe par lazyRecharge', () => {
  assert.ok(LAZY_NU.test(`const X = lazy(() => import('./x.jsx'));`) && LAZY_NU.test('React.lazy(f)') && !LAZY_NU.test('lazyRecharge(f)'),
    'le motif ne reconnaît plus ce qu’il doit refuser');
  const nus = [];
  for (const p of sources()) {
    const nom = relative(RACINE, p).split(ANTISLASH).join('/');
    // Le seul permis : celui que lazyRecharge enveloppe.
    if (nom === 'src/recharge.js') continue;
    readFileSync(p, 'utf8').split(NL).forEach((l, i) => {
      if (!commentaire(l) && LAZY_NU.test(l)) nus.push(nom + ':' + (i + 1) + ' ' + l.trim().slice(0, 100));
    });
  }
  assert.deepEqual(nus, [],
    'un module chargé à la demande sans le rechargement unique : le 404 d’une page périmée ferait tomber tout l’écran');
});

test('les modules à la demande : chacun derrière le rechargement, les décors sans écran d’erreur', () => {
  const app = lire('src', 'App.jsx').split(NL);
  const MODULES = [
    ['WeatherGL', './wx3d.jsx', true],
    ['SystemeContent', './views/systeme.jsx', false],
    ['ParametresContent', './views/parametres.jsx', false],
    ['ViewEntSheet', './views/parametres.jsx', false],
    ['FicheRobotContent', './ficherobot.jsx', false],
    ['AssistantSheet', './views/assistant.jsx', false],
    ['OrbeMini', './orbe.jsx', true],
    ['Onboarding', './Onboarding.jsx', false],
  ];
  for (const [nom, cible, decor] of MODULES) {
    const l = app.find(x => x.startsWith(`const ${nom} = `)) || '';
    assert.ok(l.includes(`lazyRecharge(() => import('${cible}')`), nom + ' n’est plus chargé par lazyRecharge');
    assert.equal(l.includes('{ decor: true }'), decor,
      nom + (decor ? ' est un décor : introuvable, il ne rend rien' : ' est du contenu : son échec définitif doit se dire'));
  }
  assert.ok(lire('src', 'ficherobot.jsx').includes(`const VacPlan = lazyRecharge(() => import('./vacplan.jsx'));`),
    'le plan du robot est chargé par lazyRecharge');
  assert.ok(lire('src', 'views', 'assistant.jsx').includes(`const Orbe = lazyRecharge(() => import('../orbe.jsx'), { decor: true });`),
    'l’orbe de la popup est un décor, comme la miniature');
});

test('l’amorce écoute vite:preloadError avant le premier rendu', () => {
  const boot = lire('src', 'boot.jsx');
  const i = boot.indexOf(NL + 'ecouterPrechargement(window);' + NL);
  assert.ok(i > 0, 'plus personne n’écoute vite:preloadError : un catalogue ou la voix introuvables ne rechargent plus rien');
  assert.ok(i < boot.indexOf('createRoot('), 'l’écoute arrive après le premier rendu');
});
