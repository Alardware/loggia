// ─────────────────────────────────────────────────────────────────────────────
// Lot 15 de l'audit du 03/10 : un état optimiste qui n'expire pas, et un cache
// qui ne se vide jamais.
//
// 1. Le filet d'`useOptimiste` (ADR 0105) ne valait que pour `App.jsx` : il n'y
//    était pas exporté, et son test ne lisait que ce fichier. Paramètres, chargé
//    à part, tenait donc ses automatisations dans un état fait main qui ne se
//    vidait que si Home Assistant CONFIRMAIT — une automatisation qu'il
//    refusait de couper restait « coupée » tant qu'on ne quittait pas la page.
//    Même recette dans App.jsx, hors de portée des motifs du test : le
//    réservoir des croquettes (« plein » pour toujours), les repas, et, trouvés
//    en élargissant le filet, « tout ouvrir / tout fermer » et le mode de
//    l'installation dans la vue Volets.
//
//    Le filet lit désormais TOUT `src/`, vues comprises, et nomme trois
//    recettes qui n'expirent pas : vider à la main sur l'état réel, recopier
//    l'état réel dans un miroir que la commande écrit, et un état « Ov » sans
//    minuteur. Les fenêtres FIXES qui expirent restent permises : la position
//    d'un morceau avance chaque seconde (un filet qui tombe au premier
//    changement sauterait au premier tic), et la consigne de la compacte climat
//    s'additionne tapée trois fois de suite.
//
// 2. `HISTO_CACHE` gardait chaque série 24 h jusqu'au rechargement, alors
//    qu'aucune lecture ne sert une entrée de plus de cinq minutes. Une tablette
//    allumée trois jours y accumulait toutes les entités jamais ouvertes.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const parcourir = (rep, out = []) => {
  for (const nom of readdirSync(rep)) {
    const p = join(rep, nom);
    if (statSync(p).isDirectory()) parcourir(p, out);
    else if (/\.(js|jsx)$/.test(nom)) out.push(p);
  }
  return out;
};

/* `ScenesContent` est intouchable (règle maison : la bibliothèque Hue reste
 * telle quelle). Ses deux miroirs — la pièce et la scène choisies — n'ont pas
 * d'autre lecture que l'`input_select` qu'ils recopient ; ils restent, et ce
 * filet ne les lit pas. Tout le reste de `src/` passe. */
const sansScenes = (chemin, t) => {
  if (chemin !== 'src/App.jsx') return t;
  const i = t.indexOf('function ScenesContent(');
  return i < 0 ? t : t.slice(0, i) + t.slice(t.indexOf('\n}\n', i));
};
const SOURCES = parcourir(join(RACINE, 'src'))
  .map(p => [relative(RACINE, p).split('\\').join('/'), lire(p)])
  .filter(([c]) => !c.startsWith('src/langues/'))
  .map(([c, t]) => [c, sansScenes(c, t)]);
const source = (c) => (SOURCES.find(([x]) => x === c) || [])[1] || '';
const APP = source('src/App.jsx');
const PAR = source('src/views/parametres.jsx');
const compter = (s, motif) => s.split(motif).length - 1;

// Une ligne qui COMMANDE la maison : c'est là qu'un état optimiste se pose.
const COMMANDE = /\b(call|appel|cov|commander|commanderService|autoCall|callService)\(/;

test('le filet commun vit dans un module que tout src/ peut importer', () => {
  const opt = source('src/optimiste.js');
  assert.ok(opt.includes('export function useOptimiste(reel, delai = OPTIMISTE_MS) {'),
    'useOptimiste n’est pas exporté : Paramètres, chargé à part, ne peut que recopier son propre état optimiste');
  assert.ok(!APP.includes('function useOptimiste('), 'App.jsx garde sa propre copie du hook : deux filets divergeront');
  assert.match(APP, /import \{ useOptimiste, useDemandes, enVol \} from '\.\/optimiste\.js';/, 'App.jsx n’importe plus le filet commun');
  assert.match(PAR, /import \{ use(Optimiste|Demandes)[\w, ]*\} from '\.\.\/optimiste\.js';/, 'Paramètres n’importe pas le filet commun');
});

test('aucun état optimiste ne se vide à la main sur l’état réel, nulle part dans src/', () => {
  // La recette d'avant l'ADR 0105 : rien ne la vide si HA ne bouge pas.
  const fautes = [];
  for (const [c, t] of SOURCES) {
    for (const m of t.matchAll(/useEffect\(\(\) => \{ ?(set\w+)\(null\); ?\}, \[/g)) fautes.push(c + ' : ' + m[1]);
  }
  assert.deepEqual(fautes, [], 'un état optimiste se vide à la main : un refus de HA le laisse affiché jusqu’au changement de page');
});

test('aucun miroir de l’état réel ne sert d’état optimiste', () => {
  /* `useState(reel)` + `useEffect(() => { setX(reel); }, [sig])`, puis `setX`
   * posé sous le doigt avec la commande : le miroir ne se recale que si HA
   * bouge. Un refus — rien ne bouge — et il ment jusqu'au démontage. Une
   * remise à zéro (`setSel(0)`, `setEntSheet(false)`) n'est pas un miroir. */
  const fautes = [];
  for (const [c, t] of SOURCES) {
    const lignes = t.split('\n');
    for (const m of t.matchAll(/useEffect\(\(\) => \{ ?(set\w+)\(([^;]*)\); ?\}, \[[^\]]*\]\);/g)) {
      if (/^(null|false|true|0|''|""|\[\]|\{\})$/.test(m[2].trim())) continue;
      const pose = lignes.filter(l => l.includes(m[1] + '(') && !l.includes('useEffect(') && COMMANDE.test(l));
      if (pose.length) fautes.push(c + ' : ' + m[1]);
    }
  }
  assert.deepEqual(fautes, [], 'un état recopié de HA est écrit par une commande : il n’expire pas');
});

test('un état « Ov » sans minuteur n’expire pas', () => {
  /* Les automatisations de Paramètres tenaient `autoOv` dans un `useState`
   * vidé par une purge qui attendait la CONFIRMATION de HA. Un `ov…`/`…Ov`
   * ne s'écrit qu'avec son minuteur — ou par `useOptimiste`, qui le porte. */
  const fautes = [];
  for (const [c, t] of SOURCES) {
    // `ov`, `ovT`, `autoOv`, `seekOv`… mais pas `override` (le décor météo choisi).
    for (const m of t.matchAll(/const \[(ov|ov[A-Z]\w*|\w*Ov\w*), (set\w+)\] = useState\(/g)) {
      if (!t.includes('setTimeout(() => ' + m[2] + '(null)')) fautes.push(c + ' : ' + m[1]);
    }
  }
  assert.deepEqual(fautes, [], 'un état optimiste sans minuteur : il tient jusqu’au changement de page');
});

test('les constats passent par le filet commun', () => {
  // Une réponse par entité, une échéance par demande : voir plus bas et
  // lot15_demandes_echeances (relecture du lot 15).
  assert.ok(PAR.includes('const [autoOv, demanderAuto] = useDemandes();'), 'les automatisations');
  assert.ok(!PAR.includes('useOptimiste('), 'les automatisations repartent sur un minuteur commun : basculer les autres lignes prolonge un refus');
  assert.ok(PAR.includes("demanderAuto(a.id, !a.on, s, s && s.state === 'on');"), 'la bascule d’une automatisation');
  assert.ok(PAR.includes("on: enVol(autoOv, id, s, s.state === 'on'),"), 'une automatisation se lit sans sa propre réponse');
  assert.match(PAR, /import \{ useDemandes, enVol \} from '\.\.\/optimiste\.js';/);
  // Les repas passent dans la fiche du distributeur le 04/10, avec la vue
  // Croquettes (et son réservoir optimiste) partie : une demande par repas.
  assert.ok(APP.includes('const [ovRepas, demanderRepas] = useDemandes();'), 'les repas');
  assert.ok(APP.includes('demanderRepas(m.id, !m.on, S && S[m.auto], autoOn(m.auto));'), 'la bascule d’un repas');
  assert.ok(APP.includes('on: enVol(ovRepas, m.id, S && S[m.auto], autoOn(m.auto))'), 'un repas se lit sans la réponse des autres');
  assert.ok(!APP.includes('useOptimiste(msig)') && !APP.includes('poserRepas('), 'les repas sur une signature commune : la réponse d’un repas jetait la demande de l’autre');
  assert.ok(APP.includes('const [ovPos, poserPos] = useOptimiste(csig);'), 'tout ouvrir / tout fermer');
  assert.ok(APP.includes('const [ovModeHa, setModeLocal] = useOptimiste(haMode);'), 'le mode de l’installation');
});

test('la réponse d’une automatisation ne jette pas la demande en vol d’une autre', async () => {
  /* Une signature commune (les états de TOUTES les automatisations) vidait
   * toutes les demandes à la première réponse. Mesuré en démo, HA à 400 ms :
   * B coupée, A coupée 50 ms après ; A répond, B repasse « active » 400 ms,
   * puis « inactive » à sa propre réponse — l'aller-retour du 01/10. La
   * demande se lit donc par entité, sur son `last_changed`. */
  const { demandeCle, enVol } = await import('../src/optimiste.js');
  const B0 = { state: 'on', last_changed: '2026-10-04T10:00:00.000Z' };
  const A0 = { state: 'on', last_changed: '2026-10-04T09:00:00.000Z' };
  let ov = { 'automation.b': demandeCle(false, B0) };
  ov = { ...ov, 'automation.a': demandeCle(false, A0) };
  // A répond, B pas encore : B garde sa demande.
  const A1 = { state: 'off', last_changed: '2026-10-04T10:00:00.050Z' };
  assert.equal(enVol(ov, 'automation.a', A1, A1.state === 'on'), false, 'A doit lire sa réponse');
  assert.equal(enVol(ov, 'automation.b', B0, B0.state === 'on'), false, 'B retombe sur son état d’avant pendant que sa demande est en vol');
  // B répond — ou un autre appareil la change : la maison reprend la main.
  const B1 = { state: 'on', last_changed: '2026-10-04T10:00:00.400Z' };
  assert.equal(enVol(ov, 'automation.b', B1, true), true, 'une réponse de HA ne reprend pas la main');
  // Sans demande, ou sans état, c'est l'état réel.
  assert.equal(enVol(null, 'automation.b', B0, true), true);
  assert.equal(enVol(ov, 'automation.z', undefined, false), false);
});

test('deux appuis rapides sur la même automatisation : l’écho du premier ne reprend pas la main', async () => {
  /* Relecture du lot 15 (04/10). Coupée puis rallumée avant la réponse : la
   * seconde demande partait du même `last_changed`, l'écho `off` de la
   * première le bougeait, et la ligne retombait sur « off » jusqu'à la
   * réponse du `turn_on` — ON → off → ON → off → ON. */
  const { demandeCle, enVol } = await import('../src/optimiste.js');
  const A0 = { state: 'on', last_changed: '2026-10-04T10:00:00.000Z' };
  const coupe = demandeCle(false, A0, undefined, true);
  const rallume = demandeCle(true, A0, coupe, true);
  const A1 = { state: 'off', last_changed: '2026-10-04T10:00:00.300Z' };
  assert.equal(enVol({ 'automation.a': rallume }, 'automation.a', A1, false), true, 'l’écho de la première demande rend la ligne à l’état que la seconde annule');
  const A2 = { state: 'on', last_changed: '2026-10-04T10:00:00.450Z' };
  assert.equal(enVol({ 'automation.a': rallume }, 'automation.a', A2, true), true);
  // L'écho est arrivé ENTRE le deuxième et le troisième appui : la réponse
  // du deuxième est, pour le troisième, un écho de plus.
  const recoupe = demandeCle(false, A1, rallume, false);
  assert.equal(enVol({ 'automation.a': recoupe }, 'automation.a', A2, true), false, 'la réponse du deuxième appui reprend la main sur le troisième');
  // Une demande seule : tout changement est une réponse, même vers l'état d'avant.
  const seule = { 'automation.a': demandeCle(false, A0, undefined, true) };
  assert.equal(enVol(seule, 'automation.a', { state: 'on', last_changed: '2026-10-04T10:00:01.000Z' }, true), true, 'un autre appareil ne reprend plus la main');
  // Une demande déjà répondue n'a plus d'écho à transmettre.
  const A3 = { state: 'off', last_changed: '2026-10-04T10:00:00.500Z' };
  assert.equal(demandeCle(true, A3, recoupe, false).echo, undefined, 'une réponse passée retiendrait encore un écho');
});

/* ── 2. Le cache d'historique ──────────────────────────────────────────────── */

/** Le cache et sa purge tels qu'écrits, rendus exécutables. */
function cacheHisto() {
  const i = APP.indexOf('const HISTO_CACHE = new Map();');
  assert.notEqual(i, -1, 'le cache d’historique a changé de forme');
  const f = APP.indexOf('function histoRanger(', i);
  assert.notEqual(f, -1, 'le cache d’historique ne se purge pas : chaque entité ouverte y reste jusqu’au rechargement');
  const j = APP.indexOf('\n}', f) + 2;
  return new Function(APP.slice(i, j) + '\nreturn { HISTO_CACHE, histoRanger, HISTO_FRAIS_MS };')();
}

test('une écriture purge ce qu’aucune lecture ne servira plus', () => {
  const { HISTO_CACHE, histoRanger, HISTO_FRAIS_MS } = cacheHisto();
  assert.equal(HISTO_FRAIS_MS, 5 * 60000, 'la fraîcheur du cache a changé');
  const t0 = 1e12;
  histoRanger('sensor.a|', { t: t0, serie: [] }, t0);
  histoRanger('sensor.b|', { t: t0 + 60000, serie: [] }, t0 + 60000);
  assert.ok(HISTO_CACHE.has('sensor.a|') && HISTO_CACHE.has('sensor.b|'), 'une série fraîche est jetée : la fiche rouverte referait son GET');
  histoRanger('sensor.c|', { t: t0 + HISTO_FRAIS_MS, serie: [] }, t0 + HISTO_FRAIS_MS);
  assert.ok(!HISTO_CACHE.has('sensor.a|'), 'une série de cinq minutes reste en mémoire, alors qu’aucune lecture ne la sert');
  assert.ok(HISTO_CACHE.has('sensor.b|') && HISTO_CACHE.has('sensor.c|'));
});

test('une tablette allumée trois jours ne garde que les cinq dernières minutes', () => {
  // Une fiche différente toutes les 30 s, sans recharger : 8 640 entités vues.
  const { HISTO_CACHE, histoRanger } = cacheHisto();
  const t0 = 1e12;
  let max = 0;
  for (let k = 0; k < 3 * 24 * 120; k++) {
    const t = t0 + k * 30000;
    histoRanger('sensor.e' + k + '|', { t, serie: [] }, t);
    max = Math.max(max, HISTO_CACHE.size);
  }
  assert.ok(max <= 10, max + ' séries gardées : le cache grossit avec la durée d’allumage');
});

test('une seule porte d’écriture, et les lectures parlent du même délai', () => {
  // Une écriture qui contournerait la purge rendrait sa croissance au cache.
  assert.equal(compter(APP, 'HISTO_CACHE.set('), 1, 'le cache s’écrit hors de histoRanger');
  assert.ok(APP.includes('histoRanger(cle, lue);'), 'l’historique ne range plus sa série');
  /* Purger à cinq minutes ce qu'une lecture servirait encore à dix ferait
   * refaire des GET pour rien : les deux seuils sont le MÊME nom. */
  assert.ok(APP.includes('Date.now() - enCache.t < HISTO_FRAIS_MS'), 'la lecture au montage a son propre délai');
  assert.ok(APP.includes('Date.now() - frais.t < HISTO_FRAIS_MS'), 'la lecture de l’effet a son propre délai');
});
