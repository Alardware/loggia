/* La recherche dans les Paramètres, et « Avancé » replié (07/11, usage étape 12).
 *
 * Le rapport du 04/11 : « on tape veille et on y est » ; les réglages rares
 * sous « Avancé », replié. Ses choix du 07/11 : la recherche en tête des
 * Paramètres ET dans Ctrl+K ; « Avancé » dans cette étape. Ce qui est garanti :
 *  - chaque mot de l'index est écrit, tel quel, dans le code des Paramètres —
 *    un nom qui change à l'écran sans changer ici ne se trouverait plus ;
 *  - les options : sections d'abord, réglages groupés par section, jamais d'une
 *    section que le profil n'ouvre pas ;
 *  - la rangée se trouve mot pour mot, hors des menus de navigation, et
 *    s'allume entière ;
 *  - le champ est dans les deux formats ; « Avancé » replié tient les mêmes
 *    trois réglages sur l'ordinateur et au téléphone ; Ctrl+K y mène. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONOLITHE } from './monolithe.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const I = await import('../src/reglagesindex.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SOURCES = ['src/views/parametres.jsx', 'src/views/appareils.jsx', 'src/views/volets.jsx', 'src/views/fenetres.jsx', 'src/views/presence.jsx',
  'src/views/nuit.jsx', 'src/views/veilles.jsx', 'src/views/journal.jsx'].map(lire).join('\n');
const PAR = lire('src/views/parametres.jsx');
const EN = lire('src/langues/en.js');
const echappe = (s) => s.replace(/[\\']/g, '\\$&');
const ecrit = (cle) => SOURCES.includes("tr('" + echappe(cle) + "'") || SOURCES.includes('tr("' + cle + '"');

test('chaque mot de l’index est écrit dans les Paramètres, et chaque nom se traduit', () => {
  const absents = I.REGLAGES.flatMap(e => e.t.filter(m => !ecrit(m)).map(m => e.id + ' : ' + m));
  assert.deepEqual(absents, [], 'un mot que l’écran ne montre plus : la rangée ne se trouverait pas');
  for (const e of I.REGLAGES) {
    assert.ok(I.SECTIONS_REGLAGES[e.s], e.id + ' : section inconnue');
    assert.ok(EN.includes("\n  '" + echappe(e.l || e.t[0]) + "':") || EN.includes('\n  "' + (e.l || e.t[0]) + '":'), e.id + ' : son nom n’a pas de traduction');
  }
  assert.equal(new Set(I.REGLAGES.map(e => e.id)).size, I.REGLAGES.length, 'deux réglages sous le même identifiant');
  // Les sections de l'index sont celles du sommaire, et leurs noms aussi.
  for (const [id, nom] of Object.entries(I.SECTIONS_REGLAGES)) assert.ok(PAR.includes("{ id: '" + id + "', name: tr('" + echappe(nom) + "')"), id);
  // Les onglets des Règles existent ; « veille » trouve l'écran de veille ET la veilleuse.
  for (const e of I.REGLAGES.filter(x => x.o)) assert.ok(PAR.includes("['" + e.o + "', "), e.id + ' : onglet ' + e.o);
  const veille = I.optionsReglages(Object.keys(I.SECTIONS_REGLAGES)).filter(o => o.label.toLowerCase().includes('veille')).map(o => o.id);
  assert.ok(veille.includes('apparence/veille') && veille.includes('regles/veilleuse'), veille.join(', '));
});

test('les options : les sections d’abord, puis les réglages groupés par section, ceux des sections ouvertes', () => {
  const o = I.optionsReglages(['apparence', 'regles']);
  assert.deepEqual(o.slice(0, 2), [{ id: 'section:apparence', label: 'Apparence', groupe: 'Sections des paramètres' }, { id: 'section:regles', label: 'Règles', groupe: 'Sections des paramètres' }]);
  assert.ok(o.some(x => x.id === 'apparence/veille' && x.label === 'Écran de veille' && x.groupe === 'Apparence'));
  assert.ok(o.some(x => x.id === 'apparence/barre' && x.label === 'Barre de navigation'), 'le nom choisi, pas le premier mot');
  assert.ok(!o.some(x => x.id.startsWith('alertes')), 'une section fermée ne se propose pas');
  assert.ok(!I.optionsReglages(['apparence'], { sections: false }).some(x => x.id.startsWith('section:')));
  // Les droits : ce que Ctrl+K propose à un profil ordinaire.
  assert.equal(I.sectionOuverte('apparence', []), true);
  assert.equal(I.sectionOuverte('regles', []), false);
  assert.equal(I.sectionOuverte('regles', ['regles']), true);
  assert.equal(I.sectionOuverte('alertes', [], true), true);
  assert.equal(I.sectionDe('section:alertes'), 'alertes');
  assert.equal(I.sectionDe('regles/veilleuse'), 'regles');
  assert.equal(I.sectionDe('section:nulle'), null);
  assert.equal(I.sectionDe('rien'), null);
});

/* Un DOM réduit à ce que lit la recherche : texte (propre et entier), enfants, ancêtres, classes. */
function noeud(tag, { texte = '', classes = [], enfants = [] } = {}) {
  const n = { tagName: tag.toUpperCase(), nodeType: 1, classes: new Set(classes), parent: null, enfants };
  n.childNodes = [...(texte ? [{ nodeType: 3, nodeValue: texte }] : []), ...enfants];
  enfants.forEach(e => { e.parent = n; });
  Object.defineProperty(n, 'textContent', { get: () => texte + n.enfants.map(e => e.textContent).join('') });
  Object.defineProperty(n, 'childElementCount', { get: () => n.enfants.length });
  const correspond = (sel) => sel.split(',').map(s => s.trim()).some(s => (s.startsWith('.') ? n.classes.has(s.slice(1)) : n.tagName === s.toUpperCase()));
  n.closest = (sel) => (correspond(sel) ? n : n.parent ? n.parent.closest(sel) : null);
  const tous = () => n.enfants.flatMap(e => [e, ...e.tous()]);
  n.tous = tous;
  n.querySelectorAll = (sel) => tous().filter(e => sel.split(',').map(s => s.trim().toUpperCase()).includes(e.tagName));
  n.querySelector = (sel) => tous().find(e => sel.split(',').some(s => e.tagName === s.trim().toUpperCase())) || null;
  n.classList = { add: (c) => n.classes.add(c), remove: (c) => n.classes.delete(c) };
  n.scrollIntoView = () => { n.vu = true; };
  n.focus = () => { n.focus_ = true; };
  return n;
}

test('la rangée se trouve mot pour mot, hors des menus, et s’allume entière', () => {
  const bouton = noeud('button');
  const titre = noeud('span', { texte: 'Écran de veille' });
  const rangee = noeud('div', { classes: ['o-optrow'], enfants: [noeud('div', { enfants: [titre] }), bouton] });
  const rail = noeud('nav', { enfants: [noeud('button', { texte: 'Écran de veille' })] });
  const leurre = noeud('span', { texte: 'Écran de veille et horloge' });
  const racine = noeud('div', { enfants: [rail, leurre, noeud('section', { enfants: [rangee] })] });
  const e = I.REGLAGE_PAR_ID['apparence/veille'];
  const trouve = I.trouverRangee(racine, e);
  assert.equal(trouve, titre, 'ni le rail, ni un texte qui le contient');
  assert.equal(I.rangeeDe(titre), rangee);
  const montree = I.montrerRangee(trouve);
  assert.equal(montree, rangee);
  assert.ok(rangee.vu && rangee.classes.has('o-reglage-trouve') && bouton.focus_, 'au milieu, allumée, le focus sur son bouton');
  // Le second mot sert quand le premier n'est pas à l'écran (le téléphone).
  const tel = noeud('div', { enfants: [noeud('div', { classes: ['o-ligne-tel'], enfants: [noeud('span', { texte: 'Barre de navigation' })] })] });
  assert.equal(I.trouverRangee(tel, I.REGLAGE_PAR_ID['apparence/barre']).textContent, 'Barre de navigation');
  assert.equal(I.trouverRangee(tel, I.REGLAGE_PAR_ID['apparence/veille']), null);
  // Une rangée « Cet écran » : la pastille vit DANS le titre — son texte propre reste le nom (essai du 07/11).
  const marque = noeud('span', { texte: 'Marge du haut', enfants: [noeud('span', { texte: 'Cet écran' })] });
  const ici = noeud('div', { enfants: [noeud('div', { classes: ['o-ligne-tel'], enfants: [marque] })] });
  assert.equal(I.trouverRangee(ici, I.REGLAGE_PAR_ID['apparence/marges']), marque);
  assert.equal(I.trouverRangee(null, e), null);
});

test('le champ dans les deux formats, le saut vers la rangée, « Avancé » replié des deux côtés', () => {
  assert.ok(PAR.includes("{champReglage({ marginBottom: 10 })}\n          {railItem('hub'"), 'en tête du rail, sur l’ordinateur');
  assert.ok(PAR.includes("{champReglage({ marginTop: 14 })}\n                <nav aria-label={tr('Sections des paramètres')}"), 'au-dessus des onglets, au téléphone');
  assert.ok(PAR.includes('<div ref={contenuRef} style={{ minWidth: 0'), 'la rangée se cherche dans le contenu');
  assert.ok(PAR.includes("window.addEventListener('loggia-par-reglage', lire);"), 'Ctrl+K, Paramètres déjà ouverts');
  assert.ok(PAR.includes('if (e && e.a) setAvance(true);') && PAR.includes('if (e && e.o) setOngletRegle(e.o);'));
  // « Avancé » : les mêmes trois réglages, repliés, sur l'ordinateur et au téléphone.
  const pc = PAR.slice(PAR.indexOf("<Panneau titre={tr('Avancé')}"), PAR.indexOf("<Panneau titre={tr('Avancé')}") + 2600);
  const avPc = pc.slice(pc.indexOf('{avance && (<>'));
  assert.ok(avPc.indexOf("tr('Ouvrir Loggia au démarrage')") > 0 && avPc.indexOf("tr('Plan 3D')") > 0 && avPc.indexOf('<MargesAvancees ') > 0);
  assert.ok(pc.includes('aria-expanded={avance}'));
  const tel = PAR.slice(PAR.indexOf("<CarteTel style=\"tirets\" titre={tr('Avancé')}"), PAR.indexOf("<CarteTel style=\"tirets\" titre={tr('Avancé')}") + 3200);
  const avTel = tel.slice(tel.indexOf('{avance && ('));
  for (const m of ["tr('Plan 3D de la maison')", "tr(\"Page d'accueil\")", "<LigneTel ici titre={tr('Marge du haut')}", "<LigneTel ici titre={tr('Marge du bas')}"]) assert.ok(avTel.includes(m), m);
  assert.ok(tel.includes('aria-expanded={avance}'));
  assert.ok(!PAR.includes("tr('Langue et démarrage')") && !PAR.includes("tr('Avancé — marges de l’écran')"), 'les anciens titres sont partis');
  // Chaque rangée de l'index que « Avancé » cache le dit (`a`), et lui seul.
  assert.deepEqual(I.REGLAGES.filter(e => e.a).map(e => e.id), ['apparence/demarrage', 'apparence/plan-3d', 'apparence/marges']);
});

test('Ctrl+K propose les réglages et y mène ; les rangées portent la classe que l’éclat allume', () => {
  const ent = lire('src/chrome/entete.jsx');
  assert.ok(ent.includes("import { optionsReglages, sectionOuverte, demanderReglage, SECTIONS_REGLAGES } from '../reglagesindex.js';"));
  assert.ok(ent.includes('Object.keys(SECTIONS_REGLAGES).filter(s => sectionOuverte(s, droits))'), 'jamais d’une section fermée');
  assert.ok(ent.includes('act: (close) => { demanderReglage(o.id); onNav(\'parametres\'); close(); }'));
  assert.ok(lire('src/views/partel.jsx').includes('className="o-ligne-tel"') && lire('src/views/partel.jsx').includes('<div className="o-choix-tel">'));
  assert.ok(lire('src/ui.jsx').includes('<div className="o-regle-tete" style'));
  assert.match(lire('src/index.css'), /\.o-reglage-trouve \{ box-shadow: inset 0 0 0 2px var\(--o-accent\) !important;/);
});

test('quitter les Paramètres les referme ; y rester ou y être mené garde la section (08/11)', () => {
  const memoire = new Map();
  const vrai = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: k => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v), removeItem: k => memoire.delete(k) } });
  try {
    memoire.set('loggia-par-section', 'apparence');
    I.oublierSectionSiQuittee('parametres', 'parametres');
    assert.equal(memoire.get('loggia-par-section'), 'apparence', 'toucher à un réglage ne quitte pas la vue');
    I.oublierSectionSiQuittee('accueil', 'parametres');
    assert.equal(memoire.get('loggia-par-section'), 'apparence', 'Ctrl+K pose la section avant de naviguer : on ne l’efface pas en arrivant');
    I.oublierSectionSiQuittee('parametres', 'accueil');
    assert.equal(memoire.has('loggia-par-section'), false, 'on revient par la vue d’ensemble');
  } finally {
    if (vrai) Object.defineProperty(globalThis, 'sessionStorage', vrai); else delete globalThis.sessionStorage;
  }
  assert.ok(MONOLITHE.includes('oublierSectionSiQuittee(vueQuittee.current, view);'), 'au changement de vue');
  assert.ok(!PAR.includes("removeItem('loggia-par-section')"), 'jamais au démontage : un remontage ramènerait au sommaire à chaque réglage touché');
});
