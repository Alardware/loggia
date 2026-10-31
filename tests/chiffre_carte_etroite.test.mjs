/* Le pourcentage d'une lumière et d'un volet prend la place de la température d'un radiateur
 * (retours du 15/10, ADR 0197 et 0188).
 *
 * « pourquoi le % et en haut entre l'icone et le toggle, pour le volet de la chambre aussi
 * alors que les radiateur lui c'est bien placé » : au téléphone — sous 188 px de contenu —, le
 * pourcentage d'une lumière et celui d'un volet montaient dans la ligne de la plaque, quand la
 * température d'un radiateur reste à droite de son nom. Les trois cartes ont maintenant la
 * MÊME disposition étroite, et ce fichier la tient dans les sources, sans navigateur :
 *  - la parité, règle par règle, de la feuille : le texte qui s'efface dans la grille du milieu,
 *    le nom en 13 px sur deux lignes au plus, la phrase sous les deux, le pourcentage en 20 px
 *    à 4 px du nom, les airs de 10 et 9 px ;
 *  - la rangée du milieu, la MÊME grille (`RM_MILIEU`) dans les quatre cartes, et la place du
 *    chiffre dans cette grille — première rangée, deuxième colonne ;
 *  - le budget en hauteur : 38 + 10 + 32 + 2 + 15 + 9 + 44 = 150 px, celui du radiateur ;
 *  - la phrase sur UNE ligne, de 12 à 10,5 px d'après sa longueur : rejouée sur les phrases des
 *    sept langues, mesurées dans la démo — jamais coupée quand elle tient à 10,5 px.
 * Ce que seul un navigateur dit (les 184 px, un mot coupé, la position du chiffre) a été mesuré
 * dans la démo à 390, 360 et 320 px, en français, en allemand et en polonais (ADR 0197, 0188).
 *
 * PASSE TÉLÉPHONE (sa décision du 15/10, « ok pour 1c » ; ADR 0202) : ce fichier devient celui de la
 * GRILLE COMMUNE de la carte étroite (`o-gabarit`, index.css) — un seul bloc de règles pour toutes les
 * cartes, le chiffre en haut, le nom en entier, la phrase sur une ligne, une ligne de commandes de 44 px,
 * et ce qui change de place écrit deux fois (`o-seul-large`, `o-seul-etroit`). Les cartes y sont passées
 * une à une — le volet, la lumière, le chauffage, la prise (tâches 2 à 5) — et la disposition du 15/10 au
 * matin est partie, jusque dans les commentaires (tâche 6). L'arithmétique de la phrase prend les
 * largeurs d'Objets. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = lire('src/index.css');
const APP = MONOLITHE;
const STYLES = lire('src/styles.js');
// `emChiffre` vit dans App.jsx, qui n'exporte que l'application : sous `?grille`, un crochet de chargement lui ajoute un export.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?grille')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?grille'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { emChiffre };' };",
  '}',
].join('\n')));
const { emChiffre } = await import(new URL('../src/App.jsx?grille', import.meta.url).href);

/** Le premier `@container (width < 188px) { … }` qui suit `marqueur` : ses règles, `{ sélecteur: déclarations }`. */
function reglesEtroites(marqueur) {
  const debut = CSS.indexOf(marqueur);
  assert.ok(debut >= 0, marqueur + ' a disparu');
  const i = CSS.indexOf('@container (width < 188px) {', debut);
  assert.ok(i >= 0, 'la requête de la carte étroite a disparu après ' + marqueur);
  const ouvre = CSS.indexOf('{', i) + 1;
  let j = ouvre;
  for (let prof = 1; prof; j++) prof += CSS[j] === '{' ? 1 : CSS[j] === '}' ? -1 : 0;
  const corps = CSS.slice(ouvre, j - 1);
  return Object.fromEntries([...corps.matchAll(/\n {2}([^{}\n]+?) \{ ([^}]*?) \}/g)].map(m => [m[1], m[2].trim()]));
}
// ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le bloc du chauffage est parti lui aussi ; la grille commune est la seule carte étroite.
// ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le bloc de la lumière est parti à son tour ; seul le radiateur garde le sien jusqu'à la tâche 4.
// ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le bloc du volet est parti ; la grille commune a le sien.
const GABARIT = reglesEtroites('.o-gabarit { container-type: inline-size; }');
const variables = (declarations) => Object.fromEntries([...declarations.matchAll(/(--o-[\w-]+): ([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const px = (valeur) => parseFloat(valeur);

/* ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le volet a quitté la disposition du 15/10 au matin pour la grille commune (les tests
 * « la grille commune » plus bas) ; la lumière et le radiateur la gardent jusqu'à leur tâche (3 et 4).
 * ASSERTION MODIFIÉE (passe téléphone, tâche 3) : la lumière l'a quittée à son tour — TITRE MODIFIÉ, il disait « la carte étroite d'une lumière : les règles
 * du radiateur ». Le radiateur la garde seul jusqu'à la tâche 4 ; le reste n'en garde rien.
 * ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le radiateur l'a quittée lui aussi — TITRE MODIFIÉ, il disait « le radiateur seul la garde ». Plus aucune
 * carte n'efface son texte dans la grille du milieu : le nom et la phrase de la grille commune prennent toute la largeur. */
test('la disposition du 15/10 au matin est partie : plus aucune carte n’efface son texte dans la grille du milieu, ni ne garde son bloc de requête', () => {
  for (const reste of ['.o-rmcard[data-chauffage] { container-type', '.o-rmcard[data-lumiere] { container-type', '.o-rmcard[data-volet] { container-type',
    '.o-chauffage-texte', '.o-lumiere-texte', '.o-lumiere-nom', '.o-lumiere-phrase', '.o-volet-texte', 'display: contents']) {
    assert.ok(!CSS.includes(reste), reste + ' : parti avec la disposition du 15/10 au matin');
  }
  for (const reste of ['o-chauffage-texte', 'o-lumiere-texte', 'o-volet-texte']) assert.ok(!APP.includes(reste), reste + ' : plus aucune carte ne le pose');
  // Le nom et la phrase de la grille commune : une seule écriture pour toutes les cartes.
  assert.ok(!/break-word|anywhere|word-break|hyphens/.test(GABARIT['.o-gab-nom']), 'un nom passe à la ligne entre deux mots, jamais dans un mot');
  assert.ok(!/white-space|-webkit-line-clamp|display/.test(GABARIT['.o-gab-phrase']), 'la phrase reste sur UNE ligne : le budget n’a la place que d’une');
});

// TITRE MODIFIÉ (passe téléphone, tâche 3) : il disait « le pourcentage prend la taille et l’écart de la température d’un radiateur, et les mêmes airs ».
// TITRE MODIFIÉ (passe téléphone, tâche 4) : il disait « … une carte de la grille commune le tait ; la référence du radiateur ».
test('la carte étroite tait le chiffre du bas — ni pourcentage ni température n’y ont plus de taille étroite : le chiffre du haut les remplace', () => {
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le volet écrit son pourcentage en haut, dans la grille commune — il n'a plus ces variables étroites.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : la lumière non plus — la boucle qui les comparait au radiateur est partie, et la feuille n'a plus ces valeurs.
  assert.ok(!CSS.includes('--o-chiffre-taille: 20px') && !CSS.includes('--o-chiffre-ecart: 4px'), 'plus aucune carte ne pose ces tailles étroites au chiffre du bas : elle le tait');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la température d'un radiateur non plus — la référence (20 px, « ° » en 12, à 4 px du nom) est partie avec elle.
  for (const v of ['--o-piece-taille: 20px', '--o-piece-degre: 12px', '--o-piece-ecart: 4px']) assert.ok(!CSS.includes(v), v + ' : parti');
  assert.deepEqual(variables(GABARIT['.o-gabarit > *'])['--o-milieu-haut'], '10px', 'les airs de la carte étroite restent : 10 px sous la plaque');
});

test('la rangée du milieu est celle du radiateur dans les quatre cartes, et le chiffre y prend la même place — première rangée, deuxième colonne', () => {
  assert.equal((APP.match(/<div style=\{RM_MILIEU\}>/g) || []).length, 4, 'le thermostat, le fil pilote, la lumière et le volet : la même grille');
  assert.ok(APP.includes("const RM_MILIEU = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end', marginTop: 'var(--o-milieu-haut, 14px)' };"));
  assert.ok(APP.indexOf('const RM_MILIEU') < APP.indexOf('function RoomLightCard('), 'la rangée se déclare avant les cartes qui la lisent');
  // Le chiffre : même cellule, même écart que la température, à droite du texte.
  const corps = (nom) => { const i = APP.indexOf('function ' + nom + '('); assert.ok(i >= 0, nom); return APP.slice(i, APP.indexOf('\n}\n', i)); };
  assert.ok(corps('TemperaturePiece').includes("gridColumn: 2, gridRow: 1, marginLeft: 'var(--o-piece-ecart, 10px)'"));
  for (const nom of ['ChiffreLumiere', 'ChiffreVolet']) {
    assert.ok(corps(nom).includes("gridColumn: 2, gridRow: 1, marginLeft: 'var(--o-chiffre-ecart, 10px)'"), nom + ' : la cellule de la température d’un radiateur, son écart de 10 px (4 sur une carte étroite)');
    assert.ok(corps(nom).includes("fontSize: 'var(--o-chiffre-taille, 25px)'") && corps(nom).includes("'calc(var(--o-chiffre-taille, 25px) * .6)'"), nom + ' : sa taille se lit dans la feuille, 25 px et « % » en 15 par défaut');
    assert.ok(!/haut\b/.test(corps(nom).split('\n')[0]), nom + ' : plus de variante haute');
  }
  // Le texte garde sa classe — la feuille l'efface dans la grille — et sa longueur règle la taille de la phrase.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : le texte du volet n'a plus de classe — la grille commune ne l'efface pas.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : celui de la lumière non plus.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : ni celui d'un radiateur — plus aucun texte n'a de classe à effacer.
  // ASSERTION MODIFIÉE (chantier IoT, tâche 6, 18/10 ; I5) : la carte d'un robot prend la même rangée — cinq textes.
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I5) : la carte du distributeur aussi — six textes.
  assert.equal((APP.match(/<div style=\{\{ minWidth: 0 \}\}>\n\s*<div className="o-gab-nom"/g) || []).length, 6, 'le texte des six cartes, sans classe, le nom de la grille commune en tête');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le thermostat et le fil pilote posent aussi la longueur de leur phrase — la grille commune en tire sa taille.
  // ASSERTION MODIFIÉE (chantier Médias, tâche 4 ; M5) : la carte d'un lecteur entre dans la grille commune — cinq cartes posent la longueur de leur phrase.
  // ASSERTION MODIFIÉE (chantier IoT, tâche 6, 18/10 ; I7) : la carte d'un robot aussi — six cartes.
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I7) : et celle du distributeur — sept cartes.
  assert.equal((APP.match(/'--o-n': Math\.max\(1, (v\.phrase\.texte|String\(sub\))\.length\)/g) || []).length, 7, 'la lumière, le volet, le thermostat, le fil pilote, le lecteur, le robot et le distributeur posent la longueur de leur phrase (`--o-n`)');
});

test('la carte garde ses 184 px : le budget du radiateur — 38 + 10 + 32 + 2 + 15 + 9 + 44 = 150 px de contenu — tient pour le radiateur, la lumière et le volet', () => {
  const plaque = Number(/ICONE_CARTE = \{ width: 38, height: (\d+)/.exec(STYLES)[1]);
  const airPhrase = Number(/SOUS_CARTE = \{[^}]*marginTop: (\d+)/.exec(STYLES)[1]);
  const budget = (regles, cle, nom, phrase, pied) => {
    const v = variables(regles[cle]);
    const decl = regles[nom];
    const lignes = Number(/-webkit-line-clamp: (\d+)/.exec(decl)[1]);
    const ligne = Number(/line-height: (\d+)px/.exec(decl)[1]);
    const lignePhrase = Number(/line-height: (\d+)px/.exec(regles[phrase])[1]);
    return plaque + px(v['--o-milieu-haut']) + lignes * ligne + airPhrase + lignePhrase + px(v['--o-pied-haut']) + pied;
  };
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 2, 3 et 4) : le volet, la lumière et le radiateur se comptent dans la grille commune (`o-gabarit`), et plus dans leur bloc.
   * ASSERTION MODIFIÉE (passe téléphone, corrections bis, point 5) : les trois budgets se calculaient alors sur les MÊMES arguments — la grille est une depuis que les trois
   * blocs d'avant sont partis — et n'en prouvaient pas plus qu'un seul. Le budget est VERTICAL : il ne dépend pas de la largeur de la carte (176, 161 ou 141 px), seulement
   * de la grille et de la ligne du bas de chaque carte. Il se calcule donc sur la grille, une fois par carte, avec la hauteur de SA ligne de commandes lue dans les sources :
   * les carrés − / + du radiateur (`RM_PAS`), la zone de la barre d'une lumière (`RmJauge`, `zone`), les boutons Monter / Stop / Descendre du volet (`RM_VOLET_BTN`). Une
   * ligne qui grandit fait déborder SA carte, et elle seule. */
  const hauteur = (nom, motif) => { const m = motif.exec(APP); assert.ok(m, nom + ' : introuvable dans App.jsx'); return Number(m[1]); };
  const commandes = {
    radiateur: hauteur('RM_PAS', /const RM_PAS = \{ flex: '0 0 auto', width: 'var\(--o-pas, 44px\)', height: (\d+),/),
    lumiere: hauteur('la zone de la barre d’une lumière', /zone=\{(\d+)\} marge=\{0\}/),
    volet: hauteur('RM_VOLET_BTN', /const RM_VOLET_BTN = \{ \.\.\.RM_BTN, height: (\d+),/),
  };
  const budgets = Object.fromEntries(Object.entries(commandes).map(([carte, pied]) => [carte, budget(GABARIT, '.o-gabarit > *', '.o-gab-nom', '.o-gab-phrase', pied)]));
  assert.deepEqual(budgets, { radiateur: 150, lumiere: 150, volet: 150 }, 'une carte de 184 px laisse 150 px de contenu — rembourrage (2 × 16) et liseré (2 × 1) ôtés ; 154 au téléphone');
});

/* ── La phrase sur une ligne, de 12 à 10,5 px ───────────────────────────────────────────────────
 *
 * ASSERTION MODIFIÉE (15/10) : la phrase étroite à 10,5 px. Le plancher était de 11 px ; à 320 px, « Allumée depuis hh:mm » y mesurait
 * 113,3 px — 0,3 px de trop pour les 113 px de contenu d'une carte de pièce, 2,3 pour les 111 d'Objets › Lumières (rembourrage de 14 px) —
 * et le « … » mangeait les minutes. À 10,5 px elle en prend 108,2. Les trois tests ci-dessous suivent `PLANCHER`, et les listes de
 * phrases coupées sont recalculées sur lui.
 *
 * La carte pose la longueur de sa phrase (`--o-n`) ; la feuille en tire une taille entre 12 et 10,5 px :
 * `clamp(10.5px, 100cqi / (0,58 × n), 12px)`, où 100cqi est la largeur de contenu de la carte — la phrase
 * court sur toute la largeur. 0,58 em par lettre est un MAJORANT de Manrope en 600 : une phrase de
 * `n` lettres ne dépasse jamais 0,58 × n em. Mesurées dans la démo (Manrope 600, 12 px, chiffres
 * tabulaires), les phrases de 12 lettres et plus des sept langues — l'état d'une lampe, la phrase d'un
 * volet, avec le jour le plus long de la semaine — vont de 0,43 à 0,56 em par lettre à partir de 14
 * lettres (« Sonnenschutz », 12 lettres, monte à 0,58 : il tient à toute largeur) ; les chiffres ayant
 * tous la même largeur, « 20:54 » vaut « 11:11 ». Les lignes sont `[phrase, largeur à 12 px]`. */
const PHRASES = {
  fr: [['Allumée depuis 20:54', 123.6], ['S’éteint à 20:54', 90.9], ['Indisponible depuis 20:54', 147.2], ['Indisponible', 70.2], ['En ouverture', 73.6], ['En fermeture', 74.5], ['À l’abri du vent', 82.8], ['Protection solaire', 102.1], ['Fermeture en attente', 121.3], ['Ouvre demain à 20:54', 124.4], ['Ouvre dimanche à 20:54', 138.7], ['Ouvre à 20:54', 79.7], ['Ferme demain à 20:54', 125.5], ['Ferme dimanche à 20:54', 139.8], ['Ferme à 20:54', 80.8], ['Ouvert à 60 %', 79.1]],
  en: [['On since 20:54', 85.5], ['Turns off at 20:54', 101], ['Unavailable since 20:54', 135.5], ['Sheltered from the wind', 137.3], ['Closing on hold', 88.1], ['Opens tomorrow at 20:54', 145.4], ['Opens Wednesday at 20:54', 156.3], ['Opens at 20:54', 87.4], ['Closes tomorrow at 20:54', 147.6], ['Closes Wednesday at 20:54', 158.5], ['Closes at 20:54', 89.6], ['Open to 60 %', 75.5]],
  de: [['An seit 20:54', 75.6], ['Geht um 20:54 aus', 107.8], ['Nicht erreichbar seit 20:54', 153.3], ['Nicht verfügbar', 89.2], ['Vor Wind in Sicherheit', 125.3], ['Sonnenschutz', 83.6], ['Schließen wartet', 97.3], ['Öffnet morgen um 20:54', 139.5], ['Öffnet am Donnerstag um 20:54', 182.9], ['Öffnet um 20:54', 93.3], ['Schließt morgen um 20:54', 150.7], ['Schließt am Donnerstag um 20:54', 194.1], ['Schließt um 20:54', 104.4], ['Zu 60 % offen', 77.9]],
  nl: [['Aan sinds 20:54', 91.3], ['Gaat uit om 20:54', 101.8], ['Onbereikbaar sinds 20:54', 146.6], ['Niet beschikbaar', 96.4], ['Beschut tegen de wind', 130.3], ['Sluiten wacht', 78.2], ['Gaat morgen om 20:54 open', 161.5], ['Gaat donderdag om 20:54 open', 179.9], ['Gaat om 20:54 open', 115.2], ['Gaat morgen om 20:54 dicht', 162.2], ['Gaat donderdag om 20:54 dicht', 180.7], ['Gaat om 20:54 dicht', 116]],
  it: [['Accesa da 20:54', 94.3], ['Si spegne alle 20:54', 114.8], ['Non disponibile da 20:54', 141.1], ['Non disponibile', 88.5], ['Al riparo dal vento', 102], ['Protezione dal sole', 108.8], ['Chiusura in attesa', 103.8], ['Si apre domani alle 20:54', 142.9], ['Si apre mercoledì alle 20:54', 157.3], ['Si apre alle 20:54', 98], ['Si chiude domani alle 20:54', 156.3], ['Si chiude mercoledì alle 20:54', 170.7], ['Si chiude alle 20:54', 111.4], ['Aperta al 60%', 79.4]],
  es: [['Encendido desde 20:54', 134.1], ['Se apaga a las 20:54', 116.5], ['No disponible desde 20:54', 151.8], ['No disponible', 77.9], ['A resguardo del viento', 127.6], ['Protección solar', 93.2], ['Cierre en espera', 93.9], ['Se abre mañana a las 20:54', 155.5], ['Se abre el miércoles a las 20:54', 178.5], ['Se abre a las 20:54', 107.3], ['Se cierra mañana a las 20:54', 162.6], ['Se cierra el miércoles a las 20:54', 185.6], ['Se cierra a las 20:54', 114.4], ['Abierto al 60 %', 85.2]],
  pl: [['Włączone od 20:54', 110.5], ['Wyłączy się o 20:54', 114], ['Niedostępne od 20:54', 126.8], ['Chroniona przed wiatrem', 143.8], ['Ochrona przeciwsłoneczna', 155.9], ['Zamykanie wstrzymane', 134.8], ['Otworzy się jutro o 20:54', 142.9], ['Otworzy się o 20:54 (poniedziałek)', 200.2], ['Otworzy się o 20:54', 113], ['Zamknie się jutro o 20:54', 144.2], ['Zamknie się o 20:54 (poniedziałek)', 201.4], ['Zamknie się o 20:54', 114.2], ['Otwarte na 60 %', 93.6]],
};
/* ASSERTION MODIFIÉE (passe téléphone, tâche 2) : les largeurs d'Objets, les plus serrées d'une carte au gabarit — carte de 176, 161 et 141 px (390, 360
 * et 320 px d'écran), moins 2 × 16 de rembourrage et 2 × 1 de liseré. C'étaient celles d'une pièce (rembourrage de 13 : 148, 133, 113). Une lumière a
 * 14 px de rembourrage au téléphone (`.o-light-card`) : 146, 131 et 111 px. */
const CONTENUS = { 390: 142, 360: 127, 320: 107 };
const LUMIERE_OBJETS = { 390: 146, 360: 131, 320: 111 };
// La taille minimale de la phrase, en px : le premier argument du `clamp(…)` de la feuille.
const PLANCHER = 10.5;

test('la phrase d’une carte étroite : la même règle pour la lumière et le volet, de 12 à 10,5 px d’après sa longueur', () => {
  // ASSERTION MODIFIÉE (15/10) : la phrase étroite à 10,5 px — le plancher se lisait « 11 », et `(\d+)px` ne lit pas une décimale.
  const regle = /font-size: clamp\(([\d.]+)px, calc\(100cqi \/ \(([\d.]+) \* var\(--o-n, (\d+)\)\)\), (\d+)px\) !important;/;
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : la phrase d'une lumière est celle de la grille commune.
  const [, bas, coefficient, repli, haut] = regle.exec(GABARIT['.o-gab-phrase']);
  assert.deepEqual([bas, haut, repli, coefficient], [String(PLANCHER), '12', '20', '0.58'], 'de 12 à 10,5 px, 0,58 em par lettre, repli de 20 lettres sans longueur posée');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 2) : la phrase du volet est celle de la grille commune (`o-gab-phrase`) — la même règle.
  assert.deepEqual(regle.exec(GABARIT['.o-gab-phrase']).slice(1), [bas, coefficient, repli, haut], 'la grille commune : la même');
  // `!important` : la phrase écrit déjà `fontSize: 12` en ligne, que la feuille ne battrait pas sans lui.
  assert.ok(STYLES.includes('fontSize: 12, fontWeight: 600'), 'la phrase (`SOUS_CARTE`) écrit sa taille en ligne');
});

test('la phrase : 0,58 em par lettre majore toutes les phrases mesurées — jamais plus large que la carte quand elle tient à 10,5 px', () => {
  // ASSERTION MODIFIÉE (passe téléphone, tâche 3) : le majorant se lit dans la grille commune.
  assert.equal(Number(/calc\(100cqi \/ \(([\d.]+) \* var\(--o-n/.exec(GABARIT['.o-gab-phrase'])[1]), 0.58, 'le majorant lu dans la feuille');
  let lignes = 0, maxEm = 0;
  for (const phrases of Object.values(PHRASES)) {
    for (const [phrase, largeur] of phrases) {
      lignes++;
      if (phrase.length >= 14) maxEm = Math.max(maxEm, largeur / 12 / phrase.length);
    }
  }
  assert.equal(lignes, 95);
  assert.ok(maxEm < 0.58 && maxEm > 0.55, 'la plus large des phrases de 14 lettres et plus : ' + maxEm.toFixed(3) + ' em par lettre (« Zamykanie wstrzymane »), sous le majorant');
  for (const [ecran, contenu] of Object.entries(CONTENUS)) {
    for (const [langue, phrases] of Object.entries(PHRASES)) {
      for (const [phrase, largeur] of phrases) {
        // ASSERTION MODIFIÉE (15/10) : la phrase étroite à 10,5 px — le modèle de la feuille plancher à `PLANCHER`, plus à 11.
        const taille = Math.max(PLANCHER, Math.min(12, contenu / (0.58 * phrase.length)));
        const rendue = largeur * taille / 12;
        assert.ok(taille >= PLANCHER && taille <= 12, 'la taille reste entre 10,5 et 12 px');
        if (largeur * PLANCHER / 12 <= contenu) {
          assert.ok(rendue <= contenu + 1e-9, ecran + ' px, ' + langue + ' « ' + phrase + ' » tient à 10,5 px (' + (largeur * PLANCHER / 12).toFixed(1) + ' px pour ' + contenu + '), mais la taille choisie, '
            + taille.toFixed(2) + ' px, la fait de ' + rendue.toFixed(1) + ' px : coupée alors que la réduire suffisait');
        }
      }
    }
  }
});

test('la phrase : ce qui finit encore en « … » à 10,5 px — la liste est écrite, pas devinée (français, allemand, polonais)', () => {
  /* ASSERTION MODIFIÉE (15/10) : la phrase étroite à 10,5 px. Les listes d'avant, à 11 px : à 360 px, « Indisponible depuis hh:mm » en français, quatre phrases
   * allemandes, trois polonaises ; à 320 px, six françaises (« Allumée depuis hh:mm », 0,3 px de trop, en tête), six allemandes, huit polonaises. */
  const coupees = (langue, contenu) => PHRASES[langue].filter(([, largeur]) => largeur * PLANCHER / 12 > contenu).map(([phrase]) => phrase);
  // À 390 px : aucune phrase française ; le jour le plus long d'une semaine fait encore « … » en allemand et en polonais.
  assert.deepEqual(coupees('fr', CONTENUS[390]), []);
  assert.deepEqual(coupees('de', CONTENUS[390]), ['Öffnet am Donnerstag um 20:54', 'Schließt am Donnerstag um 20:54']);
  assert.deepEqual(coupees('pl', CONTENUS[390]), ['Otworzy się o 20:54 (poniedziałek)', 'Zamknie się o 20:54 (poniedziałek)']);
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 2) : les listes se recomptent aux largeurs d'Objets (142, 127, 107 px de contenu), et non plus d'une pièce.
   * À 360 px : « Indisponible depuis hh:mm » en français ; quatre phrases allemandes ; trois polonaises. */
  assert.deepEqual(coupees('fr', CONTENUS[360]), ['Indisponible depuis 20:54']);
  assert.deepEqual(coupees('de', CONTENUS[360]), ['Nicht erreichbar seit 20:54', 'Öffnet am Donnerstag um 20:54', 'Schließt morgen um 20:54', 'Schließt am Donnerstag um 20:54']);
  assert.equal(coupees('pl', CONTENUS[360]).length, 3);
  // À 320 px : six phrases françaises, six allemandes, huit polonaises — dont le lendemain d'un volet et l'état d'une panne.
  assert.deepEqual(coupees('fr', CONTENUS[320]), ['Allumée depuis 20:54', 'Indisponible depuis 20:54', 'Ouvre demain à 20:54', 'Ouvre dimanche à 20:54', 'Ferme demain à 20:54', 'Ferme dimanche à 20:54']);
  assert.equal(coupees('de', CONTENUS[320]).length, 6);
  assert.equal(coupees('pl', CONTENUS[320]).length, 8);
  // Ce que 10,5 px ne sauve pas à 320 px : le lendemain d'un volet, en allemand et en polonais (122,1 et 125 px pour 107).
  assert.ok(coupees('de', CONTENUS[320]).includes('Öffnet morgen um 20:54') && coupees('pl', CONTENUS[320]).includes('Otworzy się jutro o 20:54'), 'le lendemain d’un volet reste coupé à 320 px, en allemand et en polonais');
  // « Allumée depuis hh:mm » est la phrase d'une LAMPE : sa carte a 111 px de contenu à 320 px (rembourrage de 14), et elle y tient.
  const allumee = PHRASES.fr[0][1] * PLANCHER / 12;
  assert.ok(allumee < LUMIERE_OBJETS[320] && LUMIERE_OBJETS[320] - allumee > 2.5, '« Allumée depuis hh:mm » : ' + allumee.toFixed(1) + ' px à 10,5 px pour ' + LUMIERE_OBJETS[320] + ' — elle tient à 320 px');
});

/* ── La grille commune (passe téléphone, tâche 2 ; ADR 0202, T4 à T8) ────────────────────────────────────────── */

/** Les règles d'un bloc de la feuille, d'un marqueur à sa fin : `@supports`, `@container (width >= 188px)`, et le bloc étroit. */
const blocGabarit = () => {
  const i = CSS.indexOf('.o-gabarit { container-type: inline-size; }');
  assert.ok(i >= 0, 'la grille commune a disparu');
  return CSS.slice(i, CSS.indexOf('\n}\n', CSS.indexOf('@container (width < 188px) {', i)) + 3);
};

test('la grille commune : la carte est le conteneur ; ce qui change de place s’écrit deux fois, et la feuille n’en montre qu’une — en `!important`, et la carte large sans requêtes de conteneur', () => {
  const bloc = blocGabarit();
  assert.ok(bloc.includes('@supports not (container-type: inline-size) { .o-seul-etroit { display: none !important; } }'), 'Safari 15 et avant : la carte large seule, jamais les deux écritures');
  assert.ok(bloc.includes('@container (width >= 188px) { .o-seul-etroit { display: none !important; } }'), 'une carte large tait l’écriture étroite');
  assert.equal(GABARIT['.o-seul-large'], 'display: none !important;', 'une carte étroite tait l’écriture large');
  assert.ok((CSS.match(/@container \(width < 188px\) \{/g) || []).length >= 1 && (CSS.match(/\.o-gabarit \{ container-type: inline-size; \}/g) || []).length === 1, 'un seul conteneur commun');
  // Les airs de la carte étroite : 10 px sous la plaque, 9 au-dessus du pied.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la carte étroite pose aussi la largeur des carrés d'un chauffage, leurs écarts et leur place (T9, T18).
  assert.deepEqual(variables(GABARIT['.o-gabarit > *']), { '--o-milieu-haut': '10px', '--o-pied-haut': '9px', '--o-pas': 'clamp(28px, calc((100cqi - 8px - max(46px, 6.2px * var(--o-mot, 0))) / 2), 44px)', '--o-pas-ecart': '4px', '--o-reserve': 'calc(2 * var(--o-pas) + 8px)' });
  // Le nom : 14 px / 600, interligne 16, deux lignes au plus, passé à la ligne entre deux mots (T7).
  assert.equal(GABARIT['.o-gab-nom'], 'font-size: 14px !important; font-weight: 600 !important; line-height: 16px; white-space: normal !important; overflow-wrap: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;');
  assert.ok(!/break-word|anywhere|word-break|hyphens/.test(bloc.replace(/\/\*[\s\S]*?\*\//g, '')), 'aucune règle de la grille ne coupe un mot');
  // La phrase : une ligne, de 12 à 10,5 px (T8) — jamais deux lignes, le budget n'en a pas la place.
  assert.equal(GABARIT['.o-gab-phrase'], 'line-height: 15px; font-size: clamp(10.5px, calc(100cqi / (0.58 * var(--o-n, 20))), 12px) !important;');
  // Le volet y est passé (tâche 2) : sa carte porte la classe, son nom et sa phrase les leurs, son petit volet et son pourcentage du bas ne s'écrivent que large.
  const volet = APP.slice(APP.indexOf('function RoomVoletCard('), APP.indexOf('\n}\n', APP.indexOf('function RoomVoletCard(')));
  for (const morceau of ["className={'o-rmcard o-gabarit' + (vue.muet ? ' o-panne' : '')}", 'className="o-gab-nom"', 'className="o-gab-phrase"', 'className="o-volet-dessin o-seul-large"',
    "<ChiffreHaut v={pos == null ? '—' : pos} u={pos == null ? null : '%'} />", 'className="o-volet-stop-mot o-seul-large"']) {
    assert.ok(volet.includes(morceau), 'la carte d’un volet : ' + morceau);
  }
  assert.ok(APP.includes('className="o-volet-chiffre o-seul-large"'), 'le pourcentage du bas : la carte large seule');
});

/* Le chiffre du haut (T6), mesuré dans la démo (Manrope, 15/10) : le nombre en 22 px / 800 (chiffres tabulaires, −0,02 em), l'unité en 12 px / 700 à
 * 3 px, le « ° » en 13,2 px. `[valeur, unité, degré, largeur en px]`. */
const CHIFFRES = [['100', '%', false, 53.4], ['30', '%', false, 40.2], ['5', '%', false, 27], ['23,5', null, true, 52.1], ['20,9', null, true, 52.1],
  ['112', 'W', false, 54.3], ['4', 'W', false, 27.9], ['999', 'W', false, 54.3], ['1,95', 'kW', false, 67.3], ['—', null, false, 16.7]];
// Le contenu d'une carte au téléphone : Objets (rembourrage 16), une pièce (13), une vue personnelle (une carte de 173, 158, 138 px), à 390, 360 et 320 px.
const VUES = { Objets: [142, 127, 107], Pièces: [148, 133, 113], 'vue perso': [139, 124, 104] };

test('le chiffre du haut : sa largeur en em (`emChiffre`) majore la mesure ; sa taille, de 22 à 16 px, le fait toujours tenir entre la plaque et le bord', () => {
  const regle = /^font-size: clamp\((\d+)px, calc\(\(100cqi - (\d+)px\) \/ var\(--o-em, ([\d.]+)\)\), (\d+)px\);$/.exec(GABARIT['.o-gab-chiffre']);
  assert.ok(regle, 'la règle du chiffre du haut : ' + GABARIT['.o-gab-chiffre']);
  const [plancher, reserve, , plafond] = [Number(regle[1]), Number(regle[2]), Number(regle[3]), Number(regle[4])];
  assert.deepEqual([plancher, reserve, plafond], [16, 49, 22], 'de 22 à 16 px ; la plaque (38), 8 px d’air, l’écart de l’unité (3)');
  for (const [v, u, degre, mesure] of CHIFFRES) {
    const em = emChiffre(v, u, degre);
    const estime = em * 22 + (u ? 3 : 0);
    assert.ok(estime >= mesure - 0.3 && estime - mesure < 1, v + (u || '') + ' : ' + estime.toFixed(1) + ' px estimés pour ' + mesure + ' mesurés');
  }
  const taille = (contenu, em) => Math.min(plafond, Math.max(plancher, (contenu - reserve) / em));
  for (const [vue, contenus] of Object.entries(VUES)) {
    for (const contenu of contenus) {
      for (const [v, u, degre, mesure] of CHIFFRES) {
        const t = taille(contenu, emChiffre(v, u, degre));
        const rendu = (mesure - (u ? 3 : 0)) * t / 22 + (u ? 3 : 0);
        assert.ok(rendu <= contenu - 46 + 0.3, vue + ', ' + contenu + ' px : « ' + v + (u ? ' ' + u : '') + ' » en ' + t.toFixed(1) + ' px fait ' + rendu.toFixed(1) + ' px pour ' + (contenu - 46));
      }
    }
  }
  // Ce qui reste en 22 px partout, et ce qui rétrécit : « 1,95 kW » à 320 px.
  for (const [vue, contenus] of Object.entries(VUES)) for (const [v, u, degre] of CHIFFRES.filter(c => c[0] !== '1,95')) assert.equal(taille(contenus[2], emChiffre(v, u, degre)), 22, vue + ' à 320 px : ' + v + ' garde ses 22 px');
  assert.ok(Math.abs(taille(VUES.Objets[2], emChiffre('1,95', 'kW')) - 19.8) < 0.1, '« 1,95 kW » à 320 px dans Objets : 19,8 px');
  assert.ok(Math.abs(taille(VUES['vue perso'][2], emChiffre('1,95', 'kW')) - 18.8) < 0.1, 'dans une vue personnelle : 18,8 px');
});

/* ── Les carrés d'un chauffage et la place de sa valeur (passe téléphone, tâche 4 ; T2, T9, T18) ────────────────────────────────── */

test('− et + d’un chauffage : 44 px dès 142 px de contenu, puis ils cèdent, jamais sous 28 px ; la valeur garde 46 px, et un mot long la place qu’il lui faut', () => {
  const regle = variables(GABARIT['.o-gabarit > *']);
  assert.equal(regle['--o-pas'], 'clamp(28px, calc((100cqi - 8px - max(46px, 6.2px * var(--o-mot, 0))) / 2), 44px)');
  assert.deepEqual([regle['--o-pas-ecart'], regle['--o-reserve']], ['4px', 'calc(2 * var(--o-pas) + 8px)']);
  const pas = (contenu, mot = 0) => Math.min(44, Math.max(28, (contenu - 8 - Math.max(46, 6.2 * mot)) / 2));
  const place = (contenu, mot = 0) => contenu - 2 * pas(contenu, mot) - 8;
  // Le tableau de la conception (§ 4.1) : Objets, Pièces, vue perso, à 390, 360 et 320 px.
  assert.deepEqual(VUES.Objets.map(c => pas(c)), [44, 36.5, 28]);
  assert.deepEqual(VUES.Pièces.map(c => pas(c)), [44, 39.5, 29.5]);
  assert.deepEqual(VUES['vue perso'].map(c => pas(c)), [42.5, 35, 28]);
  assert.deepEqual(VUES.Objets.map(c => place(c)), [46, 46, 43]);
  // T18 : un mot de mode trop long élargit sa place. Mesurés à 10 px / 800 : « Frostschutz » 59,2 px, « Wyłączone » 55.
  for (const [mot, largeur] of [['Frostschutz', 59.2], ['Wyłączone', 55]]) {
    for (const contenu of [VUES.Objets[0], VUES.Objets[1]]) assert.ok(place(contenu, mot.length) >= largeur, mot + ' à ' + contenu + ' px de contenu : ' + place(contenu, mot.length).toFixed(1) + ' px pour ' + largeur);
    assert.ok(place(VUES.Objets[2], mot.length) < largeur, mot + ' à 320 px : il finit encore en « … » — les carrés ne descendent pas sous 28 px');
  }
  assert.ok(pas(142, 'Frostschutz'.length) < 44 && pas(142, 'Éco'.length) === 44 && pas(142, '22,0°'.length) === 44, 'les carrés ne cèdent qu’à un mot long');
  // L'étiquette, en minuscules et en 700 (mesurée à 10 px) : de 10 à 8 px, d'après la place qui reste.
  const etiquette = (contenu, n) => Math.min(10, Math.max(8, place(contenu) / (0.63 * n)));
  const tient = (mot, largeur, contenu) => largeur * etiquette(contenu, mot.length) / 10 <= place(contenu) + 0.05;
  for (const [mot, largeur] of [['Consigne', 46.4], ['Planning', 42.7], ['Manuel', 35.7], ['Sollwert', 40.5], ['Zeitplan', 40.8], ['Nastawa', 41.7], ['Schedule', 45.9]]) {
    for (const contenu of VUES.Objets) assert.ok(tient(mot, largeur, contenu), mot + ' à ' + contenu + ' px de contenu');
  }
  // Ce qui finit encore en « … » : « Programma » à 320 px ; « Harmonogram » et « Programación » partout, même à 8 px — comme aujourd'hui.
  assert.ok(tient('Programma', 56, VUES.Objets[0]) && tient('Programma', 56, VUES.Objets[1]) && !tient('Programma', 56, VUES.Objets[2]));
  for (const [mot, largeur] of [['Harmonogram', 69.2], ['Programación', 67.8]]) assert.ok(!tient(mot, largeur, VUES.Objets[0]), mot);
});

/* ── La ligne d'une prise (passe téléphone, tâche 5 ; T10, T11) ────────────────────────────────────────────────────
 *
 * Mesurés dans la démo (Manrope, 15/10) : un relevé de huit caractères (« 1,47 kWh », « 12,4 kWh » — des chiffres de même chasse)
 * fait 59,2 px en 13 px / 800 ; le mot de la pastille, en 11 px / 700, et « Aujourd’hui », en 10 px / 700, dans les sept langues. */
const KWH = 59.2;
const MOTS_PASTILLE = [['Protégée', 49.5], ['Protected', 53.4], ['Geschützt', 56.1], ['Beveiligd', 48.7], ['Protetta', 44.4], ['Protegido', 52.6], ['Chronione', 56.3]];
const JOURS = [['Aujourd’hui', 56.5], ['Today', 28.7], ['Heute', 29.6], ['Vandaag', 41.8], ['Oggi', 22.6], ['Hoy', 18.8], ['Dziś', 20.7]];

test('la ligne d’une prise : les kWh de 13 à 10,5 px dans ce que laisse la bascule ; protégée, la pastille, dont le mot s’efface sous 140 px', () => {
  assert.equal(GABARIT['.o-gab-valeur[data-kwh]'], 'font-size: clamp(10.5px, calc((100cqi - var(--o-reserve)) / (0.6 * var(--o-n, 8))), 13px);');
  assert.equal(GABARIT['.o-gabarit > [data-pastille]'], '--o-reserve: calc(100cqi - 51px);');
  assert.equal(GABARIT['.o-gab-pastille-mot'], 'font-size: clamp(9.5px, calc((100cqi - 89px) / (0.63 * var(--o-n, 8))), 11px);');
  assert.ok(CSS.includes('@container (width < 140px) {\n  .o-gab-pastille-mot { display: none; }\n  .o-gabarit > [data-pastille] { --o-reserve: 36px; }\n}'), 'sous 140 px de contenu, le cadenas seul');
  // La carte : au gabarit, la puissance en haut, la place de sa bascule (46 px et 8 d'écart), et la ligne de commandes de 44 px sous ses 9 px d'air.
  const prise = APP.slice(APP.indexOf('function RoomPriseCard('), APP.indexOf('\n}\n', APP.indexOf('function RoomPriseCard(')));
  for (const morceau of ["className={'o-rmcard o-gabarit' + (v.muet ? ' o-panne' : '')}", '{chiffre && <ChiffreHaut v={pp.v} u={pp.u} />}', "'--o-reserve': v.protegee ? undefined : '54px'",
    "minHeight: 'calc(var(--o-pied-haut, 14px) + 44px)'", '<RmBascule className="o-seul-large"', 'className="o-prise-pied o-seul-large"']) {
    assert.ok(prise.includes(morceau), 'la carte d’une prise : ' + morceau);
  }
  // Les majorants tiennent : 0,6 em par caractère pour les kWh, 0,63 pour les mots.
  assert.ok(KWH / 13 / 8 <= 0.6);
  for (const [mot, largeur] of [...MOTS_PASTILLE.map(([m, l]) => [m, l / 11]), ...JOURS.map(([m, l]) => [m, l / 10])]) assert.ok(largeur / mot.length <= 0.63, mot);
  const kwh = (place) => Math.min(13, Math.max(10.5, place / (0.6 * 8)));
  const etiquette = (place, n) => Math.min(10, Math.max(8, place / (0.63 * n)));
  // Une prise libre : les kWh et « Aujourd’hui » tiennent dans ce que laisse la bascule, partout.
  for (const [vue, contenus] of Object.entries(VUES)) {
    for (const contenu of contenus) {
      const place = contenu - 54;
      assert.ok(KWH * kwh(place) / 13 <= place, vue + ', ' + contenu + ' px : les kWh en ' + kwh(place).toFixed(2) + ' px font ' + (KWH * kwh(place) / 13).toFixed(1) + ' px pour ' + place);
      for (const [mot, largeur] of JOURS) assert.ok(largeur * etiquette(place, mot.length) / 10 <= place, vue + ', ' + contenu + ' px : ' + mot);
    }
  }
  // Le tableau de la conception (§ 4.1) : 88, 73 et 53 px pour les kWh dans Objets — en 13, 13 et 11 px.
  assert.deepEqual(VUES.Objets.map(c => c - 54), [88, 73, 53]);
  assert.deepEqual(VUES.Objets.map(c => Math.round(kwh(c - 54) * 100) / 100), [13, 13, 11.04]);
  // 10,5 et non 11 : une vue personnelle de 320 px laisse 50 px, et « 1,47 kWh » en fait 50,1 en 11 px.
  assert.ok(KWH * 11 / 13 > VUES['vue perso'][2] - 54, 'en 11 px, il finissait en « … »');
  // Protégée, à partir de 140 px de contenu : la pastille et son mot, l'écart, puis 51 px pour les kWh.
  const taille = (contenu, n) => Math.min(11, Math.max(9.5, (contenu - 89) / (0.63 * n)));
  for (const [vue, contenus] of Object.entries(VUES)) {
    for (const contenu of contenus.filter(c => c >= 140)) {
      for (const [mot, largeur] of MOTS_PASTILLE) {
        const rangee = 7 + 12 + 4 + largeur * taille(contenu, mot.length) / 11 + 7 + 8 + KWH * kwh(51) / 13;
        assert.ok(rangee <= contenu, vue + ', ' + contenu + ' px : « ' + mot + ' » — ' + rangee.toFixed(1) + ' px');
      }
    }
    // En dessous, le cadenas seul (26 px) et l'écart : les kWh ont le reste.
    for (const contenu of contenus.filter(c => c < 140)) assert.ok(KWH * kwh(contenu - 36) / 13 <= contenu - 34, vue + ', ' + contenu + ' px');
  }
  // La pastille garde son mot à 390 px dans Objets et dans une pièce ; jamais dans une vue personnelle (139 px).
  assert.deepEqual(Object.values(VUES).map(c => c.map(x => x >= 140)), [[true, false, false], [true, false, false], [false, false, false]]);
});

/* ── Le ménage (passe téléphone, tâche 6 ; § 6 de la conception) ─────────────────────────────────────────────────── */

test('le ménage : plus rien dans src/ ne nomme ce qui a quitté la carte étroite — ni règle, ni code, ni commentaire', () => {
  // Les quatre blocs étroits et leurs classes, la copie du pied d'une prise et ses variables, l'attribut qui taisait « Aujourd'hui ».
  const PARTIS = ['o-chauffage-texte', 'o-chauffage-mot', 'o-chauffage-etiquette', 'o-lumiere-texte', 'o-lumiere-nom', 'o-lumiere-phrase', 'o-volet-texte',
    'o-prise-nom', 'o-prise-phrase', 'o-prise-jour', 'o-prise-chiffre-pied', 'o-prise-ico', 'o-prise-mot', '--o-pied-chiffre', '--o-pied-unite', '--o-pied-ecart', 'data-chiffre'];
  // Le nom ENTIER : `o-prise-jour` n'est pas `o-prise-journal`, la feuille du journal d'une fiche.
  const nomme = (texte, nom) => new RegExp('(^|[^\\w-])' + nom + '(?![\\w-])').test(texte);
  const sources = readdirSync(new URL('../src/', import.meta.url), { recursive: true }).map(f => String(f).replace(/\\/g, '/')).filter(f => /\.(jsx?|css)$/.test(f));
  assert.ok(sources.includes('App.jsx') && sources.includes('index.css'), 'les sources se lisent');
  const restes = sources.flatMap(f => { const texte = lire('src/' + f); return PARTIS.filter(nom => nomme(texte, nom)).map(nom => f + ' : ' + nom); });
  assert.deepEqual(restes, [], 'à retirer, ou à renommer pour ce qui les remplace (`o-gab-valeur`, `o-gab-etiquette`)');
});
