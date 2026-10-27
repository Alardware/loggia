/* TEST AJOUTÉ (étape 3 IoT, 25/10 ; sa maquette « Cartes IoT », 1a et 1f ; I11, I27, I30, I31, § 6 `phraseVanne`) — ce que la carte et
 * la popup d'une vanne CALCULENT, à sec (`src/eau.js`, chargé à la demande avec elles).
 *
 * L'heure est celle de la maquette, lundi 19/10/2026, 18:20. Ce qui est garanti :
 *  - I31 : quelle vanne est une vanne d'eau — une `valve` de classe `water`, ou l'entité désignée dans « Quelle vanne » (une prise
 *    comprise) ; une vanne de gaz est une vanne de gaz, toute autre une vanne simple ;
 *  - les détecteurs de fuite sont ceux du serveur : un `moisture` d'appareil, ni un modèle, ni un groupe, ni une plante ;
 *  - § 6 : la phrase, la première ligne qui s'applique, son encre ; « aucune fuite » seulement s'il y a des détecteurs ;
 *  - I8 : la plaque cyan ouverte, rouge (et un lavis) fermée sur fuite, grise sinon ;
 *  - I11, I27 : « Fermer l'eau » ne demande jamais ; « Rouvrir l'eau » demande après une fuite, et « Rouvrir quand même ? » tant
 *    qu'un détecteur voit de l'eau ; « Ouvrir le gaz ? » ;
 *  - le journal du jour : chaque ligne, sa note et sa pastille ; une personne se nomme par la règle commune. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const E = await import('../src/eau.js');

const T = new Date(2026, 9, 19, 18, 20).getTime();
const a = (h, m, j = 0) => new Date(2026, 9, 19 + j, h, m).getTime();
const iso = (t) => new Date(t).toISOString();
const st = (id, state, attributes = {}, depuis = a(14, 2)) => ({ entity_id: id, state, last_changed: iso(depuis), attributes });

const VANNE = 'valve.arrivee_eau', EVIER = 'binary_sensor.fuite_sous_evier', LINGE = 'binary_sensor.fuite_lave_linge';
const maison = (retouche = null) => {
  const S = {
    [VANNE]: st(VANNE, 'open', { device_class: 'water', friendly_name: 'Arrivée d’eau' }),
    [EVIER]: st(EVIER, 'off', { device_class: 'moisture', friendly_name: 'Sous l’évier' }, a(14, 40)),
    [LINGE]: st(LINGE, 'off', { device_class: 'moisture', friendly_name: 'Lave-linge' }),
    'binary_sensor.ficus_soif': st('binary_sensor.ficus_soif', 'on', { device_class: 'moisture' }),
    'binary_sensor.besoin_eau_modele': st('binary_sensor.besoin_eau_modele', 'on', { device_class: 'moisture' }),
    'valve.gaz': st('valve.gaz', 'closed', { device_class: 'gas', friendly_name: 'Gaz' }),
    'valve.arrosage': st('valve.arrosage', 'closed', { friendly_name: 'Arrosage' }),
    'switch.prise_arrivee': st('switch.prise_arrivee', 'on', { friendly_name: 'Prise de l’arrivée' }),
  };
  if (retouche) retouche(S);
  return S;
};
const CTX = { plateforme: (id) => (id === 'binary_sensor.besoin_eau_modele' ? 'template' : 'mqtt'), plantes: ['binary_sensor.ficus'] };
const ETAT = (cause = null, depuis = a(14, 2), detecteur = EVIER) => ({
  maintenant: T / 1000,
  vannes: { [VANNE]: { ferme: !!cause, cause, detecteur: cause === 'fuite' ? detecteur : null, nom: cause === 'fuite' ? 'Sous l’évier' : null, user_id: cause === 'personne' ? 'u-camille' : null, depuis: cause ? depuis / 1000 : null } },
  detecteurs: { [EVIER]: { mouille_depuis: a(14, 2) / 1000, sec_depuis: a(14, 40) / 1000 } },
  journal: [], regle: { actif: true, reagit: true, entite: '', toutes: true, vannes: [VANNE] },
});
const vue = (S, etat = ETAT(), o = {}) => E.vueVanne({ id: VANNE, S, etat, designee: '', ...CTX, maintenant: T, ...o });

test('I31 : quelle vanne est une vanne d’eau, de gaz, ou simple', () => {
  const S = maison();
  assert.equal(E.genreVanne(VANNE, S[VANNE], ''), 'eau');
  assert.equal(E.genreVanne('valve.gaz', S['valve.gaz'], ''), 'gaz');
  assert.equal(E.genreVanne('valve.arrosage', S['valve.arrosage'], ''), 'vanne');
  assert.equal(E.genreVanne('switch.prise_arrivee', S['switch.prise_arrivee'], 'switch.prise_arrivee'), 'eau', 'une prise désignée est la vanne d’eau');
  assert.equal(E.genreVanne('switch.prise_arrivee', S['switch.prise_arrivee'], ''), null, 'une prise ordinaire n’est pas une vanne');
  assert.equal(E.vanneDesignee({ actions: { vanne: { entite: 'switch.prise_arrivee' } } }), 'switch.prise_arrivee');
  assert.equal(E.vanneDesignee(null), '');
  assert.deepEqual([E.sensVanne(VANNE, 'closing'), E.sensVanne(VANNE, 'opening'), E.sensVanne('switch.p', 'off'), E.sensVanne(VANNE, 'unavailable')], ['fermee', 'ouverte', 'fermee', null]);
});

test('les détecteurs de fuite : ceux du serveur, rangés par leur nom', () => {
  assert.deepEqual(E.detecteursEau(maison(), CTX), [LINGE, EVIER], 'ni la plante, ni le modèle ; « Lave-linge » avant « Sous l’évier »');
});

test('§ 6 : la phrase de la vanne d’eau, la première ligne qui s’applique', () => {
  const p = (S, etat = ETAT(), o = {}) => { const v = vue(S, etat, o); return [v.phrase.texte, v.phrase.encre, !!v.phrase.panne]; };
  // 1. Indisponible, depuis quand.
  assert.deepEqual(p(maison(S => { S[VANNE] = st(VANNE, 'unavailable', S[VANNE].attributes, a(14, 20)); })), ['Indisponible depuis 14:20', 'var(--o-bad)', true]);
  // 2. Ouverte, et un détecteur voit de l'eau (la règle débrayée) : en rouge.
  assert.deepEqual(p(maison(S => { S[EVIER] = st(EVIER, 'on', S[EVIER].attributes); })), ['Ouverte · fuite : Sous l’évier', 'var(--o-bad)', false]);
  // 3. En mouvement — l'état, ou le geste en vol.
  assert.deepEqual(p(maison(S => { S[VANNE] = st(VANNE, 'closing', S[VANNE].attributes); })), ['Fermeture…', 'var(--o-text2)', false]);
  assert.deepEqual(p(maison(), ETAT(), { enVol: { sens: 'fermer' } }), ['Fermeture…', 'var(--o-text2)', false]);
  // 4. Ouverte : « aucune fuite » seulement s'il y a des détecteurs.
  assert.deepEqual(p(maison()), ['Ouverte · aucune fuite', 'var(--o-text2)', false]);
  assert.deepEqual(p(maison(S => { delete S[EVIER]; delete S[LINGE]; })), ['Ouverte', 'var(--o-text2)', false]);
  assert.deepEqual(p(maison(S => { S[LINGE] = st(LINGE, 'unavailable', S[LINGE].attributes); })), ['Ouverte', 'var(--o-text2)', false], 'un détecteur muet ne voit rien : pas de promesse');
  // 5. Fermée sur fuite : l'heure, en rouge.
  const ferme = maison(S => { S[VANNE] = st(VANNE, 'closed', S[VANNE].attributes, a(14, 2)); });
  assert.deepEqual(p(ferme, ETAT('fuite')), ['Fermée · fuite à 14:02', 'var(--o-bad)', false]);
  assert.deepEqual(p(ferme, ETAT('fuite', a(21, 40, -1))), ['Fermée · fuite depuis hier', 'var(--o-bad)', false], 'une fuite d’hier ne dit pas « à hier »');
  // 6. Fermée autrement : à quelle heure, depuis quand.
  assert.deepEqual(p(ferme, ETAT('personne')), ['Fermée à 14:02', 'var(--o-text2)', false]);
  assert.deepEqual(p(ferme, ETAT('personne', a(9, 0, -1))), ['Fermée depuis hier', 'var(--o-text2)', false]);
  // Le serveur muet : l'heure de l'état.
  assert.deepEqual(p(ferme, null), ['Fermée à 14:02', 'var(--o-text2)', false]);
});

test('I8 : la plaque cyan ouverte, rouge et le lavis sur fuite, grise sinon', () => {
  const ferme = maison(S => { S[VANNE] = st(VANNE, 'closed', S[VANNE].attributes); });
  assert.deepEqual([vue(maison()).plaque, vue(maison()).lavis], [['rgba(var(--o-cyan-rgb),.16)', 'var(--o-cyan)'], false]);
  assert.deepEqual([vue(ferme, ETAT('fuite')).plaque, vue(ferme, ETAT('fuite')).lavis], [['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)'], true]);
  assert.deepEqual(vue(ferme, ETAT('personne')).plaque, ['var(--o-s1)', 'var(--o-text2)']);
  assert.deepEqual(vue(maison(S => { S[VANNE] = st(VANNE, 'unavailable', S[VANNE].attributes); })).plaque, ['var(--o-s1)', 'var(--o-text3)']);
});

test('I11, I27 : le geste — fermer ne demande jamais, rouvrir demande après une fuite ou tant qu’il y a de l’eau', () => {
  const g = (S, etat) => { const x = vue(S, etat).geste; return x && [x.sens, x.mot, x.demander]; };
  const ferme = maison(S => { S[VANNE] = st(VANNE, 'closed', S[VANNE].attributes); });
  assert.deepEqual(g(maison()), ['fermer', 'Fermer l’eau', null], 'le sens sûr, d’un appui');
  assert.deepEqual(g(ferme, ETAT('fuite')), ['ouvrir', 'Rouvrir l’eau', 'fuite']);
  assert.deepEqual(g(ferme, ETAT('personne')), ['ouvrir', 'Rouvrir l’eau', null], 'fermée à la main, rien de mouillé : d’un appui');
  // ASSERTION MODIFIÉE (livraison de l'étape 3, 25/10 ; le choix sûr pris à sa place, qu'on lui dira) : une vanne d'eau qui s'est
  // fermée D'ELLE-MÊME (cause « appareil » : sans personne ni automatisation — un détecteur intégré, le plus souvent) DEMANDE avant
  // de rouvrir, sans promettre une fuite réparée ; une automatisation nommée, elle, se rouvre d'un appui, comme une personne.
  assert.deepEqual(g(ferme, ETAT('appareil')), ['ouvrir', 'Rouvrir l’eau', 'inconnu'], 'fermée d’elle-même : la personne décide');
  assert.deepEqual(E.questionVanne(vue(ferme, ETAT('appareil')), { carte: true }), { texte: 'Rouvrir l’eau ?', non: 'Annuler', oui: 'Rouvrir' });
  assert.deepEqual(g(ferme, ETAT('automatisme')), ['ouvrir', 'Rouvrir l’eau', null], 'fermée par une automatisation nommée : d’un appui');
  const mouillee = maison(S => { S[VANNE] = st(VANNE, 'closed', S[VANNE].attributes); S[LINGE] = st(LINGE, 'on', S[LINGE].attributes); });
  assert.deepEqual(g(mouillee, ETAT('personne')), ['ouvrir', 'Rouvrir l’eau', 'mouillee'], 'un détecteur voit encore de l’eau : la personne décide');
  assert.equal(vue(maison(S => { S[VANNE] = st(VANNE, 'unavailable', S[VANNE].attributes); })).geste, null, 'rien d’inerte : un appareil muet n’a pas de puce');
  // La question, dans ses deux formes.
  assert.deepEqual(E.questionVanne(vue(ferme, ETAT('fuite')), { carte: true }), { texte: 'La fuite est réparée ?', non: 'Annuler', oui: 'Rouvrir' });
  assert.deepEqual(E.questionVanne(vue(ferme, ETAT('fuite')), { detecteurs: { [EVIER]: { sec_depuis: a(14, 40) / 1000 } }, noms: { [EVIER]: 'Sous l’évier' }, maintenant: T }),
    { texte: 'Le détecteur Sous l’évier est sec depuis 14:40. La fuite est réparée ?', non: 'Pas encore', oui: 'Oui, rouvrir l’eau' });
  assert.deepEqual(E.questionVanne(vue(mouillee, ETAT('personne'))), { texte: 'Lave-linge voit encore de l’eau. Rouvrir quand même ?', non: 'Pas encore', oui: 'Rouvrir quand même' });
});

/* TEST AJOUTÉ (passe bis de l'étape 3, 25/10 ; relectures, points 2, 3 et 15). */
test('passe bis, point 2 : pendant `closing` et `opening`, la puce est INERTE — elle ne rouvre ni ne referme d’un appui', () => {
  const ferme = maison(S => { S[VANNE] = st(VANNE, 'closing', S[VANNE].attributes); });
  const f = vue(ferme, ETAT('fuite')).geste;
  assert.deepEqual([f.sens, f.mot, f.inerte, f.demander, f.rouge], ['fermer', 'Fermer l’eau', true, null, false], 'en train de fermer : « Fermer l’eau », choisie, sans geste');
  const ouvre = maison(S => { S[VANNE] = st(VANNE, 'opening', S[VANNE].attributes); });
  const o = vue(ouvre, ETAT()).geste;
  assert.deepEqual([o.sens, o.mot, o.inerte, o.demander], ['ouvrir', 'Rouvrir l’eau', true, null]);
  assert.equal(vue(ouvre, ETAT()).phrase.texte, 'Ouverture…');
  // Une vanne simple et le gaz : pareil.
  const gaz = E.vueVanne({ id: 'valve.gaz', S: maison(S => { S['valve.gaz'] = st('valve.gaz', 'opening', S['valve.gaz'].attributes); }), etat: null, designee: '', ...CTX, maintenant: T });
  assert.deepEqual([gaz.geste.inerte, gaz.geste.demander], [true, null]);
  assert.equal(vue(maison()).geste.inerte, false, 'à l’arrêt, la puce agit');
});

test('passe bis, point 3 : une vanne d’EAU fermée DEMANDE toujours tant que le carnet ne dit pas pourquoi', () => {
  const ferme = maison(S => { S[VANNE] = st(VANNE, 'closed', S[VANNE].attributes); });
  const d = (etat) => vue(ferme, etat).geste.demander;
  assert.equal(d(null), 'inconnu', 'le serveur muet (Home Assistant pas redémarré), ou pas encore lu');
  assert.equal(d({ ...ETAT(), vannes: {} }), 'inconnu', 'aucune fiche pour cette vanne');
  assert.equal(d(ETAT(null)), 'inconnu', 'en retard : le carnet la voit encore ouverte');
  assert.equal(d({ ...ETAT('personne'), vannes: { [VANNE]: { ferme: true, cause: null, detecteur: null, nom: null, user_id: null, depuis: null } } }), 'inconnu', 'vue fermée au premier relevé : on ne sait pas qui');
  assert.equal(d(ETAT('personne')), null, 'fermée à la main, le carnet le sait : d’un appui');
  assert.equal(d(ETAT('fuite')), 'fuite');
  assert.deepEqual(E.questionVanne(vue(ferme, null), { carte: true }), { texte: 'Rouvrir l’eau ?', non: 'Annuler', oui: 'Rouvrir' });
  assert.deepEqual(E.questionVanne(vue(ferme, null)), { texte: 'Rouvrir l’eau ?', non: 'Pas encore', oui: 'Oui, rouvrir l’eau' });
  // Une prise désignée, éteinte, serveur muet : pareil.
  const prise = E.vueVanne({ id: 'switch.prise_arrivee', S: maison(S => { S['switch.prise_arrivee'] = st('switch.prise_arrivee', 'off', {}); }), etat: null, designee: 'switch.prise_arrivee', ...CTX, maintenant: T });
  assert.equal(prise.geste.demander, 'inconnu');
  // Une vanne simple n'a pas de carnet : d'un appui, comme avant.
  assert.equal(E.vueVanne({ id: 'valve.arrosage', S: maison(), etat: null, designee: '', ...CTX, maintenant: T }).geste.demander, null);
});

test('passe bis, point 15 : la puce suit `supported_features` (OPEN = 1, CLOSE = 2) — pas de puce que Home Assistant refuserait', () => {
  const avec = (f, etat = 'open') => vue(maison(S => { S[VANNE] = st(VANNE, etat, { ...S[VANNE].attributes, supported_features: f }); }), ETAT('personne')).geste;
  assert.equal(avec(1), null, 'ouverte, sans CLOSE : rien à proposer');
  assert.equal(avec(2).sens, 'fermer');
  assert.equal(avec(2, 'closed'), null, 'fermée, sans OPEN : rien à proposer');
  assert.equal(avec(3, 'closed').sens, 'ouvrir');
  assert.equal(vue(maison()).geste.sens, 'fermer', 'sans l’attribut, comme avant');
});

test('I31 : une vanne simple, et le gaz qui demande', () => {
  const S = maison();
  const simple = E.vueVanne({ id: 'valve.arrosage', S, etat: null, designee: '', ...CTX, maintenant: T });
  assert.deepEqual([simple.genre, simple.phrase.texte, simple.geste.mot, simple.geste.demander], ['vanne', 'Fermée', 'Ouvrir', null]);
  const gaz = E.vueVanne({ id: 'valve.gaz', S, etat: null, designee: '', ...CTX, maintenant: T });
  assert.deepEqual([gaz.genre, gaz.phrase.texte, gaz.geste.mot, gaz.geste.demander], ['gaz', 'Fermée', 'Ouvrir', 'gaz']);
  assert.deepEqual(E.questionVanne(gaz, { carte: true }), { texte: 'Ouvrir le gaz ?', non: 'Annuler', oui: 'Ouvrir' });
  S['valve.gaz'] = st('valve.gaz', 'open', S['valve.gaz'].attributes);
  const ouvert = E.vueVanne({ id: 'valve.gaz', S, etat: null, designee: '', ...CTX, maintenant: T });
  assert.deepEqual([ouvert.phrase.texte, ouvert.geste.mot, ouvert.geste.demander], ['Ouverte', 'Fermer', null]);
  // Une prise désignée : la vanne d'eau, ses mots, et ses services seront ceux d'une prise.
  const prise = E.vueVanne({ id: 'switch.prise_arrivee', S, etat: null, designee: 'switch.prise_arrivee', ...CTX, maintenant: T });
  assert.deepEqual([prise.genre, prise.phrase.texte, prise.geste.mot], ['eau', 'Ouverte · aucune fuite', 'Fermer l’eau']);
  assert.deepEqual(E.serviceVanne('switch.prise_arrivee', 'fermer'), ['switch', 'turn_off']);
  assert.deepEqual(E.serviceVanne(VANNE, 'ouvrir'), ['valve', 'open_valve']);
  assert.deepEqual(E.serviceVanne(VANNE, 'fermer'), ['valve', 'close_valve']);
});

test('I27 : la tête de la popup dit pourquoi', () => {
  const ferme = maison(S => { S[VANNE] = st(VANNE, 'closed', S[VANNE].attributes, a(14, 2)); });
  const t = (S, etat) => E.teteVanne(vue(S, etat), etat && etat.vannes[VANNE], T);
  assert.deepEqual(t(maison(), ETAT()), { mot: 'Ouverte', phrase: 'Aucune fuite détectée', alerte: false });
  assert.deepEqual(t(ferme, ETAT('fuite')), { mot: 'Fermée', phrase: 'Depuis 14:02 · fuite : Sous l’évier', alerte: true });
  assert.deepEqual(t(ferme, ETAT('personne')), { mot: 'Fermée', phrase: 'Depuis 14:02 · fermée à la main', alerte: false });
  assert.deepEqual(t(ferme, ETAT('automatisme')), { mot: 'Fermée', phrase: 'Depuis 14:02 · par la maison', alerte: false });
  assert.deepEqual(t(ferme, ETAT('appareil')), { mot: 'Fermée', phrase: 'Depuis 14:02 · sur l’appareil', alerte: false });
});

test('les détecteurs dans la popup : le résumé, chaque rangée, la règle des piles', () => {
  const S = maison(S0 => { S0[LINGE] = st(LINGE, 'on', S0[LINGE].attributes); S0['binary_sensor.fuite_chauffe_eau'] = st('binary_sensor.fuite_chauffe_eau', 'unavailable', { device_class: 'moisture', friendly_name: 'Chauffe-eau' }); });
  const ids = E.detecteursEau(S, CTX);
  const rangees = E.rangeesDetecteurs(ids, S, ETAT().detecteurs, { piece: (id) => (id === EVIER ? 'Cuisine' : 'Buanderie'), pile: (id) => (id === EVIER ? 76 : id === LINGE ? 4 : null), maintenant: T });
  assert.deepEqual(rangees.map(r => [r.nom, r.ligne.map(x => x.texte).join(' · '), r.etat, r.encre]), [
    ['Chauffe-eau', 'Buanderie', 'Indisponible', 'var(--o-text3)'],
    ['Lave-linge', 'Buanderie · pile 4 %', 'Fuite', 'var(--o-bad)'],
    ['Sous l’évier', 'Cuisine · pile 76 % · sec depuis 14:40', 'Sec', 'var(--o-text2)'],
  ]);
  assert.equal(rangees[1].ligne[1].encre, 'var(--o-bad)', 'une pile au critique, dans la couleur de la règle des piles');
  assert.equal(E.resumeDetecteurs(rangees), '1 détecteur voit de l’eau');
  assert.equal(E.resumeDetecteurs(rangees.slice(2)), '1 détecteur · sec');
  assert.equal(E.resumeDetecteurs([rangees[2], rangees[2]]), '2 détecteurs · tous secs');
  assert.equal(E.resumeDetecteurs([rangees[0], rangees[2]]), '1 détecteur indisponible');
});

test('le journal du jour : ce qui s’est passé, sa note, qui', () => {
  const journal = [
    { when: a(14, 2) / 1000, quoi: 'fuite', entity_id: EVIER, cause: null, detecteur: null, nom: null, user_id: null },
    { when: a(14, 2) / 1000 + 4, quoi: 'fermee', entity_id: VANNE, cause: 'fuite', detecteur: EVIER, nom: 'Sous l’évier', user_id: null },
    { when: a(14, 40) / 1000, quoi: 'sec', entity_id: EVIER, cause: null, detecteur: null, nom: null, user_id: null },
    { when: a(18, 0) / 1000, quoi: 'rouverte', entity_id: VANNE, cause: 'personne', detecteur: null, nom: null, user_id: 'u-camille' },
    { when: a(18, 5) / 1000, quoi: 'fermee', entity_id: VANNE, cause: 'automatisme', detecteur: null, nom: 'Coupure des vacances', user_id: null },
    { when: a(18, 10) / 1000, quoi: 'rouverte', entity_id: VANNE, cause: 'personne', detecteur: null, nom: null, user_id: 'u-inconnu' },
    { when: a(18, 15) / 1000, quoi: 'fermee', entity_id: 'valve.cave', cause: 'appareil', detecteur: null, nom: null, user_id: null },
  ];
  const lignes = E.journalEau(journal, [VANNE, EVIER], { personnes: { 'u-camille': 'Camille' }, nomDe: (id) => ({ [EVIER]: 'Sous l’évier' })[id] || id, pieceDe: (id) => (id === EVIER ? 'Cuisine' : null) });
  assert.deepEqual(lignes.map(l => [l.heure, l.quoi, l.note, l.qui, l.glyphe]), [
    ['18:10', 'Eau rouverte', null, 'Un compte', 'user'],
    ['18:05', 'Eau fermée', '« Coupure des vacances »', 'Automatisme', 'magic-wand'],
    ['18:00', 'Eau rouverte', null, 'Camille', 'user'],
    ['14:40', 'Détecteur sec', 'Sous l’évier · Cuisine', 'Détecteur', 'raindrops'],
    ['14:02', 'Eau fermée', 'Fermeture sur fuite', 'Automatisme', 'magic-wand'],
    ['14:02', 'Fuite détectée', 'Sous l’évier · Cuisine', 'Détecteur', 'raindrops'],
  ], 'les plus récentes d’abord ; la cave n’est pas cette vanne');
});
