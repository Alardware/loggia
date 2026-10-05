/* Les fuites de français d'App.jsx et de views.js (audit du 03/10).
 *
 * `rien_en_francais` refuse un nœud de texte JSX écrit SEUL entre deux
 * balises. Il ne voyait pas le reste, et l'audit en a relevé une quarantaine :
 * un texte mêlé à une expression (« actuel {z.current}° », « Aucun résultat
 * pour « {q} » »), une phrase écrite après un `{' '}`, le littéral d'un
 * ternaire rendu (« Pause », « Verrouillée », « RAS »), un attribut
 * (« Ouvrir » + nom, « Ctrl+Maj+Z »), et les douze motifs d'une vue vide —
 * que `views.js` écrit en français et que trois écrans affichaient tels
 * quels. Tous sortaient en français dans les sept langues.
 *
 * Ce test épingle chaque fuite relevée : qu'une revienne, il la nomme.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { viewAvailability, VIEW_IDS } from '../src/views.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = lire('src', 'App.jsx');
const EN = (await import(pathToFileURL(join(RACINE, 'src', 'langues', 'en.js')).href)).default;

test('les onze motifs d’une vue vide sont des clés du catalogue', () => {
  /* Une installation vierge en donne dix ; l'Énergie en a un second, quand
   * des capteurs existent sans tableau de bord. « aucun distributeur de
   * croquettes configuré » est parti le 04/10 avec la vue Croquettes. */
  const motifs = new Set();
  for (const views of [{}, { energie: true }]) {
    const r = viewAvailability({ ready: true, caps: { has: {}, views }, resolved: {}, states: {}, userCfg: {} });
    VIEW_IDS.forEach(v => { if (r[v].ok === false) motifs.add(r[v].reason); });
  }
  assert.equal(motifs.size, 11, 'le balayage ne retrouve plus les onze motifs');
  motifs.add('aucune entité correspondante trouvée'); // le repli de la vue vide
  const absents = [...motifs].filter(m => !(m in EN));
  assert.deepEqual(absents, [], 'ces motifs s’afficheraient en français dans toutes les langues');
});

test('les trois écrans qui montrent un motif le traduisent à l’affichage', () => {
  assert.ok(APP.includes("{tr(reason || 'aucune entité correspondante trouvée')}"), 'la vue vide');
  const par = lire('src', 'views', 'parametres.jsx');
  assert.ok(par.includes('sub={why ? tr(why) : sub}'), 'Paramètres → Vues : les vues principales');
  assert.ok(par.includes("sub={why ? tr(why) : (DESC_SECONDAIRE[h.vid] || '')}"), 'Paramètres → Vues : les vues secondaires');
  assert.ok(lire('src', 'Onboarding.jsx').includes('{tr(views[v].reason)}'), 'le premier lancement');
});

test('aucune fuite relevée le 03/10 ne revient dans App.jsx', () => {
  const FUITES = [
    // Texte mêlé à une expression, ou écrit après un {' '}.
    '>Aucun résultat pour « {q} »<', '>actuel {z.current}°<', 'contient « {room} ».</span>',
    "{reason || 'aucune entité", "{' '}Ajoute les appareils",
    // Littéraux rendus : concaténations, ternaires, tables lues à l'écran.
    "' kWh jour'", "'Coucher ' + sunset", "'Alarme · …'", `label: "Qualité de l'air"`, "? 'Section'",
    "['night', '🌙', 'Nuit']", "['Bougie', 2200", "[tr('Froid'), 6500", "'stop', 'stop', 'Stop']", ": 'RAS'",
    "'Ouverture…' :", "? 'Verrouillée' :", "? 'Déverrouiller' : 'Verrouiller'", "? 'Pause' :",
    "'turn_on', 'Activer']", "'press', 'Appuyer']", "' · Éteint'", "normal: 'Normal'", "tuile('COV'",
    // Attributs — « Maj » est la touche française, « Ctrl » se dit « Strg » en allemand.
    "'Ouvrir ' + name", "' (Ctrl+Maj+Z)'", "' (Ctrl+Z)'",
    // La vue Croquettes (supprimée le 04/10) : que ses fuites ne reviennent pas.
    "return 'passé'", "'Prochain repas ' +", ": 'Plus de repas aujourd’hui'", "' · réservoir à '",
    "' REPAS RESTANT'", ": 'JOURNÉE TERMINÉE'",
    // Les machines et la collecte de `deriveAccueil`.
    "phase = 'En charge'", "phase = 'Tonte'", "'Tonte ' +", `phase = "Aujourd'hui !"`, "phase = 'Demain soir'",
    "('Sam. ' +", '`DANS ${',
  ];
  const restes = FUITES.filter(f => APP.includes(f));
  assert.deepEqual(restes, [], 'ces textes sortent en français dans les sept langues : passe-les par tr()');
});

test('le journal dit « RAS » dans la langue de l’écran', () => {
  /* `etatJournal` (historique.jsx) portait la même fuite que les cinq sites
   * d'App.jsx : la clé existait, l'appel n'y passait pas. */
  assert.ok(!lire('src', 'historique.jsx').includes(": 'RAS'"), 'un capteur au repos se lit « RAS » dans les sept langues');
});
