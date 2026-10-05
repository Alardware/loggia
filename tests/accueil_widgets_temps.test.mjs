// v3.42.0 (ADR 0041) — « sur le côté à l'accueil voici d'autres widgets que l'on
// pourrait mettre, pour l'heure 2 styles » (17/09). L'heure (aiguilles · tuiles)
// EN OPTION dans le rail. Ce qui se calcule est testé à sec ; le branchement
// dans l'Accueil est relu dans les sources.
//
// Le widget « calendrier » (semaine · mois) a vécu ici jusqu'à la décision
// 0132 : la carte Agenda disait la même semaine, sa feuille va plus loin —
// « retire la du coup elle ne serre plus a rien » (02/10). Ses calculs, ses
// villes et son globe sont partis avec lui ; `tests/agenda_rail.test.mjs` tient
// désormais la carte et la feuille qui le remplacent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const {
  WIDGETS_OPTION, STYLES_WIDGETS, styleDe, chiffresHeure, anglesAiguilles, premierJourSemaine, prochainSoleil,
} = await import('../src/horloge.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const vue = lire('src', 'widgetsrail.jsx');
const css = lire('src', 'index.css');
const NL = String.fromCharCode(10);
const bloc = (src, debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

test('deux widgets en option, deux styles pour l’heure ; un style inconnu retombe sur le premier', () => {
  assert.deepEqual(WIDGETS_OPTION, ['heure', 'co2'], 'le CO₂ les a rejoints en v3.46.0 (ADR 0044) ; le calendrier les a quittés (0132)');
  // L'heure en tuiles d'abord : la capture du 19/09 (« par défaut »).
  assert.deepEqual(STYLES_WIDGETS, { heure: ['tuiles', 'aiguilles'] });
  assert.equal(styleDe({ heure: 'tuiles' }, 'heure'), 'tuiles');
  assert.equal(styleDe({ heure: 'aiguilles' }, 'heure'), 'aiguilles');
  assert.equal(styleDe({ heure: 'neon' }, 'heure'), 'tuiles', 'un style d’une version future, ou une faute de frappe');
  assert.equal(styleDe(null, 'heure'), 'tuiles');
  assert.equal(styleDe('aiguilles', 'heure'), 'tuiles', 'pas un objet : pas un choix');
  assert.equal(styleDe({}, 'meteo'), null, 'une section sans style n’en a pas');
  assert.equal(styleDe({ calendrier: 'mois' }, 'calendrier'), null, 'un vieux style réglé ne ressuscite pas un widget retiré');
});

test('les aiguilles : la petite avance avec les minutes, la grande avec les secondes', () => {
  assert.deepEqual(anglesAiguilles(new Date(2026, 8, 17, 18, 10, 30)), { heures: 185, minutes: 63, secondes: 180 });
  assert.deepEqual(anglesAiguilles(new Date(2026, 8, 17, 0, 0, 0)), { heures: 0, minutes: 0, secondes: 0 });
  assert.deepEqual(anglesAiguilles(new Date(2026, 8, 17, 12, 0, 0)), { heures: 0, minutes: 0, secondes: 0 }, 'midi comme minuit');
  assert.equal(anglesAiguilles(new Date(2026, 8, 17, 6, 30, 0)).heures, 195, 'à 6 h 30 la petite est entre le 6 et le 7');
  assert.equal(anglesAiguilles(new Date(2026, 8, 17, 23, 59, 59)).heures, 359.5);
  assert.equal(anglesAiguilles(new Date(2026, 8, 17, 9, 15, 0)).minutes, 90, 'le quart : à droite');
  assert.deepEqual(chiffresHeure(new Date(2026, 8, 17, 8, 5, 9)), { h: '08', m: '05', s: '09' }, 'toujours deux chiffres');
});

/* `premierJourSemaine` a survécu au calendrier : la fiche d'un robot range son
 * planning sur la semaine de la langue (`ficherobot.jsx`). */
test('la semaine commence le jour que la langue dit — lundi sans réponse du moteur', () => {
  assert.equal(premierJourSemaine('fr-FR', () => 1), 1);
  assert.equal(premierJourSemaine('en-US', () => 7), 7);
  assert.equal(premierJourSemaine('xx', () => null), 1);
  assert.equal(premierJourSemaine('xx', () => 9), 1, 'une réponse hors de 1…7 ne compte pas');
  assert.equal(premierJourSemaine('xx', () => 0), 1);
  assert.ok(lire('src', 'ficherobot.jsx').includes("import { premierJourSemaine } from './horloge.js';"), 'son seul lecteur');
});

test('le soleil : le prochain rendez-vous, coucher ou lever — rien sans date à venir', () => {
  const midi = new Date(2026, 8, 17, 12, 0).getTime();
  const soleil = { attributes: { next_rising: new Date(2026, 8, 18, 7, 21).toISOString(), next_setting: new Date(2026, 8, 17, 19, 52).toISOString() } };
  assert.deepEqual(prochainSoleil(soleil, midi), { type: 'coucher', date: new Date(2026, 8, 17, 19, 52) });
  const nuit = { attributes: { next_rising: new Date(2026, 8, 18, 7, 21).toISOString(), next_setting: new Date(2026, 8, 18, 19, 50).toISOString() } };
  assert.equal(prochainSoleil(nuit, new Date(2026, 8, 17, 23, 0)).type, 'lever', 'la nuit, c’est le lever qui vient');
  assert.equal(prochainSoleil({ attributes: { next_setting: new Date(2026, 8, 17, 9, 0).toISOString() } }, midi), null, 'une date passée n’est pas un rendez-vous');
  assert.equal(prochainSoleil({ attributes: { next_setting: 'bientôt' } }, midi), null);
  assert.equal(prochainSoleil({ attributes: {} }, midi), null);
  assert.equal(prochainSoleil(null, midi), null, 'pas de sun.sun : pas de tuile');
  assert.equal(prochainSoleil({ attributes: { next_rising: new Date(2026, 8, 18, 7, 21).toISOString() } }, midi).type, 'lever', 'un seul des deux suffit');
});

test('l’Accueil : des sections en option, présentes par défaut, que la croix retire', () => {
  assert.ok(app.includes("const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'rappels', 'agenda'];"), 'l’heure juste sous « À surveiller », le CO₂ après la météo (19/09)');
  assert.ok(app.includes("heure: tr('Heure'), co2: 'CO₂' });"), 'leurs noms en édition');
  /* Le nom du widget retiré est parti avec lui : `ACC_NOMS` passe de l'heure
   * au CO₂ sans rien entre les deux. La carte `CvCalendrier`, posable sur une
   * vue, garde le sien — c'est un AUTRE objet, et il reste. */
  assert.ok(!/const ACC_NOMS[^;]*calendrier/.test(app), 'le widget retiré ne laisse pas son nom parmi ceux du rail');
  const d = bloc(app, 'function Dashboard(', NL + 'function ');
  assert.ok(d.includes("ajoutees: Array.isArray(v.ajoutees) ? v.ajoutees : [...ACC_AJOUTEES_DEFAUT], styles: (v.styles && typeof v.styles === 'object') ? v.styles : {},"), 'l’agencement relu garde les ajouts et les styles — sinon ils se perdaient au rechargement');
  assert.ok(d.includes('const estOption = (id) => WIDGETS_OPTION.indexOf(id) >= 0;'));
  assert.ok(d.includes("const cache = estOption(id) ? (grille.ajoutees || []).indexOf(id) < 0 : (grille.caches || []).map(s => ACC_RENOMME[s] || s).indexOf(id) >= 0;"), 'un widget en option n’est là que s’il est ajouté (par défaut, il l’est) ; un vieux masquage « calendrier » ne concerne plus personne');
  assert.ok(d.includes("? saveGrille({ ajoutees: [...(grille.ajoutees || []).filter(x => x !== id), id] })") && d.includes("? saveGrille({ ajoutees: (grille.ajoutees || []).filter(x => x !== id) })"), 'ajouter et retirer passent par la grille du FORMAT en cours');
  assert.ok(d.includes("{estOption(id) ? tr('en option') : tr('masquée')}") && d.includes("{estOption(id) ? tr('Ajouter') : tr('Réafficher')}"), 'la ligne grisée dit « en option », son bouton « Ajouter »');
  assert.ok(d.includes('if (cache && !editMode) return null;'), 'hors édition, rien — pas même une place');
});

test('le style se choisit en édition, sur sa propre ligne', () => {
  const d = bloc(app, 'function Dashboard(', NL + 'function ');
  assert.ok(d.includes('{editMode && STYLES_WIDGETS[id] && (') && d.includes('onClick={() => choisirStyle(id, st)} aria-pressed={on}'), 'deux puces, l’active marquée');
  assert.ok(d.includes('const choisirStyle = (id, style) => saveGrille({ styles: { ...(grille.styles || {}), [id]: style } });'));
  assert.ok(d.includes("heure: <HorlogeRail style={styleDe(grille.styles, 'heure')} hass={dashHass} />,"));
  assert.ok(!d.includes('CalendrierRail') && !d.includes('FeuilleVilles'), 'le widget retiré ne laisse ni rendu ni feuille derrière lui');
});

test('le dessin : les surfaces du rail, rien sans source, l’heure calée sur la seconde', () => {
  assert.ok(lire('src', 'styles.js').includes("background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)'") && vue.includes("import { CARTE_RAIL, petitesCapitales } from './styles.js';"), 'la surface des autres cartes du rail, partagee depuis styles.js');
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(vue), 'aucune couleur en dur : une capture venue d’ailleurs donne une disposition, pas une palette');
  assert.ok(vue.includes('{(mode || temp) && ('), 'pas de météo : pas de ligne sous les aiguilles');
  assert.ok(vue.includes('pas - (Date.now() % pas)'), 'le premier battement tombe sur la seconde ronde');
  assert.ok(vue.includes('stroke="var(--o-accent)"') && vue.includes("transform={'rotate(' + a.secondes + ')'}"), 'la trotteuse à l’accent du thème');
  for (const r of ['.o-w-temps { container-type: inline-size; }', '.o-w-tuile-chiffre { font-size: clamp(30px, 15.5cqw, 54px); }']) {
    assert.ok(css.includes(r), r + ' manque à index.css');
  }
  // Le calendrier parti, ses règles le suivent (lot 15 de l'audit du 03/10).
  for (const r of ['.o-w-mois-heure', '.o-w-pm', '.o-w-j1', '.o-w-j3', '.o-w-ville']) assert.ok(!css.includes(r), r + ' : une règle pour un widget retiré');
});
