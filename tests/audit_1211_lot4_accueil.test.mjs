// ─────────────────────────────────────────────────
// Rendu et information (audit du 12/11, lot 4) : R1, R2, R3, R5, R6, I1, I6.
//
// Joués quand le harnais le permet (l'histogramme de l'Énergie et le bandeau
// « Annuler », montés par tests/crochets.mjs) ; lus dans la source sinon.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monter, texteDe, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const { EnHistoBarres } = await import('../src/engraphes.jsx');
const { BandeauAnnuler } = await import('../src/chrome/bandeauannuler.jsx');
const { EVENEMENT_ANNULABLE } = await import('../src/annuler.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');

/* Le temps d'un test : de faux minuteurs, un faux `window` et l'état de Loggia vidé. */
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  try { return await fn(h, d); } finally { h.restaurer(); d.restaurer(); }
}

// ── R1 : le plan 3D se charge sur le squelette, à la même hauteur ───────────

test('R1 — le plan 3D attend sur le squelette des chargements, à sa hauteur d’attente', () => {
  const d = lire('src/accueil/dashboard.jsx');
  assert.ok(d.includes('<Suspense fallback={<div className="o-skel" aria-hidden="true" style={{ minHeight: etroitPieces ? 320 : 420, borderRadius: 16 }} />}>'),
    'le repli du plan n’est plus le squelette, ou sa hauteur a changé (décalage de mise en page)');
  assert.ok(!d.includes('<Suspense fallback={<div style={{ minHeight: etroitPieces ? 320 : 420 }} />}>'), 'le repli vide est revenu');
  // Le squelette existe déjà : aucune classe neuve.
  assert.ok(lire('src/index.css').includes('.o-skel { background: linear-gradient('));
});

// ── R2 : l'histogramme de l'Énergie, au doigt ───────────────────────────────

const CASES = [{ label: '0 h', titre: 'De 0 h à 1 h' }, { label: '1 h', titre: 'De 1 h à 2 h' }, { label: '2 h', titre: 'De 2 h à 3 h' }];
const SERIES = [{ nom: 'Consommation', couleur: 'var(--o-accent)', valeurs: [1, 2, null] }];
const graphe = () => monter(EnHistoBarres, { cases: CASES, series: SERIES, unite: 'kWh', decimales: 1 });
const cadreDe = (m) => m.trouver(e => e.props && typeof e.props.onPointerLeave === 'function')[0];
const zone = (m, i) => m.trouver(e => e.type === 'rect' && e.key === 'z' + i)[0];
const bulle = (m) => m.trouver(e => e.props && e.props.style && e.props.style.minWidth === 160)[0] || null;

test('R2 — au doigt, la valeur d’une barre reste quand le doigt se lève ; la souris garde son survol', () => dans(() => {
  const m = graphe();
  assert.equal(bulle(m), null);
  m.appuyer(zone(m, 1), 'onPointerDown');
  assert.ok(bulle(m) && texteDe(bulle(m)).includes('De 1 h à 2 h'), 'le toucher n’ouvre pas la bulle');
  // Un doigt qui se lève « quitte » le graphe : la bulle reste.
  cadreDe(m).props.onPointerLeave({ pointerType: 'touch' }); m.rendre();
  assert.ok(bulle(m), 'la bulle s’efface quand le doigt se lève');
  cadreDe(m).props.onPointerLeave({ pointerType: 'pen' }); m.rendre();
  assert.ok(bulle(m), 'un stylet ne survole pas : il garde la bulle comme le doigt');
  // Une autre barre touchée : la bulle passe à elle.
  m.appuyer(zone(m, 0), 'onPointerDown');
  assert.ok(texteDe(bulle(m)).includes('De 0 h à 1 h') && !texteDe(bulle(m)).includes('De 1 h à 2 h'));
  // La souris qui sort : la bulle part, comme avant.
  cadreDe(m).props.onPointerLeave({ pointerType: 'mouse' }); m.rendre();
  assert.equal(bulle(m), null, 'la souris sortie laisse la bulle');
}));

test('R2 — un toucher AILLEURS dans la page referme la bulle ; dans le graphe, non', () => dans((h, d) => {
  const m = graphe();
  assert.equal(d.ecouteurs('pointerdown'), 0, 'sans bulle, rien n’écoute la page');
  m.appuyer(zone(m, 1), 'onPointerDown');
  assert.equal(d.ecouteurs('pointerdown'), 1, 'la bulle ouverte n’écoute pas le toucher suivant');
  // Le harnais ne pose pas les `ref` : le cadre se simule.
  cadreDe(m).ref.current = { contains: (t) => t === 'dedans' };
  d.emettre('pointerdown', { target: 'dedans' }); m.rendre();
  assert.ok(bulle(m), 'un toucher dans le graphe ferme la bulle');
  d.emettre('pointerdown', { target: 'dehors' }); m.rendre();
  assert.equal(bulle(m), null, 'un toucher ailleurs laisse la bulle');
  assert.equal(d.ecouteurs('pointerdown'), 0, 'l’écoute de la page reste posée après la fermeture');
}));

test('R2 — un résumé en texte, hors de l’écran : par série, le total et la case la plus haute', () => dans(() => {
  const m = graphe();
  const resume = m.trouver(e => e.type === 'p' && e.props.className === 'o-vh')[0];
  assert.ok(resume, 'pas de résumé');
  const t = m.texte();
  const r = t.slice(0, t.indexOf('Consommation : ') + 200);
  assert.ok(r.includes('Consommation : ') && r.includes('au total, au plus haut') && r.includes('(De 1 h à 2 h)'), r);
  // Rien de mesuré : le résumé le dit au lieu de se taire.
  const vide = monter(EnHistoBarres, { cases: CASES, series: [{ nom: 'Production', couleur: 'var(--o-gold)', valeurs: [null, null, null] }] });
  const rv = vide.trouver(e => e.type === 'p' && e.props.className === 'o-vh')[0];
  assert.equal(rv.props.children, 'pas encore de données');
}));

// ── R3 : l'Aperçu de l'Énergie ne garde plus de blanc en bas ─────────────────

test('R3 — l’aperçu, étiré à la hauteur du tarif, centre ses faces au lieu de laisser le blanc en bas', () => {
  const e = lire('src/views/energie.jsx');
  assert.ok(e.includes("<div style={{ flex: '2 1 620px', minWidth: 0, display: 'flex' }}><section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box',"),
    'la carte de l’aperçu n’est plus une colonne');
  assert.ok(e.includes("<div style={{ position: 'relative', marginTop: 20, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>"),
    'les deux faces ne prennent plus le surplus de hauteur');
  // Les voisins gardent la même hauteur (règle de la maison) : l'étirement reste.
  assert.ok(e.includes("<div className=\"grid-ehero\" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>"));
});

// ── R5 : la barre des pièces dit qu'elle défile ─────────────────────────────

test('R5 — la barre des pièces a les flèches de la rangée des scénarios, à la souris, quand elle déborde', () => {
  const p = lire('src/vues/piece.jsx');
  const debut = p.indexOf('function RoomNav(');
  const nav = p.slice(debut, p.indexOf('\n}\n', debut));
  assert.ok(p.includes("import { bordsDefilement } from '../scenarios.js';"), 'la mesure des bords n’est pas celle de l’Accueil');
  assert.ok(nav.includes('const n = bordsDefilement(w.scrollLeft, w.scrollWidth, w.clientWidth);'));
  // Mesurée avant la peinture, et pas seulement par `ResizeObserver` (taille émulée de l'aperçu).
  assert.ok(nav.includes('useLayoutEffect(() => {') && nav.includes("window.addEventListener('resize', mesurer);") && nav.includes("w.addEventListener('scroll', mesurer, { passive: true });"));
  assert.ok(nav.includes("window.removeEventListener('resize', mesurer);") && nav.includes("w.removeEventListener('scroll', mesurer);"), 'les écoutes ne se retirent pas');
  // Les flèches : seulement quand ça déborde, la classe qui les cache au doigt, nommées.
  assert.ok(nav.includes('{(bords.avant || bords.apres) && (<>'));
  assert.equal(nav.split('className="o-qscenes-fleche"').length - 1, 2);
  assert.ok(nav.includes("aria-label={tr('Pièces précédentes')}") && nav.includes("aria-label={tr('Pièces suivantes')}"));
  assert.ok(nav.includes('disabled={!bords.avant}') && nav.includes('disabled={!bords.apres}'));
  // La barre garde son nom et son centrage, la rangée défile toujours.
  assert.ok(nav.includes("<div ref={wrapRef} className=\"o-room-scroll\" role=\"group\" aria-label={tr('Pièces')} style={{ flex: 1, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, minWidth: 0 }}>"));
  assert.ok(lire('src/index.css').includes('@media (pointer: coarse) { .o-qscenes-fleche { display: none !important; } }'), 'au doigt, les flèches se montreraient');
});

// ── R6 + I6 : le bandeau « Annuler » ────────────────────────────────────────

test('R6 — le bandeau ne compte plus deux fois la zone de sécurité de l’iPhone', () => {
  const b = lire('src/chrome/bandeauannuler.jsx');
  assert.ok(b.includes("bottom: 'calc(24px + max(var(--o-navh, 0px), var(--o-safe-bottom, 0px)))'"));
  assert.ok(!b.includes('var(--o-navh, 0px) + var(--o-safe-bottom'), 'la somme est revenue');
  // C'est bien la barre du bas qui porte déjà la zone de sécurité dans sa hauteur.
  const nav = lire('src/chrome/navmobile.jsx');
  assert.ok(nav.includes("paddingBottom: 'calc(var(--o-safe-bottom, 0px) + 6px)'") && nav.includes("setProperty('--o-navh', Math.round(el ? el.getBoundingClientRect().height : 0) + 'px')"));
});

test('I6 — le geste et son annulation se disent, par une région montée en permanence', () => dans(() => {
  const ecoutes = new Map();
  globalThis.window.addEventListener = (type, f) => { ecoutes.set(type, f); };
  globalThis.window.removeEventListener = (type) => { ecoutes.delete(type); };
  const m = monter(BandeauAnnuler, {});
  const region = () => m.trouver(e => e.props && e.props.role === 'status')[0];
  // Avant tout geste, la région est déjà là, vide : c'est son CHANGEMENT qui se dit.
  assert.ok(region() && region().props.className === 'o-vh' && 'data-annonce' in region().props);
  assert.equal(m.texte(), '');
  ecoutes.get(EVENEMENT_ANNULABLE)({ detail: { texte: 'Lumières éteintes' } }); m.rendre();
  assert.equal(m.trouver(e => e.props && e.props.role === 'status').length, 1, 'deux régions : le geste se dirait deux fois');
  assert.equal(region().props.children, 'Lumières éteintes');
  const bouton = m.trouver(e => e.type === 'button')[0];
  m.appuyer(bouton);
  assert.equal(region().props.children, 'Annulé', 'l’annulation ne se dit pas');
  assert.equal(m.trouver(e => e.type === 'button').length, 0, 'le bandeau reste après « Annuler »');
}));

// ── I6 : la recherche, au lecteur d'écran ───────────────────────────────────

test('I6 — la recherche suit le motif de la liste à suggestions : combobox, listbox, option choisie désignée', () => {
  const e = lire('src/chrome/entete.jsx');
  const debut = e.indexOf('function SearchSheet(');
  const corps = e.slice(debut, e.indexOf('\n}\n', debut));
  assert.ok(corps.includes('const idListe = useId();') && corps.includes("const idOption = (i) => idListe + '-o' + i;"));
  assert.ok(corps.includes('role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={idListe}'));
  assert.ok(corps.includes('aria-activedescendant={selIdx >= 0 ? idOption(selIdx) : undefined}'), 'la sélection des flèches ne se dit pas');
  assert.ok(corps.includes("id={idListe} role={results.length ? 'listbox' : undefined}"));
  assert.ok(corps.includes('id={idOption(i)} role="option" aria-selected={i === selIdx} aria-describedby={idGroupe} tabIndex={-1}'));
  assert.ok(!corps.includes('role="button" tabIndex={0}\n'), 'une ligne de résultat est encore un bouton');
  // Les flèches et Entrée restent au champ.
  assert.ok(corps.includes("if (e.key === 'ArrowDown')") && corps.includes("else if (e.key === 'Enter') { e.preventDefault(); if (selIdx >= 0) results[selIdx].act(close); }"));
  // B15 : la clé de rendu de chaque ligne reste la sienne.
  assert.ok(corps.includes('<div key={r.cle}>'));
});

// ── I1 : une liste vide le dit ──────────────────────────────────────────────

test('I1 — Piles, Caméras et Scénarios disent qu’ils sont vides', () => {
  const en = lire('src/views/energie.jsx');
  assert.ok(en.includes("{(pilesSurveiller > 0 || pilesFiltre === 'surveiller') && ("), 'le filtre posé disparaît quand sa liste se vide : plus de retour à « Toutes »');
  assert.ok(en.includes("{pilesVues.length === 0 && (") && en.includes("{tr('Tout va bien')}</div>"));
  const s = lire('src/views/securite.jsx');
  assert.ok(s.includes("{cams.length === 0 && (") && s.includes("{tr('Aucune caméra')}</div>"));
  const v = lire('src/vues/scenarios.jsx');
  assert.ok(v.includes("{!edit && sc.etat && !sc.err && !liste.length && (") && v.includes("{tr('Aucun scénario')}</div>"),
    'avant la réponse du composant, ou sur une erreur déjà écrite, rien ne doit se dire');
});
