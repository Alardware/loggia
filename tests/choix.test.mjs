// ─────────────────────────────────────────────────────────────────────────────
// Les listes de Loggia : aux couleurs du thème, partout, et à la même taille.
//
// Retour du 18/09 (« il y a un souci avec les menus dans Alertes, pourquoi
// sont-ils blancs comme ça », trois captures) : le menu d'un <select> natif,
// comme celui d'une <datalist>, est dessiné par le système — blanc sous
// Windows, quel que soit le thème. Loggia dessine les siens : `ListeChoix` et
// `ChampSuggere` (ui.jsx), leur logique dans choix.js.
//
// Puis : « j'aimerais que les popups respectent une même taille » — les
// listes (« même largeur et même hauteur ») ; pour les feuilles, seulement
// celles qui ont des onglets (19/09 : « la hauteur identique partout, c'est
// pas terrible »).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sansAccents, filtrerChoix, blocsChoix, placerMenu, SEUIL_RECHERCHE, LARGEUR_MENU, HAUTEUR_MENU } from '../src/choix.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const UI = lire('src', 'ui.jsx');
const APP = lire('src', 'App.jsx');
const PAR = lire('src', 'views', 'parametres.jsx');
// La section des listes : du repère de largeur jusqu'à la fin des deux composants.
const LISTES = UI.slice(UI.indexOf("// La largeur utile de l'écran"), UI.indexOf('\nexport const CV_DOM_ICON'));

// Des noms de démonstration, pas ceux d'une vraie maison.
const OPTIONS = [
  { id: '', label: 'Automatique' },
  { id: 'valve.arrivee', label: 'Arrivée d’eau', sub: 'valve.arrivee', groupe: 'Vannes' },
  { id: 'switch.prise_jardin', label: 'Prise du jardin', sub: 'switch.prise_jardin', groupe: 'Prises et interrupteurs' },
  { id: 'switch.eclairage_sejour', label: 'Éclairage séjour', sub: 'switch.eclairage_sejour', groupe: 'Prises et interrupteurs' },
];

test('plus aucun <select> ni <datalist> natif dans l’interface', () => {
  // Un seul suffirait à rouvrir une liste blanche sous Windows. Les
  // commentaires qui racontent l'ancien code ne comptent pas.
  const fichiers = [];
  const parcourir = (d) => readdirSync(join(RACINE, d), { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) parcourir(join(d, e.name));
    else if (/\.jsx?$/.test(e.name)) fichiers.push(join(d, e.name));
  });
  parcourir('src');
  const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fautifs = fichiers.filter(f => /<(select|datalist)[\s>]/.test(sansCommentaires(readFileSync(join(RACINE, f), 'utf8'))));
  assert.deepEqual(fautifs, [], 'une liste native est revenue');
});

test('le filtre : le nom ou l’identifiant, sans se soucier des accents', () => {
  assert.equal(sansAccents('Éclairage Séjour'), 'eclairage sejour');
  assert.deepEqual(filtrerChoix(OPTIONS, 'eclai').map(o => o.id), ['switch.eclairage_sejour'], 'les accents comptent encore');
  assert.deepEqual(filtrerChoix(OPTIONS, 'switch.prise').map(o => o.id), ['switch.prise_jardin'], 'l’identifiant ne se cherche pas');
  assert.deepEqual(filtrerChoix(OPTIONS, '  ').map(o => o.id), OPTIONS.map(o => o.id), 'un filtre vide doit tout rendre');
  assert.deepEqual(filtrerChoix(OPTIONS, 'zzz'), []);
  assert.deepEqual(filtrerChoix(null, 'x'), []);
  assert.equal(SEUIL_RECHERCHE, 12, 'le champ de filtre paraît au-delà de douze options');
});

test('les groupes : un intitulé par suite d’options, le rang du clavier gardé', () => {
  const b = blocsChoix(OPTIONS);
  assert.deepEqual(b.map(x => x.groupe), ['', 'Vannes', 'Prises et interrupteurs']);
  assert.deepEqual(b[2].items.map(x => x.i), [2, 3], 'les flèches suivraient un autre ordre que l’écran');
  // Filtré, un groupe vidé disparaît avec son intitulé.
  assert.deepEqual(blocsChoix(filtrerChoix(OPTIONS, 'jardin')).map(x => x.groupe), ['Prises et interrupteurs']);
});

test('toutes les listes ont la même taille ; au-dessus quand la place manque en bas', () => {
  // « Même largeur et même hauteur » : un menu de deux choix comme un de cent.
  assert.equal(LARGEUR_MENU, 320);
  assert.equal(HAUTEUR_MENU, 320);
  const bouton = (top, left = 100, width = 268, h = 48) => ({ top, bottom: top + h, left, width });
  const enHaut = placerMenu(bouton(100), 1330, 900);
  assert.equal(enHaut.dessous, true);
  assert.equal(enHaut.top, 154);
  assert.deepEqual([enHaut.w, enHaut.h], [320, 320], 'la taille commune');
  // Un bouton large ou étroit n'y change rien.
  const large = placerMenu(bouton(100, 100, 600), 1330, 900);
  assert.deepEqual([large.w, large.h], [320, 320], 'la liste prendrait la largeur de son bouton');
  // Le choix de la vanne, en bas de la page des Alertes.
  const enBas = placerMenu(bouton(800), 1330, 900);
  assert.equal(enBas.dessous, false, 'en bas de page, le menu sortirait de l’écran');
  assert.equal(enBas.bottom, 106);
  assert.equal(enBas.h, 320);
  // Au bord droit, il rentre dans l'écran ; jamais plus large que lui.
  assert.equal(placerMenu(bouton(100, 1200), 1330, 900).left, 1330 - 320 - 8);
  const etroit = placerMenu(bouton(100, 10, 300), 330, 844);
  assert.equal(etroit.w, 330 - 16);
  assert.equal(etroit.left, 8);
  // Un écran trop bas pour la taille commune : la liste rétrécit, sans passer sous 120 px.
  const bas = placerMenu(bouton(150), 1330, 400);
  assert.ok(bas.h < 320 && bas.h >= 120);
});

test('la liste commune : dans <body>, à taille fixe, au clavier, le filtre sur les longues listes', () => {
  assert.ok(LISTES.includes('createPortal(') && LISTES.includes(', document.body)}'), 'le menu retombe à côté de son bouton');
  assert.ok(LISTES.includes('width: pos.w, height: pos.h'), 'le panneau suivrait encore son contenu');
  assert.ok(LISTES.includes('placerMenu(el.getBoundingClientRect(), largeurEcran(), window.innerHeight)'));
  // Échap, écouté en capture sur le document : il ferme le menu, pas la feuille autour.
  assert.ok(LISTES.includes("document.addEventListener('keydown', onKey, true);") && LISTES.includes("if (e.key !== 'Escape') return;"));
  for (const k of ["'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", "'Enter'", "'Tab'"]) assert.ok(LISTES.includes(k), k + ' ne répond plus');
  assert.ok(LISTES.includes('role="listbox"') && LISTES.includes('role="option"') && LISTES.includes('aria-activedescendant={vise}'));
  assert.ok(LISTES.includes('liste.length > SEUIL_RECHERCHE'), 'plus de filtre sur les longues listes');
  assert.ok(LISTES.includes("tactile = window.matchMedia('(pointer: coarse)').matches"), 'le clavier du téléphone surgirait à chaque ouverture');
  // Plus aucune largeur au cas par cas.
  const tout = [APP, PAR, lire('src', 'views', 'presence.jsx'), lire('src', 'views', 'veilles.jsx')].join('\n');
  assert.ok(!/<ListeChoix[^>]*largeur=/.test(tout), 'une liste a retrouvé sa largeur à elle');
});

test('les menus des Alertes : la liste de Loggia, groupée, triée par nom', () => {
  assert.ok(PAR.includes('<ListeChoix label={label} value={value} onChange={onChange} options={options}'), 'le choix des Alertes a perdu la liste commune');
  assert.ok(PAR.includes("sub: 'notify.' + x"), 'le service du téléphone ne se lit plus sous son nom');
  assert.ok(PAR.includes("groupe: tr('Vannes')") && PAR.includes("groupe: tr('Prises et interrupteurs')"));
  // Le groupe prend tout `switch.*` : pas seulement des prises.
  assert.ok(!PAR.includes("tr('Prises commandées')"), 'le groupe promet des prises et liste tous les interrupteurs');
  assert.ok(PAR.includes('const parNom = (ids) => ids.slice().sort((a, b) => nomDe(a).localeCompare(nomDe(b), locale()));'), 'la liste suit les identifiants, pas les noms lus');
});

test('les suggestions sous un champ : le panneau des menus, à leur taille', () => {
  const c = UI.slice(UI.indexOf('export function ChampSuggere('), UI.indexOf('\nexport const CV_DOM_ICON'));
  assert.ok(c.includes('<input ref={champRef} id={id || undefined}'), 'l’étiquette ne désignerait plus le champ');
  assert.ok(c.includes('style={cadrePanneau(pos)}'), 'les suggestions n’ont plus la taille des menus');
  assert.ok(c.includes('onMouseDown={(e) => e.preventDefault()}'), 'un appui dans la liste ferait perdre le champ');
  assert.ok(c.includes('const montre = visibles.length > 0 && !(visibles.length === 1 && visibles[0].id === texte);'), 'un panneau vide s’ouvrirait');
  // Les trois endroits qui portaient une <datalist>.
  assert.ok(APP.includes('<ChampSuggere id={id} label={lbl} value={v} onChange={set}'), 'la fiche d’une pièce');
  for (const s of ["suggestions={c.domain && sugg ? sugg(c.domain) : []}", "suggestions={sugg('sensor')}", "suggestions={sugg('alarm_control_panel')}", "suggestions={sugg('weather')}"]) {
    assert.ok(PAR.includes(s), 'les entités d’une vue : ' + s);
  }
  assert.ok(lire('src', 'widgetsrail.jsx').includes('suggestions={fuseaux.map(f => ({ id: f, label: f }))}'), 'le fuseau des villes');
});

test('le sélecteur des fiches passe par la liste commune', () => {
  const m = APP.slice(APP.indexOf('function MenuDeroulant('), APP.indexOf('/* `dense` : la COMPACTE'));
  assert.ok(m.includes('<ListeChoix value={valeur} onChange={surChoix} label={etiquette}'), 'vitesse et préréglages ont retrouvé leur liste à part');
  assert.ok(!m.includes('role="listbox"'), 'une deuxième liste, d’une autre taille');
});

test('seules les feuilles à onglets gardent une hauteur fixe', () => {
  // « La hauteur identique partout, c'est pas terrible ; là où il faut que ce
  // soit identique, c'est quand une popup a plusieurs onglets » (19/09).
  const ROBOT = lire('src', 'ficherobot.jsx');
  assert.ok(!/<BottomSheet[^>]* fiche[ >]/.test(APP) && !/<BottomSheet[^>]* fiche[ >]/.test(ROBOT), 'une feuille sans onglets a retrouvé une hauteur fixe');
  const avecOnglets = {
    FicheRobot: '<BottomSheet onClose={onClose} onglets>',
    CarteAjoutSheet: '<BottomSheet onClose={onClose} onglets>',
  };
  for (const [nom, feuille] of Object.entries(avecOnglets)) {
    const i = APP.indexOf('\nfunction ' + nom + '(');
    const j = APP.indexOf('\nfunction ', i + 1);
    assert.ok(i >= 0 && APP.slice(i, j < 0 ? undefined : j).includes(feuille), nom + ' : changer d’onglet changerait la hauteur de la feuille');
  }
  assert.equal((APP.match(/<BottomSheet[^>]* onglets/g) || []).length, 2, 'une feuille sans onglets a pris une hauteur fixe');
  // La lampe blancs + couleurs : ses deux palettes partagent la même case — la
  // fiche prend la hauteur de la plus grande, sans les 760 px (19/09 : « pourquoi
  // cette différence entre ces deux lumières »).
  const i = APP.indexOf('\nfunction RoomLightSheet(');
  const lampe = APP.slice(i, APP.indexOf('\nfunction ', i + 1));
  assert.ok(lampe.includes('<BottomSheet onClose={onClose}>'), 'la lampe a retrouvé une hauteur fixe');
  assert.equal((lampe.match(/gridArea: '1 \/ 1'/g) || []).length, 2, 'les deux palettes ne partagent plus leur case');
  assert.ok(lampe.includes("visibility: blancs ? 'visible' : 'hidden'") && lampe.includes("visibility: blancs ? 'hidden' : 'visible'"));
  const CSS = lire('src', 'index.css');
  assert.ok(CSS.includes('.o-sheet-onglets { height: min(760px, 88vh); }'), 'la hauteur des feuilles à onglets');
  assert.ok(CSS.includes('html.loggia-tactile .o-sheet-onglets { height: min(760px, calc(94vh - var(--o-navh, 60px))); }'), 'au doigt, au-dessus de la barre du bas');
  assert.ok(!CSS.includes('.o-sheet-fiche'), 'la hauteur unique de toutes les fiches est revenue');
  assert.ok(UI.includes("className={'o-sheet' + (opaque ? ' o-sheet-opaque' : '') + (onglets ? ' o-sheet-onglets' : '')}"));
});

test('les mots de la liste existent en anglais', () => {
  const en = lire('src', 'langues', 'en.js');
  for (const k of ['Rechercher…', 'Aucun résultat', 'Alarme à armer', 'Entité du tarif heures creuses', 'Prises et interrupteurs']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque à en.js');
  }
});
