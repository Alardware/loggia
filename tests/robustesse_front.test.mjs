// ─────────────────────────────────────────────────────────────────────────────
// Ce qui échouait en silence se dit (audit du 18/09, v3.48.0).
//
// L'audit du front a trouvé des gestes qui avaient l'air de marcher quand ils
// avaient raté : un scénario refusé rendait `null`, un historique illisible
// se montrait vide, une sauvegarde impossible n'empêchait pas la remise à
// zéro, les réglages de sûreté se chargeaient « par défaut » quand la lecture
// ratait — et un réglage touché ensuite aurait écrasé la vraie configuration.
//
// Ces tests relisent les sources : chaque garde-fou est un motif précis que
// le prochain nettoyage « inutile » ne doit pas retirer sans le savoir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const compter = (s, motif) => s.split(motif).length - 1;

  /* + l'ecran de veille et la modale du code : sortis d'App.jsx le 23/09
   * (plan M1). Ce que ce fichier verifie n'a pas bouge, seulement son
   * adresse — on relit donc le monolithe ET ce qui en est sorti. */
const app = ['App.jsx', 'ecranveille.jsx', 'pinmodal.jsx'].map(f => lire('src', f)).join(String.fromCharCode(10));
const ui = lire('src', 'ui.jsx');
const parametres = lire('src', 'views', 'parametres.jsx');
const state = lire('src', 'state.js');
const en = lire('src', 'langues', 'en.js');

test('la feuille ne ferme qu’une fois : le filet est annulé quand l’animation finit', () => {
  assert.ok(ui.includes('filet.current = setTimeout(onClose, 420);'));
  assert.ok(ui.includes('clearTimeout(filet.current); onClose();'));
  assert.equal(compter(ui, 'setTimeout(onClose, 420)'), 1);
});

test('le sélecteur d’entités ne retrie pas à chaque battement de Home Assistant', () => {
  const debut = ui.indexOf('function EntPicker');
  const corps = ui.slice(debut, ui.indexOf('\n}', debut));
  assert.ok(corps.includes('}, [ids]);'), 'la liste dépend des identifiants');
  assert.ok(!corps.includes('}, [hass]);'), 'plus de tri à chaque `hass`');
});

test('les réglages de sûreté : une lecture ratée ne charge PAS les valeurs par défaut', () => {
  assert.ok(!parametres.includes('.catch(() => setCfg(ALERTES_DEF()))'));
  const debut = parametres.indexOf('function AlertesTele');
  const corps = parametres.slice(debut, parametres.indexOf('\n}', debut));
  assert.ok(corps.includes('setCfg(null);'), 'rien de chargé');
  assert.ok(corps.includes("tr('Réglages de sûreté indisponibles pour le moment"), 'et on le dit');
  assert.ok(corps.includes('if (!cfg) return;'), 'un réglage sans configuration lue ne part pas');
});

test('la remise à zéro s’annule quand la sauvegarde préalable est impossible', () => {
  const debut = parametres.indexOf('const doReset = async () => {');
  const corps = parametres.slice(debut, parametres.indexOf('\n  };', debut));
  const alerte = corps.indexOf("window.alert(tr('Sauvegarde impossible");
  assert.ok(alerte > 0);
  assert.ok(corps.indexOf('return;', alerte) < corps.indexOf('resetLoggiaComplet()'), 'on sort AVANT de remettre à zéro');
  // Et si le serveur refuse la remise à zéro elle-même, on ne recharge pas
  // comme si de rien n'était : la maison se serait resynchronisée intacte.
  assert.ok(corps.includes("window.alert(tr('Remise à zéro incomplète"));
  assert.ok(!state.includes("catch { /* on vide au moins l'appareil */ }"));
  assert.ok(!state.includes("h.callWS({ type: 'loggia/config/delete' }).catch"));
});

test('le compteur de règles ignore les réponses d’un effet dépassé', () => {
  const debut = parametres.indexOf('const compter = () => { if (vivant) setNbVolRegles(n); };');
  assert.ok(debut > 0);
  assert.ok(parametres.indexOf('return () => { vivant = false; };', debut) > debut);
});

test('deux appuis rapprochés sur Distribuer ne font qu’une ration', () => {
  const debut = app.indexOf('function RoomFeederCard');
  const corps = app.slice(debut, app.indexOf('\n}', debut));
  assert.ok(corps.includes('verrou.current = t + 2500; onFeed();'));
  assert.equal(compter(corps, 'onFeed()'), 1, 'les boutons passent par le verrou');
  assert.equal(compter(corps, 'distribuer()'), 2, 'les deux gabarits (compact et standard)');
});

test('l’écoute des rejets reste dans la fenêtre du panneau, et parle la langue choisie', () => {
  assert.ok(!app.includes('topW'), 'plus d’écoute sur window.top');
  assert.ok(app.includes("? tr('Réglage non enregistré — il appartient à la maison"));
  assert.ok(app.includes("tr('Commande non exécutée — Home Assistant a refusé ou n’a pas répondu')"));
  assert.ok(app.includes("r.code === 'scenario_incomplet' ? String(r.message)"));
});

test('les libellés de l’alarme passent tous par la traduction', () => {
  for (const l of ['Alarme · état inconnu', 'ALARME DÉCLENCHÉE', 'Alarme · activation…', 'Alarme armée · Absent', 'Alarme armée · Présent', 'Alarme armée']) {
    assert.ok(app.includes("tr('" + l + "')"), l);
    assert.ok(en.includes("'" + l + "':"), l + ' en anglais');
  }
  assert.ok(!app.includes(": 'Alarme armée'}"), 'plus de libellé brut dans la puce d’ambiance');
});

test('les heures du journal et des règles suivent la langue choisie, pas celle du navigateur', () => {
  // Ceux qui formatent eux-memes. Les regles passent par `quandCourt`
  // (parcommun.jsx, 18/09) : une seule heure a tenir, pour toutes.
  const fichiers = ['src/App.jsx', 'src/ficherobot.jsx', 'src/widgetsrail.jsx', 'src/views/parcommun.jsx'];
  for (const f of fichiers) {
    const s = lire(...f.split('/'));
    const appels = s.match(/toLocaleTimeString\([^)]*\)/g) || [];
    assert.ok(appels.length > 0, f + ' formate au moins une heure');
    for (const a of appels) assert.ok(a.startsWith('toLocaleTimeString(locale()'), f + ' : ' + a);
  }
  for (const f of ['src/views/journal.jsx', 'src/views/volets.jsx', 'src/views/veilles.jsx']) {
    assert.ok(lire(...f.split('/')).includes('quandCourt('), f + ' : ses heures ne passent plus par quandCourt');
  }
  // Et aucune vue des regles ne formate une heure dans le dos de la langue.
  for (const f of ['journal', 'fenetres', 'nuit', 'presence', 'veilles', 'volets']) {
    for (const a of lire('src', 'views', f + '.jsx').match(/toLocaleTimeString\([^)]*\)/g) || []) {
      assert.ok(a.startsWith('toLocaleTimeString(locale()'), f + ' : ' + a);
    }
  }
});

test('un scénario refusé ou raté ne rend pas `null` : il remonte à l’écoute globale', () => {
  const debut = app.indexOf('function lancerScenario(h, id) {');
  const corps = app.slice(debut, app.indexOf('\n}', debut));
  assert.ok(!corps.includes('.catch(() => null)'));
  assert.ok(corps.includes("e.code = 'scenario_incomplet'"));
  assert.ok(corps.includes('r.erreurs > 0 || (r.refusees > 0 && !r.n)'), 'raté, ou tout refusé');
  assert.ok(en.includes("'Scénario refusé — aucune cible autorisée ou joignable':"));
  assert.ok(en.includes("'Scénario en partie exécuté — {n} commande(s) refusée(s)':"));
});

test('exclure un volet du planning ne cache plus un refus', () => {
  assert.ok(app.includes("hass.callWS({ type: 'loggia/volets/config', patch });"));
  assert.ok(!app.includes("hass.callWS({ type: 'loggia/volets/config', patch }).catch(() => {});"));
});

test('un historique illisible se dit « indisponible », il ne se montre pas vide', () => {
  assert.ok(app.includes("if (!mort) setPoints('erreur');"));
  assert.equal(compter(app, "points === 'erreur' ? tr('Historique indisponible pour le moment')"), 2, 'la courbe de fiche et la carte graphique');
  assert.equal(compter(app, 'Array.isArray(points) && points.length > 1'), 2, 'aucun `.length` sur la chaîne d’erreur');
  const robot = lire('src', 'ficherobot.jsx');
  assert.ok(robot.includes("if (vivant) setReponse('erreur');"));
  assert.ok(robot.includes('erreur={histoErreur}'));
  assert.ok(robot.includes("if (erreur) return <div role=\"alert\""));
  const rail = lire('src', 'widgetsrail.jsx');
  assert.ok(rail.includes("if (vivant) setPoints('erreur');"));
  assert.ok(rail.includes("histoErreur ? tr('indisponible')"));
  assert.ok(en.includes("'Historique indisponible pour le moment':"));
});

test('sans serveur joignable : pas d’export, pas d’import', () => {
  const exp = state.slice(state.indexOf('export async function exportConfigComplete'), state.indexOf('export async function importConfigComplete'));
  assert.ok(!exp.includes('catch { serveur = {}; }'), 'un fichier presque vide aurait l’air d’une sauvegarde');
  const imp = state.slice(state.indexOf('export async function importConfigComplete'));
  assert.ok(imp.includes("const actuelle = await h.callWS({ type: 'loggia/config/get' });"));
  assert.ok(!imp.includes(".catch(() => null)"), 'sans lecture, pas de miroir');
});

test('une découverte interrompue se dit, en console et à l’écran', () => {
  const disc = lire('src', 'discovery.js');
  assert.ok(disc.includes("console.error('Loggia : découverte interrompue', e);"));
  assert.ok(disc.includes("echec: true, errors: [{ type: 'decouverte', message:"), 'la forme des erreurs de registre est gardée');
  assert.ok(app.includes("discovery.echec && <div role=\"alert\""));
  assert.ok(en.includes("'La découverte de la maison a été interrompue — recharge la page':"));
});
