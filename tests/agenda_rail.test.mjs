// Une carte agenda a la place de deux (16/09, ADR 0032, etape 5 de la
// refonte) : la date, la bande des sept prochains jours, ce qui vient.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JOURS_AGENDA, cleJour, jourDeCle, moisPlus, debutDe, finDe, plageSemaine, joursAgenda, toucheJour, traverseJour, bornesDuJour, comptesParJour, evenementsDuJour,
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
   * un passe par `trN`, qui prend ses deux gabarits.
   *
   * Le troisieme — « JEUDI 8 OCTOBRE · 2 evenements », en tete de la grille
   * d'heures du telephone — a disparu le 08/10 avec cette grille : la feuille
   * LISTE desormais ses evenements, et un compte au-dessus de la liste qui les
   * montre ne disait rien de plus. Les deux qui restent annoncent ce qu'on ne
   * voit PAS, et gardent donc leur singulier. */
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

test('« Mes agendas » liste les agendas de la MAISON, pas ceux qui ont un rendez-vous (08/10)', () => {
  /* « Pourquoi dans le calendrier j'en ai qu'un seul alors que sur HAOS j'en
   * ai 4 ? » Il en avait bien quatre, et Loggia les lisait tous — la liste se
   * construisait a partir des EVENEMENTS trouves :
   *
   *   planning_guillaume : 5 rendez-vous cette semaine-la -> affiche
   *   maison             : 2 rendez-vous, aucun en octobre -> absent
   *   collectes, rappels : vides, pas meme un fichier       -> jamais affiches
   *
   * Un agenda vide sur la periode n'existait donc pas, et un agenda toujours
   * vide n'existait jamais : impossible de savoir qu'il est la, impossible de
   * le cocher ou de le decocher. La liste part desormais des entites. */
  const rail = readFileSync(join(RACINE, 'src', 'agendarail.jsx'), 'utf8');
  assert.ok(rail.includes('function calendriersDeLaMaison(hass)'), 'la liste ne part plus des entites de la maison');
  assert.ok(rail.includes("return Object.keys(S).filter(id => id.indexOf('calendar.') === 0);"),
    'les agendas ne se cherchent plus parmi les `calendar.*`');
  const cals = rail.slice(rail.indexOf('const cals = useMemo('), rail.indexOf('const [eteints,'));
  assert.ok(cals.includes('for (const id of calendriersDeLaMaison(hass))'),
    'la liste se reconstruit a partir des seuls evenements : un agenda vide redevient invisible');
  /* Un agenda qui porte un evenement sans plus figurer dans les etats garde sa
   * ligne, sinon ses rendez-vous resteraient a l'ecran sans moyen de les
   * eteindre. */
  assert.ok(cals.includes('if (!m.has(id)) m.set(id,'), 'un agenda disparu des etats perdrait sa case, ses rendez-vous restant affiches');
  // Le nom se demande par l'ID : un agenda vide n'a aucun evenement a presenter.
  assert.ok(rail.includes('function nomDuCalendrier(id, hass)'), 'le nom se redemande a un evenement, qu’un agenda vide n’a pas');

  /* La demonstration doit porter le cas, sinon elle ne peut pas le montrer :
   * aucun de ses agendas n'etait vide. */
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(demo.includes("states['calendar.anniversaires']"), 'la demonstration n’a plus d’agenda vide');
  assert.ok(demo.includes("if (id === 'calendar.anniversaires') return [];"), 'l’agenda vide de la demonstration s’est rempli');
});

test('la feuille d’agenda : jours fixes, rien de rogné, le fond ne suit plus (08/10)', () => {
  /* Quatre reproches sur une meme capture :
   *
   *   « Les jours en haut doivent etre fixes quand je descends, et non
   *     caches » — l'en-tete defilait avec la grille.
   *   « C'est rogne » — la fiche d'un evenement s'ouvrait TOUJOURS a droite :
   *     sur les derniers jours de la semaine elle sortait 244 px hors de la
   *     feuille, qui se mettait a defiler horizontalement.
   *   « Quand je suis sur le planning l'arriere-plan suit aussi le mouvement,
   *     c'est penible » — arrive en bout de course, le navigateur passait la
   *     molette a la page derriere la feuille.
   *   « L'affichage ne me plait pas trop » (captures de Google Agenda) —
   *     grosses tuiles de jour, colonnes espacees en sept cartes, evenements
   *     en fond translucide. */
  const rail = readFileSync(join(RACINE, 'src', 'agendarail.jsx'), 'utf8');

  // Les jours restent en haut, sur un fond opaque — sinon les heures passent au travers.
  assert.ok(rail.includes("position: 'sticky', top: 0, zIndex: 5, background: 'var(--o-bg2)'"),
    'l’en-tete des jours redefile avec la grille');

  // La fiche s'ouvre du cote ou il y a de la place.
  assert.ok(rail.includes('function FicheEvenement({ e, hass, onFermer, aGauche = false })'), 'la fiche n’a plus de cote');
  assert.ok(rail.includes("...(aGauche ? { right: '100%', marginRight: 8 } : { left: '100%', marginLeft: 8 })"),
    'la fiche s’ouvre de nouveau toujours a droite : elle sortira du cadre');
  assert.ok(rail.includes('const ficheAGauche = i > (colonnes.length - 1) / 2;'), 'le choix du cote a disparu');
  assert.ok(rail.includes('aGauche={ficheAGauche}'), 'le cote ne se transmet plus a la fiche');

  // Le defilement s'arrete dans la feuille, aux deux formats.
  const contain = rail.match(/overscrollBehavior: 'contain'/g) || [];
  assert.equal(contain.length, 2, 'les deux feuilles doivent retenir le defilement, pas une seule');

  /* L'allure : jour en petit au-dessus, chiffre dans une pastille RONDE,
   * colonnes jointives separees d'un trait, evenements en blocs pleins. */
  assert.ok(rail.includes("width: 38, height: 38, borderRadius: '50%'"), 'le chiffre du jour a reperdu sa pastille ronde');
  assert.ok(!/gridTemplateColumns: '56px ' \+ cols, gap: 6/.test(rail), 'les colonnes se reecartent en sept cartes');
  assert.ok(rail.includes("borderLeft: '1px solid var(--o-bd3)'"), 'les colonnes n’ont plus leur trait de separation');
  assert.ok(rail.includes("background: 'rgba(' + e.rgb + ',.92)', color: '#fff'"), 'les evenements repassent en fond translucide');
});

test('un poste de nuit s’étend sur les deux jours, et son titre ne se coupe pas (08/10)', () => {
  /* « Regarde ça va pas, c'est coupé », sur deux captures : un bloc orange ou
   * il ne restait du titre que le bas des lettres, et un « 21:30 - 05:39 »
   * ecrase dans un rectangle minuscule.
   *
   * Trois causes, pas une :
   *
   *   1. La grille allait de 6 h a 23 h. Un poste de nuit n'avait NULLE PART
   *      ou se dessiner le matin, et se faisait couper le soir a 23 h.
   *   2. `toucheJour` ne rend un rendez-vous qu'a son jour de DEBUT — ce qui
   *      est juste pour la carte du rail, qui ne doit pas l'annoncer deux
   *      fois, mais faux pour une grille, qui montre du temps.
   *   3. La fin, ramenee au meme jour, tombait AVANT le debut : `haut(fin)`
   *      valait 0, et la hauteur retombait sur son plancher de 30 px — trop
   *      court pour deux lignes, qui se compressaient et debordaient de leur
   *      propre boite. */
  const nuit = { summary: 'Poste de nuit', start: { dateTime: iso(2026, 8, 16, 21, 30) }, end: { dateTime: iso(2026, 8, 17, 5, 39) } };

  // `toucheJour` ne change pas : le rail garde sa regle du jour de debut.
  assert.equal(toucheJour(nuit, new Date(2026, 8, 17)), false, 'le rail annoncerait le poste de nuit deux fois');

  // `traverseJour`, lui, rend les DEUX jours.
  assert.equal(traverseJour(nuit, new Date(2026, 8, 16)), true, 'le soir du poste de nuit a disparu');
  assert.equal(traverseJour(nuit, new Date(2026, 8, 17)), true, 'le matin du poste de nuit a disparu');
  assert.equal(traverseJour(nuit, new Date(2026, 8, 18)), false, 'le poste de nuit deborde d’un jour de trop');

  // Et `bornesDuJour` le borne a chaque journee.
  const soir = bornesDuJour(nuit, new Date(2026, 8, 16));
  assert.equal(soir.debut, 21.5, 'le soir ne commence plus a son heure');
  assert.equal(soir.fin, 24, 'le soir ne court plus jusqu’a minuit');
  const matin = bornesDuJour(nuit, new Date(2026, 8, 17));
  assert.equal(matin.debut, 0, 'le matin ne part plus de minuit');
  assert.ok(Math.abs(matin.fin - 5.65) < 0.01, 'le matin ne s’arrete plus a l’heure de fin');

  const rail = readFileSync(join(RACINE, 'src', 'agendarail.jsx'), 'utf8');
  // La grille couvre les 24 heures, et s'ouvre sur une heure utile.
  assert.ok(/const H0 = 0;/.test(rail) && /const H1 = 24;/.test(rail), 'la grille se rogne de nouveau sur la journee de bureau');
  assert.ok(rail.includes('const HEURE_OUVERTURE = 7;'), 'la grille s’ouvrira sur minuit');
  assert.ok(rail.includes('zone.current.scrollTop = h * PAS_H;'), 'le placement a l’ouverture a disparu');
  assert.ok(rail.includes('if (placee.current || vue === \'mois\' || !zone.current) return;'),
    'le placement se referait a chaque rendu, annulant le geste de qui lit');

  // Le bloc tient sur ses bornes, et jamais moins que son texte.
  assert.ok(rail.includes('const deuxLignes = h >= 40;'), 'le seuil des deux lignes a disparu : le texte se recoupera');
  assert.ok(rail.includes("flexShrink: 0, fontSize: 12"), 'le titre peut de nouveau se comprimer hors de sa boite');
  assert.ok(rail.includes('{deuxLignes && <span'), 'l’heure s’affiche de nouveau dans un bloc trop court');

  /* Les journees entieres ont leur BANDE au-dessus des heures : posees dans
   * la grille a l'heure zero, elles recouvraient le debut d'un poste de
   * nuit. Au telephone il n'y a pas de bande, elles restent dans la grille. */
  assert.ok(rail.includes("const parJour = colonnes.map(d => (evts || []).filter(e => traverseJour(e, d) && e.start && e.start.date && !e.start.dateTime)"),
    'la bande des journees entieres a disparu');
  assert.ok(rail.includes('.filter(e => compacte || !(e.start && e.start.date && !e.start.dateTime))'),
    'les journees entieres se redessinent dans la grille, par-dessus les heures');

  // La demonstration porte le cas, sinon elle ne peut ni le montrer ni le proteger.
  const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
  assert.ok(demo.includes("uid: 'demo-nuit'"), 'la demonstration n’a plus de poste de nuit');
  assert.ok(demo.includes('hm(0, 21, 30)') && demo.includes('hm(1, 5, 39)'), 'le poste de nuit ne franchit plus minuit');
});
