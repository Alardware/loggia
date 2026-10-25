// ─────────────────────────────────────────────────────────────────────────────
// « Observer sans agir » couvre le planning de chauffe (chantier Chauffage,
// plan 2, tâche 13, choix 16).
//
// L'essai chez lui commence par un ou deux jours d'observation : le moteur
// calcule et note au journal ce qu'il aurait fait, sans envoyer un ordre.
// L'interrupteur unique des Règles (ADR 0004) pose donc le drapeau du moteur
// avec ceux des quatre autres modules. Son nom à l'écran : « Planning de
// chauffe » — « Chauffage » nomme déjà la règle des fenêtres.
//
// Les trois fonctions que la vue appelle (la lecture, l'état de
// l'interrupteur, les écritures) sont REJOUÉES contre un faux Home Assistant,
// puis contre le faux moteur de la démo ; la vue n'est relue que pour
// vérifier qu'elle passe par elles. Et la règle du module MUET : un Home
// Assistant pas encore redémarré après la mise à jour ne connaît pas la
// commande du chauffage (`unknown_command`), un moteur absent répond
// `not_available` — le module ne compte alors ni dans l'interrupteur ni pour
// « tous », et la bascule ne lui écrit rien.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
await import('./rendu.mjs');   // les crochets `.jsx`, avant le premier import d'une vue
const P = await import('../src/views/parametres.jsx');
const { bilanEcritures } = await import('../src/refus.js');
const { lireEtatChauffage, reglerChauffageEtat } = await import('../src/chauffageetat.js');
const { lireEtatEnfant, reglerEnfantEtat } = await import('../src/enfantetat.js');
const { maisonChauffageDemo } = await import('../src/demo.js');

const PAR = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');

// Ce que Home Assistant et le composant répondent vraiment.
const INCONNUE = { code: 'unknown_command', message: 'Unknown command.' };
const SANS_MOTEUR = { code: 'not_available', message: 'chauffage indisponible' };
const NON_ADMIN = { code: 'unauthorized', message: 'Unauthorized' };
// Une coupure : la bibliothèque rejette le message entier, son code rangé sous `error`.
const COUPURE = { type: 'result', success: false, error: { code: 3, message: 'Connection lost' } };
const MAISON = (k) => `« ${k} » non enregistré — ce réglage appartient à la maison, et seul un administrateur Home Assistant peut le changer`;

/* Un faux Home Assistant : il garde chaque message reçu et répond par type —
 * la réponse, ou `{ rejet }`, rejeté comme Home Assistant le fait. Une
 * commande qu'il ne connaît pas : `unknown_command`. */
function faux(reponses) {
  const recus = [];
  return {
    recus,
    callWS(msg) {
      recus.push(msg);
      const r = Object.prototype.hasOwnProperty.call(reponses, msg.type) ? reponses[msg.type] : { rejet: INCONNUE };
      return r && r.rejet ? Promise.reject(r.rejet) : Promise.resolve(r);
    },
  };
}

/* Les quatre modules d'avant, tels que leurs commandes d'état répondent : le
 * drapeau dans `config` — un booléen nu pour la règle des fenêtres. */
const QUATRE = (actif) => ({
  'loggia/volets/etat': { config: { simulation: { actif } } },
  'loggia/fenetres/etat': { config: { simulation: actif } },
  'loggia/presence/etat': { config: { simulation: { actif } } },
  'loggia/nuit/etat': { config: { simulation: { actif } } },
});
// Leurs écritures, acceptées.
/* ASSERTION MODIFIÉE (chantier Mode enfant, tâche 5 ; E11) : le mode enfant est le SIXIÈME module de l'interrupteur — son drapeau à la
 * racine de son état, comme le planning de chauffe ; sa configuration le prend comme les autres, et rend l'état avec. */
const ENFANT = (simulation) => ({ maintenant: 1, demarre: true, simulation, profils: {}, lecteurs: {} });
const ECRITURES = {
  'loggia/volets/config': { config: {} }, 'loggia/fenetres/config': { config: {} },
  'loggia/presence/config': { config: {} }, 'loggia/nuit/config': { config: {} },
  'loggia/enfant/config': { config: { profils: {}, simulation: { actif: false } }, etat: ENFANT(false) },
};
// L'état du planning de chauffe (`async_etat`) : le drapeau à la RACINE, et pas de `config`.
const CHAUFFAGE = (simulation) => ({
  chauffages: [], maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' }, simulation,
});
const LES_CINQ = ['volets', 'fenetres', 'presence', 'nuit', 'chauffage'];
const LES_SIX = [...LES_CINQ, 'enfant'];
const LES_QUATRE = ['volets', 'fenetres', 'presence', 'nuit'];
const BUREAU = 'select.radiateur_bureau_fil_pilote';

test('le planning de chauffe et le mode enfant se lisent à la racine de leur état ; les quatre autres, dans leur configuration', async () => {
  const h = faux({ ...QUATRE(false), 'loggia/chauffage/etat': CHAUFFAGE(true), 'loggia/enfant/etat': ENFANT(false) });
  // ASSERTION MODIFIÉE (audit du 19/10, H3) : les veilles sont le septième module de l'interrupteur ; ce faux Home Assistant ne
  // connaît pas leur commande (`unknown_command`), elles sont donc muettes ici — `veilles: undefined`.
  assert.deepEqual(await P.lireObservation(h), { volets: false, fenetres: false, presence: false, nuit: false, chauffage: true, enfant: false, veilles: undefined });
  assert.deepEqual(h.recus.filter(m => m.type === 'loggia/chauffage/etat'), [{ type: 'loggia/chauffage/etat' }],
    'une lecture, sans champ en plus : le schéma de Home Assistant refuse tout autre champ');
  assert.deepEqual(h.recus.filter(m => m.type === 'loggia/enfant/etat'), [{ type: 'loggia/enfant/etat' }]);
  // Sa réponse n'a pas de `config` : un drapeau qui s'y trouverait n'est pas le sien.
  const h2 = faux({ ...QUATRE(true), 'loggia/chauffage/etat': { ...CHAUFFAGE(false), config: { simulation: { actif: true } } }, 'loggia/enfant/etat': ENFANT(true) });
  assert.deepEqual(await P.lireObservation(h2), { volets: true, fenetres: true, presence: true, nuit: true, chauffage: false, enfant: true, veilles: undefined });
});

test('la bascule écrit le patch exact du planning de chauffe et du mode enfant, sous leurs clés loggia_chauffage et loggia_enfant', async () => {
  reglerChauffageEtat();
  reglerEnfantEtat({ hass: { callWS: () => new Promise(() => {}) } });
  const h = faux({ ...ECRITURES, 'loggia/chauffage/config': { config: { simulation: { actif: true } }, etat: CHAUFFAGE(true) },
    'loggia/enfant/config': { config: { profils: {}, simulation: { actif: true } }, etat: ENFANT(true) } });
  const envois = P.ecrituresObservation(h, LES_SIX, true);
  assert.deepEqual(envois.map(([cle]) => cle), ['loggia_volets', 'loggia_fenetres', 'loggia_presence', 'loggia_nuit', 'loggia_chauffage', 'loggia_enfant']);
  assert.deepEqual(h.recus, [
    { type: 'loggia/volets/config', patch: { simulation: { actif: true } } },
    { type: 'loggia/fenetres/config', patch: { simulation: true } },
    { type: 'loggia/presence/config', patch: { simulation: { actif: true } } },
    { type: 'loggia/nuit/config', patch: { simulation: { actif: true } } },
    { type: 'loggia/chauffage/config', patch: { simulation: { actif: true } } },
    { type: 'loggia/enfant/config', patch: { simulation: { actif: true } } },
  ]);
  assert.equal(await bilanEcritures(envois), '', 'tout a pris : rien à dire');
  /* L'état que la commande rend remplace celui des cartes et de la fiche : un
   * moteur qui observe ne reçoit plus d'elles une reprise en main qu'il
   * n'appliquerait pas (tâche 7), sans attendre leur sondage de 60 s. */
  assert.equal(lireEtatChauffage().etat.simulation, true);
  assert.equal(lireEtatEnfant().etat.simulation, true, 'le mode enfant aussi : ses cartes et sa fiche lisent le drapeau sans attendre');
  // Et le retour au réel.
  const h2 = faux({ ...ECRITURES, 'loggia/chauffage/config': { config: { simulation: { actif: false } }, etat: CHAUFFAGE(false) } });
  assert.equal(await bilanEcritures(P.ecrituresObservation(h2, LES_SIX, false)), '');
  assert.deepEqual(h2.recus.at(-2), { type: 'loggia/chauffage/config', patch: { simulation: { actif: false } } });
  assert.deepEqual(h2.recus.at(-1), { type: 'loggia/enfant/config', patch: { simulation: { actif: false } } });
  assert.equal(lireEtatChauffage().etat.simulation, false);
  assert.equal(lireEtatEnfant().etat.simulation, false);
  reglerEnfantEtat({});
});

test('un refus du planning de chauffe ou du mode enfant se dit, et nomme sa clé', async () => {
  const refuse = { rejet: NON_ADMIN };
  const tous = faux({ 'loggia/volets/config': refuse, 'loggia/fenetres/config': refuse, 'loggia/presence/config': refuse,
    'loggia/nuit/config': refuse, 'loggia/chauffage/config': refuse, 'loggia/enfant/config': refuse });
  assert.equal(await bilanEcritures(P.ecrituresObservation(tous, LES_SIX, true)),
    MAISON('loggia_volets, loggia_fenetres, loggia_presence, loggia_nuit, loggia_chauffage, loggia_enfant'));
  const seul = faux({ ...ECRITURES, 'loggia/chauffage/config': refuse });
  assert.equal(await bilanEcritures(P.ecrituresObservation(seul, LES_SIX, true)), MAISON('loggia_chauffage'),
    'le refus du chauffage, et lui seul');
  const enfantSeul = faux({ ...ECRITURES, 'loggia/chauffage/config': { config: {}, etat: CHAUFFAGE(true) }, 'loggia/enfant/config': refuse });
  assert.equal(await bilanEcritures(P.ecrituresObservation(enfantSeul, LES_SIX, true)), MAISON('loggia_enfant'), 'le refus du mode enfant, et lui seul');
});

for (const [cas, muet] of [['Home Assistant pas encore redémarré', INCONNUE], ['moteur absent', SANS_MOTEUR]]) {
  test(`planning de chauffe muet (${cas}) : ni dans l’interrupteur ni pour « tous », et la bascule ne lui écrit rien`, async () => {
    // Si la bascule lui écrivait, l'écriture échouerait : le bilan ne serait plus vide.
    // Le mode enfant, muet lui aussi ici : un module de plus qui ne répond pas ne change rien aux quatre (ASSERTION MODIFIÉE, chantier Mode enfant, tâche 5).
    const h = faux({ ...QUATRE(true), ...ECRITURES, 'loggia/chauffage/etat': { rejet: muet }, 'loggia/chauffage/config': { rejet: muet } });
    const observe = await P.lireObservation(h);
    // ASSERTION MODIFIÉE (audit du 19/10, H3) : les veilles sont le septième module de l'interrupteur ; ce faux Home Assistant ne
    // connaît pas leur commande (`unknown_command`), elles sont donc muettes ici — `veilles: undefined`.
    assert.deepEqual(observe, { volets: true, fenetres: true, presence: true, nuit: true, chauffage: undefined, enfant: undefined, veilles: undefined });
    const { lus, actifs, tous } = P.etatObservation(observe);
    assert.deepEqual(lus, LES_QUATRE);
    assert.deepEqual(actifs, LES_QUATRE);
    assert.equal(tous, true, 'un module muet empêche de nouveau « tous » d’être vrai');
    h.recus.length = 0;
    const envois = P.ecrituresObservation(h, lus, !actifs.length);
    assert.deepEqual(h.recus, LES_QUATRE.map(k => ({ type: 'loggia/' + k + '/config', patch: { simulation: k === 'fenetres' ? false : { actif: false } } })),
      'la bascule écrit au module muet : son échec s’afficherait en rouge à chaque geste');
    assert.equal(await bilanEcritures(envois), '', 'rien à dire : le module muet n’a rien reçu');
  });
}

test('l’interrupteur ne lit que les modules qui ont répondu', () => {
  // ASSERTION MODIFIÉE (chantier Mode enfant, tâche 5) : le mode enfant est le sixième ; muet, il ne compte pas plus que le planning de chauffe.
  const muet = { volets: false, fenetres: false, presence: false, nuit: false, chauffage: undefined, enfant: undefined };
  assert.deepEqual(P.etatObservation(muet), { lus: LES_QUATRE, actifs: [], tous: false }, 'éteint : la bascule mettra les quatre en observation');
  assert.deepEqual(P.etatObservation({ ...muet, volets: true }), { lus: LES_QUATRE, actifs: ['volets'], tous: false },
    'un seul en observation : la liste, pas « tous »');
  const six = { volets: true, fenetres: true, presence: true, nuit: true, chauffage: false, enfant: false };
  assert.deepEqual(P.etatObservation(six), { lus: LES_SIX, actifs: LES_QUATRE, tous: false },
    'le planning de chauffe et le mode enfant qui ont répondu comptent : tant qu’ils agissent, ce n’est pas « tous »');
  assert.deepEqual(P.etatObservation({ ...six, chauffage: true }), { lus: LES_SIX, actifs: LES_CINQ, tous: false }, 'le mode enfant agit encore');
  assert.deepEqual(P.etatObservation({ ...six, chauffage: true, enfant: true }), { lus: LES_SIX, actifs: LES_SIX, tous: true });
  assert.deepEqual(P.etatObservation(null), { lus: [], actifs: [], tous: false }, 'pas encore lu');
});

test('personne ne répond : l’interrupteur attend, comme avant la première lecture', async () => {
  const coupe = faux(Object.fromEntries([...LES_QUATRE, 'chauffage', 'enfant'].map(k => ['loggia/' + k + '/etat', { rejet: COUPURE }])));
  assert.equal(await P.lireObservation(coupe), null, 'ouvert, l’interrupteur ne ferait rien : plus aucun module à qui écrire');
  // Un seul qui répond suffit.
  const seul = faux({ 'loggia/chauffage/etat': CHAUFFAGE(false) });
  // ASSERTION MODIFIÉE (audit du 19/10, H3) : les veilles sont le septième module de l'interrupteur ; ce faux Home Assistant ne
  // connaît pas leur commande (`unknown_command`), elles sont donc muettes ici — `veilles: undefined`.
  assert.deepEqual(await P.lireObservation(seul), { volets: undefined, fenetres: undefined, presence: undefined, nuit: undefined, chauffage: false, enfant: undefined, veilles: undefined });
});

test('dans la démo : la bascule met le moteur en observation, et le journal note ce qu’il aurait fait', async () => {
  reglerChauffageEtat();
  const m = maisonChauffageDemo({ quand: new Date(2026, 9, 12, 10, 0, 0) });
  const quatre = faux({ ...QUATRE(false), ...ECRITURES });
  const h = { callWS: (msg) => (msg.type.startsWith('loggia/chauffage/') ? m.ws(msg) : quatre.callWS(msg)) };
  const avant = await P.lireObservation(h);
  assert.equal(avant.chauffage, false, 'l’observation est coupée au départ');
  const { lus, actifs } = P.etatObservation(avant);
  assert.equal(await bilanEcritures(P.ecrituresObservation(h, lus, !actifs.length)), '');
  assert.equal((await P.lireObservation(h)).chauffage, true, 'le faux moteur n’a pas pris le drapeau');
  assert.equal(lireEtatChauffage().etat.simulation, true, 'les cartes ne le savent qu’à leur prochain sondage');
  // 18:01 : le planning du bureau est passé en Confort −1 à 17:30. Le moteur le note, et ne commande rien.
  const radiateur = m.states[BUREAU].state;
  m.regler(new Date(2026, 9, 12, 18, 1, 0));
  await m.ws({ type: 'loggia/chauffage/etat' });
  assert.equal(m.states[BUREAU].state, radiateur, 'en observation, le moteur a commandé le radiateur');
  const lignes = m.regles().journal.filter(l => l.module === 'chauffage' && l.simule === true);
  assert.ok(lignes.some(l => l.cibles.includes(BUREAU) && l.quoi === 'Confort −1'),
    'le journal des Règles ne dit pas ce que le moteur aurait fait : ' + JSON.stringify(lignes));
});

test('dans la démo, sous un compte ordinaire : la bascule refusée se nomme', async () => {
  const m = maisonChauffageDemo({ admin: false, quand: new Date(2026, 9, 12, 10, 0, 0) });
  const h = { callWS: (msg) => m.ws(msg) };
  assert.equal((await P.lireObservation(h)).chauffage, false, 'l’état est ouvert à tout compte');
  assert.equal(await bilanEcritures(P.ecrituresObservation(h, ['chauffage'], true)), MAISON('loggia_chauffage'));
});

test('la vue passe par ces trois fonctions, et nomme le cinquième module « Planning de chauffe »', () => {
  const corps = (debut) => {
    const i = PAR.indexOf(debut);
    assert.ok(i > 0, debut + ' a disparu');
    return PAR.slice(i, PAR.indexOf('\n  };', i));
  };
  assert.ok(corps('const lireObserve = () => {').includes('lireObservation(h).then(setObserve);'), 'la lecture ne passe plus par lireObservation');
  const bascule = corps('const basculerObserve = async () => {');
  assert.ok(bascule.includes('const { lus, actifs } = etatObservation(observe);'), 'la bascule ne regarde plus les seuls modules qui ont répondu');
  assert.ok(bascule.includes('setObsRefus(await bilanEcritures(ecrituresObservation(h, lus, cible)));'), 'la bascule n’écrit plus par ecrituresObservation');
  // L'affichage : « Chauffage » reste la règle des fenêtres, le moteur a son nom.
  assert.ok(PAR.includes("fenetres: tr('Chauffage')"), 'la règle des fenêtres a perdu son nom');
  assert.ok(PAR.includes("chauffage: tr('Planning de chauffe')"), 'le cinquième module n’a pas de nom à l’écran');
  assert.ok(PAR.includes("enfant: tr('Mode enfant')"), 'le sixième module (chantier Mode enfant, tâche 5) n’a pas de nom à l’écran');
  assert.ok(PAR.includes('const { actifs, tous } = etatObservation(observe);'), 'l’affichage ne passe plus par etatObservation');
  assert.ok(!PAR.includes('Object.keys(noms).length'), '« tous » compte de nouveau les noms : un module muet l’empêcherait d’être vrai');
});
