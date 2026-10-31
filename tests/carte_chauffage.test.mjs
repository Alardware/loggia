/* La carte d'un chauffage (chantier Chauffage, plan 2 : tâche 7 ; choix 8 et
 * D9 — puis la tâche 10 bis A : les cartes « 1a » de sa maquette, choisies le
 * 11/10).
 *
 * La maquette « Cartes chauffage » : l'icône seule en haut à gauche, la
 * bascule seule à droite ; 14 px plus bas le nom et l'état — une phrase qui ne
 * redit pas le bas de la carte (son choix du 12/10, « Ne pas répéter le
 * bas ») : « jusqu’à 22:30 », « jusqu’à demain 07:30 », « sans limite »,
 * « Fenêtre ouverte » — et, à droite, la température de la pièce en grand ;
 * en bas, − et + carrés de 44 px, la valeur entre les deux — le mode d'un
 * module précédé de son point, la consigne d'un thermostat à une décimale —
 * et son étiquette dessous : Mode, Planning, Manuel, Consigne. Plus de
 * pastille AUTO, plus de barre du jour
 * (elle vit à la fiche), plus de chiffres à chasse fixe. Ses couleurs :
 * l'orange de la chauffe, le bleu du froid, l'ambre d'une fenêtre ; le rouge
 * reste aux alertes. Le cadre reste celui des cartes de la maison.
 *
 * Planning ALLUMÉ, − / + comme la bascule posent une reprise en main ;
 * planning éteint, état absent ou moteur en « Observer sans agir », elles
 * commandent l'appareil, comme avant. « Chauffe » se lit sur la puissance
 * d'un module (plus de 10 W) — sur sa carte comme au compte d'Objets. Une
 * zone décrite à la main garde ses mots.
 *
 * On REND les cartes (React côté serveur, ADR 0069) : App.jsx n'exporte que
 * l'application, un crochet de chargement leur ajoute un export sous
 * `?carte_chauffage`, pour ce fichier seul — le patron de
 * tests/lot16_thermostat_indispo.test.mjs ; le fichier n'est pas touché.
 * L'état du moteur se pose dans le cache partagé (`chauffageetat.js`), que
 * les cartes lisent au rendu. Un rendu statique ne clique pas : ce que font
 * les gestes se lit dans la source, et la reprise en main se joue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const SUFFIXE = '?carte_chauffage';
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  `  if (!url.endsWith('/src/App.jsx${SUFFIXE}')) return next(url, ctx);`,
  `  const r = await next(url.slice(0, -${SUFFIXE.length}), ctx);`,
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la paire valeur / étiquette de la grille commune, et la longueur du plus long mot (T18), s'exportent aussi.
  "  return { ...r, source: String(r.source) + ';export { RoomClimateCard, RoomPilotCard, objetsDeLaMaison, reprendreLaMain, chauffentParmi, chauffeDeZone, motLong, MOT_MODE, CvCard, CvChip, ValeurEtiquette, motLePlusLong };' };",
  '}',
].join('\n')));
const { RoomClimateCard, RoomPilotCard, objetsDeLaMaison, reprendreLaMain, chauffentParmi, chauffeDeZone, motLong, MOT_MODE, CvCard, CvChip, ValeurEtiquette, motLePlusLong } = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
const { poserEtatChauffage, reglerChauffageEtat, lireEtatChauffage } = await import('../src/chauffageetat.js');
const { SEUIL_CHAUFFE_W, etatModule, modeDuModule, consigneVoisine } = await import('../src/chauffageecran.js');
const { setLoggiaState } = await import('../src/state.js');
const { resolveClimate } = await import('../src/resolve.js');
const { area, device, entity, state, states, ctxOf } = await import('./fixtures.mjs');

const APP = MONOLITHE.replace(/\r\n/g, '\n');
const corps = (nom) => {
  const i = APP.indexOf('\nfunction ' + nom + '(');
  assert.ok(i >= 0, nom + ' a disparu');
  return APP.slice(i + 1, APP.indexOf('\n}\n', i) + 2);
};

// ── Les données ─────────────────────────────────────────────────────────────

const TOUS = ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret'];
const NODON = ['comfort', 'eco', 'frost_protection', 'off', 'comfort_-1', 'comfort_-2'];
const OPTIONS = { confort: 'comfort', confort_1: 'comfort_-1', confort_2: 'comfort_-2', eco: 'eco', hors_gel: 'frost_protection', arret: 'off' };
const LUNDI = [
  { de: 0, a: 390, mode: 'eco' }, { de: 390, a: 510, mode: 'confort' }, { de: 510, a: 1080, mode: 'eco' },
  { de: 1080, a: 1350, mode: 'confort' }, { de: 1350, a: 1440, mode: 'eco' },
];
/** Un chauffage de l'état du moteur (`_etat_un`), au planning allumé par défaut. */
const chauffage = (o) => ({
  planning: true, modes: TOUS, mode: 'eco', source: 'planning', fin: '2026-10-12T18:00:00+02:00', puis: 'confort',
  reprise: null, fenetre: 'arret', fenetre_ouverte: false, semaine: {}, temperatures: null, avertissements: [],
  jour: LUNDI, options: null, ...o,
});
/* L'état du moteur : ces chauffages, lundi 12 octobre 2026 à 10:30 — « maintenant » à
 * l'horloge de la maison, contre lequel la carte lit le jour d'une fin. */
const MAINTENANT = '2026-10-12T10:30:00+02:00';
const poser = (...chauffages) => {
  reglerChauffageEtat({ hass: null });
  poserEtatChauffage({ chauffages, maison: { mode: 'planning' }, minute: [0, 630], maintenant: MAINTENANT, plannings_allumes: true });
};
/** Le même, la maison dans un autre mode. */
const poserMaison = (maison, ...chauffages) => {
  reglerChauffageEtat({ hass: null });
  poserEtatChauffage({ chauffages, maison, minute: [0, 630], maintenant: MAINTENANT, plannings_allumes: true });
};
/** Le même, le moteur en « Observer sans agir » : il calcule, il n'envoie rien. */
const observer = (...chauffages) => {
  reglerChauffageEtat({ hass: null });
  poserEtatChauffage({ chauffages, maison: { mode: 'planning' }, minute: [0, 630], maintenant: MAINTENANT, plannings_allumes: true, simulation: true });
};
const vider = () => reglerChauffageEtat({ hass: null });

const POELE = 'climate.poele';
const hassPoele = (attrs = {}, etat = 'heat') => ({
  states: { [POELE]: { entity_id: POELE, state: etat, last_changed: '2026-10-12T08:00:00Z', attributes: {
    friendly_name: 'Poêle', hvac_modes: ['off', 'heat'], min_temp: 5, max_temp: 35, target_temp_step: 0.5,
    current_temperature: 19, temperature: 17, hvac_action: 'idle', ...attrs } } },
  callService: () => { throw new Error('rien ne doit partir'); },
});
const thermostat = (hass) => renderToStaticMarkup(createElement(RoomClimateCard, { id: POELE, hass, onOpen: () => {} }));

test('au planning, la carte d’un thermostat dit et règle la consigne de la PIÈCE : celle de l’appareil, moins son décalage (30/10)', () => {
  const hass = hassPoele({ temperature: 18.5 });
  poser(chauffage({ cle: POELE, entite: POELE, nom: 'Poêle', famille: 'thermostat', decalage: -1.5 }));
  assert.ok(thermostat(hass).includes('20,0°'), 'le poêle reçoit 18,5 pour une pièce à 20');
  poser(chauffage({ cle: POELE, entite: POELE, nom: 'Poêle', famille: 'thermostat', decalage: -1.5, planning: false }));
  assert.ok(thermostat(hass).includes('18,5°'), 'planning éteint, la carte commande l’appareil : sa consigne à lui');
  poser(chauffage({ cle: POELE, entite: POELE, nom: 'Poêle', famille: 'thermostat' }));
  assert.ok(thermostat(hass).includes('18,5°'), 'sans décalage, rien ne change');
  vider();
});

const SEL = 'select.radiateur_chambre_pilot_wire_mode';
const PUI = 'sensor.radiateur_chambre_power';
/** La zone que la découverte fait d'un module (tâche 5). */
const MODULE = {
  id: SEL, haid: SEL, name: 'Radiateur Chambre', room: 'Chambre', type: 'pilot_wire', modeEnt: SEL, tempCible: null,
  hasAuto: false, tempSensor: 'sensor.chambre_temperature', puissance: PUI, decouvert: true,
};
const hassModule = (option = 'eco', watts = '0') => ({
  states: {
    [SEL]: { entity_id: SEL, state: option, attributes: { friendly_name: 'Radiateur Chambre Pilot wire mode', options: NODON } },
    [PUI]: { entity_id: PUI, state: watts, attributes: { device_class: 'power', unit_of_measurement: 'W' } },
    'sensor.chambre_temperature': { entity_id: 'sensor.chambre_temperature', state: '19.2', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
  },
  callService: () => { throw new Error('rien ne doit partir'); },
});
const radiateur = (hass, zone = MODULE) => renderToStaticMarkup(createElement(RoomPilotCard, { zone, hass, onOpen: () => {} }));
const chModule = (o) => chauffage({ cle: SEL, entite: SEL, nom: 'Radiateur Chambre', famille: 'fil_pilote', options: OPTIONS, ...o });

/** Une zone décrite à la main (Paramètres → Entités), et sa maison. */
const ZONE = { id: 'chambre', name: 'Chambre', room: 'Chambre', haid: 'switch.radiateur_chambre', type: 'pilot_wire',
  tempCible: 'input_number.consigne_chambre', modeEnt: SEL, autoEnt: null, hasAuto: false, tempSensor: 'sensor.chambre_temperature' };
const hassZone = () => {
  const hass = hassModule('comfort', '612');
  hass.states['input_number.consigne_chambre'] = { entity_id: 'input_number.consigne_chambre', state: '19', attributes: {} };
  hass.states['switch.radiateur_chambre'] = { entity_id: 'switch.radiateur_chambre', state: 'on', attributes: {} };
  return hass;
};

/** Les deux boutons − / + : leur nom et s'ils sont inertes. */
const boutons = (html) => [...html.matchAll(/<button aria-label="([^"]*)"( disabled="")?[^>]*class="o-rmbtn"/g)].map(m => ({ nom: m[1], inerte: !!m[2] }));
/** Ce qui s'affiche entre − et + : le texte masqué, puis la valeur. */
const entreDeux = (html) => { const m = /<span class="o-vh">([^<]*)<\/span>([^<]*)<\/span>/.exec(html); return m ? [m[1], m[2]] : null; };
const LAVIS = 'linear-gradient(180deg,rgba(var(--o-warn2-rgb)';
const LAVIS_FROID = 'linear-gradient(180deg,rgba(var(--o-cold-rgb)';

/** Les déclarations d'un attribut `style`, en table. */
const styleDe = (s) => Object.fromEntries(s.split(';').filter(Boolean).map(d => { const i = d.indexOf(':'); return [d.slice(0, i), d.slice(i + 1)]; }));
/** L'état écrit sous le nom, et sa couleur. ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la phrase porte la classe de la grille commune. */
const etatDe = (html) => {
  const m = /<div class="o-gab-phrase" style="font-size:12px;font-weight:600;color:([^;"]+);margin-top:2px;[^"]*">([^<]*)<\/div>/.exec(html);
  return m ? { texte: m[2], couleur: m[1] } : null;
};
/** L'étiquette sous la valeur, et si le lecteur d'écran la lit. ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la classe de la grille commune. */
const etiquetteDe = (html) => {
  const m = /<div( aria-hidden="true")? class="o-gab-etiquette"[^>]*>([^<]*)<\/div>/.exec(html);
  return m ? { mot: m[2], lue: !m[1] } : null;
};
/** La température de la pièce, en grand : 25 px et « ° » de 15 px, que la feuille réduit sur une carte étroite. */
const pieceDe = (html) => {
  const m = /<span style="font-size:var\(--o-piece-taille, 25px\);letter-spacing:-.02em">([^<]*)<\/span><span style="font-size:var\(--o-piece-degre, 15px\);margin-top:2px">°<\/span>/.exec(html);
  return m ? m[1] : null;
};
/** La plaque de l'icône : son fond et son encre. */
const plaqueDe = (html) => {
  const m = /border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:([^;"]+);color:([^;"]+)"/.exec(html);
  return m ? { fond: m[1], encre: m[2] } : null;
};
/** Le point du mode, devant sa valeur (la feuille l'efface sur une carte étroite). ASSERTION MODIFIÉE (passe téléphone, tâche 4) : il ne s'écrit que pour la carte large. */
const pointDe = (html) => {
  const m = /<span aria-hidden="true" class="o-chauffage-point o-seul-large" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:([^;"]+)"><\/span>/.exec(html);
  return m ? m[1] : null;
};
/** Les styles des deux boutons − / +. */
const stylesBoutons = (html) => [...html.matchAll(/class="o-rmbtn" style="([^"]*)"/g)].map(m => styleDe(m[1]));
/* La feuille de l'écran, et le bloc de la requête de conteneur d'une carte
 * ÉTROITE (moins de 188 px de contenu), lu jusqu'à son accolade fermante. */
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ETROITE = (() => {
  const i = CSS.indexOf('@container (width < 188px) {');
  assert.ok(i >= 0, 'la requête de la carte étroite a disparu');
  let j = CSS.indexOf('{', i) + 1;
  for (let prof = 1; prof; j++) prof += CSS[j] === '{' ? 1 : CSS[j] === '}' ? -1 : 0;
  return CSS.slice(i, j);
})();
/** Une règle du bloc étroit, par son sélecteur : ses déclarations. */
const regleEtroite = (selecteur) => {
  const i = ETROITE.indexOf('\n  ' + selecteur + ' {');
  assert.ok(i >= 0, 'règle étroite absente : ' + selecteur);
  return ETROITE.slice(ETROITE.indexOf('{', i) + 1, ETROITE.indexOf('}', i)).trim();
};

// ── Les aides pures ─────────────────────────────────────────────────────────

test('l’état d’un module : « Chauffe » au-delà de 10 W mesurés, « Éteint » à l’Arrêt, sinon « Au repos »', () => {
  assert.equal(SEUIL_CHAUFFE_W, 10);
  assert.equal(etatModule(612, 'eco'), 'chauffe');
  assert.equal(etatModule(10.5, 'confort'), 'chauffe');
  assert.equal(etatModule(10, 'confort'), 'repos', 'plus de 10 W, pas 10');
  assert.equal(etatModule(0, 'confort'), 'repos');
  assert.equal(etatModule(0, 'arret'), 'eteint');
  assert.equal(etatModule(null, 'arret'), 'eteint', 'sans capteur, l’ordre seul');
  assert.equal(etatModule(null, 'eco'), 'repos');
  assert.equal(etatModule(null, null), 'repos', 'ni mesure ni mode : au repos, jamais « Chauffe » inventé');
  // La mesure passe avant l'ordre : un radiateur qui tire du courant à l'Arrêt chauffe quand même.
  assert.equal(etatModule(1500, 'arret'), 'chauffe');
  for (const illisible of [NaN, '612', undefined]) assert.equal(etatModule(illisible, 'eco'), 'repos', String(illisible));
});

test('le mode d’un module se lit à l’envers de ses options, telles qu’il les écrit', () => {
  assert.equal(modeDuModule(OPTIONS, 'comfort_-1'), 'confort_1');
  assert.equal(modeDuModule(OPTIONS, 'frost_protection'), 'hors_gel');
  assert.equal(modeDuModule(OPTIONS, 'off'), 'arret');
  assert.equal(modeDuModule({ confort: 'Confort', arret: 'Arrêt' }, 'Arrêt'), 'arret', 'une graphie française aussi');
  assert.equal(modeDuModule(OPTIONS, 'turbo'), null, 'une option que la table ne nomme pas');
  assert.equal(modeDuModule(OPTIONS, 'Comfort'), null, 'la graphie exacte, pas une ressemblance');
  for (const [options, option] of [[{}, 'eco'], [null, 'eco'], [OPTIONS, null], [OPTIONS, undefined], ['eco', 'eco']]) {
    assert.equal(modeDuModule(options, option), null, JSON.stringify([options, option]));
  }
});

test('la consigne d’une reprise en main : un cran du pas que le serveur appliquera, en °C comme en °F', () => {
  /* Le serveur range toute consigne au pas de l'appareil, chaque demi vers le
   * haut (`consigne_en_unite`) : celui qu'il publie, sinon 1 °F ou 0,5 °C. À
   * ± 0,5, « − » sur un appareil au degré y redevenait la même consigne, et
   * posait une reprise en main pour rien. */
  const serveur = (v, pas) => Math.floor(v / pas + 0.5) * pas;
  assert.equal(serveur(67.5, 1), 68, 'le défaut : 68 °F − 0,5 donnait 67,5, que le serveur remontait à 68');
  // Le demi-degré d'aujourd'hui, en °C.
  assert.equal(consigneVoisine(19, -1, { target_temp_step: 0.5 }, 'C'), 18.5);
  assert.equal(consigneVoisine(19, 1, {}, 'C'), 19.5);
  // Un thermostat en °F qui ne publie pas son pas : le degré.
  assert.equal(consigneVoisine(68, -1, {}, 'F'), 67);
  assert.equal(consigneVoisine(68, 1, {}, 'F'), 69);
  // Un poêle au degré.
  assert.equal(consigneVoisine(20, -1, { target_temp_step: 1 }, 'C'), 19);
  assert.equal(consigneVoisine(20, 1, { target_temp_step: 1 }, 'C'), 21);
  // Un pas plus fin garde le demi-degré.
  assert.ok(Math.abs(consigneVoisine(20, -1, { target_temp_step: 0.1 }, 'C') - 19.5) < 1e-9);
  // Hors de la grille, le cran va toujours dans le sens demandé.
  assert.equal(consigneVoisine(19.3, -1, {}, 'C'), 19);
  assert.equal(consigneVoisine(19.3, 1, {}, 'C'), 20);
  assert.equal(consigneVoisine(68.4, -1, {}, 'F'), 67);
  assert.equal(consigneVoisine(68.6, 1, {}, 'F'), 70);
  // Envoyée en °C (ADR 0128), redite dans l'unité de la maison et rangée au pas : le serveur la garde.
  for (const [c, unite, attrs] of [[19, 'C', {}], [20, 'C', { target_temp_step: 1 }], [68, 'F', {}], [71, 'F', { target_temp_step: 1 }]]) {
    const pas = attrs.target_temp_step || (unite === 'F' ? 1 : 0.5);
    for (const sens of [-1, 1]) {
      const v = consigneVoisine(c, sens, attrs, unite);
      const celsius = unite === 'F' ? (v - 32) * 5 / 9 : v;
      const retour = unite === 'F' ? celsius * 9 / 5 + 32 : celsius;
      assert.equal(serveur(retour, pas), v, JSON.stringify([c, unite, attrs, sens]));
      assert.ok(sens > 0 ? v > c : v < c, 'un cran bouge toujours : ' + JSON.stringify([c, unite, sens]));
    }
  }
  // Rien sans consigne lisible, ni sans sens.
  for (const [c, sens] of [[null, 1], [undefined, -1], [NaN, 1], ['19', 1], [19, 0], [19, NaN]]) {
    assert.equal(consigneVoisine(c, sens, {}, 'C'), null, JSON.stringify([c, sens]));
  }
  // Un pas illisible ne compte pas : celui de l'interface.
  for (const pas of [0, -1, 'x', null, Infinity]) {
    assert.equal(consigneVoisine(20, -1, { target_temp_step: pas }, 'C'), 19.5, String(pas));
  }
});

// ── Le thermostat ───────────────────────────────────────────────────────────

test('thermostat, planning éteint ou état absent : la carte d’aujourd’hui, sans barre ni AUTO', () => {
  vider();
  const sans = thermostat(hassPoele());
  assert.ok(!sans.includes('o-jauge-planning') && !sans.includes('>AUTO<'));
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', planning: false, mode: null, source: null, jour: null }));
  assert.equal(thermostat(hassPoele()), sans, 'planning éteint, la carte ne change pas d’un pixel');
  // Un AUTRE chauffage au planning ne la touche pas.
  poser(chauffage({ cle: 'climate.autre', entite: 'climate.autre', famille: 'thermostat' }));
  assert.equal(thermostat(hassPoele()), sans);
  vider();
});

test('thermostat au planning : jusqu’à quand, sous l’étiquette PLANNING ; ni AUTO ni barre ; ses boutons et sa consigne', () => {
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }));
  const html = thermostat(hassPoele());
  // La pastille AUTO et la barre du jour sont parties (maquette 1a) : la phrase le dit, la fiche montre la journée.
  assert.ok(!html.includes('>AUTO<'), 'plus de pastille AUTO');
  assert.ok(!html.includes('o-jauge'), 'la barre du jour vit dans la fiche');
  // « Ne pas répéter le bas » (12/10) : l'étiquette dit PLANNING, l'état seulement jusqu'à quand.
  assert.deepEqual(etatDe(html), { texte: 'jusqu’à 18:00', couleur: 'var(--o-text2)' });
  assert.deepEqual(etiquetteDe(html), { mot: 'Planning', lue: true }, 'un thermostat au planning prend l’étiquette du fil pilote');
  assert.ok(html.indexOf('>jusqu’à 18:00<') < html.indexOf('class="o-rmbtn"'), 'l’état, puis les boutons');
  assert.ok(html.includes('aria-label="Poêle, jusqu’à 18:00"'), 'la surface dit ce que la carte affiche');
  // Ses boutons ne bougent pas : mêmes noms, la consigne entre les deux.
  assert.deepEqual(boutons(html), [{ nom: 'Baisser la consigne Poêle', inerte: false }, { nom: 'Monter la consigne Poêle', inerte: false }]);
  assert.deepEqual(entreDeux(html), ['Consigne ', '17,0°']);
  vider();
});

test('thermostat repris en main : « jusqu’à 18:00 » sous l’étiquette MANUEL, pas d’AUTO', () => {
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', source: 'main', mode: null,
    reprise: { temperature: 21, fin: '2026-10-12T18:00:00+02:00' } }));
  const html = thermostat(hassPoele({ temperature: 21 }));
  assert.ok(!html.includes('>AUTO<'), 'à la main, plus de pastille');
  assert.equal(etatDe(html).texte, 'jusqu’à 18:00', 'la reprise se dit par sa fin');
  assert.deepEqual(etiquetteDe(html), { mot: 'Manuel', lue: true });
  assert.deepEqual(entreDeux(html), ['Consigne ', '21,0°']);
  vider();
});

test('thermostat au planning, à l’arrêt ou fenêtre ouverte : la valeur dit le mode — l’étiquette dit qui le décide', () => {
  /* MODE ne se pose jamais sous un chiffre. La valeur dit le mode que le
   * moteur applique, « Arrêt », « Éco », comme celle d'un module. */
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', mode: 'arret' }));
  let html = thermostat(hassPoele({ hvac_action: 'off', temperature: null }, 'off'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Arrêt']);
  /* ASSERTION MODIFIÉE (tâche 10 bis B, réserve de la carte) : l'étiquette dit
   * QUI décide — ici sa propre bande Arrêt, le planning : PLANNING, lue (elle
   * n'est pas dite devant la valeur). « MODE l'emportait à l'arrêt ». */
  assert.deepEqual(etiquetteDe(html), { mot: 'Planning', lue: true }, 'sa propre bande Arrêt : le planning décide');
  assert.equal(etatDe(html).texte, 'jusqu’à 18:00');
  // Une reprise en main à l'Arrêt — la bascule qui coupe — : MANUEL, rien d'autre ne dirait la reprise.
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', mode: 'arret', source: 'main',
    reprise: { mode: 'arret', temperature: null, fin: '2026-10-12T18:00:00+02:00' } }));
  html = thermostat(hassPoele({ hvac_action: 'off', temperature: null }, 'off'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Arrêt']);
  assert.deepEqual(etiquetteDe(html), { mot: 'Manuel', lue: true }, 'la bascule qui coupe est une reprise en main');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la valeur porte la classe de la grille commune (`o-gab-valeur`).
  assert.match(html, /font-size:15px;font-weight:800;color:var\(--o-text\)"><span class="o-gab-valeur"/, 'le mot du mode s’écrit plein, comme celui d’un module');
  // Une fenêtre qui impose l'Éco : le thermostat tourne, la valeur dit l'Éco, l'état « Fenêtre ouverte » à l'ambre.
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', mode: 'eco', source: 'fenetre', fenetre: 'eco', fin: null, fenetre_ouverte: true }));
  html = thermostat(hassPoele({ temperature: 16 }));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Éco']);
  assert.deepEqual(etiquetteDe(html), { mot: 'Mode', lue: false });
  assert.deepEqual(etatDe(html), { texte: 'Fenêtre ouverte', couleur: 'var(--o-warn)' });
  // Une fenêtre qui impose l'Arrêt : de même.
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', mode: 'arret', source: 'fenetre', fin: null, fenetre_ouverte: true }));
  html = thermostat(hassPoele({ hvac_action: 'off' }, 'off'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Arrêt']);
  assert.deepEqual(etatDe(html), { texte: 'Fenêtre ouverte', couleur: 'var(--o-warn)' });
  // Planning éteint : la consigne et CONSIGNE, à l'arrêt comme en marche — comme aujourd'hui.
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', planning: false, mode: null, source: null, jour: null, fin: null }));
  for (const [attrs, etat] of [[{}, 'heat'], [{ hvac_action: 'off' }, 'off']]) {
    html = thermostat(hassPoele(attrs, etat));
    assert.deepEqual(entreDeux(html), ['Consigne ', '17,0°'], etat);
    assert.deepEqual(etiquetteDe(html), { mot: 'Consigne', lue: false }, etat);
  }
  vider();
});

// ── Le module fil pilote découvert ──────────────────────────────────────────

test('module sans état du moteur : « — » entre deux boutons inertes, nommés par le mode', () => {
  vider();
  const html = radiateur(hassModule('eco'));
  assert.deepEqual(entreDeux(html), ['Mode ', '—']);
  assert.deepEqual(boutons(html), [{ nom: 'Mode plus froid Radiateur Chambre', inerte: true }, { nom: 'Mode plus chaud Radiateur Chambre', inerte: true }]);
  assert.ok(!html.includes('o-jauge-planning') && !html.includes('>AUTO<'));
  // La bascule reste : par les options de famille, comme avant.
  assert.ok(html.includes('role="switch" aria-checked="true"'));
});

test('module, planning éteint : le mode que dit son option, − / + vers ses voisins, inertes au bout', () => {
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  let html = radiateur(hassModule('eco'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Éco']);
  assert.deepEqual(boutons(html).map(b => b.inerte), [false, false], 'Hors-gel sous l’Éco, Confort −2 au-dessus');
  assert.ok(!html.includes('o-jauge-planning') && !html.includes('>AUTO<'), 'planning éteint : ni barre ni AUTO');
  html = radiateur(hassModule('comfort'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Confort']);
  assert.deepEqual(boutons(html).map(b => b.inerte), [false, true], 'au bout du chaud, « + » s’éteint');
  html = radiateur(hassModule('comfort_-1'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Confort −1'], 'le moins de « Confort −1 » est U+2212');
  html = radiateur(hassModule('off'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Arrêt']);
  assert.deepEqual(boutons(html).map(b => b.inerte), [true, false], 'au bout du froid, « − » s’éteint');
  assert.ok(html.includes('>Éteint<'));
  // Une option absente : le mode voisin existe, mais rien ne sait l'écrire.
  const { confort_2: _sans, ...sansMoinsDeux } = OPTIONS;
  poser(chModule({ planning: false, mode: null, source: null, jour: null, options: sansMoinsDeux }));
  assert.deepEqual(boutons(radiateur(hassModule('eco'))).map(b => b.inerte), [false, true], 'Confort −2 sans option : « + » inerte');
  vider();
});

test('module : « chauffe » au-delà de 10 W — la couleur de l’état, la plaque et le lavis orange', () => {
  /* Planning éteint, sa chauffe se voit à l'orange de son état, de sa plaque
   * et de son lavis. ASSERTIONS MODIFIÉES (tâche 10 bis B, son choix « ne pas
   * répéter le bas ») : l'étiquette dit déjà MANUEL ; l'état dit « Chauffe »
   * au-delà de 10 W, sinon « Sans planning » — plus « Manuel » deux fois. */
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  let html = radiateur(hassModule('eco', '612'));
  assert.deepEqual(etatDe(html), { texte: 'Chauffe', couleur: 'var(--o-warn2)' });
  assert.ok(html.includes(LAVIS), 'la chauffe allume le lavis');
  html = radiateur(hassModule('eco', '10'));
  assert.deepEqual(etatDe(html), { texte: 'Sans planning', couleur: 'var(--o-text2)' }, '10 W ne chauffent pas');
  assert.ok(!html.includes(LAVIS));
  html = radiateur(hassModule('eco', 'unavailable'));
  assert.ok(etatDe(html).couleur === 'var(--o-text2)' && !html.includes(LAVIS), 'une mesure illisible n’invente pas la chauffe');
  html = radiateur(hassModule('off', '0'));
  assert.ok(html.includes('>Éteint<') && !html.includes(LAVIS));
  html = radiateur(hassModule('off', '1500'));
  assert.ok(html.includes('>Chauffe<'), 'un radiateur qui tire 1500 W à l’Arrêt chauffe, et la carte le dit');
  // Sans capteur de puissance : jamais la chauffe.
  html = radiateur(hassModule('comfort', '612'), { ...MODULE, puissance: null });
  assert.ok(etatDe(html).couleur === 'var(--o-text2)' && !html.includes(LAVIS));
  vider();
});

test('module au planning : le mode du moteur, l’étiquette « Planning », sa phrase ; la reprise en main dit « Manuel »', () => {
  poser(chModule({ mode: 'confort_1' }));
  let html = radiateur(hassModule('comfort_-1'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Confort −1']);
  assert.ok(!html.includes('>AUTO<') && !html.includes('o-jauge'), 'ni pastille ni barre : la phrase et l’étiquette le disent');
  assert.deepEqual(etiquetteDe(html), { mot: 'Planning', lue: true });
  assert.equal(etatDe(html).texte, 'jusqu’à 18:00', 'l’étiquette dit déjà PLANNING');
  assert.deepEqual(boutons(html).map(b => b.inerte), [false, false]);
  // Le moteur décide : ce qu'il applique, même si le module n'a pas encore suivi.
  html = radiateur(hassModule('eco'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Confort −1']);
  poser(chModule({ mode: 'confort', source: 'main', fin: '2026-10-13T07:30:00+02:00',
    reprise: { mode: 'confort', temperature: null, fin: '2026-10-13T07:30:00+02:00' } }));
  html = radiateur(hassModule('comfort'));
  assert.ok(!html.includes('>AUTO<'), 'à la main : plus de pastille');
  assert.equal(etatDe(html).texte, 'jusqu’à demain 07:30', 'sa reprise, et jusqu’à quand — l’étiquette dit déjà MANUEL');
  assert.deepEqual(etiquetteDe(html), { mot: 'Manuel', lue: true });
  assert.deepEqual(boutons(html).map(b => b.inerte), [false, true], 'au Confort, « + » s’éteint');
  // La fenêtre ouverte : le moteur dit l'Arrêt, la valeur le montre, et l'état dit pourquoi, à l'ambre.
  poser(chModule({ mode: 'arret', source: 'fenetre', fin: null, puis: null, fenetre_ouverte: true }));
  html = radiateur(hassModule('off'));
  assert.deepEqual(etatDe(html), { texte: 'Fenêtre ouverte', couleur: 'var(--o-warn)' },
    'une fenêtre ne reprend pas la main : le planning tient, et la fenêtre se dit — la valeur dit l’Arrêt');
  assert.deepEqual(entreDeux(html), ['Mode ', 'Arrêt']);
  assert.deepEqual(etiquetteDe(html), { mot: 'Mode', lue: false }, 'à l’arrêt : le mode');
  // Une fenêtre qui impose l'Éco : le module tourne, mais l'étiquette dit MODE — pas PLANNING.
  poser(chModule({ mode: 'eco', source: 'fenetre', fenetre: 'eco', fin: null, puis: null, fenetre_ouverte: true }));
  html = radiateur(hassModule('eco'));
  assert.deepEqual(etatDe(html), { texte: 'Fenêtre ouverte', couleur: 'var(--o-warn)' });
  assert.deepEqual(entreDeux(html), ['Mode ', 'Éco']);
  assert.deepEqual(etiquetteDe(html), { mot: 'Mode', lue: false }, 'fenêtre ouverte : la valeur dit le mode qu’elle impose');
  vider();
});

test('une zone décrite à la main : rien ne change, même quand le moteur connaît son select', () => {
  const hass = hassZone();
  vider();
  const avant = radiateur(hass, ZONE);
  poser(chModule({ mode: 'confort' }));
  assert.equal(radiateur(hass, ZONE), avant, 'la zone saisie ne lit pas l’état du moteur');
  assert.deepEqual(entreDeux(avant), ['Consigne ', '19,0°']);
  assert.deepEqual(boutons(avant), [{ nom: 'Baisser la consigne Chambre', inerte: false }, { nom: 'Monter la consigne Chambre', inerte: false }]);
  // « Chauffe » se décide sur sa consigne, comme avant : 19,2 °C dans la pièce pour 19 voulus.
  assert.ok(avant.includes('>Au repos<'));
  vider();
});

test('en « Observer sans agir », la carte reste celle du planning éteint : le moteur n’envoie rien', () => {
  /* Le moteur calcule et écrit « aurait mis… », sans AUCUN ordre — une
   * reprise en main pas plus que le reste (spec § 5.5) — et il n'est pas
   * encore le chef (§ 11) : passés par lui, les gestes de la carte
   * n'arriveraient plus à l'appareil, et le mot d'un module serait celui d'un
   * ordre jamais parti. Ni barre ni AUTO : le planning ne mène rien. */
  vider();
  const sans = thermostat(hassPoele());
  observer(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }));
  assert.equal(thermostat(hassPoele()), sans, 'le thermostat : ni barre ni AUTO, ses gestes à l’appareil');
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  const eteint = radiateur(hassModule('eco'));
  observer(chModule({ mode: 'confort' }));
  const html = radiateur(hassModule('eco'));
  /* ASSERTION MODIFIÉE (relecture de la partie B, point 5) : la carte reste
   * celle du planning éteint — sa valeur, ses boutons, son étiquette —, mais
   * son état ne dit plus « Sans planning » : un planning est là, observé. Il
   * dit « Observer sans agir » (dans l'état et dans le nom de la surface). */
  assert.equal(etatDe(html).texte, 'Observer sans agir');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la phrase porte sa longueur (`--o-n`, la grille commune) — 18 lettres pour « Observer sans agir », 13 pour « Sans planning ».
  assert.equal(html.replaceAll('Observer sans agir', 'Sans planning').replace('--o-n:18', '--o-n:13'), eteint, 'le module : la carte du planning éteint, l’état mis à part');
  assert.deepEqual(entreDeux(html), ['Mode ', 'Éco'], 'le mode que dit son option, pas celui que le moteur aurait mis');
  // ASSERTION MODIFIÉE (audit du 19/10) : le thermostat attend aussi quand il refroidit (une pompe à chaleur en froid).
  assert.ok(corps('RoomClimateCard').includes('const auPlanning = !!(ch && ch.planning && !etat.simulation && !refroidit(ch));'), 'RoomClimateCard : en observation, la carte passerait par le moteur');
  assert.ok(corps('RoomPilotCard').includes('const auPlanning = !!(ch && ch.planning && !etat.simulation);'), 'RoomPilotCard : en observation, la carte passerait par le moteur');
  vider();
});

// ── La carte 1a (tâche 10 bis A) ────────────────────────────────────────────

// TITRE MODIFIÉ (passe téléphone, tâche 4 ; T9, T13) : il disait « la bascule seule à droite, − et + de largeur fixe qui ne cèdent jamais » ; sur une carte étroite, la température prend la place de la bascule, et les carrés cèdent sous 142 px de contenu.
test('la carte 1a : l’icône seule à gauche, la bascule seule à droite sur une carte large ; − et + de 44 px, que seule la carte étroite fait céder', () => {
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }), chModule({ mode: 'eco' }));
  const cartes = [['thermostat', thermostat(hassPoele({ hvac_action: 'heating' })), 'thermometer-half'],
    ['module', radiateur(hassModule('eco', '612')), 'heat'], ['zone décrite', radiateur(hassZone(), ZONE), 'heat']];
  for (const [nom, html, glyphe] of cartes) {
    // La rangée du haut : la plaque, puis la bascule — rien entre les deux.
    // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la bascule ne s'écrit que pour la carte large (`o-seul-large`) ; la carte étroite a la température à sa place.
    const haut = /<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><span style="width:38px;[^"]*"><i aria-hidden="true" class="fi fi-rr-([a-z-]+)"[^>]*><\/i><\/span><span class="o-seul-large" role="switch"/.exec(html);
    assert.ok(haut, nom + ' : la rangée du haut porte autre chose que l’icône et la bascule');
    assert.equal(haut[1], glyphe, nom + ' : son glyphe — plus de flamme à la chauffe');
    assert.ok(!html.includes('fi-rr-flame'), nom);
    assert.ok(!html.includes('>AUTO<') && !html.includes('o-jauge') && !html.includes('monospace'), nom + ' : ni AUTO, ni barre, ni chiffres à chasse fixe');
    // − et + : les glyphes de 16 px, dans des boutons de 44 px de haut.
    assert.ok(html.includes('class="fi fi-rr-minus-small" style="font-size:16px;') && html.includes('class="fi fi-rr-plus-small" style="font-size:16px;'), nom);
    const s = stylesBoutons(html);
    assert.equal(s.length, 2, nom);
    for (const b of s) {
      assert.equal(b.position, 'relative', nom + ' : un bouton non positionné passerait sous la surface');
      /* Une largeur FIXE, que rien ne rétrécit (retour du 12/10) : 44 px sur
       * une carte large, 34 px sur une étroite (`--o-pas`, la feuille).
       * ASSERTION MODIFIÉE (passe téléphone, tâche 4) : sur une étroite, de 44 à 28 px (`--o-pas`, la grille commune) — le style en ligne ne change pas. */
      assert.equal(b.flex, '0 0 auto', nom + ' : un bouton qui rétrécit, « écrasé » au téléphone');
      assert.equal(b.width, 'var(--o-pas, 44px)', nom);
      assert.ok(!('min-width' in b), nom + ' : plus de largeur minimale — il ne cède plus du tout');
      assert.equal(b.height, '44px', nom);
      assert.equal(b['border-radius'], '12px', nom);
      assert.equal(b.background, 'var(--o-s1)', nom);
      assert.equal(b.border, 'none', nom);
    }
    // La rangée du bas : 8 px d'écart en large, 4 en étroit ; 14 px au-dessus en large, 10 en étroit.
    // ASSERTION MODIFIÉE (passe téléphone, tâche 4 ; T18) : elle pose aussi la longueur du plus long mot de sa valeur (`--o-mot`), que la carte étroite lit.
    assert.ok(/<div style="display:flex;align-items:center;gap:var\(--o-pas-ecart, 8px\);margin-top:auto;padding-top:var\(--o-pied-haut, 14px\);--o-mot:\d+">/.test(html), nom);
    // Le cadre reste celui de la maison : son liseré, et le conteneur de ses requêtes de largeur.
    // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le conteneur est celui de la grille commune (`o-gabarit`).
    assert.ok(html.startsWith('<div class="o-rmcard o-gabarit" data-chauffage="" style="'), nom);
  }
  vider();
});

test('au planning, l’état dit jusqu’à quand — pas ce que le bas de la carte dit déjà —, à sa couleur', () => {
  // Le planning, jusqu'à son prochain changement — aujourd'hui, demain, un autre jour : l'étiquette dit PLANNING.
  poser(chModule({ fin: '2026-10-13T07:30:00+02:00' }), chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', fin: '2026-10-14T06:30:00+02:00' }));
  assert.deepEqual(etatDe(radiateur(hassModule('eco'))), { texte: 'jusqu’à demain 07:30', couleur: 'var(--o-text2)' });
  assert.equal(etatDe(thermostat(hassPoele())).texte, 'jusqu’à mercredi 06:30');
  poser(chModule({ fin: null, puis: null }));
  assert.equal(etatDe(radiateur(hassModule('eco'))).texte, 'toute la semaine');
  // Une reprise en main : SA fin — l'étiquette dit MANUEL.
  const main = (fin) => chModule({ mode: 'confort', source: 'main', fin, reprise: { mode: 'confort', temperature: null, fin } });
  poser(main('2026-10-12T22:30:00+02:00'));
  assert.equal(etatDe(radiateur(hassModule('comfort'))).texte, 'jusqu’à 22:30');
  poser(main(null));
  assert.equal(etatDe(radiateur(hassModule('comfort'))).texte, 'sans limite');
  // Une fenêtre, à l'ambre — qu'elle impose l'Arrêt ou l'Éco, que la valeur dit.
  poser(chModule({ mode: 'eco', source: 'fenetre', fenetre: 'eco', fin: null, fenetre_ouverte: true }));
  assert.deepEqual(etatDe(radiateur(hassModule('eco'))), { texte: 'Fenêtre ouverte', couleur: 'var(--o-warn)' });
  // La maison hors Planning : son mot, sans changement.
  poserMaison({ mode: 'absence', absence: 'eco' }, chModule({ source: 'maison' }));
  assert.equal(etatDe(radiateur(hassModule('eco'))).texte, 'Absence');
  // La chauffe teinte l'état d'orange, au planning aussi.
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }));
  assert.deepEqual(etatDe(thermostat(hassPoele({ hvac_action: 'heating' }))), { texte: 'jusqu’à 18:00', couleur: 'var(--o-warn2)' });
  vider();
});

test('planning éteint ou en observation : le thermostat dit ce qu’il fait, à sa couleur', () => {
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', planning: false, mode: null, source: null, jour: null, fin: null }));
  /* « Au repos · consigne atteinte » devient « Consigne atteinte » (« Ne pas
   * répéter le bas », 12/10) — la même règle de mesure. */
  const cas = [
    [{}, 'heat', 'Consigne atteinte', 'var(--o-text2)'],
    [{ hvac_action: 'heating' }, 'heat', 'Chauffe', 'var(--o-warn2)'],
    // Préchauffer, c'est chauffer.
    [{ hvac_action: 'preheating' }, 'heat', 'Chauffe', 'var(--o-warn2)'],
    [{ hvac_action: 'cooling', hvac_modes: ['off', 'cool'] }, 'cool', 'Refroidit', 'var(--o-cold)'],
    [{ hvac_action: 'off' }, 'off', 'Éteint', 'var(--o-text3)'],
    // Sans consigne lisible, rien d'« atteint ».
    [{ temperature: null }, 'heat', 'Au repos', 'var(--o-text2)'],
    /* « Consigne atteinte » se MESURE (relecture de la partie A) : un `idle`
     * dans une pièce à 16° pour 20° — une tête qui a vu une fenêtre, un poêle
     * en veille, une pompe à chaleur en dégivrage — n'a rien atteint. */
    [{ current_temperature: 16, temperature: 20 }, 'heat', 'Au repos', 'var(--o-text2)'],
    [{ current_temperature: 19.8, temperature: 20 }, 'heat', 'Consigne atteinte', 'var(--o-text2)'],
    [{ current_temperature: null }, 'heat', 'Au repos', 'var(--o-text2)'],
    [{ hvac_action: undefined }, 'heat', 'Consigne atteinte', 'var(--o-text2)'],
    [{ hvac_action: 'idle', hvac_modes: ['off', 'cool'], current_temperature: 24, temperature: 23 }, 'cool', 'Au repos', 'var(--o-text2)'],
    [{ hvac_action: 'idle', hvac_modes: ['off', 'cool'], current_temperature: 23.1, temperature: 23 }, 'cool', 'Consigne atteinte', 'var(--o-text2)'],
    // En `auto`, à consigne unique : à 0,2° près, au-dessus comme au-dessous.
    [{ hvac_action: 'idle', hvac_modes: ['off', 'auto'], current_temperature: 20.1, temperature: 20 }, 'auto', 'Consigne atteinte', 'var(--o-text2)'],
    [{ hvac_action: 'idle', hvac_modes: ['off', 'auto'], current_temperature: 21, temperature: 20 }, 'auto', 'Au repos', 'var(--o-text2)'],
    // En Fahrenheit, à 0,4 °F près : 67,7 °F pour 68.
    [{ temperature_unit: '°F', current_temperature: 67.7, temperature: 68 }, 'heat', 'Consigne atteinte', 'var(--o-text2)'],
    [{ temperature_unit: '°F', current_temperature: 67.5, temperature: 68 }, 'heat', 'Au repos', 'var(--o-text2)'],
  ];
  for (const [attrs, etat, texte, couleur] of cas) {
    assert.deepEqual(etatDe(thermostat(hassPoele(attrs, etat))), { texte, couleur }, texte + ' ' + JSON.stringify(attrs));
  }
  // En panne : « Indisponible », éteint — `unknown` comme `unavailable`, comme le module, la fiche et le moteur.
  for (const muet of ['unavailable', 'unknown']) {
    const panne = { states: { [POELE]: { entity_id: POELE, state: muet, attributes: { friendly_name: 'Poêle', hvac_modes: ['off', 'heat'] } } } };
    const html = thermostat(panne);
    assert.deepEqual(etatDe(html), { texte: 'Indisponible', couleur: 'var(--o-text3)' }, muet);
    // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la classe de la grille commune précède celle de la panne.
    assert.ok(html.startsWith('<div class="o-rmcard o-gabarit o-panne" data-chauffage=""') && !html.includes('role="switch"'), muet + ' : le liseré de panne, sans bascule');
  }
  // En observation, les mêmes mots : le moteur ne mène rien.
  observer(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }));
  assert.equal(etatDe(thermostat(hassPoele({ hvac_action: 'heating' }))).texte, 'Chauffe');
  vider();
});

test('planning éteint : un module dit « Sans planning », « Éteint » à l’Arrêt, « Chauffe » au-delà de 10 W — observé, « Observer sans agir » ; sans état, rien du planning', () => {
  /* ASSERTIONS MODIFIÉES (tâche 10 bis B, son choix « ne pas répéter le
   * bas ») : « Manuel » se lisait deux fois, dans l'état et dans l'étiquette
   * dessous. L'étiquette garde MANUEL ; l'état dit « Sans planning ». */
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  assert.deepEqual(etatDe(radiateur(hassModule('eco'))), { texte: 'Sans planning', couleur: 'var(--o-text2)' });
  assert.deepEqual(etiquetteDe(radiateur(hassModule('eco'))), { mot: 'Manuel', lue: true }, 'le bas le dit, une fois');
  assert.equal((radiateur(hassModule('eco')).match(/>Manuel</g) || []).length, 1, 'plus deux fois « Manuel »');
  assert.deepEqual(etatDe(radiateur(hassModule('off'))), { texte: 'Éteint', couleur: 'var(--o-text3)' });
  // La mesure passe avant l'ordre (choix 8) : à l'Arrêt, un radiateur qui tire du courant chauffe, et la carte le dit.
  assert.deepEqual(etatDe(radiateur(hassModule('off', '1500'))), { texte: 'Chauffe', couleur: 'var(--o-warn2)' });
  assert.deepEqual(etatDe(radiateur(hassModule('comfort', '1500'))), { texte: 'Chauffe', couleur: 'var(--o-warn2)' }, 'en marche aussi');
  /* ASSERTIONS MODIFIÉES (relecture de la partie B, point 5). Sans l'état du
   * moteur — pas encore lu, ou un Home Assistant pas redémarré —, la carte ne
   * sait rien du planning : elle n'en dit rien (une espace insécable garde la
   * ligne ; la surface ne la lit pas). En « Observer sans agir », le planning
   * existe : « Observer sans agir », plus « Sans planning ». La mesure et
   * l'Arrêt passent toujours devant : ils disent ce que fait l'appareil. */
  vider();
  assert.deepEqual(etatDe(radiateur(hassModule('eco'))), { texte: ' ', couleur: 'var(--o-text2)' });
  assert.ok(radiateur(hassModule('eco')).includes('class="o-surface" aria-label="Radiateur Chambre" '), 'la surface : le nom seul');
  assert.deepEqual(etatDe(radiateur(hassModule('off'))), { texte: 'Éteint', couleur: 'var(--o-text3)' });
  observer(chModule({ mode: 'confort' }));
  assert.deepEqual(etatDe(radiateur(hassModule('eco'))), { texte: 'Observer sans agir', couleur: 'var(--o-text2)' });
  assert.ok(radiateur(hassModule('eco')).includes('class="o-surface" aria-label="Radiateur Chambre, Observer sans agir"'));
  assert.deepEqual(etatDe(radiateur(hassModule('off'))), { texte: 'Éteint', couleur: 'var(--o-text3)' });
  assert.deepEqual(etatDe(radiateur(hassModule('eco', '1500'))), { texte: 'Chauffe', couleur: 'var(--o-warn2)' });
  // Un planning éteint qu'on observe ne s'observe pas : « Sans planning ».
  observer(chModule({ planning: false, mode: null, source: null, jour: null }));
  assert.equal(etatDe(radiateur(hassModule('eco'))).texte, 'Sans planning');
  vider();
});

test('la valeur d’une carte au planning dit le mode APPLIQUÉ (`applique`), pas celui que le moteur voulait', () => {
  /* Relecture de la partie B, point 3 : un module sans Éco reçoit son
   * Hors-gel ; un thermostat sans `off`, fenêtre ouverte, son Hors-gel aussi.
   * Sans `applique` (un serveur d'avant), le mode voulu. */
  const sansEco = { ...OPTIONS };
  delete sansEco.eco;
  poser(chModule({ mode: 'eco', applique: 'hors_gel', modes: ['confort', 'confort_1', 'confort_2', 'hors_gel', 'arret'], options: sansEco }));
  let html = radiateur(hassModule('frost_protection'));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Hors-gel']);
  assert.equal(pointDe(html), 'var(--o-cyan)', 'le point du mode appliqué');
  // − et + partent du mode appliqué : Arrêt plus froid, Confort −2 plus chaud.
  assert.deepEqual(boutons(html).map(b => b.inerte), [false, false]);
  poser(chModule({ mode: 'eco' }));
  assert.deepEqual(entreDeux(radiateur(hassModule('eco'))), ['Mode ', 'Éco'], 'sans `applique` : le mode voulu');
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', modes: ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel'],
    mode: 'arret', applique: 'hors_gel', source: 'fenetre', fin: null, fenetre_ouverte: true }));
  html = thermostat(hassPoele({ hvac_modes: ['heat'], temperature: 7 }));
  assert.deepEqual(entreDeux(html), ['Mode ', 'Hors-gel']);
  assert.deepEqual(etatDe(html), { texte: 'Fenêtre ouverte', couleur: 'var(--o-warn)' });
  // La source : la carte lit le champ, rien de plus (le paquet de démarrage reste léger).
  assert.ok(corps('RoomPilotCard').includes('auPlanning ? ch.applique || ch.mode :'));
  assert.ok(corps('RoomClimateCard').includes('motMode(ch.applique || ch.mode)'));
  vider();
});

test('un module muet se dit en panne : « Indisponible », le liseré, rien à toucher — planning allumé ou éteint', () => {
  /* Relecture de la partie A : `mort` ne valait que pour un `climate`. Un
   * module dont le `select` manque, vaut `unavailable` ou `unknown`, se dit
   * comme un thermostat en panne. */
  const panne = (html) => {
    assert.deepEqual(etatDe(html), { texte: 'Indisponible', couleur: 'var(--o-text3)' });
    // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la classe de la grille commune précède celle de la panne.
    assert.ok(html.startsWith('<div class="o-rmcard o-gabarit o-panne" data-chauffage=""'), 'le liseré de panne');
    assert.deepEqual(boutons(html).map(b => b.inerte), [true, true], '− et + ne répondent plus');
    assert.ok(!html.includes('role="switch"'), 'la bascule s’efface');
    assert.ok(!html.includes(LAVIS), 'muet, il ne chauffe pas — même si sa prise mesure encore');
    assert.deepEqual(entreDeux(html), ['Mode ', '—']);
    assert.equal(pointDe(html), null);
  };
  poser(chModule({ mode: 'eco' }));
  panne(radiateur(hassModule('unavailable', '612')));
  panne(radiateur(hassModule('unknown')));
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  panne(radiateur(hassModule('unavailable')));
  /* ASSERTION MODIFIÉE (relecture de la dernière passe) : son select vivant,
   * l'avis « injoignable » du moteur ne fait plus taire la carte. Il vient du
   * MÊME select et n'ajoute qu'un retard : l'état du moteur se relit toutes les
   * 60 s, et un module revenu restait « Indisponible » jusqu'à une minute. */
  poser(chModule({ mode: 'eco', avertissements: ['injoignable'] }));
  const revenu = radiateur(hassModule('eco'));
  assert.ok(!revenu.includes('o-panne') && revenu.includes('role="switch"') && etatDe(revenu).texte !== 'Indisponible', 'le select répond : la carte aussi');
  assert.ok(!corps('RoomPilotCard').includes('moduleMuet(S && S[zone.modeEnt], ch)'), 'la carte relit l’avis du moteur');
  // Sans son select du tout.
  const sans = hassModule('eco');
  delete sans.states[SEL];
  vider();
  panne(radiateur(sans));
  // Témoin : vivant, rien de tout cela.
  poser(chModule({ mode: 'eco' }));
  const vivant = radiateur(hassModule('eco'));
  assert.ok(!vivant.includes('o-panne') && vivant.includes('role="switch"') && etatDe(vivant).texte !== 'Indisponible');
  vider();
});

test('l’étiquette sous la valeur : Mode à l’arrêt, Planning, Manuel, Consigne', () => {
  poser(chModule({ mode: 'eco' }), chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }));
  assert.deepEqual(etiquetteDe(radiateur(hassModule('eco'))), { mot: 'Planning', lue: true }, 'il suit son planning');
  /* ASSERTION MODIFIÉE (« Ne pas répéter le bas », 12/10) : un thermostat au
   * planning prend l'étiquette du fil pilote — l'état ne dit plus que
   * « jusqu’à 18:00 ». */
  assert.deepEqual(etiquetteDe(thermostat(hassPoele())), { mot: 'Planning', lue: true }, 'un thermostat au planning : PLANNING');
  /* « Consigne » et « Mode » sont déjà dits au lecteur d'écran, devant la
   * valeur (`o-vh`) : l'étiquette ne les répète pas. Planning éteint, un
   * thermostat garde CONSIGNE. */
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat', planning: false, mode: null, source: null, jour: null }));
  assert.deepEqual(etiquetteDe(thermostat(hassPoele())), { mot: 'Consigne', lue: false }, 'planning éteint : sa consigne');
  /* ASSERTION MODIFIÉE (tâche 10 bis B, réserve de la carte : l'étiquette dit
   * QUI décide) : un module au planning, dans sa propre bande Arrêt, dit
   * PLANNING — plus MODE ; MODE reste à l'arrêt planning éteint. */
  poser(chModule({ mode: 'arret' }));
  assert.deepEqual(etiquetteDe(radiateur(hassModule('off'))), { mot: 'Planning', lue: true }, 'sa propre bande Arrêt : le planning décide');
  // Une reprise à l'Arrêt — la bascule qui coupe — : MANUEL.
  poser(chModule({ mode: 'arret', source: 'main', reprise: { mode: 'arret', temperature: null, fin: '2026-10-12T18:00:00+02:00' } }));
  assert.deepEqual(etiquetteDe(radiateur(hassModule('off'))), { mot: 'Manuel', lue: true }, 'la bascule qui coupe est une reprise en main');
  // La maison en Été met à l'Arrêt : le planning décide encore.
  poserMaison({ mode: 'ete' }, chModule({ mode: 'arret', source: 'maison' }));
  assert.deepEqual(etiquetteDe(radiateur(hassModule('off'))), { mot: 'Planning', lue: true }, 'la maison : PLANNING');
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  assert.deepEqual(etiquetteDe(radiateur(hassModule('off'))), { mot: 'Mode', lue: false }, 'planning éteint, à l’arrêt : le mode');
  assert.deepEqual(etiquetteDe(radiateur(hassModule('comfort'))), { mot: 'Manuel', lue: true }, 'planning éteint : à la main');
  assert.deepEqual(etiquetteDe(radiateur(hassZone(), ZONE)), { mot: 'Consigne', lue: false }, 'une zone décrite à la main : sa consigne');
  /* L'étiquette en petites capitales, 3 px sous la valeur ; sa taille vient
   * de la feuille — 10 px en large, de 10 à 8 px en étroit (`--o-n`). */
  /* ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R8) : l'étiquette portait `overflow-wrap:anywhere;hyphens:auto`, qui coupaient un mot trop long dans le mot
   * (« CONSIG / NE » à 320 px). Elle passe à la ligne entre deux mots et finit en « … » : `overflow:hidden;text-overflow:ellipsis`. */
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : l'étiquette porte la classe de la grille commune (`o-gab-etiquette`) ; son style de carte large ne change pas.
  assert.match(radiateur(hassModule('eco')),
    /class="o-gab-etiquette" style="font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var\(--o-text3\);margin-top:3px;overflow:hidden;text-overflow:ellipsis;--o-taille:10px;--o-n:6">Manuel</);
  vider();
});

test('la température de la pièce, en grand, au format de la langue ; rien sans mesure', () => {
  vider();
  assert.equal(pieceDe(radiateur(hassModule('eco'))), '19,2', 'un module : le capteur de sa pièce');
  assert.equal(pieceDe(radiateur(hassZone(), ZONE)), '19,2', 'une zone décrite : le sien');
  assert.equal(pieceDe(thermostat(hassPoele())), '19,0', 'un thermostat se mesure lui-même, au dixième');
  assert.equal(pieceDe(thermostat(hassPoele({ current_temperature: 20.94 }))), '20,9');
  for (const rien of [null, undefined, '', 'unavailable']) {
    assert.equal(pieceDe(thermostat(hassPoele({ current_temperature: rien }))), null, 'jamais un chiffre inventé : ' + JSON.stringify(rien));
  }
  const muet = hassModule('eco');
  muet.states['sensor.chambre_temperature'].state = 'unavailable';
  assert.equal(pieceDe(radiateur(muet)), null);
  // À droite du nom (première rangée de la grille du milieu), au gris doux quand le chauffage est éteint.
  const bloc = (couleur) => new RegExp('style="grid-column:2;grid-row:1;margin-left:var\\(--o-piece-ecart, 10px\\);display:flex;align-items:flex-start;font-weight:800;line-height:1;color:var\\(--o-' + couleur + '\\)"><span style="font-size:var\\(--o-piece-taille, 25px\\)');
  assert.match(thermostat(hassPoele({}, 'off')), bloc('text2'));
  assert.match(thermostat(hassPoele()), bloc('text'));
});

test('la chauffe teinte la carte d’orange, le froid de bleu ; la plaque suit ; plus de rouge', () => {
  vider();
  let html = thermostat(hassPoele({ hvac_action: 'heating' }));
  assert.ok(html.includes(LAVIS), 'la chauffe : le lavis orange');
  assert.deepEqual(plaqueDe(html), { fond: 'rgba(var(--o-warn2-rgb),.2)', encre: 'var(--o-warn2)' });
  html = thermostat(hassPoele({ hvac_action: 'cooling', hvac_modes: ['off', 'cool'] }, 'cool'));
  assert.ok(html.includes(LAVIS_FROID) && !html.includes(LAVIS), 'le froid : le lavis bleu');
  assert.deepEqual(plaqueDe(html), { fond: 'rgba(var(--o-cold-rgb),.2)', encre: 'var(--o-cold)' });
  html = thermostat(hassPoele());
  assert.ok(!html.includes(LAVIS) && !html.includes(LAVIS_FROID), 'au repos : pas de lavis');
  assert.deepEqual(plaqueDe(html), { fond: 'var(--o-s1)', encre: 'var(--o-text1)' });
  assert.deepEqual(plaqueDe(thermostat(hassPoele({ hvac_action: 'off' }, 'off'))), { fond: 'var(--o-s1)', encre: 'var(--o-text3)' }, 'éteint');
  // Le rouge reste aux alertes : il ne teinte plus rien d'un chauffage.
  for (const h of [thermostat(hassPoele({ hvac_action: 'heating' })), radiateur(hassModule('comfort', '612')), radiateur(hassZone(), ZONE)]) {
    assert.ok(!h.includes('--o-bad'), 'le rouge du climat est parti');
  }
});

test('un module : le point et la plaque prennent la couleur de son mode', () => {
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  let html = radiateur(hassModule('eco'));
  assert.equal(pointDe(html), 'var(--o-purple)');
  assert.deepEqual(plaqueDe(html), { fond: 'rgba(var(--o-purple-rgb),.16)', encre: 'var(--o-purple)' });
  html = radiateur(hassModule('comfort_-1'));
  assert.equal(pointDe(html), 'rgba(var(--o-warn2-rgb),.7)');
  assert.deepEqual(plaqueDe(html), { fond: 'rgba(var(--o-warn2-rgb),.16)', encre: 'rgba(var(--o-warn2-rgb),.7)' });
  assert.deepEqual(plaqueDe(radiateur(hassModule('frost_protection'))), { fond: 'rgba(var(--o-cyan-rgb),.16)', encre: 'var(--o-cyan)' });
  html = radiateur(hassModule('off'));
  assert.equal(pointDe(html), 'var(--o-text3)');
  assert.deepEqual(plaqueDe(html), { fond: 'var(--o-s1)', encre: 'var(--o-text3)' }, 'à l’arrêt : éteinte');
  html = radiateur(hassModule('eco', '612'));
  assert.deepEqual(plaqueDe(html), { fond: 'rgba(var(--o-warn2-rgb),.2)', encre: 'var(--o-warn2)' }, 'la chauffe l’emporte sur le mode');
  // Un mode illisible n'a pas de point : « — » seul. Un thermostat n'en a pas : sa consigne.
  vider();
  assert.equal(pointDe(radiateur(hassModule('eco'))), null);
  assert.equal(pointDe(thermostat(hassPoele())), null);
  assert.equal(pointDe(radiateur(hassZone(), ZONE)), null, 'une zone décrite dit sa consigne');
});

test('la consigne : une décimale et « ° », dans la police du texte, effacée quand il est éteint', () => {
  vider();
  assert.deepEqual(entreDeux(thermostat(hassPoele({ temperature: 21.5 }))), ['Consigne ', '21,5°']);
  assert.deepEqual(entreDeux(thermostat(hassPoele({ temperature: null }))), ['Consigne ', '—'], 'pas de consigne inventée');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la valeur porte la classe de la grille commune (`o-gab-valeur`, `ValeurEtiquette`) ; son dessin ne change pas.
  assert.match(thermostat(hassPoele()),
    /<div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:15px;font-weight:800;color:var\(--o-text\)"><span class="o-gab-valeur" style="min-width:0;--o-taille:15px;--o-n:5;[^"]*"><span class="o-vh">Consigne <\/span>17,0°<\/span>/);
  assert.match(thermostat(hassPoele({}, 'off')), /font-size:15px;font-weight:800;color:var\(--o-text3\)"><span class="o-gab-valeur" [^>]*><span class="o-vh">Consigne /);
});

test('la valeur : sa taille large, sa longueur pour l’étroite ; un mot trop long finit en « … », jamais coupé ni sous − / +', () => {
  /* Sur une carte LARGE, la taille de la maquette : 15 px, 12 ou 10 pour un
   * mot long (« Ochrona przed zamarzaniem », le Hors-gel polonais, 10 px). Sa
   * longueur (`--o-n`) sert à la carte ÉTROITE. ASSERTION MODIFIÉE (chantier
   * Lumières, 11 bis, R8) : un mot qui ne tient pas ne se coupe plus — césure
   * dans la langue de l'écran, ou coupure (`overflowWrap: 'anywhere'`, `hyphens:
   * 'auto'`) : « Wyłączone » devenait « Wyłączon / e » à 360 px. Il finit en « … »
   * (`overflow: 'hidden'`, `textOverflow: 'ellipsis'`). */
  assert.deepEqual(MOT_MODE('Ochrona przed zamarzaniem'),
    { minWidth: 0, '--o-taille': '10px', '--o-n': 25, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis' });
  assert.equal(MOT_MODE('Frost protection')['--o-taille'], '12px');
  assert.equal(MOT_MODE('Confort −1')['--o-taille'], '15px', 'la taille de la maquette tant que le mot est court');
  assert.equal(MOT_MODE('Éco')['--o-taille'], '15px');
  assert.equal(MOT_MODE('Hors-gel')['--o-n'], 8);
  assert.equal(MOT_MODE('20,0°')['--o-n'], 5, 'la consigne aussi');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la règle de la valeur est celle de la grille commune (`o-gab-valeur`), la même pour le chauffage et la prise.
  assert.match(CSS, /\n\.o-gab-valeur \{ font-size: var\(--o-taille, 15px\); \}/, 'la taille large ne vient plus de la carte');
  /* La valeur prend exactement la place qui reste entre les deux boutons :
   * elle ne les pousse jamais, et ne passe jamais dessous. */
  const valeur = /\nconst RM_VALEUR = (\{[^\n]*\});/.exec(APP);
  assert.ok(valeur, 'RM_VALEUR a disparu');
  assert.ok(valeur[1].includes("flex: '1 1 0%'") && valeur[1].includes('minWidth: 0'), valeur[1]);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la carte est le conteneur de la grille commune (`o-gabarit`), et plus de sa propre requête.
  assert.ok(CSS.includes('.o-gabarit { container-type: inline-size; }') && !CSS.includes('.o-rmcard[data-chauffage] { container-type'), 'la carte n’est plus le conteneur de ses requêtes');
  for (const nom of ['RoomClimateCard', 'RoomPilotCard']) assert.ok(corps(nom).includes("className={'o-rmcard o-gabarit' + (mort ? ' o-panne' : '')} data-chauffage=\"\""), nom + ' : la grille commune');
});

test('l’étiquette ne s’efface plus : elle rétrécit de 10 à 8 px, et passe sur deux lignes s’il le faut', () => {
  /* Relecture de la partie A : à 360 px, « 20,9° » (la pièce) et « 20,0° »
   * (la consigne) se retrouvaient côte à côte sans un mot pour les
   * distinguer. Mesurées en capitales Manrope 800, les étiquettes des six
   * langues font de 0,65 à 0,85 em par lettre : 0,86 les couvre. */
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la règle de l'étiquette est celle de la grille commune (`o-gab-etiquette`).
  assert.match(CSS, /\n\.o-gab-etiquette \{ font-size: var\(--o-taille, 10px\); \}/, 'sa taille large');
  /* ASSERTION MODIFIÉE (relecture de la dernière passe) : en étroit, son
   * interligne passe à 1,1. Mesuré à 320 px (cartes de 141 px), un mot sur
   * deux lignes (« Confort −1 », 23 px) et une étiquette sur deux lignes
   * (« PLANNING », 2 × 9,2 px) débordaient de 0,4 px la rangée de 44 px :
   * 23 + 3 + 2 × 8,8 = 43,6.
   * ASSERTION MODIFIÉE (passe téléphone, tâche 4 ; T9) : sur une carte étroite, l'étiquette passe en minuscules, comme sur 1c, en 700 — en capitales,
   * « CONSIGNE » à 8 px faisait 47,2 px pour 46 ; en minuscules, 0,63 em par lettre couvre « Harmonogram » et « Programma ». La place est celle que
   * les boutons laissent (`--o-reserve`), qui cèdent sous 142 px de contenu. */
  assert.equal(regleEtroite('.o-gab-etiquette'), 'font-size: clamp(8px, calc((100cqi - var(--o-reserve)) / (0.63 * var(--o-n, 8))), 10px); line-height: 1.1; text-transform: none !important; letter-spacing: 0 !important; font-weight: 700 !important;');
  // Plus aucune règle ne la cache, sauf sous un mot de mode de plus de 16 lettres (`data-long`).
  const caches = [...CSS.matchAll(/\.o-gab-etiquette([^{]*)\{[^}]*display: none/g)].map(m => m[1].trim());
  assert.deepEqual(caches, ['[data-long]'], 'l’étiquette s’efface de nouveau');
  assert.ok(!/max-width: 139px/.test(CSS.slice(CSS.indexOf('.o-gabarit { container-type'), CSS.indexOf('La carte météo du rail'))), 'le seuil de 140 px est revenu');
  /* Deux lignes, jamais sous les boutons : elle passe à la ligne dans la place de la valeur. ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R8) : entre
   * deux mots seulement — `overflow-wrap:anywhere;hyphens:auto` coupaient un mot dans le mot (« CONSIG / NE ») ; un seul mot trop long finit en « … ». */
  const style = /class="o-gab-etiquette" style="([^"]*)"/.exec(thermostat(hassPoele()));
  assert.ok(style && style[1].includes('overflow:hidden;text-overflow:ellipsis') && !/overflow-wrap|hyphens/.test(style[1]) && !style[1].includes('white-space'), style && style[1]);
});

/* ── La carte ÉTROITE : deux colonnes au téléphone (retour du 12/10) ─────────
 * « Réduire la taille du texte que ça tienne correctement sans écraser les
 * boutons » : sur une carte de 161 à 176 px, − et + ne cèdent plus, c'est le
 * texte qui se réduit. Le rendu large reste celui de la maquette. */

// TITRE MODIFIÉ (passe téléphone, tâche 4 ; T9, T18) : il disait « − et + gardent une largeur fixe, 34 px — 44 px dès 188 px de contenu —, et 4 px d’écart ».
test('étroite : − et + font 44 px dès 142 px de contenu, et cèdent en dessous — jamais sous 28 px de large ni sous 44 de haut ; 4 px d’écart', () => {
  // Le seuil : une carte de 220 px (188 de contenu) est large.
  assert.ok(ETROITE.startsWith('@container (width < 188px) {'));
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 4 ; T9, T18) : les carrés ne gardent plus une largeur fixe de 34 px. Comme sur 1c, ils font 44 px à
   * partir de 142 px de contenu — le téléphone de 390 px dans Objets —, ce qui laisse 46 px à la valeur ; en dessous ils cèdent, jamais sous 28 px ; un
   * mot de mode trop long leur prend la place qu'il lui faut (`--o-mot`, 6,2 px par lettre). La grille commune les règle pour toutes les cartes ;
   * l'arithmétique, aux trois largeurs et dans les trois vues, est dans tests/chiffre_carte_etroite.test.mjs. */
  const vars = styleDe(regleEtroite('.o-gabarit > *').replace(/\s*;\s*/g, ';').replace(/:\s+/g, ':'));
  assert.equal(vars['--o-pas'], 'clamp(28px, calc((100cqi - 8px - max(46px, 6.2px * var(--o-mot, 0))) / 2), 44px)', '44 px, puis ils cèdent, jamais sous 28 px');
  assert.equal(vars['--o-pas-ecart'], '4px', '4 px d’écart en étroit');
  assert.equal(vars['--o-reserve'], 'calc(2 * var(--o-pas) + 8px)', 'la place des deux boutons et de leurs écarts');
  // Aucune règle ne touche aux boutons : leur largeur vient de `--o-pas`, leur hauteur reste 44 px.
  assert.ok(!/\.o-rmbtn|flex-shrink|min-width/.test(ETROITE), 'une règle étroite touche aux boutons');
  const pas = /\nconst RM_PAS = (\{[^\n]*\});/.exec(APP);
  assert.ok(pas && pas[1].includes("flex: '0 0 auto'") && pas[1].includes("width: 'var(--o-pas, 44px)'") && pas[1].includes('height: 44,') && !pas[1].includes('minWidth'), pas && pas[1]);
  // T18 : la carte pose sur sa rangée du bas la longueur du plus long mot de sa valeur.
  assert.deepEqual([motLePlusLong('Frostschutz'), motLePlusLong('Ochrona przed zamarzaniem'), motLePlusLong('22,0°'), motLePlusLong('Éco')], [11, 11, 5, 3]);
  assert.ok(corps('RoomClimateCard').includes("'--o-mot': motLePlusLong(parMode ? motDuMode : consigne) }}>"), 'le thermostat');
  assert.ok(corps('RoomPilotCard').includes("'--o-mot': motLePlusLong(estModule ? motDuMode : consigne) }}>"), 'le fil pilote');
});

test('étroite : la valeur tient sur une ligne en réduisant sa police, entre 10 et 15 px ; le point s’efface', () => {
  /* `100cqi` est la boîte de CONTENU de la carte, comme la requête : la
   * réserve ne compte que les deux boutons de 34 px et leurs écarts de 4.
   * ASSERTION MODIFIÉE (passe téléphone, tâche 4 ; T9, T18) : la réserve est ce que prennent les boutons, qui cèdent sous 142 px de contenu ou devant un
   * mot long (`--o-reserve`) ; la règle est celle de la grille commune (`o-gab-valeur`). */
  assert.equal(regleEtroite('.o-gab-valeur'), 'font-size: clamp(10px, calc((100cqi - var(--o-reserve)) / (0.62 * var(--o-n, 5))), 15px);');
  const pas = (contenu, mot) => Math.min(44, Math.max(28, (contenu - 8 - Math.max(46, 6.2 * mot)) / 2));
  const taille = (contenu, n, mot = n) => Math.min(15, Math.max(10, (contenu - 2 * pas(contenu, mot) - 8) / (0.62 * n)));
  assert.equal(taille(142, 3), 15, '« Éco » à 390 px : la taille de la maquette');
  assert.ok(Math.abs(taille(127, 8) - 10) < 0.01, '« Hors-gel » à 360 px : 10 px, sur une ligne — sa place s’élargit pour lui');
  assert.equal(taille(127, 25, 11), 10, 'le Hors-gel polonais : 10 px, et il passe à la ligne');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le point du mode ne s'écrit que pour la carte large (`o-seul-large`) — la plaque de l'icône porte déjà sa couleur.
  poser(chModule({ planning: false, mode: null, source: null, jour: null }));
  const html = radiateur(hassModule('eco'));
  assert.ok(html.includes('<span aria-hidden="true" class="o-chauffage-point o-seul-large" style="width:8px;'), 'le point a perdu sa classe : la feuille ne l’effacerait pas');
  /* Un mot de plus de 13 lettres efface son étiquette en étroit : le Hors-gel
   * polonais, trois lignes à 176 px, poussait la rangée de 3,5 px ;
   * ASSERTION MODIFIÉE (relecture de la dernière passe) : le seuil passe de
   * 16 à 13 lettres — « Frost protection » et « Vorstbeveiliging » (16)
   * débordaient à 320 px. Un mot court la garde.
   * ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la règle et l'attribut vivent dans la paire de la grille commune (`ValeurEtiquette`, `o-gab-etiquette`) ;
   * la carte lui passe `long`. */
  assert.equal(regleEtroite('.o-gab-etiquette[data-long]'), 'display: none;');
  for (const long of ['Frost protection', 'Vorstbeveiliging', 'Ochrona przed zamarzaniem', 'Protezione antigelo']) assert.equal(motLong(long), true, long);
  for (const court of ['Éco', 'Hors-gel', 'Confort −1', 'Komfort −2', 'Antihielo', 'Arrêt']) assert.equal(motLong(court), false, court);
  assert.ok(corps('RoomPilotCard').includes('long={estModule && motLong(motDuMode)}'));
  assert.ok(corps('RoomClimateCard').includes('long={parMode && motLong(motDuMode)}'), 'le thermostat, quand sa valeur dit le mode');
  assert.ok(corps('ValeurEtiquette').includes("data-long={long ? '' : undefined}"), 'la paire pose l’attribut que la feuille lit');
  assert.ok(!html.includes('data-long'), '« Éco » garde son étiquette');
  vider();
});

// TITRE MODIFIÉ (passe téléphone, tâche 4 ; T7) : il disait « le nom sur deux lignes en 13 px » ; la grille commune l'écrit en 14 px / 600.
test('étroite : le nom sur deux lignes en 14 px, coupé aux espaces — un mot trop long finit en « … » ; l’état dessous, sur toute la largeur', () => {
  /* ASSERTION MODIFIÉE (relecture de la dernière passe) : `overflow-wrap:
   * normal` devient `break-word`. Un nom d'un seul long mot (« Arbeitszimmer »,
   * « Kinderkamer ») débordait de sa colonne ; `break-word` ne coupe dans un
   * mot que s'il ne tient pas seul sur sa ligne : un nom ordinaire se coupe
   * toujours aux espaces.
   * ASSERTION MODIFIÉE (chantier Lumières, 11 bis, R8) : `break-word` redevient
   * `normal`. Un nom ne se coupe JAMAIS dans un mot : « Climatisatio / n » à 360 px,
   * « Schlafzimmer », « Thermostat » à 320 px. Un mot qui ne tient pas dans sa colonne
   * finit en « … » — le gabarit commun (`NOM_CARTE`) rogne et ajoute les points.
   * ASSERTION MODIFIÉE (passe téléphone, tâche 4 ; T7) : le nom est celui de la grille commune (`o-gab-nom`) — 14 px / 600, sur toute la largeur : la
   * température est montée en haut. */
  const nom = regleEtroite('.o-gab-nom');
  for (const d of ['font-size: 14px !important', 'font-weight: 600 !important', 'line-height: 16px', 'white-space: normal !important', 'overflow-wrap: normal', 'display: -webkit-box',
    '-webkit-box-orient: vertical', '-webkit-line-clamp: 2']) {
    assert.ok(nom.includes(d), 'le nom : ' + d);
  }
  assert.ok(!/overflow-wrap: anywhere|word-break/.test(nom), 'le nom se couperait n’importe où, même entre deux mots qui tiennent');
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le texte ne s'efface plus dans la grille du milieu ; la phrase est celle de la grille commune, sur une ligne.
  assert.ok(!CSS.includes('.o-chauffage-texte'), 'le texte ne s’efface plus dans la grille');
  assert.equal(regleEtroite('.o-gab-phrase'), 'line-height: 15px; font-size: clamp(10.5px, calc(100cqi / (0.58 * var(--o-n, 20))), 12px) !important;');
  /* La température rétrécit — 20 px, « ° » de 12 — et s'approche du nom (4 px) :
   * mesuré sur une carte de 161 px, « Thermostat » en 13 px demande 74 px, et
   * 10 px d'écart ne lui en laissaient que 70. ASSERTION MODIFIÉE (relecture de
   * la dernière passe) : le budget compte le liseré — 184 − 2 × 16 − 2 × 1 =
   * 150 px de contenu, pas 152 ; un nom sur deux lignes débordait d'1 px dans
   * Objets. Le pied passe de 10 à 9 px : 38 + 10 + 32 + 2 + 15 + 9 + 44 = 150.
   * ASSERTION MODIFIÉE (passe téléphone, tâche 4 ; T6) : la température monte en haut à droite (`ChiffreHaut`, 22 px) ; ses tailles étroites sont parties. */
  const vars = styleDe(regleEtroite('.o-gabarit > *').replace(/\s*;\s*/g, ';').replace(/:\s+/g, ':'));
  assert.deepEqual([vars['--o-piece-taille'], vars['--o-piece-degre'], vars['--o-piece-ecart'], vars['--o-milieu-haut'], vars['--o-pied-haut']],
    [undefined, undefined, undefined, '10px', '9px']);
  const budget = 38 + parseInt(vars['--o-milieu-haut'], 10) + 2 * 16 + 2 + 15 + parseInt(vars['--o-pied-haut'], 10) + 44;
  assert.ok(budget <= 184 - 2 * 16 - 2 * 1, 'la carte étroite déborde : ' + budget + ' px pour 150');
  // La carte : la grille du milieu, le texte (nom puis état), la température à la première rangée.
  poser(chModule({ mode: 'eco' }));
  const html = radiateur(hassModule('eco'));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le texte n'a plus de classe, le nom porte celle de la grille commune.
  assert.ok(html.includes('<div style="display:grid;grid-template-columns:minmax(0, 1fr) auto;align-items:end;margin-top:var(--o-milieu-haut, 14px)"><div style="min-width:0"><div class="o-gab-nom" style="font-size:14px;'), 'la grille du milieu ou son texte ont changé');
  vider();
});

test('le rouge reste aux alertes : aucune surface du chauffage ne revient à --o-bad', () => {
  /* « Celles de la maquette » (11/10) : l'orange de la chauffe, le bleu du
   * froid ; le rouge réservé aux alertes. Les cartes 1a, mais aussi la
   * compacte, les chips, le mini-climat d'une pièce, la tuile « n zones
   * chauffent » de l'Accueil, le composeur et la pastille de domaine en
   * édition (relecture de la partie A). La fiche et `.rb-chauffage` sont à
   * la partie B. */
  for (const nom of ['RoomClimateCard', 'RoomPilotCard', 'TemperaturePiece']) {
    assert.ok(!corps(nom).includes('--o-bad'), nom + ' : le rouge du climat revient');
  }
  // La compacte et les chips servent aussi l'alarme, qui garde son rouge : seul leur climat change.
  for (const nom of ['CvCard', 'CvChip', 'CvChips']) {
    assert.ok(!/'climate' \? 'var\(--o-bad\)'/.test(corps(nom)), nom + ' : le rouge du climat revient');
    assert.ok(corps(nom).includes("'climate' ? teinteClimat(st)"), nom + ' : un climat ne prend plus la teinte de ses cartes');
  }
  const piece = corps('PieceCard');
  assert.ok(!/clim\.on \? [^\n]*--o-bad/.test(piece) && !piece.includes("flash('var(--o-bad)'); clim.onToggle();"), 'le mini-climat de la pièce');
  assert.ok(piece.includes("flash(clim.froid ? 'var(--o-cold)' : 'var(--o-warn2)'); clim.onToggle();"));
  assert.ok(APP.includes('<LigneMoment key="clim" icone="flame" rgb="var(--o-warn2-rgb)"'), 'la tuile « n zones chauffent » de l’Accueil');
  assert.ok(APP.includes("{ id: 'chauffage', label: tr('Chauffage'), fi: 'flame', rgb: 'var(--o-warn2-rgb)' }"), 'la pastille de domaine en édition');
  assert.ok(APP.includes("sous: tr('Zone de chauffage') + (z.room ? ' · ' + z.room : ''), fi: 'flame', rgb: 'var(--o-warn2-rgb)'"), 'le composeur');
  assert.ok(!/fi: 'flame', rgb: 'var\(--o-bad-rgb\)'|key="clim" icone="flame" rgb="var\(--o-bad-rgb\)"/.test(APP));
  // La compacte d'un thermostat qui chauffe : l'orange, plus le rouge ; celle d'un climatiseur : le bleu.
  const compacte = (attrs, etat) => renderToStaticMarkup(createElement(CvCard, { id: POELE, hass: hassPoele(attrs, etat), dense: true }));
  const chaud = compacte({ hvac_action: 'heating' });
  assert.ok(chaud.includes('--o-warn2') && !chaud.includes('--o-bad'), chaud.slice(0, 300));
  const froid = compacte({ hvac_action: 'cooling', hvac_modes: ['off', 'cool'] }, 'cool');
  assert.ok(froid.includes('--o-cold') && !froid.includes('--o-bad'));
  // Une ALERTE reste rouge : la sirène, l'alarme déclenchée.
  assert.ok(APP.includes("{ id: 'sirene', label: tr('Sirène'), fi: 'bell-ring', rgb: 'var(--o-bad-rgb)' }"));
  assert.ok(corps('CvChip').includes("st.state === 'triggered' ? 'var(--o-bad)'"));
});

test('relecture de la dernière passe : une fenêtre ouverte n’est pas une alerte ; la tuile de l’Accueil a son espace', () => {
  // La fiche du thermostat : « Fenêtre ouverte : oui » à l'ambre de la carte, plus au rouge des alertes.
  const fiche = corps('RoomClimateSheet');
  assert.ok(fiche.includes("<FicheValeur couleur={ouverts.length ? 'var(--o-warn)' : 'var(--o-ok)'}>"), 'la fenêtre ouverte de la fiche');
  assert.ok(!fiche.includes("ouverts.length ? 'var(--o-bad)'"));
  // La tuile « n zones chauffent » : l'espace qui manquait avant `nom=` (son compte est pour la tâche 12).
  assert.ok(APP.includes('<LigneMoment key="clim" icone="flame" rgb="var(--o-warn2-rgb)" nom={trN(chauffe.length,'));
  assert.ok(!APP.includes('rgb="var(--o-warn2-rgb)"nom='));
});

test('une clim qui sèche ou ventile ne prend aucune teinte : ni l’orange, ni le bleu, ni l’accent', () => {
  const ventile = { hvac_action: 'fan', hvac_modes: ['off', 'cool', 'fan_only', 'dry'] };
  for (const [attrs, etat] of [[ventile, 'fan_only'], [{ ...ventile, hvac_action: 'drying' }, 'dry']]) {
    const hass = hassPoele(attrs, etat);
    const compacte = renderToStaticMarkup(createElement(CvCard, { id: POELE, hass, dense: true }));
    assert.ok(!/--o-warn2|--o-cold|--o-accent/.test(compacte), etat + ' : ' + compacte.slice(0, 400));
    const puce = renderToStaticMarkup(createElement(CvChip, { id: POELE, hass }));
    assert.ok(!/--o-warn2|--o-cold|--o-accent/.test(puce), etat + ' : ' + puce.slice(0, 400));
  }
  // Témoin : la même compacte, qui chauffe, prend l'orange.
  assert.ok(renderToStaticMarkup(createElement(CvCard, { id: POELE, hass: hassPoele({ hvac_action: 'heating' }), dense: true })).includes('--o-warn2'));
});

// ── Ce que font les gestes (la source) ─────────────────────────────────────

test('« − » sur un thermostat au degré : un vrai cran, hors planning aussi (audit du 19/10)', () => {
  // ± 0,5 arrondi au pas de 1 retombait sur la même consigne : 20 − 0,5 → 20.
  const t = corps('RoomClimateCard');
  assert.ok(t.includes("commander(hass, id, 'set_temperature', consigneVoisine(target, d, a, uT) ?? target + d, 'temperature')"));
  assert.equal(consigneVoisine(20, -1, { target_temp_step: 1 }, 'C'), 19);
  assert.equal(consigneVoisine(20, 1, { target_temp_step: 1 }, 'C'), 21);
  assert.equal(consigneVoisine(20, -1, {}, 'C'), 19.5, 'sans pas publié : le demi-degré');
});

test('les gestes au planning : une reprise en main, jusqu’au prochain changement', () => {
  const t = corps('RoomClimateCard');
  // ASSERTION MODIFIÉE (audit du 19/10) : pas au planning quand il refroidit.
  assert.ok(t.includes('const { etat } = useEtatChauffage();') && t.includes('const auPlanning = !!(ch && ch.planning && !etat.simulation && !refroidit(ch));'));
  assert.ok(t.includes("if (auPlanning) reprendreLaMain(hass, ch, { mode: nv ? 'confort' : 'arret' }, () => setOvOn(null)); else commander(hass, id, 'set_hvac_mode', nv ? modeMarche : 'off');"),
    'la bascule du thermostat : Confort ou Arrêt au planning, l’appareil sinon');
  for (const d of ['-0.5', '0.5']) {
    assert.ok(t.includes(`if (auPlanning) reprendreT(${d}); else setT(${d});`), '« ' + d + ' » ne passe plus par le moteur au planning');
  }
  // La consigne visée : un cran du pas que le serveur appliquera, aux bornes de l'appareil, en °C (ADR 0128).
  assert.ok(t.includes('const vise = consigneVoisine(target, d, a, uT);'), '± 0,5 se perdait au pas d’un appareil au degré, ou en °F');
  assert.ok(t.includes("const p = vise != null && actionsPlan(id, 'set_temperature', vise, actionCtx(hass));"));
  assert.ok(t.includes('if (!p || !p.ok || p.data.temperature === target) return;'), 'une consigne qui ne bouge pas (une borne) poserait une reprise en main pour rien');
  /* ASSERTION MODIFIÉE (30/10) : la consigne de la PIÈCE part, celle de l'appareil moins le décalage de son
   * capteur (`decalageEn(ch, 'C')`, 0 sans décalage), au dixième. */
  assert.ok(t.includes("reprendreLaMain(hass, ch, { temperature: Math.round((versCelsius(p.data.temperature, uT) - decalageEn(ch, 'C')) * 10) / 10 }, () => setOv(null));"),
    'la consigne partirait dans l’unité de la maison, ou l’avance resterait au refus');
  /* ASSERTION MODIFIÉE (relecture de la partie B, point c, prise à la tâche
   * 10 bis D) : − / + d'un VTherm partent du mode APPLIQUÉ — celui que la
   * carte montre —, plus du mode voulu : un Confort −1 voulu, que le VTherm
   * reçoit en Confort (il n'a pas de Confort −1), faisait poser par « + » une
   * reprise en Confort… qu'il avait déjà. */
  assert.ok(t.includes("if (ch.famille === 'vtherm') { const m = modeVoisin(ch.modes, ch.applique || ch.mode, d);"), 'un VTherm ne reçoit jamais de consigne');
  const p = corps('RoomPilotCard');
  assert.ok(p.includes('const { etat } = useEtatChauffage(estModule);'), 'une zone décrite à la main ferait interroger le moteur');
  // Le mode d'un module a sa place à lui ; la consigne d'une zone décrite à la main garde la sienne.
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la paire valeur / étiquette vit dans `ValeurEtiquette` ; la carte lui passe la valeur et ce qu'elle est.
  assert.ok(p.includes("<ValeurEtiquette valeur={estModule ? motDuMode : consigne} dit={estModule ? tr('Mode') : tr('Consigne')}"),
    'le mode d’un module ne s’annonce plus « Mode Éco »');
  assert.ok(p.includes('if (auPlanning) reprendreLaMain(hass, ch, { mode: m }, () => { setOvMode(null); if (annuler) annuler(); });'));
  assert.ok(p.includes('else poserMode(ch.options[m]);'), 'planning éteint, l’option telle que le module l’écrit');
  assert.ok(p.includes('const moins = ch && modeVoisin(ch.modes, mode, -1), plus = ch && modeVoisin(ch.modes, mode, 1);'));
  assert.ok(p.includes("const cible = nv ? 'confort' : 'arret';"), 'la bascule d’un module : Arrêt ↔ Confort');
  assert.ok(p.includes('const [ovMode, setOvMode] = useOptimiste(modeLu);'), 'le mode affiché d’avance passe par useOptimiste');
});

test('la reprise en main : le message, l’état rendu posé, le refus dit et l’avance retirée', async () => {
  const ch = { cle: 'chambre-1', entite: SEL };
  const recu = [];
  const etat = { chauffages: [], minute: [0, 640] };
  vider();
  await reprendreLaMain({ callWS: async (m) => { recu.push(m); return etat; } }, ch, { mode: 'eco' }, () => assert.fail('rien à retirer'), () => assert.fail('rien à dire'));
  assert.deepEqual(recu, [{ type: 'loggia/chauffage/main', chauffage: 'chambre-1', mode: 'eco', fin: 'prochain' }]);
  assert.equal(lireEtatChauffage().etat, etat, 'la réponse est l’état : il remplace le cache');
  // Un refus nommé : l'avance se retire, et le toast le dit par son code.
  const refus = { code: 'chauffage_sans_planning', message: 'planning eteint pour ce chauffage: chambre-1' };
  const dits = [];
  let retraits = 0;
  await reprendreLaMain({ callWS: () => Promise.reject(refus) }, ch, { temperature: 20.5 }, () => { retraits += 1; }, (e) => dits.push(e));
  assert.equal(retraits, 1);
  assert.deepEqual(dits, [refus], 'le refus part tel quel : `texteRefus` le dit — « Le planning de ce chauffage est éteint. »');
  assert.equal(lireEtatChauffage().etat, etat, 'un refus ne touche pas au cache');
  // Une coupure, sans code : dite comme une commande d'appareil perdue.
  for (const coupure of [3, new Error('Connection lost')]) {
    const vus = [];
    await reprendreLaMain({ callWS: () => Promise.reject(coupure) }, ch, { mode: 'arret' }, () => {}, (e) => vus.push(e));
    assert.equal(vus.length, 1);
    assert.equal(vus[0].code, 'service_error', String(coupure));
  }
  // Sans pont vers Home Assistant : la même chose, rien ne tombe.
  const sansPont = [];
  await reprendreLaMain(null, ch, { mode: 'eco' }, () => {}, (e) => sansPont.push(e));
  assert.equal(sansPont[0].code, 'service_error');
  vider();
});

// ── Le compte des actifs d'Objets ───────────────────────────────────────────

/** Une maison : un module fil pilote dans la chambre, et sa puissance (ou pas). */
function maison({ option = 'comfort', watts = '612', capteur = true } = {}) {
  const ents = [{ ...entity(SEL, { device: 'd_module' }), famille: 'fil_pilote' }, entity('switch.radiateur_chambre', { device: 'd_module' })];
  const st = [
    state(SEL, option, { friendly_name: 'Radiateur Chambre Pilot wire mode', options: NODON }),
    state('switch.radiateur_chambre', 'on', { friendly_name: 'Radiateur Chambre' }),
  ];
  if (capteur) {
    ents.push(entity(PUI, { device: 'd_module' }));
    st.push(state(PUI, watts, { device_class: 'power', unit_of_measurement: 'W' }));
  }
  return { areas: [area('chambre', 'Chambre')], devices: [device('d_module', 'Radiateur Chambre', 'chambre')], entities: ents, floors: [], states: states(...st), energyPrefs: null };
}
/** Les objets qu'Objets fait de cette maison. */
function objetsDe(fx) {
  const ctx = ctxOf(fx);
  setLoggiaState({ index: ctx.index, ent: {}, cfg: {}, resolved: { climate: resolveClimate(ctx) } });
  try {
    return objetsDeLaMaison({ states: fx.states }, [], new Set());
  } finally {
    setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
}
function actif(o) {
  const z = objetsDe(maison(o)).find(x => x.cle === 'zone:' + SEL);
  assert.ok(z, 'le module n’a pas sa carte');
  return z.actif;
}

test('Objets compte un module qui chauffe — plus de 10 W, comme sa carte', () => {
  assert.equal(actif({ watts: '612' }), true);
  assert.equal(actif({ watts: '5' }), false, '5 W : au repos, même en Confort');
  assert.equal(actif({ watts: '0', option: 'comfort' }), false);
  assert.equal(actif({ watts: 'unavailable' }), false, 'une mesure illisible ne compte pas');
  assert.equal(actif({ watts: '1500', option: 'off' }), true, 'la mesure passe avant l’ordre, comme sur la carte');
});

test('Objets, un module sans capteur de puissance : actif tant qu’il n’est pas à l’Arrêt', () => {
  assert.equal(actif({ capteur: false, option: 'comfort' }), true);
  assert.equal(actif({ capteur: false, option: 'frost_protection' }), true);
  assert.equal(actif({ capteur: false, option: 'off' }), false);
  assert.equal(actif({ capteur: false, option: 'unavailable' }), false, 'un module muet ne fait rien');
});

test('Objets, filtre Chauffage : « 5 appareils · 2 chauffent », comptés comme ses actifs', () => {
  /* La maquette : « 5 appareils · 2 chauffent » dans l'en-tête de la section.
   * Ce qui chauffe se compte comme les actifs d'Objets — un module à plus de
   * 10 W —, un thermostat seulement quand `hvac_action` vaut `heating` : un
   * climatiseur qui refroidit est actif, il ne chauffe pas. */
  const fx = maison({ watts: '612' });
  const module = objetsDe(fx).filter(o => o.cle === 'zone:' + SEL);
  assert.equal(chauffentParmi(module, fx.states), 1);
  const froid = maison({ watts: '0' });
  assert.equal(chauffentParmi(objetsDe(froid).filter(o => o.cle === 'zone:' + SEL), froid.states), 0);
  const S = {
    'climate.salon': { state: 'heat', attributes: { hvac_action: 'heating' } },
    'climate.bureau': { state: 'cool', attributes: { hvac_action: 'cooling' } },
    'climate.chambre': { state: 'heat', attributes: { hvac_action: 'idle' } },
  };
  const climat = (id, actifs) => ({ cle: id, id, type: 'entite', domaine: 'climate', actif: actifs });
  assert.equal(chauffentParmi([climat('climate.salon', true), climat('climate.bureau', true), climat('climate.chambre', false)], S), 1,
    'le salon chauffe ; le bureau refroidit ; la chambre est au repos');
  assert.equal(chauffentParmi([], S), 0);
  /* UNE règle, celle des cartes (relecture de la partie A) — plus l'« actif »
   * d'Objets : un module SANS capteur de puissance, en Éco, est actif, mais
   * sa carte dit « Sans planning », en gris ; un thermostat éteint qui garde
   * `hvac_action: heating` ne chauffe pas. */
  const sansCapteur = maison({ capteur: false, option: 'eco' });
  const zoneSansCapteur = objetsDe(sansCapteur).filter(o => o.cle === 'zone:' + SEL);
  assert.equal(zoneSansCapteur[0].actif, true, 'témoin : Objets le compte actif');
  assert.equal(chauffentParmi(zoneSansCapteur, sansCapteur.states), 0, 'mais il ne chauffe pas');
  assert.equal(chauffentParmi([climat('climate.salon', true)], { 'climate.salon': { state: 'off', attributes: { hvac_action: 'heating' } } }), 0,
    'éteint, un `heating` resté dans ses attributs ne compte pas');
  assert.equal(chauffentParmi([climat('climate.salon', false)], { 'climate.salon': { state: 'unavailable', attributes: {} } }), 0);
  // Relecture de la dernière passe : `unknown` est muet comme `unavailable` ; préchauffer, c'est chauffer.
  assert.equal(chauffentParmi([climat('climate.salon', false)], { 'climate.salon': { state: 'unknown', attributes: { hvac_action: 'heating' } } }), 0);
  assert.equal(chauffentParmi([climat('climate.salon', true)], { 'climate.salon': { state: 'heat', attributes: { hvac_action: 'preheating' } } }), 1);
  // Un module muet ne chauffe pas, même si sa prise mesure encore.
  const zoneModule = { cle: 'zone:' + SEL, type: 'zone', zone: MODULE, actif: true };
  assert.equal(chauffentParmi([zoneModule], hassModule('eco', '612').states), 1, 'témoin : vivant, il chauffe');
  assert.equal(chauffentParmi([zoneModule], hassModule('unavailable', '612').states), 0);
  // Une zone décrite à la main : la règle de sa carte — en marche, la pièce sous sa consigne.
  const zoneMain = { cle: 'zone:chambre', type: 'zone', zone: ZONE, actif: true };
  const hassZ = hassZone();
  assert.equal(chauffentParmi([zoneMain], hassZ.states), 0, '19,2° pour 19 voulus : au repos, comme le dit sa carte');
  hassZ.states['input_number.consigne_chambre'].state = '20';
  assert.equal(chauffentParmi([zoneMain], hassZ.states), 1, '19,2° pour 20 voulus : elle chauffe');
  assert.ok(radiateur(hassZ, ZONE).includes(LAVIS), 'et sa carte le dit aussi');
  /* UNE aide pour la carte et pour le compte, la zone décrite à la main
   * comprise (relecture de la dernière passe) : `chauffeDeZone`. */
  assert.ok(corps('chauffentParmi').includes('chauffeDeZone(S, o.zone)'), 'le compte lit les zones à sa façon');
  assert.ok(corps('RoomPilotCard').includes('= chauffeDeZone(S, zone, z, { marche, consigne: target });'), 'la carte lit sa zone à sa façon');
  assert.ok(!corps('RoomPilotCard').includes('enChauffe('), 'la carte décide de nouveau seule de sa chauffe');
  // Une zone décrite dont le thermostat ne dit rien (`unknown`) est muette, et ne chauffe pas — sa carte le dit.
  const ZONE_CLIM = { ...ZONE, id: 'salon', haid: 'climate.salon_zone', type: 'thermostat' };
  const muette = { ...hassZ.states, 'climate.salon_zone': { entity_id: 'climate.salon_zone', state: 'unknown', attributes: {} } };
  assert.deepEqual(chauffeDeZone(muette, ZONE_CLIM), { muet: true, watts: null, chauffe: false });
  assert.equal(chauffentParmi([{ cle: 'zone:salon', type: 'zone', zone: ZONE_CLIM, actif: true }], muette), 0);
  assert.equal(etatDe(radiateur({ states: muette }, ZONE_CLIM)).texte, 'Indisponible');
  // Témoin : son thermostat vivant, la même zone chauffe (19,2° pour 20 voulus).
  const vivante = { ...muette, 'climate.salon_zone': { entity_id: 'climate.salon_zone', state: 'heat', attributes: {} } };
  assert.equal(chauffeDeZone(vivante, ZONE_CLIM).chauffe, true);
  // L'en-tête : le compte des appareils, et « · n chauffent » sous le filtre Chauffage seulement.
  const vue = corps('ObjetsView');
  assert.ok(vue.includes("const chauffent = actuel === 'chauffage' ? chauffentParmi(visibles, S) : 0;"));
  assert.ok(vue.includes("{trN(visibles.length, '{n} appareil', '{n} appareils')}{chauffent ? ' · ' + trN(chauffent, '{n} chauffe', '{n} chauffent') : null}"));
});

/* ── Passe de finition 11 bis (chantier Lumières), R8 : un mot ne se coupe jamais ───────────────────────────
 *
 * Dans Pièces › Bureau, à 360 et 320 px, la carte de la climatisation écrivait « Climatisatio / n » ; mesuré dans la démo avec un détecteur de mots
 * coupés (une Range par mot, deux rectangles à deux hauteurs), à 320 px — des cartes de 141 px, 107 de contenu — en français, en allemand et en polonais :
 * le NOM (« Climatisation », « Radiateur », « Thermostat », « Klimaanlage », « Heizkörper », « Klimatyzator »…), l'ÉTIQUETTE sous la valeur (« Consigne »,
 * « Planning », « Sollwert », « Zeitplan », « Nastawa », « Harmonogram ») et le MOT du mode (« Wyłączone ») ; à 360 px, « Climatisation »,
 * « Schlafzimmer », « Wohnzimmer », « Klimatyzator », « Harmonogram », « Wyłączone ». Trois coupures, une seule source : `overflow-wrap: break-word` sur
 * le nom (index.css), `overflowWrap: 'anywhere'` et `hyphens: 'auto'` sur l'étiquette et sur le mot du mode (App.jsx). Un nom passe à la ligne ENTRE deux
 * mots, sinon il finit en « … » — le gabarit commun (`NOM_CARTE`) y met déjà `overflow: hidden` et `text-overflow: ellipsis`. */
const sansCommentaires = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const BLOC_CHAUFFAGE = () => {
  /* ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le bloc du chauffage est parti ; sa carte étroite est celle de la grille commune, dont le bloc —
   * de son conteneur à la fin de sa requête étroite — tient la même règle : aucune déclaration ne coupe un mot. */
  const debut = CSS.indexOf('.o-gabarit { container-type: inline-size; }');
  assert.ok(debut >= 0, 'la grille commune a disparu');
  const fin = CSS.indexOf('\n}\n', CSS.indexOf('@container (width < 188px) {', debut));
  assert.ok(fin > debut, 'la requête étroite de la grille commune');
  return sansCommentaires(CSS.slice(debut, fin));
};

test('11 bis, R8 : le nom d’une carte étroite passe à la ligne entre deux mots, sinon finit en « … » — jamais coupé dans le mot', () => {
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : le nom est celui de la grille commune (`o-gab-nom`), en 14 px / 600.
  const nom = regleEtroite('.o-gab-nom');
  assert.ok(nom.includes('overflow-wrap: normal'), 'le nom ne se coupe qu’entre deux mots : ' + nom);
  assert.ok(!/break-word|anywhere|word-break|hyphens/.test(nom), 'ni `break-word` (qui coupait « Climatisatio / n »), ni `anywhere`, ni césure : ' + nom);
  for (const d of ['font-size: 14px !important', 'line-height: 16px', 'white-space: normal !important', 'display: -webkit-box', '-webkit-box-orient: vertical', '-webkit-line-clamp: 2']) {
    assert.ok(nom.includes(d), 'le reste du nom ne bouge pas — ' + d);
  }
  // Un mot trop long finit en « … » : le nom de la carte, écrit par le gabarit commun, rogne et ajoute les points.
  poser(chModule({ mode: 'eco' }));
  const nomHtml = /<div style="min-width:0"><div class="o-gab-nom" style="([^"]*)">/.exec(radiateur(hassModule('eco')));
  assert.ok(nomHtml && nomHtml[1].includes('overflow:hidden') && nomHtml[1].includes('text-overflow:ellipsis'), 'le nom rogne et finit en « … » : ' + (nomHtml && nomHtml[1]));
  vider();
});

test('11 bis, R8 : l’étiquette et le mot du mode ne se coupent plus — passés à la ligne aux espaces, ils finissent en « … » ; ni `anywhere` ni césure', () => {
  poser(chModule({ mode: 'eco' }));
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : l'étiquette et la valeur portent les classes de la grille commune (`ValeurEtiquette`).
  const etiquette = /class="o-gab-etiquette" style="([^"]*)"/.exec(radiateur(hassModule('eco')));
  assert.ok(etiquette, 'l’étiquette');
  assert.ok(!/overflow-wrap|hyphens/.test(etiquette[1]), 'l’étiquette ne se coupe plus dans le mot : ' + etiquette[1]);
  assert.ok(etiquette[1].includes('overflow:hidden;text-overflow:ellipsis'), 'elle finit en « … » : ' + etiquette[1]);
  assert.ok(etiquette[1].includes('text-transform:uppercase') && etiquette[1].includes('margin-top:3px') && etiquette[1].includes('--o-taille:10px;--o-n:8'), 'le reste de l’étiquette ne bouge pas : ' + etiquette[1]);
  // Le mot du mode : la consigne d'un thermostat, ou le mode d'un module.
  const mot = MOT_MODE('Ochrona przed zamarzaniem');
  assert.ok(!('overflowWrap' in mot) && !('hyphens' in mot), 'le mot du mode ne se coupe plus : ' + JSON.stringify(mot));
  assert.deepEqual([mot.overflow, mot.textOverflow], ['hidden', 'ellipsis'], 'et finit en « … »');
  assert.deepEqual([mot.minWidth, mot['--o-taille'], mot['--o-n'], mot.lineHeight], [0, '10px', 25, 1.1], 'sa taille et son interligne ne bougent pas');
  assert.ok(/class="o-gab-valeur" style="min-width:0;[^"]*overflow:hidden;text-overflow:ellipsis/.test(thermostat(hassPoele())), 'rendu : la consigne rogne aussi');
  // Une seule règle : aucune déclaration du bloc du chauffage — la feuille, hors commentaires — ne coupe un mot, et le code de la carte non plus.
  assert.ok(!/break-word|anywhere|word-break|hyphens/.test(BLOC_CHAUFFAGE()), 'une déclaration coupe encore un mot : ' + (BLOC_CHAUFFAGE().match(/[^;{}]*(break-word|anywhere|word-break|hyphens)[^;{}]*/) || [])[0]);
  // ASSERTION MODIFIÉE (passe téléphone, tâche 4) : la paire valeur / étiquette a quitté les cartes pour `ValeurEtiquette`, lue avec elles.
  const code = [corps('RoomClimateCard'), corps('RoomPilotCard'), corps('ValeurEtiquette')].join('\n') + (/\nconst RM_ETIQUETTE = [^\n]*\n[^\n]*\n/.exec(APP) || [''])[0] + (/\nconst MOT_MODE = [^\n]*\n[^\n]*\n/.exec(APP) || [''])[0];
  assert.ok(code.includes('RM_ETIQUETTE') && code.includes('MOT_MODE'), 'le code des trois emplacements est bien lu');
  assert.ok(!/overflowWrap|hyphens|wordBreak/.test(code), 'le code de la carte ne coupe plus de mot');
  vider();
});

/* ── Passe téléphone, tâche 4 : la carte étroite du radiateur et de la clim (sa décision du 15/10, « ok pour 1c » ; ADR 0202, T6, T9, T13, T18) ──
 *
 * Sous 188 px de contenu, la grille commune : la température de la pièce monte en haut à droite (`ChiffreHaut`, 22 px, son « ° » à 60 %),
 * le nom et la phrase passent sur toute la largeur, − « valeur / étiquette » + font la ligne de commandes. La bascule ne s'écrit que pour la
 * carte large : sur la carte étroite, la marche et l'arrêt passent dans la fiche (T13). La carte large ne change pas. */
test('passe téléphone, T13 : la bascule ne s’écrit que pour la carte large ; la température monte en haut, lue telle quelle', () => {
  poser(chauffage({ cle: POELE, entite: POELE, famille: 'thermostat' }), chModule({ mode: 'eco' }));
  for (const [nom, html] of [['thermostat', thermostat(hassPoele())], ['module', radiateur(hassModule('eco'))], ['zone décrite', radiateur(hassZone(), ZONE)]]) {
    assert.equal((html.match(/role="switch"/g) || []).length, 1, nom + ' : une seule bascule');
    assert.ok(/<span class="o-seul-large" role="switch"/.test(html), nom + ' : celle de la carte large');
    assert.ok(/<span class="o-gab-chiffre o-seul-etroit" style="[^"]*"><span style="letter-spacing:-\.02em">[^<]*<\/span><span style="font-size:\.6em;margin-top:\.08em">°<\/span><\/span>/.test(html), nom + ' : la température en haut, son « ° » à 60 %');
    assert.ok(!/aria-hidden="true" class="o-gab-chiffre/.test(html), nom + ' : lue telle quelle, comme celle de la carte large');
    assert.ok(html.includes('class="o-seul-large" style="grid-column:2;grid-row:1;'), nom + ' : la température du bas, pour la carte large seulement');
  }
  const enHaut = (html) => (/class="o-gab-chiffre[^>]*><span[^>]*>([^<]*)</.exec(html) || [])[1];
  assert.equal(enHaut(thermostat(hassPoele())), '19,0', 'un thermostat se mesure lui-même');
  assert.equal(enHaut(radiateur(hassModule('eco'))), '19,2', 'un module : le capteur de sa pièce');
  assert.equal(enHaut(thermostat(hassPoele({ current_temperature: null }))), undefined, 'sans mesure lisible, rien en haut non plus : jamais un chiffre inventé');
  assert.ok(!thermostat(hassPoele({}, 'unavailable')).includes('role="switch"'), 'muet : aucune bascule, large ou étroite');
  // La marche et l'arrêt vivent dans la fiche — « Marche » pour un thermostat hors planning, vérifié (fichechauffage.jsx).
  assert.ok(readFileSync(new URL('../src/fichechauffage.jsx', import.meta.url), 'utf8').includes('const montrerMarche = libre;'));
  vider();
});

test('passe téléphone, § 2.2 : la paire valeur / étiquette — le préfixe lu, l’étiquette tue sauf quand elle dit qui décide, le point du mode avant la valeur', () => {
  const rendre = (p) => renderToStaticMarkup(createElement(ValeurEtiquette, p));
  const consigne = rendre({ valeur: '22,0°', dit: 'Consigne', etiquette: 'Consigne' });
  assert.ok(consigne.startsWith('<div style="flex:1 1 0%;min-width:0;text-align:center;line-height:1.15">'), 'jamais positionnée : un appui sur elle ouvre la fiche');
  assert.ok(consigne.includes('<span class="o-gab-valeur" style="min-width:0;--o-taille:15px;--o-n:5;line-height:1.15;overflow:hidden;text-overflow:ellipsis"><span class="o-vh">Consigne </span>22,0°</span>'), 'la valeur, et ce qu’elle est au lecteur d’écran');
  assert.ok(consigne.includes('<div aria-hidden="true" class="o-gab-etiquette" style="'), 'l’étiquette ne répète pas « Consigne »');
  const planning = rendre({ valeur: 'Éco', dit: 'Mode', etiquette: 'Planning', lue: true, point: createElement('span', { className: 'o-chauffage-point o-seul-large' }) });
  assert.ok(planning.includes('<div class="o-gab-etiquette" style="'), '« Planning » se lit : il dit qui décide');
  assert.ok(planning.indexOf('o-chauffage-point') < planning.indexOf('o-gab-valeur'), 'le point avant la valeur');
  assert.ok(rendre({ valeur: 'Frost protection', dit: 'Mode', etiquette: 'Mode', long: true }).includes('data-long=""'), 'un mot long efface l’étiquette d’une carte étroite');
  assert.ok(!consigne.includes('data-long'));
});
