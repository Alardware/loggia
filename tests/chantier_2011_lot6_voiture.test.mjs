// ─────────────────────────────────────────────────────────────────────────────
// Chantier du 20/11, lot 6, A11 : la voiture (ADR 0386).
//
// La logique pure (`voiturevue.js`) : la phrase et sa priorité, la plaque, le chiffre du haut (batterie, sinon carburant),
// l'autonomie et son unité, les rangées de la fiche, le seul geste (« Verrouiller »). Puis le rendu de la carte et de la fiche,
// et la lecture des sources pour le branchement : aucune commande autre que « Verrouiller », « L'appareil » en pied, une croix.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { vueVoiture, nomSansAppareil, idPrincipal } = await import('../src/voiturevue.js');
const { CarteVoiture, FicheVoiture } = await import('../src/voiture.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const NB = ' ';

const TU = new Date().toISOString();
const st = (id, state, attributes = {}) => ({ entity_id: id, state: String(state), attributes, last_changed: TU, last_updated: TU });
const hassDe = (...sts) => ({ states: Object.fromEntries(sts.map(s => [s.entity_id, s])), callService: () => Promise.resolve(), callWS: () => new Promise(() => {}) });
const rendre = (C, p) => renderToStaticMarkup(createElement(C, p));

// Une voiture découverte : tous les rôles (les `entity_id` sont ceux du test, jamais ceux du code).
const C = {
  appareil: 'dev1', nom: 'Ma voiture', genre: 'voiture',
  compteur: 'sensor.v_odo', autonomie: 'sensor.v_range', autonomies: ['sensor.v_range', 'sensor.v_range_fuel'],
  position: 'device_tracker.v_pos', verrou: 'lock.v_portes', verrous: [], prise: 'binary_sensor.v_prise', charge: 'binary_sensor.v_charge',
  batterie: 'sensor.v_batt', carburant: 'sensor.v_fuel',
  ouvrants: ['binary_sensor.v_porte', 'binary_sensor.v_coffre'], pneus: ['binary_sensor.v_pneu_av', 'binary_sensor.v_pneu_ar'],
  pressions: ['sensor.v_p_av', 'sensor.v_p_ar'],
};
const ETATS = () => [
  st('sensor.v_odo', '45210', { unit_of_measurement: 'km', friendly_name: 'Ma voiture Odomètre' }),
  st('sensor.v_range', '312.4', { unit_of_measurement: 'km', friendly_name: 'Ma voiture Autonomie totale' }),
  st('sensor.v_range_fuel', '180', { unit_of_measurement: 'km', friendly_name: 'Ma voiture Autonomie du réservoir' }),
  st('device_tracker.v_pos', 'home'),
  st('lock.v_portes', 'locked'),
  st('binary_sensor.v_prise', 'off'),
  st('binary_sensor.v_charge', 'off'),
  st('sensor.v_batt', '78', { unit_of_measurement: '%' }),
  st('sensor.v_fuel', '40', { unit_of_measurement: '%' }),
  st('binary_sensor.v_porte', 'off', { friendly_name: 'Ma voiture Porte avant' }),
  st('binary_sensor.v_coffre', 'off', { friendly_name: 'Ma voiture Coffre' }),
  st('binary_sensor.v_pneu_av', 'off', { friendly_name: 'Ma voiture Pneu avant' }),
  st('binary_sensor.v_pneu_ar', 'off', { friendly_name: 'Ma voiture Pneu arrière' }),
  st('sensor.v_p_av', '2.4', { unit_of_measurement: 'bar', friendly_name: 'Ma voiture Pneu avant' }),
  st('sensor.v_p_ar', '2.35', { unit_of_measurement: 'bar', friendly_name: 'Ma voiture Pneu arrière' }),
];
const monde = (...modifs) => {
  const m = Object.fromEntries(ETATS().map(s => [s.entity_id, s]));
  modifs.forEach(([id, etat, attr]) => { m[id] = st(id, etat, attr || (m[id] && m[id].attributes) || {}); });
  return m;
};
const vue = (...modifs) => vueVoiture({ c: C, S: monde(...modifs) });
const ligne = (v, cle) => v.lignes.find(l => l.cle === cle);

test('une voiture au repos : verrouillée, autonomie après le point médian, batterie en haut', () => {
  const v = vue();
  assert.equal(v.etat, 'verrouillee');
  assert.equal(v.phrase.texte, 'Verrouillée · 312' + NB + 'km');
  assert.equal(v.nom, 'Ma voiture');
  assert.deepEqual(v.chiffre && { v: v.chiffre.v, u: v.chiffre.u, nom: v.chiffre.nom }, { v: '78', u: '%', nom: 'Batterie' });
  assert.deepEqual(v.plaque, ['var(--o-s1)', 'var(--o-text1)']);
  assert.equal(v.position, 'À la maison');
});

test('priorité : muette, puis ouverte, puis en charge, puis branchée, puis le verrou', () => {
  const sous = { 'binary_sensor.v_charge': 'on', 'binary_sensor.v_prise': 'on', 'lock.v_portes': 'unlocked' };
  const m = (extra = []) => vue(...Object.entries(sous).map(([k, e]) => [k, e]), ...extra);
  assert.equal(m().etat, 'charge');
  assert.equal(m().phrase.texte, 'En charge · 312' + NB + 'km');
  assert.equal(m().phrase.encre, 'var(--o-ok)');
  assert.deepEqual(m().plaque, ['rgba(var(--o-ok-rgb),.18)', 'var(--o-ok)']);
  // Une portière ouverte passe devant la charge.
  const o = m([['binary_sensor.v_porte', 'on']]);
  assert.equal(o.etat, 'ouverte');
  assert.equal(o.phrase.texte.startsWith('Ouverte'), true);
  assert.equal(o.phrase.encre, 'var(--o-warn)');
  assert.deepEqual(o.plaque, ['rgba(var(--o-warn-rgb),.18)', 'var(--o-warn)']);
  // Branchée sans charger.
  assert.equal(vue(['binary_sensor.v_prise', 'on']).etat, 'branchee');
  // Déverrouillée : le ton d'attention.
  const d = vue(['lock.v_portes', 'unlocked']);
  assert.equal(d.etat, 'deverrouillee');
  assert.equal(d.phrase.encre, 'var(--o-warn2)');
});

test('un coffre (cover) ouvert compte comme un ouvrant ouvert, une vitre aussi', () => {
  const c = { ...C, ouvrants: ['cover.v_coffre'] };
  const S = { ...monde(), 'cover.v_coffre': st('cover.v_coffre', 'open', { friendly_name: 'Ma voiture Coffre' }) };
  const v = vueVoiture({ c, S });
  assert.equal(v.etat, 'ouverte');
  assert.equal(ligne(v, 'ouvrants').valeur, 'Coffre');
});

test('muette : toutes ses entités tues → « Indisponible », plaque grise, aucune rangée', () => {
  const S = Object.fromEntries(ETATS().map(s => [s.entity_id, st(s.entity_id, 'unavailable')]));
  const v = vueVoiture({ c: C, S });
  assert.equal(v.mort, true);
  assert.equal(v.phrase.texte, 'Indisponible');
  assert.equal(v.phrase.encre, 'var(--o-bad)');
  assert.deepEqual(v.plaque, ['var(--o-s1)', 'var(--o-text3)']);
  assert.equal(v.chiffre, null);
  assert.deepEqual(v.lignes, []);
  // Une seule entité vivante suffit : elle n'est plus morte.
  assert.equal(vueVoiture({ c: C, S: { ...S, 'sensor.v_batt': st('sensor.v_batt', '50', { unit_of_measurement: '%' }) } }).mort, false);
});

test('le chiffre du haut : la batterie, sinon le carburant ; l’unité vient de l’entité', () => {
  const sans = vue(['sensor.v_batt', 'unavailable']);
  assert.deepEqual({ v: sans.chiffre.v, u: sans.chiffre.u, nom: sans.chiffre.nom, batterie: sans.chiffre.batterie }, { v: '40', u: '%', nom: 'Carburant', batterie: false });
  const litres = vue(['sensor.v_batt', 'unknown'], ['sensor.v_fuel', '38.6', { unit_of_measurement: 'L' }]);
  assert.equal(litres.chiffre.u, 'L');
  assert.equal(litres.chiffre.v, '39');
  const rien = vue(['sensor.v_batt', 'unknown'], ['sensor.v_fuel', 'unknown']);
  assert.equal(rien.chiffre, null);
});

test('l’autonomie garde l’unité de l’entité, des miles aussi', () => {
  const mi = vue(['sensor.v_range', '200', { unit_of_measurement: 'mi' }]);
  assert.deepEqual(mi.autonomie, { valeur: '200', unite: 'mi' });
  assert.equal(mi.phrase.texte, 'Verrouillée · 200' + NB + 'mi');
  const sans = vue(['sensor.v_range', 'unavailable']);
  assert.equal(sans.autonomie, null);
  assert.equal(sans.phrase.texte, 'Verrouillée');
  // Pas d'unité publiée : on n'en invente pas.
  assert.equal(vue(['sensor.v_range', '200', {}]).phrase.texte, 'Verrouillée · 200');
});

test('la position : à la maison, le nom d’une zone, hors de la maison', () => {
  assert.equal(vue(['device_tracker.v_pos', 'not_home']).position, 'Hors de la maison');
  assert.equal(vue(['device_tracker.v_pos', 'Bureau']).position, 'Bureau');
  assert.equal(vue(['device_tracker.v_pos', 'unknown']).position, null);
});

test('les rangées de la fiche : celles dont l’entité existe, dans l’ordre', () => {
  const v = vue();
  assert.deepEqual(v.lignes.map(l => l.cle), ['batterie', 'carburant', 'autonomie:sensor.v_range', 'autonomie:sensor.v_range_fuel', 'kilometrage', 'recharge', 'verrou', 'ouvrants', 'pneus']);
  // Sans carburant ni compteur, ni prise : ces rangées-là ne sont pas.
  const c = { ...C, carburant: null, compteur: null, prise: null, charge: null, ouvrants: [], pneus: [], pressions: [] };
  const maigre = vueVoiture({ c, S: monde() });
  assert.deepEqual(maigre.lignes.map(l => l.cle), ['batterie', 'autonomie:sensor.v_range', 'autonomie:sensor.v_range_fuel', 'verrou']);
});

test('chaque autonomie porte le nom de l’entité, sans le nom de l’appareil devant', () => {
  const v = vue();
  assert.equal(ligne(v, 'autonomie:sensor.v_range').titre, 'Autonomie totale');
  assert.equal(ligne(v, 'autonomie:sensor.v_range_fuel').titre, 'Autonomie du réservoir');
  assert.equal(nomSansAppareil('Ma voiture - Odomètre', 'Ma voiture'), 'Odomètre');
  assert.equal(nomSansAppareil('Carbone', 'Car'), 'Carbone');
  assert.equal(nomSansAppareil('Ma voiture', 'Ma voiture'), 'Ma voiture');
  assert.equal(nomSansAppareil('Ma voiture Porte', null, 'ma voiture'), 'Porte');
});

test('kilométrage : le compteur avec son unité', () => {
  const l = ligne(vue(), 'kilometrage');
  assert.deepEqual({ valeur: l.valeur, unite: l.unite }, { valeur: (45210).toLocaleString('fr-FR'), unite: 'km' });
});

test('recharge : en charge, branchée, débranchée', () => {
  assert.equal(ligne(vue(['binary_sensor.v_charge', 'on']), 'recharge').valeur, 'En charge');
  assert.equal(ligne(vue(['binary_sensor.v_prise', 'on']), 'recharge').valeur, 'Branchée');
  assert.equal(ligne(vue(), 'recharge').valeur, 'Débranchée');
  // Sans prise, une charge à l'arrêt ne dit pas « Débranchée » : on ne le sait pas.
  const c = { ...C, prise: null };
  assert.equal(ligne(vueVoiture({ c, S: monde() }), 'recharge').valeur, 'Pas en charge');
});

test('verrou : « Verrouiller » seulement si déverrouillée ET c.verrou est une entité lock', () => {
  assert.equal(ligne(vue(), 'verrou').verrouiller, null);
  assert.equal(ligne(vue(['lock.v_portes', 'unlocked']), 'verrou').verrouiller, 'lock.v_portes');
  assert.equal(ligne(vue(['lock.v_portes', 'unlocked']), 'verrou').encre, 'var(--o-warn2)');
  // Des binaires de classe lock, `on` = déverrouillé : on le dit, on ne le pilote pas.
  const c = { ...C, verrou: null, verrous: ['binary_sensor.v_l1', 'binary_sensor.v_l2'] };
  const S = { ...monde(), 'binary_sensor.v_l1': st('binary_sensor.v_l1', 'off'), 'binary_sensor.v_l2': st('binary_sensor.v_l2', 'on') };
  const v = vueVoiture({ c, S });
  assert.equal(ligne(v, 'verrou').valeur, 'Déverrouillée');
  assert.equal(ligne(v, 'verrou').verrouiller, null);
  // Ni verrou ni binaire : la rangée n'existe pas.
  assert.equal(ligne(vueVoiture({ c: { ...C, verrou: null }, S: monde() }), 'verrou'), undefined);
});

test('ouvrants : ceux qui sont ouverts, par leur nom ; sinon « Tout est fermé »', () => {
  assert.equal(ligne(vue(), 'ouvrants').valeur, 'Tout est fermé');
  const o = ligne(vue(['binary_sensor.v_porte', 'on'], ['binary_sensor.v_coffre', 'on']), 'ouvrants');
  assert.equal(o.valeur, 'Porte avant, Coffre');
  assert.equal(o.encre, 'var(--o-warn)');
});

test('pneus : les pressions avec leur unité ; bas quand SON binaire le dit, jamais sous un seuil', () => {
  const v = vue();
  const p = ligne(v, 'pneus').items;
  assert.deepEqual(p.map(i => [i.nom, i.valeur, i.unite, i.bas]), [['Pneu avant', (2.4).toLocaleString('fr-FR'), 'bar', false], ['Pneu arrière', (2.35).toLocaleString('fr-FR'), 'bar', false]]);
  // 0,5 bar est une pression absurde, mais son binaire est éteint : elle n'est pas « basse ».
  assert.equal(ligne(vue(['sensor.v_p_av', '0.5']), 'pneus').items[0].bas, false);
  // Le binaire allumé la désigne.
  const bas = ligne(vue(['binary_sensor.v_pneu_ar', 'on']), 'pneus').items;
  assert.deepEqual(bas.map(i => i.bas), [false, true]);
  // Un binaire sans pression qui lui réponde se montre seul.
  const seul = vueVoiture({ c: { ...C, pressions: [] }, S: monde(['binary_sensor.v_pneu_av', 'on']) });
  assert.deepEqual(ligne(seul, 'pneus').items.map(i => [i.nom, i.valeur, i.bas]), [['Pneu avant', null, true]]);
});

test('idPrincipal : une entité de la voiture, jamais une inventée', () => {
  assert.equal(idPrincipal(C), 'sensor.v_batt');
  assert.equal(idPrincipal({ ...C, batterie: null, carburant: null, autonomie: null, compteur: null }), 'device_tracker.v_pos');
  assert.equal(idPrincipal(null), null);
  assert.equal(vueVoiture({ c: null }), null);
});

// ── Le rendu ────────────────────────────────────────────────────────────────

const Glyphe = ({ children }) => children;

test('la carte large : la plaque, le pourcentage nommé, le nom, la phrase', () => {
  const html = rendre(CarteVoiture, { c: C, hass: hassDe(...ETATS()), nom: 'Ma voiture', chip: false, onOpen: () => {}, Glyphe });
  assert.match(html, /o-gabarit/);
  assert.match(html, /Ma voiture/);
  assert.match(html, /Verrouillée · 312/);
  assert.match(html, />Batterie</);
  assert.match(html, />78</);
  assert.doesNotMatch(html, /o-panne/);
});

test('la carte compacte : plaque, nom, phrase, pourcentage à droite', () => {
  const html = rendre(CarteVoiture, { c: C, hass: hassDe(...ETATS()), nom: 'Ma voiture', chip: true, onOpen: null, Glyphe });
  assert.match(html, /o-cvdense/);
  assert.match(html, /o-cvmesure[^>]*>78 %</);
});

test('muette : « Indisponible depuis … » en rouge, le liseré de panne', () => {
  const hass = hassDe(...ETATS().map(s => st(s.entity_id, 'unavailable')));
  const html = rendre(CarteVoiture, { c: C, hass, nom: 'Ma voiture', chip: false, onOpen: null, Glyphe });
  assert.match(html, /o-panne/);
  assert.match(html, /Indisponible depuis/);
  assert.match(html, /var\(--o-bad\)/);
});

test('la fiche : la position en sous-nom, les rangées, « L’appareil » en pied', () => {
  const html = rendre(FicheVoiture, { c: C, hass: hassDe(...ETATS()), nom: 'Ma voiture', onFiche: () => {}, Glyphe });
  assert.match(html, /À la maison/);
  // ASSERTION MODIFIÉE (24/11, ADR 0392) : la batterie n'est plus une rangée, elle est en grand sous le dessin, avec sa barre.
  assert.match(html, /data-batterie=""/);
  assert.match(html, /data-ligne="pneus"/);
  assert.match(html, /Tout est fermé/);
  assert.match(html, /L’appareil/);
  // Verrouillée : pas de bouton « Verrouiller ».
  assert.doesNotMatch(html, /<button[^>]*>(<[^>]*>)*Verrouiller/);
});

test('la fiche d’une voiture déverrouillée offre « Verrouiller » ; jamais « Déverrouiller »', () => {
  const html = rendre(FicheVoiture, { c: C, hass: hassDe(...ETATS().map(s => (s.entity_id === 'lock.v_portes' ? st(s.entity_id, 'unlocked') : s))), nom: 'Ma voiture', onFiche: null, Glyphe });
  assert.match(html, /aria-label="Verrouiller Ma voiture"/);
  assert.doesNotMatch(html, /L’appareil/);
  const src = lire('src/voiture.jsx');
  /* ASSERTION MODIFIÉE (24/11, ADR 0392) : la climatisation et la charge ont leurs commandes, quand la voiture les publie (sa
   * demande, ses exemples). Toujours ni « Déverrouiller », ni ouvrir le pêne, ni klaxon, ni phares. */
  assert.doesNotMatch(src, /Déverrouiller\b|'lock', 'unlock'|'lock', 'open'|horn|honk|flash/);
});

test('un pneu bas se lit en --o-warn dans la fiche', () => {
  const hass = hassDe(...ETATS().map(s => (s.entity_id === 'binary_sensor.v_pneu_av' ? st(s.entity_id, 'on', s.attributes) : s)));
  const html = rendre(FicheVoiture, { c: C, hass, nom: 'Ma voiture', onFiche: null, Glyphe });
  assert.match(html, /data-pneu="bas"[^>]*>.*?var\(--o-warn\)/);
});

// ── Le branchement (lecture des sources) ────────────────────────────────────

test('branchement : la carte lit la vue, la fiche n’a qu’une croix, l’icône est car-side', () => {
  const carte = lire('src/voiture.jsx');
  assert.match(carte, /vueVoiture\(\{ c, S, nom \}\)/);
  assert.match(carte, /const ICONE = 'car-side'/);
  assert.match(carte, /export function CarteVoiture\(\{ c, hass, nom = null, chip = false, onOpen = null, Glyphe = Sans \}\)/);
  // ASSERTION MODIFIÉE (24/11, ADR 0392) : la fiche à onglets s'ouvre sur l'onglet demandé (les tests).
  assert.match(carte, /export function FicheVoiture\(\{ c, hass, nom = null, onFiche = null, Glyphe = null, ongletDepart = 'accueil' \}\)/);
  assert.match(carte, /<EnteteFiche/);
  assert.doesNotMatch(carte, /CroixFeuille|BottomSheet|<select/);
  // ASSERTION MODIFIÉE (24/11, ADR 0392) : « L'appareil » et « Verrouiller » vivent dans l'onglet Voiture.
  assert.match(carte, /onFiche\(idPrincipal\(c\)\)/);
  assert.match(carte, /commanderService\(hass, lock, 'lock', 'lock'/);
  // Aucun entity_id en dur, aucune couleur en dur hors #fff.
  assert.doesNotMatch(carte + lire('src/voiturevue.js'), /\b(sensor|binary_sensor|lock|cover|device_tracker)\.[a-z0-9_]+/);
  // ASSERTION MODIFIÉE (24/11, ADR 0392) : « hors #fff » — le texte blanc d'une action allumée (la règle des puces).
  assert.doesNotMatch(carte + lire('src/voiturevue.js'), /#(?!fff\b)[0-9a-fA-F]{3,6}\b/);
  assert.doesNotMatch(carte + lire('src/voiturevue.js'), /localeCompare|\r/);
});

test('la vue réutilise les lecteurs de composes.js, sans recopier leur logique', () => {
  const vueSrc = lire('src/voiturevue.js');
  for (const f of ['voitureEnCharge', 'voitureBranchee', 'voitureVerrouillee', 'ouvrantsOuverts', 'entitesCompose']) assert.match(vueSrc, new RegExp(f));
  assert.doesNotMatch(vueSrc, /'charging'|charge_in_progress|=== 'locked'/);
});
