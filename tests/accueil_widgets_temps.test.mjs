// v3.42.0 (ADR 0041) — « sur le côté à l'accueil voici d'autres widgets que l'on
// pourrait mettre, pour l'heure 2 styles, calendrier également » (17/09).
// Deux widgets EN OPTION dans le rail : l'heure (aiguilles · tuiles) et le
// calendrier (semaine · mois). Ce qui se calcule est testé à sec ; le
// branchement dans l'Accueil est relu dans les sources.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const {
  WIDGETS_OPTION, STYLES_WIDGETS, styleDe, villesDe, villesDefaut, VILLES_MAX, fuseauValide, chiffresHeure,
  anglesAiguilles, heureVille, premierJourSemaine, semaineDe, grilleMois, prochainSoleil, resumeAgendaDuJour,
} = await import('../src/horloge.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const vue = lire('src', 'widgetsrail.jsx');
const css = lire('src', 'index.css');
const en = lire('src', 'langues', 'en.js');
const NL = String.fromCharCode(10);
const bloc = (src, debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const jours = (liste) => liste.map(c => c.date.getDate());

test('deux widgets en option, deux styles chacun ; un style inconnu retombe sur le premier', () => {
  assert.deepEqual(WIDGETS_OPTION, ['heure', 'calendrier', 'co2'], 'le CO₂ les a rejoints en v3.46.0 (ADR 0044)');
  // L'heure en tuiles d'abord : la capture du 19/09 (« par défaut »).
  assert.deepEqual(STYLES_WIDGETS, { heure: ['tuiles', 'aiguilles'], calendrier: ['semaine', 'mois'] });
  assert.equal(styleDe({ heure: 'tuiles' }, 'heure'), 'tuiles');
  assert.equal(styleDe({ heure: 'tuiles' }, 'calendrier'), 'semaine', 'le style d’un widget ne vaut pas pour l’autre');
  assert.equal(styleDe({ calendrier: 'mois' }, 'calendrier'), 'mois');
  assert.equal(styleDe({ heure: 'aiguilles' }, 'heure'), 'aiguilles');
  assert.equal(styleDe({ heure: 'neon' }, 'heure'), 'tuiles', 'un style d’une version future, ou une faute de frappe');
  assert.equal(styleDe(null, 'heure'), 'tuiles');
  assert.equal(styleDe('aiguilles', 'heure'), 'tuiles', 'pas un objet : pas un choix');
  assert.equal(styleDe({}, 'meteo'), null, 'une section sans style n’en a pas');
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

test('l’heure d’ailleurs : lue dans le fuseau, jamais inventée', () => {
  const t = new Date(Date.UTC(2026, 8, 17, 16, 10, 0)); // 18 h 10 à Paris : l'heure de la capture
  assert.equal(heureVille(t, 'America/New_York'), '12:10');
  assert.equal(heureVille(t, 'Asia/Tokyo'), '01:10');
  assert.equal(heureVille(t, 'Europe/London'), '17:10');
  assert.equal(heureVille(t, 'Australia/Sydney'), '02:10');
  assert.equal(heureVille(new Date(Date.UTC(2026, 8, 17, 22, 0, 0)), 'Europe/Paris'), '00:00', 'minuit s’écrit 00:00, pas 24:00');
  assert.equal(heureVille(t, 'America/New_York', 'en-US'), '12:10', 'vingt-quatre heures, même pour une langue qui compte en douze');
  assert.equal(heureVille(new Date(Date.UTC(2026, 8, 17, 20, 5, 0)), 'America/New_York', 'en-US'), '16:05', '… l’après-midi aussi');
  assert.equal(heureVille(t, 'Mars/Olympus'), null, 'un fuseau inconnu ne donne pas d’heure');
  assert.equal(heureVille(t, ''), null);
  assert.equal(fuseauValide('Europe/Paris'), true);
  assert.equal(fuseauValide('Paris'), false);
  assert.equal(fuseauValide(null), false);
});

test('les villes : quatre au départ, une liste vide reste vide, une ligne fausse disparaît', () => {
  assert.deepEqual(villesDefaut().map(v => v.fuseau), ['America/New_York', 'Asia/Tokyo', 'Europe/London', 'Australia/Sydney'], 'celles de la capture');
  assert.deepEqual(villesDe(null), villesDefaut(), 'jamais réglées');
  assert.deepEqual(villesDe(undefined), villesDefaut());
  assert.deepEqual(villesDe([]), [], 'on a le droit de n’en vouloir aucune');
  assert.deepEqual(villesDe([{ nom: ' Montréal ', fuseau: 'America/Toronto' }, { nom: 'Nulle part', fuseau: 'Ici/Ailleurs' }, null, { nom: '', fuseau: 'America/Sao_Paulo' }]),
    [{ nom: 'Montréal', fuseau: 'America/Toronto' }, { nom: 'Sao Paulo', fuseau: 'America/Sao_Paulo' }], 'le nom se nettoie ; sans nom, la ville du fuseau ; un fuseau faux ne s’affiche pas');
  const six = Array.from({ length: 6 }, (_, i) => ({ nom: 'V' + i, fuseau: 'Europe/Paris' }));
  assert.equal(villesDe(six).length, VILLES_MAX);
  assert.equal(VILLES_MAX, 4);
});

test('la semaine commence le jour que la langue dit — lundi sans réponse du moteur', () => {
  assert.equal(premierJourSemaine('fr-FR', () => 1), 1);
  assert.equal(premierJourSemaine('en-US', () => 7), 7);
  assert.equal(premierJourSemaine('xx', () => null), 1);
  assert.equal(premierJourSemaine('xx', () => 9), 1, 'une réponse hors de 1…7 ne compte pas');
  assert.equal(premierJourSemaine('xx', () => 0), 1);
  const jeudi = new Date(2026, 8, 17, 18, 10);
  const s = semaineDe(jeudi, 1);
  assert.deepEqual(jours(s), [14, 15, 16, 17, 18, 19, 20], 'lundi 14 → dimanche 20, comme la capture');
  assert.deepEqual(s.filter(c => c.aujourdhui).map(c => c.date.getDate()), [17]);
  assert.equal(s[0].date.getHours(), 0, 'des jours entiers');
  assert.deepEqual(jours(semaineDe(jeudi, 7)), [13, 14, 15, 16, 17, 18, 19], 'dimanche d’abord');
  assert.deepEqual(jours(semaineDe(new Date(2026, 8, 20), 1)), [14, 15, 16, 17, 18, 19, 20], 'un dimanche ferme sa semaine');
  assert.deepEqual(jours(semaineDe(new Date(2026, 8, 20), 7)), [20, 21, 22, 23, 24, 25, 26], '… ou l’ouvre');
  assert.deepEqual(jours(semaineDe(new Date(2026, 9, 1), 1)), [28, 29, 30, 1, 2, 3, 4], 'à cheval sur deux mois');
});

test('la grille du mois : des semaines entières, quatre à six rangées, les voisins marqués', () => {
  const g = grilleMois(new Date(2026, 8, 17), 1);
  assert.equal(g.length, 5, 'septembre 2026 : cinq rangées, comme la capture');
  assert.deepEqual(jours(g[0]), [31, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(jours(g[4]), [28, 29, 30, 1, 2, 3, 4]);
  assert.deepEqual(g[0].map(c => c.horsMois), [true, false, false, false, false, false, false]);
  assert.deepEqual(g[4].map(c => c.horsMois), [false, false, false, true, true, true, true]);
  assert.deepEqual(g.flat().filter(c => c.aujourdhui).map(c => c.date.getDate()), [17], 'un seul aujourd’hui');
  assert.ok(g.every(r => r.length === 7));
  assert.equal(grilleMois(new Date(2027, 1, 10), 1).length, 4, 'février 2027 commence un lundi : quatre rangées, pas une de plus');
  assert.equal(grilleMois(new Date(2026, 7, 10), 1).length, 6, 'août 2026 : six rangées');
  assert.deepEqual(jours(grilleMois(new Date(2026, 10, 15), 1)[0]), [26, 27, 28, 29, 30, 31, 1], 'novembre 2026 commence un dimanche : le 1er ferme la première rangée, il ne se perd pas');
  assert.deepEqual(jours(grilleMois(new Date(2026, 8, 17), 7)[0]), [30, 31, 1, 2, 3, 4, 5], 'dimanche d’abord');
  assert.deepEqual(grilleMois(new Date(2026, 8, 30), 1).flat().filter(c => c.aujourdhui).map(c => c.date.getDate()), [30], 'le dernier jour du mois, dans la rangée qu’il partage avec octobre');
  assert.deepEqual(grilleMois(new Date(2026, 9, 1), 1).flat().filter(c => c.aujourdhui).map(c => c.horsMois), [false], 'le 1er novembre, en bas de la grille d’octobre, n’est pas « aujourd’hui » le 1er octobre');
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

test('la tuile Agenda : rien, ou le prochain d’aujourd’hui et combien d’autres', () => {
  assert.deepEqual(resumeAgendaDuJour([]), { n: 0, prochain: null, autres: 0 });
  assert.deepEqual(resumeAgendaDuJour(null), { n: 0, prochain: null, autres: 0 });
  const a = { summary: 'Dentiste' }, b = { summary: 'Colis' }, c = { summary: 'Tard' };
  assert.deepEqual(resumeAgendaDuJour([a]), { n: 1, prochain: a, autres: 0 });
  assert.deepEqual(resumeAgendaDuJour([a, b, c]), { n: 3, prochain: a, autres: 2 });
});

test('l’Accueil : des sections en option, présentes par défaut, que la croix retire', () => {
  assert.ok(app.includes("const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'calendrier', 'rappels', 'agenda'];"), 'l’heure juste sous « À surveiller », le CO₂ après la météo, le calendrier après En ce moment (19/09)');
  assert.ok(app.includes("heure: tr('Heure'), calendrier: tr('Calendrier'), co2: 'CO₂' });"), 'leurs noms en édition');
  const d = bloc(app, 'function Dashboard(', NL + 'function ');
  assert.ok(d.includes("ajoutees: Array.isArray(v.ajoutees) ? v.ajoutees : [...ACC_AJOUTEES_DEFAUT], styles: (v.styles && typeof v.styles === 'object') ? v.styles : {}, villes: Array.isArray(v.villes) ? v.villes : null,"), 'l’agencement relu garde les ajouts, les styles et les villes — sinon ils se perdaient au rechargement');
  assert.ok(d.includes('const estOption = (id) => WIDGETS_OPTION.indexOf(id) >= 0;'));
  assert.ok(d.includes("const cache = estOption(id) ? (grille.ajoutees || []).indexOf(id) < 0 : (grille.caches || []).map(s => ACC_RENOMME[s] || s).indexOf(id) >= 0;"), 'un widget en option n’est là que s’il est ajouté (par défaut, il l’est) ; un vieux masquage « calendrier » ne le concerne pas');
  assert.ok(d.includes("? saveGrille({ ajoutees: [...(grille.ajoutees || []).filter(x => x !== id), id] })") && d.includes("? saveGrille({ ajoutees: (grille.ajoutees || []).filter(x => x !== id) })"), 'ajouter et retirer passent par la grille du FORMAT en cours');
  assert.ok(d.includes("{estOption(id) ? tr('en option') : tr('masquée')}") && d.includes("{estOption(id) ? tr('Ajouter') : tr('Réafficher')}"), 'la ligne grisée dit « en option », son bouton « Ajouter »');
  assert.ok(d.includes('if (cache && !editMode) return null;'), 'hors édition, rien — pas même une place');
});

test('le style se choisit en édition, sur sa propre ligne ; les villes par le globe du mois', () => {
  const d = bloc(app, 'function Dashboard(', NL + 'function ');
  assert.ok(d.includes('{editMode && STYLES_WIDGETS[id] && (') && d.includes('onClick={() => choisirStyle(id, st)} aria-pressed={on}'), 'deux puces, l’active marquée');
  assert.ok(d.includes('const choisirStyle = (id, style) => saveGrille({ styles: { ...(grille.styles || {}), [id]: style } });'));
  assert.ok(d.includes("{id === 'calendrier' && styleDe(grille.styles, id) === 'mois' && ("), 'le globe n’existe que pour le mois');
  assert.ok(d.includes("heure: <HorlogeRail style={styleDe(grille.styles, 'heure')} hass={dashHass} />,"));
  /* `evenements={aVenir}` s'est ajoute le 25/09 (ADR 0041, ses « non faits ») :
   * la bande des sept jours, pour poser un point sous ceux qui portent un
   * rendez-vous et pouvoir en choisir un. `evenementsJour` reste le jour
   * courant — c'est ce que la tuile Agenda montre par defaut. */
  assert.ok(d.includes("calendrier: <CalendrierRail style={styleDe(grille.styles, 'calendrier')} hass={dashHass} calId={calRailId} evenementsJour={evenementsDuJour(aVenir, maintenantAg)} evenements={aVenir} villes={grille.villes} onOpen={dc.ouvrir} />,"), 'les villes passent BRUTES : validées dans le widget, une fois par changement');
  assert.ok(d.includes('{villesOuvertes && <FeuilleVilles villes={villesDe(grille.villes)} onEnregistrer={(v) => saveGrille({ villes: v })} onClose={() => setVillesOuvertes(false)} />}'));
});

test('le dessin : les surfaces du rail, rien sans source, l’heure calée sur la seconde', () => {
  assert.ok(lire('src', 'styles.js').includes("background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)'") && vue.includes("import { CARTE_RAIL, petitesCapitales } from './styles.js';"), 'la surface des autres cartes du rail, partagee depuis styles.js');
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(vue.replace("color: '#06121f'", '')), 'aucune couleur en dur : une capture venue d’ailleurs donne une disposition, pas une palette');
  assert.ok(vue.includes("background: 'rgba(var(--o-accent-rgb),.14)'"), 'le panneau teinté de la capture devient un lavis de l’accent');
  assert.ok(vue.includes('if (calId) tuiles.push(') && vue.includes('if (soleil) tuiles.push('), 'pas de calendrier : pas de tuile Agenda ; pas de soleil : pas de tuile');
  assert.ok(vue.includes('{(mode || temp) && ('), 'pas de météo : pas de ligne sous les aiguilles');
  assert.ok(vue.includes('pas - (Date.now() % pas)'), 'le premier battement tombe sur la seconde ronde');
  assert.ok(vue.includes('const liste = useMemo(() => villesDe(villes), [villes]);'));
  assert.ok(vue.includes("stroke=\"var(--o-accent)\"") && vue.includes("transform={'rotate(' + a.secondes + ')'}"), 'la trotteuse à l’accent du thème');
  for (const r of ['.o-w-temps { container-type: inline-size; }', '.o-w-tuile-chiffre { font-size: clamp(30px, 15.5cqw, 54px); }', '@container (max-width: 290px) {', '.o-w-pm { width: 20px; height: 20px; font-size: 11px !important; }']) {
    assert.ok(css.includes(r), r + ' manque à index.css');
  }
});
