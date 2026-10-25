/* « En ce moment » et le planning de chauffe (chantier Chauffage, plan 2,
 * tâche 12 ; choix 15, spec § 9.4).
 *
 * L'Accueil ne dit que l'inhabituel : les lignes de `lignesMoment`
 * (chauffageecran.js, tenues par tests/chauffageecran.test.mjs) poussées une
 * à une dans « En ce moment » — un chauffage ouvre SA fiche, par sa clé ; la
 * maison mène à Objets › Chauffage. La ligne « {n} zones chauffent » ne
 * compte plus les chauffages au planning allumé, et compte par LA règle des
 * cartes : un module à plus de 10 W, un thermostat qui chauffe vraiment,
 * jamais le froid d'un climatiseur. Un chauffage INTROUVABLE a sa ligne, et
 * sa fiche s'ouvre par sa clé sans rien lire de `hass.states[null]` : c'est
 * le seul chemin vers « Supprimer son planning ».
 *
 * App.jsx n'exporte que l'application : un crochet de chargement ajoute un
 * export sous `?en_ce_moment_chauffage`, pour ce fichier seul — le patron de
 * tests/carte_chauffage.test.mjs. Le Dashboard, lui, se lit dans la source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const SUFFIXE = '?en_ce_moment_chauffage';
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  `  if (!url.endsWith('/src/App.jsx${SUFFIXE}')) return next(url, ctx);`,
  `  const r = await next(url.slice(0, -${SUFFIXE.length}), ctx);`,
  "  return { ...r, source: String(r.source) + ';export { zonesQuiChauffent, FicheChauffage };' };",
  '}',
].join('\n')));
const { zonesQuiChauffent, FicheChauffage } = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
const { poserEtatChauffage, reglerChauffageEtat } = await import('../src/chauffageetat.js');
const { setLoggiaState } = await import('../src/state.js');
const Fiche = (await import(new URL('../src/fichechauffage.jsx', import.meta.url).href)).default;

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NL = String.fromCharCode(10);
const bloc = (debut, fin) => { const d = APP.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = APP.indexOf(fin, d + 1); return APP.slice(d, f < 0 ? undefined : f); };
const home = bloc('function Dashboard(', NL + '}');

/* ── Les lignes, dans le Dashboard ───────────────────────────────────────── */

test('le Dashboard lit l’état du moteur et pousse ses lignes, une LigneMoment chacune', () => {
  // Les crochets avant tout calcul, sans condition ; le Dashboard n'a pas de retour anticipé.
  const etatLu = home.indexOf('const { etat: etatCh } = useEtatChauffage();');
  assert.ok(etatLu > 0 && etatLu < home.indexOf('const momentRows = [];'), 'l’état du moteur se lit avant « En ce moment »');
  assert.ok(home.includes('const [ficheCh, setFicheCh] = useState(null);'));
  const m = home.slice(home.indexOf('const momentRows = [];'), home.indexOf('const nEnCours = momentRows.length;'));
  /* Une ligne par entrée, de la même forme que les autres ; l'unité de la maison pour une consigne reprise.
   * ASSERTION MODIFIÉE (relecture des tâches 11 et 12) : `{ admin }` — la ligne d'un chauffage introuvable,
   * pour un administrateur seulement ; `ordinaire` est `compteOrdinaire(dashHass)`. */
  const pousse = "lignesMoment(etatCh, uniteTemp(null, dashHass), { admin: !ordinaire }).forEach(l => momentRows.push(<LigneMoment key={l.cle} icone={l.icone} rgb={l.rgb} nom={l.nom} sous={l.sous}";
  assert.ok(m.includes(pousse), 'les lignes du planning de chauffe ne sont plus poussées');
  assert.ok(home.includes('const ordinaire = compteOrdinaire(dashHass);') && home.indexOf('const ordinaire = compteOrdinaire(dashHass);') < home.indexOf(pousse));
  // Un chauffage ouvre SA fiche, par sa clé ; la maison mène à Objets › Chauffage, le filtre posé (la route « climat »).
  assert.ok(m.includes("onOpen={l.chauffage ? () => setFicheCh(l.chauffage) : onNav ? () => onNav('climat') : null} fiche={!!l.chauffage} />));"));
  assert.ok(APP.includes('view === \'climat\' ? <ObjetsView hass={hass} onNav={setView} filtre="chauffage"'), 'la route « climat » ouvre Objets sur le filtre Chauffage');
  assert.ok(home.includes('{ficheCh && <FicheChauffage cle={ficheCh} hass={dashHass} onClose={() => setFicheCh(null)} />}'), 'la fiche s’ouvre par la clé');
  // Les lignes du planning viennent avant le compte des zones qui chauffent, dans le même ordre que l'état.
  assert.ok(m.indexOf(pousse) < m.indexOf('const chauffe = zonesQuiChauffent(S0, etatCh);'));
  // Le compte : la règle partagée, et l'orange de la chauffe.
  assert.ok(m.includes('const chauffe = zonesQuiChauffent(S0, etatCh);'));
  assert.ok(m.includes('<LigneMoment key="clim" icone="flame" rgb="var(--o-warn2-rgb)" nom={trN(chauffe.length, \'{n} zone chauffe\', \'{n} zones chauffent\')}'));
  assert.ok(!m.includes("['heating', 'cooling']"), 'le froid d’un climatiseur ne compte plus comme de la chauffe');
});

/* ── « {n} zones chauffent » ─────────────────────────────────────────────── */

const NODON = ['comfort', 'eco', 'frost_protection', 'off', 'comfort_-1', 'comfort_-2'];
const SEL = 'select.radiateur_chambre_pilot_wire_mode';
const PUI = 'sensor.radiateur_chambre_power';
const SEL2 = 'select.radiateur_bureau_pilot_wire_mode';
/* Les zones de la maison, telles que la découverte les fait (resolve.js) : un
 * module avec son capteur de puissance, un module sans, un poêle, une clim. */
const MODULE = { id: SEL, haid: SEL, name: 'Radiateur Chambre', room: 'Chambre', type: 'pilot_wire', modeEnt: SEL, tempCible: null, hasAuto: false,
  tempSensor: null, puissance: PUI, decouvert: true };
const SANS_CAPTEUR = { ...MODULE, id: SEL2, haid: SEL2, modeEnt: SEL2, name: 'Radiateur Bureau', room: 'Bureau', puissance: null };
const POELE = { id: 'climate.poele', haid: 'climate.poele', name: 'Poêle', room: 'Séjour', type: 'thermostat', hasAuto: false, tempSensor: null };
const CLIM = { id: 'climate.clim', haid: 'climate.clim', name: 'Climatisation', room: 'Bureau', type: 'thermostat', hasAuto: false, tempSensor: null };
const etatsMaison = (o = {}) => ({
  [SEL]: { entity_id: SEL, state: 'comfort', attributes: { options: NODON } },
  [PUI]: { entity_id: PUI, state: '612', attributes: { device_class: 'power', unit_of_measurement: 'W' } },
  [SEL2]: { entity_id: SEL2, state: 'comfort', attributes: { options: NODON } },
  'climate.poele': { entity_id: 'climate.poele', state: 'heat', attributes: { hvac_action: 'heating' } },
  'climate.clim': { entity_id: 'climate.clim', state: 'cool', attributes: { hvac_action: 'cooling' } },
  ...o,
});
/* Les noms des zones qui chauffent, la maison posée le temps de la lecture. */
function chauffent(S, etat = null) {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: { climate: { available: true, list: [MODULE, SANS_CAPTEUR, POELE, CLIM] } } });
  try {
    return zonesQuiChauffent(S, etat).map(z => z.name);
  } finally {
    setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
}
const auPlanning = (entite, o = {}) => ({ chauffages: [{ cle: 'cle-' + entite, entite, planning: true, avertissements: [] }], simulation: false, ...o });

test('la zone qui chauffe : un module à plus de 10 W mesurés, un thermostat qui chauffe — jamais le froid', () => {
  /* Le module de la chambre tire 612 W : il chauffe. Celui du bureau n'a pas
   * de capteur : en Confort, il ne dit pas qu'il chauffe (sa carte non plus).
   * Le poêle chauffe ; la clim refroidit — la ligne comptait le froid. */
  assert.deepEqual(chauffent(etatsMaison()), ['Radiateur Chambre', 'Poêle']);
  assert.deepEqual(chauffent(etatsMaison({ [PUI]: { entity_id: PUI, state: '5', attributes: { device_class: 'power', unit_of_measurement: 'W' } } })), ['Poêle'],
    '5 W : au repos, même en Confort');
  assert.deepEqual(chauffent(etatsMaison({ [PUI]: { entity_id: PUI, state: '1.5', attributes: { device_class: 'power', unit_of_measurement: 'kW' } } })),
    ['Radiateur Chambre', 'Poêle'], 'un capteur en kW se lit en watts');
  // Un thermostat éteint qui garde `heating` ne chauffe pas ; préchauffer, c'est chauffer ; muet, rien.
  assert.deepEqual(chauffent(etatsMaison({ 'climate.poele': { entity_id: 'climate.poele', state: 'off', attributes: { hvac_action: 'heating' } } })), ['Radiateur Chambre']);
  assert.deepEqual(chauffent(etatsMaison({ 'climate.poele': { entity_id: 'climate.poele', state: 'heat', attributes: { hvac_action: 'preheating' } } })), ['Radiateur Chambre', 'Poêle']);
  assert.deepEqual(chauffent(etatsMaison({ 'climate.poele': { entity_id: 'climate.poele', state: 'unavailable', attributes: { hvac_action: 'heating' } } })), ['Radiateur Chambre']);
  // Un module muet ne chauffe pas, même si sa prise mesure encore.
  assert.deepEqual(chauffent(etatsMaison({ [SEL]: { entity_id: SEL, state: 'unavailable', attributes: {} } })), ['Poêle']);
  // La clim en mode chaud, qui chauffe : elle compte.
  assert.deepEqual(chauffent(etatsMaison({ 'climate.clim': { entity_id: 'climate.clim', state: 'heat', attributes: { hvac_action: 'heating' } } })), ['Radiateur Chambre', 'Poêle', 'Climatisation']);
});

test('un chauffage au planning allumé ne se compte plus : il a ses propres lignes', () => {
  assert.deepEqual(chauffent(etatsMaison(), auPlanning(SEL)), ['Poêle'], 'le module de la chambre suit son planning');
  assert.deepEqual(chauffent(etatsMaison(), auPlanning('climate.poele')), ['Radiateur Chambre'], 'le poêle suit son planning');
  // Planning éteint, ou « Observer sans agir » (le moteur n'envoie rien) : la zone se compte comme avant.
  assert.deepEqual(chauffent(etatsMaison(), { chauffages: [{ cle: 'x', entite: SEL, planning: false }], simulation: false }), ['Radiateur Chambre', 'Poêle']);
  assert.deepEqual(chauffent(etatsMaison(), auPlanning(SEL, { simulation: true })), ['Radiateur Chambre', 'Poêle']);
  // L'état du moteur pas encore lu : la règle des cartes, seule.
  assert.deepEqual(chauffent(etatsMaison(), null), ['Radiateur Chambre', 'Poêle']);
  // La source : la règle d'Objets (`chauffentParmi`), la condition des cartes (`auPlanning`).
  const corps = bloc('function zonesQuiChauffent(', NL + '}');
  assert.ok(corps.includes('if (ch && ch.planning && !etat.simulation) return false;'));
  assert.ok(corps.includes("return chauffentParmi([estClimate(z) && z.haid && S[z.haid] ? { id: z.haid } : { type: 'zone', zone: z }], S) > 0;"));
});

/* ── La fiche d'un chauffage, ouverte par sa clé ─────────────────────────── */

/* Des `hass.states` qui refusent toute lecture de `null` ou `undefined` :
 * celle d'un chauffage sans entité. Chaque clé lue est notée. */
function piege(states = {}) {
  const lus = [];
  const proxy = new Proxy(states, {
    get(t, k) {
      if (typeof k === 'string') lus.push(k);
      if (k === 'null' || k === 'undefined') throw new Error('lecture de hass.states[' + k + ']');
      return t[k];
    },
  });
  return { proxy, lus };
}
const PERDU = {
  cle: 'id-perdu', entite: null, nom: null, famille: 'fil_pilote', planning: true, modes: [], mode: 'eco', applique: null, source: 'planning',
  fin: null, puis: null, reprise: null, fenetre: 'arret', fenetre_ouverte: null, ouvrant_ouvert: null, fenetre_mode: null,
  semaine: { lun: [{ h: '07:00', mode: 'confort' }], mar: [], mer: [], jeu: [], ven: [], sam: [], dim: [] }, temperatures: null,
  avertissements: ['introuvable'], options: null, jour: null,
};
const ETAT = {
  chauffages: [PERDU], maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' }, simulation: false,
  maintenant: '2026-10-12T19:00:00+02:00', minute: [0, 1140], plannings_allumes: true, journal: [],
};

test('la coquille s’ouvre par la clé : un chauffage introuvable, sur son Planning, sans jamais lire hass.states[null]', async () => {
  reglerChauffageEtat({ hass: null });
  poserEtatChauffage(ETAT);
  try {
    const { proxy, lus } = piege({ 'sensor.x': { state: '1', attributes: {} } });
    const hass = { states: proxy, user: { is_admin: true }, callWS: () => { throw new Error('rien ne doit partir'); } };
    const html = renderToStaticMarkup(createElement(FicheChauffage, { cle: 'id-perdu', hass, onClose: () => {} }));
    assert.ok(html.includes('role="dialog"'), 'la feuille s’ouvre');
    assert.ok(html.includes('min-height:260px'), 'le contenu se charge à la demande, dans sa frontière Suspense');
    assert.deepEqual(lus, [], 'la coquille ne lit rien dans hass.states : ni sonde, ni module, ni épingle');
    /* ASSERTIONS AJOUTÉES (relecture des tâches 11 et 12) : le contenu chargé,
     * la fiche d'un chauffage introuvable s'ouvre sur son PLANNING — là où est
     * « Supprimer son planning ». */
    await new Promise(r => setTimeout(r, 50));
    const charge = renderToStaticMarkup(createElement(FicheChauffage, { cle: 'id-perdu', hass, onClose: () => {} }));
    const actif = /<button\b[^>]*role="tab"[^>]*aria-selected="true"[^>]*>.*?<span>([^<]+)<\/span><\/button>/.exec(charge);
    assert.ok(actif, 'le contenu ne s’est pas chargé : ' + charge.slice(0, 300));
    assert.equal(actif[1], 'Planning');
    assert.ok(charge.includes('>Supprimer son planning<'));
    assert.ok(!lus.includes('null') && !lus.includes('undefined'), lus.join(', '));
    /* ASSERTION MODIFIÉE (relecture des tâches 11 et 12) : une clé que l'état
     * ne connaît plus — son planning vient d'être supprimé — ne laisse plus une
     * feuille vide, « Chauffage » et la croix : elle se ferme d'elle-même
     * (`FermerSeule`, jouée plus bas — un rendu statique ne lance pas d'effet). */
    const parti = renderToStaticMarkup(createElement(FicheChauffage, { cle: 'id-supprime', hass, onClose: () => {} }));
    assert.ok(parti.includes('role="dialog"') && !parti.includes('>Chauffage</div>') && !parti.includes('min-height:260px'), parti.slice(0, 400));
  } finally {
    reglerChauffageEtat({ hass: null });
  }
  // Témoin : un chauffage présent, ouvert par sa clé depuis « En ce moment », s'ouvre sur l'Accueil.
  const coquille = bloc('\nfunction FicheChauffage(', '\nfunction FeuilleChauffage(');
  assert.ok(coquille.includes("ongletDepart={entite ? undefined : 'planning'}"));
  assert.ok(coquille.includes(') : cle && etat ? <FermerSeule fermer={fermer} /> : ('), 'par sa clé, la feuille se ferme quand le chauffage quitte l’état');
  // Ouverte par son entité (une carte), la coquille ne change pas : le chemin par la clé s'ajoute.
  assert.ok(coquille.includes('const ch = cle ? chauffageParCle(etat, cle) : chauffageDe(etat, demandee);'));
  assert.ok(coquille.includes('const entite = demandee || (ch && ch.entite) || null;'));
  assert.ok(coquille.includes('const sonde = entite ? sondeDuChauffage(S, entite) : null;') && coquille.includes('const zone = entite ? zoneDuChauffage(S, entite) : null;'));
  assert.ok(coquille.includes('epingle={entite ? <BoutonEpingle id={entite} /> : null}'), 'une épingle sans entité');
  assert.ok(bloc('\nfunction FeuilleChauffage(', NL + '}').includes('return chauffageDe(etat, entite) ? <FicheChauffage entite={entite} hass={hass} onClose={onClose} /> : ancienne;'),
    'les cartes ouvrent toujours la fiche par leur entité');
});

test('après « Supprimer son planning », la feuille ouverte par sa clé se ferme d’elle-même ; par son entité, rien ne change', () => {
  /* Relecture des tâches 11 et 12 : le chauffage supprimé quitte l'état, et la
   * coquille ouverte par sa clé rend `FermerSeule`, qui ferme la feuille — son
   * animation, puis `onClose`. Jouée ici, l'effet lancé à la main. */
  const morceau = APP.slice(APP.indexOf('function FermerSeule('), APP.indexOf('\n}\n', APP.indexOf('function FermerSeule(')) + 2);
  const js = transformSync(morceau, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Frag' }).code;
  const effets = [];
  const FermerSeule = new Function('h', 'Frag', 'useEffect', js + '\nreturn FermerSeule;')(createElement, Fragment, (f, deps) => { effets.push(deps); f(); });
  let fermee = 0;
  assert.equal(FermerSeule({ fermer: () => { fermee += 1; } }), null, 'rien à dessiner');
  assert.equal(fermee, 1, 'la feuille se ferme');
  assert.equal(effets[0].length, 1, 'l’effet ne dépend que de `fermer`');
  // Le chemin par l'entité garde son titre de repli : un chauffage qui manque le temps d'une réponse.
  reglerChauffageEtat({ hass: null });
  poserEtatChauffage(ETAT);
  try {
    const html = renderToStaticMarkup(createElement(FicheChauffage, { entite: 'climate.absent', hass: { states: {} }, onClose: () => {} }));
    assert.ok(html.includes('>absent</div>') && html.includes('data-croix'), html.slice(0, 400));
  } finally {
    reglerChauffageEtat({ hass: null });
  }
});

test('la fiche d’un chauffage introuvable s’affiche sur ses trois onglets sans lire hass.states[null] ; le Planning propose « Supprimer son planning »', () => {
  for (const onglet of ['accueil', 'planning', 'historique']) {
    const { proxy, lus } = piege({});
    const hass = { states: proxy, user: { is_admin: true }, config: { unit_system: { temperature: '°C' } }, callWS: () => { throw new Error('rien ne doit partir'); } };
    const html = renderToStaticMarkup(createElement(Fiche, { hass, ch: PERDU, etat: ETAT, sonde: null, onFiche: () => {}, ongletDepart: onglet,
      maintenant: Date.parse('2026-10-12T19:00:00+02:00') }));
    assert.ok(html.includes('data-avertissement="introuvable"') || onglet !== 'accueil', onglet + ' : l’avertissement');
    assert.ok(!lus.includes('null') && !lus.includes('undefined'), onglet + ' : ' + lus.join(', '));
    if (onglet === 'planning') assert.ok(html.includes('>Supprimer son planning<'), 'le seul chemin vers la suppression');
  }
  // Un compte ordinaire lit, sans geste : pas de suppression.
  const { proxy } = piege({});
  const ordinaire = renderToStaticMarkup(createElement(Fiche, { hass: { states: proxy, user: { is_admin: false } }, ch: PERDU, etat: ETAT, sonde: null,
    ongletDepart: 'planning', maintenant: Date.parse('2026-10-12T19:00:00+02:00') }));
  assert.ok(!ordinaire.includes('>Supprimer son planning<'));
});
