/* La carte Piles, sa popup et la seule règle des piles (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32, C33, § 8, § 19.8).
 *
 * Ce qui est garanti ici :
 *  - qui est une pile (piles.js, pur) : les piles de `pilesMaison`, plus le binaire « pile faible » d'un appareil sans pile chiffrée ;
 *    moins les batteries rechargeables (un appareil qui porte un aspirateur, une tondeuse ou un `battery_charging`), moins la batterie
 *    de la maison (le rôle `batSoc` d'Énergie) ; le nom de l'appareil ; la liste de la vue Énergie ne change pas ;
 *  - la vue : « {k} piles à changer » en ambre, en rouge au critique, le chiffre et « ≤ 15 % » ; sinon « {k} piles sans nouvelles » ;
 *    sinon « {n} piles · la plus basse à {p} % » en neutre — jamais « Tout va bien » ; les puces ; l'ordre de la popup ;
 *  - UN seul seuil (§ 19.8) : celui de la veille des piles, 15 % par défaut, relu avec les veilles (`reglerSeuilPile`) ; critique à 5 % ;
 *    `niveauPile`, `couleurPile`, `glyphePile` le suivent — le coin d'un capteur, la rangée Pile des fiches, la fiche d'une mesure ;
 *  - la carte (la carte des groupes), sa compacte, la fabrique et la coquille (L'appareil par-dessus) ;
 *  - Objets : une carte `groupe:piles` pour toutes, dans Plantes et piles après les plantes ; la section juge (C33) ;
 *  - la popup : les rangées dans l'ordre, la pièce, « sans nouvelles depuis sam. 14:05 », une rangée ouvre l'appareil, la note du seuil ;
 *  - la démo : « 3 piles à changer », la batterie de la maison et la tondeuse écartées, la pile du Schefflera muette.
 * `RoomPilesCard`, `FicheGroupe`, `PileRepere`, `RangeePile`, `jugerObjet` et `objetsDeLaMaison` vivent dans App.jsx : sous `?piles`, un
 * crochet de chargement leur ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { indexOf } from './fixtures.mjs';
import { monter } from './crochets.mjs';
import { maisonPiles, maisonPlantes, ctxDe, fusion } from './maison_capteurs.mjs';
import { pilesMaison, pilesDeLaMaison, vuePiles, glyphePile } from '../src/piles.js';
import { SEUILS_PILE, seuilsPile, reglerSeuilPile, oublierSeuilPile, niveauPile, couleurPile } from '../src/attention.js';
import { VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?piles')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?piles'.length), ctx);",
  // Passe bis (17/10, point 2) : `deriveNotifs`, pour que l'Accueil et la carte Piles soient jugés côte à côte.
  "  return { ...r, source: String(r.source) + ';export { RoomPilesCard, FicheGroupe, PileRepere, RangeePile, jugerObjet, objetsDeLaMaison, estDehors, vueMesure, deriveNotifs };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?piles', import.meta.url).href);
const CS = await import('../src/capteurssections.jsx');
const FG = await import('../src/fichegroupe.jsx');
const { maisonCapteursDemo } = await import('../src/demo.js');
const { registresDuComposant } = await import('../src/discovery.js');
const APP = (readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8') + VUES_SORTIES);
const FC = readFileSync(new URL('../src/fichecapteur.jsx', import.meta.url), 'utf8');

const PIECES = ['Entrée', 'Chambre', 'Salon', 'Cuisine', 'Bureau', 'Séjour'];
const BATTERIE = 'sensor.batterie_niveau';
const SEUILS = { alerte: 15, danger: 5 };
const avec = (fx, f) => {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: PIECES.map(room => ({ room })), loggia_energyHaids: { batSoc: BATTERIE }, loggia_plants: [] }, resolved: null });
  try { return f(fx.states, ctxDe(fx, PIECES)); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
};
const ORDRE = ['sensor.porte_entree_pile', 'sensor.fenetre_chambre_pile', 'sensor.bouton_salon_pile', 'binary_sensor.sonnette_pile_faible', 'sensor.fumee_cuisine_pile', 'sensor.telecommande_pile'];

test('C32, § 8 : qui est une pile — celles de pilesMaison et le binaire « pile faible » ; ni les rechargeables, ni la batterie de la maison, ni un téléphone ; le nom de l’appareil ; la liste d’Énergie ne change pas', () => {
  const fx = maisonPiles();
  const ctx = ctxDe(fx, PIECES);
  const piles = pilesDeLaMaison(fx.states, ctx, { exclure: [BATTERIE] });
  assert.deepEqual(piles.map(p => p.id), ['sensor.porte_entree_pile', 'sensor.fenetre_chambre_pile', 'sensor.bouton_salon_pile', 'sensor.fumee_cuisine_pile', 'sensor.telecommande_pile', 'binary_sensor.sonnette_pile_faible'],
    'la plus basse d’abord, la muette, puis le binaire ; l’aspirateur, la tondeuse en charge, le téléphone et la batterie de la maison restent dehors');
  assert.deepEqual(piles.map(p => p.nom), ['Contact porte entrée', 'Contact fenêtre chambre', 'Bouton salon', 'Détecteur de fumée cuisine', 'Télécommande', 'Sonnette'], 'le nom de l’appareil');
  assert.deepEqual(piles.map(p => p.piece), ['Entrée', 'Chambre', 'Salon', 'Cuisine', 'Salon', 'Entrée']);
  assert.deepEqual(piles.map(p => [p.niveau, p.muette, p.binaire, p.allume]), [[9, false, false, false], [12, false, false, false], [14, false, false, false], [72, false, false, false], [null, true, false, false], [null, false, true, true]]);
  assert.ok(!piles.some(p => p.id === 'binary_sensor.porte_entree_pile_faible'), 'le binaire d’un appareil qui a une pile chiffrée ne compte pas deux fois');
  assert.deepEqual(pilesDeLaMaison(fx.states, ctx).map(p => p.id).includes(BATTERIE), true, 'sans exclusion, la batterie de la maison est une pile comme une autre : c’est l’écran qui l’écarte (le rôle batSoc)');
  // La vue Énergie garde sa liste (§ 8) : les rechargeables et la batterie de la maison y restent, pas le téléphone.
  const energie = pilesMaison(fx.states, ctx.meta).map(p => p.id);
  assert.ok(energie.includes('sensor.aspirateur_pile') && energie.includes('sensor.tondeuse_pile') && energie.includes(BATTERIE) && !energie.includes('sensor.telephone_pile'));
  assert.deepEqual(pilesDeLaMaison(null, ctx), []);
});

test('C32 : la vue — « {k} piles à changer » au seuil, en rouge au critique, le chiffre et « ≤ 15 % » ; sinon les muettes ; sinon la plus basse, en neutre — jamais « Tout va bien »', () => {
  const fx = maisonPiles();
  const piles = pilesDeLaMaison(fx.states, ctxDe(fx, PIECES), { exclure: [BATTERIE] });
  const v = vuePiles(piles, SEUILS);
  assert.deepEqual([v.phrase, v.ton, v.glyphe, v.chiffre, v.legende, v.regarder], ['4 piles à changer', 'warn', 'battery-quarter', '4', '≤\u00a015\u00a0%', true]);
  assert.deepEqual(v.ordre.map(p => p.id), ORDRE, 'la popup : à changer, puis ce qui tient, puis les muettes');
  assert.deepEqual(v.puces, [
    { t: 'Contact porte entrée · 9\u00a0%', glyphe: 'battery-empty', ton: 'warn' }, { t: 'Contact fenêtre chambre · 12\u00a0%', glyphe: 'battery-quarter', ton: 'warn' },
    { t: 'Bouton salon · 14\u00a0%', glyphe: 'battery-quarter', ton: 'warn' }, { t: 'Sonnette · faible', glyphe: 'battery-empty', ton: 'warn' },
    { t: 'Télécommande · muette', glyphe: 'battery-empty', ton: 'warn' },
  ]);
  const critique = vuePiles(piles.map(p => (p.id === 'sensor.porte_entree_pile' ? { ...p, niveau: 4 } : p)), SEUILS);
  assert.deepEqual([critique.ton, critique.puces[0].ton], ['bad', 'bad'], 'une pile à 5 % ou moins : rouge');
  assert.equal(vuePiles(piles, { alerte: 10, danger: 5 }).phrase, '2 piles à changer', 'le seuil fait le compte : la porte et la sonnette');
  const sans = piles.filter(p => p.niveau == null ? p.muette : p.niveau > 15);
  const muette = vuePiles(sans, SEUILS);
  assert.deepEqual([muette.phrase, muette.ton, muette.chiffre, muette.regarder, muette.puces], ['1 pile sans nouvelles', 'warn', null, true, [{ t: 'Télécommande · muette', glyphe: 'battery-empty', ton: 'warn' }]]);
  const calme = vuePiles([{ id: 'a', niveau: 64, nom: 'Détecteur' }, { id: 'b', niveau: 90, nom: 'Bouton' }], SEUILS);
  assert.deepEqual([calme.phrase, calme.ton, calme.chiffre, calme.legende, calme.regarder, calme.puces], ['2 piles · la plus basse à 64 %', null, null, null, false, [{ t: 'Détecteur · 64\u00a0%', glyphe: 'battery-three-quarters', ton: null }]]);
  assert.equal(vuePiles([{ id: 'a', niveau: 64, nom: 'Détecteur' }], SEUILS).phrase, '1 pile · 64 %');
  assert.equal(vuePiles([{ id: 'a', niveau: null, binaire: true, allume: false, nom: 'Sonnette' }], SEUILS).phrase, '1 pile', 'un binaire éteint seul : rien de plus à dire');
  for (const x of [v, muette, calme]) assert.ok(!JSON.stringify(x).includes('Tout va bien'));
});

test('§ 19.8 : UN seul seuil — celui de la veille des piles, 15 % par défaut, relu avec les veilles ; critique à 5 % ; niveauPile, couleurPile et glyphePile le suivent', () => {
  assert.deepEqual(SEUILS_PILE, { alerte: 15, danger: 5 });
  assert.deepEqual(seuilsPile(), { alerte: 15, danger: 5 });
  assert.deepEqual([niveauPile(16), niveauPile(15), niveauPile('14'), niveauPile(6), niveauPile(5), niveauPile(0), niveauPile(null)], [null, 'alerte', 'alerte', 'alerte', 'danger', 'danger', null]);
  try {
    assert.deepEqual(reglerSeuilPile({ config: { batterie: { actif: true, seuil: 25 } } }), { alerte: 25, danger: 5 }, 'le réglage de Règles › Veilles');
    assert.deepEqual([niveauPile(20), niveauPile(26)], ['alerte', null]);
    assert.equal(vuePiles([{ id: 'a', niveau: 20, nom: 'Bouton' }]).phrase, '1 pile à changer', 'la vue suit le seuil réglé');
    assert.equal(couleurPile(20), 'var(--o-warn)');
    /* ASSERTION MODIFIÉE (passe bis du 17/10, point 2) : une réponse vide ou illisible — la veille pas encore reçue, un seuil hors de 1 à 99 —
     * GARDE le dernier seuil connu. Avant, elle le remettait au défaut : chaque montage d'une carte repassait à 15 % le temps que la veille réponde. */
    for (const mauvais of [{ config: { batterie: { seuil: 0 } } }, { config: { batterie: { seuil: 'abc' } } }, { config: { batterie: { seuil: 150 } } }, null, {}]) {
      assert.deepEqual(reglerSeuilPile(mauvais), { alerte: 25, danger: 5 }, 'un seuil illisible ou absent : le dernier connu, jamais le défaut');
    }
    assert.deepEqual(reglerSeuilPile({ config: { batterie: { seuil: 30 } } }), { alerte: 30, danger: 5 }, 'un nouveau réglage, lui, se prend');
  } finally { oublierSeuilPile(); }
  assert.deepEqual(seuilsPile(), { alerte: 15, danger: 5 }, 'oublié : le défaut reprend (pour les tests)');
  assert.deepEqual([couleurPile(45), couleurPile(45, 'var(--o-text3)'), couleurPile(14), couleurPile(3), couleurPile(null)], ['var(--o-text2)', 'var(--o-text3)', 'var(--o-warn)', 'var(--o-bad)', 'var(--o-text3)']);
  assert.deepEqual([5, 12, 37, 62, 87, null].map(glyphePile), ['battery-empty', 'battery-quarter', 'battery-half', 'battery-three-quarters', 'battery-full', 'battery-empty']);
});

test('la carte Piles : la carte des groupes — la plaque, le nom, la phrase, le chiffre et « ≤ 15 % », les puces, le lavis ambre ; la compacte ; la surface dit ce qu’elle affiche', () => avec(maisonPiles(), (S) => {
  const html = (props) => renderToStaticMarkup(createElement(F.RoomPilesCard, { hass: { states: S }, onOpen: () => {}, ...props }));
  const c = html({});
  assert.ok(c.includes('class="o-rmcard o-gabarit"') && c.includes('data-groupe="piles"') && c.includes('>Piles<') && c.includes('>4 piles à changer<'), c.slice(0, 300));
  assert.ok(c.includes('fi-rr-battery-quarter') && c.includes('class="o-gab-chiffre o-seul-etroit"') && c.includes('>4<') && c.includes('>≤\u00a015\u00a0%<'), 'le chiffre et sa légende');
  assert.ok(c.includes('Contact porte entrée · 9\u00a0%') && c.includes('linear-gradient(180deg,rgba(var(--o-warn-rgb),0.08)'), 'les puces, le lavis ambre');
  assert.ok(c.includes('aria-label="Piles, 4 piles à changer, Contact porte entrée · 9 %, Contact fenêtre chambre · 12 %, Bouton salon · 14 %, Sonnette · faible, Télécommande · muette"'), 'la surface dit ce que la carte affiche');
  const compacte = html({ chip: true });
  assert.ok(compacte.includes('class="o-piece o-cvdense"') && compacte.includes('4 piles à changer') && compacte.includes('>4<') && !compacte.includes('data-puces'));
  const calme = { ...S, 'sensor.porte_entree_pile': { ...S['sensor.porte_entree_pile'], state: '90' }, 'sensor.fenetre_chambre_pile': { ...S['sensor.fenetre_chambre_pile'], state: '91' },
    'sensor.bouton_salon_pile': { ...S['sensor.bouton_salon_pile'], state: '92' }, 'binary_sensor.sonnette_pile_faible': { ...S['binary_sensor.sonnette_pile_faible'], state: 'off' }, 'sensor.telecommande_pile': { ...S['sensor.telecommande_pile'], state: '50' } };
  const rien = html({ hass: { states: calme } });
  assert.ok(rien.includes('>6 piles · la plus basse à 50 %<') && !rien.includes('linear-gradient(180deg,rgba(') && !rien.includes('o-gab-chiffre') && !rien.includes('Tout va bien'), 'au calme : un fait, en neutre, sans chiffre');
}));

test('C32, C33 : Objets — une carte pour toutes les piles, dans Plantes et piles après les plantes ; la section juge ; la fabrique et la coquille', () => avec(fusion(maisonPlantes(), maisonPiles()), (S) => {
  const objets = F.objetsDeLaMaison({ states: S }, [], new Set());
  const piles = objets.find(o => o.cle === 'groupe:piles');
  assert.deepEqual([piles.type, piles.domaine, piles.nom, piles.filtres, piles.membres.length, piles.actifsMembres, piles.muetsMembres], ['groupe', 'groupe', 'Piles', ['capteurs'], 8, 0, 1], 'les piles des plantes en font partie ; une muette compte parmi les absentes');
  assert.ok(!objets.some(o => o.id && (/_pile$|_battery$/.test(o.id) || o.id === 'binary_sensor.sonnette_pile_faible')), 'aucune carte de pile seule');
  const sections = (etats, liste = objets.filter(o => o.filtres[0] === 'capteurs')) => CS.sectionsCapteurs(liste, { S: etats, dehors: F.estDehors, lire: (id) => F.vueMesure({ states: etats }, id), juger: (o) => F.jugerObjet({ states: etats }, o) });
  const section = sections(S).find(x => x.id === 'plantes');
  assert.deepEqual(section.objets.map(o => o.cle), ['plant:sensor.ficus', 'plant:sensor.capteur_plante_7f3e', 'plant:sensor.orchidee', 'groupe:piles'], 'les plantes, puis Piles');
  assert.deepEqual([section.titre, section.regarder, section.statut], ['Plantes et piles', 3, true], 'le Ficus et le Monstera pressent, Piles a des piles à changer : « 3 à regarder »');
  assert.equal(F.jugerObjet({ states: S }, piles), 'regarder');
  const calme = { ...S, 'sensor.porte_entree_pile': { ...S['sensor.porte_entree_pile'], state: '90' }, 'sensor.fenetre_chambre_pile': { ...S['sensor.fenetre_chambre_pile'], state: '91' },
    'sensor.bouton_salon_pile': { ...S['sensor.bouton_salon_pile'], state: '92' }, 'binary_sensor.sonnette_pile_faible': { ...S['binary_sensor.sonnette_pile_faible'], state: 'off' },
    'sensor.telecommande_pile': { ...S['sensor.telecommande_pile'], state: '50' }, 'sensor.capteur_plante_7f3e_battery': { ...S['sensor.capteur_plante_7f3e_battery'], state: '80' } };
  assert.equal(F.jugerObjet({ states: calme }, piles), 'bonne', 'tout tient : jugée bonne');
  assert.equal(F.nomDeCle ? F.nomDeCle(S, 'groupe:piles') : 'Piles', 'Piles');
  const d = APP.indexOf('\nfunction useDomainCards(');
  const dc = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(dc.includes("if (k === 'groupe:piles') return <RoomPilesCard hass={hass} onOpen={() => setGroupePop('piles')} label={label} chip={chip} />;"), 'la fabrique pose la carte, avant les autres groupes');
  const f = APP.indexOf('\nfunction FicheGroupe(');
  const coquille = APP.slice(f, APP.indexOf('\n}\n', f));
  assert.ok(coquille.includes("piles={piles ? pilesDeLaMaisonCarte(S) : null}") && coquille.includes("{membre && (piles ? <FicheAppareil id={membre} hass={H} onClose={() => setMembre(null)} /> : membre.indexOf('sensor.') === 0 ? <FicheCapteur id={membre} hass={H} onClose={() => setMembre(null)} /> : <FicheBinaire id={membre} hass={H} onClose={() => setMembre(null)} />)}"), 'la coquille : la liste des piles, et L’appareil par-dessus'); // ASSERTION MODIFIÉE (relecture du lot 3) : un monoxyde chiffré ouvre la fiche d'une mesure.
  /* ASSERTIONS MODIFIÉES (passe bis du 17/10, point 2) : le seuil se relit UNE fois, à la racine (`App`), avec les veilles — plus depuis la carte,
   * la section ni la popup, qui le laissaient au défaut à l'Accueil tant qu'on n'avait pas ouvert Objets › Capteurs. */
  const v = APP.indexOf('\nfunction SectionsCapteursVive(');
  assert.ok(!APP.slice(v, APP.indexOf('\n}\n', v)).includes('useSeuilPile('), 'la section ne règle plus le seuil');
  const r = APP.indexOf('\nfunction RoomPilesCard(');
  assert.ok(APP.slice(r, APP.indexOf('\n}\n', r)).includes('useHass(piles.map(p => p.id))') && !APP.slice(r, APP.indexOf('\n}\n', r)).includes('useSeuilPile('), 'la carte s’abonne à ses piles ; le seuil n’est pas le sien');
  const a = APP.indexOf('\nexport default function App(');
  const racine = APP.slice(a, APP.indexOf('\n}\n', a));
  assert.ok(racine.includes('const hass = useHass(haKeys, noisyKeys);') && racine.indexOf('useSeuilPile(hass);') > racine.indexOf('const hass = useHass(haKeys, noisyKeys);'), 'la racine relit le seuil, après son relevé');
  assert.equal(APP.split('useSeuilPile(').length - 1, 2, 'la définition, et UN appel : celui de la racine');
  const FGS = readFileSync(new URL('../src/fichegroupe.jsx', import.meta.url), 'utf8');
  assert.ok(!FGS.includes('reglerSeuilPile') && !FGS.includes('loggia/veilles/etat') && FGS.includes('const seuils = seuilsPile();'), 'la popup lit le seuil en vigueur, sans le régler ni relire les veilles');
}));

/* TEST AJOUTÉ (passe bis du 17/10, point 2) : UN seuil, § 19.8 — l'Accueil (« En ce moment », `deriveNotifs`) et la carte Piles jugent la même pile de
 * la même façon, sans visite préalable d'Objets › Capteurs. La racine a relu la veille à 25 % ; une pile à 20 % est à changer partout — y compris sur une
 * carte rendue SANS serveur (pas de `callWS`), qui remettait le seuil au défaut et disait « tient ». */
test('passe bis, point 2 : la racine règle le seuil une fois ; l’Accueil et la carte Piles jugent la même pile de la même façon', () => avec(maisonPiles(), (S) => {
  const etats = { ...S, 'sensor.fumee_cuisine_pile': { ...S['sensor.fumee_cuisine_pile'], state: '20' } };
  try {
    reglerSeuilPile({ config: { batterie: { actif: true, seuil: 25 } } });
    const notifs = F.deriveNotifs({ states: etats }).filter(n => n.k.indexOf('pile:') === 0).map(n => n.k.slice(5));
    assert.ok(notifs.includes('sensor.fumee_cuisine_pile'), 'l’Accueil : la fumée à 20 % est une pile faible au seuil de la veille — ' + notifs.join(', '));
    const carte = renderToStaticMarkup(createElement(F.RoomPilesCard, { hass: { states: etats }, onOpen: () => {} }));
    assert.ok(carte.includes('>5 piles à changer<'), 'la carte Piles, sans serveur : le même seuil — ' + carte.slice(0, 200));
    assert.ok(/aria-label="Piles, 5 piles à changer, [^"]*Détecteur de fumée cuisine · 20 %/.test(carte), 'et la fumée parmi ses puces (la surface les dit toutes)');
    const piles = pilesDeLaMaison(etats, ctxDe(maisonPiles(), PIECES), { exclure: [BATTERIE] });
    const popup = monter(FG.Piles, { piles, S: etats, pieces: new Map(), maintenant: Date.now(), onMembre: () => {} });
    assert.equal(popup.trouver(e => e.props && e.props.mot !== undefined)[0].props.mot, '5 piles à changer', 'la popup aussi');
    assert.ok(popup.trouver(e => e.props && e.props.mot !== undefined)[0].props.note.includes('sous 25 %'), 'et sa note dit le seuil relu');
    popup.demonter();
    // Au défaut (la veille pas encore lue, ou jamais : la démo), la même pile tient — partout.
    oublierSeuilPile();
    assert.ok(!F.deriveNotifs({ states: etats }).some(n => n.k === 'pile:sensor.fumee_cuisine_pile'));
    assert.ok(renderToStaticMarkup(createElement(F.RoomPilesCard, { hass: { states: etats }, onOpen: () => {} })).includes('>4 piles à changer<'));
  } finally { oublierSeuilPile(); }
}));

test('§ 8 : la popup — les rangées dans l’ordre, la pièce, « sans nouvelles depuis sam. 14:05 », une rangée ouvre l’appareil ; la note du seuil ; l’en-tête', () => {
  const fx = maisonPiles();
  const t = new Date(2026, 9, 15, 20, 40).getTime();
  const samedi = new Date(2026, 9, 10, 14, 5).toISOString();
  const S = { ...fx.states, 'sensor.telecommande_pile': { ...fx.states['sensor.telecommande_pile'], last_changed: samedi } };
  const ctx = ctxDe(fx, PIECES);
  const piles = pilesDeLaMaison(S, ctx, { exclure: [BATTERIE] });
  const pieces = new Map(piles.map(p => [p.id, p.piece]));
  const ouverts = [];
  const m = monter(FG.Piles, { piles, S, pieces, hass: { states: S }, maintenant: t, onMembre: (id) => ouverts.push(id) });
  const texte = m.texte();
  // Le panneau du haut (`Corps`, un composant : ses mots sont dans ses propriétés) : le mot, la phrase, la note.
  const corps = m.trouver(e => e.props && e.props.mot !== undefined)[0];
  assert.deepEqual([corps.props.mot, corps.props.phrase, corps.props.v.ton], ['4 piles à changer', 'Contact porte entrée, 9 %', 'warn']);
  assert.equal(corps.props.note, 'Une pile est à changer sous 15 % — le seuil de la veille des piles (Règles › Veilles) ; critique à 5 %.', 'la note dit la règle');
  const rangees = m.trouver(e => e.type === 'button');
  assert.deepEqual(rangees.map(b => b.key), ORDRE, 'à changer, puis ce qui tient, puis la muette');
  // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4) : une pile binaire dit les mots de la table des binaires, « Pile faible », comme sa carte.
  assert.ok(texte.includes('Contact porte entréeEntrée9\u00a0%') && texte.includes('SonnetteEntréePile faible') && texte.includes('Détecteur de fumée cuisineCuisine72\u00a0%'), texte);
  assert.ok(texte.includes('TélécommandeSalon · sans nouvelles depuis sam. 14:05Indisponible'), 'la muette, à la fin, et depuis quand');
  m.appuyer(rangees[0]);
  assert.deepEqual(ouverts, ['sensor.porte_entree_pile'], 'une rangée ouvre l’appareil, par sa pile');
  assert.equal(m.trouver(e => e.props && e.props['data-plage'] !== undefined).length, 0);
  m.demonter();
  // L'en-tête de la popup, par la coquille : la plaque de la carte, « 6 piles » ; pas de journée lue pour des piles.
  const entete = monter(FG.default, { groupe: 'piles', nom: 'Piles', ids: piles.map(p => p.id), hass: { states: S }, noms: new Map(), pieces, briques: {}, onMembre: () => {}, piles, maintenant: t });
  const e = entete.trouver(x => x.props && x.props.sousNom !== undefined)[0];
  assert.deepEqual([e.props.nom, e.props.sousNom, e.props.plaque.icone, e.props.plaque.encre], ['Piles', '6 piles', 'battery-quarter', 'var(--o-warn)']);
  assert.equal(entete.trouver(x => x.type === FG.Piles).length, 1, 'le contenu Piles, et lui seul');
  entete.demonter();
});

test('C32 : une seule règle — le coin d’un capteur, la rangée Pile des fiches et la fiche d’une mesure prennent couleurPile ; plus de « 20 / 50 » en dur', () => {
  const p = APP.indexOf('\nfunction PileRepere(');
  const repere = APP.slice(p, APP.indexOf('\n}\n', p));
  assert.ok(repere.includes('const ico = glyphePile(n);') && repere.includes("const col = couleurPile(n, 'var(--o-text3)');"), 'le coin d’un capteur');
  assert.ok(APP.includes("const RangeePile = ({ n }) => (n == null ? null : <FicheRangee titre={tr('Pile')} desc={tr('Capteur sans fil')} droite={<FicheValeur couleur={couleurPile(n, 'var(--o-text)')}>{n} %</FicheValeur>} />);"), 'la rangée Pile');
  assert.ok(APP.includes("color: bat ? couleurPile(n, 'var(--o-text)') : 'var(--o-text)' }}>"), 'la valeur d’une pile dans la fiche universelle');
  assert.ok(!APP.includes("n < 20 ? 'var(--o-bad)'") && !APP.includes("n < 50 ? 'var(--o-warn)'") && !APP.includes('const SEUIL_PILE') && !APP.includes('const couleurPile =') && !APP.includes("device_class === 'battery' && n < 20"), 'plus de seconde règle dans App.jsx');
  assert.ok(APP.includes("import { pilesDeLaMaison as pilesCarte, vuePiles, glyphePile } from './piles.js';") /* ASSERTION MODIFIÉE (ADR 0274) : `pilesMaison` part avec la vue Énergie */ && APP.includes("import { pilesMaison } from '../piles.js';") && APP.includes('couleurPile, reglerSeuilPile,'), 'la règle vient d’attention.js et de piles.js');
  assert.equal(FC.split("color: couleurPile(pile, 'var(--o-text1)')").length - 1, 2, 'la rangée Pile des deux fiches de capteur');
  assert.ok(!FC.includes('pile < 20 ?'));
  const coin = (n) => renderToStaticMarkup(createElement(F.PileRepere, { n }));
  assert.ok(coin(45).includes('color:var(--o-text3)') && coin(45).includes('fi-rr-battery-half'), 'une pile à 45 % reste discrète');
  assert.ok(coin(14).includes('color:var(--o-warn)') && coin(14).includes('fi-rr-battery-quarter') && coin(4).includes('color:var(--o-bad)') && coin(4).includes('fi-rr-battery-empty'));
  const rangee = (n) => renderToStaticMarkup(createElement(F.RangeePile, { n }));
  assert.ok(rangee(45).includes('color:var(--o-text)') && rangee(12).includes('color:var(--o-warn)') && rangee(3).includes('color:var(--o-bad)'));
});

test('§ 12 : la démo — « 3 piles à changer » au seuil de la veille (15 %) ; la batterie de la maison et la tondeuse écartées ; la pile du Schefflera muette', async () => {
  const m = maisonCapteursDemo({ quand: new Date(2026, 9, 15, 20, 40).getTime() });
  assert.equal(m.states['sensor.fenetre_chambre_pile'].state, '12', 'la fenêtre de la chambre, sous le seuil de 15 %');
  // L'index de la démo, par le chemin de l'écran : le registre du composant, converti (discovery.js), puis bâti.
  const registres = await registresDuComposant({ callWS: async () => ({ index: m.index() }) });
  setLoggiaState({ index: indexOf({ ...registres, states: m.states }), ent: {}, cfg: { loggia_rooms: [{ room: 'Salon' }, { room: 'Entrée' }, { room: 'Chambre' }, { room: 'Cuisine' }], loggia_energyHaids: { batSoc: BATTERIE }, loggia_plants: [] }, resolved: null });
  try {
    const c = renderToStaticMarkup(createElement(F.RoomPilesCard, { hass: { states: m.states }, onOpen: () => {} }));
    assert.ok(c.includes('>3 piles à changer<') && c.includes('Contact porte entrée · 9\u00a0%') && c.includes('>3<'), c.slice(0, 400));
    const objets = F.objetsDeLaMaison({ states: m.states }, [], new Set());
    const piles = objets.find(o => o.cle === 'groupe:piles');
    assert.ok(piles && !piles.membres.includes(BATTERIE) && !piles.membres.some(id => id.indexOf('tondeuse') >= 0) && piles.membres.includes('sensor.schefflera_pile'), 'la batterie de la maison et la tondeuse dehors ; le Schefflera dedans, muet');
    assert.equal(piles.muetsMembres, 1);
  } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
});
