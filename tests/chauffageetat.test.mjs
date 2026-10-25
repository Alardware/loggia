/* L'état du planning de chauffe côté serveur : un cache compté par références
 * (chantier Chauffage, plan 2, tâche 4 et choix 6).
 *
 * Les cartes, l'Accueil et la fiche lisent la même réponse de
 * `loggia/chauffage/etat`. Ce qui est garanti ici, source et horloge doublées,
 * sans React, comme pour le distributeur (tests/distributeuretat.test.mjs) :
 *  - rien ne part sans abonné — aucun montage à la racine ;
 *  - 60 s pour les cartes et l'Accueil, 15 s dès qu'un abonné est `rapide`
 *    (la fiche ouverte), et la cadence revient à 60 s quand il part, à zéro
 *    sans abonné ;
 *  - le premier abonné, et le premier `rapide`, relisent aussitôt ;
 *  - serveur muet : `erreur`, sans effacer ce qu'on savait ; une réponse plus
 *    vieille ne recouvre pas une plus fraîche, ni ce qu'une commande a posé ;
 *  - pas encore de `hass` : on réessaie vite, ce n'est pas une panne ;
 *  - une commande pose l'état qu'elle rend (`r.etat` pour la configuration) ;
 *    un refus remonte tel quel, et le cache n'en sait rien.
 * Sur l'état de départ, ce fichier rougit en entier : le module n'existe pas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const E = await import('../src/chauffageetat.js');

/* Une horloge à la main : on voit chaque minuteur posé, on le déclenche. */
function horlogeFactice() {
  const h = { minuteurs: new Map(), suivant: 1 };
  const poser = (f, ms, rep) => { const id = h.suivant++; h.minuteurs.set(id, { f, ms, rep }); return id; };
  return Object.assign(h, {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => h.minuteurs.delete(id),
    plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => h.minuteurs.delete(id),
    repetitions: () => [...h.minuteurs.values()].filter(m => m.rep).map(m => m.ms),
    attentes: () => [...h.minuteurs.values()].filter(m => !m.rep).map(m => m.ms),
    tic: () => { for (const [id, m] of [...h.minuteurs]) { if (!m.rep) h.minuteurs.delete(id); m.f(); } },
  });
}
/* Un serveur à la main : chaque appel est noté, et se résout quand on le dit. */
function serveurFactice() {
  const appels = [];
  return {
    appels,
    hass: { callWS: (msg) => new Promise((ok, ko) => appels.push({ msg, ok, ko })) },
  };
}
const attendre = () => new Promise(r => setImmediate(r));
const LIRE = { type: 'loggia/chauffage/etat' };

/* Un état tel que le serveur le rend (la forme suffit ici). */
const etat = (n) => ({
  chauffages: [{ cle: 'id-' + n, entite: 'select.radiateur_' + n, nom: 'Radiateur ' + n, planning: true, source: 'planning' }],
  maison: { mode: 'planning', vacances_fin: null, absence: 'eco', vacances: 'hors_gel' },
  simulation: false, maintenant: '2026-10-10T08:00:00+00:00', minute: [5, 600], demarrage: null, journal: [],
});

test('sans abonné, rien ne part ; le premier abonné relit aussitôt, puis toutes les 60 s', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  await E.rafraichirChauffage();
  assert.equal(s.appels.length, 0, 'une lecture sans abonné : le serveur interrogé depuis la racine');
  assert.deepEqual(h.repetitions(), [], 'un sondage sans abonné');
  const fin = E.abonnerChauffage();
  assert.equal(s.appels.length, 1, 'le premier abonné attendrait 60 s sa première réponse');
  assert.deepEqual(s.appels[0].msg, LIRE);
  assert.deepEqual(h.repetitions(), [60000]);
  h.tic();
  assert.equal(s.appels.length, 2);
  assert.deepEqual(s.appels[1].msg, LIRE);
  fin();
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
});

test('deux abonnés : un seul sondage, un seul cache', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  const carte = E.abonnerChauffage();
  const accueil = E.abonnerChauffage();
  assert.equal(s.appels.length, 1, 'un second abonné ne relit pas : le cache est partagé');
  assert.deepEqual(h.repetitions(), [60000], 'un seul sondage pour tous');
  const ETAT = etat('salon');
  s.appels[0].ok(ETAT);
  await attendre();
  assert.equal(E.lireEtatChauffage().etat, ETAT, 'les deux lisent la même réponse');
  carte();
  assert.deepEqual(h.repetitions(), [60000], 'un abonné reste : le sondage aussi');
  accueil();
  assert.deepEqual(h.repetitions(), []);
  assert.equal(E.lireEtatChauffage().etat, ETAT, 'tout démonté, la réponse d’avant reste lue');
});

test('rapide : 15 s dès qu’un abonné le demande, puis retour à 60 s quand il part', () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  const carte = E.abonnerChauffage();
  const fiche = E.abonnerChauffage({ rapide: true });
  assert.equal(s.appels.length, 2, 'la fiche qui s’ouvre relit aussitôt');
  assert.deepEqual(s.appels[1].msg, LIRE, 'le même message : seule la cadence change');
  assert.deepEqual(h.repetitions(), [15000]);
  const autre = E.abonnerChauffage({ rapide: true });
  assert.equal(s.appels.length, 2, 'une seconde fiche ne relit pas');
  assert.deepEqual(h.repetitions(), [15000]);
  autre();
  assert.deepEqual(h.repetitions(), [15000], 'une fiche reste ouverte : 15 s');
  fiche();
  fiche();
  assert.deepEqual(h.repetitions(), [60000], 'désabonner deux fois fausse le compte : la carte resterait à 15 s ou perdrait son sondage');
  carte();
  assert.deepEqual(h.repetitions(), []);
});

test('la réponse se publie ; un serveur muet se dit sans effacer ce qu’on savait', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  let vus = 0;
  const arret = E.ecouterEtatChauffage(() => { vus += 1; });
  const fin = E.abonnerChauffage();
  assert.deepEqual(E.lireEtatChauffage(), { etat: null, erreur: false }, 'en attente : ni état ni panne');
  const instant = E.lireEtatChauffage();
  assert.equal(E.lireEtatChauffage(), instant, 'le même instantané tant que rien ne change (useSyncExternalStore)');
  const ETAT = etat('salon');
  s.appels[0].ok(ETAT);
  await attendre();
  assert.equal(E.lireEtatChauffage().etat, ETAT);
  assert.equal(vus, 1);
  h.tic();
  s.appels[1].ko({ code: 'unknown_command' });
  await attendre();
  assert.deepEqual(E.lireEtatChauffage(), { etat: ETAT, erreur: true }, 'une lecture ratée efface l’état qu’on avait');
  h.tic();
  s.appels[2].ok('pas un état');
  await attendre();
  assert.deepEqual(E.lireEtatChauffage(), { etat: ETAT, erreur: true }, 'une réponse illisible n’est pas un état');
  // Jamais de réponse : HA pas redémarré, la commande n'existe pas encore.
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  E.abonnerChauffage();
  s.appels.at(-1).ko({ code: 'unknown_command' });
  await attendre();
  assert.deepEqual(E.lireEtatChauffage(), { etat: null, erreur: true });
  arret(); fin();
});

test('une réponse plus vieille ne recouvre ni une plus fraîche, ni ce qu’on a posé', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  E.abonnerChauffage();
  h.tic();
  const [vieille, fraiche] = s.appels;
  fraiche.ok({ n: 2 });
  await attendre();
  vieille.ok({ n: 1 });
  await attendre();
  assert.deepEqual(E.lireEtatChauffage().etat, { n: 2 }, 'la réponse d’avant a recouvert la plus récente');
  h.tic();
  const enVol = s.appels.at(-1);
  E.poserEtatChauffage({ n: 'posé' });
  enVol.ok({ n: 3 });
  await attendre();
  assert.deepEqual(E.lireEtatChauffage().etat, { n: 'posé' }, 'une lecture partie avant la commande l’a recouverte');
  h.tic();
  s.appels.at(-1).ok({ n: 4 });
  await attendre();
  assert.deepEqual(E.lireEtatChauffage().etat, { n: 4 }, 'la lecture suivante reprend la main');
});

test('poserEtatChauffage remplace le cache et prévient les abonnés', () => {
  const h = horlogeFactice();
  E.reglerChauffageEtat({ hass: null, horloge: h });
  let vus = 0;
  const arret = E.ecouterEtatChauffage(() => { vus += 1; });
  const A = etat('a'), B = etat('b');
  E.poserEtatChauffage(A);
  assert.deepEqual(E.lireEtatChauffage(), { etat: A, erreur: false });
  assert.equal(vus, 1);
  E.poserEtatChauffage(B);
  assert.equal(E.lireEtatChauffage().etat, B, 'remplacé, pas fusionné');
  assert.equal(vus, 2);
  E.poserEtatChauffage(B);
  assert.equal(vus, 2, 'le même état ne réveille personne');
  for (const pas of [null, undefined, 'x', 3]) E.poserEtatChauffage(pas);
  assert.equal(E.lireEtatChauffage().etat, B, 'ce qui n’est pas un état ne remplace rien');
  assert.equal(vus, 2);
  arret();
  E.poserEtatChauffage(A);
  assert.equal(vus, 2, 'un écouteur parti n’est plus prévenu');
});

test('pas encore de hass : on réessaie vite, sans se dire en panne', () => {
  const h = horlogeFactice();
  // La source réelle (getHass) n'a pas de document ici : null, comme au démarrage de l'application.
  E.reglerChauffageEtat({ hass: null, horloge: h });
  const fin = E.abonnerChauffage();
  assert.deepEqual(E.lireEtatChauffage(), { etat: null, erreur: false }, 'pas de pont n’est pas une panne');
  assert.deepEqual(h.attentes(), [2000], 'sans hass, la carte attendrait 60 s sa première réponse');
  E.rafraichirChauffage();
  assert.deepEqual(h.attentes(), [2000], 'une seule relance à la fois');
  fin();
  assert.deepEqual(h.attentes(), [], 'plus d’abonné : la relance part avec lui');
});

test('chauffageDe : le chauffage d’une entité, sinon null', () => {
  const ETAT = { chauffages: [null, { cle: 'id-a', entite: 'select.a' }, { cle: 'id-b', entite: 'climate.b' }, { cle: 'id-x', entite: null }] };
  assert.equal(E.chauffageDe(ETAT, 'climate.b'), ETAT.chauffages[2]);
  assert.equal(E.chauffageDe(ETAT, 'select.a'), ETAT.chauffages[1]);
  assert.equal(E.chauffageDe(ETAT, 'id-a'), null, 'la clé n’est pas l’entité');
  assert.equal(E.chauffageDe(ETAT, 'select.inconnu'), null);
  assert.equal(E.chauffageDe(ETAT, null), null, 'un chauffage introuvable n’est le chauffage de personne');
  assert.equal(E.chauffageDe(ETAT, undefined), null);
  assert.equal(E.chauffageDe(null, 'select.a'), null, 'état pas encore lu');
  assert.equal(E.chauffageDe({}, 'select.a'), null);
  assert.equal(E.chauffageDe({ chauffages: 'x' }, 'select.a'), null);
});

test('chauffageParCle : le chauffage d’une clé — un introuvable compris —, sinon null (tâche 12)', () => {
  const ETAT = { chauffages: [null, { cle: 'id-a', entite: 'select.a' }, { cle: 'id-x', entite: null, avertissements: ['introuvable'] }] };
  assert.equal(E.chauffageParCle(ETAT, 'id-x'), ETAT.chauffages[2], 'un chauffage introuvable se trouve par sa clé');
  assert.equal(E.chauffageParCle(ETAT, 'id-a'), ETAT.chauffages[1]);
  assert.equal(E.chauffageParCle(ETAT, 'select.a'), null, 'l’entité n’est pas la clé');
  assert.equal(E.chauffageParCle(ETAT, 'id-inconnue'), null);
  for (const vide of [null, undefined, '']) assert.equal(E.chauffageParCle(ETAT, vide), null, JSON.stringify(vide));
  assert.equal(E.chauffageParCle(null, 'id-a'), null, 'état pas encore lu');
  assert.equal(E.chauffageParCle({ chauffages: 'x' }, 'id-a'), null);
  // Le chemin par l'entité ne change pas.
  assert.equal(E.chauffageDe(ETAT, 'select.a'), ETAT.chauffages[1]);
  assert.equal(E.chauffageDe(ETAT, null), null);
});

test('une commande « main » pose l’état qu’elle rend', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  let vus = 0;
  const arret = E.ecouterEtatChauffage(() => { vus += 1; });
  const MSG = { type: 'loggia/chauffage/main', cle: 'id-salon', mode: 'eco', fin: 'prochain' };
  const p = E.commanderChauffage(s.hass, MSG);
  assert.equal(s.appels.length, 1);
  assert.equal(s.appels[0].msg, MSG, 'le message part tel quel');
  const RENDU = etat('salon');
  s.appels[0].ok(RENDU);
  assert.equal(await p, RENDU, 'la commande rend la réponse');
  assert.deepEqual(E.lireEtatChauffage(), { etat: RENDU, erreur: false });
  assert.equal(vus, 1, 'les cartes et l’Accueil le voient aussitôt');
  arret();
});

test('une commande « config » pose l’état rendu, pas la configuration', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  const p = E.commanderChauffage(s.hass, { type: 'loggia/chauffage/config', patch: { simulation: { actif: true } } });
  const RENDU = { config: { chauffages: {}, maison: { mode: 'planning' }, simulation: { actif: true } }, etat: etat('salon') };
  s.appels[0].ok(RENDU);
  assert.equal(await p, RENDU, 'la commande rend la réponse entière');
  assert.equal(E.lireEtatChauffage().etat, RENDU.etat);
});

test('un refus remonte tel quel ; le cache n’en sait rien', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  const AVANT = etat('avant');
  E.poserEtatChauffage(AVANT);
  let vus = 0;
  const arret = E.ecouterEtatChauffage(() => { vus += 1; });
  const REFUS = { code: 'chauffage_semaine_vide', message: 'semaine vide : semaine' };
  const p = E.commanderChauffage(s.hass, { type: 'loggia/chauffage/config', patch: { chauffages: { 'id-a': { semaine: {} } } } });
  s.appels[0].ko(REFUS);
  await assert.rejects(p, (e) => e === REFUS, 'l’appelant dit le refus par raisonEchec : il lui faut l’erreur telle quelle');
  assert.deepEqual(E.lireEtatChauffage(), { etat: AVANT, erreur: false }, 'un refus n’est ni un état ni une panne de lecture');
  assert.equal(vus, 0);
  // Une exception levée par le pont lui-même remonte aussi, en rejet.
  const casse = { callWS: () => { throw new Error('déconnecté'); } };
  await assert.rejects(E.commanderChauffage(casse, { type: 'loggia/chauffage/maison', mode: 'absence' }), /déconnecté/);
  assert.equal(E.lireEtatChauffage().etat, AVANT);
  arret();
});

test('useEtatChauffage rend l’instantané du cache ; le rendu seul n’interroge personne', async () => {
  // Le rendu statique de React : sans effet, donc sans abonnement — ce qu'un premier rendu montre.
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerChauffageEtat({ hass: s.hass, horloge: h });
  const Lecteur = ({ actif, rapide }) => {
    const { etat: e, erreur } = E.useEtatChauffage(actif, { rapide });
    return createElement('p', null, (e ? e.chauffages[0].nom : 'rien') + (erreur ? ' (muet)' : ''));
  };
  assert.equal(renderToStaticMarkup(createElement(Lecteur, { actif: true })), '<p>rien</p>', 'pas encore lu');
  E.poserEtatChauffage(etat('salon'));
  assert.equal(renderToStaticMarkup(createElement(Lecteur, { actif: true, rapide: true })), '<p>Radiateur salon</p>');
  assert.equal(renderToStaticMarkup(createElement(Lecteur, { actif: false })), '<p>Radiateur salon</p>', 'inactif, le cache se lit tel quel');
  assert.equal(s.appels.length, 0, 'l’abonnement vit dans l’effet, jamais dans le rendu');
  assert.deepEqual(h.repetitions(), []);
});

test('le crochet : abonné tant que monté et actif ; le module reste léger', () => {
  const src = readFileSync(new URL('../src/chauffageetat.js', import.meta.url), 'utf8');
  assert.ok(src.includes('useEffect(() => (actif ? abonnerChauffage({ rapide }) : undefined), [actif, rapide]);'),
    'le crochet s’abonne au montage, se désabonne au démontage, et ne s’abonne pas inactif');
  assert.ok(src.includes('return useSyncExternalStore(ecouterEtatChauffage, lireEtatChauffage, lireEtatChauffage);'));
  assert.ok(src.includes("const TYPE_ETAT = 'loggia/chauffage/etat';"));
  // Pas de boucle de sondage locale (tests/dependances.test.mjs) : une seule cadence, celle des abonnés.
  assert.equal((src.match(/horloge\.repeter\(/g) || []).length, 1, 'une seule cadence, celle des abonnés');
  assert.equal((src.match(/setInterval\(/g) || []).length, 1, 'un sondage à côté de l’horloge du module');
  assert.ok(!/from '\.\/chauffage\.js'/.test(src), 'le calcul entrerait dans le paquet de démarrage');
});

test('refroidit : ce que le serveur dit d’une pompe à chaleur en froid (audit du 19/10)', () => {
  assert.equal(E.refroidit({ avertissements: ['refroidit'] }), true);
  assert.equal(E.refroidit({ avertissements: ['injoignable'] }), false);
  assert.equal(E.refroidit({ avertissements: 'refroidit' }), false, 'pas une liste : rien');
  assert.equal(E.refroidit(null), false);
});

test('le moteur a raté son démarrage : l’écran commande l’appareil, comme en observation (audit du 19/10)', () => {
  E.poserEtatChauffage({ chauffages: [], maison: { mode: 'planning' }, simulation: false, demarrage: false });
  assert.equal(E.lireEtatChauffage().etat.simulation, true, 'les cartes et la fiche passent par l’appareil');
  assert.equal(E.lireEtatChauffage().etat.demarrage, false, 'la fiche sait pourquoi');
  E.poserEtatChauffage({ chauffages: [], maison: { mode: 'planning' }, simulation: false, demarrage: true });
  assert.equal(E.lireEtatChauffage().etat.simulation, false, 'démarré : le moteur commande');
});
