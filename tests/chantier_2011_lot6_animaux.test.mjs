// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 6 (A12) : la litière et la fontaine.
//
//  — la litière : les passages du jour en chiffre (le compteur, sinon la somme de ceux de chaque chat), la phrase par priorité
//    (muette, bac à vider, litière à remettre, puis l'état en mots — Litter-Robot, PetKit, Petlibro), la plaque ;
//  — la fontaine : le filtre (sinon l'eau) en chiffre, la phrase (muette, à remplir, filtre à changer, la pompe), les jours ;
//  — la popup : une rangée sans entité ne s'affiche pas, la pompe en bascule, « Filtre remplacé » en deux appuis, « L'appareil » ;
//  — jamais de commande pour la litière, jamais d'entité en dur.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

const { vueAnimal } = await import('../src/animauxvue.js');
const { composant, rendre } = await import('./rendu.mjs');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const st = (etat, attrs = {}) => ({ state: etat, attributes: attrs, last_changed: '2026-11-21T08:00:00Z' });

/* ════════════ LA LITIÈRE ════════════ */

const LITIERE = { genre: 'litiere', appareil: 'd1', nom: 'Litière', etat: 'sensor.l_code', tiroir: 'sensor.l_tiroir', sable: 'sensor.l_sable', passages: 'sensor.l_passages', bac: null, sableBas: null, tremie: null, visites: null };
const litiere = (code, plus = {}) => ({
  'sensor.l_code': st(code), 'sensor.l_tiroir': st('40', { unit_of_measurement: '%' }), 'sensor.l_sable': st('70', { unit_of_measurement: '%' }),
  'sensor.l_passages': st('5'), ...plus,
});

test('litière : les passages du jour sont le chiffre du haut, nommé', () => {
  const v = vueAnimal({ c: LITIERE, S: litiere('rdy'), nom: 'Litière du salon' });
  assert.deepEqual(v.chiffre, { v: '5', u: '', nom: 'Passages du jour' });
  assert.equal(v.nom, 'Litière du salon');
  assert.equal(v.icone, 'paw');
});

test('litière : sans compteur, la SOMME des passages de chaque chat ; le détail porte le nom sans « Passages… » répété', () => {
  const c = { ...LITIERE, passages: null, visites: ['sensor.felix_visits', 'sensor.luna_visits'] };
  const S = { ...litiere('rdy'), 'sensor.felix_visits': st('3', { friendly_name: 'Félix Passages aujourd’hui' }), 'sensor.luna_visits': st('4', { friendly_name: 'Luna Passages aujourd’hui' }) };
  const v = vueAnimal({ c, S });
  assert.equal(v.chiffre.v, '7');
  assert.deepEqual(v.fiche.passages.detail.map(d => [d.nom, d.n]), [['Félix', '3'], ['Luna', '4']]);
  // Un seul chat : le total seul.
  const un = vueAnimal({ c: { ...c, visites: ['sensor.felix_visits'] }, S });
  assert.equal(un.chiffre.v, '3');
  assert.deepEqual(un.fiche.passages.detail, []);
  // Le compteur de l'appareil prime sur la somme.
  assert.equal(vueAnimal({ c: { ...c, passages: 'sensor.l_passages' }, S }).chiffre.v, '5');
  // Rien : pas de chiffre.
  assert.equal(vueAnimal({ c: { ...LITIERE, passages: null }, S: litiere('rdy') }).chiffre, null);
});

test('litière : la phrase par priorité — muette, bac à vider, litière à remettre, puis l’état', () => {
  const mute = vueAnimal({ c: LITIERE, S: { 'sensor.l_code': st('unavailable'), 'sensor.l_tiroir': st('unknown') } });
  assert.equal(mute.mort, true);
  assert.equal(mute.phrase.texte, 'Indisponible');
  assert.equal(mute.chiffre, null);
  // Le bac plein (le code de Litter-Robot) passe avant le sable bas et avant l'état.
  const plein = vueAnimal({ c: { ...LITIERE, sableBas: 'binary_sensor.l_bas' }, S: litiere('dfs', { 'binary_sensor.l_bas': st('on') }) });
  assert.deepEqual([plein.phrase.texte, plein.phrase.encre, plein.etat], ['Bac à vider', 'var(--o-bad)', 'plein']);
  // Le bac plein d'un binaire (PetKit).
  assert.equal(vueAnimal({ c: { ...LITIERE, bac: 'binary_sensor.l_bac' }, S: litiere('rdy', { 'binary_sensor.l_bac': st('on') }) }).phrase.texte, 'Bac à vider');
  const bas = vueAnimal({ c: { ...LITIERE, sableBas: 'binary_sensor.l_bas' }, S: litiere('ccp', { 'binary_sensor.l_bas': st('on') }) });
  assert.deepEqual([bas.phrase.texte, bas.phrase.encre, bas.etat], ['Litière à remettre', 'var(--o-warn)', 'bas']);
  // La trémie qui se vide dit aussi « à remettre ».
  assert.equal(vueAnimal({ c: { ...LITIERE, tremie: 'sensor.l_tremie' }, S: litiere('rdy', { 'sensor.l_tremie': st('empty') }) }).phrase.texte, 'Litière à remettre');
  assert.equal(vueAnimal({ c: LITIERE, S: litiere('rdy') }).phrase.texte, 'Prête');
});

test('litière : l’état en mots — Litter-Robot, PetKit, Petlibro', () => {
  const dit = (e) => { const v = vueAnimal({ c: LITIERE, S: litiere(e) }); return v.phrase.texte; };
  const LR = { rdy: 'Prête', ccc: 'Prête', ccp: 'Nettoie', cd: 'Chat dedans', df1: 'Bac presque plein', df2: 'Bac presque plein', ec: 'Vide le bac', p: 'En pause', off: 'Éteinte', offline: 'Hors ligne', br: 'Capot retiré', pwru: 'Démarrage', pwrd: 'Démarrage', csf: 'Défaut', otf: 'Défaut' };
  Object.keys(LR).forEach(k => assert.equal(dit(k), LR[k], 'Litter-Robot ' + k));
  const PK = { idle: 'Prête', cleaning: 'Nettoie', cleaning_paused_pet_entered: 'En pause', paused_pet_using: 'En pause', dumping_litter: 'Vide le bac', dumping_paused: 'En pause', maintenance_mode: 'Maintenance', resetting: 'Réglage', resetting_device: 'Réglage', leveling: 'Réglage', calibrating: 'Réglage', cleaning_litter_box_paused: 'En pause' };
  Object.keys(PK).forEach(k => assert.equal(dit(k), PK[k], 'PetKit ' + k));
  assert.equal(dit('IDLE'), 'Prête');
  assert.equal(dit('RUNNING'), 'Nettoie');
  // Un état qu'on ne sait pas dire ne s'invente pas.
  assert.equal(dit('odor_removal'), '');
  assert.equal(dit('unknown_safe_warn_state'), '');
});

test('litière : la plaque — rouge, ambre, verte au travail, grise sinon', () => {
  const P = (code, plus, c = LITIERE) => vueAnimal({ c, S: litiere(code, plus) }).plaque;
  assert.equal(P('dfs')[1], 'var(--o-bad)');
  assert.equal(P('rdy', { 'binary_sensor.b': st('on') }, { ...LITIERE, sableBas: 'binary_sensor.b' })[1], 'var(--o-warn)');
  assert.equal(P('ccp')[1], 'var(--o-ok)');
  assert.equal(P('cleaning')[1], 'var(--o-ok)');
  assert.equal(P('cleaning_paused')[1], 'var(--o-text1)', 'en pause : au repos, pas au travail');
  assert.deepEqual(P('rdy'), ['var(--o-s1)', 'var(--o-text1)']);
  assert.equal(vueAnimal({ c: LITIERE, S: { 'sensor.l_code': st('unavailable') } }).plaque[1], 'var(--o-text3)');
});

test('litière : la popup — état, bac, sable, passages ; une rangée sans entité n’y est pas', () => {
  const v = vueAnimal({ c: LITIERE, S: litiere('rdy') });
  assert.deepEqual(v.fiche.etat.texte, 'Prête');
  assert.equal(v.fiche.bac.texte, '40 %');
  assert.equal(v.fiche.sable.texte, '70 %');
  assert.equal(v.fiche.passages.texte, '5');
  const seul = vueAnimal({ c: { genre: 'litiere', bac: 'binary_sensor.l_bac' }, S: { 'binary_sensor.l_bac': st('off') } });
  assert.equal(seul.fiche.bac.texte, 'Pas plein');
  assert.equal(seul.fiche.etat, null);
  assert.equal(seul.fiche.sable, null);
  assert.equal(seul.fiche.passages, null);
  assert.equal(vueAnimal({ c: LITIERE, S: litiere('dfs') }).fiche.bac.texte, 'Plein');
});

/* ════════════ LA FONTAINE ════════════ */

const FONTAINE = { genre: 'fontaine', appareil: 'd2', nom: 'Fontaine', eauBasse: 'binary_sensor.f_bas', eau: null, filtre: 'sensor.f_filtre', filtreJours: 'sensor.f_jours', filtreChanger: null, pompe: 'switch.f_pompe', remise: 'button.f_remise' };
const fontaine = (plus = {}) => ({
  'binary_sensor.f_bas': st('off'), 'sensor.f_filtre': st('78', { unit_of_measurement: '%' }), 'sensor.f_jours': st('12', { unit_of_measurement: 'd' }),
  'switch.f_pompe': st('on'), 'button.f_remise': st('unknown'), ...plus,
});

test('fontaine : le filtre en chiffre, sinon l’eau ; l’unité est celle de l’entité', () => {
  const v = vueAnimal({ c: FONTAINE, S: fontaine() });
  assert.deepEqual(v.chiffre, { v: '78', u: '%', nom: 'Filtre' });
  assert.equal(v.icone, 'water');
  const eau = vueAnimal({ c: { ...FONTAINE, filtre: null, eau: 'sensor.f_eau' }, S: fontaine({ 'sensor.f_eau': st('64', { unit_of_measurement: '%' }) }) });
  assert.deepEqual(eau.chiffre, { v: '64', u: '%', nom: 'Eau' });
  assert.equal(vueAnimal({ c: { ...FONTAINE, filtre: null }, S: fontaine() }).chiffre, null);
});

test('fontaine : la phrase — muette, à remplir, filtre à changer, puis la pompe et les jours', () => {
  assert.equal(vueAnimal({ c: FONTAINE, S: { 'switch.f_pompe': st('unavailable') } }).phrase.texte, 'Indisponible');
  const bas = vueAnimal({ c: FONTAINE, S: fontaine({ 'binary_sensor.f_bas': st('on') }) });
  assert.deepEqual([bas.phrase.texte, bas.phrase.encre, bas.etat], ['À remplir', 'var(--o-warn)', 'remplir']);
  // Le filtre usé : son binaire, ou 0 % — jamais un seuil deviné.
  const use = vueAnimal({ c: { ...FONTAINE, filtreChanger: 'binary_sensor.f_changer' }, S: fontaine({ 'binary_sensor.f_changer': st('on') }) });
  assert.deepEqual([use.phrase.texte, use.phrase.encre, use.etat], ['Filtre à changer', 'var(--o-warn)', 'filtre']);
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'sensor.f_filtre': st('0', { unit_of_measurement: '%' }) }) }).phrase.texte, 'Filtre à changer');
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'sensor.f_filtre': st('5', { unit_of_measurement: '%' }), 'sensor.f_jours': st('3', { unit_of_measurement: 'd' }) }) }).phrase.texte, 'En marche · 3 j', '5 % n’est pas « usé » : aucun seuil choisi ici');
  // L'eau basse passe avant le filtre.
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'binary_sensor.f_bas': st('on'), 'sensor.f_filtre': st('0') }) }).phrase.texte, 'À remplir');
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine() }).phrase.texte, 'En marche · 12 j');
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'switch.f_pompe': st('off') }) }).phrase.texte, 'Arrêtée · 12 j');
  // Les jours : l'unité de l'entité ; sans unité, rien.
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'sensor.f_jours': st('12') }) }).phrase.texte, 'En marche');
  assert.equal(vueAnimal({ c: { ...FONTAINE, filtreJours: null }, S: fontaine() }).phrase.texte, 'En marche');
});

test('fontaine : la plaque — ambre, bleue d’accent en marche, grise sinon', () => {
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'binary_sensor.f_bas': st('on') }) }).plaque[1], 'var(--o-warn)');
  assert.deepEqual(vueAnimal({ c: FONTAINE, S: fontaine() }).plaque, ['var(--o-accent-fond)', '#fff']);
  assert.deepEqual(vueAnimal({ c: FONTAINE, S: fontaine({ 'switch.f_pompe': st('off') }) }).plaque, ['var(--o-s1)', 'var(--o-text1)']);
  assert.equal(vueAnimal({ c: FONTAINE, S: {} }).plaque[1], 'var(--o-text3)');
});

test('fontaine : la popup — eau, filtre et jours, pompe, remise ; sans entité, pas de rangée', () => {
  const v = vueAnimal({ c: FONTAINE, S: fontaine() });
  assert.equal(v.fiche.niveau.texte, 'Suffisante');
  assert.equal(v.fiche.filtre.texte, '78 % · 12 j');
  assert.deepEqual(v.fiche.pompe, { id: 'switch.f_pompe', on: true });
  assert.equal(v.fiche.remise, 'button.f_remise', 'un bouton « unknown » reste pressable');
  assert.equal(vueAnimal({ c: FONTAINE, S: fontaine({ 'binary_sensor.f_bas': st('on') }) }).fiche.niveau.texte, 'À remplir');
  assert.equal(vueAnimal({ c: { ...FONTAINE, eau: 'sensor.f_eau' }, S: fontaine({ 'sensor.f_eau': st('64', { unit_of_measurement: '%' }) }) }).fiche.niveau.texte, '64 %');
  const nu = vueAnimal({ c: { genre: 'fontaine', filtre: 'sensor.f_filtre' }, S: fontaine() });
  assert.equal(nu.fiche.niveau, null);
  assert.equal(nu.fiche.pompe, null);
  assert.equal(nu.fiche.remise, null);
  assert.equal(vueAnimal({ c: { ...FONTAINE, remise: 'button.f_remise' }, S: fontaine({ 'button.f_remise': st('unavailable') }) }).fiche.remise, null);
});

test('un genre qui n’est pas un animal : rien', () => {
  assert.equal(vueAnimal({ c: { genre: 'voiture' }, S: {} }), null);
  assert.equal(vueAnimal({ c: null, S: {} }), null);
});

/* ════════════ L'ÉCRAN ════════════ */

const hass = (S) => ({ states: S, callService: () => Promise.resolve() });

test('rendu : la carte large de la litière — plaque, chiffre nommé, nom, phrase', async () => {
  const Carte = await composant('animaux.jsx', 'CarteAnimal');
  const html = rendre(Carte, { c: LITIERE, hass: hass(litiere('ccp')), nom: 'Litière du salon', chip: false, onOpen: () => {} });
  assert.match(html, /o-rmcard o-gabarit/);
  assert.match(html, /Litière du salon/);
  assert.match(html, />Nettoie</);
  assert.match(html, /Passages du jour/);
  assert.match(html, />5</);
});

test('rendu : la carte compacte de la fontaine, muette — « Indisponible » en rouge, sans chiffre', async () => {
  const Carte = await composant('animaux.jsx', 'CarteAnimal');
  const html = rendre(Carte, { c: FONTAINE, hass: hass({ 'switch.f_pompe': st('unavailable') }), nom: 'Fontaine', chip: true, onOpen: null });
  assert.match(html, /o-panne/);
  assert.match(html, /Indisponible/);
  assert.match(html, /var\(--o-bad\)/);
  assert.doesNotMatch(html, /o-cvmesure/);
});

test('rendu : la popup de la fontaine — pompe en bascule, « Filtre remplacé », « L’appareil »', async () => {
  const Fiche = await composant('animaux.jsx', 'FicheAnimal');
  const html = rendre(Fiche, { c: FONTAINE, hass: hass(fontaine()), nom: 'Fontaine', onFiche: () => {} });
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /Filtre remplacé/);
  assert.match(html, /L’appareil/);
  assert.match(html, /En marche · 12 j/);
  assert.equal((html.match(/data-croix/g) || []).length, 1, 'une seule croix, celle de l’en-tête');
});

test('rendu : la popup de la litière — aucune commande, le détail par chat', async () => {
  const Fiche = await composant('animaux.jsx', 'FicheAnimal');
  const c = { ...LITIERE, passages: null, visites: ['sensor.felix_visits', 'sensor.luna_visits'] };
  const S = { ...litiere('rdy'), 'sensor.felix_visits': st('3', { friendly_name: 'Félix Passages aujourd’hui' }), 'sensor.luna_visits': st('4', { friendly_name: 'Luna Passages aujourd’hui' }) };
  const html = rendre(Fiche, { c, hass: hass(S), nom: 'Litière', onFiche: () => {} });
  assert.doesNotMatch(html, /role="switch"/);
  assert.doesNotMatch(html, /Confirmer|Remplacé/);
  assert.match(html, /Félix/);
  assert.match(html, /Luna/);
  assert.match(html, /Passages du jour/);
  assert.doesNotMatch(html, /Félix Passages/);
  // Sans pied : pas de « L'appareil » quand l'écran ne sait pas ouvrir la fiche.
  assert.doesNotMatch(rendre(Fiche, { c, hass: hass(S), nom: 'Litière' }), /L’appareil/);
});

/* ════════════ LE BRANCHEMENT, LU DANS LA SOURCE ════════════ */

test('source : la carte lit la vue, la fiche commande par les services de la maison', () => {
  const jsx = lire('src/animaux.jsx');
  const vue = lire('src/animauxvue.js');
  assert.match(jsx, /vueAnimal\(\{ c, S, nom \}\)/);
  assert.match(jsx, /export function CarteAnimal/);
  assert.match(jsx, /export function FicheAnimal/);
  assert.match(jsx, /EnteteFiche/);
  assert.match(jsx, /onFiche\(v\.ancre\)/);
  assert.match(jsx, /'switch', marche \? 'turn_off' : 'turn_on'/);
  assert.match(jsx, /'button', 'press'/);
  assert.match(jsx, /useOptimiste/);
  assert.match(jsx, /<BoutonConfirme/);
  assert.match(jsx, /RmBascule/);
  // Les lecteurs de la découverte, pas leur copie.
  assert.match(vue, /import \{[^}]*bacPlein[^}]*sableBas[^}]*filtreUse[^}]*\} from '\.\/composes\.js'/);
  // Rien de la voiture : aucune clé, aucune commande de verrou ici.
  assert.doesNotMatch(jsx + vue, /lock\.|Déverrouiller|unlock/);
  // Aucun entity_id en dur, aucune couleur en dur (sauf le blanc sur l'accent), aucun <select> natif.
  assert.doesNotMatch(jsx + vue, /\b(sensor|binary_sensor|switch|button)\.[a-z_]+\b(?!\s*\))/, 'aucun entity_id en dur');
  assert.doesNotMatch(jsx + vue, /#[0-9a-fA-F]{3,6}\b(?<!#fff)/);
  assert.doesNotMatch(jsx, /<select/);
  assert.doesNotMatch(jsx + vue, /localeCompare/);
  // Les icônes de la plaque.
  assert.match(vue, /icone: 'paw'/);
  assert.match(vue, /icone: 'water'/);
});

test('source : fichiers en LF', () => {
  ['src/animaux.jsx', 'src/animauxvue.js'].forEach(p => assert.equal(readFileSync(new URL('../' + p, import.meta.url), 'utf8').indexOf('\r'), -1, p));
});
