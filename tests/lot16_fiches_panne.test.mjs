/* Un appareil en panne se dit en panne dans SA fiche, et une seule fois
 * (lot 16, 05/10 — suite de lot16_thermostat_indispo).
 *
 * L'ADR 0048 veut UN signal pour le hors-ligne, le liseré rouge qui tourne
 * (`o-panne`) : la carte d'un appareil injoignable le porte. Le thermostat, la
 * caméra et le robot absent le portaient aussi dans leur fiche ; les autres
 * fiches qu'ouvre une carte en panne non. Mesuré avant le correctif, entité
 * `unavailable` ou retirée :
 *  - lumière : « Éteinte » (« Allumée » si retirée), interrupteur, jauge et
 *    seize pastilles de couleur qui commandaient l'entité morte ;
 *  - volet : « Fermé », la puce « Fermé » allumée, jauge, puces et Stop ;
 *  - prise : « Éteinte » et l'interrupteur « Alimentée » ;
 *  - serrure : « Indisponible », mais l'interrupteur envoyait `lock.lock` ;
 *    et une serrure `open` (vivante) se disait « Indisponible » ;
 *  - capteur binaire `unknown` : « Fermée », quand sa carte dit « Indisponible » ;
 *  - lecteur : « Rien en lecture », volume 0 %, neuf commandes ;
 *  - capteur : « unavailable » écrit en 44 px, en anglais ;
 *  - zone de chauffage : « AU REPOS » en ambre, puces de mode et préréglage ;
 *  - distributeur (réservoir muet) : « Réservoir 0 % » en rouge, et « Rempli »
 *    (le 05/10, ADR 0155 : la fiche à onglets, fichedistributeur.jsx, rendue
 *    directement — la coquille d'App.jsx ne fait que la charger) ;
 *  - plante (humidité muette), robot `unavailable` et alarme (le bloc de
 *    FicheAppareil, « Armée » en ambre) : pas de liseré.
 * Relecture (contradicteur) : la lumière et la prise mortes proposaient encore
 * « +30 min », une extinction programmée vers l'entité morte ; le lecteur mort
 * gardait sa pochette si l'entité en publiait une ; un code d'alarme en cours
 * de saisie partait vers l'alarme tombée.
 *
 * On REND les fiches (React côté serveur, ADR 0069), par le crochet de
 * lot16_thermostat_indispo : sous `?lot16f`, App.jsx exporte en plus les
 * composants lus ici — le fichier n'est pas touché. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// ASSERTION MODIFIÉE (chantier Lumières, tâche 8) : la fiche d'une lumière reçoit la vue de sa carte, la bascule et la barre de la maison.
// ASSERTION MODIFIÉE (passe téléphone, tâche 1) : la feuille d'un lecteur est chargée à la demande ; App.jsx lui passe ses briques.
// ASSERTION MODIFIÉE (passe téléphone, corrections bis, point 1) : la coquille d'un lecteur (`FicheMedia`) s'exporte aussi, pour être jouée avec sa feuille et sa frontière.
// ASSERTION MODIFIÉE (chantier Capteurs, tâche 1) : les fiches d'un capteur sont chargées à la demande ; App.jsx leur passe ses briques.
// ASSERTION MODIFIÉE (chantier Capteurs, tâche 6) : la fiche d'une mesure reçoit la vue de sa carte.
// ASSERTION MODIFIÉE (chantier Capteurs, correction bis, point 3) : les coquilles d'un capteur et de la fiche de confort s'exportent aussi, pour être jouées.
// ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : la fiche d'un robot reçoit la vue de sa carte (`useVueRobot`), exportée elle aussi.
const NOMS = ['useVueLumiere', 'RmBascule', 'RmJauge', 'RoomCoverSheet', 'RoomSwitchSheet', 'BRIQUES_CAPTEUR', 'useVueMesure', 'RoomLockSheet', 'BRIQUES_MEDIA', 'FicheMedia', 'useVueLecteur',
  'RoomPilotSheet', 'FichePlante', 'FicheAppareil', 'CvAlarm', 'FicheCapteur', 'FicheBinaire', 'RoomComfortModal', 'useVueRobot', 'BRIQUES_SWITCH'];
const EXPOSE = 'data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?lot16f')) return next(url, ctx);",
  '  const r = await next(url.slice(0, -7), ctx);',
  "  return { ...r, source: String(r.source) + ';export { " + NOMS.join(', ') + " };' };",
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(EXPOSE);
const F = await import(new URL('../src/App.jsx?lot16f', import.meta.url).href);
// La fiche d'un robot telle que sa coquille (`FicheRobot`, App.jsx) la monte : la vue de sa carte, 15 s fiche ouverte (chantier IoT, tâche 8).
const FicheRobotContent = (await import(new URL('../src/ficherobot.jsx', import.meta.url).href)).default;
const FicheRobot = (p) => createElement(FicheRobotContent, { ...p, vue: F.useVueRobot(p.hass, p.idRobot, null, true, { rapide: true }) });
const FicheDistributeurContent = (await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href)).default;
const FicheLumiereContent = (await import(new URL('../src/fichelumiere.jsx', import.meta.url).href)).default;
// ASSERTION MODIFIÉE (audit des prises, 19/10) : la feuille d'un switch se charge à la demande ; on la joue telle que sa coquille
// (`RoomSwitchSheet`, App.jsx) la monte, avec les briques d'App.jsx.
const FicheSwitchContent = (await import(new URL('../src/ficheswitch.jsx', import.meta.url).href)).default;
const RoomSwitchSheet = (p) => createElement(FicheSwitchContent, { ...p, briques: F.BRIQUES_SWITCH });
const FC = await import(new URL('../src/fichecapteur.jsx', import.meta.url).href);
// La fiche d'une plante, à la demande (chantier Capteurs, étapes 2 et 3, tâche 10).
const FP = await import(new URL('../src/ficheplante.jsx', import.meta.url).href);
// La fiche d'une mesure telle que sa coquille (`FicheCapteur`, App.jsx) la monte : la vue de sa carte et les briques d'App.jsx.
const FicheMesure = ({ id, hass }) => createElement(FC.default, { id, vue: F.useVueMesure(hass, id), briques: F.BRIQUES_CAPTEUR, onFiche: () => {} });
// La fiche telle que la coquille (`FicheLumiere`, App.jsx) la monte : la vue de la carte, la bascule et la barre de la maison.
const FicheLumiere = ({ id, hass }) => createElement(FicheLumiereContent, { id, vue: F.useVueLumiere(hass, id), bascule: F.RmBascule, jauge: F.RmJauge, onFiche: () => {} });
// Le contenu de la feuille d'un lecteur tel que la coquille (`FicheMedia`, App.jsx) le monte : ses briques d'App.jsx (passe téléphone, tâche 1).
// Il n'est plus la feuille (corrections bis, point 1) : la coquille garde le `BottomSheet` — le test « la coquille garde la feuille », plus bas, la joue.
// ASSERTION MODIFIÉE (chantier Médias, tâche 6 ; M12) : la fiche de sa maquette reçoit la VUE de sa carte (`useVueLecteur`), ses briques et l'ouverture de la fiche universelle.
const FicheMediaContent = (await import(new URL('../src/fichemedia.jsx', import.meta.url).href)).default;
const FicheMedia = ({ id, hass }) => createElement(FicheMediaContent, { id, vue: F.useVueLecteur(hass, id), briques: F.BRIQUES_MEDIA, onFiche: () => {} });
// Les bits d'une enceinte ordinaire : lecture, pause, précédent, suivant, le volume et le muet — sans eux, rien ne se dessine (M11).
const BITS_ENCEINTE = 16384 + 1 + 16 + 32 + 4 + 8;

const QUAND = '2026-10-05T08:00:00Z';
const etat = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: QUAND, attributes });
/* Ce que Home Assistant publie d'une entité indisponible : le nom et les
 * attributs de CAPACITÉ restent (modes, palettes), ceux d'ÉTAT partent. */
const mort = (id, capacites = {}) => etat(id, 'unavailable', { friendly_name: 'Appareil', ...capacites });
const hassDe = (...sts) => ({ states: Object.fromEntries(sts.filter(Boolean).map(s => [s.entity_id, s])),
  callService: () => { throw new Error('rien ne doit partir'); } });
const rendre = (C, props) => renderToStaticMarkup(createElement(C, { onClose: () => {}, ...props }));

const panne = (html) => (html.match(/\bo-panne\b/g) || []).length;
/* Ce qui COMMANDE encore l'appareil : un bouton actif, un interrupteur, une
 * glissière — hors l'épingle et la croix de la feuille, qui ne lui parlent pas. */
const commandes = (html) => [
  // Le bouton ET son texte : « Distribuer » ne se nomme que par lui.
  // La balise ouvrante, puis le texte entre les balises — lu, pas nettoyé par
  // remplacement (CodeQL, 05/10).
  ...(html.match(/<button\b[^>]*>.*?<\/button>/g) || []).map(b => b.match(/^<button\b[^>]*>/)[0] + [...b.matchAll(/>([^<]*)</g)].map(m => m[1]).join(''))
    .filter(b => !/^<button\b[^>]*disabled=""/.test(b) && !/^<button\b[^>]*(title|aria-label)="(Épingler sur la carte|Désépingler|Fermer)"/.test(b)),
  ...(html.match(/role="(switch|slider)"/g) || []),
];
// Le sous-arbre de l'élément qui porte le liseré, équilibré sur ses <div>.
const blocPanne = (html) => {
  const m = /<div\b[^>]*\bclass="[^"]*\bo-panne\b[^"]*"[^>]*>/.exec(html);
  if (!m) return '';
  const re = /<div\b|<\/div>/g; re.lastIndex = m.index;
  for (let r, prof = 0; (r = re.exec(html));) { prof += r[0] === '</div>' ? -1 : 1; if (!prof) return html.slice(m.index, re.lastIndex); }
  return html.slice(m.index);
};
const ouvertureBloc = (html) => (/<div\b[^>]*\bclass="[^"]*\bo-panne\b[^"]*"[^>]*>/.exec(html) || [''])[0];

/* Une fiche morte : elle le dit, porte UN liseré sur le bloc de l'appareil
 * (repéré par `marque`), et ne commande plus rien hors `permis`. */
function morte(nom, html, { marque, permis = [] } = {}) {
  assert.ok(html.includes('Indisponible'), nom + ' : la fiche dit « Indisponible », comme sa carte');
  assert.equal(panne(html), 1, nom + ' : un seul liseré de panne');
  if (marque) assert.ok(blocPanne(html).includes(marque), nom + ' : le liseré est sur le bloc « ' + marque + ' »');
  const restent = commandes(html).filter(c => !permis.some(p => c.includes(p)));
  assert.deepEqual(restent, [], nom + ' : aucune commande ne part vers une entité morte');
}

// ASSERTION MODIFIÉE (chantier Lumières, tâche 8) : la fiche de sa maquette — le liseré sur le panneau de l'appareil, que « Indisponible » marque ; L'appareil reste.
test('lumière : morte ou retirée, ni interrupteur, ni jauge, ni palette', () => {
  const ID = 'light.salon';
  const vive = rendre(FicheLumiere, { id: ID, hass: hassDe(etat(ID, 'on', { friendly_name: 'Lampe', brightness: 150, supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', color_temp_kelvin: 2700 })) });
  assert.equal(panne(vive), 0, 'témoin : vivante, pas de liseré');
  assert.ok(vive.includes('role="switch"') && vive.includes('role="slider"'), 'témoin : interrupteur et jauge');
  for (const st of [mort(ID, { supported_color_modes: ['color_temp', 'hs'] }), null]) {
    const html = rendre(FicheLumiere, { id: ID, hass: hassDe(st) });
    morte('lumière ' + (st ? 'indisponible' : 'retirée'), html, { marque: 'Indisponible', permis: ['L’appareil'] });
    assert.ok(!html.includes('Éteinte') && !html.includes('Couleur') && !html.includes('Minuteur'), 'ni « Éteinte », ni palette, ni minuteur');
  }
});

test('volet : mort, ni « Fermé », ni puces, ni Stop', () => {
  const ID = 'cover.salon';
  // ASSERTION MODIFIÉE (19/10) : la fiche ne propose que ce que le cover accepte — le témoin publie son `supported_features`, comme tout cover de Home Assistant.
  const vive = rendre(F.RoomCoverSheet, { id: ID, hass: hassDe(etat(ID, 'open', { friendly_name: 'Volet', current_position: 60, supported_features: 15 })) });
  assert.equal(panne(vive), 0, 'témoin');
  assert.ok(vive.includes('Arrête le moteur') && vive.includes('aria-pressed="false"'), 'témoin : Stop et puces');
  for (const st of [mort(ID), null]) {
    const html = rendre(F.RoomCoverSheet, { id: ID, hass: hassDe(st) });
    morte('volet', html, { marque: 'Course mesurée par le moteur' });
    assert.ok(!html.includes('Fermé'), 'un volet sans nouvelles n’est pas « Fermé »');
    assert.ok(!html.includes('aria-pressed="true"'), 'aucune puce allumée');
  }
});

test('prise : morte, pas d’interrupteur « Alimentée »', () => {
  const ID = 'switch.prise';
  const vive = rendre(RoomSwitchSheet, { id: ID, hass: hassDe(etat(ID, 'on', { friendly_name: 'Prise' })) });
  assert.equal(panne(vive), 0, 'témoin');
  assert.ok(vive.includes('role="switch"'), 'témoin : l’interrupteur');
  for (const st of [mort(ID), etat(ID, 'unknown'), null]) {
    const html = rendre(RoomSwitchSheet, { id: ID, hass: hassDe(st) });
    morte('prise ' + (st ? st.state : 'retirée'), html, { marque: 'Alimentée' });
    assert.ok(!html.includes('Éteinte'), 'une prise injoignable n’est pas « Éteinte »');
  }
});

test('serrure : morte, pas d’interrupteur ; ouverte, elle n’est pas « Indisponible »', () => {
  const ID = 'lock.porte';
  for (const st of [mort(ID), etat(ID, 'unknown'), null]) {
    morte('serrure ' + (st ? st.state : 'retirée'), rendre(F.RoomLockSheet, { id: ID, hass: hassDe(st) }), { marque: 'Verrouillée' });
  }
  const ouverte = rendre(F.RoomLockSheet, { id: ID, hass: hassDe(etat(ID, 'open', { friendly_name: 'Porte' })) });
  assert.ok(ouverte.includes('Ouverte') && !ouverte.includes('Indisponible'), '`open` est un état vivant');
  assert.equal(panne(ouverte), 0);
  assert.ok(ouverte.includes('role="switch"'), 'vivante, l’interrupteur reste');
});

test('capteur binaire : `unknown` est « Indisponible », comme sur sa carte', () => {
  const ID = 'binary_sensor.porte';
  const vive = rendre(FC.RoomBinarySheet, { id: ID, briques: F.BRIQUES_CAPTEUR, hass: hassDe(etat(ID, 'off', { friendly_name: 'Porte', device_class: 'door' })) });
  assert.ok(vive.includes('Fermée') && panne(vive) === 0, 'témoin');
  for (const st of [etat(ID, 'unknown', { device_class: 'door' }), mort(ID, { device_class: 'door' }), null]) {
    const html = rendre(FC.RoomBinarySheet, { id: ID, briques: F.BRIQUES_CAPTEUR, hass: hassDe(st) });
    // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : la fiche d'une mesure, sans courbe — le liseré est sur le panneau de l'état.
    morte('capteur binaire ' + (st ? st.state : 'retiré'), html, { marque: 'Indisponible' });
    assert.ok(!html.includes('Fermée'), 'pas de relevé inventé');
  }
});

test('lecteur : mort, le liseré sur le panneau de ce qui joue et plus aucune commande', () => {
  const ID = 'media_player.salon';
  // ASSERTION MODIFIÉE (passe téléphone, tâche 1) : la feuille d'un lecteur vit dans fichemedia.jsx, montée comme la coquille la monte.
  // ASSERTION MODIFIÉE (chantier Médias, tâche 6 ; M7, M11) : la fiche de sa maquette — ses commandes viennent des bits du lecteur.
  const vive = rendre(FicheMedia, { id: ID, hass: hassDe(etat(ID, 'playing', { friendly_name: 'Enceinte', media_title: 'Clair de lune', volume_level: .3, supported_features: BITS_ENCEINTE })) });
  assert.equal(panne(vive), 0, 'témoin');
  assert.ok(vive.includes('aria-label="Piste suivante"'), 'témoin : les commandes');
  for (const st of [mort(ID), null]) {
    const html = rendre(FicheMedia, { id: ID, hass: hassDe(st) });
    // Le liseré est sur le panneau de ce qui joue, qui dit « Indisponible » et la phrase de la carte ; L'appareil reste (la règle des fiches).
    morte('lecteur', html, { marque: 'Indisponible', permis: ['L’appareil'] });
    assert.ok(/data-panneau="lecture"/.test(ouvertureBloc(html)), 'le liseré est sur le panneau de ce qui joue');
    assert.ok(!/Rien en lecture|\b0%/.test(html.replace(/<[^>]+>/g, ' ')), 'ni « Rien en lecture » ni volume 0 %');
  }
});

// ASSERTION MODIFIÉE (chantier Capteurs, tâche 6) : la fiche de sa maquette — le liseré sur le panneau du haut, que « — » marque ; L'appareil reste.
test('capteur : mort, « — » et « Indisponible », jamais « unavailable »', () => {
  const ID = 'sensor.temperature';
  const vive = rendre(FicheMesure, { id: ID, hass: hassDe(etat(ID, '21.4', { friendly_name: 'Température', unit_of_measurement: '°C' })) });
  assert.ok(vive.includes('21,4') && panne(vive) === 0, 'témoin');
  for (const st of [mort(ID, { unit_of_measurement: '°C' }), etat(ID, 'unknown', { unit_of_measurement: '°C' }), null]) {
    const html = rendre(FicheMesure, { id: ID, hass: hassDe(st) });
    morte('capteur ' + (st ? st.state : 'retiré'), html, { marque: '—', permis: ['L’appareil'] });
    assert.ok(!/unavailable|unknown/.test(html.replace(/<[^>]+>/g, ' ')), 'aucun mot anglais à l’écran');
    assert.ok(!blocPanne(html).includes('°C'), 'pas d’unité derrière « — »');
  }
});

test('zone de chauffage : thermostat mort, ni « AU REPOS », ni puces, ni préréglage', () => {
  const zone = { id: 'z1', name: 'Salon', haid: 'climate.salon', type: 'climate' };
  const capacites = { hvac_modes: ['off', 'heat'], preset_modes: ['eco', 'comfort'] };
  const vive = rendre(F.RoomPilotSheet, { zone, hass: hassDe(etat(zone.haid, 'heat', { ...capacites, temperature: 19, current_temperature: 20 })) });
  assert.ok(vive.includes('AU REPOS') && panne(vive) === 0, 'témoin');
  const html = rendre(F.RoomPilotSheet, { zone, hass: hassDe(mort(zone.haid, capacites)) });
  morte('zone', html, { marque: 'Indisponible' });
  assert.ok(/border-radius:50%/.test(ouvertureBloc(html)), 'le liseré fait le tour du cadran');
  assert.ok(!html.includes('AU REPOS') && !html.includes('Préréglage'), 'ni « AU REPOS » ni préréglage');
  assert.ok(!html.includes('var(--o-warn)'), 'aucun ambre sur un thermostat mort');
});

test('distributeur : réservoir muet, ni « 0 % » rouge ni « Rempli »', () => {
  /* La fiche à onglets (ADR 0155) : le réservoir est une aide `input_number`,
   * la commande le `select` feed de l'appareil — une AUTRE entité. Le liseré
   * passe sur l'en-tête (« Ce distributeur ne répond plus. »), le réservoir dit
   * « Indisponible », et « Rempli » (l'onglet Entretien) disparaît. */
  const RES = 'input_number.croquettes_reservoir', FEED = 'select.distributeur_feed';
  const cfg = { haid: FEED, haids: { reservoir: RES } };
  const index = { entityMeta: new Map(), deviceMeta: new Map() };
  const feed = etat(FEED, 'STOP', { options: ['STOP', 'START'] });
  // ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I22, I26) : « Je l'ai rempli » est passé à l'Accueil, près du réservoir ; l'onglet
  // Entretien n'existe plus pour le seul réservoir (demandé, il retombe sur l'Accueil).
  const vif = rendre(FicheDistributeurContent, { cfg, index, etat: null, hass: hassDe(feed, etat(RES, '600', { max: 1500, unit_of_measurement: 'g' })), ongletDepart: 'accueil' });
  assert.ok(vif.includes('Je l’ai rempli') && panne(vif) === 0, 'témoin');
  for (const onglet of ['accueil', 'entretien']) {
    const html = rendre(FicheDistributeurContent, { cfg, index, etat: null, hass: hassDe(feed, mort(RES)), ongletDepart: onglet });
    // Les onglets ne parlent pas à l'appareil ; « Distribuer » passe par le select, vivant.
    // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point G) : l'aide du bac seule muette, la vis répond — l'en-tête ne dit plus
    // « ne répond plus » (comme la plaque de la carte) ; le liseré est sur le panneau du réservoir, qui dit « Indisponible ».
    morte('distributeur', html, { marque: 'Indisponible', permis: ['role="tab"', 'Distribuer'] });
    assert.ok(!html.includes('Ce distributeur ne répond plus.'), 'l’en-tête crie à la panne alors que la vis répond');
    assert.ok(html.includes('>Distribuer<'), 'la vis répond : « Distribuer » reste');
    assert.ok(!html.includes('0 %') && !html.includes('Je l’ai rempli') && !html.includes('Rempli') && !html.includes('>Entretien<'), 'ni « Réservoir 0 % » ni « Je l’ai rempli »');
  }
});

/* ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C31) : la fiche d'une plante est celle de sa maquette, à la demande (ficheplante.jsx) —
 * muette, le liseré est sur le panneau de l'état, avec « — » et « Indisponible » ; les rangées des mesures disent « — ». */
test('plante : capteur d’humidité muet, le liseré sur le panneau de l’état', () => {
  const pl = (m) => ({ base: 'b', name: 'Basilic', mort: m, room: 'Salon', hum: m ? null : 40, cond: m ? null : 600, lux: m ? null : 1000, temp: m ? null : 21, uniteTemp: 'C', bat: 80, ids: { hum: 'sensor.b_moisture' } });
  assert.equal(panne(rendre(FP.default, { pl: pl(false), hass: hassDe() })), 0, 'témoin');
  const html = rendre(FP.default, { pl: pl(true), hass: hassDe() });
  assert.equal(panne(html), 1, 'un liseré');
  assert.ok(blocPanne(html).includes('Indisponible') && blocPanne(html).includes('% de sol'), 'sur le panneau de l’état');
});

test('robot injoignable : le liseré sur le panneau de tête, et un seul signal', () => {
  const ID = 'vacuum.robot';
  const vif = renderToStaticMarkup(createElement(FicheRobot, { idRobot: ID, domaine: 'vacuum', hass: hassDe(etat(ID, 'docked', { friendly_name: 'Robot', battery_level: 80 })) }));
  assert.equal(panne(vif), 0, 'témoin');
  const html = renderToStaticMarkup(createElement(FicheRobot, { idRobot: ID, domaine: 'vacuum', hass: hassDe(mort(ID)) }));
  assert.equal(panne(html), 1, 'un liseré');
  assert.ok(/rb-a-hero/.test(ouvertureBloc(html)), 'sur le panneau de tête');
  assert.ok(!html.includes('var(--o-bad)'), 'le point rouge ne double plus le liseré');
  // ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I16) : la tuile « 7 derniers jours » ouvre l'onglet Historique — elle ne parle pas au robot.
  assert.deepEqual(commandes(html).filter(c => !/Réglages|role="tab"|7 derniers jours/.test(c)), [], 'le départ et la base restent inertes');
});

test('alarme (bloc de FicheAppareil) : morte, ni « Armée » ni modes à armer', () => {
  const ID = 'alarm_control_panel.maison';
  const vive = rendre(F.CvAlarm, { id: ID, hass: hassDe(etat(ID, 'disarmed', { friendly_name: 'Alarme', supported_features: 39 })), sans: true });
  assert.ok(vive.includes('Désarmée') && vive.includes('o-armchip') && panne(vive) === 0, 'témoin');
  for (const st of [mort(ID, { supported_features: 39 }), etat(ID, 'unknown', { supported_features: 39 })]) {
    const html = rendre(F.CvAlarm, { id: ID, hass: hassDe(st), sans: true });
    morte('alarme ' + st.state, html);
    assert.ok(!html.includes('Armée') && !html.includes('var(--o-warn2)'), 'ni « Armée » ni ambre');
  }
});

test('déjà justes : FicheAppareil d’une entité morte (son bloc est CvCard)', () => {
  const ID = 'switch.prise';
  const html = rendre(F.FicheAppareil, { id: ID, hass: hassDe(mort(ID)) });
  // Le bloc de tête est la carte elle-même, qui savait déjà : rien n'y change.
  assert.ok(/o-cvcarte/.test(ouvertureBloc(html)), 'le liseré est celui de CvCard');
  morte('FicheAppareil', html, { marque: 'Indisponible' });
});

test('lecteur mort : ni pochette ni fond flouté, et « Indisponible » en text3', () => {
  const ID = 'media_player.salon';
  const image = { entity_picture: '/api/media_player_proxy/media_player.salon' };
  // ASSERTION MODIFIÉE (passe téléphone, tâche 1) : la feuille d'un lecteur vit dans fichemedia.jsx, montée comme la coquille la monte.
  // ASSERTION MODIFIÉE (chantier Médias, tâche 6 ; M7) : la fiche de sa maquette.
  const vive = rendre(FicheMedia, { id: ID, hass: hassDe(etat(ID, 'playing', { friendly_name: 'Enceinte', media_title: 'Clair de lune', supported_features: BITS_ENCEINTE, ...image })) });
  assert.ok(vive.includes('<img'), 'témoin : vivant, la pochette');
  // Une image qui survit à la panne : le liseré (`overflow: visible`) lui ôterait ses coins.
  const html = rendre(FicheMedia, { id: ID, hass: hassDe(mort(ID, image)) });
  assert.ok(!html.includes('<img'), 'aucune image : ni pochette, ni fond flouté');
  assert.ok(/color:var\(--o-bad\)[^>]*>Indisponible</.test(html), '« Indisponible », le mot du panneau, en rouge — comme la phrase de sa carte (M6)');
});

/* TEST AJOUTÉ (passe téléphone, corrections bis, point 1) : la forme de la coquille d'un lecteur, sur le patron de `FicheLumiere`
 * (tests/fiche_lumiere.test.mjs, « L8 : la coquille »).
 *
 * La coquille enveloppait toute la feuille dans la frontière Suspense (repli nul) : si le morceau `fichemedia` ne se chargeait pas
 * (hors ligne, version périmée), l'erreur sortait de la feuille — qui n'existait pas encore — et la vue Objets entière était remplacée
 * par « Cette vue n'a pas pu s'afficher ». Avec la feuille dans la coquille et la frontière DEDANS, la barrière de la feuille (`Barriere`,
 * ui.jsx) attrape l'échec : la panne se dit dans la feuille, avec « Réessayer » et « Recharger ». */
test('lecteur : la coquille garde la feuille et pose la frontière Suspense DEDANS — un morceau qui ne charge pas se dit dans la feuille, jamais à la place de la vue', async () => {
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const i = APP.indexOf('\nfunction FicheMedia(');
  assert.ok(i >= 0, 'la coquille d’un lecteur a disparu d’App.jsx');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(coquille.includes('function FicheMedia({ id, hass, onClose }) {'));
  const feuille = coquille.indexOf('<BottomSheet onClose={onClose}>');
  const frontiere = coquille.indexOf('<Suspense fallback={<div style={{ minHeight: 260 }} />}>');
  // ASSERTION MODIFIÉE (chantier Médias, tâche 6 ; M12) : la coquille passe la vue du lecteur, le glyphe, l'épingle, la fiche universelle et ses briques.
  const contenu = coquille.indexOf('<FicheMediaContent id={id} vue={vue} briques={BRIQUES_MEDIA} onFiche={setFiche}');
  assert.ok(feuille >= 0 && frontiere > feuille && contenu > frontiere, 'la feuille, puis la frontière, puis le contenu : la frontière est DANS la feuille, pas autour d’elle');
  assert.ok(coquille.indexOf('</Suspense>') > contenu && coquille.indexOf('</Suspense>') < coquille.indexOf('</BottomSheet>'), 'et elle se referme avant la feuille');
  assert.ok(APP.includes('{mediaPop && <FicheMedia id={mediaPop} hass={hass} onClose={() => setMediaPop(null)} />}'), 'la vue monte la coquille');
  // Le contenu n'est plus la feuille du LECTEUR : il n'exporte que lui.
  const media = readFileSync(new URL('../src/fichemedia.jsx', import.meta.url), 'utf8');
  assert.ok(media.includes('export default function FicheMediaContent({ id, vue: v, briques, glyphe = null, epingle = null, onFiche = null, maintenant = null }) {'), 'le contenu, sans `onClose` ni `hass` : c’est la coquille qui ferme, et la vue qui porte le `hass` vivant');
  assert.equal((media.match(/^export /gm) || []).length, 1, 'un seul export : le contenu');
  /* ASSERTION MODIFIÉE (passe bis du chantier Mode enfant, 17/10, point 10) : fichemedia.jsx porte désormais UNE feuille — la coquille de la
   * SECONDE feuille, « Réglages parent » (`FicheEnfant`), sur ce même patron : le `BottomSheet`, la frontière Suspense DEDANS avec le repli de
   * 260 px, le contenu à la demande (`ContenuEnfant`, ficheenfant.jsx) dedans. Avant, le `Suspense` (repli nul) était HORS du `BottomSheet`,
   * qui vivait dans le morceau : rien ne s'affichait pendant le chargement, et un morceau manquant tombait dans la barrière du lecteur. */
  assert.equal((media.match(/<BottomSheet/g) || []).length, 1, 'fichemedia.jsx : une seule feuille, la coquille des réglages du mode enfant');
  const j = media.indexOf('\nfunction FicheEnfant({ onClose, ...props }) {');
  assert.ok(j >= 0, 'la coquille de la feuille « Réglages parent » a disparu de fichemedia.jsx');
  const coquilleEnfant = media.slice(j, media.indexOf('\n}\n', j));
  const feuilleE = coquilleEnfant.indexOf('<BottomSheet onClose={onClose}>'), frontiereE = coquilleEnfant.indexOf('<Suspense fallback={<div style={{ minHeight: 260 }} />}>'), contenuE = coquilleEnfant.indexOf('<ContenuEnfant {...props} />');
  assert.ok(feuilleE >= 0 && frontiereE > feuilleE && contenuE > frontiereE, 'réglages parent : la feuille, puis la frontière, puis le contenu — la frontière est DANS la feuille');
  assert.ok(coquilleEnfant.indexOf('</Suspense>') > contenuE && coquilleEnfant.indexOf('</Suspense>') < coquilleEnfant.indexOf('</BottomSheet>'), 'et elle se referme avant la feuille');
  const enfant = readFileSync(new URL('../src/ficheenfant.jsx', import.meta.url), 'utf8');
  assert.ok(!/<BottomSheet|import \{[^}]*\bBottomSheet\b/.test(enfant), 'ficheenfant.jsx repose la feuille : un morceau absent retomberait hors de toute barrière');
  assert.ok(enfant.includes('export default function ContenuEnfant({ hass, ident, nom, piece = null, zone, etat = null, config = null, lecteurs = [], briques, admin = false, onCode = null }) {'), 'le contenu, sans `onClose` : c’est la coquille qui ferme');
  assert.equal((enfant.match(/^export /gm) || []).length, 1, 'ficheenfant.jsx : un seul export, le contenu');

  // Joué : la feuille s'ouvre d'emblée et son repli tient la place du contenu ; puis le contenu s'y charge, dedans.
  const ID = 'media_player.salon';
  const hass = hassDe(etat(ID, 'playing', { friendly_name: 'Enceinte', media_title: 'Clair de lune', volume_level: .3, supported_features: BITS_ENCEINTE }));
  const avant = rendre(F.FicheMedia, { id: ID, hass });
  assert.ok(avant.includes('role="dialog"') && avant.includes('min-height:260px'), 'avant l’arrivée du morceau : la feuille est là, son repli tient la hauteur d’une fiche');
  assert.ok(!avant.includes('aria-label="Piste suivante"'), 'et le contenu n’y est pas encore');
  await new Promise(r => setTimeout(r, 50));
  const apres = rendre(F.FicheMedia, { id: ID, hass });
  assert.ok(apres.includes('aria-label="Piste suivante"') && !apres.includes('min-height:260px'), 'le morceau arrivé, le contenu remplace le repli');
  assert.ok(apres.indexOf('role="dialog"') >= 0 && apres.indexOf('role="dialog"') < apres.indexOf('aria-label="Piste suivante"'), 'et il est DANS la feuille');
});

/* TEST AJOUTÉ (chantier Capteurs, correction bis, point 3) : les TROIS coquilles d'un capteur — la fiche d'une mesure (`FicheCapteur`), celle d'un capteur
 * binaire (`FicheBinaire`) et la fiche de confort d'une pièce (`RoomComfortModal`) — sur le patron de `FicheMedia`. Les deux dernières posaient la
 * frontière Suspense AUTOUR de la feuille, et la feuille vivait dans le module : un morceau introuvable faisait tomber toute la vue Objets, ou toute la
 * vue d'une pièce — une régression, ces fiches étaient au démarrage. La coquille garde la feuille, la frontière est DEDANS, le module n'exporte que des
 * contenus, sans `BottomSheet`. */
test('capteurs : les trois coquilles gardent la feuille et posent la frontière Suspense DEDANS — un morceau qui ne charge pas se dit dans la feuille', async () => {
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const [nom, signature, contenu] of [
    ['FicheCapteur', 'function FicheCapteur({ id, hass, onClose }) {', '<FicheCapteurContent id={id} vue={vue}'],
    // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : la coquille passe le `hass` vivant, la pièce, la famille, l'épingle et L'appareil.
    ['FicheBinaire', 'function FicheBinaire({ id, hass, onClose }) {', '<FicheBinaireContent id={id} hass={H} briques={BRIQUES_CAPTEUR} piece={zoneDe(id)}'],
    ['RoomComfortModal', 'function RoomComfortModal({ piece, hass, onClose, bruitId = null }) {', '<FicheConfortContent piece={piece} hass={hass} bruitId={bruitId} briques={{ Sparkline, hx }} />'],
  ]) {
    const i = APP.indexOf('\nfunction ' + nom + '(');
    assert.ok(i >= 0, nom + ' a disparu d’App.jsx');
    const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
    assert.ok(coquille.includes(signature), nom);
    const feuille = coquille.indexOf('<BottomSheet onClose={onClose}>');
    const frontiere = coquille.indexOf('<Suspense fallback={<div style={{ minHeight: 260 }} />}>');
    const c = coquille.indexOf(contenu);
    assert.ok(feuille >= 0 && frontiere > feuille && c > frontiere, nom + ' : la feuille, puis la frontière, puis le contenu');
    assert.ok(coquille.indexOf('</Suspense>') > c && coquille.indexOf('</Suspense>') < coquille.indexOf('</BottomSheet>'), nom + ' : la frontière se referme avant la feuille');
  }
  // Les modules ne reposent plus la feuille : ni `<BottomSheet>`, ni son import ; ce que la coquille ferme, ils ne le reçoivent plus.
  for (const f of ['fichecapteur.jsx', 'ficheconfort.jsx']) {
    const src = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
    assert.ok(!/<BottomSheet|import \{[^}]*\bBottomSheet\b/.test(src), f + ' repose la feuille : un morceau absent retomberait hors de toute barrière');
  }
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : la fiche d'un binaire reçoit sa pièce, sa famille, son épingle, sa plaque et L'appareil.
  assert.ok(readFileSync(new URL('../src/fichecapteur.jsx', import.meta.url), 'utf8').includes('export function RoomBinarySheet({ id, hass, briques, piece = null, famille = null, epingle = null, glyphe = null, onFiche = null, maintenant = null }) {'));
  assert.ok(readFileSync(new URL('../src/ficheconfort.jsx', import.meta.url), 'utf8').includes('export default function RoomComfortModal({ piece, hass, bruitId = null, briques }) {'));

  // Jouées : la feuille s'ouvre d'emblée et son repli tient la place du contenu ; puis le contenu s'y charge, dedans.
  const ID = 'binary_sensor.porte';
  const hass = hassDe(etat(ID, 'off', { friendly_name: 'Porte', device_class: 'door' }));
  const avant = rendre(F.FicheBinaire, { id: ID, hass });
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 4 ; C26) : « Relevé » est parti ; le contenu se reconnaît à « Dernier signal ».
  assert.ok(avant.includes('role="dialog"') && avant.includes('min-height:260px') && !avant.includes('Dernier signal'), 'avant le morceau : la feuille, et son repli');
  await new Promise(r => setTimeout(r, 50));
  const apres = rendre(F.FicheBinaire, { id: ID, hass });
  assert.ok(apres.includes('Dernier signal') && !apres.includes('min-height:260px') && apres.indexOf('role="dialog"') < apres.indexOf('Dernier signal'), 'le contenu, dans la feuille');
  const piece = { name: 'Salon', bg: 'var(--o-s1)', icon: null, live: { temp: 21.4, hum: 47, co2: 612 } };
  rendre(F.RoomComfortModal, { piece, hass: hassDe() });
  await new Promise(r => setTimeout(r, 50));
  const confort = rendre(F.RoomComfortModal, { piece, hass: hassDe() });
  assert.ok(confort.includes('role="dialog"') && confort.indexOf('role="dialog"') < confort.indexOf('Salon') && confort.includes('aria-label="Fermer"'), 'la fiche de confort, sa croix, dans sa feuille');
});

test('minuteur et code d’alarme : rien ne se programme vers un appareil mort', () => {
  /* La rangée du minuteur lit le composant par un effet : le rendu serveur ne
   * la montre pas. On lit donc la source — minuteur.test épingle le reste. */
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const bloc = (nom) => { const d = APP.indexOf('function ' + nom + '('); assert.ok(d >= 0, nom); return APP.slice(d, APP.indexOf('\n}\n', d)); };
  // ASSERTION MODIFIÉE (audit des prises, 19/10) : la rangée du minuteur et la feuille d'un switch vivent dans ficheswitch.jsx.
  const SW = readFileSync(new URL('../src/ficheswitch.jsx', import.meta.url), 'utf8');
  const blocSw = (nom) => { const d = SW.indexOf('function ' + nom + '('); assert.ok(d >= 0, nom); return SW.slice(d, SW.indexOf('\n}\n', d)); };
  const minuteur = blocSw('RangeeMinuteur');
  assert.ok(minuteur.includes('if (mort && reste == null) return null;'), 'mort, sans minuteur en cours : pas de rangée');
  // ASSERTION MODIFIÉE (audit de l'écran des prises, 19/10) : ni mort, ni éteint — le serveur refuse un minuteur sur un appareil éteint.
  assert.ok(minuteur.includes('{!mort && !eteint && <FicheBouton icone="clock"'), '« +30 min » ne se propose plus');
  assert.ok(minuteur.includes("type: 'loggia/minuteurs/annuler', entity_id: id"), 'un minuteur déjà posé s’annule encore');
  // ASSERTION MODIFIÉE (chantier Lumières, tâche 8) : la fiche d'une lumière a son minuteur, celui des prises ; muette, elle ne le montre pas.
  assert.ok(readFileSync(new URL('../src/fichelumiere.jsx', import.meta.url), 'utf8').includes('{!v.muette && (() => {'), 'la lumière muette ne propose pas de minuteur');
  assert.ok(blocSw('FicheSwitchContent').includes('<RangeeMinuteur hass={hass} id={id} mort={mort} briques={briques} />'), 'la prise passe sa panne');
  for (const s of [APP, SW]) assert.ok(!/<RangeeMinuteur(?![^>]*mort=)[^>]*\/>/.test(s), 'aucun appel ne l’oublie');
  assert.ok(bloc('CvAlarm').includes('{demande && !mort ? ('), 'un code en cours de saisie ne part pas vers une alarme morte');
});
