// Une carte agenda a la place de deux (16/09, ADR 0032, etape 5 de la
// refonte) : la date, la bande des sept prochains jours, ce qui vient.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JOURS_AGENDA, cleJour, jourDeCle, moisPlus, debutDe, finDe, plageSemaine, joursAgenda, toucheJour, comptesParJour, evenementsDuJour,
} from '../src/agenda.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

// Le 16 septembre 2026 a 17 h, heure locale : les dates de test sont locales,
// les `dateTime` passent par toISOString — le meme instant, quel que soit le
// fuseau de la machine qui teste.
const AUJ = new Date(2026, 8, 16, 17, 0, 0);
const iso = (y, m, d, h, mi = 0) => new Date(y, m, d, h, mi).toISOString();
const jourDe = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const colis = { summary: 'Livraison colis', start: { dateTime: iso(2026, 8, 16, 16) }, end: { dateTime: iso(2026, 8, 16, 17, 30) } };
const passe = { summary: 'Dentiste', start: { dateTime: iso(2026, 8, 16, 9) }, end: { dateTime: iso(2026, 8, 16, 10) } };
const poubelles = { summary: 'Poubelles', start: { date: jourDe(2026, 8, 17) }, end: { date: jourDe(2026, 8, 18) } };
const salon = { summary: 'Salon', start: { date: jourDe(2026, 8, 19) }, end: { date: jourDe(2026, 8, 21) } };
const cafe = { summary: 'Café', start: { dateTime: iso(2026, 8, 18, 10) }, end: { dateTime: iso(2026, 8, 18, 11) } };
const tard = { summary: 'Tard', start: { dateTime: iso(2026, 8, 16, 23, 30) }, end: { dateTime: iso(2026, 8, 17, 0, 30) } };

test('la cle d’un jour, le debut et la fin d’un evenement', () => {
  assert.equal(cleJour(new Date(2026, 8, 16, 23)), '2026-8-16');
  assert.equal(debutDe(colis).getTime(), new Date(2026, 8, 16, 16).getTime());
  assert.equal(debutDe(poubelles).getTime(), new Date(2026, 8, 17).getTime(), 'une journee entiere commence a minuit local');
  assert.equal(finDe(poubelles).getTime(), new Date(2026, 8, 18).getTime());
  assert.equal(finDe({ summary: 'x', start: { dateTime: iso(2026, 8, 16, 16) } }).getTime(), new Date(2026, 8, 16, 16).getTime(), 'sans fin : le debut');
  assert.equal(debutDe({ summary: 'x' }), null);
  assert.equal(debutDe({ summary: 'x', start: { date: 'hier' } }), null);
  assert.equal(debutDe(null), null);
  assert.equal(finDe({ summary: 'x', start: { dateTime: iso(2026, 8, 16, 16) }, end: { date: 'plus tard' } }).getTime(), new Date(2026, 8, 16, 16).getTime(), 'une fin illisible vaut le debut');
});

test('la plage lue et la bande des jours : d’aujourd’hui minuit, sept jours', () => {
  const p = plageSemaine(AUJ);
  assert.equal(p.debut.getTime(), new Date(2026, 8, 16).getTime());
  assert.equal(p.fin.getTime(), new Date(2026, 8, 16).getTime() + 7 * 864e5);
  const js = joursAgenda(AUJ);
  assert.equal(js.length, JOURS_AGENDA);
  assert.equal(JOURS_AGENDA, 7);
  assert.equal(cleJour(js[0]), '2026-8-16', 'aujourd’hui d’abord');
  assert.equal(js[0].getHours(), 0);
  assert.deepEqual(js.map(cleJour), ['2026-8-16', '2026-8-17', '2026-8-18', '2026-8-19', '2026-8-20', '2026-8-21', '2026-8-22']);
  assert.equal(joursAgenda(AUJ, 3).length, 3);
});

test('un evenement touche son jour : un rendez-vous le sien, une journee entiere chacun des siens', () => {
  assert.equal(toucheJour(colis, new Date(2026, 8, 16)), true);
  assert.equal(toucheJour(colis, new Date(2026, 8, 17)), false);
  assert.equal(toucheJour(tard, new Date(2026, 8, 16)), true, '23 h 30 appartient a son jour');
  assert.equal(toucheJour(tard, new Date(2026, 8, 17)), false, 'meme s’il deborde apres minuit');
  assert.equal(toucheJour({ summary: 'minuit', start: { dateTime: iso(2026, 8, 16, 0) }, end: { dateTime: iso(2026, 8, 16, 1) } }, new Date(2026, 8, 16)), true, 'minuit pile appartient au jour qui commence');
  assert.equal(toucheJour({ summary: 'minuit', start: { dateTime: iso(2026, 8, 17, 0) }, end: { dateTime: iso(2026, 8, 17, 1) } }, new Date(2026, 8, 16)), false, '… et pas au jour qui finit');
  assert.equal(toucheJour(poubelles, new Date(2026, 8, 17)), true);
  assert.equal(toucheJour(poubelles, new Date(2026, 8, 18)), false, 'la fin d’une journee entiere est exclue');
  assert.equal(toucheJour(salon, new Date(2026, 8, 19)), true);
  assert.equal(toucheJour(salon, new Date(2026, 8, 20)), true, 'deux jours : les deux');
  assert.equal(toucheJour(salon, new Date(2026, 8, 21)), false);
  assert.equal(toucheJour(salon, new Date(2026, 8, 18)), false);
  assert.equal(toucheJour({ summary: 'x' }, new Date(2026, 8, 16)), false);
});

test('les comptes par jour de la bande', () => {
  const c = comptesParJour([colis, passe, poubelles, salon, cafe, tard], joursAgenda(AUJ));
  assert.deepEqual(c, { '2026-8-16': 3, '2026-8-17': 1, '2026-8-18': 1, '2026-8-19': 1, '2026-8-20': 1, '2026-8-21': 0, '2026-8-22': 0 });
  assert.deepEqual(comptesParJour([], joursAgenda(AUJ, 2)), { '2026-8-16': 0, '2026-8-17': 0 });
  assert.deepEqual(comptesParJour(null, null), {});
});

test('les evenements d’un jour, dans l’ordre', () => {
  assert.deepEqual(evenementsDuJour([tard, salon, passe, colis], new Date(2026, 8, 16)).map(e => e.summary), ['Dentiste', 'Livraison colis', 'Tard']);
  assert.deepEqual(evenementsDuJour([tard, salon, passe, colis], new Date(2026, 8, 20)).map(e => e.summary), ['Salon']);
  assert.deepEqual(evenementsDuJour([tard, salon], new Date(2026, 8, 22)), []);
});

test('le rail : UNE carte Agenda a la place de deux (02/10)', () => {
  /* Deux cartes disaient la MEME semaine, chacune a moitie : « Calendrier »
   * dessinait les jours sans leurs evenements, « Agenda » listait les
   * evenements sans leurs jours. La maquette du 02/10 les reunit, et une
   * feuille montre la semaine en heures ou le mois en grille.
   *
   * Le widget calendrier n'est pas supprime pour autant : il quitte les
   * presents par defaut, reste ajoutable, et garde son mois et ses villes. */
  assert.ok(src.includes("import { CarteAgenda, FeuilleAgenda } from './agendarail.jsx';"),
    'la carte et la feuille viennent de leur propre fichier');
  assert.ok(src.includes("const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'rappels', 'agenda'];"),
    'le calendrier reste une section connue du rail, donc ajoutable');

  const d = bloc('function Dashboard(', NL + '}');
  assert.ok(d.includes('const agenda = useAgenda(accueil && accueil.hass, null, plageAgenda);')
    && d.includes('const plageCourte = useMemo(() => plageSemaine(new Date(jourAuj)), [jourAuj]);'),
    'sept jours pour la carte du rail, d’aujourd’hui minuit');
  /* La feuille peut demander PLUS : sa vue Mois a besoin du mois entier, sinon
   * ses cases sortent vides — le rail n'en charge que sept jours. */
  assert.ok(d.includes('const plageAgenda = plageDemandee || plageCourte;'),
    'la feuille doit pouvoir elargir la plage');
  assert.ok(d.includes('onPlage={setPlageDemandee}'), 'et la feuille doit pouvoir la demander');
  assert.ok(d.includes('const [jourChoisi, setJourChoisi] = useState(null);'), 'un jour se choisit');
  assert.ok(d.includes('const [agendaOuvert, setAgendaOuvert] = useState(false);'), 'la feuille a son etat');
  assert.ok(d.includes('<CarteAgenda hass={dashHass} evenements={agenda || []} jourChoisi={jourChoisi}'),
    'la carte recoit les evenements et le jour choisi');
  assert.ok(d.includes('onOuvrir={() => setAgendaOuvert(true)} lever={leverAg} />'),
    'le bouton ouvre la feuille, et la pastille doree porte le prochain soleil');
  assert.ok(d.includes('moment: railMoment, rappels: railRappels, agenda: railAgenda,'),
    'la carte occupe la section « agenda » du rail');
  assert.ok(src.includes('{agendaOuvert && ('), 'la feuille se monte quand on l’ouvre');

  /* Le prochain lever ou coucher n'est pas invente : sans `sun.sun`, pas de
   * pastille. C'est la regle de tout le rail — rien sans source. */
  assert.ok(d.includes("const solAg = prochainSoleil(etatsAcc && etatsAcc['sun.sun'], maintenantAg);"),
    'le soleil vient de l’entite, ou rien');

  const o = bloc('  const ordreDe = (zone) => {', NL + '  };');
  assert.ok(o.includes('.filter(s => base.indexOf(s) >= 0)'),
    'un ordre enregistre avec une section inconnue l’ignore simplement');
});

test('la carte Agenda : la bande porte ses points, la feuille a ses deux vues (02/10)', () => {
  const c = readFileSync(join(RACINE, 'src', 'agendarail.jsx'), 'utf8');

  // La bande : le jour CHOISI se remplit d'accent, AUJOURD'HUI se liseré.
  assert.ok(c.includes("background: sel ? 'var(--o-accent-fond)' : 'var(--o-s2)'"),
    'le jour choisi doit se remplir d’accent, comme toute puce choisie de Loggia');
  assert.ok(c.includes("border: (!sel && cejour) ? '1px solid var(--o-accent-soft)' : '1px solid transparent'"),
    'aujourd’hui et le jour choisi ne doivent pas se ressembler');

  /* QUATRE maquettes avaient ete fournies, pas deux : carte et feuille, pour
   * l'ordinateur ET pour le mobile. Un premier essai n'a repris que le mobile
   * et l'a servi partout. La feuille choisit donc sa maquette sur `large`. */
  assert.ok(c.includes("return large ? <FeuilleLarge {...commun} /> : <FeuilleEtroite {...commun} />;"),
    'la feuille doit choisir entre la maquette d’ordinateur et celle du telephone');
  assert.ok(c.includes("const [vue, setVue] = useState('semaine');"), 'la feuille ouvre sur la semaine');

  // Sur ordinateur : trois vues, deux colonnes, la liste des agendas.
  assert.ok(c.includes("[['mois', tr('Mois')], ['semaine', tr('Semaine')], ['jour', tr('Jour')]]"),
    'l’ordinateur a TROIS vues : mois, semaine, jour');
  assert.ok(c.includes("gridTemplateColumns: '248px minmax(0,1fr)'"), 'les deux colonnes de la maquette 1b');
  assert.ok(c.includes("tr('Mes agendas')"), 'la liste des agendas, avec ses cases a cocher');
  /* `useAgenda` marque le calendrier sous `_cal`, pas `calendar` : lire le
   * mauvais nom ne plantait rien — la teinte retombait sur la meme pour tous
   * et le nom du calendrier sortait vide. */
  assert.ok(c.includes("const calDe = (e) => (e && (e._cal || e.calendar)) || null;"),
    'le calendrier d’un evenement se lit sur `_cal`');
  assert.ok(c.includes('evts.filter(e => !eteints.has(calDe(e)'),
    'eteindre un agenda ne doit filtrer QU’A L’ECRAN, jamais chez Home Assistant');

  // Le trait de l'heure ne se dessine que dans la colonne d'aujourd'hui.
  assert.ok(c.includes("k === auj && maintenant.getHours() >= H0 && maintenant.getHours() <= H1"),
    'le trait de l’heure ne se dessine qu’aujourd’hui, et dans la plage montree — ailleurs il mentirait');

  /* Le mois ne peint QUE ce qu'on sait : Loggia ne lit que sept jours, et une
   * case vide hors de cette plage dirait « rien » alors qu'on ne sait rien. */
  /* Le mois ne se limite PLUS aux sept jours du rail : il demande sa propre
   * plage, sinon ses cases sortaient vides — « ici il n'y a pas le texte ». */
  assert.ok(c.includes('const plageMois = useMemo(() => {'), 'la vue mois calcule sa plage');
  assert.ok(c.includes("if (vue !== 'mois') { onPlage(null); return undefined; }"),
    'et la rend en repartant : la carte du rail n’a pas besoin du mois');
});

/* Quatre defauts trouves en relisant la feuille a l'ecran le 02/10 — aucun
 * n'etait visible dans les sources, tous l'etaient dans le navigateur. */
test('ce que la relecture a l’ecran a corrige', () => {
  const c = readFileSync(join(RACINE, 'src', 'agendarail.jsx'), 'utf8');

  /* 1. Un evenement sur la journee entiere empruntait tr('Journee'), la cle du
   * reglage de veille jour/nuit : elle se traduit « Daytime », « Tagsuber »,
   * « De dia » — « en journee », et non « toute la journee ». La colonne de
   * 42 px dit donc « Jour » ; « Toute la journee » reste en entier dessous. */
  assert.ok(c.includes("heure: journee ? tr('Jour') :"), 'la colonne courte ne doit pas reprendre la cle du reglage jour/nuit');
  assert.ok(!c.includes("tr('Journée')"), 'tr(\'Journée\') se traduit « en journée » : pas le sens voulu ici');
  assert.ok(c.includes("plage: journee ? tr('Toute la journée')"), 'le texte entier reste sous le titre');

  /* 2. Trois comptes ecrivaient « 1 evenements » : un compte qui peut valoir
   * un passe par `trN`, qui prend ses deux gabarits. */
  assert.ok(c.includes("trN(duJour.length, '{n} événement', '{n} événements')"), 'le compte du jour a besoin de son singulier');
  assert.ok(c.includes("trN(reste, '+{n} autre ce jour-là', '+{n} autres ce jour-là')"), '« + 1 autres ce jour-là »');
  assert.ok(c.includes("trN(duJour.length - MONTRES, '+{n} autre', '+{n} autres')"), '« + 1 autres » dans une case du mois');

  /* 3. L'en-tete des colonnes de la grille des heures ne pouvait JAMAIS
   * marquer le jour choisi : `sel` finissait par `&& false`, et la prop
   * `jourSel` que l'appelant passait n'etait meme pas declaree. */
  assert.ok(c.includes('function GrilleHeures({ colonnes, evts, hass, ouvert, setOuvert, onChoisir, jourSel = null, compacte = false })'),
    'GrilleHeures doit declarer le `jourSel` que ses deux appelants lui passent');
  assert.ok(c.includes('const sel = !!jourSel && k === cleJour(jourSel);'), 'le jour choisi se marque pour de bon');
  assert.ok(!/&&\s*false/.test(c), 'une condition qui finit par « && false » ne decide plus rien');

  /* 4. Au telephone, la barre de tete se repliait au petit bonheur : la fleche
   * « suivant » ouvrait la deuxieme ligne et la croix tombait seule sur une
   * troisieme, a gauche. Deux rangees nommees, la croix en dernier sur celle
   * du titre — « rien a faire glisser » (v3.56.2). */
  assert.ok(c.includes('if (!large) {') && c.includes("flexDirection: 'column', gap: 10, padding: '0 0 12px'"),
    'le telephone a sa propre barre, en deux rangees');
  assert.ok(!c.includes("flexWrap: large ? 'nowrap' : 'wrap'"), 'un repli automatique remet le desordre');
  /* Et « + Événement » demandait 116 px la ou il en restait 86 : au telephone
   * il se reduit a son « + », son nom porte par `aria-label`. */
  assert.ok(c.includes("{large ? tr('Événement') : null}"), 'le mot ne tient pas au telephone');
  assert.ok(c.includes("aria-label={tr('Nouvel événement')}"), '… mais le bouton garde son nom pour qui ne voit pas');
});

/* Les flèches de la feuille, « je ne peux pas faire défiler les jours et mois
 * avec les flèches » (02/10). Deux calculs à sec, et le branchement relu. */
test('les flèches : un jour, une semaine, un MOIS — et la clé se relit', () => {
  /* `cleJour` écrit « année-mois-jour », le mois comptant de 0. La feuille
   * cherchait cette clé dans les sept jours du rail : au-delà, `find` échouait
   * et le jour retombait sur aujourd'hui — les flèches n'affichaient rien. */
  assert.equal(cleJour(new Date(2026, 9, 17)), '2026-9-17');
  assert.deepEqual(jourDeCle('2026-9-17'), new Date(2026, 9, 17));
  assert.deepEqual(jourDeCle(cleJour(new Date(2027, 0, 3))), new Date(2027, 0, 3), 'un aller-retour par la clé ne perd rien');
  assert.equal(jourDeCle('2026-9-17').getHours(), 0, 'un jour entier, pas l’heure qu’il est');
  assert.equal(jourDeCle('2026-1-31'), null, 'le 31 février n’existe pas');
  assert.equal(jourDeCle('2026-9'), null);
  assert.equal(jourDeCle('hier'), null);
  assert.equal(jourDeCle(null), null);

  /* Un mois se franchit en MOIS : trente jours depuis le 31 janvier tombent en
   * mars, et février serait sauté. */
  assert.deepEqual(moisPlus(new Date(2026, 0, 31), 1), new Date(2026, 1, 28), 'le 31 janvier mène au 28 février, pas au 2 mars');
  assert.deepEqual(moisPlus(new Date(2026, 2, 31), -1), new Date(2026, 1, 28), '… et en arrière de même');
  assert.deepEqual(moisPlus(new Date(2028, 0, 31), 1), new Date(2028, 1, 29), 'une année bissextile a son 29');
  assert.deepEqual(moisPlus(new Date(2026, 11, 15), 1), new Date(2027, 0, 15), 'décembre mène à janvier de l’année suivante');
  assert.deepEqual(moisPlus(new Date(2026, 0, 15), -1), new Date(2025, 11, 15));

  const c = readFileSync(join(RACINE, 'src', 'agendarail.jsx'), 'utf8');
  assert.ok(c.includes('const jourSel = useMemo(() => jourDeCle(choisi) || base, [base, choisi]);'),
    'la feuille relit la clé au lieu de la chercher dans sept jours');
  assert.ok(c.includes("vue === 'mois' ? moisPlus(jourSel, sens) : ajoute(jourSel, sens * (vue === 'jour' ? 1 : 7))"),
    'un jour, une semaine, un mois — chacun son pas');
  /* La bande du téléphone était figée sur les sept jours à partir
   * d'aujourd'hui : elle ne bougeait pas d'un pouce, le titre non plus. */
  assert.ok(c.includes('const lundi = useMemo(() => lundiDe(jourSel), [jourSel]);'),
    'la bande du telephone suit le jour choisi, comme les sept colonnes de l’ordinateur');
  assert.ok(c.includes('const choisi = cleJour(jourSel);'),
    'la carte marque le jour qu’elle montre — pas un jour que sa bande ne porte pas');
});
