/* La fiche d'un chauffage, une feuille à onglets (chantier Chauffage, plan 2,
 * tâche 8 ; choix 10 et 13, spec § 9.3).
 *
 * On REND la fiche (React côté serveur, ADR 0069) sur un état du moteur
 * fabriqué à la forme de `loggia/chauffage/etat` — sans serveur, sans Home
 * Assistant. Un rendu statique ne clique pas : ce que font les gestes se lit
 * dans les messages qu'ils bâtissent (`ordreDuMode`, `messageDeFin`,
 * `messagePlanning`, exportés pour ce fichier). Ce qui est garanti ici :
 *  - Accueil, Planning et Historique pour tous — Réglages est parti à la
 *    tâche 10 bis C ; le motif ARIA des onglets est complet ;
 *  - l'Accueil dit le mode en grand, à sa couleur, et jusqu'à quand ; les
 *    puces des modes se creusent dans le puits, la choisie en bleu plein ;
 *  - au planning, une puce pose une reprise en main jusqu'au prochain
 *    changement ; planning éteint ou en « Observer sans agir », l'ordre part
 *    à l'appareil — un thermostat n'y a pas de puces, mais sa consigne et sa
 *    marche ;
 *  - une reprise en cours dit sa fin, et « Reprendre le planning » ;
 *  - chaque avertissement a sa ligne, au liseré de panne ;
 *  - « L'appareil » ouvre la fiche universelle (consommation, interrupteur
 *    du module).
 *
 * Tâche 9, le Planning s'édite (choix 11 et 12) :
 *  - chaque geste est vérifié avant de partir (`gesteSemaine`) : une heure
 *    prise, un treizième changement, le dernier de la semaine ne partent pas
 *    et se disent sur place ; le reste part aussitôt, la semaine entière,
 *    montrée d'avance et retirée au refus du serveur. Ces gestes se JOUENT :
 *    la fiche compilée telle quelle, ses crochets doublés (le modèle de
 *    tests/distributeur_finition.test.mjs).
 *
 * Tâche 10 :
 *  - l'Historique dit, sous la courbe, les modes que l'appareil a réellement
 *    appliqués — la barre de la carte, « il y a 24 h » et « maintenant » aux
 *    bouts, la légende des modes vus ;
 *  - les trois températures d'un thermostat, envoyées ensemble, l'ordre
 *    vérifié sur place avec la phrase du serveur, Confort −1 et −2 en
 *    lecture ; « Supprimer son planning » pour un chauffage introuvable — dans
 *    le Planning depuis la tâche 10 bis C ;
 *  - un appareil qui sait refroidir, planning éteint : ses modes, ses
 *    préréglages, « Refroidit », sa plage — et rien de cela au planning ;
 *  - toute semaine envoyée part dans les modes du chauffage.
 *
 * Tâche 10 bis B, l'en-tête et l'Accueil de sa maquette (cadres 3b et 3e) :
 *  - l'en-tête porte la plaque de la carte et « pièce · type » ;
 *  - le haut dit le mode en grand à son encre, la phrase de ce qui décide, la
 *    pièce ; une reprise, ses fins en Puces et « Reprendre le planning ·
 *    {mode} » — plus de menu ni de bouton rouge ; les modes, une grille de
 *    boutons libres ;
 *  - la liste : Prochain changement (vers l'onglet Planning), Fenêtre (son
 *    réglage s'y déplie, pour un administrateur), Mode de la maison,
 *    L'appareil — et pour un thermostat Consigne, En marche, Planning.
 *
 * Tâche 10 bis C, le Planning de sa maquette (cadres 3c et 3f), et la fin de
 * l'onglet Réglages :
 *  - en tête, « Suivre le planning » — la bascule d'un administrateur, son
 *    mot pour un compte ordinaire ; la semaine en sept rangées-boutons qui
 *    choisissent le jour ; le titre du jour et son compte ; « Depuis minuit » ;
 *  - un changement par rangée, qui se déplie pour un administrateur : ± 15 min
 *    (inertes aux voisins et aux bords de la journée), les modes, « Supprimer
 *    ce changement » ; « Ajouter un changement » (caché à douze) ; « Copier
 *    cette journée sur » Lun – ven ou Toute la semaine ;
 *  - jamais réglé, « Pas de planning » et « Créer un planning » : la semaine
 *    type dans ses modes, SANS allumer le planning ;
 *  - un thermostat, ses températures sous les changements ; un chauffage
 *    introuvable, « Supprimer son planning » en bas.
 *
 * Tâche 10 bis D, l'Historique de sa maquette (cadre 3d) :
 *  - « 24 h » · « 7 jours » en Puces, le choix gardé par la fiche ;
 *  - la courbe que la FICHE dessine (la coquille ne la passe plus) : la
 *    pièce en escalier — un trou reste un trou —, min · max, les repères, la
 *    consigne d'un thermostat en tirets ; la bande des modes appliqués ou de
 *    la chauffe ; « il y a 24 h · il y a 12 h · maintenant » ou « lundi
 *    dernier · … » ; le temps par mode ou de chauffe ;
 *  - les corrections de la seconde relecture de la partie B : la fenêtre hors
 *    du planning (a), « Ouverte » d'après l'ouvrant (b), le mode APPLIQUÉ de
 *    « Reprendre » et du prochain changement (d), la puce « arret » d'un
 *    appareil qui ne s'éteint pas (e) ; le champ de l'heure dessiné en bouton.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

// La langue AVANT l'import : i18n et les dates la lisent au chargement.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const M = await import(new URL('../src/fichechauffage.jsx', import.meta.url).href);
const Fiche = M.default;
const { ordreDuMode, messageDeFin, messagePlanning, gesteSemaine, messageSemaine, messageTemperatures, messageFenetre, messageSuppression } = M;
const SOURCE = readFileSync(new URL('../src/fichechauffage.jsx', import.meta.url), 'utf8');
const { JOURS } = await import('../src/chauffage.js');
const PLAN = await import('../src/chauffageplanning.js');
const { raisonEchec } = await import('../src/refus.js');
const { BoutonConfirme, EnteteFiche, ChampHeure } = await import(new URL('../src/fichecommune.jsx', import.meta.url).href);
const { Bascule } = await import(new URL('../src/ui.jsx', import.meta.url).href);

// Lundi 12 octobre 2026, 19:00 à l'heure de la maison.
const QUAND = '2026-10-12T17:00:00Z';
const MAINTENANT = Date.parse('2026-10-12T19:00:00+02:00');
const TOUS = ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret'];
const NODON = ['comfort', 'eco', 'frost_protection', 'off', 'comfort_-1', 'comfort_-2'];
const OPTIONS = { confort: 'comfort', confort_1: 'comfort_-1', confort_2: 'comfort_-2', eco: 'eco', hors_gel: 'frost_protection', arret: 'off' };
/* La semaine de la chambre : en semaine, Confort 06:30 → 08:30 et 18:00 → 23:00 ;
 * le week-end, Confort 08:00 → 22:30. */
const SEMAINE = Object.fromEntries(JOURS.map(j => [j, (j === 'sam' || j === 'dim'
  ? [['08:00', 'confort'], ['22:30', 'eco']] : [['06:30', 'confort'], ['08:30', 'eco'], ['18:00', 'confort'], ['23:00', 'eco']]).map(([h, mode]) => ({ h, mode }))]));
/* Celle du bureau de la démo : rien le week-end — le Hors-gel du vendredi soir tient jusqu'au lundi 07:30. */
const BUREAU = Object.fromEntries(JOURS.map(j => [j, (j === 'sam' || j === 'dim'
  ? [] : [['07:30', 'eco'], ['13:30', 'confort'], ['17:30', 'confort_1'], ['19:00', 'eco'], ['22:00', 'hors_gel']]).map(([h, mode]) => ({ h, mode }))]));

const st = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: QUAND, last_updated: QUAND, attributes });
const MODULE = 'select.radiateur_chambre_fil_pilote';
const POELE = 'climate.poele';
const VTHERM = 'climate.salon';

/* Le radiateur de la chambre, au planning : Confort jusqu'à 23:00, puis Éco. */
const radiateur = (o = {}) => ({
  cle: MODULE, entite: MODULE, nom: 'Radiateur Chambre', famille: 'fil_pilote', planning: true, modes: TOUS,
  mode: 'confort', source: 'planning', fin: '2026-10-12T23:00:00+02:00', puis: 'eco', reprise: null,
  fenetre: 'arret', fenetre_ouverte: false, semaine: SEMAINE, temperatures: null, avertissements: [], options: OPTIONS,
  jour: [], ...o,
});
/* Le poêle : un thermostat, jamais réglé — planning éteint. */
const poele = (o = {}) => ({
  cle: POELE, entite: POELE, nom: 'Poêle', famille: 'thermostat', planning: false, modes: TOUS,
  mode: null, source: null, fin: null, puis: null, reprise: null, fenetre: 'arret', fenetre_ouverte: false,
  semaine: null, temperatures: null, avertissements: [], options: null, jour: null, ...o,
});
const vtherm = (o = {}) => ({
  cle: VTHERM, entite: VTHERM, nom: 'Salon', famille: 'vtherm', planning: false, modes: ['confort', 'eco', 'hors_gel', 'arret'],
  mode: null, source: null, fin: null, puis: null, reprise: null, fenetre: 'arret', fenetre_ouverte: false,
  semaine: null, temperatures: null, avertissements: [], options: null, jour: null, ...o,
});
const etat = (o = {}) => ({
  chauffages: [], maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' }, simulation: false,
  maintenant: '2026-10-12T19:00:00+02:00', minute: [0, 1140], plannings_allumes: true, journal: [], ...o,
});

/* La maison : le module et le capteur de sa pièce, le poêle, un VTherm. */
function maison({ admin = true, states = [] } = {}) {
  const base = [
    st(MODULE, 'comfort', { friendly_name: 'Radiateur Chambre Pilot wire mode', options: NODON }),
    st('sensor.chambre_temperature', '19.46', { unit_of_measurement: '°C', device_class: 'temperature' }),
    st(POELE, 'heat', { friendly_name: 'Poêle', hvac_modes: ['off', 'heat'], hvac_action: 'heating', temperature: 20.5, current_temperature: 19.2,
      min_temp: 5, max_temp: 35, target_temp_step: 0.5, supported_features: 1 }),
    st(VTHERM, 'heat', { friendly_name: 'Salon', hvac_modes: ['off', 'heat'], preset_modes: ['none', 'frost', 'eco', 'comfort', 'boost'], preset_mode: 'eco', current_temperature: 20.1 }),
  ];
  const S = Object.fromEntries(base.map(s => [s.entity_id, s]));
  states.forEach(s => { if (s.state === null) delete S[s.entity_id]; else S[s.entity_id] = s; });
  const rien = () => { throw new Error('rien ne doit partir'); };
  return { states: S, user: { is_admin: admin }, config: { unit_system: { temperature: '°C' } }, callService: rien, callWS: rien };
}
const SONDE = { id: 'sensor.chambre_temperature', attribut: null };
const rendre = (props = {}, h = maison()) => renderToStaticMarkup(createElement(Fiche, {
  hass: h, ch: radiateur(), etat: etat(), sonde: SONDE, onFiche: () => {}, maintenant: MAINTENANT, ...props,
}));

// Les onglets de la barre, dans l'ordre : [attributs, libellé].
const onglets = (html) => [...html.matchAll(/<button\b([^>]*role="tab"[^>]*)>.*?<span>([^<]+)<\/span><\/button>/g)].map(m => ({ attrs: m[1], nom: m[2] }));
const attr = (attrs, nom) => { const m = new RegExp('\\b' + nom + '="([^"]*)"').exec(attrs); return m ? m[1] : null; };
// Le texte d'un morceau de HTML, sans ses balises (lu, pas nettoyé par remplacement).
const texte = (html) => [...html.matchAll(/>([^<]*)</g)].map(m => m[1]).join('');
// Les puces des modes : le groupe « Mode », ses boutons, leur état et leur mot.
function puces(html) {
  const i = html.indexOf('role="group" aria-label="Mode"');
  if (i < 0) return null;
  const groupe = html.slice(i, html.indexOf('</div>', i));
  return [...groupe.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map(m => ({ attrs: m[1], mot: texte('>' + m[2] + '<'), html: m[2] }));
}
const avertissements = (html) => [...html.matchAll(/<div class="o-panne" role="status" data-avertissement="([^"]+)"/g)].map(m => m[1]);

test('Accueil, Planning et Historique pour tous : l’onglet Réglages est parti (tâche 10 bis C)', () => {
  /* ASSERTION MODIFIÉE (tâche 10 bis C, « Trois onglets », cadres 3b à 3f) :
   * un administrateur n'a plus d'onglet Réglages — « Suivre le planning », les
   * températures et la suppression vivent dans le Planning. */
  assert.deepEqual(onglets(rendre()).map(o => o.nom), ['Accueil', 'Planning', 'Historique']);
  const ordinaire = maison({ admin: false });
  assert.deepEqual(onglets(rendre({}, ordinaire)).map(o => o.nom), ['Accueil', 'Planning', 'Historique'], 'les mêmes pour un compte ordinaire');
  // Demandé quand même, l'onglet retombe sur l'Accueil — pour un compte ordinaire comme pour un administrateur.
  for (const h of [ordinaire, maison()]) {
    const html = rendre({ ongletDepart: 'reglages' }, h);
    assert.ok(!html.includes('Suivre le planning') && html.includes('data-mode="confort"'), 'Réglages retombe sur l’Accueil');
  }
});

test('le motif ARIA des onglets : un seul arrêt de Tab, l’actif désigne son panneau nommé', () => {
  for (const depart of ['accueil', 'planning', 'historique', 'reglages']) {
    const html = rendre({ ongletDepart: depart });
    assert.match(html, /<div role="tablist" aria-label="Radiateur Chambre" class="rb-onglets"/, 'la barre est nommée');
    const os = onglets(html);
    const actifs = os.filter(o => attr(o.attrs, 'aria-selected') === 'true');
    assert.equal(actifs.length, 1, 'un onglet choisi');
    assert.deepEqual(os.map(o => attr(o.attrs, 'tabindex')), os.map(o => (o === actifs[0] ? '0' : '-1')), 'tabIndex itinérant');
    assert.equal(os.filter(o => attr(o.attrs, 'aria-controls')).length, 1, 'seul l’actif désigne un panneau');
    const panneau = attr(actifs[0].attrs, 'aria-controls');
    const p = new RegExp('<div role="tabpanel" id="' + panneau.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '" aria-labelledby="([^"]+)"').exec(html);
    assert.ok(p, 'le panneau existe sous l’id désigné');
    assert.equal(p[1], attr(actifs[0].attrs, 'id'), 'le panneau est nommé par son onglet');
    // L'onglet choisi : bleu plein, texte blanc (règle des puces).
    assert.match(actifs[0].attrs, /background:var\(--o-accent-fond\);color:#fff/);
  }
  // useId avant tout retour : un crochet ne se saute jamais.
  const h = SOURCE.indexOf('const idOnglets = useId();');
  assert.ok(h > 0 && h < SOURCE.indexOf('if (!ch) return null;'), 'useId appelé sous condition');
});

test('l’en-tête : le nom, l’épingle, puis la croix en dernier — et la teinte de la fiche', () => {
  const html = rendre({ epingle: createElement('span', { 'data-epingle': '' }) });
  const tete = html.slice(0, html.indexOf('role="tablist"'));
  const i = tete.indexOf('data-epingle'), c = tete.indexOf('data-croix');
  assert.ok(tete.includes('>Radiateur Chambre<') && i > 0 && c > i, 'le nom, l’épingle, la croix — dans cet ordre');
  assert.equal((tete.match(/data-croix/g) || []).length, 1, 'une seule croix');
  assert.ok(tete.slice(c).indexOf('<button') < 0, 'rien après la croix');
  assert.ok(!tete.includes('aria-label="Réglages"'), 'pas de roue des réglages');
  assert.ok(html.startsWith('<div class="rb-fiche rb-chauffage"'), 'la teinte du chauffage (.rb-chauffage)');
});

test('au planning : le mode en grand à sa couleur, « Planning · jusqu’à 23:00 », la température de la pièce', () => {
  const html = rendre();
  assert.match(html, /data-mode="confort" style="[^"]*color:var\(--o-warn2\)[^"]*">Confort</, 'Confort, à l’orange de la maquette');
  /* ASSERTION MODIFIÉE (tâche 10 bis B, cadre 3b) : « jusqu’à 23:00, puis Éco »
   * devient « Planning · jusqu’à 23:00 » — plus de « puis {mode} », la rangée
   * « Prochain changement » le dit. */
  assert.ok(html.includes('>Planning · jusqu’à 23:00<') && !html.includes('puis'), 'la fin, lue du serveur ; la suite est dans la liste');
  /* ASSERTION MODIFIÉE (cadre 3b) : la température s'écrit comme sur la carte,
   * « 19,5 » et un « ° » à part, sans unité. */
  assert.ok(html.includes('>19,5</span><span style="font-size:15px;margin-top:2px">°<') && html.includes('>Pièce<'), 'la sonde de la pièce, au dixième');
  // L'Éco jusqu'à 23:00 : la même phrase.
  const sansSuite = rendre({ ch: radiateur({ mode: 'eco', puis: null }) });
  assert.match(sansSuite, /data-mode="eco" style="[^"]*color:var\(--o-purple\)[^"]*">Éco</);
  assert.ok(sansSuite.includes('>Planning · jusqu’à 23:00<'));
  /* La fenêtre décide : elle se dit, pas d'heure de fin. ASSERTION MODIFIÉE
   * (cadre 3b) : « Fenêtre ouverte » devient « Fenêtre ouverte · arrêt
   * automatique ». */
  const fenetre = rendre({ ch: radiateur({ mode: 'arret', source: 'fenetre', fin: null, puis: null, fenetre_ouverte: true }) });
  assert.ok(fenetre.includes('>Fenêtre ouverte · arrêt automatique<') && !fenetre.includes('jusqu’à'));
  // La maison en Absence décide.
  const absence = rendre({ ch: radiateur({ mode: 'eco', source: 'maison', fin: null, puis: null }), etat: etat({ maison: { mode: 'absence', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) });
  assert.ok(absence.includes('>Maison : Absence<'));
  // Sans sonde, pas de température inventée.
  assert.ok(!rendre({ sonde: null }).includes('>Pièce<'));
});

test('les modes : du plus froid au plus chaud, la choisie en bleu plein — une grille de boutons libres, hors du puits', () => {
  const html = rendre();
  const p = puces(html);
  assert.ok(p, 'le groupe des modes est nommé');
  assert.deepEqual(p.map(x => x.mot), ['Arrêt', 'Hors-gel', 'Éco', 'Confort −2', 'Confort −1', 'Confort']);
  assert.deepEqual(p.map(x => attr(x.attrs, 'aria-pressed')), ['false', 'false', 'false', 'false', 'false', 'true'], 'la choisie : le mode que le moteur applique');
  const choisie = p[5];
  assert.match(choisie.attrs, /background:var\(--o-accent-fond\);color:#fff/, 'bleu plein, texte blanc');
  // La couleur d'un mode n'est qu'un point.
  assert.match(choisie.html, /<span aria-hidden="true" style="[^"]*background:var\(--o-warn2\)/);
  assert.match(p[2].html, /background:var\(--o-purple\)/);
  assert.ok(!/background:(var\(--o-(bad|cold|cyan|orange|warn2|purple)\)|rgba\(var\(--o-warn2-rgb\),\.\d+\));color/.test(p.map(x => x.attrs).join(' ')), 'aucune puce teintée de son mode');
  /* ASSERTION MODIFIÉE (tâche 10 bis B) : la grille des modes n'est PAS un
   * groupe segmenté dans sa maquette (cadre 3b) — trois colonnes de boutons
   * libres, écart 8, sur le gris doux ; elle quitte le puits. */
  assert.match(html, /role="group" aria-label="Mode" style="display:grid;grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);gap:8px;margin-top:16px"/);
  assert.ok(!/role="group" aria-label="Mode" style="[^"]*--o-well/.test(html), 'la grille des modes n’est pas dans le puits');
  /* Un VTherm n'a que ses préréglages : quatre modes. ASSERTION MODIFIÉE
   * (cadre 3b) : trois colonnes comme pour tout chauffage, plus deux. */
  const v = rendre({ ch: vtherm({ planning: true, mode: 'eco', source: 'planning' }), sonde: null });
  assert.deepEqual(puces(v).map(x => x.mot), ['Arrêt', 'Hors-gel', 'Éco', 'Confort']);
  assert.match(v, /role="group" aria-label="Mode" style="display:grid;grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/);
});

test('au planning, une puce pose une reprise en main jusqu’au prochain changement ; sinon l’ordre part à l’appareil', () => {
  const h = maison();
  const ch = radiateur();
  assert.deepEqual(ordreDuMode(ch, 'eco', h.states[MODULE], true),
    { message: { type: 'loggia/chauffage/main', chauffage: MODULE, mode: 'eco', fin: 'prochain' } });
  // Planning éteint : le module, avec l'option telle qu'il l'écrit.
  assert.deepEqual(ordreDuMode(ch, 'confort_1', h.states[MODULE], false),
    { appels: [['select', 'select_option', { entity_id: MODULE, option: 'comfort_-1' }]] });
  assert.equal(ordreDuMode({ ...ch, options: {} }, 'eco', h.states[MODULE], false), null, 'une option que le module n’a pas ne part pas');
  assert.equal(ordreDuMode(ch, 'tiede', h.states[MODULE], true), null, 'un mode que le chauffage ne comprend pas');
  assert.equal(ordreDuMode({ ...ch, modes: ['eco', 'arret'] }, 'confort', h.states[MODULE], true), null);
  // Un VTherm : son préréglage — rallumé d'abord s'il est à l'arrêt — ou l'arrêt.
  const v = vtherm();
  assert.deepEqual(ordreDuMode(v, 'confort', h.states[VTHERM], false),
    { appels: [['climate', 'set_preset_mode', { entity_id: VTHERM, preset_mode: 'comfort' }]] });
  assert.deepEqual(ordreDuMode(v, 'hors_gel', st(VTHERM, 'off', { hvac_modes: ['off', 'heat'] }), false),
    { appels: [['climate', 'set_hvac_mode', { entity_id: VTHERM, hvac_mode: 'heat' }], ['climate', 'set_preset_mode', { entity_id: VTHERM, preset_mode: 'frost' }]] });
  assert.deepEqual(ordreDuMode(v, 'arret', h.states[VTHERM], false),
    { appels: [['climate', 'set_hvac_mode', { entity_id: VTHERM, hvac_mode: 'off' }]] });
  // Un thermostat n'a pas de modes hors du planning : sa consigne et sa marche.
  for (const m of TOUS) assert.equal(ordreDuMode(poele(), m, h.states[POELE], false), null);
  assert.deepEqual(ordreDuMode(poele({ planning: true }), 'eco', h.states[POELE], true).message,
    { type: 'loggia/chauffage/main', chauffage: POELE, mode: 'eco', fin: 'prochain' });
});

test('un thermostat, planning éteint : pas de puces de modes, sa consigne et sa marche', () => {
  const html = rendre({ ch: poele(), sonde: { id: POELE, attribut: 'current_temperature' } });
  assert.equal(puces(html), null, 'aucune puce de mode');
  /* ASSERTION MODIFIÉE (cadre 3e) : la consigne s'écrit comme sur la carte,
   * « 20,5° » — une décimale, sans unité. */
  assert.ok(html.includes('aria-label="Consigne : Moins"') && html.includes('aria-label="Consigne : Plus"') && html.includes('>20,5°<'), 'la consigne, pas à pas');
  // ASSERTION MODIFIÉE (cadre 3e) : la bascule s'appelle « En marche » (l'ancien « Chauffe »).
  assert.match(html, /role="switch" aria-checked="true" aria-label="En marche"/, 'sa marche');
  /* ASSERTION MODIFIÉE (« Celles de la maquette ») : « Chauffe » quitte le
   * rouge des alertes pour l'orange de la chauffe. */
  assert.match(html, /font-size:28px;[^"]*color:var\(--o-warn2\)[^"]*">Chauffe</, 'il chauffe : il le dit, en grand');
  /* ASSERTION MODIFIÉE (cadre 3e) : dessous, la consigne qu'il vise — plus la
   * phrase du planning éteint : la rangée « Planning » dit « Aucun ». */
  assert.ok(html.includes('>Vers 20,5°<') && !html.includes('>Le planning de ce chauffage est éteint.<'));
  // ASSERTION MODIFIÉE (cadre 3e) : la pièce, « 19,2 » et son « ° » à part.
  assert.ok(html.includes('>19,2</span>'), 'il se mesure lui-même');
  assert.ok(!html.includes('Reprendre le planning') && !html.includes('data-rangee="maison"'), 'rien du planning');
  // Au planning : les puces des modes, et la consigne — une reprise en température ; plus de marche.
  const auPlanning = rendre({ ch: poele({ planning: true, mode: 'confort', source: 'planning', fin: '2026-10-12T22:00:00+02:00', puis: 'eco' }), sonde: null });
  assert.ok(puces(auPlanning) && auPlanning.includes('aria-label="Consigne : Plus"'));
  assert.ok(!auPlanning.includes('aria-label="En marche"'));
  // Le pas d'une reprise en température : celui de l'appareil, et rien à une borne (comme la carte).
  assert.ok(SOURCE.includes('const vise = consigneVoisine(consigne, sens, a, uT);'));
  assert.ok(SOURCE.includes('if (!p || !p.ok || p.data.temperature === consigne) return;'));
  assert.ok(SOURCE.includes("auMoteur(messageMain(ch, { temperature: versCelsius(p.data.temperature, uT), fin: 'prochain' }), () => poserOvT(null));"),
    'la consigne part en °C, et l’avance se retire au refus');
  // Muet hors du planning : rien à commander en direct.
  const mort = rendre({ ch: poele() }, maison({ states: [st(POELE, 'unavailable', { friendly_name: 'Poêle' })] }));
  assert.ok(mort.includes('>Indisponible<') && !mort.includes('role="switch"') && !mort.includes('Consigne : Plus'));
});

test('une reprise en cours : sa fin, les puces pour la changer, et « Reprendre le planning »', () => {
  const reprise = { mode: 'eco', temperature: null, fin: '2026-10-12T21:00:00+02:00', depuis: '2026-10-12T19:00:00+02:00', par: 'u1' };
  const html = rendre({ ch: radiateur({ mode: 'eco', source: 'main', fin: reprise.fin, puis: 'confort', reprise }) });
  /* ASSERTION MODIFIÉE (tâche 10 bis B, cadre 3b) : le menu des fins s'en va
   * — la phrase du haut dit la reprise, des puces changent sa fin (plus bas). */
  assert.ok(!html.includes('aria-haspopup="listbox"'), 'plus de menu des fins');
  assert.ok(html.includes('>À la main jusqu’à 21:00<') && html.includes('>Reprendre le planning<'));
  /* ASSERTION MODIFIÉE (cadre 3b) : le prochain changement se dit pendant une
   * reprise aussi — c'est l'heure de sa fin par défaut, et la puce le nomme. */
  assert.ok(html.includes('data-rangee="prochain"'), 'pendant une reprise, la rangée dit encore le prochain changement');
  // Jusqu'à relance.
  const relance = rendre({ ch: radiateur({ mode: 'eco', source: 'main', fin: null, puis: null, reprise: { ...reprise, fin: null } }) });
  assert.ok(relance.includes('>À la main jusqu’à relance<'));
  /* Une consigne posée à la main, sur un thermostat : sa température, dans
   * l'unité de la maison. ASSERTION MODIFIÉE (cadre 3b) : en grand, et la
   * phrase dessous. */
  const enDegres = rendre({ ch: poele({ planning: true, mode: null, source: 'main', fin: reprise.fin, puis: 'eco', reprise: { ...reprise, mode: null, temperature: 21.5 } }), sonde: null });
  assert.ok(enDegres.includes('>21,5 °C<') && enDegres.includes('>À la main jusqu’à 21:00<'));
  // Couverte par une fenêtre ouverte, la reprise reste là, et se rend.
  const sousFenetre = rendre({ ch: radiateur({ mode: 'arret', source: 'fenetre', fin: null, puis: null, fenetre_ouverte: true, reprise }) });
  assert.ok(sousFenetre.includes('>Fenêtre ouverte · arrêt automatique<') && sousFenetre.includes('Reprendre le planning'));
  // Passée, elle ne se montre plus.
  const passee = rendre({ ch: radiateur({ reprise: { ...reprise, fin: '2026-10-12T18:00:00+02:00' } }) });
  assert.ok(!passee.includes('Reprendre le planning'));
  // Les gestes : la même reprise avec une autre fin, ou le retour au planning.
  const ch = radiateur({ reprise });
  assert.deepEqual(messageDeFin(ch, 60), { type: 'loggia/chauffage/main', chauffage: MODULE, mode: 'eco', fin: 60 });
  assert.deepEqual(messageDeFin({ ...ch, reprise: { ...reprise, mode: null, temperature: 21.5 } }, 'relance'),
    { type: 'loggia/chauffage/main', chauffage: MODULE, temperature: 21.5, fin: 'relance' });
  assert.equal(messageDeFin(radiateur(), 'relance'), null, 'sans reprise, rien à reposer');
  assert.ok(SOURCE.includes('const rendre = () => auMoteur(messageMain(ch, { reprendre: true }))'), '« Reprendre le planning »');
  /* Les cinq fins, dans l'ordre de la spec (D3). ASSERTION MODIFIÉE (cadre
   * 3b) : la première se nomme par l'heure du prochain changement, que
   * `FINS` reçoit. */
  const fins = SOURCE.slice(SOURCE.indexOf('const FINS = (quand) => ['), SOURCE.indexOf('];', SOURCE.indexOf('const FINS = (quand) => [')));
  assert.ok(fins.length > 0, 'FINS a changé de forme');
  assert.deepEqual([...fins.matchAll(/id: ('?\w+'?)/g)].map(m => m[1]), ["'prochain'", '60', '120', '240', "'relance'"]);
});

test('une fin qui n’est pas aujourd’hui dit son jour : « demain », puis le nom du jour', () => {
  /* Relecture de la tâche 8 (11/10), vu dans la démo : un dimanche soir, « jusqu’à
   * 07:30, puis Éco » pour une fin LUNDI matin, quand la rangée disait « Demain
   * 07:30 ». Le jour se lit dans la partie murale des chaînes, comme l'heure. */
  /* Dimanche 11 octobre, 23:00 : la chambre est en Éco jusqu'à lundi 06:30.
   * ASSERTIONS MODIFIÉES (tâche 10 bis B, cadre 3b) : « jusqu’à … , puis
   * {mode} » devient « Planning · jusqu’à … » — la rangée dit la suite. */
  const dimanche = etat({ maintenant: '2026-10-11T23:00:00+02:00', minute: [6, 1380] });
  const nuit = { mode: 'eco', fin: '2026-10-12T06:30:00+02:00', puis: 'confort' };
  const html = rendre({ ch: radiateur(nuit), etat: dimanche });
  assert.ok(html.includes('>Planning · jusqu’à demain 06:30<'), 'pas « jusqu’à 06:30 », comme si c’était ce soir');
  assert.ok(html.includes('>Demain 06:30 · Confort<'), 'la rangée « Prochain changement » dit le même jour');
  assert.ok(rendre({ ch: radiateur({ ...nuit, puis: null }), etat: dimanche }).includes('>Planning · jusqu’à demain 06:30<'));
  // Au-delà de demain, le nom du jour — en minuscules dans la phrase : un samedi, le bureau attend lundi.
  const samedi = etat({ maintenant: '2026-10-10T10:00:00+02:00', minute: [5, 600] });
  const lundi = { semaine: BUREAU, mode: 'hors_gel', fin: '2026-10-12T07:30:00+02:00', puis: 'eco' };
  const weekend = rendre({ ch: radiateur(lundi), etat: samedi });
  assert.ok(weekend.includes('>Planning · jusqu’à lundi 07:30<'));
  assert.ok(weekend.includes('>Lundi 07:30 · Éco<'), 'la rangée, en tête de sa valeur');
  assert.ok(rendre({ ch: radiateur({ ...lundi, puis: null }), etat: samedi }).includes('>Planning · jusqu’à lundi 07:30<'));
  // Aujourd'hui, l'heure seule (témoin) ; sans « maintenant » du serveur, la date du navigateur.
  assert.ok(rendre().includes('>Planning · jusqu’à 23:00<'));
  assert.ok(rendre({ ch: radiateur(nuit), etat: etat({ maintenant: null, minute: [6, 1380] }), maintenant: new Date(2026, 9, 11, 23, 0) })
    .includes('>Planning · jusqu’à demain 06:30<'));
  /* Une reprise en main : la même règle. ASSERTIONS MODIFIÉES (cadre 3b) : la
   * phrase du haut, « À la main jusqu’à … » — le mode est écrit en grand juste
   * au-dessus ; et plus de menu des fins, donc plus de nom de bouton à lire. */
  const reprise = { mode: 'confort', temperature: null, fin: '2026-10-12T01:00:00+02:00', depuis: '2026-10-11T21:00:00+02:00', par: 'u1' };
  const tard = rendre({ ch: radiateur({ mode: 'confort', source: 'main', fin: reprise.fin, puis: 'eco', reprise }),
    etat: etat({ maintenant: '2026-10-11T22:00:00+02:00', minute: [6, 1320] }) });
  assert.ok(tard.includes('>À la main jusqu’à demain 01:00<'));
  const longue = { ...reprise, fin: lundi.fin, depuis: '2026-10-10T09:00:00+02:00' };
  assert.ok(rendre({ ch: radiateur({ ...lundi, mode: 'confort', source: 'main', reprise: longue }), etat: samedi })
    .includes('>À la main jusqu’à lundi 07:30<'));
});

test('un chauffage introuvable : aucun mode à poser, sa reprise se rend encore', () => {
  /* Relecture de la tâche 8 : le moteur refuse une reprise en main sur un
   * chauffage qu'il ne trouve plus (« Ce chauffage est introuvable. ») — la
   * fiche ne propose pas un geste qui ne peut qu'essuyer ce refus. */
  const perdu = radiateur({ entite: null, avertissements: ['introuvable'] });
  for (const m of TOUS) assert.equal(ordreDuMode(perdu, m, null, true), null, m);
  const html = rendre({ ch: perdu, sonde: null });
  assert.equal(puces(html), null, 'aucune puce de mode');
  assert.deepEqual(avertissements(html), ['introuvable']);
  assert.ok(!html.includes('>L’appareil<'), 'plus d’appareil à ouvrir');
  // Une reprise posée avant sa disparition se rend : le serveur l'accepte.
  const reprise = { mode: 'eco', temperature: null, fin: null, depuis: '2026-10-12T18:00:00+02:00', par: 'u1' };
  assert.ok(rendre({ ch: { ...perdu, mode: 'eco', source: 'main', reprise }, sonde: null }).includes('>Reprendre le planning<'));
});

test('« Reprendre le planning » rend le focus à la puce du mode repris : le bouton part avec la reprise', () => {
  const reprise = { mode: 'eco', temperature: null, fin: '2026-10-12T21:00:00+02:00', depuis: '2026-10-12T19:00:00+02:00', par: 'u1' };
  const html = rendre({ ch: radiateur({ mode: 'eco', source: 'main', fin: reprise.fin, puis: 'confort', reprise }) });
  // Chaque puce a son identifiant, sur la base de ceux des onglets (useId).
  const accueil = attr(onglets(html)[0].attrs, 'id');
  assert.ok(accueil.endsWith('-t-accueil'));
  const base = accueil.slice(0, -'-t-accueil'.length);
  for (const m of TOUS) assert.ok(html.includes('id="' + base + '-mode-' + m + '"'), m);
  /* Réussi, le retour au planning envoie le focus à la puce du mode que la réponse dit — sinon à l'onglet.
   * ASSERTION MODIFIÉE (relecture de la partie B, point 3) : la grille choisit le mode que le moteur
   * APPLIQUE (`applique`) ; le focus va à ce bouton-là — le mode voulu peut n'avoir aucun bouton. */
  const i = SOURCE.indexOf('const rendre = ');
  const geste = SOURCE.slice(i, SOURCE.indexOf('\n  });', i));
  assert.ok(geste.includes('const vise = apres ? apres.applique || apres.mode : null;')
    && geste.includes("focaliser(vise ? idBase + '-mode-' + vise : null, idBase + '-t-accueil')"), geste);
  assert.ok(geste.includes('if (!nouvel) return;'), 'refusé, le bouton reste : le focus aussi');
});

test('au planning, les rangées : la fenêtre et ce qu’elle fait, la maison, le prochain changement', () => {
  const html = rendre();
  assert.ok(/data-rangee="fenetre"[\s\S]*?>Fenêtre<[\s\S]*?>À l’ouverture : Arrêt<[\s\S]*?>Fermée</.test(html), 'fermée ; ouverte, elle met à l’Arrêt');
  // ASSERTION MODIFIÉE (tâche 10 bis B, cadre 3b) : la rangée « Maison » s'intitule « Mode de la maison ».
  assert.ok(/data-rangee="maison"[\s\S]*?>Mode de la maison<[\s\S]*?>Planning</.test(html));
  assert.ok(/data-rangee="prochain"[\s\S]*?>Prochain changement<[\s\S]*?>23:00 · Éco</.test(html), 'calculé sur la semaine, la maison appliquée');
  // ASSERTION MODIFIÉE (cadre 3b) : « rien ne change » devient « ne rien faire », le mot de la puce.
  const ouverte = rendre({ ch: radiateur({ fenetre_ouverte: true, fenetre: 'rien' }) });
  assert.ok(ouverte.includes('>À l’ouverture : ne rien faire<') && ouverte.includes('>Ouverte<'));
  // Demain matin, après le soir de la semaine.
  const soir = rendre({ etat: etat({ minute: [0, 1400] }) });
  assert.ok(soir.includes('>Demain 06:30 · Confort<'));
  // En Vacances jusqu'au 20 : la maison le dit, et plus rien ne change.
  const vacances = rendre({ etat: etat({ maison: { mode: 'vacances', vacances_fin: '2026-10-20T00:00:00+02:00', absence: 'eco', vacances: 'hors_gel' } }) });
  assert.ok(vacances.includes('>Vacances jusqu’au 20 oct.<') && !vacances.includes('data-rangee="prochain"'));
});

test('chaque avertissement a sa ligne, au liseré de panne', () => {
  const html = rendre({ ch: radiateur({ avertissements: ['introuvable', 'injoignable', 'module_coupe'] }) });
  assert.deepEqual(avertissements(html), ['introuvable', 'injoignable', 'module_coupe']);
  for (const phrase of ['Introuvable dans Home Assistant : renommé ou retiré ?', 'Ce chauffage ne répond plus.', 'Module coupé : le planning ne peut rien']) {
    assert.ok(html.includes('>' + phrase + '<'), phrase);
  }
  assert.deepEqual(avertissements(rendre()), [], 'témoin : rien à dire, rien de dit');
  // Un VTherm qui se met de lui-même en sécurité (`security` dans ses anciennes versions) ou en délestage.
  const avec = (preset) => avertissements(rendre({ ch: vtherm(), sonde: null }, maison({ states: [st(VTHERM, 'heat', { hvac_modes: ['off', 'heat'], preset_modes: ['comfort', 'eco', 'frost'], preset_mode: preset })] })));
  assert.deepEqual(avec('safety'), ['securite']);
  assert.deepEqual(avec('security'), ['securite']);
  assert.deepEqual(avec('power'), ['delestage']);
  assert.deepEqual(avec('eco'), []);
  assert.ok(rendre({ ch: vtherm(), sonde: null }, maison({ states: [st(VTHERM, 'heat', { preset_mode: 'power' })] }))
    .includes('>Délestage : la maison consomme trop, VTherm suspend la chauffe.<'));
  assert.ok(rendre({ ch: vtherm(), sonde: null }, maison({ states: [st(VTHERM, 'heat', { preset_mode: 'safety' })] }))
    .includes('>Sécurité : la sonde de température ne répond plus, VTherm chauffe seul.<'));
  // Un thermostat ordinaire en « power » n'est pas un VTherm : rien.
  assert.deepEqual(avertissements(rendre({ ch: poele() }, maison({ states: [st(POELE, 'heat', { preset_mode: 'power' })] }))), []);
});

test('un thermostat revenu à son programme : la fiche dit « Son programme » (Tado, Netatmo ; 19/10)', () => {
  const fin = '2026-10-12T21:00:00+02:00';
  const reprise = { mode: null, temperature: 19, fin, depuis: '2026-10-12T19:00:00+02:00', par: null, programme: true };
  const html = rendre({ ch: poele({ planning: true, source: 'main', mode: null, fin, reprise }) },
    maison({ states: [st(POELE, 'auto', { hvac_modes: ['off', 'auto', 'heat'], temperature: 19 })] }));
  assert.ok(html.includes('>Son programme<'), 'pas « 19 °C » : il suit son programme');
});

test('le moteur a raté son démarrage : la fiche le dit, et « − » descend d’un vrai cran (audit du 19/10)', () => {
  const html = rendre({ ch: radiateur(), etat: etat({ demarrage: false, simulation: true }) });
  assert.ok(avertissements(html).includes('demarrage'));
  assert.ok(html.includes('>Le planning de chauffe n’a pas démarré : il ne commande rien. Redémarrez Home Assistant.<'));
  assert.ok(!avertissements(rendre({ ch: radiateur() })).includes('demarrage'), 'démarré : rien à dire');
  assert.ok(SOURCE.includes("consigneVoisine(consigne, sens, a, uT) ?? consigne + sens * 0.5"), 'hors planning aussi, un vrai cran');
});

test('l’historique d’un thermostat passe par le serveur, résumé — et retombe sur history/period (audit du 19/10)', () => {
  const commune = readFileSync(new URL('../src/fichecommune.jsx', import.meta.url), 'utf8');
  assert.ok(commune.includes("callWS({ type: 'loggia/chauffage/historique', chauffage: cle, jours })"), 'la commande du serveur');
  assert.ok(SOURCE.includes("idsAttributs: climat && repli ? [id] : []"), 'history/period seulement en repli');
  assert.ok(commune.includes(".catch(() => { if (vivant) setReponse('repli'); })"), 'commande absente ou en panne : le repli');
  // Servie par le serveur, la réponse est celle de la commande ; en repli seulement, history/period.
  assert.ok(SOURCE.includes('const luAppareil = repli ? luLu : parServeur;'), 'la réponse du serveur quand elle est là');
});

test('un programme d’ailleurs (Velair, Scheduler, une automatisation) : la fiche le nomme (D5 ; audit du 19/10)', () => {
  const ch = poele({ planning: false, avertissements: ['programme_concurrent'],
    concurrents: [{ type: 'velair', entite: null, nom: 'Velair' }, { type: 'automation', entite: 'automation.matin', nom: 'Matin' }] });
  const html = rendre({ ch });
  assert.ok(avertissements(html).includes('programme_concurrent'));
  assert.ok(html.includes('>Un autre programme le commande déjà (« Velair », « Matin ») : coupez-le pour que le planning commande seul.<'));
});

test('une vanne commandée par un VTherm : la fiche le nomme (audit du 19/10)', () => {
  const ch = poele({ planning: true, avertissements: ['commande_par'], commande_par: 'climate.salon_vtherm' });
  const html = rendre({ ch }, maison({ states: [st(POELE, 'heat', { hvac_modes: ['off', 'heat'], temperature: 19 }),
    st('climate.salon_vtherm', 'heat', { friendly_name: 'Salon VTherm' })] }));
  assert.deepEqual(avertissements(html), ['commande_par']);
  assert.ok(html.includes('>Commandé par « Salon VTherm » : son planning passe par lui.<'));
  assert.ok(rendre({ ch: { ...ch, commande_par: '' } }).includes('>Commandé par un autre thermostat : son planning passe par lui.<'),
    'un Better Thermostat dont on ne retrouve pas le climate');
});

test('un poêle MCZ en manuel : la fiche dit que le planning n’a pas d’effet (19/10)', () => {
  const html = rendre({ ch: poele({ planning: true, source: 'planning', mode: 'eco', avertissements: ['puissance_fixe'] }) });
  assert.deepEqual(avertissements(html), ['puissance_fixe']);
  assert.ok(html.includes('>Mode manuel : il chauffe à puissance fixe, la consigne et le planning n’ont pas d’effet. Repassez-le en Auto dans son application.<'));
});

test('une pompe à chaleur qui refroidit : le planning attend, la fiche le dit (audit du 19/10)', () => {
  const ch = poele({ planning: true, source: 'planning', mode: 'eco', avertissements: ['refroidit'] });
  const html = rendre({ ch }, maison({ states: [st(POELE, 'cool', { hvac_modes: ['off', 'heat', 'cool'], temperature: 24 })] }));
  assert.deepEqual(avertissements(html), ['refroidit']);
  assert.ok(html.includes('>Il refroidit : le planning de chauffe attend qu’il repasse en chauffe.<'));
  // Elle commande alors l'appareil, comme planning éteint : la carte comme la fiche.
  assert.ok(SOURCE.includes('const auPlanning = ch.planning === true && !simulation && !refroidit(ch);'));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes('const auPlanning = !!(ch && ch.planning && !etat.simulation && !refroidit(ch));'), 'la carte du thermostat');
});

test('le programme de l’appareil allumé se dit, par le nom que Home Assistant lui donne (audit du 19/10)', () => {
  const ch = poele({ avertissements: ['programme_appareil'], programme: 'switch.poele_timer' });
  const html = rendre({ ch }, maison({ states: [st(POELE, 'heat', { hvac_modes: ['off', 'heat'], temperature: 20 }),
    st('switch.poele_timer', 'on', { friendly_name: 'Poêle Timer' })] }));
  assert.deepEqual(avertissements(html), ['programme_appareil']);
  assert.ok(html.includes('>Son programme « Poêle Timer » est allumé : il change les réglages lui-même. Coupez-le pour que le planning commande seul.<'), 'il le nomme');
  // Sans son état, il garde un nom : son entité.
  assert.ok(rendre({ ch }).includes('« switch.poele_timer »'));
});

test('« L’appareil » ouvre sa fiche universelle : la consommation, l’interrupteur du module', () => {
  const html = rendre();
  assert.ok(/<button type="button"[^>]*>.*?>L’appareil<.*?>L’épingle, les commandes et toutes ses entités</.test(html), 'la rangée « L’appareil »');
  assert.ok(SOURCE.includes('onClick={() => onFiche(ch.entite)}'), 'elle ouvre la fiche de SON appareil');
  assert.ok(!rendre({ onFiche: null }).includes('>L’appareil<'), 'sans fiche à ouvrir, pas de rangée');
  /* Planning éteint : l'appareil reste, les rangées du planning partent.
   * ASSERTION MODIFIÉE (tâche 10 bis B, puis relecture de la partie B, point
   * 2) : la fenêtre RESTE quand la règle des fenêtres surveille ce chauffage
   * (`fenetre_ouverte` vrai ou faux, `_etat_un`) — EN LECTURE : planning
   * éteint, c'est la règle qui coupe, le réglage du moteur n'y vaut pas. */
  const eteint = rendre({ ch: radiateur({ planning: false }) });
  assert.ok(eteint.includes('>L’appareil<') && !eteint.includes('data-rangee="maison"') && eteint.includes('data-rangee="fenetre"'));
  assert.ok(!eteint.includes('aria-expanded'), 'planning éteint, la fenêtre ne se déplie pas');
});

test('« Observer sans agir » : la fiche commande l’appareil, sans geste de reprise', () => {
  const reprise = { mode: 'eco', temperature: null, fin: '2026-10-12T21:00:00+02:00', depuis: '2026-10-12T19:00:00+02:00', par: 'u1' };
  // Le moteur dit Éco à la main ; le module, lui, est en Confort.
  const html = rendre({ ch: radiateur({ mode: 'eco', source: 'main', fin: reprise.fin, reprise }), etat: etat({ simulation: true }) });
  // ASSERTION MODIFIÉE (tâche 10 bis B) : la phrase d'une reprise commence désormais par « À la main ».
  assert.ok(!html.includes('Reprendre le planning') && !/[àÀ] la main jusqu’à/.test(html) && !html.includes('data-reprise'), 'aucun geste qui ferait croire qu’il agit');
  assert.ok(html.includes('>Planning : Observer sans agir<'));
  assert.deepEqual(puces(html).filter(x => attr(x.attrs, 'aria-pressed') === 'true').map(x => x.mot), ['Confort'], 'la puce dit ce que le module FAIT');
  // ASSERTION MODIFIÉE (audit du 19/10) : pas au planning quand il refroidit.
  assert.ok(SOURCE.includes('const auPlanning = ch.planning === true && !simulation && !refroidit(ch);'), 'la condition des cartes');
  // Un thermostat observé : sa consigne et sa marche, en direct. ASSERTION MODIFIÉE : la bascule s'appelle « En marche ».
  const t = rendre({ ch: poele({ planning: true, mode: 'eco' }), etat: etat({ simulation: true }), sonde: null });
  assert.equal(puces(t), null);
  assert.ok(t.includes('aria-label="En marche"') && t.includes('aria-label="Consigne : Plus"'));
});

test('Planning : la semaine en sept rangées, aujourd’hui marqué, les changements du jour choisi', () => {
  const html = rendre({ ongletDepart: 'planning' });
  // Les jours dans l'ordre du français, lundi d'abord ; aujourd'hui (lundi) marqué, un seul trait « maintenant ».
  assert.deepEqual([...html.matchAll(/data-jour="(\d)"/g)].map(m => m[1]), ['0', '1', '2', '3', '4', '5', '6']);
  assert.match(html, /data-jour="0" data-aujourdhui=""/);
  assert.equal((html.match(/data-aujourdhui/g) || []).length, 1);
  assert.equal((html.match(/data-maintenant=""/g) || []).length, 1);
  // Le lundi : cinq bandes (minuit dans l'Éco du dimanche), à la couleur de leur mode.
  const lundi = html.slice(html.indexOf('data-jour="0"'), html.indexOf('data-jour="1"'));
  assert.deepEqual([...lundi.matchAll(/data-bande="(\w+)"/g)].map(m => m[1]), ['eco', 'confort', 'eco', 'confort', 'eco']);
  assert.match(lundi, /data-bande="confort" style="[^"]*background:var\(--o-warn2\)/);
  /* ASSERTIONS MODIFIÉES (tâche 10 bis C, cadre 3c) : les pastilles des
   * jours s'en vont — chaque rangée de la semaine est le bouton qui choisit
   * son jour, nommé en entier. Puis (son choix du 12/10, « Pastille bleue »,
   * et la relecture) : la rangée reste neutre, le nom court du jour choisi
   * devient la pastille bleue ; celle d'aujourd'hui se nomme « Lundi ·
   * aujourd’hui ». */
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1, 'un jour choisi : aujourd’hui');
  assert.match(html, /<button type="button" data-jour="0" data-aujourdhui="" aria-pressed="true" aria-label="Lundi · aujourd’hui" style="[^"]*background:transparent/);
  // Sa liste : un compte ordinaire la lit ; un administrateur la règle (tâche 10 bis C, plus bas).
  const lecture = rendre({ ongletDepart: 'planning' }, maison({ admin: false }));
  assert.ok(/>06:30<[\s\S]*?>Confort<[\s\S]*?>08:30<[\s\S]*?>Éco<[\s\S]*?>18:00<[\s\S]*?>Confort<[\s\S]*?>23:00<[\s\S]*?>Éco</.test(lecture));
  assert.ok(!lecture.includes('aria-expanded'), 'un compte ordinaire lit seulement');
  /* ASSERTION MODIFIÉE (cadre 3c) : un jour sans changement n'a plus de
   * phrase — « Depuis minuit » dit le mode qui continue, et le compte se tait. */
  const vide = rendre({ ongletDepart: 'planning', ch: radiateur({ semaine: { ...SEMAINE, lun: [] } }) });
  assert.ok(!vide.includes('data-changement=') && /data-rangee="minuit"[\s\S]*?>Depuis minuit<[\s\S]*?>Éco</.test(vide), 'la veille continue, dite par « Depuis minuit »');
  assert.ok(!/>\d+ changements?</.test(vide), 'pas de compte');
  const ete = rendre({ ongletDepart: 'planning', etat: etat({ maison: { mode: 'ete', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) });
  assert.deepEqual([...ete.matchAll(/data-bande="(\w+)"/g)].map(m => m[1]), Array(7).fill('arret'));
  /* ASSERTIONS MODIFIÉES (cadre 3c) : planning éteint, une semaine déjà
   * réglée — plus de rappel « il s’allume dans Réglages » : la bascule du haut
   * le dit et l'allume ; la semaine se lit, à .4, et s'édite. */
  const eteint = rendre({ ongletDepart: 'planning', ch: radiateur({ planning: false }) });
  assert.match(eteint, /role="switch" aria-checked="false" aria-label="Suivre le planning"/, 'la bascule le dit');
  assert.ok(eteint.includes('data-bande') && eteint.includes('aria-expanded="false"'), 'la semaine se lit et s’édite');
  assert.ok(!eteint.includes('Réglages') && !eteint.includes('Allumer avec cette semaine'), 'plus de renvoi vers Réglages, plus d’allumage à part');
  const eteintLu = rendre({ ongletDepart: 'planning', ch: radiateur({ planning: false }) }, maison({ admin: false }));
  assert.ok(eteintLu.includes('>Désactivé<') && eteintLu.includes('data-bande') && !eteintLu.includes('aria-expanded'),
    'un compte ordinaire la lit, et lit « Désactivé »');
});

/* TEST RÉÉCRIT (tâche 10 bis D) : « Historique : la courbe 24 h que pose la
 * coquille ». La fiche dessine sa courbe elle-même (cadre 3d) : la coquille ne
 * passe plus `historique`, ni ne lit plus l'historique 24 h de la pièce ;
 * `Courbe24` et `useHistorique24` restent dans App.jsx, pour les autres. */
test('Historique : la fiche dessine sa courbe — la coquille ne la passe plus, et garde `Courbe24` pour les autres', () => {
  // Pas encore lu (un rendu statique ne lance pas la lecture) : les mots de la fiche, rien d'inventé.
  const tout = rendre({ ongletDepart: 'historique' });
  const html = tout.slice(tout.indexOf('class="rb-histo"'));
  assert.ok(html.length > 100 && html.includes('>Chargement…<') && !html.includes('<svg') && !html.includes('>TEMPÉRATURE · 24 H<'), 'la courbe de la coquille est partie');
  // Chargée à la demande, la fiche n'importe jamais App.jsx.
  assert.ok(!/from '\.\/App\.jsx'/.test(SOURCE));
  assert.ok(!/\bhistorique\b[=,}]/.test(SOURCE.slice(SOURCE.indexOf('export default function FicheChauffageContent('))), 'la fiche attend encore `historique`');
  // App.jsx relu ici : `APP`, plus bas dans ce fichier, n'est pas encore lu quand ce test tourne.
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const coquille = app.slice(app.indexOf('\nfunction FicheChauffage('), app.indexOf('\nfunction FeuilleChauffage('));
  assert.ok(coquille.length > 500, 'la coquille introuvable');
  assert.ok(!coquille.includes('historique=') && !coquille.includes('useHistorique24') && !coquille.includes('<Courbe24'), 'la coquille dessine encore la courbe');
  assert.ok(coquille.includes('sonde={sonde}'), 'la fiche reçoit la sonde de la pièce');
  // Les autres feuilles gardent leur courbe.
  // ASSERTION MODIFIÉE (chantier Capteurs, tâche 1) : la fiche d'un capteur, chargée à la demande, reçoit `Courbe24` de sa coquille ; la feuille d'un thermostat et celle d'une zone la dessinent ici.
  assert.ok(app.includes('\nfunction Courbe24(') && app.includes('\nfunction useHistorique24(') && (app.match(/<Courbe24 /g) || []).length >= 2);
});

test('« Suivre le planning », écrit dans la configuration — en tête du Planning depuis la tâche 10 bis C', () => {
  /* ASSERTIONS MODIFIÉES (tâche 10 bis C) : la bascule quitte Réglages pour
   * la tête du Planning (cadre 3c) ; son geste, joué plus bas (« Suivre le
   * planning » en tête du Planning), ne se lit plus dans le texte du source. */
  const html = rendre({ ongletDepart: 'planning' });
  assert.match(html, /role="switch" aria-checked="true" aria-label="Suivre le planning"/);
  assert.match(rendre({ ongletDepart: 'planning', ch: radiateur({ planning: false }) }), /role="switch" aria-checked="false" aria-label="Suivre le planning"/);
  assert.deepEqual(messagePlanning(radiateur(), false), { type: 'loggia/chauffage/config', patch: { chauffages: { [MODULE]: { planning: false } } } });
  assert.deepEqual(messagePlanning(poele(), true).patch, { chauffages: { [POELE]: { planning: true } } });
  assert.ok((SOURCE.match(/role="alert"/g) || []).length >= 2, 'l’Accueil et le Planning disent leur refus');
});

/* ════════════ Le Planning s'édite (tâche 9) ════════════ */

const c = (h, mode) => ({ h, mode });
const config = (chauffages) => ({ type: 'loggia/chauffage/config', patch: { chauffages } });

/* Un module de src/ compilé tel quel, chaque import pris dans son vrai module,
 * sauf ce que le test double : ses composants se JOUENT alors à la main, sans
 * React, crochets doublés — un rendu statique ne clique pas. Le modèle de
 * tests/distributeur_finition.test.mjs. */
async function compilable(chemin) {
  const texte = readFileSync(new URL('../src/' + chemin, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const portee = {};
  for (const [, noms, spec] of texte.matchAll(/^import \{([\s\S]*?)\} from '([^']+)';$/gm)) {
    const m = spec === 'react' ? await import('react') : await import(new URL('../src/' + spec.slice(2), import.meta.url).href);
    noms.split(',').map(x => x.trim()).filter(Boolean).forEach(n => { portee[n] = m[n]; });
  }
  const code = transformSync(texte.replace(/^import [\s\S]*?';$/gm, '').replace(/^export (default )?(function|const) /gm, '$2 '),
    { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Frag' }).code;
  return (doubles, rendu) => {
    const p = { ...portee, ...doubles };
    const noms = Object.keys(p);
    return new Function('__h', '__Frag', ...noms, code + '\nreturn ' + rendu + ';')(createElement, Fragment, ...noms.map(n => p[n]));
  };
}
const FICHE = await compilable('fichechauffage.jsx');
const COMMUNE = await compilable('fichecommune.jsx');

/* Les éléments de l'arbre qui répondent à `test` (sans déplier les composants). */
function chercher(el, test, acc = []) {
  if (!el || typeof el !== 'object') return acc;
  if (Array.isArray(el)) { el.forEach(x => chercher(x, test, acc)); return acc; }
  if (test(el)) acc.push(el);
  if (el.props) chercher(el.props.children, test, acc);
  return acc;
}

/* TEST RETIRÉ (tâche 10 bis C) : « Planning, administrateur : chaque
 * changement se règle sur place — l’heure, le mode, ✕ —, « Ajouter » et
 * « Copier ce jour vers… » ». La saisie de l'heure au clavier, la liste des
 * modes, le ✕ à deux appuis et le menu des copies s'en vont avec la maquette
 * (cadre 3c) ; leurs remplaçants — la rangée qui se déplie, ± 15 min, la
 * grille des modes, « Supprimer ce changement », « Copier cette journée sur »
 * — ont leurs tests en fin de fichier. */

test('« Ajouter un changement » se cache à douze changements ce jour-là', () => {
  /* ASSERTIONS MODIFIÉES (tâche 10 bis C) : une rangée de changement n'est
   * plus un groupe nommé « Changement de … » (elle se compte par
   * `data-changement`) ; la copie s'appelle « Copier cette journée sur ». */
  const douze = { ...SEMAINE, lun: Array.from({ length: 12 }, (_, i) => c(String(i * 2).padStart(2, '0') + ':00', i % 2 ? 'eco' : 'confort')) };
  const plein = rendre({ ongletDepart: 'planning', ch: radiateur({ semaine: douze }) });
  assert.equal((plein.match(/data-changement="/g) || []).length, 12, 'témoin : douze lignes');
  assert.ok(!plein.includes('Ajouter un changement'), 'le serveur refuserait le treizième');
  assert.ok(plein.includes('>Copier cette journée sur<'), 'copier reste');
  assert.ok(rendre({ ongletDepart: 'planning', ch: radiateur({ semaine: { ...douze, lun: douze.lun.slice(1) } }) }).includes('Ajouter un changement'), 'témoin : onze');
  assert.ok(SOURCE.includes('liste.length < MAX_CHANGEMENTS_JOUR'), 'la borne est celle du serveur');
});

/* TEST RETIRÉ (tâche 10 bis C) : « le premier allumage : la semaine type à
 * allumer, ou celle d’un autre chauffage à copier ». Jamais réglé, le
 * Planning dit « Pas de planning » et propose « Créer un planning » (cadre
 * 3f) : ni semaine montrée d'avance, ni « Allumer avec cette semaine », ni
 * « Copier depuis… » — en fin de fichier. */

test('les gestes de l’éditeur, en messages : vérifiés sur place avant de partir', () => {
  const ch = radiateur();
  const propre = PLAN.semainePropre(SEMAINE);
  const lundi = (r) => r.semaine.lun.map(x => x.h + ' ' + x.mode);
  /* Ajouter. ASSERTIONS MODIFIÉES (son choix du 12/10, « Toucher l’heure ») :
   * le nouveau changement se pose au MILIEU du plus grand trou de la journée
   * (08:30 → 18:00 : 13:15), plus à la première heure pleine libre (08:00,
   * coincé entre 06:30 et 08:30 que ± 15 min ne passent pas) — en Éco à
   * 13:15, le Confort ; il se range troisième. */
  const ajout = gesteSemaine(ch, SEMAINE, { quoi: 'ajouter', jour: 0 });
  assert.deepEqual(lundi(ajout), ['06:30 confort', '08:30 eco', '13:15 confort', '18:00 confort', '23:00 eco']);
  assert.deepEqual(ajout.message, config({ [MODULE]: { semaine: ajout.semaine } }));
  assert.deepEqual(ajout.message, messageSemaine(ch, ajout.semaine));
  assert.equal(ajout.ligne, 2);
  assert.deepEqual(ajout.semaine.mar, propre.mar, 'la semaine entière part, les autres jours tels quels');
  // Retirer, l'heure, le mode.
  assert.deepEqual(lundi(gesteSemaine(ch, SEMAINE, { quoi: 'retirer', jour: 0, index: 2, avant: '18:00' })), ['06:30 confort', '08:30 eco', '23:00 eco']);
  const deplace = gesteSemaine(ch, SEMAINE, { quoi: 'heure', jour: 0, index: 1, avant: '08:30', h: '19:00' });
  assert.deepEqual(lundi(deplace), ['06:30 confort', '18:00 confort', '19:00 eco', '23:00 eco']);
  assert.equal(deplace.ligne, 2, 'il a changé de place : sa nouvelle ligne');
  assert.deepEqual(lundi(gesteSemaine(ch, SEMAINE, { quoi: 'mode', jour: 0, index: 0, avant: '06:30', mode: 'confort_1' })),
    ['06:30 confort_1', '08:30 eco', '18:00 confort', '23:00 eco']);
  // Refusés sur place : rien ne part.
  assert.deepEqual(gesteSemaine(ch, SEMAINE, { quoi: 'heure', jour: 0, index: 1, avant: '08:30', h: '18:00' }), { refus: 'heure_en_double' });
  assert.deepEqual(gesteSemaine(ch, SEMAINE, { quoi: 'heure', jour: 0, index: 1, avant: '08:30', h: '8:3' }), { refus: 'heure_illisible' });
  const douze = { ...SEMAINE, lun: Array.from({ length: 12 }, (_, i) => c(String(i * 2).padStart(2, '0') + ':00', 'eco')) };
  assert.deepEqual(gesteSemaine(ch, douze, { quoi: 'ajouter', jour: 0 }), { refus: 'douze' });
  const seul = { lun: [c('07:00', 'confort')], mar: [], mer: [], jeu: [], ven: [], sam: [], dim: [] };
  assert.deepEqual(gesteSemaine(ch, seul, { quoi: 'retirer', jour: 0, index: 0, avant: '07:00' }), { refus: 'derniere' });
  // Rien ne change : rien ne part.
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'heure', jour: 0, index: 1, avant: '08:30', h: '08:30' }), null);
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'mode', jour: 0, index: 0, avant: '06:30', mode: 'confort' }), null);
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'jours', jour: 0, vers: 'semaine' }), null, 'les jours de semaine sont déjà ceux du lundi');
  // Une ligne qui ne montre plus le changement qu'elle montrait (la semaine a bougé) : le geste tombe.
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'retirer', jour: 0, index: 1, avant: '06:30' }), null);
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'mode', jour: 0, index: 1, mode: 'eco' }), null, 'sans son heure, rien');
  /* Copier vers d'autres jours : en semaine, tous les jours. ASSERTIONS
   * MODIFIÉES (tâche 10 bis C, cadre 3c) : la copie « Le week-end » s'en va
   * avec le menu — la maquette ne garde que « Lun – ven » et « Toute la
   * semaine » ; demandée quand même, elle ne fait rien. */
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'jours', jour: 0, vers: 'weekend' }), null, 'plus de copie vers le week-end');
  const semaine = gesteSemaine(ch, SEMAINE, { quoi: 'jours', jour: 6, vers: 'semaine' });
  for (const j of ['lun', 'mar', 'mer', 'jeu', 'ven']) assert.deepEqual(semaine.semaine[j], propre.dim, j);
  assert.equal(semaine.ligne, null, 'une copie ne déplace aucune ligne');
  assert.deepEqual(gesteSemaine(ch, SEMAINE, { quoi: 'jours', jour: 2, vers: 'tous' }).semaine.sam, propre.mer);
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'tout effacer', jour: 0 }), null, 'un geste inconnu ne fait rien');
  /* ASSERTION AJOUTÉE (tâche 10 bis C) : la copie vers le même jour d'un
   * autre chauffage s'en va aussi ; le geste ne fait plus rien. */
  assert.equal(gesteSemaine(ch, SEMAINE, { quoi: 'chauffage', jour: 0, cle: VTHERM }), null, 'plus de copie vers un autre chauffage');
});

/* TEST RETIRÉ (tâche 10 bis C) : « copier un jour vers un autre chauffage :
 * le même jour chez lui, jamais plus chaud, les deux semaines d’un seul
 * patch ». La copie vers un autre chauffage s'en va avec le menu « Copier ce
 * jour vers… » (cadre 3c) ; `copierJourChez` et `copieChez` partent avec
 * elle. La règle « jamais plus chaud » reste tenue par `adapterAuxModes` et
 * `semaineAdaptee` (tests/chauffageplanning.test.mjs, sur une valeur écrite
 * en dur), qu'empruntent toute semaine envoyée et « Créer un planning ». */

/* TESTS RETIRÉS (tâche 10 bis C), remplacés en fin de fichier par leurs
 * équivalents sur la maquette (cadres 3c et 3f) :
 *  - « les gestes, joués : une modification valide part aussitôt… » — la
 *    liste des modes, le ✕ et le menu des copies s’en vont ; ± 15 min, le
 *    champ de l’heure au centre de la rangée dépliée (son choix du 12/10), la
 *    grille des modes, « Supprimer ce changement », « Ajouter » et « Copier
 *    cette journée sur » ont les leurs ;
 *  - « un refus local reste sur place et se dit sous sa ligne… » — réécrit
 *    pour la rangée dépliée (« un refus local se dit dans sa rangée… ») ;
 *  - « le premier allumage, joué… » et « le premier allumage propose la
 *    semaine type dans les modes du chauffage… » — « Allumer avec cette
 *    semaine » et « Copier depuis… » s’en vont : « Créer un planning » pose la
 *    semaine type dans les modes du chauffage, sans allumer le planning. */

/* TITRE MODIFIÉ (relecture de la partie C) : le champ d'heure sert de nouveau
 * — au centre de la rangée dépliée d'un changement (son choix du 12/10,
 * « Toucher l’heure ») ; ASSERTIONS AJOUTÉES : refusée (`onValide` rend
 * false), l'heure redevient celle d'avant ; `style` habille le champ. */
test('le champ de l’heure d’un changement (ChampHeure, aLaSortie) ne rend l’heure qu’à la sortie : une heure à moitié tapée ne part pas ; refusée, elle redevient celle d’avant', () => {
  const valides = [];
  let v = '08:30';
  const { ChampHeure: Champ } = COMMUNE({ useState: () => [v, (n) => { v = n; }], useEffect: () => {} }, '{ ChampHeure }');
  const champ = () => Champ({ valeur: '08:30', onValide: (x) => valides.push(x), nom: 'Heure', aLaSortie: true });
  champ().props.onChange({ target: { value: '00:30' } });   // « 0 », en route vers 09:30
  champ().props.onChange({ target: { value: '09:30' } });
  assert.deepEqual(valides, [], 'rien ne part en cours de frappe');
  assert.equal(v, '09:30', 'le champ montre ce qu’on tape');
  champ().props.onBlur({ target: { value: '09:30' } });
  assert.deepEqual(valides, ['09:30'], 'l’heure part en quittant le champ');
  champ().props.onKeyDown({ key: 'Enter', currentTarget: { value: '10:15' } });
  assert.deepEqual(valides, ['09:30', '10:15'], 'ou par Entrée');
  champ().props.onKeyDown({ key: 'Tab', currentTarget: { value: '11:00' } });
  champ().props.onBlur({ target: { value: '08:30' } });
  assert.deepEqual(valides, ['09:30', '10:15'], 'une autre touche, ou la même heure : rien');
  champ().props.onBlur({ target: { value: '' } });
  assert.equal(v, '08:30', 'laissée incomplète, l’heure redevient celle d’avant');
  // Sans `aLaSortie` — les repas du distributeur —, chaque heure entière part aussitôt, comme avant.
  const repas = Champ({ valeur: '08:00', onValide: (x) => valides.push(x), nom: 'Heure' });
  assert.equal(repas.props.onBlur, undefined);
  repas.props.onChange({ target: { value: '09:00' } });
  assert.equal(valides.at(-1), '09:00');
  // Refusée — `onValide` rend false (une heure déjà prise du planning) — : le champ redit l'heure vraie.
  v = '08:30';
  const refuse = () => Champ({ valeur: '08:30', onValide: () => false, nom: 'Heure', aLaSortie: true });
  refuse().props.onChange({ target: { value: '18:00' } });
  assert.equal(v, '18:00');
  refuse().props.onBlur({ target: { value: '18:00' } });
  assert.equal(v, '08:30', 'refusée, l’heure redevient celle d’avant');
  // Une promesse (les repas du distributeur) ou rien n'est pas un refus : le champ garde ce qu'on a choisi.
  v = '08:30';
  const promesse = () => Champ({ valeur: '08:30', onValide: () => Promise.resolve(), nom: 'Heure', aLaSortie: true });
  promesse().props.onChange({ target: { value: '09:45' } });
  promesse().props.onBlur({ target: { value: '09:45' } });
  assert.equal(v, '09:45', 'une promesse n’est pas un refus');
  // `style` habille le champ par-dessus son dessin ; sans lui, le dessin d'avant (celui de HEAD).
  const CHAMP_HEURE_AVANT = { padding: '9px 12px', borderRadius: 12, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 15,
    fontWeight: 700, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', colorScheme: 'inherit' };
  assert.deepEqual(Champ({ valeur: '08:30', onValide: () => {}, nom: 'Heure' }).props.style, CHAMP_HEURE_AVANT);
  const habille = Champ({ valeur: '08:30', onValide: () => {}, nom: 'Heure', style: { fontSize: 17, border: 'none' } }).props.style;
  assert.deepEqual(habille, { ...CHAMP_HEURE_AVANT, fontSize: 17, border: 'none' });
});

/* TITRE ET ASSERTIONS MODIFIÉS (relecture de la partie C, point C) : le ✕ à
 * deux appuis est parti ; `nom` sert maintenant aux deux copies d'une
 * journée — « Lun – ven », « Toute la semaine » écrasent jusqu'à six jours,
 * sans retour : deux appuis, comme tout geste qui ne se rattrape pas. Leur nom
 * dit ce qu'elles font, et contient le mot qu'on voit. `style` : le dessin de
 * qui l'emploie (la puce de 40 px de la maquette) ; armé, le rouge reste. */
test('« Lun – ven », « Toute la semaine » : deux appuis (BoutonConfirme), un nom qui dit ce qu’elles font, le dessin de qui l’emploie', () => {
  const nom = 'Copier cette journée sur : Lun – ven';
  const copie = renderToStaticMarkup(createElement(BoutonConfirme, { libelle: 'Lun – ven', nom, onConfirme: () => {} }));
  assert.match(copie, /^<button type="button" aria-label="Copier cette journée sur : Lun – ven" title="Copier cette journée sur : Lun – ven"/);
  // Armé, « Confirmer ? » se lit, et c'est lui qui se dit.
  const { BoutonConfirme: Arme } = COMMUNE({ useState: () => [true, () => {}], useEffect: () => {} }, '{ BoutonConfirme }');
  const arme = Arme({ libelle: 'Lun – ven', nom, onConfirme: () => {} });
  assert.equal(arme.props['aria-label'], undefined);
  assert.equal(arme.props.children, 'Confirmer ?');
  // Sans nom ni style, rien ne change : « Supprimer » d'un repas se lit déjà, à son dessin d'avant.
  const repas = renderToStaticMarkup(createElement(BoutonConfirme, { libelle: 'Supprimer', onConfirme: () => {} }));
  assert.equal(repas, '<button type="button" style="padding:9px 14px;border-radius:12px;border:none;cursor:pointer;font-size:12.5px;font-weight:700;background:var(--o-s1);color:var(--o-text1);font-family:inherit">Supprimer</button>');
  // Le dessin de qui l'emploie ; le fond et l'encre restent les siens — le gris doux, puis le rouge d'une suppression armée.
  const { BoutonConfirme: Libre } = COMMUNE({ useState: () => [false, () => {}], useEffect: () => {} }, '{ BoutonConfirme }');
  const style = { minHeight: 40, padding: '0 12px', borderRadius: 10, fontSize: 12, whiteSpace: 'nowrap', background: 'var(--o-accent-fond)' };
  const libre = Libre({ libelle: 'Lun – ven', nom, style, onConfirme: () => {} }).props.style;
  assert.deepEqual([libre.minHeight, libre.padding, libre.borderRadius, libre.fontSize, libre.whiteSpace, libre.background, libre.color], [40, '0 12px', 10, 12, 'nowrap', 'var(--o-s1)', 'var(--o-text1)']);
  const armeStyle = Arme({ libelle: 'Lun – ven', nom, style, onConfirme: () => {} }).props.style;
  assert.deepEqual([armeStyle.minHeight, armeStyle.background, armeStyle.color], [40, 'rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']);
});

/* ════════════ L'Historique, les Réglages, l'appareil qui refroidit (tâche 10) ════════════ */

// `h` heures avant « maintenant » (lundi 19:00 à la maison), écrit comme Home Assistant écrit un instant.
const ilYA = (h) => new Date(MAINTENANT - h * 3600e3).toISOString().replace('Z', '+00:00');
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Un onglet de la fiche, JOUÉ : ses crochets doublés — chaque `useState` rend
 * sa valeur de départ, ou celle d'`etats` sous le nom que lui donne `noms`
 * (dans l'ordre des appels) ; chaque `useOptimiste`, rien en vol — et tout ce
 * qui part relevé : les messages au moteur, les ordres à l'appareil, les
 * avances posées, les états posés, les lectures de l'historique, et le focus
 * (`focaliser`, doublé — tâche 10 bis C). Les briques de l'onglet Planning
 * sortent aussi, pour être dépliées à la main. */
function jouer(nom, props, { noms = [], etats = {}, commande = () => Promise.resolve({}), historique = [], optimiste = () => null } = {}) {
  const envoyes = [], appels = [], avances = [], poses = [], lectures = [], focus = [], memos = [];
  let n = 0;
  const F = FICHE({
    useState: (v) => { const k = noms[n++]; return [k !== undefined && k in etats ? etats[k] : v, (x) => poses.push([k, x])]; },
    // `optimiste(lu)` : l'avance en vol pour cette valeur lue (rien, par défaut).
    useOptimiste: (lu) => [optimiste(lu), (v) => avances.push(v)],
    useRef: () => ({ current: true }),
    useEffect: () => {},
    // `useMemo` (tâche 10 bis D, relecture) : calculé à chaque fois, ses dépendances relevées.
    useMemo: (f, deps) => { memos.push(deps); return f(); },
    commanderChauffage: (h, m) => { envoyes.push(m); return commande(m); },
    commander: (h, id, capacite, v) => { appels.push([capacite, id, v]); return v; },
    commanderService: (h, id, domaine, service, data) => { appels.push([domaine + '.' + service, id, data]); return null; },
    // `historique` : ce que rend chaque lecture — ou, une fonction, ce qu'elle rend pour CETTE lecture (tâche 10 bis D : la sonde, puis l'appareil).
    useHistoriquePeriode: (h, o) => { lectures.push(o); return typeof historique === 'function' ? historique(o) : historique; },
    // La lecture par le serveur (audit du 19/10) en repli : ces tests lisent `history/period`.
    useHistoriqueClimat: () => 'repli',
    focaliser: (...ids) => focus.push(ids),
  }, '{ ' + nom + ', Puces, PucesNommees, PasCarre, SemaineDuPlanning, LigneChangement, SansPlanning, TemperaturesDesModes, SupprimerSonPlanning, DonneesHistorique }');
  const pose = (k) => poses.filter(p => p[0] === k).map(p => p[1]);
  return { F, arbre: F[nom](props), envoyes, appels, avances, pose, lectures, focus, memos };
}

/* L'onglet Historique RENDU, l'historique doublé : `lu`, ce que rend
 * `useHistoriquePeriode` (null, 'erreur' ou ses listes) — ou, une fonction,
 * ce qu'elle rend pour chaque lecture (`o` : ses `ids`, ses `idsAttributs`).
 * ASSERTION MODIFIÉE (tâche 10 bis D) : la fiche dessine sa courbe — plus de
 * `historique` passé ; la sonde de la pièce, l'heure de la maison et la
 * période à la place. */
function rendreHistorique(lu, props = {}, h = maison()) {
  const lectures = [];
  // La lecture par le serveur (audit du 19/10) en repli : ces tests lisent `history/period`.
  const { OngletHistorique } = FICHE({ useHistoriquePeriode: (hh, o) => { lectures.push(o); return typeof lu === 'function' ? lu(o) : lu; },
    useHistoriqueClimat: () => 'repli' }, '{ OngletHistorique }');
  const html = renderToStaticMarkup(createElement(OngletHistorique, { hass: h, ch: radiateur(), sonde: SONDE, minute: [0, 1140], periode: '24h', t: MAINTENANT, ...props }));
  return { html, lectures };
}

/* Un groupe de puces nommé par le libellé VISIBLE qui le précède
 * (`aria-labelledby`, l'identifiant finissant par `-suffixe`) : ce libellé,
 * le style du groupe, et chaque puce — son état, son mot, ses attributs. */
function groupe(html, suffixe) {
  const m = new RegExp('<div role="group" aria-labelledby="([^"]*-' + echapper(suffixe) + ')" style="([^"]*)">').exec(html);
  if (!m) return null;
  const libelle = new RegExp('id="' + echapper(m[1]) + '"[^>]*>([^<]*)<').exec(html);
  const corps = html.slice(m.index, html.indexOf('</div>', m.index));
  return { libelle: libelle && libelle[1], style: m[2],
    puces: [...corps.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map(x => ({ presse: attr(x[1], 'aria-pressed'), mot: texte('>' + x[2] + '<'), attrs: x[1] })) };
}

/* TESTS RÉÉCRITS (tâche 10 bis D, cadre 3d) : « Historique : sous la courbe,
 * les modes que l’appareil a réellement appliqués — la barre de la carte… » et
 * « Historique : un thermostat se lit avec ses attributs… ». La barre de la
 * carte (`BarrePlanning`), le titre « Modes appliqués · 24 h » et la légende
 * des modes vus s'en vont avec la maquette : la bande de 6 px sous la courbe,
 * et le panneau du temps par mode (ou de chauffe), les remplacent. Leurs
 * tests, et ceux du chargement, de l'échec et du vide, sont en fin de
 * fichier (« L'Historique de sa maquette »), après les aides qu'ils lisent. */

/* TESTS DÉPLACÉS (tâche 10 bis C) : « Réglages d’un thermostat… », « Réglages,
 * joués… » et « Réglages : « Supprimer son planning »… » suivent leur contenu
 * dans le Planning, en fin de fichier (les températures en − / + carrés de
 * 44 px, `PasCarre`, au lieu de `PasAPas`) ; « Réglages perd la fenêtre… »
 * devient « l’onglet Réglages est parti… ». */

/* Le mot d'un mode `hvac`, celui de la fiche d'avant : `motModeClimat`
 * (App.jsx), compilé tel quel. La coquille le passe à la fiche (`motHvac`) —
 * la fiche, chargée à la demande, n'importe jamais App.jsx, et n'en recopie
 * pas la table : `tr('Froid')` et `tr('Sec')` n'ont qu'un appel
 * (tests/froid_sec_deux_sens.test.mjs). */
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const I18N = await import('../src/i18n.js');
const motModeClimat = (() => {
  const i = APP.indexOf('\nfunction motModeClimat(');
  assert.ok(i > 0, 'motModeClimat introuvable dans App.jsx');
  return new Function('tr', 'trHA', APP.slice(i, APP.indexOf('\n}\n', i) + 2) + '\nreturn motModeClimat;')(I18N.tr, I18N.trHA);
})();

/* Une climatisation réversible : un thermostat pour le serveur (il reçoit une
 * consigne), planning éteint. */
const CLIM = 'climate.climatisation';
const clim = (o = {}, etatHvac = 'cool') => st(CLIM, etatHvac, { friendly_name: 'Climatisation', hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'],
  hvac_action: 'cooling', temperature: 24, current_temperature: 26, min_temp: 16, max_temp: 30, target_temp_step: 0.5,
  preset_modes: ['eco', 'comfort', 'boost'], preset_mode: 'comfort', supported_features: 403, ...o });
const climatisation = (o = {}) => poele({ cle: CLIM, entite: CLIM, nom: 'Climatisation', ...o });

test('un appareil qui sait refroidir, planning éteint : ses modes, ses préréglages, « Refroidit » — comme sa fiche d’avant', () => {
  const html = rendre({ ch: climatisation(), sonde: null, motHvac: motModeClimat }, maison({ states: [clim()] }));
  assert.match(html, /font-size:28px;[^"]*color:var\(--o-cold\)[^"]*">Refroidit</, 'il refroidit : il le dit, en grand');
  const modes = groupe(html, 'hvac');
  assert.equal(modes.libelle, 'Mode');
  assert.deepEqual(modes.puces.map(p => p.mot), ['Chauffage', 'Froid', 'Auto', 'Sec', 'Ventil', 'Arrêt'], 'les mots de la fiche d’avant');
  // Ces mots, la coquille les passe ; sans eux, le mode tel que l'appareil l'écrit — jamais une table recopiée.
  assert.ok(APP.includes('onFiche={setFiche} motHvac={motModeClimat}'), 'la coquille passe `motModeClimat`');
  assert.deepEqual(groupe(rendre({ ch: climatisation(), sonde: null }, maison({ states: [clim()] })), 'hvac').puces.map(p => p.mot),
    ['heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'off']);
  assert.ok(!SOURCE.includes("tr('Froid')") && !SOURCE.includes("tr('Sec')"));
  assert.deepEqual(modes.puces.map(p => p.presse), ['false', 'true', 'false', 'false', 'false', 'false'], 'le mode de l’appareil');
  assert.match(modes.style, /gap:4px;padding:4px;border-radius:12px;background:var\(--o-well\)/, 'un groupe segmenté, dans le puits');
  assert.match(modes.puces[1].attrs, /background:var\(--o-accent-fond\);color:#fff/);
  const presets = groupe(html, 'preset');
  assert.equal(presets.libelle, 'Préréglage');
  assert.deepEqual(presets.puces.map(p => [p.mot, p.presse]), [['eco', 'false'], ['comfort', 'true'], ['boost', 'false']]);
  /* Sa consigne et sa marche, comme avant ; pas de puces des modes du planning.
   * ASSERTIONS MODIFIÉES (cadre 3e) : la consigne s'écrit « 24,0° », la
   * bascule s'appelle « En marche ». */
  assert.ok(html.includes('aria-label="Consigne : Plus"') && html.includes('>24,0°<') && /role="switch" aria-checked="true" aria-label="En marche"/.test(html));
  assert.equal(puces(html), null);
  // Le poêle : chauffer ou s'arrêter, la bascule suffit — pas de groupe des modes ; ses préréglages, oui.
  const poeleAPresets = st(POELE, 'heat', { hvac_modes: ['off', 'heat'], hvac_action: 'heating', temperature: 20.5, min_temp: 5, max_temp: 35, target_temp_step: 0.5,
    supported_features: 401, preset_modes: ['turbo', 'manual', 'comfort', 'auto', 'overnight'], preset_mode: 'manual' });
  const p = rendre({ ch: poele(), sonde: null }, maison({ states: [poeleAPresets] }));
  assert.equal(groupe(p, 'hvac'), null);
  assert.deepEqual(groupe(p, 'preset').puces.map(x => [x.mot, x.presse]),
    [['turbo', 'false'], ['manual', 'true'], ['comfort', 'false'], ['auto', 'false'], ['overnight', 'false']]);
  // ASSERTION MODIFIÉE (« Celles de la maquette ») : la chauffe à l'orange, plus au rouge.
  assert.match(p, /font-size:28px;[^"]*color:var\(--o-warn2\)[^"]*">Chauffe</, 'témoin : il chauffe');
  // Témoin : le poêle des autres tests, sans préréglage, n'a aucun groupe.
  assert.equal(groupe(rendre({ ch: poele(), sonde: null }), 'preset'), null);
});

test('un appareil en heat_cool : sa plage, consigne basse et haute, ses deux bornes envoyées ensemble', () => {
  const plage = maison({ states: [clim({ temperature: null, target_temp_low: 20, target_temp_high: 24, hvac_action: 'idle' }, 'heat_cool')] });
  const html = rendre({ ch: climatisation(), sonde: null, motHvac: motModeClimat }, plage);
  /* ASSERTIONS MODIFIÉES (tâche 10 bis B, cadre 3e) : les bornes s'écrivent
   * comme la consigne, « 20,0° » — le dessin de la rangée « Consigne ». */
  assert.ok(/data-plage="bas"[\s\S]*?>Consigne basse<[\s\S]*?>20,0°</.test(html), 'la basse');
  assert.ok(/data-plage="haut"[\s\S]*?>Consigne haute<[\s\S]*?>24,0°</.test(html), 'la haute');
  for (const nom of ['Consigne basse : Moins', 'Consigne basse : Plus', 'Consigne haute : Moins', 'Consigne haute : Plus']) assert.ok(html.includes('aria-label="' + nom + '"'), nom);
  assert.ok(!html.includes('aria-label="Consigne : Plus"'), 'pas de consigne unique inventée');
  assert.match(html, /font-size:28px;[^"]*">Au repos</);
  assert.deepEqual(groupe(html, 'hvac').puces.filter(p => p.presse === 'true').map(p => p.mot), ['Auto'], 'heat_cool');
  /* Jouée : chaque appui envoie les DEUX bornes, par `climate.set_temperature` ;
   * à une borne de l'appareil, le bouton se grise. ASSERTIONS MODIFIÉES (cadre
   * 3e) : les − / + sont ceux de la rangée « Consigne », carrés de 44 px
   * (`PasCarre`, local à la fiche) — `PasAPas`, partagé, ne change pas. */
  const props = { idBase: 'b', hass: plage, ch: climatisation(), etat: etat(), sonde: null, onFiche: null, simulation: false, minute: [0, 1140], t: MAINTENANT };
  const j = jouer('OngletAccueil', props, { noms: ['err'] });
  const pas = (nom) => chercher(j.arbre, el => el.type === j.F.PasCarre && el.props.nom === nom)[0];
  pas('Consigne basse').props.plus();
  pas('Consigne haute').props.moins();
  assert.deepEqual(j.appels, [
    ['climate.set_temperature', CLIM, { entity_id: CLIM, target_temp_low: 20.5, target_temp_high: 24 }],
    ['climate.set_temperature', CLIM, { entity_id: CLIM, target_temp_low: 20, target_temp_high: 23.5 }],
  ]);
  assert.deepEqual(j.avances, [{ bas: 20.5, haut: 24 }, { bas: 20, haut: 23.5 }], 'montrée d’avance');
  const auBord = jouer('OngletAccueil', { ...props, hass: maison({ states: [clim({ temperature: null, target_temp_low: 16, target_temp_high: 16.5 }, 'heat_cool')] }) }, { noms: ['err'] });
  assert.deepEqual(chercher(auBord.arbre, el => el.type === auBord.F.PasCarre).map(x => [x.props.nom, x.props.peutMoins, x.props.peutPlus]),
    [['Consigne basse', false, false], ['Consigne haute', false, true]], 'la basse à sa borne, et jamais sur la haute');
});

test('l’appareil qui refroidit, joué : l’ordre part à l’appareil ; au planning, rien de cela — en observation, tout', () => {
  const h = maison({ states: [clim()] });
  const props = { idBase: 'b', hass: h, ch: climatisation(), etat: etat(), sonde: null, onFiche: null, simulation: false, minute: [0, 1140], t: MAINTENANT };
  const j = jouer('OngletAccueil', props, { noms: ['err'] });
  const [modes, presets] = chercher(j.arbre, el => el.type === j.F.PucesNommees);
  assert.deepEqual([modes.props.id, presets.props.id], ['b-hvac', 'b-preset']);
  modes.props.onChoisir('heat');
  presets.props.onChoisir('boost');
  assert.deepEqual(j.appels, [['set_hvac_mode', CLIM, 'heat'], ['set_preset_mode', CLIM, 'boost']], 'l’ordre direct, à l’appareil');
  assert.deepEqual(j.avances, ['heat', 'boost']);
  assert.deepEqual(j.envoyes, [], 'rien au moteur');
  // Au planning : le planning commande — ni modes de l'appareil, ni préréglages, ni « Refroidit », ni plage.
  const auPlanning = { planning: true, mode: 'confort', source: 'planning', fin: '2026-10-12T22:00:00+02:00', puis: 'eco' };
  const plage = maison({ states: [clim({ temperature: null, target_temp_low: 20, target_temp_high: 24 }, 'heat_cool')] });
  for (const html of [rendre({ ch: climatisation(auPlanning), sonde: null }, h), rendre({ ch: climatisation(auPlanning), sonde: null }, plage)]) {
    assert.equal(groupe(html, 'hvac'), null);
    assert.equal(groupe(html, 'preset'), null);
    assert.ok(!html.includes('>Refroidit<') && !html.includes('data-plage'), 'ni « Refroidit », ni plage');
    assert.ok(puces(html), 'les modes du planning');
  }
  // En « Observer sans agir », le moteur n'envoie rien : la fiche commande l'appareil, comme planning éteint.
  const observe = rendre({ ch: climatisation(auPlanning), etat: etat({ simulation: true }), sonde: null }, h);
  assert.ok(groupe(observe, 'hvac') && groupe(observe, 'preset') && observe.includes('>Refroidit<'));
  // Muet : rien à commander en direct.
  const muet = rendre({ ch: climatisation(), sonde: null }, maison({ states: [st(CLIM, 'unavailable', {})] }));
  assert.ok(!groupe(muet, 'hvac') && !groupe(muet, 'preset') && muet.includes('>Indisponible<'));
});

/* TEST DÉPLACÉ (tâche 10 bis C) : « toute semaine envoyée part dans les
 * modes du chauffage… » se joue désormais sur la rangée dépliée (± 15 min, un
 * mode) et « Créer un planning », en fin de fichier. */

/* ════════════ L'en-tête et l'Accueil de sa maquette (tâche 10 bis B) ════════════
 *
 * Les cadres 3b (l'Accueil d'un fil pilote ou d'un VTherm) et 3e (celui d'un
 * thermostat) de la maquette « Cartes chauffage » — « Proposition 3 », son
 * choix du 11/10 : les tailles, les graisses, les couleurs, les écarts et les
 * textes s'appliquent tels quels. Le dépôt garde ses Puces pour un groupe
 * segmenté (dans le puits), `FicheOnglets`, `EnteteFiche` et le liseré du
 * réglage « Liserés » sur les panneaux. */

// Les déclarations d'un attribut `style`, en table.
const declarations = (s) => Object.fromEntries(String(s).split(';').filter(Boolean).map(d => { const i = d.indexOf(':'); return [d.slice(0, i), d.slice(i + 1)]; }));
// Le haut de l'Accueil : le mot en grand, son style, la phrase dessous et son encre.
function grandDe(html) {
  const m = /<div data-grand=""(?: data-mode="[^"]*")? style="([^"]*)">([^<]*)<\/div>(?:<div data-sous="" style="([^"]*)">([^<]*)<\/div>)?/.exec(html);
  return m ? { texte: m[2], style: declarations(m[1]), sous: m[4] === undefined ? null : m[4], encreSous: m[3] ? declarations(m[3]).color : null } : null;
}
// Les rangées de la liste, dans l'ordre.
const rangeesDe = (html) => [...html.matchAll(/data-rangee="(\w+)"/g)].map(m => m[1]);
// La journée d'aujourd'hui que le serveur donne (`jour`) : la chambre en Confort de 18:00 à 23:00.
const JOUR_CHAMBRE = [{ de: 0, a: 390, mode: 'eco' }, { de: 390, a: 510, mode: 'confort' }, { de: 510, a: 1080, mode: 'eco' },
  { de: 1080, a: 1380, mode: 'confort' }, { de: 1380, a: 1440, mode: 'eco' }];
const PUISSANCE = 'sensor.radiateur_chambre_puissance';
const watts = (w) => st(PUISSANCE, String(w), { device_class: 'power', unit_of_measurement: 'W' });
const accueil = (o = {}) => ({ idBase: 'b', hass: maison(), ch: radiateur(), etat: etat(), sonde: SONDE, onFiche: () => {}, onOnglet: null,
  simulation: false, minute: [0, 1140], t: MAINTENANT, ...o });
const LISERE_ATTENDU = 'var(--o-bw,1px) solid var(--o-bd2)';
const FILET_ATTENDU = 'var(--o-bw,1px) solid var(--o-bd3)';

test('l’en-tête : la plaque de la carte à gauche du nom, « pièce · type » dessous — en 12 px, au gris secondaire', () => {
  const tete = (html) => html.slice(0, html.indexOf('role="tablist"'));
  const plaqueDe = (html) => {
    const m = /<span aria-hidden="true" data-plaque="" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-([a-z-]+)" style="font-size:18px;/.exec(tete(html));
    if (!m) return null;
    const s = declarations(m[1]);
    return { fond: s.background, encre: s.color, glyphe: m[2], s };
  };
  // ASSERTION MODIFIÉE (passe bis du chantier Mode enfant, 17/10, point 12) : `break-word` et `min-width: 0` — « Schlafzimm / er » se coupait au milieu à 320 px en allemand.
  const sousNom = (html) => { const m = /<div style="font-size:12px;font-weight:600;color:var\(--o-text2\);margin-top:2px;min-width:0;overflow-wrap:break-word;hyphens:auto">([^<]*)<\/div>/.exec(tete(html)); return m ? m[1] : null; };
  // Un fil pilote au planning, en Confort : la plaque de sa carte (son lavis à .16, son encre), le glyphe `heat`.
  const html = rendre({ piece: 'Chambre', epingle: createElement('span', { 'data-epingle': '' }) });
  const p = plaqueDe(html);
  assert.ok(p, 'pas de plaque dans l’en-tête');
  assert.deepEqual([p.s.width, p.s.height, p.s['border-radius'], p.s['flex-shrink'], p.s.display, p.s['align-items'], p.s['justify-content']],
    ['40px', '40px', '12px', '0', 'flex', 'center', 'center'], '40 × 40, arrondi 12');
  assert.deepEqual([p.fond, p.encre, p.glyphe], ['rgba(var(--o-warn2-rgb),.16)', 'var(--o-warn2)', 'heat']);
  const t = tete(html);
  assert.ok(t.indexOf('data-plaque') < t.indexOf('>Radiateur Chambre<') && t.indexOf('>Radiateur Chambre<') < t.indexOf('data-epingle'), 'la plaque, le nom, puis l’épingle');
  assert.equal(sousNom(html), 'Chambre · fil pilote');
  assert.ok(t.indexOf('>Chambre · fil pilote<') > t.indexOf('>Radiateur Chambre<'), 'sous le nom');
  // Les couleurs de la carte : la chauffe mesurée l'emporte, l'Arrêt éteint, un module muet aussi.
  const puissant = maison({ states: [watts(612)] });
  assert.deepEqual(plaqueDe(rendre({ puissance: PUISSANCE }, puissant)).fond, 'rgba(var(--o-warn2-rgb),.2)', 'plus de 10 W : l’orange de la chauffe');
  assert.deepEqual(plaqueDe(rendre({ puissance: PUISSANCE }, maison({ states: [watts(8)] }))).fond, 'rgba(var(--o-warn2-rgb),.16)', '8 W : la teinte de son mode');
  assert.deepEqual([plaqueDe(rendre({ ch: radiateur({ mode: 'eco' }) })).fond, plaqueDe(rendre({ ch: radiateur({ mode: 'eco' }) })).encre], ['rgba(var(--o-purple-rgb),.16)', 'var(--o-purple)']);
  const eteint = plaqueDe(rendre({ ch: radiateur({ planning: false }) }, maison({ states: [st(MODULE, 'off', { options: NODON })] })));
  assert.deepEqual([eteint.fond, eteint.encre], ['var(--o-s1)', 'var(--o-text3)'], 'planning éteint, à l’Arrêt : éteinte');
  const muet = plaqueDe(rendre({ ch: radiateur({ planning: false }) }, maison({ states: [st(MODULE, 'unavailable', {})] })));
  assert.deepEqual([muet.fond, muet.encre], ['var(--o-s1)', 'var(--o-text3)'], 'muet : éteinte');
  // Un thermostat — et un VTherm, qui dit « thermostat » : `thermometer-half`, la plaque de sa carte.
  const poeleChaud = plaqueDe(rendre({ ch: poele(), sonde: null, piece: 'Salon' }));
  assert.deepEqual([poeleChaud.fond, poeleChaud.encre, poeleChaud.glyphe], ['rgba(var(--o-warn2-rgb),.2)', 'var(--o-warn2)', 'thermometer-half'], 'il chauffe');
  assert.equal(sousNom(rendre({ ch: poele(), sonde: null, piece: 'Salon' })), 'Salon · thermostat');
  const salon = rendre({ ch: vtherm(), sonde: null, piece: 'Salon' });
  assert.deepEqual([plaqueDe(salon).fond, plaqueDe(salon).encre, plaqueDe(salon).glyphe], ['var(--o-s1)', 'var(--o-text1)', 'thermometer-half'], 'au repos : le neutre');
  assert.equal(sousNom(salon), 'Salon · thermostat', 'un VTherm dit « thermostat »');
  const froid = plaqueDe(rendre({ ch: climatisation(), sonde: null }, maison({ states: [clim()] })));
  assert.deepEqual([froid.fond, froid.encre], ['rgba(var(--o-cold-rgb),.2)', 'var(--o-cold)'], 'il refroidit : le bleu');
  const arrete = plaqueDe(rendre({ ch: poele(), sonde: null }, maison({ states: [st(POELE, 'off', { hvac_modes: ['off', 'heat'], hvac_action: 'off', temperature: 20 })] })));
  assert.deepEqual([arrete.fond, arrete.encre], ['var(--o-s1)', 'var(--o-text3)']);
  // Sans pièce connue, le type seul.
  assert.equal(sousNom(rendre()), 'Fil pilote');
  assert.equal(sousNom(rendre({ ch: poele(), sonde: null })), 'Thermostat');
  // Les deux props sont facultatives : sans elles, l'en-tête des autres fiches ne change pas d'un caractère.
  const sans = renderToStaticMarkup(createElement(EnteteFiche, { nom: 'Distributeur' }));
  assert.equal(sans, renderToStaticMarkup(createElement(EnteteFiche, { nom: 'Distributeur', plaque: null, sousNom: null })));
  assert.ok(sans.startsWith('<div style="display:flex;align-items:center;gap:12px"><div style="flex:1;min-width:0"><div style="font-size:19px;font-weight:700;')
    && !sans.includes('data-plaque') && !sans.includes('margin-top:2px;overflow-wrap:anywhere'), sans.slice(0, 200));
  // La coquille passe la pièce et le capteur de puissance du module.
  assert.ok(APP.includes('piece={pieceDuChauffage(entite)} puissance={puissance}'), 'la coquille ne passe plus la pièce');
});

test('le haut d’un fil pilote (3b) : le mode en grand à son encre, dessous la phrase de ce qui décide, à sa couleur', () => {
  const g = grandDe(rendre());
  assert.equal(g.texte, 'Confort');
  assert.deepEqual(g.style, { 'font-size': '28px', 'font-weight': '800', 'line-height': '1.1', 'letter-spacing': '-.01em', color: 'var(--o-warn2)', 'overflow-wrap': 'anywhere', hyphens: 'auto' });
  assert.deepEqual([g.sous, g.encreSous], ['Planning · jusqu’à 23:00', 'var(--o-text2)']);
  assert.match(rendre(), /<div data-sous="" style="font-size:12.5px;font-weight:600;color:var\(--o-text2\);margin-top:6px">/, '12,5 px, 6 px sous le mode');
  // Confort −1 et −2 s'écrivent à l'orange PLEIN (`encreMode`) — à .7 ou .45, le mot ne se lirait plus.
  for (const m of ['confort_1', 'confort_2']) assert.equal(grandDe(rendre({ ch: radiateur({ mode: m }) })).style.color, 'var(--o-warn2)', m);
  assert.equal(grandDe(rendre({ ch: radiateur({ mode: 'hors_gel' }) })).style.color, 'var(--o-cyan)');
  const dimanche = etat({ maintenant: '2026-10-11T23:00:00+02:00', minute: [6, 1380] });
  const samedi = etat({ maintenant: '2026-10-10T10:00:00+02:00', minute: [5, 600] });
  const reprise = (fin, depuis = '2026-10-12T19:00:00+02:00') => ({ mode: 'eco', source: 'main', fin, reprise: { mode: 'eco', temperature: null, fin, depuis, par: 'u1' } });
  const absence = etat({ maison: { mode: 'absence', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } });
  const cas = [
    [{}, {}, 'Planning · jusqu’à 23:00', 'var(--o-text2)'],
    [{ mode: 'eco', fin: '2026-10-12T06:30:00+02:00' }, { etat: dimanche }, 'Planning · jusqu’à demain 06:30', 'var(--o-text2)'],
    [{ semaine: BUREAU, mode: 'hors_gel', fin: '2026-10-12T07:30:00+02:00' }, { etat: samedi }, 'Planning · jusqu’à lundi 07:30', 'var(--o-text2)'],
    [{ fin: null, puis: null }, {}, 'Planning · toute la semaine', 'var(--o-text2)'],
    [reprise('2026-10-12T21:00:00+02:00'), {}, 'À la main jusqu’à 21:00', 'var(--o-text2)'],
    [reprise('2026-10-12T01:00:00+02:00', '2026-10-11T21:00:00+02:00'), { etat: etat({ maintenant: '2026-10-11T22:00:00+02:00', minute: [6, 1320] }) },
      'À la main jusqu’à demain 01:00', 'var(--o-text2)'],
    [reprise('2026-10-12T07:30:00+02:00', '2026-10-10T09:00:00+02:00'), { etat: samedi }, 'À la main jusqu’à lundi 07:30', 'var(--o-text2)'],
    [reprise(null), {}, 'À la main jusqu’à relance', 'var(--o-text2)'],
    [{ mode: 'eco', source: 'maison', fin: null }, { etat: absence }, 'Maison : Absence', 'var(--o-text2)'],
    [{ mode: 'arret', source: 'fenetre', fin: null, fenetre_ouverte: true }, {}, 'Fenêtre ouverte · arrêt automatique', 'var(--o-warn)'],
    [{ mode: 'eco', source: 'fenetre', fenetre: 'eco', fin: null, fenetre_ouverte: true }, {}, 'Fenêtre ouverte · éco automatique', 'var(--o-warn)'],
    [{ planning: false }, {}, 'Manuel · planning désactivé', 'var(--o-text2)'],
    [{}, { etat: etat({ simulation: true }) }, 'Planning : Observer sans agir', 'var(--o-text2)'],
  ];
  for (const [o, props, phrase, encre] of cas) {
    const h = rendre({ ch: radiateur(o), ...props });
    assert.deepEqual([grandDe(h).sous, grandDe(h).encreSous], [phrase, encre], phrase);
    assert.ok(!h.includes('puis'), phrase + ' : plus de « puis {mode} »');
  }
  // Planning éteint, à l'Arrêt : « Arrêt » en grand, au gris, et « Éteint » dessous.
  const arret = grandDe(rendre({ ch: radiateur({ planning: false }) }, maison({ states: [st(MODULE, 'off', { options: NODON })] })));
  assert.deepEqual([arret.texte, arret.style.color, arret.sous], ['Arrêt', 'var(--o-text2)', 'Éteint']);
  // Planning éteint, en Éco : le mode que dit son module, et le planning désactivé.
  assert.deepEqual([grandDe(rendre({ ch: radiateur({ planning: false }) }, maison({ states: [st(MODULE, 'eco', { options: NODON })] }))).texte], ['Éco']);
  // Un mot trop long passe à la ligne, plus petit — jamais tronqué.
  assert.ok(SOURCE.includes("fontSize: grand.length > 16 ? 22 : 28"), 'le mot long garde sa taille et déborde');
});

test('la température de la pièce : 25 px / 800, un « ° » de 15 px décalé de 2 px, « PIÈCE » 6 px dessous ; rien sans mesure', () => {
  const html = rendre();
  assert.ok(html.includes('<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px"><div style="min-width:0"><div data-grand=""'),
    'le mode à gauche, la pièce à droite, 16 px entre les deux');
  assert.ok(html.includes('<div data-piece="" style="flex-shrink:0;text-align:right"><div style="display:flex;align-items:flex-start;justify-content:flex-end;font-weight:800;line-height:1">'
    + '<span style="font-size:25px;letter-spacing:-.02em">19,5</span><span style="font-size:15px;margin-top:2px">°</span></div>'
    + '<div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--o-text3);margin-top:6px">Pièce</div></div>'));
  // Jamais un chiffre inventé : sans sonde, sans mesure lisible, rien — pas même « PIÈCE ».
  assert.ok(!rendre({ sonde: null }).includes('data-piece'));
  for (const rien of ['unavailable', '', 'abc']) {
    const h = rendre({}, maison({ states: [st('sensor.chambre_temperature', rien, { unit_of_measurement: '°C' })] }));
    assert.ok(!h.includes('data-piece') && !h.includes('>Pièce<'), JSON.stringify(rien));
  }
  // Un thermostat se mesure lui-même.
  assert.ok(rendre({ ch: poele(), sonde: { id: POELE, attribut: 'current_temperature' } }).includes('>19,2</span><span style="font-size:15px;margin-top:2px">°<'));
});

test('une reprise : « Garder ce mode jusqu’à », ses fins en Puces dans le puits, « Reprendre le planning · Confort » au bleu doux — plus de menu ni de rouge', () => {
  const r = { mode: 'eco', temperature: null, fin: '2026-10-12T21:00:00+02:00', depuis: '2026-10-12T19:00:00+02:00', par: 'u1' };
  const ch = radiateur({ mode: 'eco', source: 'main', fin: r.fin, puis: 'confort', reprise: r, jour: JOUR_CHAMBRE });
  const html = rendre({ ch });
  // 18 px sous ce qui précède, le libellé en petites capitales, qui nomme le groupe des fins.
  assert.match(html, /<div data-reprise="" style="margin-top:18px"><div id="[^"]+-fin" style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var\(--o-text3\)">Garder ce mode jusqu’à<\/div><div style="margin-top:8px"><div role="group" aria-labelledby="[^"]+-fin"/);
  const f = groupe(html, 'fin');
  assert.equal(f.libelle, 'Garder ce mode jusqu’à');
  // Le prochain changement par son heure — 23:00 —, une, deux, quatre heures, sans limite ; la choisie, celle qu'elle a reçue.
  assert.deepEqual(f.puces.map(p => [p.mot, p.presse]), [['23:00', 'false'], ['+1 h', 'false'], ['+2 h', 'true'], ['+4 h', 'false'], ['Sans limite', 'false']]);
  assert.match(f.style, /gap:4px;padding:4px;border-radius:12px;background:var\(--o-well\)/, 'un groupe segmenté : dans le puits');
  assert.match(f.puces[2].attrs, /background:var\(--o-accent-fond\);color:#fff/);
  // Le prochain changement, demain ou un autre jour : « demain 06:30 », « lundi 07:30 » ; sans changement, « Changement ».
  const nuit = rendre({ ch: { ...ch, fin: '2026-10-12T06:30:00+02:00', reprise: { ...r, fin: '2026-10-12T06:30:00+02:00', depuis: '2026-10-11T23:00:00+02:00' } },
    etat: etat({ maintenant: '2026-10-11T23:00:00+02:00', minute: [6, 1380] }) });
  assert.equal(groupe(nuit, 'fin').puces[0].mot, 'demain 06:30');
  const weekend = rendre({ ch: { ...ch, semaine: BUREAU, reprise: { ...r, fin: '2026-10-12T07:30:00+02:00', depuis: '2026-10-10T09:00:00+02:00' } },
    etat: etat({ maintenant: '2026-10-10T10:00:00+02:00', minute: [5, 600] }) });
  assert.equal(groupe(weekend, 'fin').puces[0].mot, 'lundi 07:30');
  /* ASSERTION MODIFIÉE (relecture de la partie B, point 4) : la fin
   * « prochain » du serveur se calcule sur la semaine BRUTE, sans la maison
   * (`prochain_changement`, chauffage_calcul.py) — en Été, la reprise finit
   * encore au 23:00 de la semaine ; la puce le dit, plus « Changement ». */
  const ete = rendre({ ch, etat: etat({ maison: { mode: 'ete', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) });
  assert.equal(groupe(ete, 'fin').puces[0].mot, '23:00', 'la semaine brute, comme le serveur');
  // En Absence, de même — alors que la rangée « Prochain changement », la maison appliquée, n'a plus rien à dire.
  const absent = rendre({ ch, etat: etat({ maison: { mode: 'absence', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) });
  assert.equal(groupe(absent, 'fin').puces[0].mot, '23:00');
  assert.ok(!absent.includes('data-rangee="prochain"'), 'la rangée garde la semaine avec la maison');
  // Une semaine d'un seul mode ne change jamais : le mot, pas une heure inventée.
  const plate = Object.fromEntries(JOURS.map(j => [j, [{ h: '06:00', mode: 'eco' }]]));
  assert.equal(groupe(rendre({ ch: { ...ch, semaine: plate } }), 'fin').puces[0].mot, 'Changement', 'plus rien ne change : le mot');
  assert.deepEqual(groupe(rendre({ ch: { ...ch, reprise: { ...r, fin: null } } }), 'fin').puces.map(p => p.presse), ['false', 'false', 'false', 'false', 'true'], 'sans limite');
  // Le bouton : toute la largeur, 44 px, le gris doux, le texte au bleu doux, le glyphe `rotate-left` de 13 px — le mode que le planning a maintenant.
  const b = /<button type="button" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-rotate-left" style="font-size:13px;[^"]*"><\/i><span>([^<]*)<\/span><\/button>/.exec(html);
  assert.ok(b, 'le bouton « Reprendre le planning »');
  assert.equal(b[2], 'Reprendre le planning · Confort', 'la bande de `jour` qui couvre 19:00');
  const s = declarations(b[1]);
  assert.deepEqual([s.width, s['min-height'], s['margin-top'], s['border-radius'], s.background, s.color, s['font-size'], s['font-weight'], s.gap, s.display, s['justify-content']],
    ['100%', '44px', '8px', '10px', 'var(--o-s1)', 'var(--o-accent-soft)', '12.5px', '700', '8px', 'flex', 'center']);
  assert.ok(!/--o-bad|--rb-fond/.test(b[1]), 'plus de bouton rouge');
  assert.ok(!html.includes('aria-haspopup="listbox"'), 'plus de menu des fins');
  // Sans bande pour maintenant, le bouton dit seulement « Reprendre le planning ».
  assert.ok(rendre({ ch: { ...ch, jour: [] } }).includes('<span>Reprendre le planning</span>'));
  // Une reprise en température : « Garder cette consigne jusqu’à ».
  const enDegres = rendre({ ch: poele({ planning: true, mode: null, source: 'main', fin: r.fin, reprise: { ...r, mode: null, temperature: 21.5 }, jour: JOUR_CHAMBRE }), sonde: null });
  assert.equal(groupe(enDegres, 'fin').libelle, 'Garder cette consigne jusqu’à');
  // Jouées : une puce repose la reprise avec sa fin ; « Reprendre » la rend.
  const j = jouer('OngletAccueil', accueil({ ch }), { noms: ['err'] });
  const fins = chercher(j.arbre, el => el.type === j.F.Puces && el.props.idNom === 'b-fin')[0];
  assert.deepEqual(fins.props.options.map(o => o.id), ['prochain', 60, 120, 240, 'relance']);
  assert.equal(fins.props.choisi, 120);
  fins.props.onChoisir(60);
  assert.deepEqual(j.envoyes, [messageDeFin(ch, 60)]);
  chercher(j.arbre, el => el.type === 'button' && el.props.onClick && /rotate-left/.test(JSON.stringify(el.props.children && el.props.children[0] && el.props.children[0].props)))[0].props.onClick();
  assert.deepEqual(j.envoyes[1], { type: 'loggia/chauffage/main', chauffage: MODULE, reprendre: true });
});

test('les modes : 16 px dessous, trois colonnes, écart 8 — des boutons de 44 px au gris doux, le point puis le mot, le choisi en bleu plein', () => {
  const html = rendre();
  const p = puces(html);
  for (const x of p) {
    const s = declarations(attr(x.attrs, 'style'));
    assert.deepEqual([s['min-height'], s['border-radius'], s.border, s['font-size'], s['font-weight'], s.display, s['align-items'], s['justify-content'], s.gap],
      ['44px', '10px', 'none', '12.5px', '700', 'flex', 'center', 'center', '7px'], x.mot);
    const on = attr(x.attrs, 'aria-pressed') === 'true';
    assert.deepEqual([s.background, s.color], on ? ['var(--o-accent-fond)', '#fff'] : ['var(--o-s1)', 'var(--o-text1)'], x.mot);
    // Le point de 8 px, puis le mot ; un anneau blanc sur le bleu plein.
    assert.match(x.html, on ? /^<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:[^;]+;box-shadow:0 0 0 2px #fff"><\/span><span/
      : /^<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:[^;]+;box-shadow:none"><\/span><span/, x.mot);
  }
  // Chaque bouton garde son identifiant : le focus y revient après « Reprendre le planning ».
  assert.ok(/<button id="[^"]+-mode-confort" type="button" aria-pressed="true"/.test(html));
  // Un mot long passe à la ligne dans son bouton : jamais tronqué.
  assert.ok(p.every(x => /overflow-wrap:anywhere/.test(attr(x.attrs, 'style')) && !/white-space:nowrap/.test(attr(x.attrs, 'style'))));
  // Planning éteint, un fil pilote : la même grille, l'ordre part au module.
  assert.ok(puces(rendre({ ch: radiateur({ planning: false }) })));
});

test('la liste : Prochain changement, Fenêtre, Mode de la maison, L’appareil — un panneau --o-s3 au liseré du réglage, des filets --o-bd3', () => {
  const html = rendre();
  assert.deepEqual(rangeesDe(html), ['prochain', 'fenetre', 'maison', 'appareil']);
  // Le panneau du haut et celui de la liste : le dessin de la maquette, la bordure du réglage « Liserés ».
  const haut = declarations(/<div data-panneau="haut" style="([^"]*)">/.exec(html)[1]);
  assert.deepEqual(haut, { background: 'var(--o-s3)', border: LISERE_ATTENDU, 'border-radius': 'var(--o-radius,18px)', 'box-sizing': 'border-box', 'min-width': '0', padding: '18px' });
  const liste = declarations(/<div data-liste="" style="([^"]*)">/.exec(html)[1]);
  assert.deepEqual(liste, { background: 'var(--o-s3)', border: LISERE_ATTENDU, 'border-radius': 'var(--o-radius,18px)', 'box-sizing': 'border-box', 'min-width': '0', overflow: 'hidden' });
  assert.ok(!/box-shadow/.test(JSON.stringify([haut, liste])), 'sans ombre');
  // 12 px entre le haut et la liste.
  assert.match(html, /<div class="rb-accueil" style="gap:12px">/);
  // La première rangée sans filet, les suivantes avec.
  const filets = [...html.matchAll(/data-rangee="\w+"[^>]*style="([^"]*)"/g)].map(m => declarations(m[1])['border-top']);
  assert.deepEqual(filets, ['none', FILET_ATTENDU, FILET_ATTENDU, FILET_ATTENDU]);
  // « Prochain changement » : un bouton, le titre 14 / 700, le point, « 23:00 · Éco », le chevron.
  const prochain = /<button type="button" data-rangee="prochain" style="([^"]*)"><span style="display:block;font-size:14px;font-weight:700">Prochain changement<\/span><span style="([^"]*)"><span aria-hidden="true" style="[^"]*background:var\(--o-purple\)[^"]*"><\/span><span style="min-width:0;overflow-wrap:anywhere">23:00 · Éco<\/span><i aria-hidden="true" class="fi fi-rr-angle-small-right" style="font-size:16px;color:var\(--o-text3\)/.exec(html);
  assert.ok(prochain, 'la rangée « Prochain changement »');
  assert.equal(declarations(prochain[1]).padding, '14px 14px 14px 18px');
  assert.deepEqual([declarations(prochain[2])['font-size'], declarations(prochain[2])['font-weight'], declarations(prochain[2]).gap], ['13px', '800', '7px']);
  // « Mode de la maison » : une rangée fixe, son mot.
  assert.match(html, /<div data-rangee="maison" style="[^"]*padding:14px 18px[^"]*"><span style="display:block;font-size:14px;font-weight:700">Mode de la maison<\/span><span style="font-size:13px;font-weight:800;[^"]*">Planning<\/span><\/div>/);
  // « L’appareil » : son sous-titre, le chevron.
  assert.match(html, /<button type="button" data-rangee="appareil" style="[^"]*padding:12px 14px 12px 18px[^"]*"><span style="min-width:0"><span style="display:block;font-size:14px;font-weight:700">L’appareil<\/span><span style="display:block;font-size:12px;font-weight:600;color:var\(--o-text2\);margin-top:2px">L’épingle, les commandes et toutes ses entités<\/span><\/span><i aria-hidden="true" class="fi fi-rr-angle-small-right"/);
  // Planning éteint : la fenêtre et l'appareil.
  assert.deepEqual(rangeesDe(rendre({ ch: radiateur({ planning: false }) })), ['fenetre', 'appareil']);
  // Une reprise en cours : le prochain changement se dit encore.
  const r = { mode: 'eco', temperature: null, fin: '2026-10-12T21:00:00+02:00', depuis: '2026-10-12T19:00:00+02:00', par: 'u1' };
  assert.deepEqual(rangeesDe(rendre({ ch: radiateur({ mode: 'eco', source: 'main', fin: r.fin, reprise: r }) })), ['prochain', 'fenetre', 'maison', 'appareil']);
  // En Vacances, plus rien ne change : pas de rangée.
  assert.deepEqual(rangeesDe(rendre({ etat: etat({ maison: { mode: 'vacances', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) })), ['fenetre', 'maison', 'appareil']);
});

test('« Prochain changement » ouvre l’onglet Planning — et le focus le suit', () => {
  const vus = [];
  const j = jouer('OngletAccueil', accueil({ onOnglet: (o) => vus.push(o) }), { noms: ['err'] });
  chercher(j.arbre, el => el.type === 'button' && el.props['data-rangee'] === 'prochain')[0].props.onClick();
  assert.deepEqual(vus, ['planning']);
  // La fiche le passe à l'Accueil ; le bouton parti avec l'onglet, le focus va à l'onglet Planning.
  assert.ok(SOURCE.includes("const versOnglet = (o) => { setOnglet(o); focaliser(idOnglets + '-t-' + o); };"));
  assert.ok(/<OngletAccueil [^>]*onOnglet=\{versOnglet\}/.test(SOURCE));
});

test('la fenêtre : « À l’ouverture : … », Ouverte à l’ambre ou Fermée au vert ; un administrateur la déplie, un compte ordinaire la lit', () => {
  const ligne = (html) => {
    const m = /<div data-rangee="fenetre" style="[^"]*">([\s\S]*?)<\/div><(?:div|button) [^>]*data-rangee=/.exec(html) || /<div data-rangee="fenetre" style="[^"]*">([\s\S]*)$/.exec(html);
    return m ? m[1] : null;
  };
  // Pliée, pour un administrateur : un bouton, son chevron vers le bas.
  const html = rendre();
  const f = ligne(html);
  assert.match(f, /^<button type="button" aria-expanded="false" style="([^"]*)"><span style="min-width:0"><span id="[^"]+-fenetre" style="display:block;font-size:14px;font-weight:700">Fenêtre<\/span><span style="display:block;font-size:12px;font-weight:600;color:var\(--o-text2\);margin-top:2px">À l’ouverture : Arrêt<\/span><\/span><span style="[^"]*color:var\(--o-ok\)">Fermée<i aria-hidden="true" class="fi fi-rr-angle-small-down"/);
  assert.equal(declarations(/^<button type="button" aria-expanded="false" style="([^"]*)"/.exec(f)[1]).padding, '12px 14px 12px 18px');
  assert.ok(!f.includes('role="group"'), 'pliée : pas de puces');
  // Ouverte : à l'ambre ; les trois réglages dits en entier.
  assert.match(rendre({ ch: radiateur({ fenetre_ouverte: true }) }), /color:var\(--o-warn\)">Ouverte<i/);
  assert.ok(rendre({ ch: radiateur({ fenetre: 'eco' }) }).includes('>À l’ouverture : Éco<'));
  assert.ok(rendre({ ch: radiateur({ fenetre: 'rien' }) }).includes('>À l’ouverture : ne rien faire<'));
  /* Dépliée : le chevron vers le haut, les puces du réglage dans le puits, 0 18px 14px autour.
   * ASSERTIONS MODIFIÉES (relecture de la partie B, point 2) : le réglage ne se déplie plus
   * qu'au planning — c'est le moteur qui l'applique ; le VTherm, le poêle et la clim de ces
   * assertions, planning éteint dans leurs fixtures, y passent au planning. */
  const deplie = (ch, o = {}) => renderToStaticMarkup(jouer('OngletAccueil', accueil({ ch: { ...ch, planning: true }, ...o }), { noms: ['err', 'fenetre'], etats: { fenetre: true } }).arbre);
  const ouverte = deplie(radiateur());
  assert.match(ouverte, /aria-expanded="true"[^>]*>[\s\S]*?class="fi fi-rr-angle-small-up"/);
  assert.match(ouverte, /<div id="b-fenetre-reglage" style="padding:0 18px 14px"><div role="group" aria-labelledby="b-fenetre"/);
  const reglage = groupe(ouverte, 'fenetre');
  assert.equal(reglage.libelle, 'Fenêtre', 'nommé par le titre de sa rangée');
  assert.deepEqual(reglage.puces.map(p => [p.mot, p.presse]), [['Arrêt', 'true'], ['Éco', 'false'], ['Ne rien faire', 'false']]);
  assert.match(reglage.style, /gap:4px;padding:4px;border-radius:12px;background:var\(--o-well\)/, 'un groupe segmenté : dans le puits');
  /* « Arrêt » seulement s'il le comprend — sinon la rangée mentirait ; Éco de même.
   * ASSERTION MODIFIÉE (relecture de la partie D, point 3) : sans `off`, la puce de l'Arrêt ne
   * disparaît plus — elle se nomme de ce qu'il RECEVRA (le jumeau : son Hors-gel), et la rangée
   * ne ment toujours pas ; elle attendait [Éco, Ne rien faire]. */
  assert.deepEqual(groupe(deplie(vtherm({ modes: ['confort', 'eco', 'hors_gel'] }), { sonde: null }), 'fenetre').puces.map(p => p.mot), ['Hors-gel', 'Éco', 'Ne rien faire']);
  assert.deepEqual(groupe(deplie(vtherm({ modes: ['confort', 'hors_gel', 'arret'] }), { sonde: null }), 'fenetre').puces.map(p => p.mot), ['Arrêt', 'Ne rien faire']);
  // Le conseil du poêle : un thermostat qui comprend l'Éco, sans froid ; ni un fil pilote, ni une clim réversible.
  const conseil = '>Éco conseillé pour un poêle à granulés : pas d’extinction pour une aération<';
  assert.ok(deplie(poele(), { sonde: null }).includes(conseil));
  assert.ok(!ouverte.includes(conseil), 'un fil pilote');
  assert.ok(!deplie(climatisation(), { sonde: null, hass: maison({ states: [clim()] }) }).includes(conseil), 'une clim réversible : l’Éco ne vaut pas pour elle');
  assert.ok(!deplie(poele({ modes: ['confort', 'hors_gel', 'arret'] }), { sonde: null }).includes(conseil), 'sans Éco, pas de conseil');
  // Joué : le réglage part aussitôt, montré d'avance ; le pli se tourne au clic.
  const j = jouer('OngletAccueil', accueil(), { noms: ['err', 'fenetre'], etats: { fenetre: true } });
  chercher(j.arbre, el => el.type === j.F.Puces && el.props.idNom === 'b-fenetre')[0].props.onChoisir('rien');
  assert.deepEqual(j.envoyes, [messageFenetre(radiateur(), 'rien')]);
  assert.deepEqual(j.avances, ['rien']);
  const k = jouer('OngletAccueil', accueil(), { noms: ['err', 'fenetre'] });
  chercher(k.arbre, el => el.type === 'button' && el.props['aria-expanded'] === false)[0].props.onClick();
  assert.equal(typeof k.pose('fenetre')[0], 'function', 'le clic tourne le pli');
  // Un compte ordinaire : une rangée fixe, jamais dépliable — la configuration lui est fermée (ADR 0144).
  const ord = rendre({}, maison({ admin: false }));
  const o = ligne(ord);
  assert.ok(o && !o.includes('<button') && !o.includes('aria-expanded') && !o.includes('-fenetre"') && o.includes('>À l’ouverture : Arrêt<') && o.includes('>Fermée<'), o);
  assert.ok(!ord.includes('angle-small-down'));
  /* ASSERTION MODIFIÉE (relecture de la partie B, points 1 et 2) : planning
   * éteint, la rangée reste quand la règle surveille ce chauffage, mais EN
   * LECTURE et sans le réglage du moteur — la règle coupe elle-même : « À
   * l’ouverture : Arrêt », quel que soit le réglage. Une pièce que la règle ne
   * suit pas (`fenetre_ouverte` null) n'a pas de rangée. */
  const horsPlanning = rendre({ ch: radiateur({ planning: false, fenetre: 'rien' }) });
  assert.ok(rangeesDe(horsPlanning).includes('fenetre'));
  const lue = ligne(horsPlanning);
  assert.ok(lue && !lue.includes('<button') && !lue.includes('aria-expanded') && !lue.includes('angle-small-down') && lue.includes('>À l’ouverture : Arrêt<'), lue);
  assert.ok(!rangeesDe(rendre({ ch: radiateur({ fenetre_ouverte: null }) })).includes('fenetre'), 'une pièce que la règle ne suit pas');
});

test('la fenêtre selon qui commande : au planning le réglage du moteur, planning éteint l’Arrêt de la règle, en observation rien de promis', () => {
  /* Relecture de la partie B, points 1 à 3. La rangée ne vient que si la
   * règle des fenêtres surveille ce chauffage (`fenetre_ouverte` vrai ou faux,
   * jamais null). Au planning, le moteur applique le réglage, dit par le mode
   * que CET appareil recevra (`fenetre_mode` : l'Arrêt d'un thermostat sans
   * `off` est son Hors-gel), réglable sur place ; planning éteint, la règle
   * coupe elle-même — « À l’ouverture : Arrêt », en lecture ; en « Observer
   * sans agir », ni sous-titre, ni réglage. */
  const ligne = (html) => { const m = /<div data-rangee="fenetre" style="([^"]*)">([\s\S]*?)<\/div><(?:div|button) [^>]*data-rangee=/.exec(html); return m ? { style: declarations(m[1]), corps: m[2] } : null; };
  for (const v of [null, undefined, 'oui', 0]) {
    assert.ok(!rangeesDe(rendre({ ch: radiateur({ fenetre_ouverte: v }) })).includes('fenetre'), JSON.stringify(v));
  }
  // Au planning : le mode que l'appareil recevra ; « ne rien faire » sans mode.
  const thermo = radiateur({ fenetre: 'arret', fenetre_mode: 'hors_gel' });
  assert.ok(ligne(rendre({ ch: thermo })).corps.includes('>À l’ouverture : Hors-gel<'), 'l’Arrêt d’un appareil qui ne s’éteint pas : son Hors-gel');
  assert.ok(ligne(rendre({ ch: radiateur({ fenetre: 'eco', fenetre_mode: 'eco' }) })).corps.includes('>À l’ouverture : Éco<'));
  assert.ok(ligne(rendre({ ch: radiateur({ fenetre: 'rien', fenetre_mode: null }) })).corps.includes('>À l’ouverture : ne rien faire<'));
  assert.ok(ligne(rendre({ ch: radiateur({ fenetre: 'arret', fenetre_mode: null }) })).corps.includes('>À l’ouverture : ne rien faire<'),
    'un appareil qui ne comprend ni l’Arrêt ni ses replis : rien ne se passera, la rangée le dit');
  // Un réglage en vol se dit tel qu'il part : les puces n'offrent que ce que l'appareil comprend.
  const enVol = (v) => renderToStaticMarkup(jouer('OngletAccueil', accueil({ ch: thermo }), { noms: ['err'], optimiste: (lu) => (lu === 'arret' ? v : null) }).arbre);
  assert.ok(enVol('eco').includes('>À l’ouverture : Éco<') && enVol('rien').includes('>À l’ouverture : ne rien faire<'));
  // Planning éteint : l'Arrêt de la règle, en lecture.
  for (const reglage of ['arret', 'eco', 'rien']) {
    const l = ligne(rendre({ ch: radiateur({ planning: false, fenetre: reglage, fenetre_mode: reglage === 'rien' ? null : reglage }) }));
    assert.ok(l.corps.includes('>À l’ouverture : Arrêt<') && !l.corps.includes('<button') && !l.corps.includes('angle-small'), reglage + ' : ' + l.corps);
    assert.equal(l.style.padding, '12px 18px');
  }
  /* En observation : ni sous-titre, ni réglage ; la rangée garde la hauteur des rangées d'une ligne.
   * ASSERTION MODIFIÉE (relecture de la partie B, point a, prise à la tâche 10 bis D) : hors du
   * planning, la promesse dépend de la RÈGLE des fenêtres — c'est elle qui garde la main quand le
   * moteur observe (`pilote`, chauffage.py). L'interrupteur unique « Observer sans agir » met les
   * deux en observation : l'état le dit par `fenetres_observe`, que cette fixture n'avait pas. Le
   * cas où la règle, elle, agit encore est tenu plus bas (« la fenêtre hors du planning… »). */
  const obs = ligne(rendre({ ch: radiateur(), etat: etat({ simulation: true, fenetres_observe: true }) }));
  assert.ok(obs && !obs.corps.includes('À l’ouverture') && !obs.corps.includes('<button') && !obs.corps.includes('angle-small') && obs.corps.includes('>Fermée<'), obs && obs.corps);
  assert.equal(obs.style.padding, '14px 18px');
  // Joué : seul le planning allumé déplie la rangée, pour un administrateur.
  for (const [props, attendu] of [[{}, 1], [{ ch: radiateur({ planning: false }) }, 0], [{ simulation: true, etat: etat({ simulation: true }) }, 0], [{ ordinaire: true }, 0]]) {
    const j = jouer('OngletAccueil', accueil(props), { noms: ['err', 'fenetre'] });
    assert.equal(chercher(j.arbre, el => el.type === 'button' && el.props['aria-expanded'] !== undefined).length, attendu, JSON.stringify(props));
  }
});

test('le haut dit la fenêtre d’abord : ouverte et l’appareil à l’Arrêt, « arrêt automatique » à l’ambre — planning éteint ou observé aussi', () => {
  // Planning éteint, le module coupé par la règle : « Arrêt » en grand, la fenêtre dessous, à l'ambre.
  const coupe = maison({ states: [st(MODULE, 'off', { options: NODON })] });
  for (const [o, props] of [[{ planning: false }, {}], [{}, { etat: etat({ simulation: true }) }]]) {
    const g = grandDe(rendre({ ch: radiateur({ ...o, fenetre_ouverte: true }), ...props }, coupe));
    assert.deepEqual([g.texte, g.sous, g.encreSous], ['Arrêt', 'Fenêtre ouverte · arrêt automatique', 'var(--o-warn)'], JSON.stringify(o));
  }
  // Fermée, ou l'appareil pas à l'Arrêt : la phrase d'avant.
  assert.deepEqual([grandDe(rendre({ ch: radiateur({ planning: false }) }, coupe)).sous], ['Éteint']);
  assert.deepEqual([grandDe(rendre({ ch: radiateur({ planning: false, fenetre_ouverte: true }) })).sous], ['Manuel · planning désactivé']);
  // Un thermostat hors du planning (3e), éteint par la règle : « Éteint », et la fenêtre dessous.
  const arrete = maison({ states: [st(POELE, 'off', { hvac_modes: ['off', 'heat'], hvac_action: 'off', temperature: 20.5, current_temperature: 19.2 })] });
  const t = grandDe(rendre({ ch: poele({ fenetre_ouverte: true }), sonde: null }, arrete));
  assert.deepEqual([t.texte, t.sous, t.encreSous], ['Éteint', 'Fenêtre ouverte · arrêt automatique', 'var(--o-warn)']);
  assert.equal(grandDe(rendre({ ch: poele(), sonde: null }, arrete)).sous, 'La consigne est gardée pour le rallumage', 'fermée : la phrase d’avant');
});

test('le mode APPLIQUÉ (`applique`) : le haut, sa grille et la plaque de l’en-tête disent ce que l’appareil reçoit', () => {
  /* Relecture de la partie B, point 3. `mode` reste le mode VOULU, que la
   * logique lit ; l'écran montre `applique` — un module sans Éco reçoit son
   * Hors-gel. Sans `applique` (un serveur d'avant), le mode voulu. */
  const sansEco = radiateur({ mode: 'eco', applique: 'hors_gel', modes: ['confort', 'hors_gel', 'arret'] });
  const html = rendre({ ch: sansEco });
  const g = grandDe(html);
  assert.deepEqual([g.texte, g.style.color], ['Hors-gel', 'var(--o-cyan)']);
  assert.ok(html.includes('data-mode="hors_gel"'));
  assert.deepEqual(puces(html).filter(x => attr(x.attrs, 'aria-pressed') === 'true').map(x => x.mot), ['Hors-gel'], 'la grille choisit le mode appliqué');
  assert.ok(/<span aria-hidden="true" data-plaque="" style="[^"]*background:rgba\(var\(--o-cyan-rgb\),.16\);color:var\(--o-cyan\)"/.test(html), 'la plaque, à la teinte du Hors-gel');
  // Un thermostat sans `off`, au planning, fenêtre ouverte : le Hors-gel, et « Fenêtre ouverte » sans promettre l'arrêt.
  const poeleSansArret = poele({ planning: true, modes: ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel'], semaine: SEMAINE, mode: 'arret', applique: 'hors_gel',
    source: 'fenetre', fin: null, fenetre_ouverte: true, fenetre_mode: 'hors_gel' });
  const p = grandDe(rendre({ ch: poeleSansArret, sonde: null }));
  assert.deepEqual([p.texte, p.sous, p.encreSous], ['Hors-gel', 'Fenêtre ouverte', 'var(--o-warn)']);
  // Témoin : sans `applique`, le mode voulu.
  assert.equal(grandDe(rendre({ ch: radiateur({ mode: 'eco' }) })).texte, 'Éco');
});

test('la plaque de l’en-tête porte l’icône CHOISIE pour la carte, quand la coquille la passe', () => {
  /* Relecture de la partie B, point 6 : la coquille passe le glyphe de la
   * carte (`GlypheCarte`, même identifiant que la carte) ; sans lui, le
   * glyphe par défaut. */
  const avec = rendre({ glyphe: (defaut) => createElement('b', { 'data-glyphe-carte': '' }, defaut) });
  assert.match(avec, /<span aria-hidden="true" data-plaque="" style="[^"]*"><b data-glyphe-carte=""><i aria-hidden="true" class="fi fi-rr-heat"/);
  assert.match(rendre(), /<span aria-hidden="true" data-plaque="" style="[^"]*"><i aria-hidden="true" class="fi fi-rr-heat"/, 'sans glyphe passé : celui de la famille');
  // EnteteFiche : `plaque.glyphe` remplace l'icône, rien d'autre ne change.
  const p = { icone: 'heat', fond: 'var(--o-s1)', encre: 'var(--o-text3)' };
  const defaut = renderToStaticMarkup(createElement(EnteteFiche, { nom: 'X', plaque: p }));
  const choisi = renderToStaticMarkup(createElement(EnteteFiche, { nom: 'X', plaque: { ...p, glyphe: createElement('i', { 'data-x': '' }) } }));
  assert.equal(choisi, defaut.replace(/<i aria-hidden="true" class="fi fi-rr-heat"[^>]*><\/i>/, '<i data-x=""></i>'));
  // La coquille : le même identifiant que la carte — `zone:` et l'id de la zone d'un module, l'entité d'un thermostat.
  assert.ok(APP.includes("const idCarte = zone ? 'zone:' + zone.id : entite;"), 'l’identifiant de la carte');
  assert.ok(APP.includes('glyphe={(defaut) => <GlypheCarte id={idCarte} size={18}>{defaut}</GlypheCarte>}'), 'la coquille ne passe pas le glyphe de la carte');
});

test('le réglage de la fenêtre refusé : l’avance se retire, le refus se dit (raisonEchec)', async () => {
  // Relecture de la partie B, point 8 — le modèle des températures de Réglages.
  const refus = Object.assign(new Error('chauffage inconnu : ' + MODULE), { code: 'chauffage_inconnu' });
  assert.equal(raisonEchec(refus), 'Ce chauffage est introuvable.', 'la phrase du serveur pour ce refus');
  const j = jouer('OngletAccueil', accueil(), { noms: ['err', 'fenetre'], etats: { fenetre: true }, commande: () => Promise.reject(refus) });
  chercher(j.arbre, el => el.type === j.F.Puces && el.props.idNom === 'b-fenetre')[0].props.onChoisir('eco');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(j.envoyes, [messageFenetre(radiateur(), 'eco')]);
  assert.deepEqual(j.avances, ['eco', null], 'l’avance se retire');
  assert.deepEqual(j.pose('err'), ['', raisonEchec(refus)], 'le refus se dit');
});

test('un thermostat (3e), hors du planning : en grand ce qu’il fait, à sa couleur, et dessous ce qu’il vise', () => {
  const thermo = (attrs, etatHvac = 'heat') => grandDe(rendre({ ch: poele(), sonde: null }, maison({ states: [st(POELE, etatHvac, {
    hvac_modes: ['off', 'heat', 'cool'], temperature: 20.5, current_temperature: 19.2, min_temp: 5, max_temp: 35, target_temp_step: 0.5, ...attrs })] })));
  const cas = [
    [{ hvac_action: 'heating' }, 'heat', 'Chauffe', 'var(--o-warn2)', 'Vers 20,5°'],
    [{ hvac_action: 'preheating' }, 'heat', 'Chauffe', 'var(--o-warn2)', 'Vers 20,5°'],
    [{ hvac_action: 'cooling', temperature: 24, current_temperature: 26 }, 'cool', 'Refroidit', 'var(--o-cold)', 'Vers 24,0°'],
    [{ hvac_action: 'off' }, 'off', 'Éteint', 'var(--o-text2)', 'La consigne est gardée pour le rallumage'],
    [{ hvac_action: 'idle', current_temperature: 20.4 }, 'heat', 'Au repos', 'var(--o-text)', 'Consigne atteinte'],
    // « Consigne atteinte » se MESURE, comme sur la carte : à 16° pour 20,5, rien n'est atteint.
    [{ hvac_action: 'idle', current_temperature: 16 }, 'heat', 'Au repos', 'var(--o-text)', null],
  ];
  for (const [attrs, etatHvac, texte, encre, sous] of cas) {
    const g = thermo(attrs, etatHvac);
    assert.deepEqual([g.texte, g.style.color, g.sous, g.encreSous], [texte, encre, sous, sous ? 'var(--o-text2)' : null], texte + ' ' + JSON.stringify(attrs));
    assert.equal(g.style['font-size'], '28px');
  }
  assert.ok(SOURCE.includes('consigneAtteinte(a.current_temperature, consigne, hvac, uT)'), 'la règle de mesure de la carte');
  // Au planning, le haut est celui du fil pilote : le mode, la phrase, la grille.
  const auPlanning = rendre({ ch: poele({ planning: true, mode: 'eco', source: 'planning', fin: '2026-10-12T22:00:00+02:00', puis: 'confort' }), sonde: null });
  assert.deepEqual([grandDe(auPlanning).texte, grandDe(auPlanning).sous], ['Éco', 'Planning · jusqu’à 22:00']);
  assert.ok(puces(auPlanning));
});

test('un thermostat (3e) : Consigne — − et + carrés de 44 px —, En marche, Planning, L’appareil', () => {
  const html = rendre({ ch: poele(), sonde: null });
  assert.deepEqual(rangeesDe(html), ['consigne', 'marche', 'fenetre', 'planning', 'appareil']);
  // La consigne : − et + carrés, arrondi 12, le gris doux, sans bordure, glyphes de 16 px ; la valeur 17 px / 800, 64 px au moins.
  const c = /<div data-rangee="consigne" style="([^"]*)"><span style="display:block;font-size:14px;font-weight:700">Consigne<\/span><span style="display:inline-flex;align-items:center;gap:8px;flex-shrink:0"><button type="button" aria-label="Consigne : Moins" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-minus-small" style="font-size:16px;[^"]*"><\/i><\/button><span style="([^"]*)">20,5°<\/span><button type="button" aria-label="Consigne : Plus" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-plus-small" style="font-size:16px;/.exec(html);
  assert.ok(c, 'la rangée « Consigne »');
  assert.equal(declarations(c[1]).padding, '12px 14px 12px 18px');
  for (const b of [c[2], c[4]]) {
    const s = declarations(b);
    assert.deepEqual([s.width, s.height, s['border-radius'], s.background, s.border, s.opacity], ['44px', '44px', '12px', 'var(--o-s1)', 'none', '1']);
  }
  const v = declarations(c[3]);
  assert.deepEqual([v['min-width'], v['text-align'], v['font-size'], v['font-weight'], v.color], ['64px', 'center', '17px', '800', 'var(--o-text)']);
  // Inertes à .4 à une borne ; la valeur au gris tertiaire quand il est éteint.
  const borne = rendre({ ch: poele(), sonde: null }, maison({ states: [st(POELE, 'off', { hvac_modes: ['off', 'heat'], temperature: 35, min_temp: 5, max_temp: 35 })] }));
  assert.match(borne, /aria-label="Consigne : Plus" style="[^"]*opacity:0.4/);
  /* ASSERTION AJOUTÉE (relecture de la partie C) : inerte, le bouton reste
   * focalisable — `aria-disabled`, plus `disabled` : le focus ne tombe plus
   * sur <body> quand on atteint la borne. */
  assert.ok(/<button type="button" aria-disabled="true" aria-label="Consigne : Plus"/.test(borne) && !borne.includes('disabled=""'), 'aria-disabled, pas disabled');
  assert.match(borne, /min-width:64px;[^"]*color:var\(--o-text3\)">35,0°</);
  assert.ok(!SOURCE.includes('<PasAPas nom={tr(\'Consigne\')}'), 'la rangée « Consigne » garde son dessin local : PasAPas, partagé, ne change pas');
  // « En marche » : son sous-titre, la bascule — hors du planning seulement.
  assert.match(html, /<div data-rangee="marche" style="[^"]*padding:14px 18px[^"]*"><span style="min-width:0"><span style="display:block;font-size:14px;font-weight:700">En marche<\/span><span style="display:block;font-size:12px;font-weight:600;color:var\(--o-text2\);margin-top:2px">Coupe la zone sans toucher à la consigne<\/span><\/span><button type="button" role="switch" aria-checked="true" aria-label="En marche"/);
  // « Planning » : un bouton vers l'onglet ; « Aucun » sans semaine, « Éteint » planning éteint, « Actif » allumé.
  const planning = (h) => { const m = /<button type="button" data-rangee="planning" style="([^"]*)"><span style="display:block;font-size:14px;font-weight:700">Planning<\/span><span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:var\(--o-text2\)">([^<]*)<i aria-hidden="true" class="fi fi-rr-angle-small-right"/.exec(h); return m ? m[2] : null; };
  assert.equal(planning(html), 'Aucun');
  assert.equal(planning(rendre({ ch: poele({ semaine: SEMAINE }), sonde: null })), 'Éteint');
  const allume = rendre({ ch: poele({ planning: true, semaine: SEMAINE, mode: 'eco', source: 'planning', fin: '2026-10-12T23:00:00+02:00' }), sonde: null });
  assert.equal(planning(allume), 'Actif');
  assert.deepEqual(rangeesDe(allume), ['consigne', 'prochain', 'fenetre', 'maison', 'planning', 'appareil'], 'au planning : plus de marche ; le prochain changement et la maison');
  // En « Observer sans agir », la rangée le dit : le planning est là, il ne commande rien.
  assert.equal(planning(rendre({ ch: poele({ planning: true, semaine: SEMAINE }), etat: etat({ simulation: true }), sonde: null })), 'Observer sans agir');
  // Jouée : « Planning » ouvre son onglet.
  const vus = [];
  const j = jouer('OngletAccueil', accueil({ ch: poele(), sonde: null, onOnglet: (o) => vus.push(o) }), { noms: ['err'] });
  chercher(j.arbre, el => el.type === 'button' && el.props['data-rangee'] === 'planning')[0].props.onClick();
  assert.deepEqual(vus, ['planning']);
  // Un fil pilote et un VTherm n'ont pas ces rangées-là.
  assert.ok(!rangeesDe(rendre()).some(r => ['consigne', 'marche', 'planning'].includes(r)));
  assert.ok(!rangeesDe(rendre({ ch: vtherm(), sonde: null })).some(r => ['consigne', 'marche', 'planning'].includes(r)));
});

test('l’appareil qui refroidit : ses modes, ses préréglages et sa plage dans un panneau du même dessin', () => {
  const html = rendre({ ch: climatisation(), sonde: null, motHvac: motModeClimat }, maison({ states: [clim()] }));
  const p = /<div data-panneau="appareil" style="([^"]*)">/.exec(html);
  assert.ok(p, 'le panneau de l’appareil');
  assert.deepEqual(declarations(p[1]), { background: 'var(--o-s3)', border: LISERE_ATTENDU, 'border-radius': 'var(--o-radius,18px)', 'box-sizing': 'border-box', 'min-width': '0', padding: '18px' });
  const i = html.indexOf('data-panneau="appareil"');
  assert.ok(html.indexOf('data-panneau="haut"') < i && i < html.indexOf('data-liste'), 'entre le haut et la liste');
  assert.ok(html.indexOf('-hvac"') > i && html.indexOf('-preset"') > i, 'ses modes et ses préréglages y sont');
  const plage = rendre({ ch: climatisation(), sonde: null }, maison({ states: [clim({ temperature: null, target_temp_low: 20, target_temp_high: 24 }, 'heat_cool')] }));
  const k = plage.indexOf('data-panneau="appareil"');
  assert.ok(k > 0 && plage.indexOf('data-plage="bas"') > k && plage.indexOf('data-plage="bas"') < plage.indexOf('data-liste'), 'la plage aussi');
  assert.ok(!plage.includes('data-rangee="consigne"'), 'pas de consigne unique à côté d’une plage');
});

test('les couleurs : plus de rouge dans l’Accueil hors des alertes ; .rb-chauffage au bleu de sa maquette', () => {
  const accueilSource = SOURCE.slice(SOURCE.indexOf('function OngletAccueil('), SOURCE.indexOf('/* ════════════ Le planning ════════════ */'));
  assert.ok(accueilSource.length > 1000, 'OngletAccueil introuvable');
  assert.ok(!accueilSource.includes('--o-bad') && !accueilSource.includes('--rb-fond'), 'le rouge revient dans l’Accueil');
  // Une alerte reste rouge.
  assert.ok(SOURCE.includes("const ALERTE = { fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' };"));
  const ouverte = rendre({ ch: radiateur({ fenetre_ouverte: true }) });
  assert.ok(!ouverte.includes('--o-bad'), 'une fenêtre ouverte n’est pas une alerte');
  const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const regle = CSS.slice(CSS.indexOf('/* Le chauffage (plan 2'), CSS.indexOf('/* Le champ d\'heure natif'));
  assert.ok(regle.includes('.rb-chauffage { --rb-rgb: var(--o-accent-rgb); --rb-doux: var(--o-accent-soft); --rb-fond: var(--o-accent-fond); }'), regle);
  assert.ok(!/--o-bad|celui de sa carte/.test(regle), 'le rouge du chauffage et son commentaire');
  assert.ok(!CSS.includes('html.loggia-light .rb-chauffage') && !/\.rb-chauffage \{ --rb-fond: color-mix/.test(CSS), 'ce qui ne servait qu’au rouge');
});

test('l’héritage de la partie A : la fiche lit finMurale et jourEnPhrase dans chauffageecran.js, sans copie', () => {
  assert.ok(!/\nfunction finMurale\(|\nconst jourEnPhrase = /.test(SOURCE), 'la fiche garde sa copie');
  const imp = /import \{([^}]*)\} from '\.\/chauffageecran\.js';/.exec(SOURCE);
  assert.ok(imp && /\bfinMurale\b/.test(imp[1]) && /\bjourEnPhrase\b/.test(imp[1]) && /\bencreMode\b/.test(imp[1]) && /\bplaqueMode\b/.test(imp[1]), imp && imp[1]);
});

/* ════════════ Le Planning de sa maquette (tâche 10 bis C) ════════════
 *
 * Les cadres 3c (le Planning en modification) et 3f (sans planning) de la
 * maquette « Cartes chauffage », et la fin de l'onglet Réglages : son contenu
 * vit dans le Planning — « Suivre le planning » en tête, les températures d'un
 * thermostat sous les changements, la suppression d'un chauffage introuvable
 * en bas. Les tailles, les graisses, les couleurs, les écarts et les textes
 * de la maquette s'appliquent tels quels ; le dépôt garde `Bascule` et le
 * liseré du réglage « Liserés » sur les panneaux. */

// L'onglet Planning, joué : ses quatre états, dans l'ordre de ses `useState`.
const NOMS_PLANNING = ['jour', 'ouvert', 'err', 'local'];
const jouerPlanning = (props = {}, banc = {}) => jouer('OngletPlanning', { idBase: 'b', hass: maison({ admin: !props.ordinaire }), ch: radiateur(), etat: etat(),
  minute: [0, 1140], ordinaire: false, ...props }, { noms: NOMS_PLANNING, ...banc });
// Une brique de l'onglet, dépliée à la main (un rendu statique ne clique pas) : ses arbres, un par élément.
const deplier = (j, nom) => chercher(j.arbre, el => el.type === j.F[nom]).map(el => j.F[nom](el.props));
// − 15 min ou + 15 min d'une rangée dépliée, par son nom.
const quart = (j, i, nom) => chercher(deplier(j, 'LigneChangement')[i], el => el.type === 'button' && el.props['aria-label'] === nom)[0];
// « Supprimer ce changement » d'une rangée dépliée.
const supprimerDe = (j, i) => chercher(deplier(j, 'LigneChangement')[i],
  el => el.type === 'button' && Array.isArray(el.props.children) && el.props.children.includes('Supprimer ce changement'))[0];
/* Un panneau de l'onglet, par son nom : son style en table, et ce qu'il
 * contient jusqu'au panneau suivant. */
function panneau(html, nom) {
  const m = new RegExp('<div (?:role="group" aria-labelledby="[^"]*" )?data-panneau="' + nom + '" style="([^"]*)">').exec(html);
  if (!m) return null;
  const suite = html.indexOf('data-panneau=', m.index + m[0].length);
  return { style: declarations(m[1]), corps: html.slice(m.index + m[0].length, suite < 0 ? undefined : suite) };
}
// Le dessin des panneaux de la maquette : le gris --o-s3, l'arrondi du thème, sans ombre, le liseré du réglage.
const PANNEAU_MAQUETTE = { background: 'var(--o-s3)', border: LISERE_ATTENDU, 'border-radius': 'var(--o-radius,18px)', 'box-sizing': 'border-box', 'min-width': '0' };

test('l’onglet Planning, dans l’ordre de sa maquette : Suivre le planning, la semaine, le jour, ses changements — puis les températures et la suppression', () => {
  const perdu = poele({ semaine: SEMAINE, avertissements: ['introuvable'] });
  const html = rendre({ ongletDepart: 'planning', ch: perdu, sonde: null });
  const ordre = ['data-panneau="suivre"', 'data-panneau="semaine"', 'data-titre-jour=""', 'data-panneau="changements"', 'data-panneau="temperatures"', 'data-panneau="suppression"']
    .map(t => html.indexOf(t));
  assert.ok(ordre.every((x, i) => x > 0 && (i === 0 || x > ordre[i - 1])), JSON.stringify(ordre));
  // Les écarts de la maquette : la grille de l'onglet n'en impose plus ; chaque bloc porte le sien (12, 18, 10).
  assert.match(html, /<div class="rb-planning" style="gap:0"><div data-panneau="suivre"/);
  assert.equal(panneau(html, 'semaine').style['margin-top'], '12px');
  assert.match(html, /<div data-titre-jour="" style="[^"]*margin-top:18px"/);
  assert.equal(panneau(html, 'changements').style['margin-top'], '10px');
});

test('« Suivre le planning » en tête du Planning (3c) : la bascule d’un administrateur, « Activé » ou « Désactivé » pour un compte ordinaire', () => {
  const html = rendre({ ongletDepart: 'planning' });
  const p = panneau(html, 'suivre');
  assert.ok(p, 'le panneau « Suivre le planning »');
  assert.deepEqual(p.style, { ...PANNEAU_MAQUETTE, display: 'flex', 'align-items': 'center', gap: '12px', padding: '14px 18px' });
  assert.ok(p.corps.startsWith('<div style="flex:1;min-width:0"><span style="display:block;font-size:14px;font-weight:700">Suivre le planning</span>'
    + '<span style="display:block;font-size:12px;font-weight:600;color:var(--o-text2);margin-top:2px">Loggia le commande selon sa semaine, même écran fermé.</span></div>'), p.corps.slice(0, 300));
  // À droite, `Bascule`, nommée — et son identifiant : le focus y va après « Créer un planning ».
  assert.match(p.corps, /<\/div><button type="button" id="[^"]+-suivre" role="switch" aria-checked="true" aria-label="Suivre le planning"/);
  // Planning éteint : la bascule le dit.
  assert.match(panneau(rendre({ ongletDepart: 'planning', ch: radiateur({ planning: false }) }), 'suivre').corps, /role="switch" aria-checked="false"/);
  // « Observer sans agir » : le planning est suivi — le moteur n'agit pas, la configuration le dit.
  assert.match(panneau(rendre({ ongletDepart: 'planning', etat: etat({ simulation: true }) }), 'suivre').corps, /role="switch" aria-checked="true"/);
  // Un compte ordinaire lit son état, à la place de la bascule (ADR 0144).
  const lu = (o) => panneau(rendre({ ongletDepart: 'planning', ch: radiateur(o) }, maison({ admin: false })), 'suivre').corps;
  assert.ok(!lu({}).includes('role="switch"'), 'pas de bascule');
  assert.ok(lu({}).includes('</div><span style="font-size:13px;font-weight:800;flex-shrink:0;color:var(--o-text2)">Activé</span>'), lu({}));
  assert.ok(lu({ planning: false }).includes('>Désactivé</span>'));
});

test('« Suivre le planning », jouée : l’avance, la configuration, le refus dit sous la bascule — et la semaine qui suit l’avance', async () => {
  const j = jouerPlanning();
  const bascule = chercher(j.arbre, el => el.type === Bascule)[0];
  assert.deepEqual([bascule.props.id, bascule.props.on, bascule.props.nom], ['b-suivre', true, 'Suivre le planning']);
  bascule.props.cb();
  assert.deepEqual(j.envoyes, [messagePlanning(radiateur(), false)], 'la configuration, et rien d’autre');
  assert.deepEqual(j.avances, [false], 'éteint d’avance');
  // Refusé : l'avance se retire, le refus se dit (raisonEchec) sous le panneau.
  const refus = Object.assign(new Error('chauffage inconnu : ' + MODULE), { code: 'chauffage_inconnu' });
  const k = jouerPlanning({}, { commande: () => Promise.reject(refus) });
  chercher(k.arbre, el => el.type === Bascule)[0].props.cb();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(k.avances, [false, null], 'l’avance se retire');
  assert.deepEqual(k.pose('err'), [null, { ou: 'suivre', texte: 'Ce chauffage est introuvable.' }]);
  const dit = renderToStaticMarkup(jouerPlanning({}, { etats: { err: { ou: 'suivre', texte: 'Ce chauffage est introuvable.' } } }).arbre);
  const i = dit.indexOf('<div role="alert"');
  assert.ok(i > dit.indexOf('data-panneau="suivre"') && i < dit.indexOf('data-panneau="semaine"') && dit.includes('>Ce chauffage est introuvable.<'), 'sous la bascule');
  assert.equal((dit.match(/role="alert"/g) || []).length, 1, 'une fois');
  // L'avance en vol se lit : la bascule, et la semaine à .4.
  const enVol = renderToStaticMarkup(jouerPlanning({}, { optimiste: (lu) => (lu === true ? false : null) }).arbre);
  assert.match(enVol, /role="switch" aria-checked="false"/);
  assert.equal(panneau(enVol, 'semaine').style.opacity, '0.4');
});

test('la semaine (3c) : sept rangées-boutons dans l’ordre de la langue — le nom du jour choisi en pastille bleue, aujourd’hui à l’accent, le trait « maintenant », sans piste', () => {
  const html = rendre({ ongletDepart: 'planning' });
  const s = panneau(html, 'semaine');
  assert.deepEqual(s.style, { ...PANNEAU_MAQUETTE, 'margin-top': '12px', padding: '12px', opacity: '1' });
  /* Une rangée : le bouton, puis la colonne des noms — les sept noms cachés
   * dans la même case, qui la font aussi large que le plus long, et le nom du
   * jour par-dessus —, puis sa bande. */
  const LIGNE_JOUR = /<button type="button" data-jour="(\d)"(?: data-aujourdhui="")? aria-pressed="(true|false)" aria-label="([^"]+)" style="([^"]*)"><span style="([^"]*)">((?:<span aria-hidden="true" style="[^"]*">[^<]*<\/span>)*)<span style="([^"]*)">([^<]+)<\/span><\/span>/g;
  const rangeesDe = (h) => [...h.matchAll(LIGNE_JOUR)].map(m => ({ j: m[1], presse: m[2], nom: m[3], style: declarations(m[4]), colonne: declarations(m[5]),
    caches: [...m[6].matchAll(/<span aria-hidden="true" style="([^"]*)">([^<]*)<\/span>/g)].map(x => ({ style: declarations(x[1]), mot: x[2] })), etiquette: declarations(m[7]), court: m[8] }));
  const rangees = rangeesDe(s.corps);
  /* ASSERTION MODIFIÉE (relecture de la partie C) : la rangée d'aujourd'hui se
   * nomme « Lundi · aujourd’hui » — l'accent ne se voit pas d'un lecteur d'écran. */
  assert.deepEqual(rangees.map(r => r.nom), ['Lundi · aujourd’hui', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'], 'chacune un bouton, nommé par le jour en entier');
  assert.deepEqual(rangees.map(r => r.court), ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], 'le nom court');
  assert.deepEqual(rangees.map(r => r.presse), ['true', 'false', 'false', 'false', 'false', 'false', 'false'], 'le jour choisi : aujourd’hui');
  /* ASSERTIONS MODIFIÉES (son choix du 12/10, « Pastille bleue ») : la rangée
   * reste NEUTRE, choisie ou non (plus de --o-s1) ; seul le nom court du jour
   * choisi devient une pastille bleu plein, texte blanc, arrondi 8, 2 × 6 px ;
   * la colonne des noms n'a plus 30 px fixes : elle prend le plus long des
   * sept (« Niedz » en polonais), sans déborder, et les bandes restent alignées. */
  for (const r of rangees) {
    assert.deepEqual([r.style.display, r.style['align-items'], r.style.gap, r.style.width, r.style.padding, r.style.border, r.style['border-radius'], r.style.background, r.style.cursor],
      ['flex', 'center', '10px', '100%', '8px', 'none', '10px', 'transparent', 'pointer'], r.nom);
    assert.deepEqual([r.colonne.display, r.colonne['flex-shrink']], ['inline-grid', '0'], r.nom);
    assert.deepEqual(r.caches.map(x => x.mot), ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], r.nom + ' : les sept noms, qui font la largeur');
    assert.ok(r.caches.every(x => x.style.visibility === 'hidden' && x.style['grid-area'] === '1 / 1'), r.nom);
    const choisi = r.presse === 'true';
    assert.deepEqual([r.etiquette.padding, r.etiquette['border-radius'], r.etiquette['font-size'], r.etiquette['font-weight'], r.etiquette['white-space'], r.etiquette['grid-area'],
      r.etiquette.background, r.etiquette.color], ['2px 6px', '8px', '11.5px', '800', 'nowrap', '1 / 1', choisi ? 'var(--o-accent-fond)' : 'transparent',
      choisi ? '#fff' : r.j === '0' ? 'var(--o-accent-soft)' : 'var(--o-text2)'], r.nom);
  }
  // Un autre jour choisi : sa pastille ; aujourd'hui, non choisi, garde l'accent.
  const mardi = rangeesDe(renderToStaticMarkup(jouerPlanning({}, { etats: { jour: 1 } }).arbre));
  assert.deepEqual(mardi.slice(0, 2).map(r => [r.presse, r.etiquette.background, r.etiquette.color]),
    [['false', 'transparent', 'var(--o-accent-soft)'], ['true', 'var(--o-accent-fond)', '#fff']]);
  assert.ok(SOURCE.includes('ordre={ordreJours(premierJourSemaine(locale()))}'), 'l’ordre de la langue');
  // La bande de 8 px : ses créneaux arrondis 3, chacun 2 px plus court — le dernier aussi —, à la couleur de son mode ; pas de piste dessous.
  const lundi = s.corps.slice(s.corps.indexOf('data-jour="0"'), s.corps.indexOf('data-jour="1"'));
  assert.ok(lundi.includes('<span aria-hidden="true" style="position:relative;flex:1;height:8px"><span data-bande="eco" style="position:absolute;top:0;bottom:0;left:0%;width:calc(27.0833% - 2px);border-radius:3px;background:var(--o-purple)"></span>'),
    lundi.slice(0, 400));
  assert.ok(lundi.includes('<span data-bande="eco" style="position:absolute;top:0;bottom:0;left:95.8333%;width:calc(4.1667% - 2px);border-radius:3px;background:var(--o-purple)"></span>'), 'le dernier créneau aussi');
  assert.ok(!s.corps.includes('var(--o-s2)'), 'pas de piste creuse sous les créneaux');
  // Le trait « maintenant », aujourd'hui seulement : 3 px, de −5 à +5 px autour de la bande, arrondi 2, le halo du fond.
  assert.ok(lundi.includes('<span data-maintenant="" style="position:absolute;top:-5px;bottom:-5px;left:79.1667%;width:3px;margin-left:-1.5px;border-radius:2px;background:var(--o-text);box-shadow:0 0 0 2px var(--o-bg2)"></span>'));
  assert.equal((s.corps.match(/data-maintenant/g) || []).length, 1);
  /* Dessous, les heures : 10,5 px / 700, le gris tertiaire. ASSERTION
   * MODIFIÉE (son choix du 12/10) : alignées sur la bande par la MÊME colonne
   * des noms, cachée, et le même écart de 10 px — plus par une marge de 48 px
   * fixes (8 + 30 + 10), la colonne n'ayant plus 30 px. */
  const heures = /<div aria-hidden="true" data-heures="" style="display:flex;gap:10px;margin:6px 8px 0"><span style="([^"]*)">((?:<span aria-hidden="true" style="[^"]*">[^<]*<\/span>)*)<\/span><div style="position:relative;flex:1;height:14px;font-size:10.5px;font-weight:700;color:var\(--o-text3\)">(.*?)<\/div><\/div>/.exec(s.corps);
  assert.ok(heures, 'la rangée des heures');
  assert.deepEqual([declarations(heures[1]).display, declarations(heures[1])['flex-shrink']], ['inline-grid', '0']);
  assert.deepEqual([...heures[2].matchAll(/<span aria-hidden="true" style="[^"]*visibility:hidden">([^<]*)<\/span>/g)].map(m => m[1]), ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    'la colonne des noms, cachée');
  assert.equal(heures[3], '<span style="position:absolute;white-space:nowrap;left:0">0 h</span>'
    + '<span style="position:absolute;white-space:nowrap;left:25%;transform:translateX(-50%)">6 h</span>'
    + '<span style="position:absolute;white-space:nowrap;left:50%;transform:translateX(-50%)">12 h</span>'
    + '<span style="position:absolute;white-space:nowrap;left:75%;transform:translateX(-50%)">18 h</span>'
    + '<span style="position:absolute;white-space:nowrap;right:0">24 h</span>');
  // Le planning n'est pas suivi : la semaine à .4 — elle se lit et se règle encore.
  assert.equal(panneau(rendre({ ongletDepart: 'planning', ch: radiateur({ planning: false }) }), 'semaine').style.opacity, '0.4');
  // La semaine montrée : celle que la maison laisse (bandesSemaine, la maison appliquée).
  const absence = rendre({ ongletDepart: 'planning', etat: etat({ maison: { mode: 'absence', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) });
  assert.deepEqual([...panneau(absence, 'semaine').corps.matchAll(/data-bande="(\w+)"/g)].map(m => m[1]), Array(7).fill('eco'));
});

test('choisir un jour : sa rangée garde le focus — le titre, le compte au pluriel et « Depuis minuit » suivent', () => {
  const j = jouerPlanning({}, { etats: { ouvert: 2 } });
  const [semaine] = deplier(j, 'SemaineDuPlanning');
  const boutons = chercher(semaine, el => el.type === 'button');
  assert.deepEqual(boutons.map(el => el.key), ['0', '1', '2', '3', '4', '5', '6'], 'chaque rangée gardée par son jour : choisir n’en remonte aucune');
  boutons[1].props.onClick();
  assert.deepEqual([j.pose('jour'), j.pose('ouvert'), j.pose('local')], [[1], [null], [null]], 'le mardi ; la rangée dépliée se replie');
  assert.deepEqual(j.focus, [], 'le focus reste sur la rangée du jour');
  // Le titre : « Lundi · aujourd’hui » (15 px / 800), le compte à droite (12 px, le gris tertiaire).
  const html = rendre({ ongletDepart: 'planning' });
  assert.ok(html.includes('<div data-titre-jour="" style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:18px">'
    + '<div style="font-size:15px;font-weight:800">Lundi · aujourd’hui</div><div style="font-size:12px;color:var(--o-text3)">4 changements</div></div>'));
  // Un autre jour : son nom seul. Un seul changement : le singulier. Aucun : pas de compte.
  const mardi = renderToStaticMarkup(jouerPlanning({}, { etats: { jour: 1 } }).arbre);
  assert.ok(mardi.includes('<div style="font-size:15px;font-weight:800">Mardi</div>'));
  const unSeul = { ...SEMAINE, mar: [c('07:00', 'confort')], mer: [] };
  assert.ok(renderToStaticMarkup(jouerPlanning({ ch: radiateur({ semaine: unSeul }) }, { etats: { jour: 1 } }).arbre).includes('>1 changement<'));
  assert.ok(!/>\d+ changements?</.test(renderToStaticMarkup(jouerPlanning({ ch: radiateur({ semaine: unSeul }) }, { etats: { jour: 2 } }).arbre)), 'un jour vide n’a pas de compte');
  assert.ok(SOURCE.includes("trN(liste.length, '{n} changement', '{n} changements')"), 'le pluriel de la langue');
  /* « Depuis minuit » : le mode du PLANNING à 00:00 (`modePlanning`), son
   * point. ASSERTION MODIFIÉE plus bas (relecture de la partie C) : plus la
   * première bande de la semaine montrée — la maison appliquée, on lisait
   * « Hors-gel » en Vacances au-dessus de rangées « Confort », « Éco ». */
  const minuit = /<div data-rangee="minuit" style="([^"]*)"><span style="([^"]*)">Depuis minuit<\/span><span aria-hidden="true" style="[^"]*background:var\(--o-purple\)[^"]*"><\/span><span style="([^"]*)">Éco<\/span><\/div>/.exec(html);
  assert.ok(minuit, '« Depuis minuit · Éco » : la fin du dimanche');
  assert.deepEqual(declarations(minuit[1]), { display: 'flex', 'align-items': 'center', gap: '8px', padding: '12px 18px' });
  assert.deepEqual(declarations(minuit[2]), { flex: '1', 'font-size': '13px', 'font-weight': '700', color: 'var(--o-text3)' });
  assert.deepEqual(declarations(minuit[3]), { 'font-size': '13px', 'font-weight': '800', color: 'var(--o-text2)' });
  assert.ok(html.indexOf('data-rangee="minuit"') > html.indexOf('data-panneau="changements"'), 'la première rangée du panneau des changements');
  // Le lundi du bureau commence dans le Hors-gel du vendredi soir.
  assert.ok(/data-rangee="minuit"[\s\S]*?>Hors-gel<\/span><\/div>/.test(rendre({ ongletDepart: 'planning', ch: radiateur({ semaine: BUREAU }) })));
  /* ASSERTION MODIFIÉE (relecture de la partie C) : en Été ou en Vacances, la
   * semaine montrée garde la maison (l'Arrêt, le Hors-gel), mais « Depuis
   * minuit » dit le planning — l'Éco de la veille au soir —, comme les
   * rangées qu'il précède. */
  for (const mode of ['ete', 'vacances']) {
    const h = rendre({ ongletDepart: 'planning', etat: etat({ maison: { mode, vacances_fin: null, absence: 'eco', vacances: 'hors_gel' } }) });
    assert.ok(/data-rangee="minuit"[\s\S]*?>Éco<\/span><\/div>/.test(h), mode + ' : le planning');
    assert.deepEqual([...panneau(h, 'semaine').corps.matchAll(/data-bande="(\w+)"/g)].map(m => m[1]), Array(7).fill(mode === 'ete' ? 'arret' : 'hors_gel'), mode + ' : la semaine montrée garde la maison');
  }
  // Un changement à minuit : il est le mode de minuit.
  assert.ok(/data-rangee="minuit"[\s\S]*?>Confort<\/span><\/div>/.test(rendre({ ongletDepart: 'planning', ch: radiateur({ semaine: { ...SEMAINE, lun: [c('00:00', 'confort'), c('09:00', 'eco')] } }) })));
});

test('un changement par rangée (3c) : l’heure en 17 px, le point et le mode, le chevron — un bouton qui se déplie, une rangée à la fois', () => {
  const html = rendre({ ongletDepart: 'planning' });
  const p = panneau(html, 'changements');
  assert.deepEqual(p.style, { ...PANNEAU_MAQUETTE, 'margin-top': '10px', overflow: 'hidden' });
  const rangees = [...p.corps.matchAll(/<div data-changement="([\d:]+)" style="([^"]*)"><button type="button" id="([^"]+)" aria-expanded="(true|false)" style="([^"]*)"><span style="([^"]*)">\1<\/span><span style="([^"]*)"><span aria-hidden="true" style="[^"]*"><\/span><span style="min-width:0">([^<]+)<\/span><\/span><i aria-hidden="true" class="fi fi-rr-(angle-small-down|angle-small-up)" style="font-size:16px;color:var\(--o-text3\)/g)]
    .map(m => ({ h: m[1], cadre: declarations(m[2]), id: m[3], ouvert: m[4], bouton: declarations(m[5]), heure: declarations(m[6]), mode: declarations(m[7]), mot: m[8], chevron: m[9] }));
  assert.deepEqual(rangees.map(r => [r.h, r.mot]), [['06:30', 'Confort'], ['08:30', 'Éco'], ['18:00', 'Confort'], ['23:00', 'Éco']]);
  for (const r of rangees) {
    assert.deepEqual([r.ouvert, r.chevron, r.cadre['border-top'], r.cadre.background], ['false', 'angle-small-down', FILET_ATTENDU, 'transparent'], r.h);
    assert.deepEqual([r.bouton.display, r.bouton['align-items'], r.bouton.gap, r.bouton.width, r.bouton.padding, r.bouton.border, r.bouton.background, r.bouton.color],
      ['flex', 'center', '12px', '100%', '12px 14px 12px 18px', 'none', 'none', 'var(--o-text)'], r.h);
    assert.deepEqual(r.heure, { flex: '1', 'font-size': '17px', 'font-weight': '800' }, r.h);
    assert.deepEqual([r.mode.display, r.mode['align-items'], r.mode.gap, r.mode['font-size'], r.mode['font-weight']], ['inline-flex', 'center', '7px', '13px', '800'], r.h);
  }
  assert.deepEqual(rangees.map(r => r.id.slice(-4)), ['-c-0', '-c-1', '-c-2', '-c-3'], 'chacune son identifiant : le focus y revient');
  // La couleur d'un mode n'est qu'un point, ici comme ailleurs ; et jamais une liste native.
  assert.match(p.corps, /data-changement="06:30"[\s\S]*?<span aria-hidden="true" style="[^"]*background:var\(--o-warn2\)/);
  assert.ok(!/background:var\(--o-(bad|cold|warn2|purple|cyan)\);color/.test(p.corps), 'aucune rangée teintée de son mode');
  assert.ok(!html.includes('<select'), 'jamais une liste native');
  // Le jour entre dans la clé des rangées : la rangée dépliée du lundi n'est pas celle du mardi qui prend sa place.
  const cles = (o) => chercher(jouerPlanning({}, { etats: o }).arbre, el => typeof el.type === 'function' && el.props && el.props.onBasculer).map(el => el.key);
  assert.deepEqual(cles({}), ['0:0', '0:1', '0:2', '0:3']);
  assert.equal(cles({ jour: 1 })[0], '1:0');
  // Dépliée — une seule —, sur le gris doux, le chevron vers le haut, son réglage nommé par son heure.
  const ouverte = renderToStaticMarkup(jouerPlanning({}, { etats: { ouvert: 1 } }).arbre);
  assert.equal((ouverte.match(/aria-expanded="true"/g) || []).length, 1, 'une seule rangée dépliée');
  const r1 = /<div data-changement="08:30" style="([^"]*)"><button type="button" id="b-c-1" aria-expanded="true" aria-controls="b-c-1-reglage" style="[^"]*">[\s\S]*?class="fi fi-rr-angle-small-up"/.exec(ouverte);
  assert.ok(r1, 'la rangée de 08:30, dépliée');
  assert.equal(declarations(r1[1]).background, 'var(--o-s1)');
  assert.ok(ouverte.includes('<div id="b-c-1-reglage" role="group" aria-label="Changement de 08:30" style="display:flex;flex-direction:column;gap:12px;padding:2px 18px 16px">'));
  // Jouée : un appui déplie, un second replie ; une autre rangée prend la place.
  const j = jouerPlanning({}, { etats: { ouvert: 1 } });
  const lignes = deplier(j, 'LigneChangement');
  const bouton = (i) => chercher(lignes[i], el => el.type === 'button' && el.props['aria-expanded'] !== undefined)[0];
  bouton(2).props.onClick();
  bouton(1).props.onClick();
  assert.deepEqual(j.pose('ouvert'), [2, null]);
  // « Observer sans agir » : écrire la configuration n'est pas un ordre, l'édition reste.
  assert.ok(rendre({ ongletDepart: 'planning', etat: etat({ simulation: true }) }).includes('aria-expanded="false"'));
});

test('dépliée : − 15 min · l’heure · + 15 min — des puces de 40 px, inertes quand l’heure toucherait un voisin ou sortirait de la journée', () => {
  const ouverte = renderToStaticMarkup(jouerPlanning({}, { etats: { ouvert: 1 } }).arbre);
  /* ASSERTION MODIFIÉE (son choix du 12/10, « Toucher l’heure ») : entre les
   * deux puces, le mot « Heure » devient le CHAMP de l'heure (plus bas). */
  const ligne = /<div style="display:flex;align-items:center;gap:8px"><button type="button" aria-label="15 min plus tôt" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-minus-small" style="font-size:14px;[^"]*"><\/i><span>15 min<\/span><\/button><input type="time" aria-label="Heure du changement" style="([^"]*)" value="08:30"\/><button type="button" aria-label="15 min plus tard" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-plus-small" style="font-size:14px;[^"]*"><\/i><span>15 min<\/span><\/button><\/div>/.exec(ouverte);
  assert.ok(ligne, 'la rangée de l’heure');
  for (const b of [ligne[1], ligne[3]]) {
    const s = declarations(b);
    assert.deepEqual([s.height, s.padding, s['border-radius'], s.border, s.background, s.color, s['font-size'], s['font-weight'], s.display, s['align-items'], s.gap, s.opacity, s.cursor],
      ['40px', '0 12px', '10px', 'none', 'var(--o-s1)', 'var(--o-text1)', '12px', '700', 'flex', 'center', '4px', '1', 'pointer']);
  }
  /* Le champ se dessine comme l'heure de la maquette : 17 px / 800, centré, sans cadre lourd, sur toute la place entre les puces.
   * ASSERTION MODIFIÉE (tâche 10 bis D, petit réglage de la partie C) : il se voit comme un BOUTON — le fond
   * --o-s1, l'arrondi 10 et les 40 px de haut de ses deux voisins (plus `transparent`) : au téléphone, il n'a
   * pas l'horloge qui le trahit sur ordinateur, et ne se lisait que comme un texte. */
  const champ = declarations(ligne[2]);
  assert.deepEqual([champ['font-size'], champ['font-weight'], champ['text-align'], champ.border, champ.background, champ.color, champ.flex, champ['min-width']],
    ['17px', '800', 'center', 'none', 'var(--o-s1)', 'var(--o-text)', '1', '0']);
  assert.deepEqual([champ.height, champ['border-radius'], champ['box-sizing']], ['40px', '10px', 'border-box'], 'la hauteur et l’arrondi des voisins');
  const voisin = declarations(ligne[1]);
  assert.deepEqual([champ.height, champ['border-radius'], champ.background], [voisin.height, voisin['border-radius'], voisin.background], 'le même dessin que « − 15 min »');
  // Jouées : l'heure d'un quart plus tôt, ou plus tard — la semaine entière part, montrée d'avance.
  const j = jouerPlanning({}, { etats: { ouvert: 1 } });
  quart(j, 1, '15 min plus tôt').props.onClick();
  quart(j, 1, '15 min plus tard').props.onClick();
  assert.deepEqual(j.envoyes.map(m => m.patch.chauffages[MODULE].semaine.lun.map(x => x.h)), [['06:30', '08:15', '18:00', '23:00'], ['06:30', '08:45', '18:00', '23:00']]);
  assert.deepEqual(j.avances, j.envoyes.map(m => m.patch.chauffages[MODULE].semaine), 'montrée d’avance');
  assert.deepEqual([j.pose('ouvert'), j.focus], [[], []], 'la rangée ne change pas de place : elle reste dépliée, le focus sur son bouton');
  // Inertes : 08:00 et 08:15 se touchent ; 00:00 ne recule pas, 23:50 n'avance plus.
  const serre = radiateur({ semaine: { ...SEMAINE, lun: [c('00:00', 'eco'), c('08:00', 'confort'), c('08:15', 'eco'), c('23:50', 'eco')] } });
  const inertes = (i) => {
    const k = jouerPlanning({ ch: serre }, { etats: { ouvert: i } });
    return ['15 min plus tôt', '15 min plus tard'].map(nom => quart(k, i, nom).props['aria-disabled'] === true);
  };
  assert.deepEqual([0, 1, 2, 3].map(inertes), [[true, false], [false, true], [true, false], [false, true]]);
  const k = jouerPlanning({ ch: serre }, { etats: { ouvert: 1 } });
  quart(k, 1, '15 min plus tard').props.onClick();
  assert.deepEqual(k.envoyes, [], 'inerte : rien ne part');
  // Inerte, il reste focalisable (`aria-disabled`, pas `disabled`) : le focus ne tombe pas sur <body> quand il le devient. Il se voit à .4.
  const vu = renderToStaticMarkup(jouerPlanning({ ch: serre }, { etats: { ouvert: 1 } }).arbre);
  assert.match(vu, /<button type="button" aria-label="15 min plus tard" aria-disabled="true" style="[^"]*opacity:0.4;cursor:default"/);
  assert.ok(!/aria-label="15 min plus (tôt|tard)"[^>]* disabled=""/.test(vu));
});

test('dépliée : toucher l’heure ouvre le sélecteur — n’importe quelle heure, la liste se range, le changement reste déplié ; une heure prise se refuse sur place', async () => {
  // Son choix du 12/10 (« Toucher l’heure ») : le champ de la fiche commune, qui ne rend l'heure qu'à la sortie.
  const j = jouerPlanning({}, { etats: { ouvert: 1 } });
  const champDe = (jj, i) => chercher(deplier(jj, 'LigneChangement')[i], el => el.type === ChampHeure)[0];
  const champ = champDe(j, 1);
  assert.deepEqual([champ.props.valeur, champ.props.nom, champ.props.aLaSortie], ['08:30', 'Heure du changement', true]);
  // Une heure qui passe un voisin : la semaine part rangée, le changement déplacé reste déplié, à sa nouvelle place.
  assert.notEqual(champ.props.onValide('19:00'), false, 'pris : pas de refus');
  assert.deepEqual(j.envoyes.map(m => m.patch.chauffages[MODULE].semaine.lun.map(x => x.h + ' ' + x.mode)), [['06:30 confort', '18:00 confort', '19:00 eco', '23:00 eco']]);
  assert.deepEqual(j.pose('ouvert'), [2], 'déplié à sa nouvelle place');
  assert.ok(SOURCE.includes("else if (g.quoi === 'heure' && r.ligne !== g.index) {") && SOURCE.includes("rattraper(idBase + '-c-' + r.ligne)"), 'le focus perdu revient au changement déplacé');
  // Une heure déjà prise : rien ne part, la phrase du refus se dit dans la rangée, et le champ redit l'heure vraie (onValide rend false).
  const k = jouerPlanning({}, { etats: { ouvert: 1 } });
  assert.equal(champDe(k, 1).props.onValide('18:00'), false);
  assert.deepEqual(k.envoyes, [], 'rien ne part');
  assert.deepEqual(k.pose('local'), [{ jour: 0, index: 1, texte: 'Deux changements à la même heure.' }]);
  const dit = renderToStaticMarkup(jouerPlanning({}, { etats: { ouvert: 1, local: { jour: 0, index: 1, texte: 'Deux changements à la même heure.' } } }).arbre);
  const a = dit.indexOf('<div role="alert"');
  assert.ok(a > dit.indexOf('aria-label="Changement de 08:30"') && a < dit.indexOf('data-changement="18:00"') && dit.includes('>Deux changements à la même heure.<'), 'dans la rangée de 08:30');
  // Le déplacement refusé par le serveur : la semaine revient, la rangée d'origine se redéplie et reprend le focus.
  const refus = Object.assign(new Error('deux changements a la meme heure : lun[2].h'), { code: 'chauffage_heure_en_double' });
  const r = jouerPlanning({}, { etats: { ouvert: 1 }, commande: () => Promise.reject(refus) });
  champDe(r, 1).props.onValide('19:00');
  await new Promise(x => setTimeout(x, 0));
  assert.deepEqual(r.pose('ouvert'), [2, 1], 'la rangée d’origine, pas celle qui a pris l’index');
  assert.deepEqual(r.focus, [['b-c-1', 'b-t-planning']]);
  assert.equal(r.avances.at(-1), null, 'l’avance se retire');
  // ± 15 min gardent leur règle : ils ne passent pas un voisin (le test précédent) — seul le champ va n'importe où.
  // Un compte ordinaire n'a pas de champ.
  assert.ok(!rendre({ ongletDepart: 'planning' }, maison({ admin: false })).includes('type="time"'));
  /* ASSERTION MODIFIÉE (relecture finale du 12/10, point 6) : « Heure » redevient « Clock »
   * en anglais, sa valeur d'avant ce chantier — c'est le nom du widget Horloge du rail.
   * Le champ du changement a sa propre clé, « Heure du changement ». */
  const en = (await import('../src/langues/en.js')).default;
  assert.equal(en['Heure'], 'Clock');
  assert.equal(en['Heure du changement'], 'Time of the change');
});

test('dépliée : les modes du chauffage — trois colonnes, écart 6, 40 px, le choisi en bleu plein ; un appui suffit', () => {
  const ouverte = renderToStaticMarkup(jouerPlanning({}, { etats: { ouvert: 1 } }).arbre);
  const g = /<div role="group" aria-label="Mode" style="([^"]*)">([\s\S]*?)<\/div>/.exec(ouverte);
  assert.ok(g, 'la grille des modes, nommée');
  assert.deepEqual(declarations(g[1]), { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', gap: '6px' });
  const boutons = [...g[2].matchAll(/<button type="button" aria-pressed="(true|false)" style="([^"]*)">(.*?)<\/button>/g)]
    .map(m => ({ presse: m[1], style: declarations(m[2]), mot: texte('>' + m[3] + '<'), html: m[3] }));
  assert.deepEqual(boutons.map(b => b.mot), ['Arrêt', 'Hors-gel', 'Éco', 'Confort −2', 'Confort −1', 'Confort'], 'du plus froid au plus chaud');
  assert.deepEqual(boutons.map(b => b.presse), ['false', 'false', 'true', 'false', 'false', 'false'], 'le mode du changement');
  for (const b of boutons) {
    const on = b.presse === 'true';
    assert.deepEqual([b.style['min-height'], b.style.padding, b.style['border-radius'], b.style.border, b.style['font-size'], b.style['font-weight'], b.style.gap, b.style.background, b.style.color],
      ['40px', '0 6px', '10px', 'none', '12px', '700', '6px', on ? 'var(--o-accent-fond)' : 'var(--o-s1)', on ? '#fff' : 'var(--o-text1)'], b.mot);
    assert.equal(b.style['overflow-wrap'], 'anywhere', b.mot + ' : un mot long passe à la ligne');
    assert.match(b.html, on ? /^<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:[^;]+;box-shadow:0 0 0 2px #fff"><\/span><span style="min-width:0">/
      : /^<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:[^;]+;box-shadow:none"><\/span><span style="min-width:0">/, b.mot);
  }
  // Joué : un mode part en un appui ; le mode déjà choisi ne renvoie rien.
  const j = jouerPlanning({}, { etats: { ouvert: 1 } });
  const mode = (m) => chercher(deplier(j, 'LigneChangement')[1], el => el.type === 'button' && el.props['aria-pressed'] !== undefined && el.props.children[0].props.mode === m)[0];
  mode('eco').props.onClick();
  mode('confort_1').props.onClick();
  assert.equal(j.envoyes.length, 1);
  assert.deepEqual(j.envoyes[0].patch.chauffages[MODULE].semaine.lun, [c('06:30', 'confort'), c('08:30', 'confort_1'), c('18:00', 'confort'), c('23:00', 'eco')]);
  // Un VTherm ne propose que les siens.
  const v = renderToStaticMarkup(jouerPlanning({ ch: vtherm({ planning: true, semaine: SEMAINE }) }, { etats: { ouvert: 0 } }).arbre);
  const gv = /<div role="group" aria-label="Mode" style="[^"]*">([\s\S]*?)<\/div>/.exec(v);
  assert.deepEqual([...gv[1].matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map(m => texte('>' + m[1] + '<')), ['Arrêt', 'Hors-gel', 'Éco', 'Confort']);
  // Un chauffage sans aucun mode (introuvable, module injoignable) : pas de groupe « Mode » vide (relecture de la partie C).
  const sansModes = renderToStaticMarkup(jouerPlanning({ ch: radiateur({ modes: [] }) }, { etats: { ouvert: 1 } }).arbre);
  assert.ok(sansModes.includes('aria-expanded="true"') && !sansModes.includes('aria-label="Mode"'), 'déplié, sans grille vide');
});

test('« Supprimer ce changement » : un appui, au rouge des alertes — le focus va à « Ajouter » ; le dernier de la semaine se refuse dans sa rangée', async () => {
  const ouverte = renderToStaticMarkup(jouerPlanning({}, { etats: { ouvert: 2 } }).arbre);
  const s = /<button type="button" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-trash" style="font-size:13px;[^"]*"><\/i>Supprimer ce changement<\/button>/.exec(ouverte);
  assert.ok(s, '« Supprimer ce changement »');
  assert.deepEqual(declarations(s[1]), { 'align-self': 'flex-start', display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '12px 0', margin: '-8px 0 -12px', border: 'none',
    background: 'none', color: 'var(--o-bad)', 'font-family': 'inherit', 'font-size': '12.5px', 'font-weight': '800', cursor: 'pointer' });
  // Joué : UN appui — la semaine part sans lui ; la rangée se replie, le focus va à « Ajouter », sinon à l'onglet.
  const j = jouerPlanning({}, { etats: { ouvert: 2 } });
  supprimerDe(j, 2).props.onClick();
  assert.deepEqual(j.envoyes[0].patch.chauffages[MODULE].semaine.lun.map(x => x.h), ['06:30', '08:30', '23:00']);
  assert.deepEqual(j.pose('ouvert'), [null]);
  assert.deepEqual(j.focus, [['b-ajouter', 'b-t-planning']]);
  // Le dernier changement de la semaine : rien ne part, la phrase du serveur se dit dans sa rangée.
  const seul = radiateur({ semaine: { lun: [c('07:00', 'confort')], mar: [], mer: [], jeu: [], ven: [], sam: [], dim: [] } });
  const k = jouerPlanning({ ch: seul }, { etats: { ouvert: 0 } });
  supprimerDe(k, 0).props.onClick();
  assert.deepEqual(k.envoyes, []);
  assert.deepEqual(k.pose('local'), [{ jour: 0, index: 0, texte: 'Un planning garde au moins un changement.' }]);
  const dit = renderToStaticMarkup(jouerPlanning({ ch: seul }, { etats: { ouvert: 0, local: { jour: 0, index: 0, texte: 'Un planning garde au moins un changement.' } } }).arbre);
  const i = dit.indexOf('<div role="alert"');
  assert.ok(i > dit.indexOf('>Supprimer ce changement<') && i < dit.indexOf('data-rangee="copier"'), 'dans sa rangée, sous « Supprimer »');
  assert.equal((dit.match(/role="alert"/g) || []).length, 1, 'une fois');
  assert.ok(dit.includes('>Un planning garde au moins un changement.<'));
  // Un autre jour choisi : le refus ne s'y montre pas.
  assert.ok(!renderToStaticMarkup(jouerPlanning({ ch: seul }, { etats: { jour: 1, local: { jour: 0, index: 0, texte: 'x' } } }).arbre).includes('role="alert"'));
  // Sans rangée — une copie qui viderait la semaine — : sous les changements.
  const sansRangee = renderToStaticMarkup(jouerPlanning({}, { etats: { local: { jour: 0, index: null, texte: 'Un planning garde au moins un changement.' } } }).arbre);
  assert.ok(sansRangee.indexOf('<div role="alert"') > sansRangee.indexOf('data-rangee="copier"') && sansRangee.includes('>Un planning garde au moins un changement.<'));
  // Le serveur refuse : l'avance se retire, le refus se dit (raisonEchec), sous les changements.
  const refus = Object.assign(new Error('deux changements a la meme heure : lun[1].h'), { code: 'chauffage_heure_en_double' });
  const r = jouerPlanning({}, { etats: { ouvert: 1 }, commande: () => Promise.reject(refus) });
  quart(r, 1, '15 min plus tôt').props.onClick();
  await new Promise(x => setTimeout(x, 0));
  assert.equal(r.avances.length, 2);
  assert.equal(r.avances[1], null, 'l’avance se retire');
  assert.deepEqual(r.pose('err').at(-1), { ou: 'semaine', texte: 'Deux changements à la même heure (lundi, changement 2).' });
  const sous = renderToStaticMarkup(jouerPlanning({}, { etats: { err: { ou: 'semaine', texte: 'Deux changements à la même heure (lundi, changement 2).' } } }).arbre);
  assert.ok(sous.indexOf('<div role="alert"') > sous.indexOf('data-rangee="copier"') && sous.includes('>Deux changements à la même heure (lundi, changement 2).<'), 'sous les changements');
});

test('« Ajouter un changement » (3c) : à l’accent, sous les changements — le nouveau s’ouvre déplié et prend le focus', async () => {
  const html = rendre({ ongletDepart: 'planning' });
  const a = /<button type="button" id="([^"]+)" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-add" style="font-size:14px;[^"]*"><\/i>Ajouter un changement<\/button>/.exec(html);
  assert.ok(a && a[1].endsWith('-ajouter'), '« Ajouter un changement »');
  assert.deepEqual(declarations(a[2]), { display: 'flex', 'align-items': 'center', gap: '8px', width: '100%', padding: '14px 18px', border: 'none', 'border-top': FILET_ATTENDU,
    background: 'none', 'box-sizing': 'border-box', color: 'var(--o-accent-soft)', 'font-family': 'inherit', 'font-size': '13px', 'font-weight': '800', cursor: 'pointer', 'text-align': 'left' });
  assert.ok(html.indexOf('>Ajouter un changement<') > html.indexOf('data-changement="23:00"'), 'après le dernier changement');
  /* Joué : au mode qui change quelque chose (gesteSemaine) ; il s'ouvre et
   * prend le focus. ASSERTIONS MODIFIÉES (son choix du 12/10) : au MILIEU du
   * plus grand trou de la journée — 08:30 → 18:00, 13:15 —, plus à 08:00. */
  const j = jouerPlanning();
  chercher(j.arbre, el => el.type === 'button' && el.props.id === 'b-ajouter')[0].props.onClick();
  assert.deepEqual(j.envoyes[0].patch.chauffages[MODULE].semaine.lun.map(x => x.h + ' ' + x.mode), ['06:30 confort', '08:30 eco', '13:15 confort', '18:00 confort', '23:00 eco']);
  assert.deepEqual(j.avances, [j.envoyes[0].patch.chauffages[MODULE].semaine], 'montrée d’avance');
  assert.deepEqual(j.pose('ouvert'), [2], 'le nouveau s’ouvre déplié');
  assert.deepEqual(j.focus, [['b-c-2', 'b-ajouter', 'b-t-planning']], 'et prend le focus');
  // Un ajout refusé par le serveur (relecture de la partie C) : la rangée se replie — celle qui prend l'index ne se déplie pas —, le focus revient à « Ajouter ».
  const refus = Object.assign(new Error('plus de 12 changements ce jour : lun'), { code: 'chauffage_trop_de_changements' });
  const k = jouerPlanning({}, { commande: () => Promise.reject(refus) });
  chercher(k.arbre, el => el.type === 'button' && el.props.id === 'b-ajouter')[0].props.onClick();
  await new Promise(x => setTimeout(x, 0));
  assert.deepEqual(k.pose('ouvert'), [2, null]);
  assert.deepEqual(k.focus, [['b-c-2', 'b-ajouter', 'b-t-planning'], ['b-ajouter', 'b-t-planning']]);
  assert.deepEqual(k.avances.at(-1), null, 'l’avance se retire');
});

test('« Copier cette journée sur » (3c) : Lun – ven ou Toute la semaine, deux puces de 40 px — en DEUX appuis, un geste qui ne se rattrape pas', () => {
  const html = rendre({ ongletDepart: 'planning' });
  /* ASSERTIONS MODIFIÉES (relecture de la partie C, point C — la règle de la
   * fiche commune) : les deux copies écrasent jusqu'à six jours sans retour en
   * arrière — elles passent par `BoutonConfirme` (deux appuis), au dessin de
   * la puce de 40 px ; leur nom dit ce qu'elles font, et contient le mot qu'on
   * voit (« Copier cette journée sur : Lun – ven »). */
  const k = /<div role="group" aria-labelledby="([^"]+)" data-rangee="copier" style="([^"]*)"><span id="([^"]+)" style="([^"]*)">Copier cette journée sur<\/span><button type="button" aria-label="Copier cette journée sur : Lun – ven" title="Copier cette journée sur : Lun – ven" style="([^"]*)">Lun – ven<\/button><button type="button" aria-label="Copier cette journée sur : Toute la semaine" title="Copier cette journée sur : Toute la semaine" style="([^"]*)">Toute la semaine<\/button><\/div>/.exec(html);
  assert.ok(k, 'la rangée des copies');
  assert.equal(k[1], k[3], 'le groupe nommé par son libellé visible');
  assert.deepEqual(declarations(k[2]), { display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '8px', padding: '12px 18px', 'border-top': FILET_ATTENDU });
  assert.deepEqual(declarations(k[4]), { 'margin-right': 'auto', 'font-size': '12px', color: 'var(--o-text3)' });
  for (const b of [k[5], k[6]]) {
    const s = declarations(b);
    assert.deepEqual([s['min-height'], s.padding, s['border-radius'], s.border, s.background, s.color, s['font-family'], s['font-size'], s['font-weight'], s.cursor, s['white-space']],
      ['40px', '0 12px', '10px', 'none', 'var(--o-s1)', 'var(--o-text1)', 'inherit', '12px', '700', 'pointer', 'nowrap']);
  }
  assert.ok(html.indexOf('data-rangee="copier"') > html.indexOf('>Ajouter un changement<'), 'en bas du panneau');
  // Jouées depuis le samedi — le second appui, celui qui confirme — : sur les jours de semaine, puis sur toute la semaine.
  const j = jouerPlanning({}, { etats: { jour: 5 } });
  const copie = (mot) => chercher(j.arbre, el => el.type === BoutonConfirme && el.props.libelle === mot)[0];
  assert.deepEqual([copie('Lun – ven').props.nom, copie('Toute la semaine').props.nom], ['Copier cette journée sur : Lun – ven', 'Copier cette journée sur : Toute la semaine']);
  copie('Lun – ven').props.onConfirme();
  copie('Toute la semaine').props.onConfirme();
  const samedi = PLAN.semainePropre(SEMAINE).sam;
  const [semaine, tous] = j.envoyes.map(m => m.patch.chauffages[MODULE].semaine);
  for (const jour of ['lun', 'mar', 'mer', 'jeu', 'ven']) assert.deepEqual(semaine[jour], samedi, jour);
  assert.deepEqual(semaine.dim, PLAN.semainePropre(SEMAINE).dim, 'le dimanche ne bouge pas');
  for (const jour of JOURS) assert.deepEqual(tous[jour], samedi, jour);
  assert.deepEqual([j.pose('ouvert'), j.focus], [[], []], 'le focus reste sur la puce');
  // Une copie qui ne change rien ne part pas.
  const lundi = jouerPlanning();
  chercher(lundi.arbre, el => el.type === BoutonConfirme && el.props.libelle === 'Lun – ven')[0].props.onConfirme();
  assert.deepEqual(lundi.envoyes, [], 'les jours de semaine sont déjà ceux du lundi');
});

test('un compte ordinaire lit le Planning : les rangées sans chevron, ni réglage, ni ajout, ni copie', () => {
  const ord = rendre({ ongletDepart: 'planning' }, maison({ admin: false }));
  // ASSERTION AJOUTÉE (son choix du 12/10) : le champ de l'heure non plus.
  for (const t of ['aria-expanded', 'angle-small-down', 'Ajouter un changement', 'Copier cette journée sur', 'Supprimer ce changement', 'role="switch"', '15 min', 'type="time"']) {
    assert.ok(!ord.includes(t), 'compte ordinaire : « ' + t + ' » est montré');
  }
  const rangees = [...ord.matchAll(/<div data-changement="([\d:]+)" style="([^"]*)"><span style="[^"]*">\1<\/span><span style="[^"]*"><span aria-hidden="true"[^>]*><\/span><span style="min-width:0">([^<]+)<\/span><\/span><\/div>/g)]
    .map(m => [m[1], m[3], declarations(m[2]).padding, declarations(m[2])['border-top']]);
  assert.deepEqual(rangees, [['06:30', 'Confort', '12px 18px', FILET_ATTENDU], ['08:30', 'Éco', '12px 18px', FILET_ATTENDU], ['18:00', 'Confort', '12px 18px', FILET_ATTENDU],
    ['23:00', 'Éco', '12px 18px', FILET_ATTENDU]]);
  // Il choisit encore le jour qu'il lit : la semaine reste en boutons.
  assert.equal((ord.match(/<button type="button" data-jour=/g) || []).length, 7);
  // Joué : rien ne se déplie, même demandé.
  const j = jouerPlanning({ ordinaire: true }, { etats: { ouvert: 1 } });
  assert.equal(chercher(deplier(j, 'LigneChangement'), el => el.type === 'button').length, 0);
});

test('« Pas de planning » (3f) : la plaque, le titre, ce que le chauffage garde — et « Créer un planning » pour un administrateur', () => {
  const html = rendre({ ongletDepart: 'planning', ch: poele(), sonde: null });
  const p = panneau(html, 'sans-planning');
  assert.ok(p, 'jamais réglé : le panneau « Pas de planning »');
  assert.deepEqual(p.style, { ...PANNEAU_MAQUETTE, display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start', gap: '10px', padding: '22px 18px' });
  assert.ok(p.corps.startsWith('<span aria-hidden="true" style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--o-s1);color:var(--o-text2)">'
    + '<i aria-hidden="true" class="fi fi-rr-calendar-clock" style="font-size:17px;'), p.corps.slice(0, 300));
  assert.ok(p.corps.includes('<div style="font-size:15px;font-weight:800">Pas de planning</div>'
    + '<div style="font-size:13px;color:var(--o-text2);line-height:1.45;text-wrap:pretty">Ce chauffage garde sa consigne de 20,5° jusqu’à ce que vous la changiez.</div>'));
  const b = /<div style="margin-top:4px"><button type="button" id="([^"]+)" style="([^"]*)"><i aria-hidden="true" class="fi fi-rr-add" style="font-size:13px;[^"]*"><\/i><span>Créer un planning<\/span><\/button><\/div>/.exec(p.corps);
  assert.ok(b && b[1].endsWith('-creer'), '« Créer un planning »');
  assert.deepEqual(declarations(b[2]), { 'min-height': '44px', padding: '0 14px', 'border-radius': '10px', border: 'none', background: 'var(--o-accent-fond)', color: '#fff',
    'font-family': 'inherit', 'font-size': '12.5px', 'font-weight': '700', display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer', 'text-align': 'left' });
  // Ni bascule, ni semaine, ni rien de l'ancien premier allumage.
  for (const t of ['role="switch"', 'data-panneau="semaine"', 'data-jour', 'data-changement', 'Allumer avec cette semaine', 'Copier depuis', 'voici une semaine type', 'Températures des modes']) {
    assert.ok(!html.includes(t), t);
  }
  // Un fil pilote, un VTherm : le mode que l'appareil dit.
  const phrase = (ch, h = maison()) => /<div style="font-size:13px;color:var\(--o-text2\);line-height:1.45;text-wrap:pretty">([^<]*)<\/div>/.exec(rendre({ ongletDepart: 'planning', ch, sonde: null }, h))[1];
  assert.equal(phrase(radiateur({ planning: false, semaine: null })), 'Ce chauffage garde son mode, Confort, jusqu’à ce que vous le changiez.');
  assert.equal(phrase(vtherm()), 'Ce chauffage garde son mode, Éco, jusqu’à ce que vous le changiez.');
  // Rien de lisible — un appareil muet, un préréglage qui ne dit aucun mode — : la phrase sans valeur, jamais une valeur inventée.
  assert.equal(phrase(poele(), maison({ states: [st(POELE, 'unavailable', {})] })), 'Ce chauffage garde son réglage jusqu’à ce que vous le changiez.');
  assert.equal(phrase(vtherm(), maison({ states: [st(VTHERM, 'heat', { preset_mode: 'boost' })] })), 'Ce chauffage garde son réglage jusqu’à ce que vous le changiez.');
  // Un compte ordinaire lit, sans bouton.
  const ord = rendre({ ongletDepart: 'planning', ch: poele(), sonde: null }, maison({ admin: false }));
  assert.ok(ord.includes('>Pas de planning<') && !ord.includes('Créer un planning'));
  /* Un chauffage sans aucun mode compris (introuvable, module injoignable) :
   * le serveur refuserait la semaine (« mode confort inconnu ») — pas de
   * bouton, une phrase à sa place (relecture de la partie C), la même règle
   * que « Ajouter un changement ». */
  const muet = rendre({ ongletDepart: 'planning', ch: poele({ modes: [] }), sonde: null });
  assert.ok(!muet.includes('Créer un planning'), 'rien à créer');
  assert.ok(muet.includes('<div style="margin-top:4px;font-size:13px;font-weight:700;color:var(--o-text2);line-height:1.45">Ce chauffage ne répond pas : le planning ne peut pas encore le commander.</div>'), muet);
  assert.ok(SOURCE.includes('const comprend = ORDRE_MODES.some(m => (ch.modes || []).includes(m));'), 'la règle d’« Ajouter un changement »');
  // Une semaine posée, planning éteint : ce n'est plus « Pas de planning ».
  assert.ok(!rendre({ ongletDepart: 'planning', ch: poele({ semaine: SEMAINE }), sonde: null }).includes('Pas de planning'));
});

test('« Créer un planning » pose la semaine type dans les modes du chauffage, SANS allumer le planning — puis le focus va à la bascule', async () => {
  const creer = (jj) => chercher(deplier(jj, 'SansPlanning')[0], el => el.type === 'button' && el.props.id === 'b-creer')[0];
  const j = jouerPlanning({ ch: poele() });
  creer(j).props.onClick();
  assert.deepEqual(j.envoyes, [config({ [POELE]: { semaine: PLAN.semaineType() } })], 'un patch { semaine } seul');
  assert.ok(!('planning' in j.envoyes[0].patch.chauffages[POELE]), 'le planning reste éteint : on la relit, puis on l’allume');
  assert.deepEqual(j.avances, [PLAN.semaineType()], 'la semaine paraît aussitôt');
  assert.deepEqual(j.focus, [['b-suivre', 'b-t-planning']], 'le focus va à la bascule « Suivre le planning »');
  // Montrée d'avance : le Planning, la bascule éteinte, la semaine à .4.
  const avant = renderToStaticMarkup(jouerPlanning({ ch: poele() }, { optimiste: (lu) => (lu === 'null' ? PLAN.semaineType() : null) }).arbre);
  assert.ok(!avant.includes('data-panneau="sans-planning"'));
  assert.match(avant, /<button type="button" id="b-suivre" role="switch" aria-checked="false" aria-label="Suivre le planning"/);
  assert.equal(panneau(avant, 'semaine').style.opacity, '0.4');
  // Sans Éco (un VTherm sans préréglage « eco ») : le Hors-gel — jamais plus chaud ; celle qu'on montre est celle qui part.
  const salon = vtherm({ modes: ['confort', 'hors_gel', 'arret'] });
  const v = jouerPlanning({ ch: salon });
  creer(v).props.onClick();
  const envoyee = v.envoyes[0].patch.chauffages[VTHERM].semaine;
  assert.deepEqual(envoyee.lun, [c('06:30', 'confort'), c('08:30', 'hors_gel'), c('18:00', 'confort'), c('22:30', 'hors_gel')]);
  assert.deepEqual(envoyee.sam, [c('08:00', 'confort'), c('22:30', 'hors_gel')]);
  assert.ok(Object.values(envoyee).flat().every(x => salon.modes.includes(x.mode)), 'rien que le serveur refuserait');
  assert.deepEqual(v.avances, [envoyee]);
  // Refusé : l'avance se retire, le refus se dit sous le panneau, et le focus revient à son bouton.
  const refus = Object.assign(new Error('Unauthorized'), { code: 'unauthorized' });
  const k = jouerPlanning({ ch: poele() }, { commande: () => Promise.reject(refus) });
  creer(k).props.onClick();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(k.avances, [PLAN.semaineType(), null], 'l’avance se retire');
  assert.deepEqual(k.pose('err').at(-1), { ou: 'semaine', texte: raisonEchec(refus) });
  assert.deepEqual(k.focus, [['b-suivre', 'b-t-planning'], ['b-creer', 'b-t-planning']]);
  const dit = renderToStaticMarkup(jouerPlanning({ ch: poele() }, { etats: { err: { ou: 'semaine', texte: 'refusé' } } }).arbre);
  assert.ok(dit.indexOf('<div role="alert"') > dit.indexOf('data-panneau="sans-planning"') && dit.includes('>refusé<'));
});

test('Températures des modes (thermostat), sous les changements : − / + carrés de 44 px, Confort −1 et −2 en lecture, dans l’unité de la maison', () => {
  /* TEST DÉPLACÉ ET MODIFIÉ (tâche 10 bis C) : « Réglages d’un thermostat… »
   * suit les températures dans le Planning (un thermostat qui a une semaine) ;
   * leurs − / + sont les carrés de 44 px de la consigne (`PasCarre`), plus
   * `PasAPas`. Les valeurs attendues ne changent pas. */
  const poeleRegle = poele({ semaine: SEMAINE });
  const html = rendre({ ongletDepart: 'planning', ch: poeleRegle, sonde: null });
  assert.ok(html.indexOf('>Températures des modes<') > html.indexOf('data-rangee="copier"'), 'sous les changements');
  assert.match(html, /<div style="margin-top:18px"><div id="([^"]+)-temperatures" style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var\(--o-text3\)">Températures des modes<\/div><div role="group" aria-labelledby="\1-temperatures" data-panneau="temperatures"/);
  const p = panneau(html, 'temperatures');
  assert.deepEqual(p.style, { ...PANNEAU_MAQUETTE, 'margin-top': '10px', overflow: 'hidden' });
  for (const nom of ['Confort', 'Éco', 'Hors-gel']) {
    const vus = [...p.corps.matchAll(new RegExp('<button type="button" aria-label="' + nom + ' : (Moins|Plus)" style="([^"]*)">', 'g'))];
    assert.deepEqual(vus.map(m => m[1]), ['Moins', 'Plus'], nom);
    for (const m of vus) assert.deepEqual([declarations(m[2]).width, declarations(m[2]).height, declarations(m[2])['border-radius']], ['44px', '44px', '12px'], nom);
  }
  const valeurs = (h, attribut) => [...h.matchAll(new RegExp('data-' + attribut + '="(\\w+)"[\\s\\S]*?>(\\d+(?:,\\d+)? °[CF])<', 'g'))].map(x => [x[1], x[2]]);
  assert.deepEqual(valeurs(html, 'temperature'), [['confort', '20 °C'], ['eco', '17 °C'], ['hors_gel', '7 °C']], 'jamais réglées : les défauts du serveur');
  assert.deepEqual(valeurs(html, 'deduite'), [['confort_1', '19 °C'], ['confort_2', '18 °C']]);
  // Chaque rangée : son point, son mot ; Confort −1 et −2 en lecture, leur valeur dans la colonne des autres.
  assert.match(p.corps, /<div data-temperature="confort" style="[^"]*padding:12px 14px 12px 18px[^"]*"><span style="[^"]*display:inline-flex[^"]*"><span aria-hidden="true" style="[^"]*background:var\(--o-warn2\)/);
  const lecture = p.corps.slice(p.corps.indexOf('data-deduite="confort_1"'));
  assert.ok(lecture.includes('>Déduite du Confort, jamais sous l’Éco<') && !lecture.includes('<button'), 'en lecture : aucun bouton');
  assert.ok(lecture.includes('<span style="min-width:64px;text-align:center;font-size:17px;font-weight:800;white-space:nowrap;flex-shrink:0;margin-right:52px">19 °C</span>'), lecture.slice(0, 600));
  // Réglées : les siennes ; Confort −1 et −2 jamais sous l'Éco.
  const reglees = rendre({ ongletDepart: 'planning', ch: poele({ semaine: SEMAINE, temperatures: { confort: 21.5, eco: 20.5, hors_gel: 8 } }), sonde: null });
  assert.deepEqual(valeurs(reglees, 'temperature').map(x => x[1]), ['21,5 °C', '20,5 °C', '8 °C']);
  assert.deepEqual(valeurs(reglees, 'deduite').map(x => x[1]), ['20,5 °C', '20,5 °C']);
  // Une maison en °F : dites en °F, gardées en °C.
  const f = maison();
  f.config.unit_system.temperature = '°F';
  assert.deepEqual(valeurs(rendre({ ongletDepart: 'planning', ch: poeleRegle, sonde: null }, f), 'temperature').map(x => x[1]), ['68 °F', '62,6 °F', '44,6 °F']);
  // Un fil pilote, un VTherm : leurs modes sont ceux du module ou des préréglages — pas de températures.
  assert.ok(!rendre({ ongletDepart: 'planning' }).includes('Températures des modes'));
  assert.ok(!rendre({ ongletDepart: 'planning', ch: vtherm({ semaine: SEMAINE }), sonde: null }).includes('Températures des modes'));
  // Un compte ordinaire les lit : les valeurs, sans bouton.
  const ord = rendre({ ongletDepart: 'planning', ch: poeleRegle, sonde: null }, maison({ admin: false }));
  assert.deepEqual(valeurs(ord, 'temperature').map(x => x[1]), ['20 °C', '17 °C', '7 °C']);
  assert.ok(!panneau(ord, 'temperatures').corps.includes('<button'), 'aucun bouton');
});

test('Températures, jouées : les trois partent ensemble ; un cran qui casse l’ordre — même après l’arrondi au demi-degré — ne part pas, la phrase du serveur le dit', async () => {
  /* TEST DÉPLACÉ ET MODIFIÉ (tâche 10 bis C) : « Réglages, joués… » se joue
   * sur `TemperaturesDesModes`, ses − / + en `PasCarre` ; les messages, les
   * avances et les refus attendus ne changent pas. ASSERTIONS AJOUTÉES
   * (relecture de la tâche 10) : une consigne hors de la grille (16,8) se
   * range au demi-degré AVANT que l'ordre se juge, comme le serveur. */
  const NOMS_T = ['err', 'ordre'];
  const props = (ch, ordinaire = false) => ({ idBase: 'b', hass: maison({ admin: !ordinaire }), ch, ordinaire });
  const pasDe = (j, nom) => chercher(j.arbre, el => el.type === j.F.PasCarre && el.props.nom === nom)[0];
  const ch = poele({ semaine: SEMAINE, temperatures: { confort: 20, eco: 19.5, hors_gel: 7 } });
  const j = jouer('TemperaturesDesModes', props(ch), { noms: NOMS_T });
  pasDe(j, 'Éco').props.plus();
  assert.deepEqual(j.envoyes, [config({ [POELE]: { temperatures: { confort: 20, eco: 20, hors_gel: 7 } } })], 'les trois, en °C, d’un seul patch');
  assert.deepEqual(j.envoyes[0], messageTemperatures(ch, { confort: 20, eco: 20, hors_gel: 7 }));
  assert.deepEqual(j.avances, [{ confort: 20, eco: 20, hors_gel: 7 }], 'montrées d’avance');
  // Un cran de trop — l'Éco passerait le Confort — : rien ne part, la phrase du refus du serveur se dit sur place.
  const j2 = jouer('TemperaturesDesModes', props(poele({ semaine: SEMAINE, temperatures: { confort: 20, eco: 20, hors_gel: 7 } })), { noms: NOMS_T });
  pasDe(j2, 'Éco').props.plus();
  pasDe(j2, 'Confort').props.moins();
  assert.deepEqual(j2.envoyes, [], 'rien ne part');
  const phrase = raisonEchec(Object.assign(new Error('temperatures en desordre (hors_gel < eco <= confort) : temperatures.eco'), { code: 'chauffage_temperatures_desordre' }));
  assert.equal(phrase, 'Les températures doivent rester dans l’ordre : Hors-gel sous Éco, Éco au plus Confort.');
  assert.deepEqual(j2.pose('ordre'), [phrase, phrase], 'la phrase du serveur pour ce refus');
  // Un Hors-gel venu d'ailleurs à 16,8 : le serveur le range à 17 avant de juger — 17 n'est pas sous 17 ; l'écran le voit aussi.
  const g = jouer('TemperaturesDesModes', props(poele({ semaine: SEMAINE, temperatures: { confort: 20, eco: 17, hors_gel: 16.8 } })), { noms: NOMS_T });
  pasDe(g, 'Confort').props.plus();
  assert.deepEqual(g.envoyes, [], 'le serveur l’aurait refusé');
  assert.deepEqual(g.pose('ordre'), [phrase]);
  // Rangées sur la grille, les trois partent rangées : l'Éco à 16,8 part à 17.
  const eco = jouer('TemperaturesDesModes', props(poele({ semaine: SEMAINE, temperatures: { confort: 20, eco: 16.8, hors_gel: 7 } })), { noms: NOMS_T });
  pasDe(eco, 'Confort').props.plus();
  assert.deepEqual(eco.envoyes, [config({ [POELE]: { temperatures: { confort: 20.5, eco: 17, hors_gel: 7 } } })]);
  // Dite sous les températures, en alerte ; un cran valide l'efface.
  const dite = renderToStaticMarkup(jouer('TemperaturesDesModes', props(ch), { noms: NOMS_T, etats: { ordre: phrase } }).arbre);
  assert.ok(dite.indexOf('<div role="alert"') > dite.indexOf('data-deduite="confort_2"') && dite.includes('>' + phrase + '<'));
  assert.deepEqual(j.pose('ordre'), [''], 'le cran valide efface la phrase');
  // Aux bornes du serveur (5 à 30 °C), le bouton se grise ; l'ordre, lui, se dit au geste.
  const j3 = jouer('TemperaturesDesModes', props(poele({ semaine: SEMAINE, temperatures: { confort: 30, eco: 17, hors_gel: 5 } })), { noms: NOMS_T });
  assert.deepEqual(chercher(j3.arbre, el => el.type === j3.F.PasCarre).map(p => [p.props.nom, p.props.peutMoins, p.props.peutPlus]),
    [['Confort', true, false], ['Éco', true, true], ['Hors-gel', false, true]]);
  /* ASSERTIONS AJOUTÉES (relecture de la partie C) : à sa borne, le bouton
   * reste focalisable (`aria-disabled`, plus `disabled` — le focus tombait sur
   * <body>) et son clic ne fait rien. */
  const confort = chercher(j3.arbre, el => el.type === j3.F.PasCarre && el.props.nom === 'Confort')[0];
  const plus = chercher(j3.F.PasCarre(confort.props), el => el.type === 'button' && el.props['aria-label'] === 'Confort : Plus')[0];
  assert.deepEqual([plus.props['aria-disabled'], plus.props.disabled], [true, undefined]);
  plus.props.onClick();
  assert.deepEqual(j3.envoyes, [], 'inerte : rien ne part');
  // Le serveur refuse : l'avance se retire, le refus se dit (raisonEchec).
  const refus = Object.assign(new Error('temperature hors bornes (5 a 30 °C) : temperatures.confort'), { code: 'chauffage_temperature_hors_bornes' });
  const j4 = jouer('TemperaturesDesModes', props(ch), { noms: NOMS_T, commande: () => Promise.reject(refus) });
  pasDe(j4, 'Confort').props.plus();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(j4.avances, [{ confort: 20.5, eco: 19.5, hors_gel: 7 }, null], 'l’avance se retire');
  assert.equal(j4.pose('err').at(-1), raisonEchec(refus));
  // Un compte ordinaire : aucun pas à jouer.
  const o = jouer('TemperaturesDesModes', props(ch, true), { noms: NOMS_T });
  assert.equal(chercher(o.arbre, el => el.type === o.F.PasCarre).length, 0);
});

test('« Supprimer son planning » en bas du Planning, pour un chauffage introuvable — deux appuis ; jamais pour un compte ordinaire', async () => {
  /* TEST DÉPLACÉ ET MODIFIÉ (tâche 10 bis C) : « Réglages : « Supprimer son
   * planning »… » suit la suppression en bas du Planning
   * (`SupprimerSonPlanning`) ; le message et les deux appuis ne changent pas. */
  assert.ok(!rendre({ ongletDepart: 'planning' }).includes('Supprimer son planning'), 'un chauffage présent ne se supprime pas d’ici');
  const perdu = radiateur({ entite: null, avertissements: ['introuvable'] });
  const html = rendre({ ongletDepart: 'planning', ch: perdu, sonde: null });
  const p = panneau(html, 'suppression');
  assert.ok(p && html.indexOf('data-panneau="suppression"') > html.indexOf('data-rangee="copier"'), 'en bas');
  assert.deepEqual(p.style, { ...PANNEAU_MAQUETTE, display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '12px', padding: '12px 14px 12px 18px' });
  assert.ok(/>Supprimer son planning<[\s\S]*?>Introuvable dans Home Assistant : renommé ou retiré \?<[\s\S]*?<button type="button" style="[^"]*">Supprimer<\/button>/.test(p.corps));
  const j = jouer('SupprimerSonPlanning', { hass: maison(), ch: perdu }, { noms: ['err'] });
  const bouton = chercher(j.arbre, el => el.type === BoutonConfirme)[0];
  assert.equal(bouton.props.libelle, 'Supprimer', 'BoutonConfirme : deux appuis');
  bouton.props.onConfirme();
  assert.deepEqual(j.envoyes, [config({ [MODULE]: null })]);
  assert.deepEqual(messageSuppression(perdu), config({ [MODULE]: null }));
  // Refusée : le refus se dit sous le panneau.
  const refus = Object.assign(new Error('Unauthorized'), { code: 'unauthorized' });
  const k = jouer('SupprimerSonPlanning', { hass: maison(), ch: perdu }, { noms: ['err'], commande: () => Promise.reject(refus) });
  chercher(k.arbre, el => el.type === BoutonConfirme)[0].props.onConfirme();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(k.pose('err'), ['', raisonEchec(refus)]);
  // Un compte ordinaire : ni suppression, ni bascule, ni pas — il lit (ADR 0144).
  const ordinaire = rendre({ ongletDepart: 'planning', ch: poele({ semaine: SEMAINE, avertissements: ['introuvable'] }), sonde: null }, maison({ admin: false }));
  for (const t of ['Supprimer son planning', 'aria-label="Confort : Plus"', 'role="switch"']) assert.ok(!ordinaire.includes(t), 'compte ordinaire : « ' + t + ' »');
  assert.ok(ordinaire.includes('>Températures des modes<'), 'il lit les températures');
});

test('l’onglet Réglages est parti : son contenu vit dans le Planning, la fenêtre se règle à l’Accueil', () => {
  /* TEST RÉÉCRIT (tâche 10 bis C) : « Réglages perd la fenêtre… » vérifiait
   * que Réglages n'écrivait plus la fenêtre ; Réglages n'existe plus. */
  assert.ok(!/function OngletReglages\(/.test(SOURCE), 'OngletReglages existe encore');
  assert.ok(!SOURCE.includes("['reglages', "), 'un onglet Réglages');
  // La fenêtre ne s'écrit qu'à l'Accueil (tâche 10 bis B) : sa définition, et un appel, dans OngletAccueil.
  assert.equal((SOURCE.match(/messageFenetre\(/g) || []).length, 2, 'messageFenetre : sa définition et l’Accueil');
  const accueilSource = SOURCE.slice(SOURCE.indexOf('function OngletAccueil('), SOURCE.indexOf('/* ════════════ Le planning ════════════ */'));
  assert.ok(accueilSource.includes('messageFenetre('), 'l’Accueil règle la fenêtre');
  for (const ch of [radiateur(), poele({ semaine: SEMAINE }), vtherm({ semaine: SEMAINE })]) {
    const html = rendre({ ongletDepart: 'planning', ch, sonde: null });
    assert.equal(groupe(html, 'fenetre'), null, ch.cle + ' : la fenêtre dans le Planning');
    assert.ok(!html.includes('Éco conseillé pour un poêle'), ch.cle);
  }
});

test('ce que la maquette ne montre plus s’en va : les pastilles des jours, la saisie de l’heure, la liste des modes, le ✕, le menu des copies, l’ancien premier allumage', () => {
  /* ASSERTION RETIRÉE (son choix du 12/10, « Toucher l’heure ») : « la saisie
   * d'une heure au clavier » — le champ de l'heure revient, au centre de la
   * rangée dépliée (il a son test plus haut). */
  for (const [motif, quoi] of [
    [/\bPuceJour\b/, 'les pastilles des jours'],
    [/\bListeChoix\b/, 'une liste de choix'],
    [/cross-small/, 'le ✕ à deux appuis'],
    [/\bCOPIES_JOURS\b|\bcopieChez\b|\bautresChauffages\b|\bcopierJourChez\b|\bweekend\b/, 'les copies vers le week-end ou un autre chauffage'],
    [/\bmessageAllumage\b|Allumer avec cette semaine|Copier depuis|voici une semaine type|il s’allume dans Réglages|la veille continue/, 'l’ancien premier allumage et ses phrases'],
  ]) assert.ok(!motif.test(SOURCE), quoi);
  assert.equal(M.messageAllumage, undefined, 'messageAllumage n’est plus exporté');
  assert.equal(PLAN.copierJourChez, undefined, 'copierJourChez n’est plus exporté');
});

test('toute semaine envoyée part dans les modes du chauffage : une semaine qu’il ne comprend plus se répare au geste suivant', () => {
  /* TEST DÉPLACÉ ET MODIFIÉ (tâche 10 bis C) : le geste joué passe du champ
   * d'heure (parti) à « + 15 min » ; `messageAllumage` (parti) laisse sa place
   * à `messageSemaine`, que « Créer un planning » emprunte. */
  // Un VTherm qui a perdu son préréglage « eco » : sa semaine en garde ; telle quelle, le serveur refuserait chaque envoi.
  const salon = vtherm({ planning: true, modes: ['confort', 'hors_gel', 'arret'], semaine: SEMAINE });
  const r = gesteSemaine(salon, salon.semaine, { quoi: 'mode', jour: 0, index: 0, avant: '06:30', mode: 'hors_gel' });
  const envoyee = r.message.patch.chauffages[VTHERM].semaine;
  assert.deepEqual(envoyee.lun, [c('06:30', 'hors_gel'), c('08:30', 'hors_gel'), c('18:00', 'confort'), c('23:00', 'hors_gel')], 'l’Éco devient Hors-gel : jamais plus chaud');
  assert.deepEqual(envoyee.sam, [c('08:00', 'confort'), c('22:30', 'hors_gel')], 'les autres jours aussi');
  assert.ok(Object.values(envoyee).flat().every(x => salon.modes.includes(x.mode)), 'rien que le serveur refuserait');
  assert.deepEqual(r.semaine, envoyee, 'celle qu’on montre d’avance est celle qui part');
  // Rien ne change : rien ne part — ce n'est pas une modification.
  assert.equal(gesteSemaine(salon, salon.semaine, { quoi: 'mode', jour: 0, index: 0, avant: '06:30', mode: 'confort' }), null);
  // Le message adapte de lui-même — celui de « Créer un planning » aussi.
  assert.deepEqual(messageSemaine(salon, SEMAINE).patch.chauffages[VTHERM].semaine.lun.map(x => x.mode), ['confort', 'hors_gel', 'confort', 'hors_gel']);
  const ouvree = [c('06:30', 'confort'), c('08:30', 'hors_gel'), c('18:00', 'confort'), c('22:30', 'hors_gel')];
  const repos = [c('08:00', 'confort'), c('22:30', 'hors_gel')];
  assert.deepEqual(messageSemaine(salon, PLAN.semaineType()).patch.chauffages[VTHERM],
    { semaine: { lun: ouvree, mar: ouvree, mer: ouvree, jeu: ouvree, ven: ouvree, sam: repos, dim: repos } });
  // Témoin : un chauffage qui comprend tout reçoit la semaine telle quelle.
  assert.deepEqual(messageSemaine(radiateur(), SEMAINE).patch.chauffages[MODULE].semaine, PLAN.semainePropre(SEMAINE));
  // Joué : ce qui part, et ce qui se montre d'avance.
  const j = jouerPlanning({ ch: salon }, { etats: { ouvert: 1 } });
  quart(j, 1, '15 min plus tard').props.onClick();
  assert.deepEqual(j.envoyes[0].patch.chauffages[VTHERM].semaine.lun, [c('06:30', 'confort'), c('08:45', 'hors_gel'), c('18:00', 'confort'), c('23:00', 'hors_gel')]);
  assert.deepEqual(j.avances, [j.envoyes[0].patch.chauffages[VTHERM].semaine]);
});

/* ════════════ L'Historique de sa maquette (tâche 10 bis D) ════════════
 *
 * Le cadre 3d de la maquette « Cartes chauffage » : les tailles, graisses,
 * couleurs, écarts et textes de son script (`chart`, `series`, `fmtDur`)
 * s'appliquent tels quels. Le dépôt garde ses Puces pour « 24 h · 7 jours »
 * (dans le puits), et le liseré du réglage « Liserés » sur les panneaux. La
 * fiche dessine elle-même la courbe : la coquille ne la passe plus. */

// La pièce de la chambre, au format minimal du recorder : 19,8 depuis la veille, 19,4, 21,2, un trou, 20,6.
const LU_SONDE = [[
  { entity_id: 'sensor.chambre_temperature', state: '19.8', last_changed: ilYA(30) },
  { state: '19.4', last_changed: ilYA(20) },
  { state: '21.2', last_changed: ilYA(5) },
  { state: 'unavailable', last_changed: ilYA(3) },
  { state: '20.6', last_changed: ilYA(2) },
]];
/* Le module de la chambre : l'Éco depuis la veille, le Confort de 06:30 à
 * 08:30, un trou (il ne répondait plus), Confort −1 1 h 30, l'Arrêt 45 min,
 * Confort −2 1 h 45, puis une option qui ne dit aucun mode — « à la main ». */
const LU_MODULE = [[
  { entity_id: MODULE, state: 'eco', last_changed: ilYA(30) },
  { state: 'comfort', last_changed: ilYA(12.5) },
  { state: 'eco', last_changed: ilYA(10.5) },
  { state: 'unavailable', last_changed: ilYA(7) },
  { state: 'comfort_-1', last_changed: ilYA(6) },
  { state: 'off', last_changed: ilYA(4.5) },
  { state: 'comfort_-2', last_changed: ilYA(3.75) },
  { state: 'boost', last_changed: ilYA(2) },
]];
/* Le poêle, tel que le recorder le garde — ni `hvac_modes`, ni pas, ni bornes :
 * sa consigne, sa pièce, ce qu'il fait. 17° la nuit, 20,5 le jour, éteint il
 * y a 10 h, 21 ; puis un point sans consigne ni action, et un muet. */
const LU_POELE = (() => {
  const pt = (h, state, attributes) => ({ state, attributes, last_changed: ilYA(30), last_updated: ilYA(h) });
  return [[
    { entity_id: POELE, ...pt(30, 'heat', { temperature: 17, current_temperature: 18.5, hvac_action: 'heating' }) },
    pt(18, 'heat', { temperature: 20.5, current_temperature: 19, hvac_action: 'heating' }),
    pt(14, 'heat', { temperature: 20.5, current_temperature: 20.6, hvac_action: 'idle' }),
    pt(10, 'off', { temperature: 20.5, current_temperature: 20.1, hvac_action: 'off' }),
    pt(8, 'heat', { temperature: 21, current_temperature: 19.6, hvac_action: 'heating' }),
    pt(6, 'heat', { current_temperature: 20.8 }),
    pt(4, 'unavailable', {}),
    pt(2, 'heat', { temperature: 21, current_temperature: 21, hvac_action: 'idle' }),
  ]];
})();
// Chaque lecture, son historique : la sonde de la pièce, puis l'appareil.
const parLecture = (sonde, appareil) => (o) => (o.ids.includes(SONDE.id) ? sonde : o.ids.length || o.idsAttributs.length ? appareil : []);
// Les traits de la bande sous la courbe : [ce qu'ils disent, left, width, fond].
const traitsDe = (html) => {
  const b = /data-bande-histo="" style="[^"]*">((?:<span [^>]*><\/span>)*)<\/div>/.exec(html);
  return b ? [...b[1].matchAll(/<span data-trait="(\w+)" style="([^"]*)"><\/span>/g)].map(m => { const s = declarations(m[2]); return [m[1], s.left, s.width, s.background]; }) : null;
};
const HACHURES_MAIN = 'repeating-linear-gradient(135deg, var(--o-text3) 0 5px, color-mix(in srgb, var(--o-text3) 55%, transparent) 5px 10px)';

test('Historique (3d) : « 24 h » · « 7 jours », les Puces de la fiche dans le puits, sur toute la largeur — le choix se garde tant que la fiche est ouverte', () => {
  const html = rendre({ ongletDepart: 'historique' });
  const g = /<div class="rb-histo" style="gap:12px"><div role="group" aria-label="Période" style="([^"]*)">((?:<button\b[^>]*>[^<]*<\/button>)+)<\/div>/.exec(html);
  assert.ok(g, 'les Puces de la période, en tête de l’onglet');
  assert.deepEqual(declarations(g[1]), { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '4px', padding: '4px', 'border-radius': '12px', background: 'var(--o-well)' });
  const p = [...g[2].matchAll(/<button type="button" aria-pressed="(true|false)" style="([^"]*)">([^<]*)<\/button>/g)].map(m => [m[3], m[1], declarations(m[2]).background]);
  assert.deepEqual(p, [['24 h', 'true', 'var(--o-accent-fond)'], ['7 jours', 'false', 'transparent']]);
  // Le choix vit dans la fiche, pas dans l'onglet : il survit à un passage par l'Accueil.
  const f = SOURCE.slice(SOURCE.indexOf('export default function FicheChauffageContent('));
  const i = f.indexOf("const [periode, setPeriode] = useState('24h');");
  assert.ok(i > 0 && i < f.indexOf('if (!ch) return null;'), 'gardé par la fiche, avant tout retour');
  assert.ok(f.includes('<OngletHistorique hass={hass} ch={ch} sonde={sonde} minute={minute} periode={periode} onPeriode={setPeriode} t={t} />'));
  /* Joué : un appui change la période ; la lecture suit. ASSERTIONS MODIFIÉES
   * (relecture de la partie D, point 2) : l'onglet ne lit plus lui-même —
   * ses données, un enfant gardé par la période (`DonneesHistorique`), si :
   * on le déplie pour voir ses lectures. */
  const vus = [];
  const props = { hass: maison(), ch: radiateur(), sonde: SONDE, minute: [0, 1140], t: MAINTENANT };
  const j = jouer('OngletHistorique', { ...props, periode: '24h', onPeriode: (x) => vus.push(x) }, { historique: [] });
  chercher(j.arbre, el => el.type === j.F.Puces)[0].props.onChoisir('7j');
  assert.deepEqual(vus, ['7j']);
  const lectures = (periode) => {
    const k = jouer('OngletHistorique', { ...props, periode }, { historique: [] });
    deplier(k, 'DonneesHistorique');
    return k.lectures.map(o => o.jours);
  };
  assert.deepEqual(lectures('24h'), [1, 1], 'un jour : la sonde et l’appareil');
  assert.deepEqual(lectures('7j'), [7, 7], 'sept jours');
});

test('Historique (3d) : la courbe de la pièce — « Température », min · max, les trois repères, le SVG de 400 × 120 étiré, ses filets, son aire, la mesure', () => {
  const { html, lectures } = rendreHistorique(parLecture(LU_SONDE, LU_MODULE));
  // Lues : la sonde de la pièce, puis l'appareil — sur un jour.
  assert.deepEqual(lectures[0], { ids: [SONDE.id], idsAttributs: [], jours: 1 });
  assert.deepEqual({ ...lectures[1], cle: null }, { ids: [MODULE], idsAttributs: [], jours: 1, cle: null });
  assert.ok(lectures[1].cle.startsWith('comfort|'), 'relu quand l’appareil change de mode');
  const c = panneau(html, 'courbe');
  assert.ok(c, 'le panneau de la courbe');
  assert.deepEqual(c.style, { ...PANNEAU_MAQUETTE, padding: '16px 16px 14px' });
  assert.ok(c.corps.startsWith('<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">'
    + '<div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--o-text3)">Température</div>'
    + '<div style="font-size:11.5px;font-weight:700;color:var(--o-text2)">min 19,4° · max 21,2°</div></div>'), c.corps.slice(0, 400));
  // 14 px plus bas, 34 px à gauche : les repères — haut, milieu, bas — dans une colonne de 28 px, alignés à droite.
  assert.ok(c.corps.includes('<div style="position:relative;margin-top:14px;padding-left:34px">'
    + '<div aria-hidden="true" style="position:absolute;left:0;top:0;height:120px;width:28px;font-size:10.5px;font-weight:700;color:var(--o-text3)">'
    + '<span style="position:absolute;right:0;top:-7px">23°</span><span style="position:absolute;right:0;top:53px">21°</span><span style="position:absolute;right:0;top:113px">19°</span></div>'));
  // Le SVG, étiré ; trois filets ; l'aire ; la mesure.
  const svg = /<svg aria-hidden="true" viewBox="0 0 400 120" preserveAspectRatio="none" style="display:block;width:100%;height:120px;overflow:visible">([\s\S]*?)<\/svg>/.exec(c.corps);
  assert.ok(svg, 'le SVG');
  const chemins = [...svg[1].matchAll(/<path (?:data-(\w+)="" )?d="([^"]*)" style="([^"]*)"><\/path>/g)].map(m => ({ nom: m[1] || '', d: m[2], style: declarations(m[3]) }));
  assert.deepEqual(chemins.map(x => x.nom), ['', '', 'mesure'], 'les filets, l’aire, la mesure — pas de consigne pour un fil pilote');
  assert.deepEqual([chemins[0].d, chemins[0].style], ['M0 0.5H400M0 60H400M0 119.5H400', { fill: 'none', stroke: 'var(--o-bd1)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' }]);
  assert.deepEqual(chemins[1].style, { fill: 'var(--o-s1)' });
  assert.deepEqual(chemins[2].style, { fill: 'none', stroke: 'var(--o-text1)', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
  /* La mesure en escalier, un point par quart d'heure : 19,8 (Y 96), 19,4 dès
   * il y a 20 h (Y 108), 21,2 dès il y a 5 h (Y 54), un trou d'il y a 3 h à
   * 2 h, 20,6 (Y 72) — et la valeur du moment au bout, 19,46 (Y 106,2). */
  const mesure = chemins[2].d;
  assert.ok(mesure.startsWith('M0.0 96.0L4.2 96.0'), mesure.slice(0, 40));
  assert.ok(mesure.includes('L62.5 96.0L66.7 108.0') && mesure.includes('L312.5 108.0L316.7 54.0'));
  assert.deepEqual(mesure.match(/M[\d.]+ [\d.]+/g), ['M0.0 96.0', 'M366.7 72.0'], 'le trou coupe la ligne');
  assert.ok(mesure.endsWith('L395.8 72.0L400.0 106.2'), 'la valeur du moment au bout');
  assert.equal((mesure.match(/[ML]/g) || []).length, 97 - 4, '97 quarts d’heure, moins les quatre du trou');
  // L'aire : chaque morceau fermé jusqu'en bas.
  assert.ok(chemins[1].d.includes('L345.8 54.0L345.8 120L0.0 120Z') && chemins[1].d.endsWith('L400.0 106.2L400.0 120L366.7 120Z'), chemins[1].d.slice(-80));
});

test('Historique (3d) : la bande des modes appliqués — l’Arrêt laissé vide, « à la main » hachurée — et « il y a 24 h · il y a 12 h · maintenant »', () => {
  const c = panneau(rendreHistorique(parLecture(LU_SONDE, LU_MODULE)).html, 'courbe');
  // 8 px sous la courbe : la bande de 6 px, arrondie 3, sur le gris doux.
  const b = /<\/svg><div aria-hidden="true" data-bande-histo="" style="([^"]*)">/.exec(c.corps);
  assert.ok(b, 'la bande, sous le SVG');
  assert.deepEqual(declarations(b[1]), { position: 'relative', height: '6px', 'margin-top': '8px', 'border-radius': '3px', background: 'var(--o-s1)' });
  assert.deepEqual(traitsDe(c.corps), [
    ['eco', '0.00%', '47.92%', 'var(--o-purple)'],
    ['confort', '47.92%', '8.33%', 'var(--o-warn2)'],
    ['eco', '56.25%', '14.58%', 'var(--o-purple)'],
    ['confort_1', '75.00%', '6.25%', 'rgba(var(--o-warn2-rgb),.7)'],
    ['confort_2', '84.38%', '7.29%', 'rgba(var(--o-warn2-rgb),.45)'],
    ['main', '91.67%', '8.33%', HACHURES_MAIN],
  ], 'le trou et l’Arrêt laissés vides');
  const styles = [...c.corps.matchAll(/<span data-trait="\w+" style="([^"]*)">/g)].map(m => declarations(m[1]));
  assert.ok(styles.length === 6 && styles.every(s => s.position === 'absolute' && s.top === '0' && s.bottom === '0' && s['border-radius'] === '3px'));
  // 8 px dessous, le temps : il y a 24 h, il y a 12 h, maintenant.
  assert.ok(c.corps.includes('<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;font-weight:700;color:var(--o-text3)">'
    + '<span>il y a 24 h</span><span>il y a 12 h</span><span>maintenant</span></div>'));
});

test('Historique (3d) : le temps par mode — « sur 24 h », la barre de 10 px de l’Arrêt au Confort, la légende en deux colonnes, les durées de la maquette', () => {
  const { html } = rendreHistorique(parLecture(LU_SONDE, LU_MODULE));
  const t = panneau(html, 'temps');
  assert.ok(t, 'le panneau du temps');
  assert.deepEqual(t.style, { ...PANNEAU_MAQUETTE, padding: '16px 18px' });
  assert.ok(html.indexOf('data-panneau="courbe"') < html.indexOf('data-panneau="temps"'), 'sous la courbe');
  assert.ok(t.corps.startsWith('<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">'
    + '<div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--o-text3)">Temps par mode</div>'
    + '<div style="font-size:11.5px;font-weight:700;color:var(--o-text2)">sur 24 h</div></div>'), t.corps.slice(0, 300));
  // La barre : 10 px, écart 2, arrondi 5, débord caché ; une part par mode vu, de l'Arrêt au Confort, puis « à la main ».
  const barre = /<div aria-hidden="true" style="display:flex;gap:2px;height:10px;margin-top:12px;border-radius:5px;overflow:hidden">((?:<span style="[^"]*"><\/span>)+)<\/div>/.exec(t.corps);
  assert.ok(barre, 'la barre');
  assert.deepEqual([...barre[1].matchAll(/style="flex:([\d.]+);background:([^"]*)"/g)].map(m => [Number(m[1]), m[2]]), [
    [45, 'var(--o-text3)'], [900, 'var(--o-purple)'], [105, 'rgba(var(--o-warn2-rgb),.45)'], [90, 'rgba(var(--o-warn2-rgb),.7)'], [120, 'var(--o-warn2)'], [120, HACHURES_MAIN],
  ]);
  // La légende : deux colonnes ; le point, le mot, la durée en 800 — « 1 h 30 », « 45 min », « 15 h ».
  assert.ok(t.corps.includes('<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:10px 18px;margin-top:14px">'));
  const parts = [...t.corps.matchAll(/<div data-part="(\w+)" style="([^"]*)"><span aria-hidden="true" style="([^"]*)"><\/span><span style="([^"]*)">([^<]*)<\/span><span style="([^"]*)">([^<]*)<\/span><\/div>/g)];
  assert.deepEqual(parts.map(m => [m[1], m[5], m[7]]), [['arret', 'Arrêt', '45 min'], ['eco', 'Éco', '15 h'], ['confort_2', 'Confort −2', '1 h 45'],
    ['confort_1', 'Confort −1', '1 h 30'], ['confort', 'Confort', '2 h'], ['main', 'À la main', '2 h']]);
  for (const m of parts) {
    assert.deepEqual(declarations(m[2]), { display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12.5px', 'font-weight': '700' });
    const point = declarations(m[3]);
    assert.deepEqual([point.width, point.height, point['border-radius'], point['flex-shrink']], ['8px', '8px', '50%', '0']);
    const mot = declarations(m[4]);
    assert.deepEqual([mot.flex, mot['min-width'], mot.color], ['1', '0', 'var(--o-text1)']);
    assert.deepEqual(declarations(m[6]), { 'font-weight': '800' });
  }
  assert.equal(declarations(parts[3][3]).background, 'rgba(var(--o-warn2-rgb),.7)', 'la couleur du mode n’est qu’un point');
  // Les durées de la maquette (`fmtDur`) : une seule écriture, celle des robots, dans les phrases du catalogue.
  assert.ok(/import \{[^}]*\bdureeLisible\b[^}]*\} from '\.\/robots\.js';/.test(SOURCE));
});

test('Historique (3d) : un thermostat — sa consigne en tirets, en ESCALIER, coupée quand il est éteint ou sans consigne ; la bande et le temps de CHAUFFE', () => {
  const { html, lectures } = rendreHistorique(parLecture([], LU_POELE), { ch: poele(), sonde: { id: POELE, attribut: 'current_temperature' } });
  // Il se mesure lui-même : UNE lecture avec ses attributs — la pièce, la consigne, ce qu'il fait.
  assert.deepEqual([lectures[0].ids, lectures[0].idsAttributs], [[], []], 'la sonde : c’est lui');
  assert.deepEqual([lectures[1].ids, lectures[1].idsAttributs, lectures[1].jours], [[], [POELE], 1]);
  const c = panneau(html, 'courbe');
  // L'échelle tient la pièce ET la consigne : 17 descend à 16, 21 monte à 22.
  assert.ok(c.corps.includes('>min 18,5° · max 21,0°<'));
  assert.ok(c.corps.includes('<span style="position:absolute;right:0;top:-7px">22°</span><span style="position:absolute;right:0;top:53px">19°</span><span style="position:absolute;right:0;top:113px">16°</span>'));
  const sp = /<path data-consigne="" d="([^"]*)" style="([^"]*)"><\/path><path data-mesure=""/.exec(c.corps);
  assert.ok(sp, 'la consigne, sous la mesure');
  assert.deepEqual(declarations(sp[2]), { fill: 'none', stroke: 'var(--o-warn2)', 'stroke-width': '1.5', 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' });
  /* 17 (Y 100) jusqu'à il y a 18 h, puis la marche à 20,5 (Y 30) ; coupée à
   * l'Arrêt (il y a 10 h), reprise à 21 (Y 20) ; coupée sans consigne (il y a
   * 6 h) puis muet ; reprise à 21, et la consigne du moment au bout (20,5). */
  assert.ok(sp[1].startsWith('M0.0 100.0L4.2 100.0L4.2 100.0'), sp[1].slice(0, 60));
  assert.ok(sp[1].includes('L100.0 100.0L100.0 30.0'), 'la marche');
  assert.deepEqual(sp[1].match(/M[\d.]+ [\d.]+/g), ['M0.0 100.0', 'M266.7 20.0', 'M366.7 20.0'], 'éteint, sans consigne, muet : coupée');
  assert.ok(sp[1].endsWith('L400.0 20.0L400.0 30.0'), 'la consigne du moment');
  // La bande : la CHAUFFE, à l'orange ; le reste vide.
  assert.deepEqual(traitsDe(c.corps), [['chauffe', '0.00%', '41.67%', 'var(--o-warn2)'], ['chauffe', '66.67%', '8.33%', 'var(--o-warn2)']]);
  // Le temps de chauffe : « 12 h sur 24 h » ; Chauffe et Sans chauffe — un trou ne compte nulle part.
  const t = panneau(html, 'temps');
  assert.ok(t.corps.includes('>Temps de chauffe</div><div style="font-size:11.5px;font-weight:700;color:var(--o-text2)">12 h sur 24 h</div>'));
  assert.deepEqual([...t.corps.matchAll(/style="flex:([\d.]+);background:([^"]*)"/g)].map(m => [Number(m[1]), m[2]]), [[720, 'var(--o-warn2)'], [480, 'var(--o-bd1)']]);
  assert.deepEqual([...t.corps.matchAll(/<div data-part="(\w+)"[^>]*><span aria-hidden="true" style="([^"]*)"><\/span><span [^>]*>([^<]*)<\/span><span [^>]*>([^<]*)<\/span><\/div>/g)]
    .map(m => [m[1], declarations(m[2]).background, m[3], m[4]]), [['chauffe', 'var(--o-warn2)', 'Chauffe', '12 h'], ['sans', 'var(--o-bd1)', 'Sans chauffe', '8 h']]);
  // Un fil pilote n'a pas de consigne ; un VTherm non plus — sa bande, ce sont ses préréglages.
  assert.ok(!rendreHistorique(parLecture(LU_SONDE, LU_MODULE)).html.includes('data-consigne'));
  const presets = [[
    { entity_id: VTHERM, state: 'heat', attributes: { preset_mode: 'eco', current_temperature: 19.5 }, last_changed: ilYA(30), last_updated: ilYA(30) },
    { state: 'heat', attributes: { preset_mode: 'comfort', current_temperature: 20.5 }, last_changed: ilYA(30), last_updated: ilYA(6) },
  ]];
  const v = rendreHistorique(parLecture([], presets), { ch: vtherm(), sonde: { id: VTHERM, attribut: 'current_temperature' } }).html;
  assert.ok(!v.includes('data-consigne') && v.includes('>Temps par mode<'));
  assert.deepEqual(traitsDe(v).map(x => x[0]), ['eco', 'confort']);
});

test('Historique (3d) : sur 7 jours — « lundi dernier · vendredi · maintenant » à l’horloge de la maison, un point par heure, « sur 7 jours »', () => {
  const { html, lectures } = rendreHistorique(parLecture(LU_SONDE, LU_MODULE), { periode: '7j' });
  assert.deepEqual(lectures.map(o => o.jours), [7, 7]);
  // Lundi 19:00 à la maison : il y a sept jours, lundi dernier ; au milieu (il y a 84 h), vendredi.
  assert.ok(html.includes('><span>lundi dernier</span><span>vendredi</span><span>maintenant</span></div>'));
  // Un dimanche 23:00 : dimanche dernier, et jeudi au milieu.
  assert.ok(rendreHistorique(parLecture(LU_SONDE, LU_MODULE), { periode: '7j', minute: [6, 1380] }).html
    .includes('><span>dimanche dernier</span><span>jeudi</span><span>maintenant</span></div>'));
  // La pièce : un point par heure (169 sur la période) — la sonde ne dit rien avant il y a 30 h.
  const mesure = /<path data-mesure="" d="([^"]*)"/.exec(html)[1];
  assert.ok(mesure.startsWith('M328.6 '), mesure.slice(0, 20));
  assert.equal((mesure.match(/[ML]/g) || []).length, 30, 'les 31 heures d’il y a 30 h à maintenant, moins celle du trou');
  // Le temps : « sur 7 jours ».
  assert.ok(html.includes('>Temps par mode</div><div style="font-size:11.5px;font-weight:700;color:var(--o-text2)">sur 7 jours</div>'));
  // Des phrases ENTIÈRES au catalogue : sept « … dernier », pas un mot collé (« domenica scorsa »).
  // ASSERTION MODIFIÉE (25/10, le doublon avec les volets) : la liste vit dans fichecommune.jsx, une seule copie pour les deux fiches.
  const communeJours = readFileSync(new URL('../src/fichecommune.jsx', import.meta.url), 'utf8');
  assert.ok(communeJours.includes("tr('lundi dernier'), tr('mardi dernier'), tr('mercredi dernier'), tr('jeudi dernier'), tr('vendredi dernier'), tr('samedi dernier'), tr('dimanche dernier')"));
  assert.ok(/JOURS_DERNIERS,\s*\} from '\.\/fichecommune\.jsx';/.test(SOURCE), 'la fiche du chauffage prend la liste commune');
  assert.ok(!SOURCE.includes("const JOURS_DERNIERS ="), 'plus de copie dans la fiche du chauffage');
});

test('Historique : un trou reste un trou — pas encore lu, illisible, vide, sans sonde : les mots de la fiche, rien d’inventé', () => {
  const vide = (lu, props) => rendreHistorique(lu, props).html;
  const message = (html) => { const m = /<div data-vide="" style="([^"]*)">([^<]*)<\/div>/.exec(html); return m ? m[2] : null; };
  // Pas encore lu, illisible : la courbe le dit à sa place, et rien d'autre ne se dessine.
  for (const [lu, mot] of [[null, 'Chargement…'], ['erreur', 'Historique indisponible pour le moment']]) {
    const h = vide(lu);
    assert.equal(message(h), mot);
    assert.ok(!h.includes('<svg') && !h.includes('>min ') && !h.includes('data-trait') && !h.includes('il y a 24 h'), mot);
  }
  assert.deepEqual(declarations(/<div data-vide="" style="([^"]*)">/.exec(vide(null))[1]),
    { height: '120px', display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'text-align': 'center', 'font-size': '13px', 'font-weight': '600', color: 'var(--o-text2)', 'line-height': '1.5' },
    'à la hauteur de la courbe');
  // L'appareil illisible se dit dans son panneau ; pas encore lu, son panneau attend.
  assert.ok(/data-panneau="temps"[\s\S]*>Historique indisponible pour le moment</.test(vide('erreur')), 'l’échec de l’appareil, dit');
  assert.ok(!vide(null).includes('data-panneau="temps"'));
  // Vide : « Pas d'historique sur 24 h » — sur 7 jours, la sienne ; ni courbe, ni temps inventé.
  for (const lu of [[], [[]]]) {
    const h = vide(lu);
    assert.equal(message(h), 'Pas d&#x27;historique sur 24 h');
    assert.ok(!h.includes('<svg') && !h.includes('data-panneau="temps"') && !h.includes('data-trait'), JSON.stringify(lu));
  }
  // ASSERTION MODIFIÉE (relecture de la partie D, point 8) : l'apostrophe DROITE de la clé sœur « Pas d'historique sur 24 h ».
  assert.equal(message(vide([], { periode: '7j' })), 'Pas d&#x27;historique sur 7 jours');
  // Sans sonde : la pièce ne se dit pas, la bande et le temps de l'appareil, si.
  const sansSonde = rendreHistorique(parLecture(LU_SONDE, LU_MODULE), { sonde: null });
  assert.equal(message(sansSonde.html), 'Pas d&#x27;historique sur 24 h');
  assert.ok(sansSonde.html.includes('data-trait="eco"') && sansSonde.html.includes('data-panneau="temps"') && sansSonde.html.includes('<span>maintenant</span>'));
  assert.deepEqual([sansSonde.lectures[0].ids, sansSonde.lectures[0].idsAttributs], [[], []], 'rien à lire pour la pièce');
  // La pièce lue, l'appareil pas encore : la courbe, la bande vide, et le temps qui attend.
  const enRoute = vide(parLecture(LU_SONDE, null));
  assert.ok(enRoute.includes('<path data-mesure=""') && enRoute.includes('data-bande-histo') && !enRoute.includes('data-trait') && !enRoute.includes('data-panneau="temps"'));
  // Un chauffage introuvable n'a plus d'appareil à relire.
  assert.deepEqual(rendreHistorique([], { ch: radiateur({ entite: null, avertissements: ['introuvable'] }) }).lectures[1], { ids: [], idsAttributs: [], jours: 1, cle: '' });
  // La barre de la carte et le titre « Modes appliqués · 24 h » sont partis avec la maquette.
  assert.ok(!/<BarrePlanning\b|from '\.\/barreplanning\.jsx'/.test(SOURCE) && !SOURCE.includes("tr('Modes appliqués · 24 h')"));
});

/* ════════════ La seconde relecture de la partie B, côté écran (prise à la tâche 10 bis D) ════════════ */

test('(a) la fenêtre hors du planning : « À l’ouverture : Arrêt » seulement si la règle agira — ni en observation de la règle, ni pour un appareil sans Arrêt', () => {
  const ligne = (html) => { const m = /<div data-rangee="fenetre" style="[^"]*">([\s\S]*?)<\/div><(?:div|button) [^>]*data-rangee=/.exec(html); return m ? m[1] : null; };
  // Planning éteint, la règle veille et agit : elle coupera.
  assert.ok(ligne(rendre({ ch: radiateur({ planning: false }) })).includes('>À l’ouverture : Arrêt<'));
  assert.ok(ligne(rendre({ ch: radiateur({ planning: false }), etat: etat({ fenetres_observe: false }) })).includes('>À l’ouverture : Arrêt<'));
  // La règle en « Observer sans agir » : elle ne coupera rien — pas de sous-titre.
  const obs = ligne(rendre({ ch: radiateur({ planning: false }), etat: etat({ fenetres_observe: true }) }));
  assert.ok(obs && !obs.includes('À l’ouverture') && obs.includes('>Fermée<'), obs);
  // Un appareil qui ne comprend pas l'Arrêt (un poêle sans `off`) : la règle ne sait pas le couper — pas de sous-titre.
  const sansOff = ligne(rendre({ ch: poele({ modes: ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel'] }), sonde: null }));
  assert.ok(sansOff && !sansOff.includes('À l’ouverture') && sansOff.includes('>Fermée<'), sansOff);
  // Le moteur en observation, la règle non : c'est elle qui garde la main (`pilote`, chauffage.py) — elle coupera.
  assert.ok(ligne(rendre({ ch: radiateur(), etat: etat({ simulation: true, fenetres_observe: false }) })).includes('>À l’ouverture : Arrêt<'));
  // « Observer sans agir » pour toute la maison : rien de promis.
  assert.ok(!ligne(rendre({ ch: radiateur(), etat: etat({ simulation: true, fenetres_observe: true }) })).includes('À l’ouverture'));
});

test('(b) « Ouverte » ou « Fermée » : l’ouvrant tel qu’il est (`ouvrant_ouvert`), à défaut le fait de la règle ; « arrêt automatique » reste au fait', () => {
  const valeur = (html) => { const m = /data-rangee="fenetre"[\s\S]*?color:var\(--o-(warn|ok)\)">(Ouverte|Fermée)</.exec(html); return m ? [m[2], m[1]] : null; };
  // La fenêtre vient de s'ouvrir : l'ouvrant le dit tout de suite, la règle attend son délai — le haut ne dit pas encore l'arrêt.
  const vient = rendre({ ch: radiateur({ ouvrant_ouvert: true, fenetre_ouverte: false }) });
  assert.deepEqual(valeur(vient), ['Ouverte', 'warn']);
  assert.equal(grandDe(vient).sous, 'Planning · jusqu’à 23:00');
  /* L'ouvrant dit « fermé », la règle tient encore la coupure : « Ouverte », comme le haut.
   * ASSERTION MODIFIÉE (relecture de la partie D, point 4) : ce cas s'appelait « refermée, la
   * coupure pas encore rendue » et attendait « Fermée » au vert — mais un capteur d'ouvrant MUET
   * se lit `false`, et la règle garde la coupure : la rangée disait « Fermée » sous un haut qui
   * disait l'arrêt. `ouverte` = l'ouvrant OU le fait de la règle. */
  const tenue = rendre({ ch: radiateur({ mode: 'arret', source: 'fenetre', fin: null, ouvrant_ouvert: false, fenetre_ouverte: true }) });
  assert.deepEqual(valeur(tenue), ['Ouverte', 'warn']);
  assert.equal(grandDe(tenue).sous, 'Fenêtre ouverte · arrêt automatique');
  // Les deux fermés : « Fermée ».
  assert.deepEqual(valeur(rendre({ ch: radiateur({ ouvrant_ouvert: false, fenetre_ouverte: false }) })), ['Fermée', 'ok']);
  // Un serveur d'avant (sans `ouvrant_ouvert`) : le fait.
  assert.deepEqual(valeur(rendre({ ch: radiateur({ fenetre_ouverte: true }) })), ['Ouverte', 'warn']);
  assert.deepEqual(valeur(rendre({ ch: radiateur({ ouvrant_ouvert: null, fenetre_ouverte: true }) })), ['Ouverte', 'warn'], 'null : pas de mesure, le fait');
  // La rangée n'existe que si l'un des deux est un booléen.
  assert.ok(rangeesDe(rendre({ ch: radiateur({ ouvrant_ouvert: true, fenetre_ouverte: null }) })).includes('fenetre'));
  assert.ok(!rangeesDe(rendre({ ch: radiateur({ ouvrant_ouvert: null, fenetre_ouverte: null }) })).includes('fenetre'));
  assert.ok(!rangeesDe(rendre({ ch: radiateur({ ouvrant_ouvert: 'oui', fenetre_ouverte: undefined }) })).includes('fenetre'));
});

test('(d) « Reprendre le planning · {mode} » et « Prochain changement · {mode} » disent le mode APPLIQUÉ — un module sans Éco reçoit son Hors-gel', () => {
  const SANS_ECO = ['confort', 'confort_1', 'confort_2', 'hors_gel', 'arret'];
  // 19:00, le Confort jusqu'à 23:00, puis l'Éco — que ce module reçoit en Hors-gel.
  const html = rendre({ ch: radiateur({ modes: SANS_ECO, jour: JOUR_CHAMBRE }) });
  assert.ok(/data-rangee="prochain"[\s\S]*?background:var\(--o-cyan\)[^"]*"><\/span><span style="min-width:0;overflow-wrap:anywhere">23:00 · Hors-gel</.test(html), 'tel qu’il arrivera');
  // Une reprise à 10:00, dans l'Éco du planning : le planning repris, c'est son Hors-gel.
  const r = { mode: 'confort', temperature: null, fin: '2026-10-12T18:00:00+02:00', depuis: '2026-10-12T10:00:00+02:00', par: 'u1' };
  const matin = etat({ maintenant: '2026-10-12T10:00:00+02:00', minute: [0, 600] });
  const enReprise = (o) => rendre({ ch: radiateur({ mode: 'confort', source: 'main', fin: r.fin, reprise: r, jour: JOUR_CHAMBRE, ...o }), etat: matin });
  assert.ok(enReprise({ modes: SANS_ECO }).includes('<span>Reprendre le planning · Hors-gel</span>'), 'pas « · Éco » : il ne la reçoit pas');
  // Témoins : un module qui comprend l'Éco.
  assert.ok(enReprise({}).includes('<span>Reprendre le planning · Éco</span>'));
  assert.ok(rendre({ ch: radiateur({ jour: JOUR_CHAMBRE }) }).includes('>23:00 · Éco<'));
  // Le jumeau de `mode_applicable`, tenu égal au serveur par tests/chauffageplanning.test.mjs.
  assert.ok(/import \{[^}]*\bmodeApplique\b[^}]*\} from '\.\/chauffageplanning\.js';/.test(SOURCE));
});

test('(e) un appareil qui ne s’éteint pas : la puce « arret » reste CHOISIE, nommée de ce qu’il reçoit (« Hors-gel »)', () => {
  const SANS_OFF = ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel'];
  const deplie = (ch) => renderToStaticMarkup(jouer('OngletAccueil', accueil({ ch, sonde: null }), { noms: ['err', 'fenetre'], etats: { fenetre: true } }).arbre);
  const reglage = (ch) => groupe(deplie(ch), 'fenetre').puces.map(p => [p.mot, p.presse]);
  const auPlanning = { planning: true, semaine: SEMAINE, mode: 'eco', source: 'planning', fin: '2026-10-12T23:00:00+02:00' };
  const sansOff = (o) => poele({ ...auPlanning, modes: SANS_OFF, ...o });
  assert.deepEqual(reglage(sansOff({ fenetre: 'arret', fenetre_mode: 'hors_gel' })), [['Hors-gel', 'true'], ['Éco', 'false'], ['Ne rien faire', 'false']]);
  /* Réglé autrement, la puce reste : le Hors-gel à l'ouverture reste atteignable. ASSERTION
   * MODIFIÉE (relecture de la partie D, point 3) : elle attendait [Éco, Ne rien faire] — la puce
   * « Hors-gel » disparaissait dès qu'on la quittait, et l'on ne pouvait plus y revenir. Elle se
   * nomme TOUJOURS par le jumeau (`modeApplique(ch, 'arret')`), quel que soit le réglage. */
  assert.deepEqual(reglage(sansOff({ fenetre: 'eco', fenetre_mode: 'eco' })), [['Hors-gel', 'false'], ['Éco', 'true'], ['Ne rien faire', 'false']]);
  assert.deepEqual(reglage(sansOff({ fenetre: 'rien', fenetre_mode: null })), [['Hors-gel', 'false'], ['Éco', 'false'], ['Ne rien faire', 'true']]);
  // Sans Hors-gel non plus, le jumeau lui donne l'Éco : la puce Éco le dit, choisie — pas deux « Éco ».
  assert.deepEqual(reglage(sansOff({ modes: ['confort', 'eco'], fenetre: 'arret', fenetre_mode: 'eco' })), [['Éco', 'true'], ['Ne rien faire', 'false']]);
  assert.ok(SOURCE.includes("modeApplique(ch, 'arret')"), 'le nom vient du jumeau, pas du réglage en cours');
  // Témoin : un appareil qui s'éteint.
  assert.deepEqual(reglage(poele({ ...auPlanning, fenetre: 'arret', fenetre_mode: 'arret' })), [['Arrêt', 'true'], ['Éco', 'false'], ['Ne rien faire', 'false']]);
  // Pliée, la rangée dit la même chose.
  assert.ok(rendre({ ch: sansOff({ fenetre: 'arret', fenetre_mode: 'hors_gel' }), sonde: null }).includes('>À l’ouverture : Hors-gel<'));
});

/* ════════════ Relecture de la partie D (12/10) : les corrections ════════════ */

test('l’Historique pèse peu : la réponse datée UNE fois, le calcul sur « maintenant » arrondi au pas, et sur 7 jours plus de relecture à chaque changement', () => {
  const props = { hass: maison(), ch: radiateur(), sonde: SONDE, minute: [0, 1140], periode: '24h', t: MAINTENANT };
  const joue = (o = {}, historique = parLecture(LU_SONDE, LU_MODULE)) => jouer('DonneesHistorique', { ...props, ...o }, { historique });
  /* Les crochets de calcul : dater chaque réponse (une dépendance : la réponse), puis UN calcul
   * dont les dépendances sont des valeurs — jamais un objet qui change d'identité à chaque lecture
   * (le chauffage du moteur toutes les 15 s, l'état de l'appareil à chaque mise à jour). */
  const j = joue();
  assert.equal(j.memos.length, 3, 'dater la réponse de l’appareil, celle de la sonde, puis calculer');
  const [dApp, dSonde, calcul] = j.memos;
  assert.deepEqual([dApp.length, dSonde.length], [1, 1], 'datées : une dépendance, la réponse');
  assert.ok(calcul.every(d => d === null || typeof d !== 'object' || Array.isArray(d.liste)), 'un objet changeant parmi les dépendances du calcul');
  assert.ok(SOURCE.includes('const dateesAppareil = useMemo(() => dater(premiere(luAppareil)), [luAppareil]);'));
  // « Maintenant » arrondi au pas de la courbe : un quart d'heure sur 24 h, une heure sur 7 jours.
  const fin = (o) => joue(o).memos[2].find(d => typeof d === 'number' && d > 1e12);
  assert.equal(fin({ t: MAINTENANT + 7 * 60000 }), MAINTENANT, '19:07 : le calcul s’arrête à 19:00');
  assert.equal(fin({ t: MAINTENANT + 16 * 60000 }), MAINTENANT + 15 * 60000);
  assert.equal(fin({ t: MAINTENANT + 59 * 60000, periode: '7j' }), MAINTENANT, 'sur 7 jours, à l’heure');
  // La courbe s'arrête au pas, et finit sur la valeur du moment.
  const tard = renderToStaticMarkup(joue({ t: MAINTENANT + 7 * 60000 }).arbre);
  assert.ok(/<path data-mesure="" d="[^"]*L400\.0 106\.2"/.test(tard), 'la valeur du moment, au dernier pas');
  // Sur 24 h, l'appareil se relit à chaque changement de mode ; sur 7 jours, jamais : l'état vivant ferme la période.
  const cle = (periode) => joue({ periode }).lectures[1].cle;
  assert.ok(cle('24h').startsWith('comfort|'));
  assert.equal(cle('7j'), '', 'sept jours de lignes ne se relisent pas à chaque geste');
});

test('passer de 24 h à 7 jours REMONTE les données : « Chargement… », jamais l’ancienne réponse sous les mots de 7 jours ; les Puces restent', () => {
  const props = { hass: maison(), ch: radiateur(), sonde: SONDE, minute: [0, 1140], t: MAINTENANT };
  const onglet = (periode) => jouer('OngletHistorique', { ...props, periode });
  const j24 = onglet('24h'), j7 = onglet('7j');
  // L'onglet : les Puces, puis les données — gardées par la période. Une clé neuve, une instance neuve : ses lectures repartent de rien.
  const enfants = (j) => [].concat(j.arbre.props.children).filter(Boolean);
  assert.deepEqual(enfants(j24).map(el => [el.type === j24.F.Puces ? 'Puces' : el.type === j24.F.DonneesHistorique ? 'Donnees' : '?', el.key]),
    [['Puces', null], ['Donnees', '24h']]);
  assert.deepEqual(enfants(j7).map(el => el.key), [null, '7j'], 'les Puces, à la même place et sans clé, restent montées — et gardent le focus');
  assert.deepEqual([j24.lectures.length, j7.lectures.length], [0, 0], 'l’onglet lui-même ne lit rien : l’état des lectures vit dans l’enfant remonté');
  // L'enfant de 7 jours, neuf : rien n'est encore lu — « Chargement… », pas la journée d'avant.
  const neuf = renderToStaticMarkup(jouer('DonneesHistorique', enfants(j7)[1].props, { historique: null }).arbre);
  assert.ok(neuf.includes('>Chargement…<') && !neuf.includes('<svg') && !neuf.includes('>min ') && !neuf.includes('data-trait'), neuf.slice(0, 300));
  // Rendu par React : la période passe à l'enfant, et ses lectures sont celles de 7 jours.
  const { html, lectures } = rendreHistorique(null, { periode: '7j' });
  assert.ok(html.includes('>Chargement…<') && lectures.length === 2 && lectures.every(o => o.jours === 7));
  // Le crochet partagé ne change pas.
  const commune = readFileSync(new URL('../src/fichecommune.jsx', import.meta.url), 'utf8');
  assert.ok(commune.includes("export function useHistoriquePeriode(hass, { ids = [], idsAttributs = [], jours = 10, cle = '' } = {}) {"));
});

test('le haut n’attribue pas l’arrêt à la règle des fenêtres quand elle OBSERVE : le serveur pose le fait « ouverte » même en observation', () => {
  const coupe = maison({ states: [st(MODULE, 'off', { options: NODON })] });
  const observe = etat({ fenetres_observe: true });
  // Un fil pilote planning éteint, à l'Arrêt, fenêtre ouverte : la règle observe — elle n'a rien coupé.
  const g = grandDe(rendre({ ch: radiateur({ planning: false, fenetre_ouverte: true }), etat: observe }, coupe));
  assert.deepEqual([g.texte, g.sous, g.encreSous], ['Arrêt', 'Éteint', 'var(--o-text2)']);
  // Témoin : la règle qui agit.
  assert.equal(grandDe(rendre({ ch: radiateur({ planning: false, fenetre_ouverte: true }) }, coupe)).sous, 'Fenêtre ouverte · arrêt automatique');
  // Un thermostat éteint, de même.
  const arrete = maison({ states: [st(POELE, 'off', { hvac_modes: ['off', 'heat'], hvac_action: 'off', temperature: 20.5, current_temperature: 19.2 })] });
  const t = grandDe(rendre({ ch: poele({ fenetre_ouverte: true }), sonde: null, etat: observe }, arrete));
  assert.deepEqual([t.texte, t.sous, t.encreSous], ['Éteint', 'La consigne est gardée pour le rallumage', 'var(--o-text2)']);
  // Le haut et la rangée ne se contredisent plus : la rangée dit « Ouverte », sans promettre l'arrêt.
  const ligne = /<div data-rangee="fenetre" style="[^"]*">([\s\S]*?)<\/div><(?:div|button) [^>]*data-rangee=/.exec(rendre({ ch: radiateur({ planning: false, fenetre_ouverte: true }), etat: observe }, coupe))[1];
  assert.ok(ligne.includes('>Ouverte<') && !ligne.includes('À l’ouverture'), ligne);
});

test('le prochain changement se cherche sur la semaine APPLIQUÉE : un module sans Éco, à 20:00, ne « change » pas vers le Hors-gel où il est déjà', () => {
  const SANS_ECO = ['confort', 'confort_1', 'confort_2', 'hors_gel', 'arret'];
  const soir = etat({ maintenant: '2026-10-12T20:00:00+02:00', minute: [0, 1200] });
  const html = rendre({ ch: radiateur({ semaine: BUREAU, modes: SANS_ECO, mode: 'eco', applique: 'hors_gel', fin: '2026-10-12T22:00:00+02:00' }), etat: soir });
  assert.ok(/data-rangee="prochain"[\s\S]*?background:var\(--o-warn2\)[^"]*"><\/span><span style="min-width:0;overflow-wrap:anywhere">Demain 13:30 · Confort</.test(html), 'demain 13:30, en Confort');
  // Témoin : un module qui comprend l'Éco change bien à 22:00, vers le Hors-gel.
  assert.ok(rendre({ ch: radiateur({ semaine: BUREAU, mode: 'eco', fin: '2026-10-12T22:00:00+02:00' }), etat: soir }).includes('>22:00 · Hors-gel<'));
  assert.ok(SOURCE.includes('prochainDeLaSemaine(bandesAppliquees(bandesSemaine(ch.semaine, etat && etat.maison), ch), minute[0], minute[1])'));
});

test('un thermostat qui ne dit jamais ce qu’il fait (`hvac_action`) : pas de temps de chauffe — « Chauffe 0 min » serait inventé', () => {
  const pt = (h, state, attributes) => ({ state, attributes, last_changed: ilYA(30), last_updated: ilYA(h) });
  const silencieux = [[
    { entity_id: POELE, ...pt(30, 'heat', { temperature: 20.5, current_temperature: 19.5 }) },
    pt(10, 'off', { temperature: 20.5, current_temperature: 20 }),
    pt(6, 'heat', { temperature: 20.5, current_temperature: 19.8 }),
  ]];
  // Son état vivant ne le dit pas non plus.
  const h = maison({ states: [st(POELE, 'heat', { hvac_modes: ['off', 'heat'], temperature: 20.5, current_temperature: 19.2 })] });
  const props = { ch: poele(), sonde: { id: POELE, attribut: 'current_temperature' } };
  const { html } = rendreHistorique(parLecture([], silencieux), props, h);
  assert.ok(html.includes('<path data-mesure=""') && !html.includes('data-panneau="temps"') && !html.includes('data-trait'), 'la courbe, sans temps de chauffe');
  // Une seule fois sur la période suffit : le panneau revient.
  const uneFois = [[...silencieux[0], pt(2, 'heat', { temperature: 20.5, current_temperature: 19.9, hvac_action: 'idle' })]];
  assert.ok(rendreHistorique(parLecture([], uneFois), props, h).html.includes('data-panneau="temps"'));
});
