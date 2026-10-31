/* Les cartes et les popups des groupes de capteurs (chantier Capteurs, étapes 2 et 3, tâches 5 à 7 ; C22 à C24, C27, § 3, § 4).
 *
 * Ce qui est garanti ici (tâche 5, Ouvertures) :
 *  - C22, § 3.1 : « {n} ouverte(s) sur {total} » en ambre, sinon la muette, sinon « Tout est fermé » en neutre ; le total
 *    compte les ouvertures qui répondent, comme les tuiles de Sécurité ; « à regarder » : une muette seulement (§ 19.1) ;
 *  - les puces : les ouvertes, les muettes, puis « {k} fermées » ; une rangée, le reste en « +{k} » ;
 *  - la carte : large (la grille commune, les puces de la carte large seulement), compacte ; le lavis seulement en alerte ;
 *    la surface dit ce qu'elle affiche ; la fabrique pose `groupe:*` et ouvre sa popup ;
 *  - C27, § 4.2 : la popup Ouvertures — une lecture de l'historique du jour, le mot, la phrase, un conseil seulement vrai, une
 *    rangée par membre avec son dessin et sa bande, qui ouvre la fiche de son binaire ; ni épingle, ni seconde croix ; la
 *    frontière Suspense dans la feuille.
 * `CarteGroupe`, `RoomGroupeCard` et `pucesQuiTiennent` vivent dans App.jsx : sous `?groupes_cartes`, un crochet de chargement
 * leur ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { indexOf } from './fixtures.mjs';
import { monter } from './crochets.mjs';
import { maisonGroupes, ctxDe } from './maison_capteurs.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?groupes_cartes')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?groupes_cartes'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { CarteGroupe, RoomGroupeCard, pucesQuiTiennent, BRIQUES_GROUPE };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?groupes_cartes', import.meta.url).href);
const G = await import('../src/groupes.js');
const FG = await import('../src/fichegroupe.jsx');
const J = await import('../src/journee.jsx');
const { comptesSecurite } = await import('../src/attention.js');
const APP = MONOLITHE;

const PIECES = ['Séjour', 'Chambre', 'Cuisine'];
const heure = (iso) => String(iso).slice(11, 16);
const avec = (fx, f) => {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: PIECES.map(room => ({ room })) }, resolved: null });
  try { return f(); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
};
const etat = (fx, id, s, extra = {}) => ({ ...fx.states, [id]: { ...fx.states[id], state: s, last_changed: '2026-10-16T22:25:00Z', ...extra } });

test('C22 : « {n} ouverte sur {total} » en ambre, sinon la muette, sinon « Tout est fermé » — le total de Sécurité ; à regarder : la muette seulement', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).ouvertures;
  const vue = (S) => G.vueOuvertures(ids, S, G.nomsMembres(ids, S, ctx), heure);
  // La baie vitrée est ouverte : l'ambre, de jour comme de nuit — mais rien « à regarder » (§ 19.1 : un état choisi).
  const ouverte = vue(fx.states);
  assert.deepEqual([ouverte.phrase, ouverte.ton, ouverte.regarder, ouverte.glyphe], ['1 ouverte sur 5', 'warn', false, 'door-open']);
  const deux = vue(etat({ states: etat(fx, 'binary_sensor.garage_avant', 'on') }, 'binary_sensor.baie_vitree', 'on'));
  assert.equal(deux.phrase, '2 ouvertes sur 5');
  // Le total compte celles qui répondent — comme les tuiles de Sécurité, qui comptent les mêmes ouvrants.
  const S = etat(fx, 'binary_sensor.porte_entree', 'unavailable');
  const membres = Object.fromEntries(ids.map(id => [id, S[id]]));
  const tuiles = comptesSecurite(membres, []);
  assert.equal(vue(S).phrase, '1 ouverte sur 4');
  assert.equal(tuiles.portes.total + tuiles.fenetres.total, 4, 'le même total que les tuiles de Sécurité');
  // Fermée, une muette : « {nom} ne répond plus », ambre, et à regarder ; deux : « {k} ne répondent plus ».
  const calme = etat(fx, 'binary_sensor.baie_vitree', 'off');
  const muette = vue({ ...calme, 'binary_sensor.porte_entree': { ...calme['binary_sensor.porte_entree'], state: 'unavailable' } });
  assert.deepEqual([muette.phrase, muette.ton, muette.regarder], ['Contact porte entrée ne répond plus', 'warn', true]);
  const deuxMuettes = vue({ ...calme, 'binary_sensor.porte_entree': { state: 'unavailable', attributes: {} }, 'binary_sensor.fenetre_chambre': { state: 'unknown', attributes: {} } });
  assert.equal(deuxMuettes.phrase, '2 ne répondent plus');
  // Tout fermé : « Tout est fermé », en neutre — un état qui change, pas un « Tout va bien ».
  assert.deepEqual([vue(calme).phrase, vue(calme).ton, vue(calme).regarder, vue(calme).glyphe], ['Tout est fermé', null, false, 'door-closed']);
});

test('les puces : les ouvertes « {nom} · 22:25 », les muettes, puis « {k} fermées » ; une rangée, le reste en « +{k} »', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).ouvertures;
  const S = { ...etat(fx, 'binary_sensor.baie_vitree', 'on'), 'binary_sensor.porte_entree': { state: 'unavailable', attributes: { device_class: 'door' } } };
  // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4) : l'heure d'une puce est celle du dernier VRAI changement (`depuis`, l'historique du jour), jamais
  // `last_changed` seul ; `heure` reçoit un instant.
  const v = G.vueOuvertures(ids, S, G.nomsMembres(ids, S, ctx), (t) => new Date(t).toISOString().slice(11, 16), () => Date.parse('2026-10-16T22:25:00Z'));
  assert.deepEqual(v.puces, [
    { t: 'Contact baie vitrée · 22:25', glyphe: 'door-open', ton: 'warn' },
    { t: 'Contact porte entrée · muette', glyphe: 'door-closed', ton: 'warn' },
    { t: '3 fermées', glyphe: 'check', ton: null },
  ]);
  /* 188 px, la plus étroite des cartes larges : deux courtes tiennent seules, pas quatre (une, et « +3 »).
   * ASSERTIONS MODIFIÉES (passe bis du 17/10, point 8) : une puce longue qui ne tient pas AVEC « +2 » se montre seule et entière — partager la
   * rangée la coupait en « … » (mesuré à 1 280 px : 192 px de rangée, 182 de puce, 40 de « +3 ») ; « +{k} » ne suit que s'il tient avec elles. */
  assert.deepEqual(F.pucesQuiTiennent(v.puces), { n: 1, suite: false }, 'la longue, seule, sans « +2 »');
  assert.deepEqual(F.pucesQuiTiennent([{ t: 'Entrée' }, { t: 'Salon' }]), { n: 2, suite: false });
  assert.deepEqual(F.pucesQuiTiennent([{ t: 'Entrée' }, { t: 'Salon' }, { t: 'Cave' }, { t: 'Garage' }]), { n: 1, suite: true }, 'une, et « +3 »');
  assert.deepEqual(F.pucesQuiTiennent([{ t: 'Baie vitrée · 22:25' }, { t: 'Porte entrée · muette' }, { t: '2 fermées' }]), { n: 1, suite: true }, 'une courte, et « +2 »');
  assert.deepEqual(F.pucesQuiTiennent([{ t: 'Une puce bien trop longue pour une rangée de cent quatre-vingt-huit pixels' }, { t: 'x' }]), { n: 1, suite: false }, 'une au moins');
  // La carte Piles de la démo à 1 280 px : « Contact porte entrée · 9 % » (182 px) tient seule dans 188, pas avec « +3 » (40 px).
  assert.deepEqual(F.pucesQuiTiennent([{ t: 'Contact porte entrée · 900a0%' }, { t: 'Contact fenêtre chambre · 1200a0%' }, { t: 'Bouton salon · 1400a0%' }, { t: 'Schefflera · muette' }]), { n: 1, suite: false });
  const seule = html({ v: { ...VUE, puces: [{ t: 'Contact porte entrée · 900a0%', glyphe: 'battery-empty', ton: 'warn' }, { t: 'Contact fenêtre chambre · 1200a0%', glyphe: 'battery-quarter', ton: 'warn' }, { t: 'Schefflera · muette', glyphe: 'battery-empty', ton: 'warn' }] } });
  assert.ok(seule.includes('Contact porte entrée · 900a0%') && !seule.includes('>+2<') && !seule.includes('Schefflera · muette<'), 'la carte : la puce entière, sans « +2 »');
});

const VUE = { glyphe: 'door-open', phrase: '1 ouverte sur 4', ton: 'warn', puces: [{ t: 'Baie vitrée · 22:25', glyphe: 'door-open', ton: 'warn' }, { t: 'Porte entrée · muette', glyphe: 'door-closed', ton: 'warn' }, { t: '2 fermées', glyphe: 'check', ton: null }] };
const html = (props) => renderToStaticMarkup(createElement(F.CarteGroupe, { nom: 'Ouvertures', groupe: 'ouvertures', onOpen: () => {}, ...props }));

test('la carte : large (la grille commune, les puces de la carte large seulement), le lavis en alerte seulement, la surface, la compacte', () => {
  const large = html({ v: VUE });
  assert.ok(large.includes('class="o-rmcard o-gabarit"') && large.includes('class="o-gab-nom"') && large.includes('class="o-gab-phrase"'), 'la grille commune de la carte étroite');
  assert.ok(large.includes('class="o-seul-large" data-puces=""'), 'les puces : la carte large seulement');
  assert.ok(large.includes('Baie vitrée · 22:25') && !large.includes('>Porte entrée · muette<') && large.includes('>+2<'), 'une puce, et « +2 »');
  assert.ok(large.includes('aria-label="Ouvertures, 1 ouverte sur 4, Baie vitrée · 22:25, Porte entrée · muette"'), 'la surface dit ce que la carte affiche');
  assert.ok(large.includes('linear-gradient(180deg,rgba(var(--o-warn-rgb),0.08)'), 'en alerte : le lavis ambre à 0,08');
  const calme = html({ v: { ...VUE, phrase: 'Tout est fermé', ton: null, puces: [{ t: '4 fermées', glyphe: 'check', ton: null }] } });
  assert.ok(!calme.includes('var(--o-warn-rgb)') && !calme.includes('linear-gradient(180deg,rgba(') && calme.includes('Tout est fermé'), 'au calme : ni lavis ni teinte');
  assert.ok(!large.includes('Tout va bien') && !calme.includes('Tout va bien'));
  const compacte = html({ v: VUE, chip: true });
  assert.ok(compacte.includes('class="o-piece o-cvdense"') && compacte.includes('1 ouverte sur 4') && !compacte.includes('data-puces'), 'la compacte : le nom, la phrase, sans puces');
  assert.ok(!compacte.includes('o-cvpastille') && !compacte.includes('o-cvtxt'), 'les classes de CvCard lui restent réservées');
});

test('la fabrique pose `groupe:*` et ouvre sa popup ; la carte lit ses membres en direct', () => {
  const fx = maisonGroupes();
  avec(fx, () => {
    const c = renderToStaticMarkup(createElement(F.RoomGroupeCard, { groupe: 'ouvertures', hass: { states: fx.states }, onOpen: () => {} }));
    assert.ok(c.includes('>Ouvertures<') && c.includes('1 ouverte sur 5') && c.includes('Contact baie vitrée'), c.slice(0, 200));
  });
  const d = APP.indexOf('\nfunction useDomainCards(');
  const dc = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(dc.includes("if (k.indexOf('groupe:') === 0) return <RoomGroupeCard groupe={k.slice(7)} hass={hass} onOpen={() => setGroupePop(k.slice(7))} label={label} chip={chip} />;"));
  assert.ok(dc.includes('{groupePop && <FicheGroupe groupe={groupePop} hass={hass} onClose={() => setGroupePop(null)} />}'));
  const r = APP.indexOf('\nfunction RoomGroupeCard(');
  assert.ok(APP.slice(r, APP.indexOf('\n}\n', r)).includes('useHass(membres)'), 'elle s’abonne à ses membres, jamais au domaine');
});

/* La popup, jouée : la maison des groupes, la baie vitrée ouverte à 20:20 aujourd'hui, la nuit, et le chauffage du séjour coupé. */
function popup(fx, { nuit = true, coupes = { Séjour: ['climate.sejour'] } } = {}) {
  const minuit = J.minuitDe(Date.now());
  const ids = G.membresGroupes(fx.states, ctxDe(fx, PIECES)).ouvertures;
  const lectures = [];
  const hass = {
    states: { ...fx.states, 'sun.sun': { state: nuit ? 'below_horizon' : 'above_horizon', attributes: {} } },
    callApi: (m, chemin) => { lectures.push(chemin); return Promise.resolve([]); },
    callWS: (msg) => Promise.resolve(msg.type === 'loggia/fenetres/etat' ? { coupes } : {}),
  };
  const ctx = ctxDe(fx, PIECES);
  const journee = { debut: minuit, etats: { 'binary_sensor.baie_vitree': [{ t: minuit, s: 'off' }, { t: minuit + 20 * 3600000 + 20 * 60000, s: 'on' }] } };
  return { ids, hass, lectures, journee, minuit, noms: G.nomsMembres(ids, hass.states, ctx), pieces: new Map(ids.map(id => [id, ctx.piece(id)])) };
}

test('C27, § 4.2 : la popup Ouvertures — le mot, la phrase, un conseil seulement vrai, une rangée par membre, son dessin et sa bande', async () => {
  const fx = maisonGroupes();
  const p = popup(fx);
  const ouverts = [];
  const m = monter(FG.Ouvertures, { ids: p.ids, S: p.hass.states, noms: p.noms, pieces: p.pieces, briques: F.BRIQUES_GROUPE, journee: p.journee, maintenant: p.minuit + 22 * 3600000, hass: p.hass, onMembre: (id) => ouverts.push(id) });
  await new Promise(r => setTimeout(r, 0));
  m.rendre();
  const corps = m.trouver(e => e.props && e.props.mot !== undefined)[0];
  const h = new Date(p.minuit + 20 * 3600000 + 20 * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  assert.equal(corps.props.mot, '1 ouverte');
  assert.equal(corps.props.phrase, 'Contact baie vitrée, depuis ' + h, 'l’historique du jour fait foi');
  assert.deepEqual(corps.props.conseils, ['Pensez à la fermer avant de dormir.', 'Séjour : le chauffage attend qu’elle soit fermée.']);
  const rangees = m.trouver(e => e.type === 'button');
  assert.equal(rangees.length, 5, 'une rangée par membre');
  const dessin = m.trouver(e => e.type === F.BRIQUES_GROUPE.Dessin)[0];
  assert.deepEqual([dessin.props.ouvert, dessin.props.taille], [true, 28], 'la baie vitrée d’abord, son dessin ouvert, dans sa plaque');
  const bande = m.trouver(e => e.type === J.BandeJour)[0];
  assert.equal(bande.props.resume, 'ouverte une fois aujourd’hui');
  m.appuyer(rangees[0]);
  assert.deepEqual(ouverts, ['binary_sensor.baie_vitree'], 'une rangée ouvre la fiche de son binaire');
  m.demonter();
  // Le jour, et sans chauffage coupé : aucun conseil — rien qui ne soit vrai.
  const jour = popup(fx, { nuit: false, coupes: {} });
  const m2 = monter(FG.Ouvertures, { ids: jour.ids, S: jour.hass.states, noms: jour.noms, pieces: jour.pieces, briques: F.BRIQUES_GROUPE, journee: jour.journee, maintenant: jour.minuit + 22 * 3600000, hass: jour.hass, onMembre: () => {} });
  await new Promise(r => setTimeout(r, 0));
  m2.rendre();
  assert.deepEqual(m2.trouver(e => e.props && e.props.mot !== undefined)[0].props.conseils, []);
  m2.demonter();
});

test('C27 : la popup — une lecture de l’historique pour tous les membres, l’en-tête sans épingle ; la coquille garde la feuille', async () => {
  const fx = maisonGroupes();
  const p = popup(fx);
  const m = monter(FG.default, { groupe: 'ouvertures', nom: 'Ouvertures', ids: p.ids, hass: p.hass, noms: p.noms, pieces: p.pieces, briques: F.BRIQUES_GROUPE, onMembre: () => {} });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(p.lectures.length, 1, 'une lecture, à l’ouverture');
  assert.ok(p.lectures[0].includes('?filter_entity_id=' + encodeURIComponent(p.ids.join(','))) && p.lectures[0].includes('&minimal_response&no_attributes'));
  const entete = m.trouver(e => e.props && e.props.sousNom !== undefined)[0];
  assert.deepEqual([entete.props.nom, entete.props.sousNom, entete.props.epingle], ['Ouvertures', '5 capteurs · portes et fenêtres', undefined], 'ni épingle : un groupe n’est pas une entité');
  const i = APP.indexOf('\nfunction FicheGroupe(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  const [feuille, frontiere, contenu] = ['<BottomSheet onClose={onClose}>', '<Suspense fallback={<div style={{ minHeight: 260 }} />}>', '<FicheGroupeContent groupe={groupe}'].map(x => coquille.indexOf(x));
  assert.ok(feuille >= 0 && frontiere > feuille && contenu > frontiere, 'la feuille, puis la frontière, puis le contenu');
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32) : la même coquille sert à Piles, où une rangée ouvre la fiche de l'APPAREIL.
  assert.ok(coquille.includes("{membre && (piles ? <FicheAppareil id={membre} hass={H} onClose={() => setMembre(null)} /> : membre.indexOf('sensor.') === 0 ? <FicheCapteur id={membre} hass={H} onClose={() => setMembre(null)} /> : <FicheBinaire id={membre} hass={H} onClose={() => setMembre(null)} />)}"), 'la fiche d’un binaire, par-dessus'); // ASSERTION MODIFIÉE (relecture du lot 3) : un monoxyde chiffré ouvre la fiche d'une mesure.
});

/* ── Tâche 5 : Présence (C24, § 3.3, § 4.4 ; § 19.3 : avec les caméras) ── */

test('C24, § 19.3 : Présence — en ce moment, il y a {n} min, rien depuis ; les caméras comprises ; toujours neutre, jamais à regarder', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).presence;
  const noms = G.nomsMembres(ids, fx.states, ctx);
  const t = Date.UTC(2026, 9, 16, 20, 0);
  const min = 60000;
  const vue = (S, derniers) => G.vuePresence(ids, S, noms, derniers, t);
  // Le dernier mouvement du journal, il y a 3 min : la pièce, sans préposition ; la forme courte pour la carte étroite.
  const recent = vue(fx.states, { 'binary_sensor.enceinte_mouvement': t - 3 * min });
  assert.deepEqual([recent.phrase, recent.phraseCourte, recent.ton, recent.accent, recent.regarder], ['Mouvement · Séjour · il y a 3 min', 'Séjour · 3 min', null, false, false]);
  // Un mouvement en ce moment : l'accent sur la plaque, la phrase reste neutre.
  const enCours = vue(etat(fx, 'binary_sensor.enceinte_mouvement', 'on'), {});
  assert.deepEqual([enCours.phrase, enCours.ton, enCours.accent, enCours.regarder], ['Mouvement · Séjour · en ce moment', null, true, false]);
  // La sonnette d'une caméra, en `occupancy` : quelqu'un.
  assert.equal(vue(etat(fx, 'binary_sensor.camera_porte_sonnette', 'on'), {}).phrase, 'Quelqu’un · Caméra porte');
  // Au-delà de l'heure, « Rien depuis 2 h » ; rien dans les 24 h du journal, « Rien depuis plus de 24 h ».
  assert.equal(vue(fx.states, { 'binary_sensor.enceinte_mouvement': t - 120 * min }).phrase, 'Rien depuis 2 h');
  assert.equal(vue(fx.states, {}).phrase, 'Rien depuis plus de 24 h');
  // Les puces : une par détecteur, les caméras comprises.
  assert.deepEqual(recent.puces.map(p => p.t), ['Caméra jardin', 'Caméra porte', 'Caméra porte', 'Séjour · 3 min']);
  assert.deepEqual(vue({ ...fx.states, 'binary_sensor.camera_jardin_mouvement': { state: 'unavailable', attributes: {} } }, {}).puces[0].t, 'Caméra jardin · muet');
});

test('la carte Présence : l’accent pendant un mouvement, la phrase en neutre, sa forme courte sur une carte étroite ; elle lit le journal', () => {
  const v = { glyphe: 'signal-stream', phrase: 'Mouvement · Séjour · il y a 3 min', phraseCourte: 'Séjour · 3 min', ton: null, accent: true, puces: [{ t: 'Séjour · 3 min', glyphe: 'signal-stream', ton: null }] };
  const c = html({ v, nom: 'Présence', groupe: 'presence' });
  assert.ok(c.includes('background:rgba(var(--o-accent-rgb),.16);color:var(--o-accent-soft)'), 'la plaque à l’accent');
  assert.ok(c.includes('class="o-gab-phrase o-seul-large"') && c.includes('class="o-gab-phrase o-seul-etroit"') && c.includes('>Séjour · 3 min<'), 'deux écritures : la phrase, et sa forme courte');
  assert.ok(!c.includes('linear-gradient(180deg,rgba('), 'ni lavis : du mouvement chez soi n’est pas un problème');
  const r = APP.indexOf('\nfunction RoomGroupeCard(');
  const carte = APP.slice(r, APP.indexOf('\n}\n', r));
  assert.ok(carte.includes("useDerniersEvenements(H, groupe === 'presence' ? membres : [], reduireDerniers)"), 'le dernier mouvement vient du journal, jamais de last_changed');
});

test('§ 4.4 : la popup Présence — le mot, le dernier mouvement, une rangée par détecteur, sa bande ; pas de note', async () => {
  const fx = maisonGroupes();
  const minuit = J.minuitDe(Date.now());
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).presence;
  const journee = { debut: minuit, etats: { 'binary_sensor.enceinte_mouvement': [{ t: minuit, s: 'off' }, { t: minuit + 21.5 * 3600000, s: 'on' }, { t: minuit + 21.6 * 3600000, s: 'off' }] } };
  // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4) : le dernier mouvement vient du JOURNAL (`derniers`), la source de la carte — plus de l'historique du jour.
  const derniers = { 'binary_sensor.enceinte_mouvement': minuit + 21.5 * 3600000 };
  const m = monter(FG.Presence, { ids, S: fx.states, noms: G.nomsMembres(ids, fx.states, ctx), briques: F.BRIQUES_GROUPE, journee, derniers, maintenant: minuit + 22 * 3600000, onMembre: () => {} });
  const corps = m.trouver(e => e.props && e.props.mot !== undefined)[0];
  const h = new Date(minuit + 21.5 * 3600000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  assert.deepEqual([corps.props.mot, corps.props.phrase, corps.props.conseils, corps.props.note], ['Rien depuis 30 min', 'Dernier mouvement à ' + h, [], undefined]);
  assert.equal(m.trouver(e => e.type === 'button').length, 4, 'une rangée par détecteur, les caméras comprises');
  const texte = m.texte();
  // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4) : la rangée dit le délai court de la carte, « 30 min » (« 5 h », jamais « Il y a 300 min »).
  assert.ok(texte.includes('Dernier mouvement à ' + h) && texte.includes('30 min') && !texte.includes('Il y a') && texte.includes('Vide'), texte);
  assert.equal(m.trouver(e => e.type === J.BandeJour).find(e => e.props.resume === 'mouvements aujourd’hui') != null, true);
  // L'en-tête de la popup : « 4 détecteurs de mouvement ».
  const p = monter(FG.default, { groupe: 'presence', nom: 'Présence', ids, hass: { states: fx.states }, noms: G.nomsMembres(ids, fx.states, ctx), pieces: new Map(), briques: F.BRIQUES_GROUPE, onMembre: () => {} });
  assert.equal(p.trouver(e => e.props && e.props.sousNom !== undefined)[0].props.sousNom, '4 détecteurs de mouvement');
});

/* ── Tâche 7 : Sécurité (C23, C4, § 3.2, § 4.3) ── */

test('C23, C4 : Sécurité — un détecteur qui sonne en rouge, un muet en ambre, sinon « {n} détecteurs · rien à signaler » ; jamais « Tout va bien »', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).securite;
  const vue = (S) => G.vueSecurite(ids, S, G.nomsMembres(ids, S, ctx));
  // Les deux caméras : au calme, le compte, en neutre, et une puce par famille.
  const calme = vue(fx.states);
  assert.deepEqual([calme.phrase, calme.ton, calme.regarder, calme.glyphe], ['2 détecteurs · rien à signaler', null, false, 'shield-check']);
  assert.deepEqual(calme.puces, [{ t: 'Monoxyde de carbone · 2', glyphe: 'check', ton: null }]);
  // Une alarme CO : les mots de l'Accueil, la glyphe de la famille, le rouge ; la carte est à regarder.
  const sonne = vue(etat(fx, 'binary_sensor.camera_porte_co', 'on'));
  // ASSERTIONS MODIFIÉES (audit des capteurs du 19/10, lot 4) : « Monoxyde détecté », le mot de la fiche et de l'Accueil.
  assert.deepEqual([sonne.phrase, sonne.ton, sonne.regarder, sonne.glyphe], ['Monoxyde détecté · Caméra porte', 'bad', true, 'flame']);
  assert.deepEqual(sonne.puces, [{ t: 'Monoxyde détecté · Caméra porte', glyphe: 'flame', ton: 'bad' }, { t: 'Monoxyde de carbone', glyphe: 'check', ton: null }]);
  // Un détecteur muet : « {nom} ne répond plus », en ambre, à regarder (C4) ; deux : « {k} détecteurs ne répondent plus ».
  const muet = vue(etat(fx, 'binary_sensor.camera_jardin_co', 'unavailable'));
  assert.deepEqual([muet.phrase, muet.ton, muet.regarder, muet.glyphe], ['Caméra jardin ne répond plus', 'warn', true, 'shield-exclamation']);
  assert.deepEqual(muet.puces[0], { t: 'Caméra jardin · muet', glyphe: 'shield-exclamation', ton: 'warn' });
  assert.equal(vue({ ...etat(fx, 'binary_sensor.camera_jardin_co', 'unavailable'), 'binary_sensor.camera_porte_co': { state: 'unknown', attributes: { device_class: 'carbon_monoxide' } } }).phrase, '2 détecteurs ne répondent plus');
  // Les autres familles, avec les mots de la table de sûreté de l'Accueil ; un seul détecteur.
  const S = { 'binary_sensor.a': { state: 'off', attributes: { device_class: 'smoke' } }, 'binary_sensor.b': { state: 'off', attributes: { device_class: 'moisture' } }, 'binary_sensor.c': { state: 'off', attributes: { device_class: 'smoke' } } };
  const noms = new Map([['binary_sensor.a', 'Cuisine'], ['binary_sensor.b', 'Évier'], ['binary_sensor.c', 'Entrée']]);
  assert.deepEqual(G.vueSecurite(Object.keys(S), S, noms).puces.map(p => p.t), ['Fumée · 2', "Fuite d'eau"]);
  assert.deepEqual(G.vueSecurite(['binary_sensor.b'], S, noms).phrase, '1 détecteur · rien à signaler');
  const fumee = G.vueSecurite(Object.keys(S), { ...S, 'binary_sensor.c': { state: 'on', attributes: { device_class: 'smoke' } } }, noms);
  assert.deepEqual([fumee.phrase, fumee.glyphe, fumee.puces[0].t], ['Fumée détectée · Entrée', 'fire-smoke', 'Fumée détectée · Entrée']);
  for (const v of [calme, sonne, muet, fumee]) assert.ok(!JSON.stringify(v).includes('Tout va bien'));
});

test('la carte Sécurité : le rouge et son lavis à 0,16 quand un détecteur sonne ; au calme, ni teinte ni lavis ; la fabrique la branche', () => {
  const sonne = html({ v: { glyphe: 'fire-smoke', phrase: 'Fumée détectée · Cuisine', ton: 'bad', puces: [{ t: 'Fumée détectée · Cuisine', glyphe: 'fire-smoke', ton: 'bad' }] }, nom: 'Sécurité', groupe: 'securite' });
  assert.ok(sonne.includes('linear-gradient(180deg,rgba(var(--o-bad-rgb),0.16)') && sonne.includes('background:rgba(var(--o-bad-rgb),.16);color:var(--o-bad)'), 'le lavis rouge, la plaque rouge');
  assert.ok(sonne.includes('aria-label="Sécurité, Fumée détectée · Cuisine, Fumée détectée · Cuisine"'));
  const calme = html({ v: { glyphe: 'shield-check', phrase: '2 détecteurs · rien à signaler', ton: null, puces: [{ t: 'Monoxyde de carbone · 2', glyphe: 'check', ton: null }] }, nom: 'Sécurité', groupe: 'securite' });
  assert.ok(!calme.includes('linear-gradient(180deg,rgba(') && !calme.includes('var(--o-bad') && calme.includes('Monoxyde de carbone · 2'));
  const r = APP.indexOf('\nfunction RoomGroupeCard(');
  assert.ok(APP.slice(r, APP.indexOf('\n}\n', r)).includes("groupe === 'securite' ? vueSecurite(membres, S, noms)"), 'la carte lit la vue de Sécurité');
});

test('§ 4.3 : la popup Sécurité — le mot, la phrase, une rangée par détecteur avec son signal et sa pile, son état ; la note C4, sans « une heure »', async () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const ids = G.membresGroupes(fx.states, ctx).securite;
  const noms = G.nomsMembres(ids, fx.states, ctx);
  const S = etat(fx, 'binary_sensor.camera_jardin_co', 'unavailable');
  const h = new Date('2026-10-16T22:25:00Z').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const ouverts = [];
  const m = monter(FG.Securite, { ids, S, noms, briques: F.BRIQUES_GROUPE, journee: null, onMembre: (id) => ouverts.push(id) });
  const corps = m.trouver(e => e.props && e.props.mot !== undefined)[0];
  // ASSERTION MODIFIÉE (relecture du lot 4 de l’audit des capteurs) : l'historique n'est pas lu (`journee: null`) — on ne sait pas depuis quand : l'heure se tait, comme sur la carte.
  assert.deepEqual([corps.props.mot, corps.props.phrase, corps.props.conseils], ['1 détecteur muet', 'Caméra jardin', []]);
  assert.equal(corps.props.note, 'Un détecteur qui ne répond plus passe en alerte ici : sans réponse, il ne protège plus.');
  assert.ok(!JSON.stringify(corps.props).includes('heure'), 'sans « une heure de silence » (C4)');
  const rangees = m.trouver(e => e.type === 'button');
  assert.equal(rangees.length, 2, 'une rangée par détecteur, le muet d’abord');
  const texte = m.texte();
  assert.ok(texte.indexOf('Caméra jardin') < texte.indexOf('Caméra porte') && texte.includes('Indisponible') && texte.includes('Pas de monoxyde'), texte);
  assert.ok(texte.includes('Signal ') && !texte.includes('pile'), 'le dernier signal ; une caméra n’a pas de pile — la sous-ligne la tait');
  // ASSERTION AJOUTÉE (passe bis du 17/10, point 9) : « Signal il y a 3 min », la minuscule au milieu de la phrase — plus « Signal Il y a ».
  assert.match(texte, /Signal il y a \d+ (min|h|j)/);
  assert.ok(!texte.includes('Signal Il y a'));
  assert.equal(m.trouver(e => e.type === J.BandeJour).length, 0, 'pas de bande du jour : un détecteur ne raconte pas sa journée');
  m.appuyer(rangees[1]);
  assert.deepEqual(ouverts, ['binary_sensor.camera_porte_co'], 'une rangée ouvre la fiche de son binaire');
  // Au calme : « Rien à signaler », « Les 2 détecteurs répondent » ; un qui sonne : son mot, en tête.
  const calme = monter(FG.Securite, { ids, S: fx.states, noms, briques: F.BRIQUES_GROUPE, journee: null, onMembre: () => {} }).trouver(e => e.props && e.props.mot !== undefined)[0];
  assert.deepEqual([calme.props.mot, calme.props.phrase], ['Rien à signaler', 'Les 2 détecteurs répondent']);
  const sonne = monter(FG.Securite, { ids, S: etat(fx, 'binary_sensor.camera_porte_co', 'on'), noms, briques: F.BRIQUES_GROUPE, journee: null, onMembre: () => {} }).trouver(e => e.props && e.props.mot !== undefined)[0];
  // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4, et sa relecture) : « Monoxyde détecté » ; l'historique non lu, l'heure se tait.
  assert.deepEqual([sonne.props.mot, sonne.props.phrase, sonne.props.v.ton], ['Monoxyde détecté', 'Caméra porte', 'bad']);
  // L'en-tête de la popup : « 2 détecteurs », la plaque de la carte.
  const p = monter(FG.default, { groupe: 'securite', nom: 'Sécurité', ids, hass: { states: S }, noms, pieces: new Map(), briques: F.BRIQUES_GROUPE, onMembre: () => {} });
  const entete = p.trouver(e => e.props && e.props.sousNom !== undefined)[0];
  assert.deepEqual([entete.props.sousNom, entete.props.plaque.icone, entete.props.plaque.encre], ['2 détecteurs', 'shield-exclamation', 'var(--o-warn)']);
});

/* ── Passe bis du 17/10 ── */

/* TEST AJOUTÉ (passe bis, point 4) : « depuis » suit l'historique du jour, qui fait foi (§ 9). LU et sans changement aujourd'hui — fermée depuis
 * hier —, l'heure se TAIT : la rangée disait « Fermée depuis 23:48 » sous une bande « fermée toute la journée », et 23:48 était l'heure du
 * redémarrage de Home Assistant (`last_changed`, ADR 0031). Un membre que l'historique ignore, ou un historique pas encore lu : `last_changed`,
 * comme la carte. Une ouverte depuis hier : la phrase dit son nom, sans heure ; un détecteur muet depuis hier aussi. */
test('passe bis, point 4 : l’historique lu sans changement du jour tait l’heure — plus de « Fermée depuis » à l’heure du redémarrage', async () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const minuit = J.minuitDe(Date.now());
  // Home Assistant a redémarré après minuit, à 00:48 — ou il y a une minute si le test tourne plus tôt : jamais dans l'avenir (relTime l'écrirait en heure).
  const tRed = Math.min(minuit + 48 * 60000, Date.now() - 60000);
  const redemarrage = new Date(tRed).toISOString();
  const hRed = new Date(tRed).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const ids = G.membresGroupes(fx.states, ctx).ouvertures;
  // Tout fermé sauf la baie, ouverte depuis HIER ; chaque état porte l'heure du redémarrage.
  const S = Object.fromEntries(Object.entries(fx.states).map(([id, st]) => [id, ids.includes(id) ? { ...st, state: id === 'binary_sensor.baie_vitree' ? 'on' : 'off', last_changed: redemarrage } : st]));
  const noms = G.nomsMembres(ids, S, ctx);
  const pieces = new Map(ids.map(id => [id, ctx.piece(id)]));
  // L'historique du jour, lu : la porte d'entrée et la baie n'ont pas changé depuis minuit ; la fenêtre s'est fermée à 9 h ; le garage avant n'y est pas.
  const journee = { debut: minuit, etats: {
    'binary_sensor.porte_entree': [{ t: minuit - 3600000, s: 'off' }],
    'binary_sensor.baie_vitree': [{ t: minuit - 7200000, s: 'on' }],
    'binary_sensor.fenetre_chambre': [{ t: minuit, s: 'on' }, { t: minuit + 9 * 3600000, s: 'off' }],
    'binary_sensor.garage_arriere': [{ t: minuit, s: 'off' }],
  } };
  const h9 = new Date(minuit + 9 * 3600000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const hass = { states: S, callWS: () => Promise.resolve({}) };
  const m = monter(FG.Ouvertures, { ids, S, noms, pieces, briques: F.BRIQUES_GROUPE, journee, maintenant: minuit + 22 * 3600000, hass, onMembre: () => {} });
  const texte = m.texte();
  const corps = m.trouver(e => e.props && e.props.mot !== undefined)[0];
  assert.deepEqual([corps.props.mot, corps.props.phrase], ['1 ouverte', 'Contact baie vitrée'], 'ouverte depuis hier : le nom, sans heure');
  assert.ok(texte.includes('Contact baie vitréeOuverte') && !texte.includes('Contact baie vitréeOuverte depuis'), 'ouverte depuis hier : « Ouverte », l’heure tue — ' + texte);
  assert.ok(texte.includes('Contact porte entréeFermée') && !texte.includes('Contact porte entréeFermée depuis'), 'fermée depuis hier : « Fermée », l’heure tue — ' + texte);
  assert.ok(texte.includes('ChambreFermée depuis ' + h9), 'fermée ce matin : l’heure de l’historique (la fenêtre, seule dans sa pièce, se nomme « Chambre »)');
  // ASSERTION MODIFIÉE (relecture du lot 4 de l’audit des capteurs) : un membre que l'historique ignore se tait aussi — `last_changed` serait l'heure du redémarrage.
  assert.ok(texte.includes('Contact garage avantFermée') && !texte.includes('Contact garage avantFermée depuis'), 'un membre que l’historique ignore : l’heure tue');
  assert.equal(m.trouver(e => e.type === J.BandeJour && e.props.resume === 'fermée toute la journée').length, 2, 'la porte d’entrée et le garage arrière : « fermée toute la journée », sans heure au-dessus');
  assert.equal(m.trouver(e => e.type === J.BandeJour).length, 4, 'le garage avant, que l’historique ignore : pas de bande devinée');
  m.demonter();
  // ASSERTION MODIFIÉE (relecture du lot 4 de l’audit des capteurs) : l'historique pas encore lu — l'heure se tait, et arrive avec la lecture.
  const m0 = monter(FG.Ouvertures, { ids, S, noms, pieces, briques: F.BRIQUES_GROUPE, journee: null, maintenant: minuit + 22 * 3600000, hass, onMembre: () => {} });
  assert.ok(m0.texte().includes('Contact porte entréeFermée') && !m0.texte().includes('Contact porte entréeFermée depuis'), 'non lu : l’heure tue');
  m0.demonter();
  // Sécurité : un détecteur muet depuis hier — la phrase dit son nom, sans heure ; une rangée sans « Sans nouvelles depuis ».
  const idsS = G.membresGroupes(fx.states, ctx).securite;
  const SS = { ...fx.states, 'binary_sensor.camera_jardin_co': { ...fx.states['binary_sensor.camera_jardin_co'], state: 'unavailable', last_changed: redemarrage } };
  const ms = monter(FG.Securite, { ids: idsS, S: SS, noms: G.nomsMembres(idsS, SS, ctx), briques: F.BRIQUES_GROUPE, journee: { debut: minuit, etats: { 'binary_sensor.camera_jardin_co': [{ t: minuit - 60000, s: 'unavailable' }] } }, onMembre: () => {} });
  assert.deepEqual([ms.trouver(e => e.props && e.props.mot !== undefined)[0].props.mot, ms.trouver(e => e.props && e.props.mot !== undefined)[0].props.phrase], ['1 détecteur muet', 'Caméra jardin']);
  assert.ok(!ms.texte().includes('depuis ' + hRed), 'muet depuis hier : pas d’heure — ' + ms.texte());
  ms.demonter();
  // Présence : un radar vide depuis hier — « Vide », sans « Personne depuis ».
  const idsP = G.membresGroupes(fx.states, ctx).presence;
  const SP = { ...fx.states, 'binary_sensor.camera_porte_sonnette': { ...fx.states['binary_sensor.camera_porte_sonnette'], last_changed: redemarrage } };
  const mp = monter(FG.Presence, { ids: idsP, S: SP, noms: G.nomsMembres(idsP, SP, ctx), briques: F.BRIQUES_GROUPE, journee: { debut: minuit, etats: { 'binary_sensor.camera_porte_sonnette': [{ t: minuit - 60000, s: 'off' }] } }, maintenant: minuit + 22 * 3600000, onMembre: () => {} });
  assert.ok(mp.texte().includes('Vide') && !mp.texte().includes('Personne depuis'), mp.texte());
  mp.demonter();
});

/* TEST AJOUTÉ (passe bis, point 9) : « Pensez à les fermer avant de dormir. » quand plusieurs sont ouvertes — l'accord au pluriel, dans les sept langues. */
test('passe bis, point 9 : deux ouvertes la nuit — « Pensez à les fermer avant de dormir. »', async () => {
  const fx = maisonGroupes();
  const deux = { ...fx, states: etat({ states: etat(fx, 'binary_sensor.garage_avant', 'on') }, 'binary_sensor.baie_vitree', 'on') };
  const p = popup(deux, { coupes: {} });
  const m = monter(FG.Ouvertures, { ids: p.ids, S: p.hass.states, noms: p.noms, pieces: p.pieces, briques: F.BRIQUES_GROUPE, journee: p.journee, maintenant: p.minuit + 22 * 3600000, hass: p.hass, onMembre: () => {} });
  await new Promise(r => setTimeout(r, 0));
  m.rendre();
  const corps = m.trouver(e => e.props && e.props.mot !== undefined)[0];
  assert.deepEqual([corps.props.mot, corps.props.conseils], ['2 ouvertes', ['Pensez à les fermer avant de dormir.']]);
  m.demonter();
  for (const code of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = (await import('../src/langues/' + code + '.js')).default;
    assert.ok(typeof cat['Pensez à les fermer avant de dormir.'] === 'string' && cat['Pensez à les fermer avant de dormir.'] !== cat['Pensez à la fermer avant de dormir.'], code + ' : le pluriel a ses mots');
  }
});

/* TEST AJOUTÉ (passe bis, point 7) : la bande du jour est faite de `span` mis en bloc — les rangées des popups sont des boutons, qui n'admettent que du
 * contenu en ligne ; des `div` y faisaient du HTML invalide. */
test('passe bis, point 7 : la bande du jour ne pose aucun div dans un bouton', () => {
  const bande = renderToStaticMarkup(createElement(J.BandeJour, { bandes: [{ a: 10, b: 20 }], resume: 'ouverte une fois aujourd’hui' }));
  assert.ok(!bande.includes('<div') && bande.includes('data-bande=""') && bande.includes('ouverte une fois aujourd’hui'), bande);
  assert.ok(bande.startsWith('<span style="display:block;'), 'un bloc, par le style');
  const FGS = readFileSync(new URL('../src/fichegroupe.jsx', import.meta.url), 'utf8');
  const rangee = FGS.slice(FGS.indexOf('<button key={id}'), FGS.indexOf('</button>'));
  assert.ok(!rangee.includes('<div'), 'ni dans la rangée elle-même');
});
