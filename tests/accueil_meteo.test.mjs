// La carte meteo du rail de l'Accueil (17/09, ADR 0038) : sur le cote, avec
// « A surveiller » et « En ce moment » — le temps qu'il fait, les extremes du
// jour, les heures qui viennent, et rien qui s'affiche sans prevision.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* La langue de la machine ne doit rien changer au resultat : « 16,2° » s'ecrit
 * « 16.2° » sur un runner anglais. Elle est fixee AVANT le premier import (voir
 * tests/systeme_hoas.test.mjs). */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { typesPrevision, degres, estNuit, modeMeteo, heuresMeteo, extremesDuJour } = await import('../src/meteo.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const carte = lire('src', 'cartemeteo.jsx');
const wxutil = lire('src', 'wxutil.jsx');
const css = lire('src', 'index.css');
const demo = lire('src', 'demo.js');
const en = lire('src', 'langues', 'en.js');
const H = 3600000;
const iso = (t) => new Date(t).toISOString();

test('une entite ne recoit que les previsions qu’elle dit savoir donner', () => {
  assert.deepEqual(typesPrevision({ attributes: { supported_features: 3 } }), { jour: true, heure: true });
  assert.deepEqual(typesPrevision({ attributes: { supported_features: 1 } }), { jour: true, heure: false });
  assert.deepEqual(typesPrevision({ attributes: { supported_features: 2 } }), { jour: false, heure: true });
  assert.deepEqual(typesPrevision({ attributes: { supported_features: 4 } }), { jour: false, heure: false }, 'deux fois par jour : ni l’un ni l’autre');
  assert.deepEqual(typesPrevision({ attributes: {} }), { jour: false, heure: false });
  assert.deepEqual(typesPrevision(null), { jour: false, heure: false });
});

test('les degres : une decimale pour la temperature du moment, aucune ailleurs', () => {
  assert.equal(degres(16.2, 1), '16,2°');
  assert.equal(degres(16.25, 1), '16,3°');
  assert.equal(degres(16, 1), '16°', 'pas de « ,0 »');
  assert.equal(degres(18.6), '19°');
  assert.equal(degres('15.64', 1), '15,6°', 'un etat est une chaine');
  assert.equal(degres(-0.4), '0°', 'jamais « -0° »');
  assert.equal(degres(-3.5, 1), '-3,5°');
  assert.equal(degres(null), null);
  assert.equal(degres(''), null);
  assert.equal(degres('unknown'), null);
});

test('la nuit se lit dans sun.sun : du coucher au lever, et elle revient chaque jour', () => {
  const t0 = new Date(2026, 8, 17, 14, 0).getTime();
  const jour = { state: 'above_horizon', attributes: { next_setting: iso(t0 + 6 * H), next_rising: iso(t0 + 17 * H) } };
  assert.equal(estNuit(t0, jour), false, 'a 14 h il fait jour');
  assert.equal(estNuit(t0 + 5 * H, jour), false, 'une heure avant le coucher');
  assert.equal(estNuit(t0 + 7 * H, jour), true, 'une heure apres');
  assert.equal(estNuit(t0 + 16 * H, jour), true, 'une heure avant le lever');
  assert.equal(estNuit(t0 + 18 * H, jour), false, 'le lendemain matin');
  assert.equal(estNuit(t0 + 31 * H, jour), true, 'et la nuit suivante');
  const t1 = new Date(2026, 8, 17, 23, 0).getTime();
  const nuit = { state: 'below_horizon', attributes: { next_rising: iso(t1 + 8 * H), next_setting: iso(t1 + 21 * H) } };
  assert.equal(estNuit(t1, nuit), true, 'a 23 h il fait nuit');
  assert.equal(estNuit(t1 + 9 * H, nuit), false, 'apres le lever');
  assert.equal(estNuit(t1 + 22 * H, nuit), true, 'apres le coucher du lendemain');
  assert.equal(estNuit(t0, { state: 'below_horizon', attributes: {} }), true, 'sans horaires, l’etat');
  assert.equal(estNuit(t0, { state: 'above_horizon', attributes: {} }), false);
  assert.equal(estNuit(t0, null), false);
});

test('la condition devient un dessin — de nuit aussi, et jamais un nuage par defaut', () => {
  const attendu = [
    ['sunny', false, 'sun'], ['sunny', true, 'night'], ['clear-night', false, 'night'], ['clear-night', true, 'night'],
    ['partlycloudy', false, 'partly'], ['partlycloudy', true, 'partlynight'], ['cloudy', false, 'clouds'], ['cloudy', true, 'clouds'],
    ['rainy', false, 'rain'], ['pouring', false, 'pluieforte'], ['snowy', false, 'snow'], ['snowy-rainy', false, 'gresil'], ['hail', false, 'grele'],
    ['lightning', false, 'storm'], ['lightning-rainy', false, 'storrain'], ['fog', true, 'brouillard'], ['windy', false, 'wind'], ['windy-variant', true, 'wind'],
    ['exceptional', false, null], ['', false, null], [null, true, null],
  ];
  for (const [cond, nuit, mode] of attendu) assert.equal(modeMeteo(cond, nuit), mode, cond + (nuit ? ' (nuit)' : ''));
  const table = wxutil.slice(wxutil.indexOf('const WX_METEO = {'), wxutil.indexOf('};', wxutil.indexOf('const WX_METEO = {')));
  for (const [, , mode] of attendu) if (mode) assert.ok(new RegExp('\\b' + mode + ':').test(table), mode + ' n’a pas de dessin dans WX_METEO');
});

test('les heures : « Maint. », puis les prochaines heures pleines — six cases, ou rien', () => {
  const maintenant = new Date(2026, 8, 17, 14, 20).getTime();
  const heure = (h) => new Date(2026, 8, 17, h, 0).getTime();
  const soleil = { state: 'above_horizon', attributes: { next_setting: iso(heure(19) + 30 * 60000), next_rising: iso(heure(7) + 24 * H) } };
  const etat = { state: 'sunny', attributes: { temperature: 16.2 } };
  const previsions = [
    { datetime: iso(heure(17)), condition: 'cloudy', temperature: 13.4 },
    { datetime: iso(heure(14)), condition: 'sunny', temperature: 16 },          // l'heure en cours : deja dite par « Maint. »
    { datetime: iso(heure(15)), condition: 'sunny', temperature: 15.2 },
    { datetime: iso(heure(16)), condition: 'partlycloudy', temperature: 14 },
    { datetime: iso(heure(18)), condition: 'cloudy', temperature: null },       // sans temperature : pas de case
    { datetime: iso(heure(19)), condition: 'cloudy', temperature: 12 },
    { datetime: iso(heure(20)), condition: 'partlycloudy', temperature: 11.6 },
    { datetime: iso(heure(21)), condition: 'sunny', temperature: 11 },
    { datetime: 'illisible', condition: 'sunny', temperature: 9 },
  ];
  const cases = heuresMeteo({ etat, previsions, maintenant, soleil });
  assert.deepEqual(cases.map(c => [c.libelle, c.mode, c.temp]), [
    ['Maint.', 'sun', '16°'], ['15 h', 'sun', '15°'], ['16 h', 'partly', '14°'], ['17 h', 'clouds', '13°'], ['19 h', 'clouds', '12°'], ['20 h', 'partlynight', '12°'],
  ], 'triees, l’heure en cours et les cases sans temperature ecartees, la nuit tombee a 20 h');
  assert.equal(new Set(cases.map(c => c.cle)).size, 6, 'une cle par case');
  assert.equal(heuresMeteo({ etat, previsions, maintenant, soleil, n: 3 }).length, 3);
  assert.deepEqual(heuresMeteo({ etat, previsions: null, maintenant, soleil }), [], 'sans prevision horaire, pas de rangee : une case seule ne dit rien');
  assert.deepEqual(heuresMeteo({ etat, previsions: [{ datetime: iso(heure(13)), condition: 'sunny', temperature: 17 }], maintenant, soleil }), [], 'une prevision passee ne compte pas');
  const sansEtat = heuresMeteo({ etat: { state: 'sunny', attributes: {} }, previsions, maintenant, soleil });
  assert.deepEqual(sansEtat.map(c => c.libelle), ['15 h', '16 h', '17 h', '19 h', '20 h', '21 h'], 'sans temperature du moment, six heures de prevision');
  assert.deepEqual(heuresMeteo({ maintenant }), []);
});

test('le maximum et le minimum sont ceux d’AUJOURD’HUI, en date locale — sinon rien', () => {
  const maintenant = new Date(2026, 8, 17, 14, 20).getTime();
  const minuit = (j) => iso(new Date(2026, 8, j, 0, 0).getTime());
  assert.deepEqual(extremesDuJour([{ datetime: minuit(17), temperature: 19.4, templow: 10.6 }, { datetime: minuit(18), temperature: 22, templow: 12 }], maintenant), { max: '19°', min: '11°' },
    'un jour date a minuit local s’ecrit la veille en UTC : c’est la date locale qui compte');
  assert.deepEqual(extremesDuJour([{ datetime: iso(new Date(2026, 8, 17, 12, 0).getTime()), temperature: 19 }], maintenant), { max: '19°', min: null }, 'sans minimum, le maximum seul');
  assert.equal(extremesDuJour([{ datetime: minuit(18), temperature: 22, templow: 12 }], maintenant), null, 'demain n’est pas aujourd’hui');
  assert.equal(extremesDuJour([{ datetime: iso(new Date(2026, 9, 17, 0, 0).getTime()), temperature: 9 }], maintenant), null, 'le 17 du mois prochain non plus');
  assert.equal(extremesDuJour([{ datetime: iso(new Date(2027, 8, 17, 0, 0).getTime()), temperature: 9 }], maintenant), null, 'ni celui de l’an prochain');
  assert.equal(extremesDuJour([{ datetime: minuit(17), temperature: null, templow: 10 }], maintenant), null);
  assert.equal(extremesDuJour([], maintenant), null);
  assert.equal(extremesDuJour(null, maintenant), null);
});

test('la meteo est une section du rail, sous « A surveiller » — meme sur un accueil deja range', () => {
  assert.ok(app.includes("const ACC_RAIL = ['attention', 'meteo', 'moment', 'rappels', 'agenda', 'heure', 'calendrier', 'co2'];"), 'sur le cote, avant En ce moment');
  assert.ok(app.includes("agenda: tr('Agenda'), meteo: tr('Météo'), heure: tr('Heure'), calendrier: tr('Calendrier'), co2: 'CO₂' });"), 'son nom en edition');
  assert.ok(app.includes("const tete = (zone === 'main' ? [] : ['attention', 'meteo']).filter(s => manquants.indexOf(s) >= 0);"), 'elle ne nait pas tout en bas d’un rail deja enregistre');
  assert.ok(app.includes("import { CarteMeteo } from './cartemeteo.jsx';") && app.includes('meteo: meteoRailId ? <CarteMeteo hass={dashHass} onOpen={dc.ouvrir} /> : null,'), 'la carte, et sa fiche d’un tap');
  const id = app.slice(app.indexOf('const meteoRailId = (() => {'), app.indexOf('const secsRail = {'));
  assert.ok(id.includes('const id = weatherEntity(dashHass);') && id.includes("return st && st.state !== 'unavailable' && st.state !== 'unknown' ? id : null;"), 'sans entite meteo qui reponde, la section n’existe pas — ni sa poignee en edition');
  assert.ok(!app.includes('function MeteoView(') && !app.includes("view === 'meteo'"), 'une carte sur le cote, pas le retour de la vue Meteo');
});

test('la carte : les previsions par abonnement, par une reference vivante, et rien sans elles', () => {
  assert.ok(carte.includes("{ type: 'weather/subscribe_forecast', entity_id: entite, forecast_type: type }"), 'Home Assistant pousse les previsions, rien n’est sonde');
  assert.ok(carte.includes('useEffect(() => { hRef.current = hass; });') && carte.includes('}, [connecte, entite, type]);') && !/\}, \[[^\]]*\bhass\b[^\]]*\]\)/.test(carte), 'aucun effet ne depend de l’objet hass');
  assert.ok(carte.includes("const parHeure = usePrevisions(hass, id, types.heure ? 'hourly' : null);") && carte.includes("const parJour = usePrevisions(hass, id, types.jour ? 'daily' : null);"), 'seulement les types que l’entite sait donner');
  assert.ok(carte.includes('if (!connecte || !entite || !type) { setListe(null); return undefined; }') && carte.includes('return () => { fini = true; if (stop) fermer(stop); };'), 'pas de type, pas d’abonnement ; et l’abonnement se ferme');
  assert.ok(carte.includes("if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;"));
  assert.ok(carte.includes('{extremes && <div') && carte.includes('{heures.length > 0 && (') && carte.includes('{mode && <WeatherIco wx={mode} size={44} />}') && !carte.includes("'—'"), 'un bloc sans donnee ne se dessine pas, et pas de tiret de decor');
  assert.ok(carte.includes("const nom = a.friendly_name || tr('Météo');") && carte.includes('{nom}</div>'), 'le lieu est le nom de l’entite, jamais une ville en dur');
});

test('la carte : la disposition fournie — le lieu et le chiffre a gauche, le ciel a droite, les heures dessous — aux teintes des autres cartes du rail', () => {
  const rendu = carte.slice(carte.indexOf('<div className="o-carte-meteo"'));
  const ordre = ['{nom}</div>', 'className="o-meteo-temp"', '<WeatherIco wx={mode} size={44} />', '{ciel}</div>', "tr('Max {n}'", "gridTemplateColumns: 'repeat(' + heures.length", '{h.libelle}</span>', '<WeatherIco wx={h.mode} size={28} />', '{h.temp}</span>'];
  let curseur = -1;
  for (const morceau of ordre) { const i = rendu.indexOf(morceau); assert.ok(i > curseur, morceau + ' n’est pas a sa place'); curseur = i; }
  // Retour du 17/09 sur le fond bleu de la capture : « applique les memes teintes
  // que pour les autres cartes, c'est ridicule la ». La surface, le filet et
  // l'ombre sont ceux de `railPanel` — la carte voisine, mot pour mot.
  // Depuis la v3.49.0, cette surface vit une fois, dans styles.js : la carte
  // voisine (railPanel) et la meteo l'etalent toutes deux.
  const styles = lire('src', 'styles.js');
  const voisin = app.slice(app.indexOf('const railPanel = (title, sub, tag, tagCol, rows) => rows.length ? ('));
  assert.ok(voisin.slice(0, 200).includes("<div style={{ ...CARTE_RAIL, padding: '13px 15px' }}>"), 'la carte voisine prend la surface partagee');
  for (const morceau of ["background: 'var(--o-surfA)'", "border: 'var(--o-bw,1px) solid var(--o-bd2)'", "borderRadius: 'var(--o-radius,18px)'", "boxShadow: 'var(--o-shadow)'"]) {
    assert.ok(styles.includes(morceau), morceau + ' : la meme surface que « En ce moment »');
  }
  assert.ok(carte.includes("import { CARTE_RAIL } from './styles.js';") && carte.includes('style={{ ...CARTE_RAIL,'), 'les textes prennent les couleurs du theme');
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(carte) && !carte.includes('linear-gradient') && !carte.includes('FOND_JOUR') && !carte.includes('rgba(255,255,255'), 'plus aucune couleur en dur : ni fond bleu, ni texte blanc');
  assert.ok(rendu.includes("borderTop: 'var(--o-bw,1px) solid var(--o-bd3)'") && carte.includes("const DOUX = 'var(--o-text2)';") && rendu.includes("color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{h.libelle}</span>"), 'le filet et les gris des lignes du rail');
  assert.ok(rendu.includes('role="button" tabIndex={0}') && rendu.includes("if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); }"), 'la carte s’ouvre au clavier comme au doigt');
  assert.ok(rendu.includes("flex: '0 0 auto'") && rendu.includes("flex: '1 1 0', minWidth: 0, textAlign: 'right'"), 'le chiffre ne cede pas sa place : c’est le libelle qui passe a la ligne');
  assert.ok(css.includes('.o-carte-meteo { container-type: inline-size;') && css.includes('.o-carte-meteo .o-meteo-temp { font-size: 52px; font-size: clamp(40px, 17.7cqw, 52px); }'), 'le chiffre suit la largeur de la CARTE : 330 px ou 276 px de rail');
});

test('la demonstration pousse des previsions, et l’anglais suit', () => {
  assert.ok(demo.includes("if (msg && msg.type === 'weather/subscribe_forecast') {") && demo.includes('rappel({ type: msg.forecast_type, forecast: previsionsDemo(msg.forecast_type) });'), 'un abonnement, comme sur une vraie installation');
  assert.ok(demo.includes("temperature: 24.3, humidity: 52, temperature_unit: '°C', supported_features: 3,"), 'l’entite de la demo dit savoir donner le jour et l’heure');
  for (const k of ['Maint.', 'Max {n}', 'Min {n}', 'Météo', '{n} h']) assert.ok(en.includes("'" + k + "':"), k + ' manque a en.js');
});
