/* La fiche d'un thermostat : sa jauge, et les commandes de son appareil (17/11, sa demande ; son choix « consigne en grand et
 * A » ; « c'est général, pas spécifique à mon poêle, c'est pour tout le monde »).
 *
 * Ce qui est garanti ici :
 *  - la jauge : un arc de 270°, ouvert en bas ; un point de l'arc dit sa valeur, un point loin de l'arc (le milieu, ses boutons)
 *    ne règle rien ; dans l'ouverture du bas, le bout le plus proche ;
 *  - au planning, la jauge prend la couleur du mode qu'il suit ; une reprise en main se dit « Manuel » ; un thermostat revenu à
 *    SON programme, non ; le pas que le moteur a APPRIS (`pas` de l'état) cale les crans quand l'appareil n'en publie pas ;
 *  - les commandes de son appareil, pour TOUT thermostat : ses listes de choix, son ventilateur (ce qu'il déclare savoir faire), ses
 *    interrupteurs en puces, « Infos » repliées ; jamais un réglage, un diagnostic, une entité masquée ; la sonde de la pièce
 *    et le doublon de sa température non plus ; le titre est le nom de l'appareil, jamais une marque ;
 *  - rien de cela pour un fil pilote ni un VTherm, ni pour un appareil muet ;
 *  - « L'appareil » garde l'épingle et la liste complète. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { area, device, entity, state, states, indexOf } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const M = await import(new URL('../src/fichechauffage.jsx', import.meta.url).href);
const Fiche = M.default;
const { angleDeJauge, valeurDuPoint, commandesDeLAppareil, choixDuVentilo } = M;
const { setLoggiaState } = await import('../src/state.js');
const SOURCE = readFileSync(new URL('../src/fichechauffage.jsx', import.meta.url), 'utf8');

const CLIM = 'climate.salon_poele';
const PUISSANCE = 'select.salon_poele_puissance';
const VENTILO = 'fan.salon_poele_ventilateur';
const ECO = 'switch.salon_poele_eco_stop';
const CHRONO = 'switch.salon_poele_chrono';
const SONS = 'switch.salon_poele_sons';
const FUMEES = 'sensor.salon_poele_fumees';
const AMBIANTE = 'sensor.salon_poele_ambiante';
const CARTE = 'sensor.salon_poele_carte_mere';
const CACHE = 'switch.salon_poele_cache';

/* Un appareil « Poêle MCZ » de n'importe quelle intégration : son thermostat, une puissance, un ventilateur, trois
 * interrupteurs (dont un RÉGLAGE), trois capteurs (dont un DIAGNOSTIC et le doublon de la température), un masqué. */
function maison() {
  const ent = (id, plus = {}) => ({ ...entity(id, { device: 'poele' }), platform: 'une_integration', ...plus });
  return {
    areas: [area('salon', 'Salon')],
    devices: [device('poele', 'Poêle MCZ', 'salon')],
    entities: [
      ent(CLIM), ent(PUISSANCE, { name: 'Puissance' }), ent(VENTILO, { name: 'Ventilateur ambiance' }), ent(ECO, { name: 'Eco Stop' }),
      ent(CHRONO, { name: 'Chrono' }), ent(SONS, { name: 'Sons', entity_category: 'config' }), ent(FUMEES, { name: 'Température des fumées' }),
      ent(AMBIANTE, { name: 'Température ambiante' }), ent(CARTE, { name: 'Température carte mère', entity_category: 'diagnostic' }),
      ent(CACHE, { name: 'Caché', hidden_by: 'user' }),
    ],
    floors: [],
    states: states(
      state(CLIM, 'heat', { friendly_name: 'Poêle MCZ', hvac_modes: ['off', 'heat'], hvac_action: 'heating', temperature: 19, current_temperature: 19.5,
        min_temp: 7, max_temp: 30, supported_features: 1 }),
      state(PUISSANCE, '3', { friendly_name: 'Poêle MCZ Puissance', options: ['1', '2', '3', '4', '5'] }),
      state(VENTILO, 'on', { friendly_name: 'Poêle MCZ Ventilateur ambiance', preset_modes: ['auto'], preset_mode: 'auto', percentage: 60, percentage_step: 20,
        supported_features: 57 }),
      state(ECO, 'off', { friendly_name: 'Poêle MCZ Eco Stop' }),
      state(CHRONO, 'on', { friendly_name: 'Poêle MCZ Chrono' }),
      state(SONS, 'on', { friendly_name: 'Poêle MCZ Sons' }),
      state(FUMEES, '62', { friendly_name: 'Poêle MCZ Température des fumées', device_class: 'temperature', unit_of_measurement: '°C' }),
      state(AMBIANTE, '19.5', { friendly_name: 'Poêle MCZ Température ambiante', device_class: 'temperature', unit_of_measurement: '°C' }),
      state(CARTE, '35.5', { friendly_name: 'Poêle MCZ Température carte mère', device_class: 'temperature', unit_of_measurement: '°C' }),
      state(CACHE, 'on', { friendly_name: 'Poêle MCZ Caché' }),
    ),
    energyPrefs: null,
  };
}
const avec = (fx, f) => {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_plants: [] }, resolved: null });
  try { return f(fx.states); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
};
const thermostat = (o = {}) => ({
  cle: CLIM, entite: CLIM, nom: 'Poêle MCZ', famille: 'thermostat', planning: false, modes: ['confort', 'confort_1', 'confort_2', 'eco', 'hors_gel', 'arret'],
  mode: null, source: null, fin: null, puis: null, reprise: null, fenetre: 'arret', fenetre_ouverte: false,
  semaine: null, temperatures: null, avertissements: [], options: null, jour: null, ...o,
});
const etatMoteur = { chauffages: [], maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' }, simulation: false,
  maintenant: '2026-10-12T19:00:00+02:00', minute: [0, 1140], plannings_allumes: true, journal: [] };
const rien = () => { throw new Error('rien ne doit partir'); };
const rendre = (S, ch = thermostat()) => renderToStaticMarkup(createElement(Fiche, {
  hass: { states: S, user: { is_admin: true }, config: { unit_system: { temperature: '°C' } }, callService: rien, callWS: rien },
  ch, etat: etatMoteur, sonde: { id: CLIM, attribut: 'current_temperature' }, onFiche: () => {}, maintenant: Date.parse('2026-10-12T19:00:00+02:00'),
}));

test('la jauge : 135° au minimum, 405° au maximum ; un point de l’arc dit sa valeur, le milieu ne règle rien', () => {
  assert.equal(angleDeJauge(7, 7, 30), 135);
  assert.equal(angleDeJauge(30, 7, 30), 405);
  assert.equal(angleDeJauge(40, 7, 30), 405, 'bornée');
  assert.equal(angleDeJauge(18.5, 7, 30), 270, 'le milieu de la plage, en haut');
  // En haut de l'arc (120, 20) : le milieu de la plage. À gauche (20, 120) : 45° après le début.
  assert.equal(valeurDuPoint(120, 20, 7, 30), 18.5);
  assert.ok(Math.abs(valeurDuPoint(20, 120, 7, 30) - (7 + 23 * 45 / 270)) < 1e-9);
  assert.equal(valeurDuPoint(120, 120, 7, 30), null, 'le milieu, où sont la consigne et ses boutons');
  assert.equal(valeurDuPoint(120, 175, 7, 30), null, 'les boutons − / +');
  // Dans l'ouverture du bas : le bout le plus proche.
  assert.equal(valeurDuPoint(70, 210, 7, 30), 7, 'à gauche : le minimum');
  assert.equal(valeurDuPoint(170, 210, 7, 30), 30, 'à droite : le maximum');
});

test('un thermostat, planning éteint : la jauge commande l’appareil, sa consigne au milieu, sa pièce au-dessus', () => avec(maison(), (S) => {
  const html = rendre(S);
  assert.ok(html.includes('data-jauge=""') && html.includes('>19,0°<'), 'la consigne en grand');
  assert.match(html, /data-piece=""[^>]*><span[^>]*>Pièce<\/span><span[^>]*>19,5°<\/span>/, 'la pièce au-dessus');
  assert.match(html, /<line data-repere=""/, 'son repère sur l’arc');
  assert.match(html, /data-grand="" style="[^"]*color:var\(--o-warn2\)[^"]*">Chauffe</);
  assert.ok(html.includes('>Manuel · planning désactivé<'));
  assert.ok(!html.includes('data-rangee="consigne"'), 'plus de rangée « Consigne »');
  // La jauge pose sa consigne au LÂCHER, un seul ordre, par le chemin de − / +.
  assert.ok(SOURCE.includes('poser={(v) => poserConsigne(Math.round((v + decPiece) * 100) / 100)}'));
  assert.ok(SOURCE.includes('const lache = () => { if (glisse == null) return; const v = glisse; setGlisse(null); if (v !== valeur) poser(v); };'));
}));

test('au planning : la couleur du mode qu’il suit ; une reprise se dit « Manuel » ; son programme, non', () => avec(maison(), (S) => {
  const eco = rendre(S, thermostat({ planning: true, mode: 'eco', source: 'planning', fin: '2026-10-12T22:00:00+02:00' }));
  const arc = (html) => { const m = /<path data-arc="" d="[^"]*" fill="none" stroke-width="14" stroke-linecap="round" style="stroke:([^"]*)"/.exec(html); return m && m[1]; };
  assert.ok(arc(eco) && arc(eco) !== 'var(--o-warn2)', 'l’arc, à la couleur de l’Éco : ' + arc(eco));
  assert.match(eco, /data-grand="" style="[^"]*">Éco</);
  const reprise = { mode: null, temperature: 21, fin: '2026-10-12T22:00:00+02:00', depuis: '2026-10-12T19:00:00+02:00', par: 'u1' };
  const main = rendre(S, thermostat({ planning: true, mode: null, source: 'main', fin: reprise.fin, reprise }));
  assert.match(main, /data-grand="" style="[^"]*color:var\(--o-warn2\)[^"]*">Manuel</, 'Manuel, à l’orange');
  assert.equal(arc(main), 'var(--o-warn2)', 'une consigne à la main : l’arc orange');
  assert.ok(main.includes('Reprendre le planning'));
  const programme = rendre(S, thermostat({ planning: true, mode: null, source: 'main', fin: reprise.fin, reprise: { ...reprise, programme: true } }));
  assert.ok(programme.includes('>Son programme<') && !/data-grand="" style="[^"]*">Manuel</.test(programme));
}));

test('le pas APPRIS par le moteur cale la jauge quand l’appareil n’en publie pas ; celui qu’il publie passe avant', () => {
  assert.ok(SOURCE.includes('const aPas = Number(ch.pas) > 0 && !(Number(a.target_temp_step) > 0) ? { ...a, target_temp_step: Number(ch.pas) } : a;'));
  assert.ok(SOURCE.includes("const pasJauge = Number(aPas.target_temp_step) > 0 ? Number(aPas.target_temp_step) : uT === 'F' ? 1 : 0.5;"));
  const PY = readFileSync(new URL('../custom_components/loggia/chauffage.py', import.meta.url), 'utf8');
  assert.ok(PY.includes('"pas": self._pas.get(entite) if entite else None,'), 'le serveur le publie');
});

test('les commandes de son appareil : choix, ventilateur, interrupteurs ; jamais un réglage, un diagnostic, un masqué', () => avec(maison(), (S) => {
  const c = commandesDeLAppareil(thermostat(), S, { id: CLIM, attribut: 'current_temperature' });
  assert.deepEqual(c, { choix: [PUISSANCE], ventilos: [VENTILO], interrupteurs: [CHRONO, ECO], infos: [FUMEES] },
    'ni Sons (réglage), ni la carte mère (diagnostic), ni le masqué ; la température ambiante redit la pièce');
  // Rien pour un fil pilote, un VTherm, ou sans appareil connu.
  assert.deepEqual(commandesDeLAppareil(thermostat({ famille: 'fil_pilote' }), S, null), { choix: [], ventilos: [], interrupteurs: [], infos: [] });
  assert.deepEqual(commandesDeLAppareil(thermostat({ famille: 'vtherm' }), S, null).interrupteurs, []);
  assert.deepEqual(commandesDeLAppareil(thermostat({ entite: 'climate.inconnu' }), S, null).choix, []);
}));

test('le ventilateur : ses préréglages, puis ses vitesses de 2 à 6 ; celui qu’il suit', () => {
  const v = (attrs, etat = 'on') => choixDuVentilo({ state: etat, attributes: { supported_features: 57, ...attrs } });
  const cinq = v({ preset_modes: ['auto'], preset_mode: null, percentage: 60, percentage_step: 20 });
  assert.deepEqual(cinq.options.map(o => [o.id, o.label]), [['p:auto', 'Auto'], ['v:1', '1'], ['v:2', '2'], ['v:3', '3'], ['v:4', '4'], ['v:5', '5']]);
  assert.equal(cinq.choisi, 'v:3');
  assert.equal(v({ preset_modes: ['auto'], preset_mode: 'auto', percentage: 60, percentage_step: 20 }).choisi, 'p:auto');
  assert.equal(v({ preset_modes: ['auto'], percentage: 60, percentage_step: 20 }, 'off').choisi, null, 'éteint : rien de choisi');
  assert.deepEqual(v({ percentage_step: 1 }).options, [], 'cent vitesses : pas de puces');
  assert.deepEqual(v({}).options, []);
  // Seulement ce qu'il déclare : sans la vitesse (1), pas de vitesses ; sans les préréglages (8), pas de préréglages.
  assert.deepEqual(v({ preset_modes: ['auto'], percentage_step: 20, supported_features: 8 }).options.map(o => o.id), ['p:auto']);
  assert.deepEqual(v({ preset_modes: ['auto'], percentage_step: 20, supported_features: 1 }).options.map(o => o.id), ['v:1', 'v:2', 'v:3', 'v:4', 'v:5']);
  assert.deepEqual(v({ preset_modes: ['auto'], percentage_step: 20, supported_features: 0 }).options, []);
});

test('la section : sous le haut, au nom de son appareil ; « Infos » repliées ; « L’appareil » garde l’épingle et la liste', () => avec(maison(), (S) => {
  const html = rendre(S);
  const i = html.indexOf('data-panneau="commandes"');
  assert.ok(i > html.indexOf('data-panneau="haut"') && i < html.indexOf('data-liste'), 'entre le haut et la liste');
  assert.match(html, /data-panneau="commandes" style="[^"]*"><div style="[^"]*">Poêle MCZ<\/div>/, 'le nom de l’appareil');
  assert.ok(html.includes('>Puissance<') && html.includes('>Ventilateur ambiance<'), 'les noms courts');
  assert.match(html, /<button type="button" aria-pressed="true" style="[^"]*background:var\(--o-accent-fond\);color:#fff[^"]*"><span style="min-width:0">Chrono<\/span>/, 'allumé : le bleu plein');
  assert.match(html, /<button type="button" aria-pressed="false" style="[^"]*"><span style="min-width:0">Eco Stop<\/span>/);
  assert.ok(!html.includes('>Sons<') && !html.includes('>Caché<') && !html.includes('carte mère'), 'ni réglage, ni masqué, ni diagnostic');
  assert.match(html, /data-panneau="infos"[^>]*><button type="button" aria-expanded="false"[^>]*><span[^>]*>Infos<\/span><span[^>]*>1</, 'repliées, leur nombre');
  assert.ok(!html.includes('data-info='), 'repliées : rien dessous');
  assert.ok(html.includes('>L’épingle et toutes ses entités<'));
  // Muet, l'appareil n'a rien à commander : ni section, ni « Infos ».
  const muet = rendre({ ...S, [CLIM]: { ...S[CLIM], state: 'unavailable' } });
  assert.ok(!muet.includes('data-panneau="commandes"') && !muet.includes('data-panneau="infos"'));
  assert.ok(muet.includes('>L’épingle, les commandes et toutes ses entités<'));
}));

test('les gestes des commandes partent par le service de leur domaine ; rien de propre à un appareil', () => {
  for (const s of [
    "commanderService(hass, id, 'select', 'select_option', { entity_id: id, option: o })",
    "commanderService(hass, id, 'fan', 'set_preset_mode', { entity_id: id, preset_mode: v })",
    "commanderService(hass, id, 'fan', 'set_percentage', { entity_id: id, percentage: Math.min(100, Math.round(Number(v) * pas)) })",
    "commanderService(hass, id, id.split('.')[0], on ? 'turn_off' : 'turn_on', { entity_id: id })",
  ]) assert.ok(SOURCE.includes(s), s);
  // Le titre : le nom de l'appareil, sinon « Ses commandes » — aucune marque, aucun « poêle » dans la règle.
  const section = SOURCE.slice(SOURCE.indexOf('function CommandesAppareil('), SOURCE.indexOf('/* Un groupe de puces sous son libellé visible'));
  assert.ok(section.includes("const titre = nomAppareilDe(ch.entite) || tr('Ses commandes');"));
  assert.ok(!/poele|poêle|mcz/i.test(section), 'rien de propre à un appareil');
});

/* 18/11, ADR 0375 : éteint de lui-même, le moteur attend avant d'y voir un geste ; éteint et sa mesure déjà à la consigne, le
 * planning ne l'allume pas encore. La fiche le dit, chacun sur sa ligne, comme les autres avertissements. */
test('« éteint de lui-même » et « déjà au-dessus de la consigne » se disent dans la fiche', () => {
  const lignes = (html) => [...html.matchAll(/data-avertissement="([^"]+)"/g)].map(m => m[1]);
  avec(maison(), (S) => {
    const seul = rendre(S, thermostat({ planning: true, source: 'planning', mode: 'eco', avertissements: ['eteint_seul'] }));
    assert.deepEqual(lignes(seul), ['eteint_seul']);
    assert.ok(seul.includes('Il s’est éteint de lui-même : Loggia attend qu’il reparte, le planning reste en place.'));
    const chaud = rendre(S, thermostat({ planning: true, source: 'planning', mode: 'eco', avertissements: ['deja_chaud'] }));
    assert.deepEqual(lignes(chaud), ['deja_chaud']);
    assert.ok(chaud.includes('Sa mesure est déjà au-dessus de la consigne : Loggia l’allumera quand elle redescendra.'));
    assert.ok(!chaud.includes('Manuel'), 'le planning garde la main : pas de « Manuel »');
  });
});
