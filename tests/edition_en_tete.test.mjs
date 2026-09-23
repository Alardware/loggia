// v3.41.0 — trois retours du 17/09, tenus ensemble parce qu'ils se repondent :
//   1. « la barre mode edition, pourquoi elle n'est jamais au meme endroit ?
//      place en haut comme les autres, peu importe la vue » ;
//   2. « dans parametre supprime la barre mode sombre claire, retire la section
//      entite egalement, on peut deja gerer cela sur les pages respectives » ;
//   3. « la seule que je ne peux pas modifier encore, que tu vas ajouter, c'est
//      la meteo ».
// Retirer l'onglet Entites ne doit laisser AUCUNE liste d'entites sans fiche :
// c'est ce que le dernier bloc verifie, a partir des sources.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detecterCapteursPieces } from '../src/resolve.js';
import { DROITS_IDS } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const par = lire('src', 'views', 'parametres.jsx');
const ui = lire('src', 'ui.jsx');
const en = lire('src', 'langues', 'en.js');
const NL = String.fromCharCode(10);
const bloc = (src, debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

// Les vues qui ont un mode edition, et le composant qui dessine leur contenu.
const VUES = [
  ['la piece', 'function RoomView('],
  ['Objets', 'function ObjetsView('],
  ['l’Accueil', 'function Dashboard('],
  ['Scenarios', 'function ScenariosView('],
  ['Volets', 'function VoletsContent('],
  ['Energie', 'function EnergieContent('],
  ['Securite', 'function SecuriteContent('],
  ['une vue personnalisee', 'function CustomView('],
];

test('le bandeau d’edition est le PREMIER enfant du contenu, dans toutes les vues', () => {
  for (const [nom, debut] of VUES) {
    const vue = bloc(app, debut, NL + 'function ');
    assert.equal((vue.match(/<BandeauEdition/g) || []).length, 1, nom + ' : une barre, pas deux');
    const c = vue.indexOf('className="loggia-content"');
    assert.ok(c >= 0, nom + ' : pas de contenu ?');
    const apres = vue.slice(vue.indexOf('>', c) + 1);
    // Entre l'ouverture du contenu et le bandeau : rien que la garde d'edition.
    const avant = apres.slice(0, apres.indexOf('<BandeauEdition')).replace(/\s+/g, '');
    assert.ok(avant === '{edit&&' || avant === '{editMode&&(', nom + ' : quelque chose passe avant le bandeau — « ' + avant.slice(0, 60) + ' »');
  }
});

test('une seule barre existe : ViewEditBar et la barre maison des vues perso sont parties', () => {
  assert.ok(!app.includes('ViewEditBar') && !ui.includes('export const ViewEditBar'), 'ViewEditBar doublait le bandeau dans les Volets et la Securite');
  assert.ok(ui.includes('export const editBtn = (accent) => ({'), 'son bouton, lui, sert encore');
  assert.ok(!app.includes("{tr('Prends une carte pour la déplacer, retire (×) ou ajoute.')}"), 'la barre maison des vues personnalisees');
  const sc = bloc(app, 'function ScenariosView(', NL + 'function ');
  assert.equal((sc.match(/setFiche\('nouveau'\)/g) || []).length, 2, 'Scenarios : l’ajout vit dans le bandeau et dans la case de fin de grille, plus dans l’en-tete');
});

test('le bandeau porte « Entites de la vue » et sait changer son mot d’ordre', () => {
  const b = bloc(app, 'function BandeauEdition(', NL + '}');
  assert.ok(b.includes('onEnt = null, entLabel = null, texte = null })'), 'les trois proprietes');
  assert.ok(b.includes("{onEnt && <button onClick={onEnt} style={btn(false)}><Fi i=\"list\" size={12} />{entLabel || tr('Entités de la vue')}</button>}"), 'le bouton des entites, au style des autres');
  assert.ok(b.includes("{texte || tr('Mode édition : attrape une carte pour la déplacer où tu veux, ou ajoute, renomme et retire une carte.')}"), 'le mot d’ordre par defaut reste celui de la maquette');
  assert.ok(b.indexOf('{extra}') < b.indexOf('{onEnt &&') && b.indexOf('{onEnt &&') < b.indexOf("tr('Terminer')"), 'Terminer ferme la marche');
  // Qui le recoit : les vues qui ont une fiche d'entites.
  assert.ok(bloc(app, 'function Dashboard(', NL + 'function ').includes('</>} onEnt={onEnt} />'), 'l’Accueil passe par la propriete, plus par un bouton a lui');
  assert.ok(bloc(app, 'function EnergieContent(', NL + 'function ').includes("onEnt={onEnt} entLabel={tr('Entités du schéma')} />"), 'l’Energie garde son libelle');
  assert.ok(bloc(app, 'function SecuriteContent(', NL + '}').includes('{edit && <BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} onEnt={onEnt} />}'), 'la Securite');
  assert.equal((app.match(/<ObjetsView hass=\{hass\} onNav=\{setView\}(?: filtre="[a-z]+")? edit=\{editMode && peutEditer\} onEnt=\{editMode && peutEditer \? \(\) => setEntSheet\(true\) : null\} \/>/g) || []).length, 4, 'Objets, sur ses quatre routes');
});

test('Parametres : plus de barre Sombre / Clair au sommaire, le reglage reste dans Apparence', () => {
  assert.ok(!par.includes("['dark', 'Sombre']"), 'le selecteur du sommaire est parti');
  assert.equal((par.match(/onPick=\{onMode\}|onMode\(/g) || []).length, 1, 'un seul selecteur de mode : celui d’Apparence');
  assert.ok(par.includes("opts={[['auto', tr('Auto')], ['dark', tr('Foncé')], ['light', tr('Clair')]]} onPick={onMode}"), 'Apparence garde le sien, « Auto » compris');
  const hub = bloc(par, "{tab === 'hub' ? (", '{SECTIONS.map(sec =>');
  assert.ok(!hub.includes('onMode(') && !hub.includes('className="o-bar"'), 'le sommaire n’a plus de barre');
  assert.ok(hub.includes("{tr('Toutes les sections')}"), 'il ouvre sur ses sections');
});

test('Parametres : la section Entites est partie, avec ce qui ne menait qu’a elle', () => {
  assert.ok(!par.includes("id: 'entites'") && !par.includes("tab === 'entites'") && !par.includes("setTab('entites')"), 'ni carte, ni onglet, ni lien');
  assert.ok(!par.includes('onEntites'), 'le bouton « Entites » des lignes de l’onglet Vues');
  assert.ok(!par.includes('Synchronisation entre accès') && !par.includes('exportLoggiaConfig') && !par.includes('importLoggiaConfig'), 'la copie entre acces : la configuration vit sur le serveur, « A propos » l’exporte en entier');
  assert.ok(par.includes('exportConfigComplete()') && par.includes('importConfigComplete('), 'l’export et l’import complets restent');
  assert.ok(!par.includes('resetEnt') && !par.includes('ENT_KEYS'), 'la remise a zero globale n’avait de bouton que la');
  assert.ok(DROITS_IDS.indexOf('entites') < 0, 'un droit qui n’ouvre plus rien est une case qui promet');
  assert.ok(!app.includes("['entites', tr('Entités'), 'entites']"), 'la recherche ne propose plus la section');
});

test('chaque liste d’entites garde une fiche ; la meteo entre dans celle de l’Accueil', () => {
  const t = bloc(par, 'export const VIEW_ENT_SECTIONS = {', '};');
  const parVue = {};
  for (const m of t.matchAll(/^\s*([a-z]+): \[([^\]]*)\],/gm)) parVue[m[1]] = [...m[2].matchAll(/'([a-z]+)'/g)].map(x => x[1]);
  assert.deepEqual(parVue.accueil, ['rooms', 'weather', 'energy', 'people', 'cams'], 'la meteo : « la seule que je ne peux pas modifier encore »');
  /* Le distributeur de croquettes a rejoint Objets le 23/09 (plan, S1) : sa
   * carte et sa fiche y vivent, et AUCUN ecran n'ecrivait `loggia_feeder` — il
   * ne sortait que de la demonstration, pendant que le README promettait qu'on
   * le designe « sur la page concernee ». */
  assert.deepEqual(parVue.objets, ['switches', 'medias', 'climate', 'feeder'], 'la vue Objets recoit ce que seul l’onglet portait');
  assert.ok(!('meteo' in parVue), 'la vue Meteo n’existe plus : sa cle non plus');
  // Toute section dessinee par le formulaire est joignable depuis une vue.
  const sections = new Set([...bloc(par, 'function EntSections(', NL + '}').matchAll(/has\('([a-z]+)'\)/g)].map(m => m[1]));
  const joignables = new Set(Object.values(parVue).flat());
  assert.deepEqual([...sections].sort(), [...joignables].sort(), 'une section sans fiche ne se reglerait plus nulle part');
  // Et toute vue listee ouvre bien sa fiche : la route lui passe `onEnt`.
  for (const vue of Object.keys(parVue)) {
    if (vue === 'accueil') { assert.ok(app.includes('<Dashboard editMode={editMode} sante={santeAccueil} onEnt={peutEditer'), 'Accueil'); continue; }
    const d = app.indexOf("view === '" + vue + "' ? <");
    assert.ok(d >= 0, vue + ' : route introuvable');
    const route = app.slice(d);
    assert.ok(route.slice(0, route.indexOf(' : view === ')).includes('onEnt='), vue + ' : la route ne passe pas onEnt, sa fiche serait injoignable');
  }
  assert.ok(par.includes('only={VIEW_ENT_SECTIONS[view]} hass={hass} />'), 'la fiche recoit hass : coches de validite et detection');
  assert.ok(par.includes("loggia_weather: ent.weather || '',"), 'la fiche ecrit la cle que `weatherEntity` lit');
});

test('la detection des capteurs suit les pieces dans la fiche de l’Accueil', () => {
  const s = bloc(par, 'function EntSections(', NL + '}');
  assert.ok(s.includes("{has('rooms') && hass && (") && s.includes("{tr('Détecter automatiquement')}"), 'le bouton, au-dessus des pieces');
  assert.ok(s.includes('detecterCapteursPieces(ent.rooms, {') && s.includes("entSet('rooms')(r.rooms);"), 'il remplit le formulaire, sans enregistrer');
});

test('detecter : la zone Home Assistant d’abord, le nom ensuite, jamais contre un choix qui marche', () => {
  const rooms = [
    { room: 'Salon', temp: '', humidity: '', co2: '' },
    { room: 'Séjour d’été', temp: 'sensor.vieux', humidity: '', co2: '' },
    { room: 'Bureau', temp: 'sensor.bureau_ok', humidity: '', co2: '' },
    { room: '', temp: '', humidity: '', co2: '' },
  ];
  const r = detecterCapteursPieces(rooms, {
    suggestions: [{ name: 'SALON', temp: 'sensor.z_temp', hum: 'sensor.z_hum', co2: null }],
    capteurs: ['sensor.salon_co2', 'sensor.sejour_d_ete_temperature', 'sensor.sejour_d_ete_humidite', 'sensor.bureau_temperature'],
    vivant: (id) => id === 'sensor.bureau_ok',
  });
  assert.deepEqual(r.rooms[0], { room: 'Salon', temp: 'sensor.z_temp', humidity: 'sensor.z_hum', co2: 'sensor.salon_co2' }, 'la zone fait autorite (sans egard a la casse), le nom complete');
  assert.deepEqual(r.rooms[1], { room: 'Séjour d’été', temp: 'sensor.sejour_d_ete_temperature', humidity: 'sensor.sejour_d_ete_humidite', co2: '' }, 'accents et apostrophe ne genent pas le nom ; un capteur mort se remplace');
  assert.deepEqual(r.rooms[2], { room: 'Bureau', temp: 'sensor.bureau_ok', humidity: '', co2: '' }, 'un choix qui marche n’est jamais ecrase — meme si un capteur porte le nom de la piece ; et l’humidite d’une AUTRE piece ne vient pas combler un vide');
  assert.deepEqual(r.rooms[3], rooms[3], 'une ligne sans nom ne se devine pas');
  assert.equal(r.trouves, 5);
  assert.equal(r.parZone, 2, 'on dit combien viennent de la zone');
  assert.notEqual(r.rooms, rooms, 'une copie : le formulaire n’est pas modifie sur place');
  assert.deepEqual(detecterCapteursPieces([{ room: 'Cave', temp: '', humidity: '', co2: '' }]), { rooms: [{ room: 'Cave', temp: '', humidity: '', co2: '' }], trouves: 0, parZone: 0 }, 'rien a trouver : rien d’invente');
  assert.deepEqual(detecterCapteursPieces(null), { rooms: [], trouves: 0, parZone: 0 });
});

test('les mots nouveaux sont traduits', () => {
  for (const k of ['IoT', 'Mode édition : avance, recule ou modifie un scénario, ou ajoutes-en un.',
    'Mode édition : prends une carte pour la déplacer, retire-la (×) ou ajoutes-en une.']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
  }
  assert.ok(en.includes("\"Entité météo : la carte météo sur le côté de l'Accueil, le fond de la bannière, la veille et les conseils d'extérieur.\":"), 'le mot de la section meteo');
});
