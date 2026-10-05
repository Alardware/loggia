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

const NOMS = ['RoomLightSheet', 'RoomCoverSheet', 'RoomSwitchSheet', 'RoomBinarySheet', 'RoomLockSheet', 'RoomMediaSheet',
  'SensorSheet', 'RoomPilotSheet', 'FichePlante', 'FicheAppareil', 'CvAlarm'];
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
const FicheRobot = (await import(new URL('../src/ficherobot.jsx', import.meta.url).href)).default;
const FicheDistributeurContent = (await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href)).default;

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

test('lumière : morte ou retirée, ni interrupteur, ni jauge, ni palette', () => {
  const ID = 'light.salon';
  const pop = { id: ID, name: 'Lampe', on: true, bri: 60, color: null, rgb: true, ct: true, dimmable: true };
  const vive = rendre(F.RoomLightSheet, { light: pop, hass: hassDe(etat(ID, 'on', { friendly_name: 'Lampe', brightness: 150 })) });
  assert.equal(panne(vive), 0, 'témoin : vivante, pas de liseré');
  assert.ok(vive.includes('role="switch"') && vive.includes('role="slider"'), 'témoin : interrupteur et jauge');
  for (const st of [mort(ID, { supported_color_modes: ['color_temp', 'hs'] }), null]) {
    const html = rendre(F.RoomLightSheet, { light: pop, hass: hassDe(st) });
    morte('lumière ' + (st ? 'indisponible' : 'retirée'), html, { marque: 'Allumée' });
    assert.ok(!html.includes('Éteinte') && !html.includes('LUMINOSITÉ'), 'ni « Éteinte » ni jauge');
  }
});

test('volet : mort, ni « Fermé », ni puces, ni Stop', () => {
  const ID = 'cover.salon';
  const vive = rendre(F.RoomCoverSheet, { id: ID, hass: hassDe(etat(ID, 'open', { friendly_name: 'Volet', current_position: 60 })) });
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
  const vive = rendre(F.RoomSwitchSheet, { id: ID, hass: hassDe(etat(ID, 'on', { friendly_name: 'Prise' })) });
  assert.equal(panne(vive), 0, 'témoin');
  assert.ok(vive.includes('role="switch"'), 'témoin : l’interrupteur');
  for (const st of [mort(ID), etat(ID, 'unknown'), null]) {
    const html = rendre(F.RoomSwitchSheet, { id: ID, hass: hassDe(st) });
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
  const vive = rendre(F.RoomBinarySheet, { id: ID, hass: hassDe(etat(ID, 'off', { friendly_name: 'Porte', device_class: 'door' })) });
  assert.ok(vive.includes('Fermée') && panne(vive) === 0, 'témoin');
  for (const st of [etat(ID, 'unknown', { device_class: 'door' }), mort(ID, { device_class: 'door' }), null]) {
    const html = rendre(F.RoomBinarySheet, { id: ID, hass: hassDe(st) });
    morte('capteur binaire ' + (st ? st.state : 'retiré'), html, { marque: 'Relevé' });
    assert.ok(!html.includes('Fermée'), 'pas de relevé inventé');
  }
});

test('lecteur : mort, le liseré sur la pochette et plus aucune commande', () => {
  const ID = 'media_player.salon';
  const vive = rendre(F.RoomMediaSheet, { id: ID, hass: hassDe(etat(ID, 'playing', { friendly_name: 'Enceinte', media_title: 'Clair de lune', volume_level: .3 })) });
  assert.equal(panne(vive), 0, 'témoin');
  assert.ok(vive.includes('aria-label="Piste suivante"'), 'témoin : les commandes');
  for (const st of [mort(ID), null]) {
    const html = rendre(F.RoomMediaSheet, { id: ID, hass: hassDe(st) });
    morte('lecteur', html);
    assert.ok(/width:96px/.test(ouvertureBloc(html)), 'le liseré est sur la pochette (96 px), la tuile de l’appareil');
    assert.ok(!/Rien en lecture|\b0%/.test(html.replace(/<[^>]+>/g, ' ')), 'ni « Rien en lecture » ni volume 0 %');
  }
});

test('capteur : mort, « — » et « Indisponible », jamais « unavailable »', () => {
  const ID = 'sensor.temperature';
  const vive = rendre(F.SensorSheet, { id: ID, hass: hassDe(etat(ID, '21.4', { friendly_name: 'Température', unit_of_measurement: '°C' })) });
  assert.ok(vive.includes('21,4') && panne(vive) === 0, 'témoin');
  for (const st of [mort(ID, { unit_of_measurement: '°C' }), etat(ID, 'unknown', { unit_of_measurement: '°C' }), null]) {
    const html = rendre(F.SensorSheet, { id: ID, hass: hassDe(st) });
    morte('capteur ' + (st ? st.state : 'retiré'), html, { marque: '—' });
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
  const vif = rendre(FicheDistributeurContent, { cfg, index, etat: null, hass: hassDe(feed, etat(RES, '600', { max: 1500, unit_of_measurement: 'g' })), ongletDepart: 'entretien' });
  assert.ok(vif.includes('Rempli') && panne(vif) === 0, 'témoin');
  for (const onglet of ['accueil', 'entretien']) {
    const html = rendre(FicheDistributeurContent, { cfg, index, etat: null, hass: hassDe(feed, mort(RES)), ongletDepart: onglet });
    // Les onglets ne parlent pas à l'appareil ; « Distribuer » passe par le select, vivant.
    morte('distributeur', html, { marque: 'Ce distributeur ne répond plus.', permis: ['role="tab"', 'Distribuer'] });
    assert.ok(html.includes('>Distribuer<'), 'la vis répond : « Distribuer » reste');
    assert.ok(!html.includes('0 %') && !html.includes('Rempli') && !html.includes('>Entretien<'), 'ni « Réservoir 0 % » ni « Rempli »');
  }
});

test('plante : capteur d’humidité muet, le liseré sur sa ligne', () => {
  const pl = (m) => ({ base: 'b', name: 'Basilic', mort: m, room: 'Salon', hum: m ? null : 40, cond: 600, lux: 1000, temp: 21, uniteTemp: 'C', bat: 80 });
  assert.equal(panne(rendre(F.FichePlante, { pl: pl(false) })), 0, 'témoin');
  const html = rendre(F.FichePlante, { pl: pl(true) });
  assert.equal(panne(html), 1, 'un liseré');
  assert.ok(blocPanne(html).includes('Humidité du sol') && blocPanne(html).includes('Mesure absente'), 'sur la ligne de l’humidité');
});

test('robot injoignable : le liseré sur le panneau de tête, et un seul signal', () => {
  const ID = 'vacuum.robot';
  const vif = renderToStaticMarkup(createElement(FicheRobot, { idRobot: ID, domaine: 'vacuum', hass: hassDe(etat(ID, 'docked', { friendly_name: 'Robot', battery_level: 80 })) }));
  assert.equal(panne(vif), 0, 'témoin');
  const html = renderToStaticMarkup(createElement(FicheRobot, { idRobot: ID, domaine: 'vacuum', hass: hassDe(mort(ID)) }));
  assert.equal(panne(html), 1, 'un liseré');
  assert.ok(/rb-a-hero/.test(ouvertureBloc(html)), 'sur le panneau de tête');
  assert.ok(!html.includes('var(--o-bad)'), 'le point rouge ne double plus le liseré');
  assert.deepEqual(commandes(html).filter(c => !/Réglages|role="tab"/.test(c)), [], 'Démarrer et Base restent inertes');
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
  const vive = rendre(F.RoomMediaSheet, { id: ID, hass: hassDe(etat(ID, 'playing', { friendly_name: 'Enceinte', media_title: 'Clair de lune', ...image })) });
  assert.ok(vive.includes('<img'), 'témoin : vivant, la pochette');
  // Une image qui survit à la panne : le liseré (`overflow: visible`) lui ôterait ses coins.
  const html = rendre(F.RoomMediaSheet, { id: ID, hass: hassDe(mort(ID, image)) });
  assert.ok(!html.includes('<img'), 'aucune image : ni pochette, ni fond flouté');
  assert.ok(/color:var\(--o-text3\)[^>]*>Indisponible</.test(html), '« Indisponible » au niveau du normal, pas en couleur de titre');
});

test('minuteur et code d’alarme : rien ne se programme vers un appareil mort', () => {
  /* La rangée du minuteur lit le composant par un effet : le rendu serveur ne
   * la montre pas. On lit donc la source — minuteur.test épingle le reste. */
  const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const bloc = (nom) => { const d = APP.indexOf('function ' + nom + '('); assert.ok(d >= 0, nom); return APP.slice(d, APP.indexOf('\n}\n', d)); };
  const minuteur = bloc('RangeeMinuteur');
  assert.ok(minuteur.includes('if (mort && reste == null) return null;'), 'mort, sans minuteur en cours : pas de rangée');
  assert.ok(minuteur.includes('{!mort && <FicheBouton icone="clock"'), '« +30 min » ne se propose plus');
  assert.ok(minuteur.includes("type: 'loggia/minuteurs/annuler', entity_id: id"), 'un minuteur déjà posé s’annule encore');
  assert.ok(bloc('RoomLightSheet').includes('<RangeeMinuteur hass={hass} id={light.id} mort={mort} />'), 'la lumière passe sa panne');
  assert.ok(bloc('RoomSwitchSheet').includes('<RangeeMinuteur hass={hass} id={id} mort={mort} />'), 'la prise passe sa panne');
  assert.ok(!/<RangeeMinuteur(?![^>]*mort=)[^>]*\/>/.test(APP), 'aucun appel ne l’oublie');
  assert.ok(bloc('CvAlarm').includes('{demande && !mort ? ('), 'un code en cours de saisie ne part pas vers une alarme morte');
});
