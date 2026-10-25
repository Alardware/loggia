// ─────────────────────────────────────────────────────────────────────────────
// Le distributeur de croquettes : ce que l'écran CALCULE (ADR 0155, 05/10).
//
// La fiche devient une feuille à onglets sur le modèle du robot. Ce qui s'y
// calcule vit dans src/distributeur.js, sans React : la commande, la portion,
// les anomalies, les consommables, « en ligne », le prochain repas, les jours
// de réserve, l'historique, les états vides du Planning.
//
// La table de la commande est celle de distributeur_appareil.py, À
// L'IDENTIQUE : une seule fixture (tests/fixtures/distributeurs.json), lue par
// les deux suites. Si le JS et le Python divergent, l'un des deux rougit.
//
// Trois règles du 05/10 tiennent ici :
//  - rien ne sort de l'APPAREIL désigné (fin du « premier select.*feed de la
//    maison » : un aquarium à côté, et c'est lui qu'on nourrissait) ;
//  - un script deviné à son nom ne commande jamais ;
//  - une heure qu'on ne peut pas déduire ne s'invente pas : le prochain repas
//    et les jours de réserve ne comptent que les heures FIXES.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La langue AVANT l'import : les libellés et les jours se lisent en français.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
/* ASSERTION MODIFIÉE (chantier IoT, tâche 1, 18/10 ; § 12) : l'historique reconstruit, son résumé, le planning affiché, les libellés,
 * la mesure d'une portion et les scripts candidats ont quitté `distributeur.js` (au démarrage) pour `distributeurfiche.js`, que la
 * fiche et Paramètres importent à la demande. Les deux modules se lisent ensemble : chaque fonction est la même. */
const D = { ...(await import('../src/distributeur.js')), ...(await import('../src/distributeurfiche.js')) };
const { setLoggiaState } = await import('../src/state.js');
const L = await import('../src/lectures.js');

const F = JSON.parse(readFileSync(new URL('./fixtures/distributeurs.json', import.meta.url), 'utf8'));

/** L'index et les états d'un cas de la fixture, tels que discovery.js les bâtit. */
function maison(cas) {
  const noms = new Map((cas.appareils || []).map(a => [a.device_id, a.nom]));
  const entityMeta = new Map();
  const states = {};
  for (const e of cas.entites) {
    entityMeta.set(e.entity_id, {
      deviceId: e.device_id || null, device: e.device_id ? (noms.get(e.device_id) || null) : null,
      category: e.categorie || null, hidden: !!e.masquee, disabled: !!e.desactivee, name: null,
      platform: e.plateforme || null, deviceClass: e.classe || null, translationKey: e.cle || null,
    });
    if (e.etat != null) states[e.entity_id] = { entity_id: e.entity_id, state: e.etat, attributes: e.attributs || {} };
  }
  return { index: { entityMeta }, states };
}

/* ════════════ La fixture partagée ════════════ */

test('les tables sont celles de la fixture, clé par clé', () => {
  // Une vingtaine d'entrées ne décident d'aucun attendu : les cas seuls ne les figeraient pas.
  /* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point F) : les tables que le démarrage ne lit pas — le programme de l'appareil,
   * les consommables, le mode, les cibles — vivent dans `TABLES_FICHE` (distributeurfiche.js) ; la fixture fige l'UNION, et une clé ne
   * vit que d'un côté. */
  const communes = Object.keys(D.TABLES).filter(k => k in D.TABLES_FICHE);
  assert.deepEqual(communes, [], 'une table des deux côtés');
  const tables = { ...D.TABLES, ...D.TABLES_FICHE };
  assert.deepEqual(Object.keys(tables).sort(), Object.keys(F.tables).sort());
  for (const k of Object.keys(F.tables)) assert.deepEqual(tables[k], F.tables[k], k);
  assert.ok(Object.keys(D.TABLES_FICHE).length >= 10 && Object.keys(D.TABLES).length >= 20, 'les deux moitiés ont leur part');
});

test('la fixture entière : appareil, commande, portion, cibles, anomalies, consommables, en ligne, capteurs', () => {
  assert.ok(F.cas.length >= 31, 'la fixture a perdu des cas');
  for (const cas of F.cas) {
    const { index, states } = maison(cas);
    const A = cas.attendu;
    const l = D.lireDistributeur(index, states, cas.config);
    const dit = (champ) => `[${cas.id}] ${champ}`;
    assert.equal(l.appareil, A.appareil, dit('appareil'));
    /* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point F) : ce que seule la popup lit (les consommables, le select du mode) ou que
     * seul le serveur emploie (les notes, les cibles de commande) se calcule dans distributeurfiche.js sur les sœurs que `lireDistributeur`
     * rend — le démarrage n'en porte rien ; la fixture fige toujours chaque brique. */
    assert.deepEqual(D.notesAppareil(index, cas.config, l.appareil), A.notes, dit('notes'));
    assert.deepEqual(l.commande, A.commande, dit('commande'));
    assert.equal(l.commande && l.commande.quantite ? D.valeurPortions(l.commande, 1) : null, A.une_portion, dit('une_portion'));
    assert.deepEqual(D.envoiDistribuer(l.commande, 2), A.envoi_2_portions, dit('envoi_2_portions'));
    assert.deepEqual(l.portion, A.portion, dit('portion'));
    assert.deepEqual(l.poidsPortion, A.poids_portion, dit('poids_portion'));
    assert.deepEqual(D.ciblesDeCommande({ commande: l.commande, portion: l.portion, mode: D.selectMode(l.soeurs), cfg: cas.config }), A.cibles_de_commande, dit('cibles_de_commande'));
    assert.deepEqual(l.anomalies, A.anomalies, dit('anomalies'));
    assert.deepEqual(D.consommablesDistributeur(l.soeurs), A.consommables, dit('consommables'));
    for (const k of ['consommables', 'reglages', 'notes', 'cibles', 'mode']) assert.ok(!(k in l), dit('lireDistributeur porte encore « ' + k + ' », que la carte ne lit pas'));
    assert.deepEqual(l.enLigne, A.en_ligne, dit('en_ligne'));
    assert.equal(l.enCours, A.en_cours, dit('en_cours'));
    assert.equal(l.prochainCapteur, A.prochain_capteur, dit('prochain_capteur'));
    assert.deepEqual(l.historique, A.historique, dit('historique'));
  }
});

test('chaque brique, appelée seule, rend ce que lireDistributeur assemble', () => {
  // La fiche et la carte (T5, T6) peuvent appeler une brique sans tout relire.
  for (const cas of F.cas) {
    const { index, states } = maison(cas);
    const l = D.lireDistributeur(index, states, cas.config);
    const dev = D.appareilDistributeur(index, cas.config);
    assert.equal(dev, l.appareil, cas.id);
    assert.deepEqual(D.notesAppareil(index, cas.config, dev), cas.attendu.notes, cas.id);
    const s = D.soeursDistributeur(index, states, dev, cas.config);
    assert.deepEqual(s, l.soeurs, cas.id);
    const c = D.commandeDistribuer(s, states, cas.config);
    const p = D.portionDistributeur(s, states, cas.config, dev);
    assert.deepEqual(p, l.portion, cas.id);
    assert.deepEqual(D.poidsPortion(s, states, cas.config, dev), l.poidsPortion, cas.id);
    const mode = D.selectMode(s);
    assert.ok(mode === null || mode.domaine === 'select', cas.id);
    assert.deepEqual(D.ciblesDeCommande({ commande: c, portion: p, mode, cfg: cas.config }), cas.attendu.cibles_de_commande, cas.id);
    assert.deepEqual(D.anomaliesDistributeur(s), l.anomalies, cas.id);
    // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point F) : les consommables et les réglages sont des briques de la popup
    // (distributeurfiche.js), appelées sur les sœurs que `lireDistributeur` rend.
    assert.deepEqual(D.consommablesDistributeur(s), cas.attendu.consommables, cas.id);
    assert.equal(D.capteurEnCours(s), l.enCours, cas.id);
    assert.equal(D.capteurProchain(s), l.prochainCapteur, cas.id);
    assert.deepEqual(D.sourcesHistorique(s), l.historique, cas.id);
    const r = D.reglagesDistributeur(s, c);
    assert.ok(Array.isArray(r.principaux) && Array.isArray(r.autres) && !r.principaux.concat(r.autres).some(x => c && x.id === c.entity_id), cas.id);
    assert.deepEqual(D.enLigne(s, states, cas.config), l.enLigne, cas.id);
  }
  assert.equal(D.libelleDecalage(0), '');
  assert.equal(D.libelleDecalage(-30), '−30 min');
  assert.equal(D.libelleDecalage(90), '+1 h 30');
});

test('jamais une commande prise HORS de l’appareil désigné', () => {
  for (const cas of F.cas) {
    const { index, states } = maison(cas);
    const l = D.lireDistributeur(index, states, cas.config);
    if (!l.commande || l.commande.domaine === 'script') continue;
    assert.equal(index.entityMeta.get(l.commande.entity_id).deviceId, l.appareil, cas.id);
  }
  // Deux distributeurs et le select « feed » d'un aquarium : c'est celui du salon.
  const deux = F.cas.find(c => c.id === 'deux_distributeurs_et_un_select_feed_etranger');
  const m = maison(deux);
  assert.equal(D.lireDistributeur(m.index, m.states, deux.config).commande.entity_id, 'select.salon_feed');
  // L'appareil désigné n'a pas de commande : rien, même faute de mieux.
  const sans = F.cas.find(c => c.id === 'appareil_sans_commande_et_commandes_etrangeres');
  const ms = maison(sans);
  assert.equal(D.lireDistributeur(ms.index, ms.states, sans.config).commande, null);
});

test('un script deviné à son nom n’est jamais une commande ; le script désigné l’est', () => {
  const devine = F.cas.find(c => c.id === 'script_devine_jamais');
  const m = maison(devine);
  assert.equal(D.lireDistributeur(m.index, m.states, devine.config).commande, null);
  const designe = F.cas.find(c => c.id === 'script_seul');
  const md = maison(designe);
  assert.deepEqual(D.envoiDistribuer(D.lireDistributeur(md.index, md.states, designe.config).commande, 3),
    { domaine: 'script', service: 'turn_on', data: { entity_id: 'script.remplir_la_gamelle', variables: { portions: 3 } } });
  // Un « script » qui n'en est pas un ne part pas non plus.
  assert.equal(D.commandeDistribuer([], {}, { script: 'automation.croquettes' }), null);
});

test('une portion = un pas, bornée par l’entité', () => {
  const c = { domaine: 'number', service: 'set_value', entity_id: 'number.x_manual_feed', donnees: {}, quantite: true, min: 0, max: 100, pas: 20 };
  assert.equal(D.valeurPortions(c, 1), 20);
  assert.equal(D.valeurPortions(c, 3), 60);
  assert.equal(D.valeurPortions(c, 9), 100, 'le plafond de l’entité');
  assert.equal(D.valeurPortions({ ...c, min: 30 }, 1), 30, 'le plancher de l’entité');
  assert.equal(D.valeurPortions({ ...c, quantite: false }, 2), null, 'un bouton n’écrit pas de quantité');
});

/* ════════════ En ligne (ADR 0048) ════════════ */

test('en ligne : commande muette, connectivité coupée, réservoir muet — et un réservoir sans valeur n’est pas une panne', () => {
  const base = F.cas.find(c => c.id === 'aqara_z2m_manuel');
  const essai = (retouche, cfg = base.config) => {
    const m = maison(base);
    retouche(m.states);
    return D.lireDistributeur(m.index, m.states, cfg).enLigne;
  };
  assert.deepEqual(essai(() => {}), { mort: false, raison: null });
  assert.deepEqual(essai(S => { S['select.distributeur_cuisine_feed'].state = 'unavailable'; }), { mort: true, raison: 'commande' });
  // Un bouton de commande sans état (encore au registre, plus dans les états) : absent = muet.
  const pb = F.cas.find(c => c.id === 'petlibro');
  const mb = maison(pb);
  delete mb.states['button.granary_manual_feed'];
  assert.deepEqual(D.lireDistributeur(mb.index, mb.states, pb.config).enLigne, { mort: true, raison: 'commande' });
  // `unknown` est l'état normal d'un select feed de Zigbee2MQTT.
  assert.deepEqual(essai(S => { S['select.distributeur_cuisine_feed'].state = 'unknown'; }), { mort: false, raison: null });
  // Chez l'utilisateur, le réservoir est un input_number qui ne tombe jamais : il faut la commande pour voir la panne.
  assert.deepEqual(essai(S => { S['input_number.croquettes_reservoir'].state = 'unavailable'; }), { mort: true, raison: 'reservoir' });
  assert.deepEqual(essai(S => { delete S['input_number.croquettes_reservoir']; }), { mort: true, raison: 'reservoir' });
  assert.deepEqual(essai(S => { S['input_number.croquettes_reservoir'].state = 'unknown'; }), { mort: false, raison: null });
  const pl = F.cas.find(c => c.id === 'petlibro_deconnecte');
  const mp = maison(pl);
  assert.deepEqual(D.enLigne(D.soeursDistributeur(mp.index, mp.states, 'dev_petlibro'), mp.states, pl.config), { mort: true, raison: 'connectivite' });
});

/* ════════════ Le prochain repas ════════════ */

const ETAT = F.contrat.etat_exemple;
// Le lundi 5 octobre 2026, heure locale : la machine de test peut être n'importe où.
const LUNDI = (h, m = 0) => new Date(2026, 9, 5, h, m).getTime();
const SAMEDI = (h, m = 0) => new Date(2026, 9, 10, h, m).getTime();
const autos = Object.fromEntries(F.automatisations.cas.filter(c => c.attendu.nom).map(c => [c.id, { entity_id: 'automation.' + c.id, ...c.attendu }]));

test('prochain repas : les automatisations allumées, à heure fixe, la première STRICTEMENT après maintenant', () => {
  const p = D.prochainRepas(ETAT, LUNDI(8));
  assert.equal(p.heure, '19:00');
  assert.equal(p.source, 'automatisations');
  assert.equal(p.nom, 'Croquettes matin et soir');
  assert.equal(p.date.getTime(), LUNDI(19));
  // 19:00 passée : 07:30 le lendemain. À 07:30 pile, ce n'est plus « prochain ».
  assert.equal(D.prochainRepas(ETAT, LUNDI(20)).date.getTime(), new Date(2026, 9, 6, 7, 30).getTime());
  assert.equal(D.prochainRepas(ETAT, LUNDI(7, 30)).heure, '19:00');
  // « Croquettes du midi » est coupée ; allumée (l'état vivant de la fiche), elle passe — en semaine seulement.
  const allumee = (a) => a.entity_id === 'automation.croquettes_du_midi' || a.etat === 'on';
  assert.equal(D.prochainRepas(ETAT, LUNDI(8), { allumee }).heure, '12:30');
  assert.equal(D.prochainRepas(ETAT, SAMEDI(8), { allumee }).heure, '19:00');
});

test('prochain repas : ni soleil, ni périodique, ni helper vide — une heure non fixe ne s’invente pas', () => {
  const etat = { ...ETAT, automatisations: [autos.soleil_et_condition_ou, autos.periodique_sans_identifiant, autos.heure_d_un_helper_vide] };
  assert.ok(etat.automatisations.every(a => a && a.etat === 'on'));
  assert.equal(D.prochainRepas(etat, LUNDI(8)), null);
  // Le capteur de l'appareil prend alors le relais, s'il annonce une heure À VENIR.
  const p = D.prochainRepas(etat, LUNDI(8), { capteur: new Date(LUNDI(18)).toISOString() });
  assert.equal(p.source, 'capteur');
  assert.equal(p.date.getTime(), LUNDI(18));
  assert.equal(D.prochainRepas(etat, LUNDI(8), { capteur: new Date(LUNDI(7)).toISOString() }), null, 'une heure passée n’est pas « prochaine »');
  // Serveur muet (HA pas redémarré) : le capteur seul.
  assert.equal(D.prochainRepas(null, LUNDI(8), { capteur: new Date(LUNDI(18)).toISOString() }).source, 'capteur');
  assert.equal(D.prochainRepas(null, LUNDI(8)), null);
});

test('prochain repas : le programme lisible et actif de l’appareil ; le planning de Loggia seulement sans source supérieure active', () => {
  const programme = F.cas.find(c => c.id === 'petlibro').attendu.programme;
  const p = D.prochainRepas({ programme, automatisations: [] }, LUNDI(8));
  // 12:00 est un créneau coupé : 19:30.
  assert.deepEqual([p.heure, p.source], ['19:30', 'appareil']);
  // Illisible (Aqara en mode programmé sans liste) : présent, non actif, aucune heure.
  const illisible = F.cas.find(c => c.id === 'aqara_z2m_sans_liste').attendu.programme;
  assert.equal(D.prochainRepas({ programme: illisible, automatisations: [] }, LUNDI(8)), null);
  const planning = F.contrat.loggia_distributeurs;
  const seul = { programme: null, automatisations: [], planning, sources: { programme: { presente: false, active: false }, automatisations: { presente: false, active: false }, loggia: { presente: true, active: true } } };
  const pl = D.prochainRepas(seul, LUNDI(8));
  // r2 (19:00) est coupé : 07:30 le lendemain.
  assert.deepEqual([pl.heure, pl.source, pl.date.getTime()], ['07:30', 'loggia', new Date(2026, 9, 6, 7, 30).getTime()]);
  // Une automatisation active : le serveur RETIENT le planning de Loggia, l'écran ne l'annonce pas.
  const enPause = { ...seul, automatisations: [autos.matin_et_soir_pluriel], sources: { ...seul.sources, automatisations: { presente: true, active: true } } };
  assert.equal(D.prochainRepas(enPause, LUNDI(6)).source, 'automatisations');
  assert.ok(D.repasActifs(enPause).every(r => r.source !== 'loggia'));
  // Sans `sources` (réponse partielle) : un programme ACTIF, même illisible, retient aussi le planning de Loggia (05/10, contradicteur).
  const actifIllisible = { programme: { source: 'aqara', presente: true, active: true, lisible: false, repas: [] }, automatisations: [], planning };
  assert.deepEqual(D.repasActifs(actifIllisible), []);
});

/* ════════════ Les jours de réserve ════════════ */

test('jours de réserve : portions × poids d’une portion, sur les seuls repas à heure fixe des sources actives', () => {
  // La démo : une portion de 45 g, deux repas par jour, 760 g dans le bac → 8 jours.
  const S = { 'number.portion': { state: '45', attributes: { unit_of_measurement: 'g' } } };
  const mesure = D.mesurePortion(S, { entity_id: 'number.portion', unite: 'g' }, null);
  assert.deepEqual(mesure, { grammesParPortion: 45, portionsParAppui: 1 });
  assert.deepEqual(D.repasPourReserve(ETAT, mesure), [{ g: 45 }, { g: 45 }]);
  assert.equal(D.joursDeReserveDistributeur(760, ETAT, mesure), 8);
  // Un repas des jours ouvrés seulement compte au prorata de la semaine.
  const midi = D.repasPourReserve(ETAT, mesure, { allumee: () => true });
  assert.equal(midi.length, 3);
  assert.equal(midi[2].g, Math.round(45 * 5 / 7 * 10) / 10);
  // Aqara : 2 portions par appui, 8 g la portion → 16 g le repas.
  const S2 = { 'number.s': { state: '2', attributes: {} }, 'number.w': { state: '8', attributes: { unit_of_measurement: 'g' } } };
  const aqara = D.mesurePortion(S2, { entity_id: 'number.s', unite: null }, { entity_id: 'number.w', unite: 'g' });
  assert.deepEqual(aqara, { grammesParPortion: 8, portionsParAppui: 2 });
  assert.deepEqual(D.repasPourReserve(ETAT, aqara), [{ g: 16 }, { g: 16 }]);
  // Des portions CONNUES (l'automatisation les écrit) l'emportent sur l'appui.
  const connues = { ...ETAT, automatisations: [autos.script_appele_directement] };
  assert.deepEqual(D.repasPourReserve(connues, aqara), [{ g: 16 }]);
  const repetees = { ...ETAT, automatisations: [{ ...autos.matin_et_soir_pluriel, portions: 3 }] };
  assert.deepEqual(D.repasPourReserve(repetees, aqara), [{ g: 24 }, { g: 24 }]);
  // Heures non fixes : rien ne compte, on ne sait pas.
  const flou = { ...ETAT, automatisations: [autos.soleil_et_condition_ou, autos.periodique_sans_identifiant] };
  assert.deepEqual(D.repasPourReserve(flou, mesure), []);
  assert.equal(D.joursDeReserveDistributeur(760, flou, mesure), null);
  // Sans mesure de portion (une portion sans unité, sans poids) : on ne sait pas.
  assert.equal(D.mesurePortion({ 'number.s': { state: '2', attributes: {} } }, { entity_id: 'number.s', unite: null }, null), null);
  assert.deepEqual(D.repasPourReserve(ETAT, null), []);
  assert.equal(D.joursDeReserveDistributeur(760, ETAT, null), null);
});

test('le planning de Loggia : une pression = une ration, sauf commande qui ÉCRIT la quantité', () => {
  const mesure = { grammesParPortion: 10, portionsParAppui: 1 };
  const etat = { programme: null, automatisations: [], planning: { repas: [{ id: 'a', heure: '08:00', jours: [0, 1, 2, 3, 4, 5, 6], portions: 3, actif: true }] }, commande: { domaine: 'select', quantite: false } };
  assert.deepEqual(D.repasPourReserve(etat, mesure), [{ g: 10 }]);
  assert.deepEqual(D.repasPourReserve({ ...etat, commande: { domaine: 'number', quantite: true } }, mesure), [{ g: 30 }]);
});

test('le niveau du bac : en %, les grammes ne se devinent pas ; en g, rapporté au maximum de l’aide', () => {
  const S = {
    'input_number.pct': { state: '62', attributes: { unit_of_measurement: '%', max: 100 } },
    'input_number.g': { state: '760', attributes: { unit_of_measurement: 'g', max: 2000 } },
    'input_number.nu': { state: '750', attributes: {} },
    'sensor.kg': { state: '1.2', attributes: { unit_of_measurement: 'kg' } },
    'sensor.muet': { state: 'unavailable', attributes: { unit_of_measurement: 'g' } },
  };
  assert.deepEqual(D.niveauDuBac(S, 'input_number.pct'), { pct: 62, grammes: null });
  assert.deepEqual(D.niveauDuBac(S, 'input_number.g'), { pct: 38, grammes: 760 });
  assert.deepEqual(D.niveauDuBac(S, 'input_number.nu'), { pct: 50, grammes: 750 });
  assert.deepEqual(D.niveauDuBac(S, 'sensor.kg', 2000), { pct: 60, grammes: 1200 });
  assert.deepEqual(D.niveauDuBac(S, 'sensor.muet'), { pct: null, grammes: null });
  assert.deepEqual(D.niveauDuBac(S, null), { pct: null, grammes: null });
});

/* ════════════ L'historique ════════════ */

const ISO = (t) => new Date(t).toISOString();
const pt = (state, t, extra = {}) => ({ state: String(state), last_changed: ISO(t), ...extra });

test('historique : une hausse de compteur = un repas, la remise à zéro de minuit n’en est pas un', () => {
  const id = 'sensor.croquettes_du_jour';
  const brut = [[
    { entity_id: id, ...pt(0, LUNDI(0, 0)) }, pt(45, LUNDI(7, 30)), pt(90, LUNDI(19)),
    pt(0, new Date(2026, 9, 6, 0, 0).getTime()), pt(45, new Date(2026, 9, 6, 7, 30).getTime()),
    // Muet puis revenu à la même valeur : pas de repas.
    pt('unavailable', new Date(2026, 9, 6, 9).getTime()), pt(45, new Date(2026, 9, 6, 9, 5).getTime()),
    // Minuit manqué (le compteur retombe SANS passer par zéro) : un repas de sa nouvelle valeur.
    pt(45, new Date(2026, 9, 7, 7, 30).getTime()),
  ]];
  // Le dernier point est égal au précédent : ce n'est PAS le cas « retombé » ; on le rend explicite.
  brut[0][brut[0].length - 1] = pt(30, new Date(2026, 9, 7, 7, 30).getTime());
  const l = D.repasDepuisHistorique(brut, { compteurs: [id], states: { [id]: { state: '30', attributes: { unit_of_measurement: 'g' } } }, maintenant: new Date(2026, 9, 7, 12).getTime() });
  assert.deepEqual(l.map(x => [new Date(x.t).getDate(), new Date(x.t).getHours(), x.grammes]), [[7, 7, 30], [6, 7, 45], [5, 19, 45], [5, 7, 45]]);
  assert.deepEqual(l[0].quantites, [{ valeur: 30, unite: 'g' }]);
});

test('historique : compteur, automatisation et journal de Loggia disent UN repas ; sa source est la plus précise', () => {
  const c = 'sensor.distributeur_portions_per_day', w = 'sensor.distributeur_weight_per_day', src = 'sensor.distributeur_feeding_source', a = 'automation.croquettes_matin_et_soir';
  const brut = [
    [{ entity_id: c, ...pt(0, LUNDI(0)) }, pt(1, LUNDI(7, 30) + 20000), pt(2, LUNDI(7, 30) + 40000), pt(4, LUNDI(12, 5))],
    [{ entity_id: w, ...pt(0, LUNDI(0)) }, pt(16, LUNDI(7, 30) + 41000), pt(32, LUNDI(12, 5))],
    [{ entity_id: src, ...pt('manual', LUNDI(0)) }, pt('remote', LUNDI(7, 30) + 21000)],
    [{ entity_id: a, ...pt('on', LUNDI(0), { attributes: { last_triggered: ISO(LUNDI(0) - 86400000) } }) },
      pt('on', LUNDI(7, 30), { attributes: { last_triggered: ISO(LUNDI(7, 30)) } })],
  ];
  const states = { [w]: { state: '32', attributes: { unit_of_measurement: 'g' } }, [c]: { state: '4', attributes: {} } };
  const l = D.repasDepuisHistorique(brut, {
    compteurs: [c, w], evenements: [src], automatisations: [a], states, depuis: LUNDI(0), maintenant: LUNDI(13),
    journal: [{ ts: LUNDI(12, 5) / 1000, module: 'distributeurs', regle: 'repas', quoi: 'distribuer' }, { ts: LUNDI(9) / 1000, module: 'distributeurs', quoi: 'retenu' }],
  });
  assert.equal(l.length, 2, 'deux repas, pas cinq lignes');
  assert.equal(l[0].source, 'loggia');
  assert.equal(l[0].grammes, 16);
  assert.equal(l[1].source, 'automatisation', 'l’automatisation passe avant « à distance »');
  assert.deepEqual(l[1].quantites.sort((x, y) => String(x.unite).localeCompare(String(y.unite))), [{ valeur: 16, unite: 'g' }, { valeur: 2, unite: null }]);
  assert.equal(l[1].t, LUNDI(7, 30));
  // Le déclenchement d'avant la période ne compte pas ; un « retenu » n'est pas un repas.
  assert.ok(l.every(x => x.t >= LUNDI(0)));
  // Un « distribuer » où RIEN n'est parti (commande refusée par HA, `n: 0`) n'est pas un repas (05/10, contradicteur).
  const refuse = D.repasDepuisHistorique([], {
    journal: [{ ts: LUNDI(12, 5) / 1000, module: 'distributeurs', regle: 'repas', quoi: 'distribuer', n: 0, detail: 'commande refusee par Home Assistant' },
      { ts: LUNDI(19) / 1000, module: 'distributeurs', regle: 'repas', quoi: 'distribuer', n: 1 }],
    maintenant: LUNDI(20),
  });
  assert.deepEqual(refuse.map(x => [x.t, x.source]), [[LUNDI(19), 'loggia']]);
  // Sans automatisation ni journal : ce que l'appareil dit de la source.
  const seul = D.repasDepuisHistorique(brut.slice(0, 3), { compteurs: [c, w], evenements: [src], states, maintenant: LUNDI(13) });
  assert.deepEqual(seul.map(x => x.source), ['distance', 'distance']);
});

test('historique : le capteur « dernier repas » et les entités event, à LEUR heure ; rien ne vaut « vide » sans lecture', () => {
  const d = 'sensor.granary_last_feed_time', ev = 'event.granary_feeding';
  const brut = [
    [{ entity_id: d, ...pt(ISO(LUNDI(7)), LUNDI(7, 0) + 4000) }, pt(ISO(LUNDI(19, 30)), LUNDI(19, 30) + 5000), pt('unavailable', LUNDI(20)), pt(ISO(LUNDI(19, 30)), LUNDI(20, 5))],
    [{ entity_id: ev, ...pt(ISO(LUNDI(10)), LUNDI(10)) }],
  ];
  const l = D.repasDepuisHistorique(brut, { dernier: d, evenements: [ev], maintenant: LUNDI(21) });
  assert.deepEqual(l.map(x => x.t), [LUNDI(19, 30), LUNDI(10), LUNDI(7)]);
  assert.deepEqual(D.repasDepuisHistorique(null, { dernier: d }), []);
  assert.deepEqual(D.repasDepuisHistorique('erreur', { dernier: d }), []);
});

/* ASSERTION MODIFIÉE (étape 2 IoT, 19/10 ; I25) : la semaine du calendrier et ses barres partent — l'Historique compte les 7 × 24 h
 * qui finissent maintenant (`septJoursRepas`, comme le robot) ; les grammes, toujours, seulement s'ils sont comptés. */
test('les sept jours des repas : 7 × 24 h glissantes, les grammes seulement s’ils sont comptés', () => {
  const lignes = [{ t: LUNDI(7), grammes: 16 }, { t: LUNDI(19), grammes: 16 }, { t: new Date(2026, 9, 7, 7).getTime(), grammes: null }];
  const r = D.septJoursRepas(lignes, { maintenant: new Date(2026, 9, 7, 12).getTime() });
  assert.equal(r.n, 3);
  assert.equal(r.grammes, 32);
  // Le lundi suivant, à midi : le repas du lundi 07:00 est sorti de la fenêtre, celui de 19:00 y est encore.
  assert.equal(D.septJoursRepas(lignes, { maintenant: LUNDI(12) + 7 * 86400000 }).n, 2);
  assert.equal(D.septJoursRepas([{ t: LUNDI(7), grammes: null }], { maintenant: LUNDI(12) }).grammes, null);
});

test('le dernier repas et le compte du jour', () => {
  const lecture = { historique: { dernier: 'sensor.last', compteurs: ['sensor.weight_per_day', 'sensor.times_dispensed'] } };
  const S = {
    'sensor.last': { state: ISO(LUNDI(7)) },
    'sensor.weight_per_day': { state: '32', last_changed: ISO(LUNDI(12)), attributes: { unit_of_measurement: 'g' } },
    'sensor.times_dispensed': { state: '2', last_changed: ISO(LUNDI(12)), attributes: {} },
  };
  assert.deepEqual(D.dernierRepas(lecture, S, null, LUNDI(13)), { t: LUNDI(7), source: 'capteur' });
  // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point G) : le compte du jour se lit à un instant — un compteur qui n'a pas bougé
  // AUJOURD'HUI ne compte rien : à 00:20 le lendemain, les 32 g de lundi ne sont pas ceux de mardi (« 0 repas · 24 g » sur la tuile).
  assert.deepEqual(D.compteDuJour(lecture, S, LUNDI(13)), { repas: 2, portions: null, grammes: 32 }, 'le même jour, il compte');
  assert.deepEqual(D.compteDuJour(lecture, S, LUNDI(24) + 20 * 60000), { repas: null, portions: null, grammes: null }, 'le lendemain à 00:20, rien');
  // PetKit (05/10, contradicteur) : `total_dispensed` est le total du JOUR, `manual_dispensed` et
  // `planned_dispensed` ses deux parts. La première par ordre alphabétique (manual) disait 20 g.
  const pk = {
    soeurs: [{ id: 'sensor.d4_manual', cle: 'manual_dispensed' }, { id: 'sensor.d4_planned', cle: 'planned_dispensed' },
      { id: 'sensor.d4_total', cle: 'total_dispensed' }, { id: 'sensor.d4_fois', cle: 'times_dispensed' }],
    historique: { dernier: null, compteurs: ['sensor.d4_fois', 'sensor.d4_manual', 'sensor.d4_planned', 'sensor.d4_total'] },
  };
  const SP = {
    'sensor.d4_manual': { state: '20', attributes: { unit_of_measurement: 'g' } },
    'sensor.d4_planned': { state: '40', attributes: { unit_of_measurement: 'g' } },
    'sensor.d4_total': { state: '60', attributes: { unit_of_measurement: 'g' } },
    'sensor.d4_fois': { state: '3', attributes: {} },
  };
  assert.deepEqual(D.compteDuJour(pk, SP), { repas: 3, portions: null, grammes: 60 });
  const sansCapteur = { historique: { dernier: null, compteurs: ['sensor.weight_per_day'] } };
  assert.deepEqual(D.dernierRepas(sansCapteur, S, null, LUNDI(13)), { t: LUNDI(12), source: 'compteur' });
  // Le compteur d'hier (remis à zéro, ou figé) ne dit rien d'aujourd'hui : l'automatisation RECONNUE prend le relais, pas un indice.
  const vieux = { ...S, 'sensor.weight_per_day': { state: '0', last_changed: ISO(LUNDI(0)), attributes: { unit_of_measurement: 'g' } } };
  const etat = { automatisations: [{ ...autos.matin_et_soir_pluriel, dernier: ISO(LUNDI(7, 30)) }, { ...autos.indice_ancienne_liste_par_mqtt, dernier: ISO(LUNDI(9)) }] };
  assert.deepEqual(D.dernierRepas(sansCapteur, vieux, etat, LUNDI(13)), { t: LUNDI(7, 30), source: 'automatisation' });
  assert.equal(D.dernierRepas(sansCapteur, vieux, null, LUNDI(13)), null);
});

/* ════════════ Le Planning : états vides et blocs ════════════ */

test('planning : les trois états vides', () => {
  assert.equal(D.planningAffiche(null).vide, 'indisponible', 'serveur muet : HA pas redémarré');
  const rien = { programme: { source: null, connu: false, presente: false }, automatisations: [], planning: { repas: [] }, peutPlanifier: true, commande: { domaine: 'select', quantite: false } };
  const a = D.planningAffiche(rien);
  assert.equal(a.vide, 'aucun');
  assert.equal(a.peutAjouter, true);
  assert.equal(a.miseEnGarde, true, 'programme inconnu : la mise en garde fixe');
  // Un compte ordinaire lit « Aucun repas programmé. » seul (ADR 0144).
  assert.equal(D.planningAffiche(rien, { ordinaire: true }).peutAjouter, false);
  assert.equal(D.planningAffiche({ ...rien, commande: null, peutPlanifier: false }).vide, 'sans_commande');
});

test('planning : les blocs, « deux sources » pour un programme LISIBLE actif seulement, « En pause »', () => {
  const ex = D.planningAffiche(ETAT);
  assert.equal(ex.vide, null);
  assert.deepEqual(ex.blocs, { programme: true, automatisations: true, loggia: false }, 'Aqara en mode manuel : le mode se montre');
  assert.equal(ex.deuxSources, false);
  assert.equal(ex.peutAjouter, false);
  const lisible = F.cas.find(c => c.id === 'petlibro').attendu.programme;
  assert.equal(D.planningAffiche({ ...ETAT, programme: lisible }).deuxSources, true);
  // Illisible : présent, non actif — pas d'avertissement, pas d'ajout.
  const illisible = F.cas.find(c => c.id === 'aqara_z2m_sans_liste').attendu.programme;
  const il = D.planningAffiche({ ...ETAT, programme: illisible });
  assert.equal(il.deuxSources, false);
  assert.equal(il.blocs.programme, true);
  // Toutes les automatisations coupées : plus de deux sources.
  assert.equal(D.planningAffiche({ ...ETAT, programme: lisible }, { allumee: () => false }).deuxSources, false);
  // Un planning de Loggia sous une automatisation active : en pause.
  const pause = D.planningAffiche({ ...ETAT, planning: F.contrat.loggia_distributeurs });
  assert.equal(pause.blocs.loggia, true);
  assert.equal(pause.pause, true);
  assert.equal(D.planningAffiche({ ...ETAT, automatisations: [], sources: {}, planning: F.contrat.loggia_distributeurs }).pause, false);
  // Le serveur SEUL dit qu'une source supérieure distribue (05/10, relecture « tests ») : c'est
  // le compte dont la lecture des automatisations est refusée — `automatisations: []`, mais
  // `sources.automatisations.active`. Le serveur retient le planning de Loggia ; l'écran dit « En pause ».
  const refusees = { ...ETAT, automatisations: [], planning: F.contrat.loggia_distributeurs };
  assert.equal(D.planningAffiche({ ...refusees, sources: { ...ETAT.sources, automatisations: { presente: true, active: true } } }).pause, true, 'automatisations actives côté serveur');
  assert.equal(D.planningAffiche({ ...refusees, programme: null, sources: { programme: { presente: true, active: true }, automatisations: { presente: false, active: false } } }).pause, true, 'programme actif côté serveur');
  assert.equal(D.planningAffiche({ ...refusees, programme: null, sources: { programme: { presente: true, active: false }, automatisations: { presente: true, active: false } } }).pause, false, 'présentes mais inactives : pas de pause');
  // L'ancienne liste ne se rappelle que lorsqu'on propose le planning de Loggia.
  const vierge = { programme: null, automatisations: [], planning: { repas: [] }, peutPlanifier: true, commande: { domaine: 'button' }, ancienne_liste: { n: 2, relies: 1, non_relies: [{ heure: '12:00', label: 'Midi' }] } };
  assert.equal(D.planningAffiche(vierge).ancienneListe, true);
  assert.equal(D.planningAffiche(ETAT).ancienneListe, false);
  // …et seulement s'il reste un repas relié à RIEN (05/10, relecture « données ») : la liste de
  // l'utilisateur, sept repas tous reliés à des automatisations, distribuait. Renommées ou
  // supprimées dans HA, le serveur ne les voit plus — « ne distribuait rien par elle-même »
  // serait faux, et le planning de Loggia proposé par-dessus risquerait une double ration.
  assert.equal(D.planningAffiche({ ...vierge, ancienne_liste: { n: 7, relies: 7, non_relies: [] } }).ancienneListe, false);
  assert.equal(D.planningAffiche({ ...vierge, ancienne_liste: { n: 2, relies: 0, non_relies: [] } }).ancienneListe, true);
  assert.equal(D.planningAffiche({ ...vierge, ancienne_liste: { n: 0, relies: 0, non_relies: [] } }).ancienneListe, false);
  assert.equal(D.planningAffiche({ ...vierge, ancienne_liste: { n: 3 } }).ancienneListe, true, 'sans compte des reliés : aucun relié');
});

/* ════════════ L'alerte de la carte (05/10, relecture « écran ») ════════════ */

test('l’alerte de la carte : la première anomalie ACTIVE, sous le mot de la fiche', () => {
  // Un Petlibro n'a pas de réservoir en % : sans ce mot, le bac presque vide ne se voyait que dans la fiche.
  const lecture = (id) => { const c = F.cas.find(x => x.id === id); const m = maison(c); return D.lireDistributeur(m.index, m.states, c.config); };
  assert.equal(D.alerteDistributeur(lecture('petlibro')), null, 'des anomalies au repos ne disent rien');
  /* ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point G) : l'alerte dit le TYPE et l'entité ; son mot est celui de la phrase de la
   * carte (`phraseDistributeur` : « Bac presque vide », « Distribution bloquée », « Problème signalé »), et la popup dit les siens — le
   * nom propre de l'entité pour « autre » (tests/fiche_distributeur_accueil.test.mjs). Le `mot` que personne ne lisait est parti. */
  assert.deepEqual(D.alerteDistributeur(lecture('petkit_diagnostic')), { type: 'bas', entity_id: 'binary_sensor.d4_food_level' });
  assert.deepEqual(D.alerteDistributeur(lecture('tuya_local_vide')), { type: 'bloque', entity_id: 'binary_sensor.catit_food_blockage' });
  assert.equal(D.phraseDistributeur({ alerte: 'bas' }).texte, 'Bac presque vide');
  // Le Petlibro de la démo, bac presque vide : le même mot que la fiche.
  const pl = F.cas.find(x => x.id === 'petlibro');
  const m = maison(pl);
  m.states['binary_sensor.granary_food_low'].state = 'on';
  assert.equal(D.alerteDistributeur(D.lireDistributeur(m.index, m.states, pl.config)).type, 'bas');
  // Un autre problème : le type « autre », la carte dit « Problème signalé ».
  const autre = { anomalies: [{ entity_id: 'binary_sensor.x_error', type: 'autre', actif: true }] };
  assert.deepEqual(D.alerteDistributeur(autre), { type: 'autre', entity_id: 'binary_sensor.x_error' });
  assert.equal(D.phraseDistributeur({ alerte: 'autre' }).texte, 'Problème signalé');
  for (const v of [null, undefined, {}, { anomalies: 'x' }]) assert.equal(D.alerteDistributeur(v), null, JSON.stringify(v));
});

/* ════════════ Les scripts candidats (05/10, relecture « données ») ════════════ */

test('les scripts candidats : PROPOSÉS par leur nom dans Paramètres, jamais une commande', () => {
  // Avant le 05/10, un script se devinait à son nom et commandait ; depuis, seul le script
  // désigné commande — et celui qui ne l'avait jamais désigné perdait « Distribuer » sans un
  // mot. Le nom ne sert plus qu'à PROPOSER, dans la liste du champ « Script de distribution ».
  const S = {
    'script.distribuer': { state: 'off', attributes: { friendly_name: 'Distribuer' } },
    'script.x1': { state: 'off', attributes: { friendly_name: 'Remplir la gamelle' } },
    'script.gamelle_du_soir': { state: 'off', attributes: {} },
    'script.feed_cat': { state: 'off', attributes: {} },
    'script.lumieres': { state: 'off', attributes: { friendly_name: 'Lumières du salon' } },
    'automation.croquettes': { state: 'on', attributes: {} },
    'input_boolean.distribuer': { state: 'off', attributes: {} },
  };
  assert.deepEqual(D.scriptsCandidats(S), ['script.distribuer', 'script.feed_cat', 'script.gamelle_du_soir', 'script.x1']);
  assert.deepEqual(D.scriptsCandidats({ 'script.y': { state: 'off', attributes: { friendly_name: 'Croquettes à volonté' } } }), ['script.y'], 'les accents ne cachent rien');
  for (const v of [null, undefined, {}, 'x']) assert.deepEqual(D.scriptsCandidats(v), [], JSON.stringify(v));
  // Un candidat ne commande pas : la carte reste sans « Distribuer » tant qu'il n'est pas désigné.
  assert.equal(D.commandeDistribuer([], S, {}), null);
});

/* ════════════ Les libellés ════════════ */

test('les libellés d’heure : heures fixes, soleil, périodique, autrement, sans heure fixe', () => {
  assert.equal(D.libelleHeures(autos.matin_et_soir_pluriel), '07:30 · 19:00');
  assert.equal(D.libelleHeures(autos.soleil_et_condition_ou), 'Lever du soleil −30 min');
  assert.equal(D.libelleHeures(autos.periodique_sans_identifiant), 'Toutes les 8 h');
  assert.equal(D.libelleHeures(autos.heure_d_un_helper_vide), 'Déclenchée autrement');
  assert.equal(D.libelleHeures({ heures: [], declencheurs: [] }), 'Sans heure fixe');
  assert.equal(D.libelleDeclencheur({ type: 'soleil', evenement: 'sunset', decalage: 0 }), 'Coucher du soleil');
  assert.equal(D.libelleDeclencheur({ type: 'soleil', evenement: 'sunset', decalage: 75 }), 'Coucher du soleil +1 h 15');
  assert.equal(D.libelleJours(null), 'Tous les jours');
  assert.equal(D.libelleJours([0, 1, 2, 3, 4]), 'En semaine');
  assert.equal(D.libelleJours([5, 6]), 'Le week-end');
});

test('la source d’un repas d’après l’appareil', () => {
  assert.equal(D.sourceDeValeur('schedule'), 'programme');
  assert.equal(D.sourceDeValeur('manual'), 'manuel');
  assert.equal(D.sourceDeValeur('remote'), 'distance');
  assert.equal(D.sourceDeValeur('unknown'), null);
});

/* ════════════ Les réglages ════════════ */

test('les réglages : ceux de l’appareil, jamais la commande (l’écrire DISTRIBUE)', () => {
  const cas = F.cas.find(c => c.id === 'aqara_z2m_manuel');
  const { index, states } = maison(cas);
  const l = D.lireDistributeur(index, states, cas.config);
  // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point F) : les réglages, que seule la roue de la popup lit, se calculent sur les sœurs.
  const reglages = D.reglagesDistributeur(l.soeurs, l.commande);
  const tous = [...reglages.principaux, ...reglages.autres];
  const ids = tous.map(r => r.id);
  assert.ok(!ids.includes('select.distributeur_cuisine_feed'), 'la commande n’est pas un réglage');
  for (const id of ['select.distributeur_cuisine_mode', 'number.distributeur_cuisine_serving_size', 'number.distributeur_cuisine_portion_weight', 'switch.distributeur_cuisine_child_lock', 'light.distributeur_cuisine_led']) {
    assert.ok(reglages.principaux.some(r => r.id === id), id);
  }
  // Le voyant est une lumière : le service à appeler est le sien.
  assert.equal(tous.find(r => r.id === 'light.distributeur_cuisine_led').domaine, 'light');
  // Un number qui DISTRIBUE (Tuya) n'est pas un réglage non plus.
  const tuya = F.cas.find(c => c.id === 'tuya_cwwsq');
  const mt = maison(tuya);
  const lt = D.lireDistributeur(mt.index, mt.states, tuya.config);
  const rt = D.reglagesDistributeur(lt.soeurs, lt.commande);
  assert.ok(![...rt.principaux, ...rt.autres].some(r => r.id === 'number.distributeur_tuya_feed'));
  assert.ok(rt.principaux.some(r => r.id === 'switch.distributeur_tuya_slow_feed'));
});

test('les sœurs : une entité masquée en reste une, une désactivée non ; sans appareil, les désignées seules', () => {
  const tl = F.cas.find(c => c.id === 'tuya_local_vide');
  const m = maison(tl);
  assert.ok(D.soeursDistributeur(m.index, m.states, 'dev_tuya_local').some(s => s.id === 'text.catit_meal_plan'));
  const pk = F.cas.find(c => c.id === 'petkit_sans_diagnostic');
  const mp = maison(pk);
  assert.ok(!D.soeursDistributeur(mp.index, mp.states, 'dev_petkit_d4h').some(s => s.id === 'sensor.d4h_raw_distribution_data'));
  const sc = F.cas.find(c => c.id === 'script_seul');
  const ms = maison(sc);
  // Le script désigné en est une aussi, comme `designees` du Python (05/10, contradicteur).
  assert.deepEqual(D.soeursDistributeur(ms.index, ms.states, null, sc.config).map(s => s.id), ['input_number.croquettes_reservoir', 'script.remplir_la_gamelle']);
});

/* ════════════ La parité AU-DELÀ de la fixture (05/10, contradicteur) ════════════ */

// La grande fixture fige 31 cas ; entre eux, le JS avait dérivé du Python sur
// dix points que rien n'épinglait. Ces cas étaient écrits ICI, « relevés » sur
// le Python — qui ne les rejouait pas : le select aux options en minuscules y
// disait le contraire de test_distributeur_appareil.py, si bien que le serveur
// reconnaissait la commande et l'écran n'avait pas de « Distribuer » (05/10,
// relecture « tests »). Ils vivent maintenant dans une fixture PARTAGÉE, lue
// aussi par tests/python/test_distributeur_parite.py : si l'un bouge, l'autre
// rougit.
const PARITE = JSON.parse(readFileSync(new URL('./fixtures/distributeurs_parite.json', import.meta.url), 'utf8'));

/** Ce que l'écran lit d'un cas, dans le vocabulaire d'`attendu` (le même que le Python). */
function luParite(cas) {
  const { index, states } = maison(cas);
  const l = D.lireDistributeur(index, states, cas.config);
  const c = l.commande;
  // ASSERTION MODIFIÉE (passe bis de l'étape 2, 19/10 ; point F) : les notes, les cibles et les consommables sont des briques de distributeurfiche.js.
  // ASSERTION MODIFIÉE (passe bis 2 de l'étape 2, 19/10) : le POIDS d'une portion se lit aussi (`poids_portion_id`, comme `_lu` du
  // Python) — le cas `poids_designe_hors_des_soeurs` ne figeait pas le poids qu'il décrit, et restait vert sur le code d'avant la règle D1.
  return {
    appareil: l.appareil, notes: D.notesAppareil(index, cas.config, l.appareil), commande_id: c ? c.entity_id : null, donnees: c ? c.donnees : null,
    portion_id: l.portion ? l.portion.entity_id : null, poids_portion_id: l.poidsPortion ? l.poidsPortion.entity_id : null,
    cibles_de_commande: D.ciblesDeCommande({ commande: c, portion: l.portion, mode: D.selectMode(l.soeurs), cfg: cas.config }), consommables: D.consommablesDistributeur(l.soeurs),
    une_portion: c && c.quantite ? D.valeurPortions(c, 1) : null, envoi_2_portions: D.envoiDistribuer(c, 2),
  };
}

test('parité avec le Python au-delà de la fixture : START sans casse, portion d’un autre appareil, clés, blancs, pas nul', () => {
  assert.ok(PARITE.cas.length >= 11, 'la fixture de parité a perdu des cas');
  for (const cas of PARITE.cas) {
    const lu = luParite(cas);
    for (const [cle, attendu] of Object.entries(cas.attendu)) {
      assert.ok(cle in lu, `[${cas.id}] clé d’attendu inconnue : ${cle}`);
      assert.deepEqual(lu[cle], attendu, `[${cas.id}] ${cle}`);
    }
  }
  // L'option envoyée est celle que l'ENTITÉ écrit : select_option refuse une option qu'elle ne propose pas.
  const bas = PARITE.cas.find(c => c.id === 'start_en_minuscules');
  assert.deepEqual(luParite(bas).envoi_2_portions.data, { entity_id: 'select.a_feed', option: 'start' });
});

/* ════════════ Les masses et l'erreur sans classe (passe bis 2 de l'étape 2, 19/10 ; relecture de contrôle) ════════════ */

/* TEST AJOUTÉ : seules g et kg comptaient comme des masses — un « Poids d'une portion » désigné en oz, en lb ou en mg devenait la TAILLE
 * de la ration, et le pas à pas de « Servir maintenant » aurait écrit sur un poids (l'étalonnage de l'appareil). Toute unité de masse
 * de Home Assistant (`UNITES_MASSE` : g, kg, mg, µg et son « ug », oz, lb, st) est un poids, des deux côtés (la fixture fige la table, le
 * cas `poids_designe_en_onces`), et se convertit en grammes partout où le code convertit (`enGrammes`) : la mesure de la carte
 * (« Distribuer 12 g », « ≈ 8 j ») et le niveau du bac. */
test('passe bis 2 : toute unité de masse est un poids, jamais une taille — et se convertit en grammes', () => {
  assert.deepEqual(D.TABLES.UNITES_MASSE, ['g', 'kg', 'mg', 'µg', 'ug', 'oz', 'lb', 'st']);
  for (const u of D.TABLES.UNITES_MASSE) assert.ok(D.estMasse(u), u + ' n’est pas une masse');
  for (const u of [null, undefined, '', 'portion', 'portions', 'G', 'KG', 'ml', 'l', 'd', '%']) assert.ok(!D.estMasse(u), String(u) + ' passe pour une masse');
  const arrondi = (x) => Math.round(x * 1e6) / 1e6;
  // Le poids d'une portion, dans chaque unité : la mesure de la carte, convertie — 2 portions par appui, de la taille de ration.
  const S = { 'number.p': { state: '1' }, 'number.s': { state: '2', attributes: {} } };
  const mesure = (u) => D.mesurePortion(S, { entity_id: 'number.s', unite: 'portion' }, { entity_id: 'number.p', unite: u });
  assert.deepEqual(D.TABLES.UNITES_MASSE.map(u => [u, arrondi(mesure(u).grammesParPortion), mesure(u).portionsParAppui]),
    [['g', 1, 2], ['kg', 1000, 2], ['mg', 0.001, 2], ['µg', 0.000001, 2], ['ug', 0.000001, 2], ['oz', 28.349523, 2], ['lb', 453.59237, 2], ['st', 6350.29318, 2]]);
  assert.equal(D.enGrammes(1, 'oz'), 28.349523125, '1 oz = 1/16 lb, 28,349523125 g exactement');
  assert.deepEqual([D.enGrammes(3, null), D.enGrammes(3, ''), D.enGrammes(3, 'portion'), D.enGrammes(null, 'g')], [3, 3, null, null], 'sans unité : des grammes ; une unité qui n’est pas une masse : rien');
  // Une taille de ration réglée dans une masse : un appui = cette quantité, convertie.
  const taille = D.mesurePortion({ 'number.t': { state: '0.5' } }, { entity_id: 'number.t', unite: 'oz' }, null);
  assert.deepEqual([arrondi(taille.grammesParPortion), taille.portionsParAppui], [14.174762, 1], '0,5 oz');
  // Le bac en onces : rapporté à son maximum, et ses grammes convertis.
  assert.deepEqual(D.niveauDuBac({ 'input_number.bac': { state: '16', attributes: { unit_of_measurement: 'oz', max: 64 } } }, 'input_number.bac'), { pct: 25, grammes: 453.59237 });
  // Désigné en onces, le number est le POIDS : la taille reste la sœur, et le pas à pas n'écrit jamais sur lui.
  const cas = F.cas.find(c => c.id === 'poids_designe_en_onces');
  assert.ok(cas, 'la fixture a perdu le cas des onces');
  const { index, states } = maison(cas);
  const l = D.lireDistributeur(index, states, cas.config);
  assert.deepEqual([l.portion.entity_id, l.portion.unite, l.poidsPortion], ['number.cabanon_portions', null, { entity_id: 'number.cabanon_poids_portion', unite: 'oz' }]);
  const m = D.mesurePortion(states, l.portion, l.poidsPortion);
  assert.deepEqual([arrondi(m.grammesParPortion), m.portionsParAppui], [5.669905, 3], '3 portions de 0,2 oz');
});

/* TEST AJOUTÉ : le suffixe `_error` ne vaut anomalie que SANS classe — c'est ce que la fixture et le commentaire disaient, pas le code :
 * un `binary_sensor.*_link_error` de classe connectivity à « on » (= connecté) disait « Problème signalé ». Une classe qui n'est pas
 * « problem » n'est jamais une anomalie (le cas `erreur_de_classe_connectivite` de la fixture, des deux côtés). */
test('passe bis 2 : le suffixe `_error` ne vaut anomalie que SANS classe — un `_link_error` de classe connectivity à « on » dit « connecté »', () => {
  const soeur = (id, classe, etat = 'on') => ({ id, domaine: 'binary_sensor', objet: id.slice(id.indexOf('.') + 1), cle: null, classe, etat, attributs: {} });
  assert.deepEqual(D.anomaliesDistributeur([soeur('binary_sensor.a_error', null)]), [{ entity_id: 'binary_sensor.a_error', type: 'autre', actif: true }], 'témoin : sans classe, l’erreur de Zigbee2MQTT');
  assert.deepEqual(D.anomaliesDistributeur([soeur('binary_sensor.a_link_error', 'connectivity'), soeur('binary_sensor.a_motor_error', 'running')]), [], 'une classe qui n’est pas « problem » : pas une anomalie');
  assert.deepEqual(D.anomaliesDistributeur([soeur('binary_sensor.a_error', 'problem', 'off')]), [{ entity_id: 'binary_sensor.a_error', type: 'autre', actif: false }], 'témoin : la classe problem');
  // La clé passe avant toute classe, comme avant.
  assert.deepEqual(D.anomaliesDistributeur([{ ...soeur('binary_sensor.a_x', 'connectivity', 'off'), cle: 'food_low' }]), [{ entity_id: 'binary_sensor.a_x', type: 'bas', actif: false }]);
});

/* ════════════ L'ancienne liste (migration) ════════════ */

test('l’ancienne liste se lit TOUTE, reliée ou non, abîmée comprise — elle ne se perd pas en silence', () => {
  const feeder = F.contrat.loggia_feeder;
  setLoggiaState({ cfg: { loggia_feeder: feeder }, ent: {}, server: true });
  assert.deepEqual(L.croqAncienneListe(), [
    { heure: '07:30', label: 'Matin', auto: 'automation.croquettes_matin_et_soir', relie: true },
    { heure: '12:00', label: 'Midi', auto: 'input_boolean.repas_matin', relie: false },
  ]);
  setLoggiaState({ cfg: { loggia_feeder: { meals: [null, 42, ['x'], { time: 'midi', label: 3, auto: 7 }, { time: '19:00' }] } }, ent: {}, server: true });
  assert.deepEqual(L.croqAncienneListe(), [
    { heure: '', label: '3', auto: null, relie: false },
    { heure: '19:00', label: '', auto: null, relie: false },
  ]);
  for (const abime of [null, undefined, 'abc', 42, {}, { meals: 'x' }]) {
    setLoggiaState({ cfg: { loggia_feeder: abime }, ent: {}, server: true });
    assert.deepEqual(L.croqAncienneListe(), [], JSON.stringify(abime));
  }
  // Ce lecteur est le SEUL qui reste de l'ancienne liste (05/10) : croqMeals et croqRepasEdition,
  // lus par la fiche et par Paramètres, sont partis avec eux — la liste ne se relit plus que pour migrer.
  assert.equal(L.croqMeals, undefined, 'croqMeals est revenu : l’ancienne liste redeviendrait un planning');
  assert.equal(L.croqRepasEdition, undefined, 'croqRepasEdition est revenu : l’ancienne liste se modifierait encore');
});

/* ════════════ Sans React, sans entité en dur ════════════ */

test('distributeur.js reste pur : ni React, ni hass, ni identifiant d’entité en dur', () => {
  // ASSERTION MODIFIÉE (chantier IoT, tâche 1, 18/10 ; § 12) : la même règle pour `distributeurfiche.js`, sa moitié chargée à la demande.
  for (const f of ['distributeur.js', 'distributeurfiche.js']) {
    const src = readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
    assert.ok(!/from 'react'|callService|callWS|hass\./.test(src), f);
    assert.ok(!/['"](sensor|select|number|button|binary_sensor|input_number|automation|switch)\.[a-z0-9_]+['"]/.test(src), f + ' : un entity_id en dur');
  }
});
