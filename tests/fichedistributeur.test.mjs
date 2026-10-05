/* La fiche du distributeur, une feuille à onglets (ADR 0155, 05/10).
 *
 * On REND la fiche (React côté serveur, ADR 0069) sur des réponses du serveur
 * fabriquées selon le contrat figé par la fixture partagée
 * (`tests/fixtures/distributeurs.json`, `contrat.etat_exemple`) — sans serveur,
 * sans Home Assistant. Ce qui est garanti ici :
 *  - Accueil, Planning et Historique sont TOUJOURS là, Entretien selon les
 *    données ; le motif ARIA des onglets est complet ;
 *  - le Planning a trois états vides honnêtes (serveur muet, aucune commande,
 *    rien de programmé) ;
 *  - « deux sources » ne s'allume que pour un programme LISIBLE actif ;
 *  - une ligne par automatisation, « coupe ses {n} repas » ;
 *  - « Modifier dans Home Assistant » seulement si modifiable, jamais en démo ;
 *  - un compte ordinaire ne voit aucune écriture de la CONFIGURATION de
 *    Loggia (ADR 0144), mais garde les commandes de l'appareil (05/10) ;
 *  - le planning de Loggia se grise « En pause » sous une source active ;
 *  - une commande qui ÉCRIT une quantité : des portions pas à pas, jamais un
 *    curseur ; l'unité de la portion est celle de l'entité ;
 *  - hors ligne : le liseré sur l'en-tête (et sur la ligne d'une
 *    automatisation tombée), et plus de « Distribuer ».
 * Sur l'état de départ (avant la fiche à onglets), ce fichier rougit en
 * entier : `src/fichedistributeur.jsx` n'existe pas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// La langue AVANT l'import : i18n et les dates la lisent au chargement.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const M = await import(new URL('../src/fichedistributeur.jsx', import.meta.url).href);
const Fiche = M.default;
const { OngletHistorique } = M;
const SOURCE = readFileSync(new URL('../src/fichedistributeur.jsx', import.meta.url), 'utf8');
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/distributeurs.json', import.meta.url), 'utf8'));
const copie = (o) => JSON.parse(JSON.stringify(o));
const ETAT = () => copie(FIXTURE.contrat.etat_exemple);

const QUAND = '2026-10-05T06:00:00Z';
const MAINTENANT = Date.parse('2026-10-05T08:00:00Z');
const st = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: QUAND, last_updated: QUAND, attributes });

/* Un Aqara sous Zigbee2MQTT, commandé par un select feed (START), sa portion
 * en grammes, et un réservoir `input_number` sans appareil — la maison de
 * l'utilisateur. `ent` : [entity_id, plateforme, clé de traduction]. */
function maison({ ents = null, states = [], admin = true, sansAppareil = false } = {}) {
  const liste = ents || [
    ['select.distributeur_feed', 'mqtt', null], ['number.distributeur_portion', 'mqtt', null], ['select.distributeur_mode', 'mqtt', null],
  ];
  const entityMeta = new Map(liste.map(([id, platform, cle]) => [id, { deviceId: sansAppareil ? null : 'dev1', platform, translationKey: cle, device: 'Distributeur cuisine' }]));
  const deviceMeta = new Map([['dev1', { id: 'dev1', name: 'Distributeur cuisine', manufacturer: 'Aqara', model: 'ZNCWWSQ01LM' }]]);
  const base = [
    st('select.distributeur_feed', 'STOP', { friendly_name: 'Distribuer', options: ['STOP', 'START'] }),
    st('number.distributeur_portion', '45', { friendly_name: 'Portion', min: 5, max: 100, step: 5, unit_of_measurement: 'g' }),
    st('select.distributeur_mode', 'manual', { friendly_name: 'Mode', options: ['schedule', 'manual'] }),
    st('input_number.croquettes_reservoir', '760', { friendly_name: 'Réservoir', max: 1500, unit_of_measurement: 'g' }),
    st('automation.croquettes_matin_et_soir', 'on', { friendly_name: 'Croquettes matin et soir' }),
    st('automation.croquettes_du_midi', 'off', { friendly_name: 'Croquettes du midi' }),
    st('automation.autre_chose', 'on', { friendly_name: 'Autre chose' }),
  ];
  const S = Object.fromEntries(base.map(s => [s.entity_id, s]));
  states.forEach(s => { if (s.state === null) delete S[s.entity_id]; else S[s.entity_id] = s; });
  return {
    index: { entityMeta, deviceMeta },
    hass: { states: S, user: { is_admin: admin }, callService: () => { throw new Error('rien ne doit partir'); } },
  };
}
const CFG = { haids: { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion' }, haid: 'select.distributeur_feed' };
const rendre = (props = {}, m = maison()) => renderToStaticMarkup(createElement(Fiche, {
  hass: m.hass, index: m.index, cfg: CFG, etat: ETAT(), maintenant: MAINTENANT, ...props,
}));
// Les onglets de la barre, dans l'ordre : [id d'onglet, libellé, attributs].
const onglets = (html) => [...html.matchAll(/<button\b([^>]*role="tab"[^>]*)>.*?<span>([^<]+)<\/span><\/button>/g)].map(m => ({ attrs: m[1], nom: m[2] }));
const panne = (html) => (html.match(/\bo-panne\b/g) || []).length;
const attr = (attrs, nom) => { const m = new RegExp('\\b' + nom + '="([^"]*)"').exec(attrs); return m ? m[1] : null; };

test('Accueil, Planning et Historique toujours là ; Entretien selon les données', () => {
  // Serveur muet, ni réservoir ni consommable : les trois onglets restent.
  const nu = rendre({ etat: null, erreur: true, cfg: { haid: 'select.distributeur_feed' } });
  assert.deepEqual(onglets(nu).map(o => o.nom), ['Accueil', 'Planning', 'Historique'], 'les trois onglets, même serveur muet');
  // Un réservoir `input_number` : « Réservoir rempli » vit dans Entretien.
  assert.deepEqual(onglets(rendre()).map(o => o.nom), ['Accueil', 'Planning', 'Historique', 'Entretien']);
  // Un consommable de l'appareil (Petlibro) suffit aussi, sans réservoir.
  const petlibro = maison({ ents: [['button.granary_manual_feed', 'petlibro', 'manual_feed'], ['sensor.granary_remaining_desiccant', 'petlibro', 'remaining_desiccant'], ['button.granary_desiccant_reset', 'petlibro', 'desiccant_reset']],
    states: [st('button.granary_manual_feed', 'unknown', {}), st('sensor.granary_remaining_desiccant', '12', { unit_of_measurement: 'd' }), st('button.granary_desiccant_reset', 'unknown', {})] });
  const html = rendre({ cfg: { appareil: 'dev1' }, ongletDepart: 'entretien' }, petlibro);
  assert.ok(onglets(html).some(o => o.nom === 'Entretien'));
  assert.ok(html.includes('Déshydratant') && html.includes('12 jours restants') && html.includes('Remplacé'), 'le consommable, ses jours, et Remplacé');
});

test('le motif ARIA des onglets : un seul arrêt de Tab, l’actif désigne son panneau nommé', () => {
  for (const depart of ['accueil', 'planning', 'historique']) {
    const html = rendre({ ongletDepart: depart });
    assert.match(html, /<div role="tablist" aria-label="Distributeur de croquettes" class="rb-onglets"/, 'la barre est nommée');
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
  // useId avant tout retour, la page des réglages hors du panneau.
  assert.ok(SOURCE.indexOf('const idOnglets = useId();') > 0);
  const reg = rendre({ ongletDepart: 'reglages' });
  assert.ok(!reg.includes('role="tablist"') && !reg.includes('role="tabpanel"'), 'Réglages : une page, pas un onglet');
  assert.ok(reg.includes('>Réglages<') && reg.includes('Retour'));
});

test('l’en-tête : le nom, l’épingle, la roue, puis la croix en dernier', () => {
  const html = rendre({ epingle: createElement('span', { 'data-epingle': '' }) });
  const tete = html.slice(0, html.indexOf('role="tablist"'));
  const i = tete.indexOf('data-epingle'), r = tete.indexOf('aria-label="Réglages"'), c = tete.indexOf('data-croix');
  assert.ok(i > 0 && r > i && c > r, 'épingle, roue, croix — dans cet ordre');
  assert.equal((tete.match(/data-croix/g) || []).length, 1, 'une seule croix');
  assert.ok(tete.slice(c).indexOf('<button') < 0, 'rien après la croix');
  // Le nom de l'appareil, à défaut « Distributeur de croquettes ».
  const etat = ETAT(); etat.appareil = null;
  assert.ok(rendre({ etat }).includes('>Distributeur cuisine<'), 'le nom de l’appareil du registre');
  assert.ok(rendre({ etat: null }, maison({ sansAppareil: true })).includes('>Distributeur de croquettes<'));
});

test('Planning : les trois états vides', () => {
  const muet = rendre({ etat: null, erreur: true, ongletDepart: 'planning' });
  assert.ok(muet.includes('Planning indisponible pour l’instant.'), 'serveur muet');
  const attente = rendre({ etat: null, erreur: false, ongletDepart: 'planning' });
  assert.ok(!attente.includes('Planning indisponible') && attente.includes('Chargement…'), 'une réponse attendue n’est pas une panne');

  const vide = (o) => ({ ...ETAT(), automatisations: [], programme: { source: null, connu: false, presente: false, active: false, lisible: false, mode: null, note: null, repas: [] },
    sources: { programme: { presente: false, active: false }, automatisations: { presente: false, active: false }, loggia: { presente: false, active: false } }, source: null, ...o });
  const sans = rendre({ etat: vide({ commande: null, peutPlanifier: false }), ongletDepart: 'planning' });
  assert.ok(sans.includes('Loggia ne sait pas commander ce distributeur : désignez son appareil ou son script de distribution dans Paramètres.'));
  assert.ok(!sans.includes('Ajouter un repas'));

  const rien = vide({ peutPlanifier: true });
  const admin = rendre({ etat: rien, ongletDepart: 'planning' });
  assert.ok(admin.includes('Aucun repas programmé.') && admin.includes('Ajouter un repas'), 'admin : l’état vide et Ajouter');
  // Le programme inconnu de l'appareil : la mise en garde fixe du formulaire.
  assert.ok(admin.includes('Si l’application du fabricant programme aussi des repas, coupez-les : sinon l’animal mange deux fois.'));
  // L'ancienne liste ne distribuait rien : la fiche le dit quand Loggia propose son planning.
  assert.ok(admin.includes('Votre ancienne liste ne distribuait rien par elle-même.'));
  const ordinaire = rendre({ etat: rien, ongletDepart: 'planning' }, maison({ admin: false }));
  assert.ok(ordinaire.includes('Aucun repas programmé.') && !ordinaire.includes('Ajouter un repas'), 'compte ordinaire : la phrase seule');
});

test('« deux sources » : seulement pour un programme LISIBLE actif', () => {
  const lisible = ETAT();
  lisible.programme = { source: 'petlibro', connu: true, presente: true, active: true, lisible: true, mode: null, note: null,
    repas: [{ heure: '07:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 2, actif: true, etat_jour: 'dispensed' }, { heure: '12:00', jours: [0, 1, 2, 3, 4], portions: 1, actif: false }] };
  lisible.sources.programme = { presente: true, active: true };
  const deux = rendre({ etat: lisible, ongletDepart: 'planning' });
  assert.ok(deux.includes('Deux sources distribuent : vérifiez qu’un repas ne part pas deux fois.'));
  assert.ok(deux.includes('Programme de l’appareil') && deux.includes('>07:00<') && deux.includes('2 portions'), 'les créneaux lisibles');
  // Un Aqara en mode programmé sans liste : présent, illisible, NON actif — pas de cri au loup.
  const illisible = ETAT();
  illisible.programme = { source: 'aqara', connu: true, presente: true, active: false, lisible: false, mode: 'programme', note: 'tenu_par_appareil', repas: [] };
  const html = rendre({ etat: illisible, ongletDepart: 'planning' });
  assert.ok(!html.includes('Deux sources'), 'un programme illisible ne crie pas au loup');
  assert.ok(html.includes('L’appareil peut aussi distribuer selon ses propres créneaux.'), 'il le dit autrement');
  assert.ok(html.includes('Mode de distribution'), 'le mode, avec renvoi aux réglages');
  // Mode manuel : pas de source, mais le mode se montre.
  assert.ok(rendre({ ongletDepart: 'planning' }).includes('Mode de distribution'));
});

test('une ligne par automatisation, ses heures lues, « coupe ses 2 repas »', () => {
  const html = rendre({ ongletDepart: 'planning' });
  assert.ok(html.includes('Vos automatisations'));
  assert.equal((html.match(/role="switch"/g) || []).length, 2, 'un interrupteur par automatisation');
  assert.ok(html.includes('07:30 · 19:00') && html.includes('12:30'), 'les heures du déclencheur');
  assert.equal((html.match(/Couper cette automatisation coupe ses 2 repas\./g) || []).length, 1, 'seulement celle qui en a deux');
  assert.ok(!html.includes('coupe ses 1 repas'), 'une automatisation d’un seul repas ne le dit pas');
  // Une heure qu'on ne peut pas déduire ne s'invente pas.
  const etat = ETAT();
  etat.automatisations[1] = { ...etat.automatisations[1], declencheurs: [{ type: 'soleil', evenement: 'sunrise', decalage: -30 }], heures: [] };
  const soleil = rendre({ etat, ongletDepart: 'planning' });
  assert.ok(soleil.includes('Lever du soleil −30 min'));
  // Non pilotable pour ce compte : pas d'interrupteur.
  etat.automatisations[0].pilotable = false;
  assert.equal((rendre({ etat, ongletDepart: 'planning' }).match(/role="switch"/g) || []).length, 1);
  // Les indices : la ligne dit d'où elle vient.
  const indices = ETAT();
  indices.automatisations[0].indice = 'ancienne_liste';
  indices.automatisations[1].indice = 'associee';
  const i = rendre({ etat: indices, ongletDepart: 'planning' });
  assert.ok(i.includes('Reconnue par votre ancienne liste') && i.includes('Associée à la main') && i.includes('Dissocier'));
});

test('« Modifier dans Home Assistant » : seulement si modifiable, jamais dans la démo', () => {
  const etat = ETAT();
  etat.automatisations[0] = { ...etat.automatisations[0], modifiable: true, id_config: '1728000000001' };
  // Un identifiant sans le droit de modifier (le contrat ne l'envoie pas, l'écran ne s'y fie pas).
  etat.automatisations[1] = { ...etat.automatisations[1], modifiable: false, id_config: '1728000000002' };
  const avant = globalThis.window;
  try {
    globalThis.window = { location: { origin: 'https://maison.example' } };
    const html = rendre({ etat, ongletDepart: 'planning' });
    assert.ok(html.includes('href="https://maison.example/config/automation/edit/1728000000001" target="_top"'), 'le lien vers son éditeur');
    assert.equal((html.match(/Modifier dans Home Assistant/g) || []).length, 1, 'et pas pour celle qui ne l’est pas');
    globalThis.window.__loggiaDemo = true;
    assert.ok(!rendre({ etat, ongletDepart: 'planning' }).includes('Modifier dans Home Assistant'), 'la démo n’a pas de Home Assistant');
  } finally {
    if (avant === undefined) delete globalThis.window; else globalThis.window = avant;
  }
});

test('un compte ordinaire ne voit aucune écriture de la configuration, mais commande l’appareil', () => {
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources.automatisations = { presente: false, active: false };
  etat.peutPlanifier = true;
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }] };
  etat.associees = [];
  const admin = rendre({ etat, ongletDepart: 'planning' });
  assert.ok(admin.includes('type="time"') && admin.includes('Supprimer') && admin.includes('Ajouter un repas') && admin.includes('role="switch"'), 'témoin : l’admin règle tout');
  assert.ok(admin.includes('Associer une automatisation'), 'témoin : Associer');
  const ord = rendre({ etat, ongletDepart: 'planning' }, maison({ admin: false }));
  assert.ok(ord.includes('>08:00<'), 'le repas se lit');
  for (const geste of ['type="time"', 'Supprimer', 'Ajouter un repas', 'role="switch"', 'Associer une automatisation']) {
    assert.ok(!ord.includes(geste), 'compte ordinaire : « ' + geste + ' » est masqué');
  }
  // Le pas à pas se nomme par ce qu'il règle (« Taille de la portion : Moins », 05/10).
  assert.ok(!/aria-label="[^"]*Moins"/.test(ord), 'compte ordinaire : les portions d’un repas de Loggia se règlent');
  assert.ok(/aria-pressed="true" disabled=""/.test(ord), 'les jours se lisent, sans se régler');
  // Les réglages de la roue commandent l'APPAREIL (number.set_value, select_option) :
  // ouverts à tous, comme la portion de l'Accueil (ADR 0144, 05/10).
  const regA = rendre({ ongletDepart: 'reglages' });
  const regO = rendre({ ongletDepart: 'reglages' }, maison({ admin: false }));
  assert.ok(/aria-label="[^"]*Moins"/.test(regA), 'témoin : l’admin règle la portion');
  assert.ok(/aria-label="[^"]*Moins"/.test(regO) && regO.includes('45 g'), 'l’ordinaire règle la portion, comme sur l’Accueil');
  // Le mode de l'Aqara dans les mots du Planning, jamais l'identifiant « Manual ».
  assert.ok(regA.includes('>Manuel<') && !regA.includes('Manual'), 'le mode se dit « Manuel »');
  // « Remplacé » est un `button.press` de l'appareil : ouvert à tous aussi (05/10).
  const petlibro = (admin) => maison({ admin, ents: [['button.granary_manual_feed', 'petlibro', 'manual_feed'], ['sensor.granary_remaining_desiccant', 'petlibro', 'remaining_desiccant'], ['button.granary_desiccant_reset', 'petlibro', 'desiccant_reset']],
    states: [st('button.granary_manual_feed', 'unknown', {}), st('sensor.granary_remaining_desiccant', '12', { unit_of_measurement: 'd' }), st('button.granary_desiccant_reset', 'unknown', {})] });
  assert.ok(rendre({ cfg: { appareil: 'dev1' }, ongletDepart: 'entretien' }, petlibro(true)).includes('Remplacé'), 'témoin');
  const ent = rendre({ cfg: { appareil: 'dev1' }, ongletDepart: 'entretien' }, petlibro(false));
  assert.ok(ent.includes('12 jours restants') && ent.includes('Remplacé'), 'l’ordinaire remet le consommable à neuf, comme il distribue');
});

test('le planning de Loggia « En pause » quand une source supérieure distribue', () => {
  const etat = ETAT();
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }] };
  const html = rendre({ etat, ongletDepart: 'planning' });
  assert.ok(html.includes('Planning de Loggia') && html.includes('En pause : une autre source distribue déjà.') && html.includes('Reprendra seul'), 'grisé, et il le dit');
  assert.ok(html.includes('Supprimer'), 'Supprimer reste pour l’admin');
  // L'automatisation coupée (état vivant de hass) : la pause tombe.
  etat.automatisations = etat.automatisations.map(a => ({ ...a, etat: 'off' }));
  etat.sources.automatisations.active = false;
  const m = maison({ states: [st('automation.croquettes_matin_et_soir', 'off', {})] });
  assert.ok(!rendre({ etat, ongletDepart: 'planning' }, m).includes('En pause'));
});

test('Distribuer : des portions pas à pas pour une commande qui écrit, jamais un curseur', () => {
  // Le select START : un bouton simple.
  const simple = rendre();
  assert.ok(/<button[^>]*>.*?Distribuer<\/button>/.test(simple) && !simple.includes('Distribuer 1 portion'), 'un bouton simple');
  // Un number `feed` de PetKit : la quantité s'écrit, en portions.
  const petkit = maison({ ents: [['number.petkit_feed', 'petkit', 'feed']], states: [st('number.petkit_feed', '0', { min: 0, max: 100, step: 10 })] });
  const html = rendre({ cfg: { appareil: 'dev1' } }, petkit);
  assert.ok(html.includes('Distribuer 1 portion') && html.includes('>1 portion<'), 'PasAPas de portions puis le bouton');
  assert.ok(!html.includes('role="slider"') && !html.includes('type="range"'), 'jamais un curseur');
  assert.ok(SOURCE.includes('const VERROU_MS = 2500;'), 'le verrou de 2,5 s');
});

test('la portion : l’unité de l’entité, jamais un « g » en dur', () => {
  assert.ok(rendre().includes('Taille de la portion') && rendre().includes('>45 g<'), 'en grammes quand l’entité le dit');
  const aqara = maison({ states: [st('number.distributeur_portion', '2', { min: 1, max: 10, step: 1 })] });
  const html = rendre({}, aqara);
  assert.ok(html.includes('>2<') && !html.includes('>2 g<'), 'un serving_size compte des portions');
});

test('hors ligne : le liseré sur l’en-tête, et plus de « Distribuer »', () => {
  const vif = rendre();
  assert.equal(panne(vif), 0, 'témoin');
  const tombe = maison({ states: [st('select.distributeur_feed', 'unavailable', { options: ['STOP', 'START'] })] });
  const html = rendre({}, tombe);
  assert.equal(panne(html), 1, 'un seul liseré');
  assert.match(html, /<div class="o-panne"[^>]*>[^]*?Ce distributeur ne répond plus\./, 'sur la ligne d’en-tête, qui le dit');
  assert.ok(!/>Distribuer</.test(html), 'Distribuer disparaît');
  // Le réservoir muet : en-tête en panne, « Indisponible » sur sa ligne, ni 0 % ni Rempli.
  const bac = maison({ states: [st('input_number.croquettes_reservoir', 'unavailable', { max: 1500 })] });
  const r = rendre({}, bac);
  assert.equal(panne(r), 1);
  assert.ok(r.includes('Indisponible') && !r.includes('>0<') && !/>Entretien</.test(r), 'ni « 0 % » ni Rempli (et Entretien n’a plus rien)');
  // Une automatisation tombée : SA ligne porte le liseré.
  const auto = maison({ states: [st('automation.croquettes_du_midi', 'unavailable', {})] });
  const p = rendre({ ongletDepart: 'planning' }, auto);
  assert.equal(panne(p), 1);
  assert.match(p, /<div class="o-panne"[^>]*>(?:(?!<\/div><\/div><\/div>)[^])*?Croquettes du midi/, 'sur la ligne de l’automatisation');
});

test('Historique : indisponible ≠ vide, et ce qu’il ne voit pas se dit', () => {
  const resume = { jours: Array.from({ length: 7 }, (_, i) => ({ date: new Date(2026, 9, 5 + i), n: 0, grammes: null, aujourdhui: i === 0 })), n: 0, grammes: null };
  const r = (p) => renderToStaticMarkup(createElement(OngletHistorique, { lignes: [], resume, chargee: true, erreur: false, aveugle: false, maintenant: MAINTENANT, ...p }));
  assert.ok(r({ erreur: true }).includes('Historique indisponible.'));
  assert.ok(!r({ erreur: true }).includes('Aucun repas'));
  assert.ok(r({}).includes('Aucun repas ces derniers jours.'));
  assert.ok(r({ aveugle: true }).includes('L’historique ne voit que les repas partis de Home Assistant.'));
  const lignes = [{ t: MAINTENANT - 3600000, source: 'automatisation', quantites: [{ valeur: 45, unite: 'g' }], grammes: 45, origines: [] },
    { t: MAINTENANT - 7200000, source: 'manuel', quantites: [], grammes: null, origines: [] }];
  const h = r({ lignes });
  assert.ok(h.includes('Depuis une automatisation') && h.includes('45 g') && h.includes('Manuel'), 'une ligne par repas, avec sa source');
  // Une source qu'on ne sait pas : le moment seul, sans libellé inventé.
  const inconnue = r({ lignes: [{ t: MAINTENANT - 3600000, source: null, quantites: [{ valeur: 24, unite: 'g' }], grammes: 24, origines: [] }] });
  assert.ok(inconnue.includes('24 g') && !inconnue.includes('Dernier repas') && !inconnue.includes('Depuis'), 'pas de source devinée');
  // Rien à lire et rien de vu : pas de « 0 repas » cette semaine.
  assert.ok(!r({ aveugle: true }).includes('0 repas'));
  // La fiche entière, hors connexion : l'historique s'annonce en lecture, il n'est pas « vide ».
  assert.ok(rendre({ ongletDepart: 'historique' }).includes('Lecture de l’historique…'));
});

test('l’accueil : jours de réserve sur les repas ACTIFS, prochain repas, aujourd’hui', () => {
  const m = maison({ states: [st('sensor.distributeur_weight_per_day', '45', { unit_of_measurement: 'g', state_class: 'total_increasing' })],
    ents: [['select.distributeur_feed', 'mqtt', null], ['number.distributeur_portion', 'mqtt', null], ['sensor.distributeur_weight_per_day', 'mqtt', null]] });
  const html = rendre({}, m);
  // 760 g, deux repas de 45 g à 07:30 et 19:00 (le midi est coupé) : 8 jours.
  assert.ok(html.includes('Environ 8 jours de réserve'), 'la réserve compte les seuls repas allumés');
  assert.ok(html.includes('Prochain repas') && html.includes('Croquettes matin et soir'), 'le prochain repas, et d’où il vient');
  assert.ok(html.includes('Aujourd’hui : 45 g'), 'le compteur du jour');
});

/* ── Relecture du contradicteur (05/10) ───────────────────────────────────── */

test('« Aujourd’hui » : l’historique ne compte que s’il VOIT l’appareil', () => {
  const { texteAujourdhui } = M;
  const vu = [{ t: MAINTENANT - 3600000, source: 'automatisation', quantites: [], grammes: null, origines: [] }];
  const rien = { repas: null, portions: null, grammes: null };
  // Un compteur ou un « dernier repas » : l'historique voit tout ce qui sort.
  assert.equal(texteAujourdhui(rien, vu, { aveugle: false, maintenant: MAINTENANT }), 'Aujourd’hui : 1 repas');
  // Aveugle : il ne voit que ce que Home Assistant a lancé — « 1 repas » tairait l'application du fabricant.
  assert.equal(texteAujourdhui(rien, vu, { aveugle: true, maintenant: MAINTENANT }), null, 'aveugle : rien d’affirmé');
  // Pas encore lu : rien non plus ; le compteur de l'appareil, lui, parle toujours.
  assert.equal(texteAujourdhui(rien, null, { maintenant: MAINTENANT }), null);
  assert.equal(texteAujourdhui({ repas: 2, portions: null, grammes: 90 }, null, { aveugle: true, maintenant: MAINTENANT }), 'Aujourd’hui : 2 repas · 90 g');
});

test('Historique aveugle et vide : pas de « Aucun repas » qu’on ne sait pas', () => {
  const resume = { jours: Array.from({ length: 7 }, (_, i) => ({ date: new Date(2026, 9, 5 + i), n: 0, grammes: null, aujourdhui: i === 0 })), n: 0, grammes: null };
  const r = (p) => renderToStaticMarkup(createElement(OngletHistorique, { lignes: [], resume, chargee: true, erreur: false, aveugle: false, maintenant: MAINTENANT, ...p }));
  assert.ok(r({}).includes('Aucun repas ces derniers jours.'), 'témoin : un appareil qui se voit, vide, le dit');
  const aveugle = r({ aveugle: true });
  assert.ok(aveugle.includes('L’historique ne voit que les repas partis de Home Assistant.') && !aveugle.includes('Aucun repas'), 'aveugle : la limite, pas un vide inventé');
});

test('l’état se DIT sans interrupteur : repas éteint, automatisation éteinte, créneau éteint', () => {
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources.automatisations = { presente: false, active: false };
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: false }] };
  const admin = rendre({ etat, ongletDepart: 'planning' });
  assert.ok(admin.includes('role="switch"') && !admin.includes('>Éteint<'), 'témoin : l’admin a sa bascule');
  assert.ok(rendre({ etat, ongletDepart: 'planning' }, maison({ admin: false })).includes('>Éteint<'), 'compte ordinaire : le repas coupé se lit');
  // Une automatisation que ce compte ne commande pas.
  const e2 = ETAT();
  e2.automatisations[1].pilotable = false;
  const h = rendre({ etat: e2, ongletDepart: 'planning' });
  assert.ok(h.includes('>Éteinte<'), 'l’automatisation coupée, sans bascule, le dit');
  // Le créneau éteint d'un programme lisible : « Éteint », pas « Inactif » (le `idle` de HA, « Idle »).
  const e3 = ETAT();
  e3.programme = { source: 'petlibro', connu: true, presente: true, active: true, lisible: true, mode: null, note: null,
    repas: [{ heure: '12:00', jours: [0, 1, 2, 3, 4], portions: 1, actif: false }] };
  const p = rendre({ etat: e3, ongletDepart: 'planning' });
  assert.ok(p.includes('>Éteint<') && !p.includes('Inactif'));
});

test('la tuile du prochain repas : pas de portions qu’une pression ne règle pas', () => {
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources.automatisations = { presente: false, active: false };
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '19:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 3, actif: true }] };
  // Le select START : une pression = une ration, le Planning ne montre pas de portions.
  const html = rendre({ etat });
  assert.ok(html.includes('Prochain repas') && html.includes('Planning de Loggia'), 'témoin : la tuile');
  assert.ok(!html.includes('3 portions'), 'aucune quantité inventée');
  // Une commande qui écrit une quantité : les portions comptent.
  etat.commande = { domaine: 'number', quantite: true, min: 0, max: 100, pas: 10 };
  assert.ok(rendre({ etat }).includes('3 portions'));
});

test('un réservoir muet ne retire pas « Distribuer » : la vis, elle, répond', () => {
  const bac = maison({ states: [st('input_number.croquettes_reservoir', 'unavailable', { max: 1500 })] });
  const html = rendre({}, bac);
  assert.equal(panne(html), 1, 'le liseré de l’en-tête');
  assert.ok(/>Distribuer</.test(html), 'Distribuer reste');
});

test('douze repas : « Ajouter » ne se propose plus (le serveur refuserait trop_de_repas)', () => {
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources.automatisations = { presente: false, active: false };
  etat.peutPlanifier = true;
  const repas = (n) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, heure: String(8 + Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'), jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }));
  etat.planning = { appareil: 'dev1', repas: repas(11) };
  assert.ok(rendre({ etat, ongletDepart: 'planning' }).includes('Ajouter un repas'), 'témoin : onze, on ajoute');
  etat.planning = { appareil: 'dev1', repas: repas(12) };
  assert.ok(!rendre({ etat, ongletDepart: 'planning' }).includes('Ajouter un repas'));
  // La limite est celle du serveur.
  const py = readFileSync(new URL('../custom_components/loggia/distributeurs.py', import.meta.url), 'utf8');
  assert.match(py, /^MAX_REPAS = 12$/m);
  assert.ok(SOURCE.includes('const MAX_REPAS = 12;'));
});

/* ── Finition de l'écran (relecture du 05/10) ─────────────────────────────── */

// Un Aqara en mode manuel, sans automatisation ni repas de Loggia : la maison type.
const AQARA_SEUL = () => {
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources.automatisations = { presente: false, active: false };
  etat.peutPlanifier = true;
  etat.planning = { appareil: null, repas: [] };
  return etat;
};

test('Planning : le planning de Loggia reste PROPOSÉ sous le bloc « Programme de l’appareil »', () => {
  const html = rendre({ etat: AQARA_SEUL(), ongletDepart: 'planning' });
  assert.ok(html.includes('Mode de distribution'), 'témoin : le bloc du programme (mode manuel) est là');
  // Le serveur dit `peutPlanifier` : rien d'autre ne distribue. La troisième source se propose.
  assert.ok(html.includes('Ajouter un repas'), 'un Aqara en mode manuel sans automatisation n’obtient jamais « Ajouter un repas »');
  assert.ok(html.includes('Aucun repas programmé.') && html.includes('Planning de Loggia'), 'l’état vide, nommé : c’est le planning de LOGGIA qui est vide');
  assert.ok(html.includes('Votre ancienne liste ne distribuait rien par elle-même.'), 'la phrase de l’ancienne liste accompagne la proposition');
  // Un compte ordinaire : la configuration de Loggia reste masquée (ADR 0144).
  assert.ok(!rendre({ etat: AQARA_SEUL(), ongletDepart: 'planning' }, maison({ admin: false })).includes('Ajouter un repas'));
  // Le serveur refuse (une autre source) : rien ne se propose.
  const non = AQARA_SEUL(); non.peutPlanifier = false;
  assert.ok(!rendre({ etat: non, ongletDepart: 'planning' }).includes('Ajouter un repas'));
});

test('la phrase de l’ancienne liste ne flotte pas sous un planning de Loggia déjà rempli', () => {
  const etat = AQARA_SEUL();
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }] };
  const html = rendre({ etat, ongletDepart: 'planning' });
  assert.ok(html.includes('Ajouter un repas'), 'témoin : le planning de Loggia est là');
  assert.ok(!html.includes('Votre ancienne liste ne distribuait rien par elle-même.'), 'la phrase orpheline sous un planning rempli');
});

test('« Ajouter un repas » prend la première heure pleine LIBRE : jamais deux repas à 08:00', () => {
  const { heureLibre } = M;
  assert.equal(typeof heureLibre, 'function', 'heureLibre est exportée');
  assert.equal(heureLibre([]), '08:00');
  assert.equal(heureLibre([{ heure: '08:00' }, { heure: '18:30' }]), '09:00', 'un repas de 08:00 existe : pas de second à 08:00');
  assert.equal(heureLibre([{ heure: '08:00' }, { heure: '09:00' }, { heure: '10:00' }]), '11:00');
  const pleines = Array.from({ length: 16 }, (_, i) => ({ heure: String(8 + i).padStart(2, '0') + ':00' }));
  assert.equal(heureLibre(pleines), '00:00', 'après 23:00, on repart de minuit');
  assert.ok(/heure: heureLibre\(repas\)/.test(SOURCE), '« Ajouter » se sert de la première heure libre');
});

test('droits : un compte ordinaire garde l’interrupteur des automatisations, la roue — et ne voit pas « Dissocier »', () => {
  // ETAT() : deux automatisations pilotables. Les commander est permis par Home Assistant (ADR 0144).
  const ord = rendre({ ongletDepart: 'planning' }, maison({ admin: false }));
  assert.equal((ord.match(/role="switch"/g) || []).length, 2, 'un compte ordinaire perd l’interrupteur d’une automatisation qu’il commande');
  assert.ok(rendre({ ongletDepart: 'accueil' }, maison({ admin: false })).includes('aria-label="Réglages"'), 'la roue des réglages de l’appareil reste à tous');
  // « Dissocier » écrit `loggia_feeder.associees` : de la configuration de Loggia.
  const etat = ETAT();
  etat.automatisations[1] = { ...etat.automatisations[1], indice: 'associee' };
  assert.ok(rendre({ etat, ongletDepart: 'planning' }).includes('Dissocier'), 'témoin : l’administrateur dissocie');
  assert.ok(!rendre({ etat, ongletDepart: 'planning' }, maison({ admin: false })).includes('Dissocier'), 'un compte ordinaire voit « Dissocier »');
});

test('« En pause » quand seul le serveur sait qu’une source supérieure distribue (lecture refusée)', () => {
  // Le compte ne peut pas LIRE les automatisations : le serveur ne les rend pas, mais dit qu'une distribue.
  const etat = ETAT();
  etat.automatisations = [];
  etat.sources.automatisations = { presente: true, active: true };
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }] };
  assert.ok(rendre({ etat, ongletDepart: 'planning' }).includes('En pause : une autre source distribue déjà.'), 'le planning de Loggia se montre actif alors que le serveur le retient');
  etat.sources.automatisations = { presente: false, active: false };
  assert.ok(!rendre({ etat, ongletDepart: 'planning' }).includes('En pause'), 'témoin : sans source supérieure, pas de pause');
});

test('un état ÉCRIT ne s’estompe pas : « Éteint », le créneau et l’automatisation coupée gardent leur couleur', () => {
  const e3 = ETAT();
  e3.programme = { source: 'petlibro', connu: true, presente: true, active: true, lisible: true, mode: null, note: null,
    repas: [{ heure: '12:00', jours: [0, 1, 2, 3, 4], portions: 1, actif: false }] };
  const p = rendre({ etat: e3, ongletDepart: 'planning' });
  assert.ok(p.includes('>Éteint<'), 'témoin');
  assert.ok(!/opacity:0?\.55/.test(p), 'le créneau éteint est grisé par opacité : « Éteint » descend à 2,3:1');
  // L'automatisation coupée (le midi, `off`) : ses détails en gris de texte, pas en opacité.
  assert.ok(!/opacity:0?\.6\b/.test(rendre({ ongletDepart: 'planning' })), 'l’automatisation coupée est estompée par opacité (3,5:1)');
});

test('noms accessibles : chaque repas de Loggia est un groupe nommé, le pas à pas dit ce qu’il règle', () => {
  const etat = AQARA_SEUL();
  etat.planning = { appareil: 'dev1', repas: [{ id: 'r1', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 1, actif: true }, { id: 'r2', heure: '18:30', jours: [0], portions: 1, actif: true }] };
  const html = rendre({ etat, ongletDepart: 'planning' });
  assert.ok(html.includes('role="group" aria-label="Repas de 08:00"') && html.includes('role="group" aria-label="Repas de 18:30"'), '« Heure », « Lundi », « Supprimer » ×2 sans dire de quel repas');
  const acc = rendre();
  assert.ok(acc.includes('aria-label="Taille de la portion : Moins"') && acc.includes('aria-label="Taille de la portion : Plus"'), 'le pas à pas de la portion nommé par ce qu’il règle');
  const reg = rendre({ ongletDepart: 'reglages' });
  assert.ok(/aria-label="[^"]+ : Moins"/.test(reg), 'Réglages : « Moins » répété pour chaque ligne');
});

test('le focus suit les vues internes : roue, Retour, tuiles, Ajouter ont un point d’arrivée', () => {
  const html = rendre({});
  const roue = /<button[^>]*id="([^"]+)"[^>]*aria-label="Réglages"/.exec(html);
  assert.ok(roue && roue[1].endsWith('-roue'), 'la roue a un identifiant pour y rendre le focus');
  const reg = rendre({ ongletDepart: 'reglages' });
  assert.ok(/<button[^>]*id="[^"]+-retour"[^>]*>Retour<\/button>/.test(reg), 'Retour a un identifiant pour y poser le focus');
  const pl = rendre({ etat: AQARA_SEUL(), ongletDepart: 'planning' });
  assert.ok(/<button[^>]*id="[^"]+-ajouter"/.test(pl), '« Ajouter un repas » reçoit le focus après une suppression');
  // Chaque changement de vue passe par `focaliser` (fichecommune.jsx).
  assert.ok(/const allerA = \(id\) => \{ setOnglet\(id\); focaliser\(idOnglets \+ '-t-' \+ id\); \};/.test(SOURCE), 'les tuiles et l’alerte changent d’onglet sans poser le focus');
  assert.ok(SOURCE.includes("focaliser(idOnglets + '-retour')") && SOURCE.includes('focaliser(ouvreur.current'), 'Réglages : le focus va à Retour, puis revient à ce qui l’a ouvert');
  // « Distribuer » pendant son verrou : désactivé pour les yeux, pas pour le clavier.
  const acc = SOURCE.slice(SOURCE.indexOf('function OngletAccueil('), SOURCE.indexOf('\n}\n', SOURCE.indexOf('function OngletAccueil(')));
  assert.ok(acc.includes('aria-disabled={verrou}'), 'Distribuer ne dit pas son verrou');
  assert.ok(!/[^-]disabled=\{verrou\}/.test(acc), 'Distribuer `disabled` : le focus tombe sur <body>');
});

test('Retour ramène à la vue d’où l’on venait (Planning par « Mode de distribution »)', () => {
  assert.ok(/const versReglages = \(depuis\) => \{ retourVers\.current = actuel;/.test(SOURCE)
    && SOURCE.includes("const vers = retourVers.current || 'accueil'; setOnglet(vers);"), 'Retour ramène toujours à l’Accueil');
  assert.ok(SOURCE.includes("versReglages={() => versReglages(idOnglets + '-mode')}"), 'la ligne « Mode de distribution » ne dit pas d’où l’on vient');
});

test('la pastille du jour s’élargit au mot (« Gestern », « Wczoraj ») au lieu de déborder', () => {
  const resume = { jours: Array.from({ length: 7 }, (_, i) => ({ date: new Date(2026, 9, 5 + i), n: 0, grammes: null, aujourdhui: i === 0 })), n: 0, grammes: null };
  const h = renderToStaticMarkup(createElement(OngletHistorique, { lignes: [{ t: MAINTENANT - 86400000, source: 'manuel', quantites: [], grammes: null, origines: [] }], resume, chargee: true, erreur: false, aveugle: false, maintenant: MAINTENANT }));
  assert.ok(/min-width:42px;height:42px/.test(h) && !/[;"]width:42px/.test(h), 'une largeur fixe de 42 px coupe « Gestern » (44 px)');
});
