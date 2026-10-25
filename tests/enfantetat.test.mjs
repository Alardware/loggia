/* Ce que l'écran lit du mode enfant, une fois pour tout l'écran (chantier Mode enfant, tâche 4 ; E21 ; spec 7.4) — le modèle de
 * tests/lumieresetat.test.mjs.
 *
 * Ce qui est garanti ici, source et horloge doublées :
 *  - rien ne part sans abonné ; `loggia/enfant/etat` à 60 s pour les cartes, 15 s pour la fiche ; un seul sondage pour toutes les
 *    cartes ; un composant d'avant ce chantier ne répond pas : rien n'est su, rien ne casse ;
 *  - une maison SANS profil (`loggia_enfant` vide ou absent) n'a pas de mode enfant : la carte ne s'abonne pas (E21) ;
 *  - la lecture d'un lecteur par son entité OU par sa jumelle (une Echo exposée deux fois, M14) ;
 *  - les mots de la maquette pour une durée : « 35 min », « 1 h », « 1 h 25 » ;
 *  - le budget d'un écran, qui descend à l'écran depuis la réception tant que l'écran est allumé (le motif des minuteurs). */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { setLoggiaState } = await import('../src/state.js');
const E = await import('../src/enfantetat.js');
const T = new Date(2026, 9, 17, 17, 40).getTime();

function horlogeFactice() {
  const h = { minuteurs: new Map(), suivant: 1 };
  const poser = (f, ms, rep) => { const id = h.suivant++; h.minuteurs.set(id, { f, ms, rep }); return id; };
  return Object.assign(h, {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => h.minuteurs.delete(id),
    plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => h.minuteurs.delete(id), maintenant: () => T,
    repetitions: () => [...h.minuteurs.values()].filter(m => m.rep).map(m => m.ms).sort((a, b) => a - b),
  });
}
function serveurFactice() {
  const appels = [];
  return { appels, hass: { callWS: (msg) => new Promise((ok, ko) => appels.push({ msg, ok, ko })) } };
}
const attendre = () => new Promise(r => setImmediate(r));
const OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', ATV = 'media_player.apple_tv_chambre';
const LECTEUR = { profil: 'chambre', nom: 'Lino', actif: true, leve_jusqua: null, plafond: 40, bloque: null, reprise: '07:30', ecran: null, dormir: null, demande: null };
const ETAT = {
  maintenant: 1760715600, demarre: true, simulation: false,
  profils: { chambre: { nom: 'Lino', zone: 'chambre', actif: true, leve_jusqua: null, demande: null, appareils: [], voix: true, dormir: true } },
  lecteurs: { [OFF]: LECTEUR, [HACS]: LECTEUR, [ATV]: { ...LECTEUR, ecran: { budget_min: 90, utilise_s: 3300, bonus_min: 0, reste_s: 2100 } } },
};

test('sans abonné rien ne part ; une carte lit l’état du mode enfant, puis toutes les 60 s ; la fiche, 15 s ; plus d’abonné, plus de sondage', () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerEnfantEtat({ hass: s.hass, horloge: h });
  assert.equal(s.appels.length, 0);
  const desabonner = [];
  // Le crochet `useEtatEnfant` s'abonne dans un effet : on appelle ici ce qu'il appelle.
  desabonner.push(E.abonnerEnfant());
  assert.deepEqual(s.appels.map(a => a.msg.type), ['loggia/enfant/etat']);
  assert.deepEqual(h.repetitions(), [60000]);
  desabonner.push(E.abonnerEnfant());
  assert.equal(s.appels.length, 1, 'une seconde carte ne relit pas : le cache est partagé');
  const fiche = E.abonnerEnfant({ rapide: true });
  assert.equal(s.appels.length, 2, 'la fiche qui s’ouvre relit aussitôt');
  assert.deepEqual(h.repetitions(), [15000]);
  fiche();
  desabonner.forEach(f => f());
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
});

test('la réponse du serveur porte l’heure de sa réception ; un composant d’avant ce chantier ne répond pas : rien n’est su, rien ne casse', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerEnfantEtat({ hass: s.hass, horloge: h });
  const fin = E.abonnerEnfant();
  const avant = Date.now();
  s.appels[0].ok(ETAT);
  await attendre();
  const lu = E.lireEtatEnfant();
  assert.equal(lu.erreur, false);
  assert.equal(lu.etat.lecteurs[OFF].plafond, 40);
  assert.ok(lu.etat.recu >= avant && lu.etat.recu <= Date.now(), 'l’heure de réception, pour faire descendre le temps d’écran entre deux sondages');
  fin();
  E.reglerEnfantEtat({ hass: s.hass, horloge: h });
  const fin2 = E.abonnerEnfant();
  s.appels.at(-1).ko({ code: 'unknown_command', message: 'Unknown command.' });
  await attendre();
  assert.deepEqual(E.lireEtatEnfant(), { etat: null, erreur: true }, 'un composant d’avant ce chantier : rien n’est su, l’erreur se dit');
  assert.equal(E.lecteurEnfant(E.lireEtatEnfant().etat, OFF), null, 'et aucun lecteur n’est sous profil');
  fin2();
});

test('E21 : la maison a un mode enfant si `loggia_enfant` porte un profil — sans, la carte ne s’abonne pas', () => {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: {} });
  assert.equal(E.maisonAvecEnfant(), false, 'rien de configuré');
  setLoggiaState({ index: null, ent: {}, cfg: { loggia_enfant: { profils: {}, simulation: { actif: false } } }, resolved: {} });
  assert.equal(E.maisonAvecEnfant(), false, 'une configuration sans profil');
  setLoggiaState({ index: null, ent: {}, cfg: { loggia_enfant: 'cassé' }, resolved: {} });
  assert.equal(E.maisonAvecEnfant(), false, 'une configuration illisible');
  setLoggiaState({ index: null, ent: {}, cfg: { loggia_enfant: { profils: { chambre: { nom: 'Lino', zone: 'chambre' } } } }, resolved: {} });
  assert.equal(E.maisonAvecEnfant(), true);
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: {} });
});

test('M14 : un lecteur se lit par son entité ou par sa jumelle ; le profil par son identifiant ; ce qui manque rend null', () => {
  assert.equal(E.lecteurEnfant(ETAT, OFF), LECTEUR);
  assert.equal(E.lecteurEnfant(ETAT, 'media_player.inconnu', HACS), LECTEUR, 'l’officielle absente de l’état : la jumelle');
  assert.equal(E.lecteurEnfant(ETAT, 'media_player.inconnu', null), null);
  assert.equal(E.lecteurEnfant(null, OFF), null);
  assert.equal(E.lecteurEnfant({ lecteurs: 'cassé' }, OFF), null);
  assert.equal(E.profilEnfant(ETAT, 'chambre').nom, 'Lino');
  assert.equal(E.profilEnfant(ETAT, 'salon'), null);
  assert.equal(E.profilEnfant(null, 'chambre'), null);
});

test('les mots d’une durée (la maquette) : « 35 min », « 1 h », « 1 h 25 », « 1 h 30 », « 2 h » ; rien sous zéro', () => {
  assert.deepEqual([35, 60, 85, 90, 120, 0, -5, 59.6].map(E.dureeTexte), ['35 min', '1 h', '1 h 25', '1 h 30', '2 h', '0 min', '0 min', '1 h']);
  assert.equal(E.dureeTexte(65), '1 h 05', 'les minutes sur deux chiffres');
  assert.equal(E.dureeTexte(null), '0 min');
});

test('E8, E21 : le budget d’un écran — le total avec le bonus, l’utilisé et le reste ; le reste descend à l’écran tant qu’il est allumé, jamais sous zéro ; sans budget, rien', () => {
  const recu = T;
  const lecteur = { ...LECTEUR, ecran: { budget_min: 90, utilise_s: 3300, bonus_min: 15, reste_s: 3000 } };
  assert.deepEqual(E.budgetEcran(lecteur, { recu }, T, false), { total_s: 6300, utilise_s: 3300, reste_s: 3000, bonus_min: 15 }, 'éteint : ce que le serveur a dit');
  assert.deepEqual(E.budgetEcran(lecteur, { recu }, T + 60000, true), { total_s: 6300, utilise_s: 3360, reste_s: 2940, bonus_min: 15 }, 'allumé, une minute plus tard : une minute de moins');
  assert.deepEqual(E.budgetEcran(lecteur, { recu }, T + 60000, false), { total_s: 6300, utilise_s: 3300, reste_s: 3000, bonus_min: 15 }, 'éteint : rien ne descend');
  assert.equal(E.budgetEcran(lecteur, { recu }, T + 9000000, true).reste_s, 0, 'jamais sous zéro');
  assert.equal(E.budgetEcran(lecteur, { recu }, T + 9000000, true).utilise_s, 6300, 'jamais au-delà du total');
  assert.equal(E.budgetEcran(lecteur, { recu }, T - 5000, true).reste_s, 3000, 'une horloge en avance ne compte pas à l’envers');
  assert.equal(E.budgetEcran(lecteur, null, T + 60000, true).reste_s, 3000, 'sans heure de réception, ce que le serveur a dit');
  assert.deepEqual(E.budgetEcran({ ...LECTEUR, ecran: { budget_min: 0, utilise_s: 500, bonus_min: 0, reste_s: null } }, { recu }, T, true), null, 'budget 0 : illimité, pas de pied du temps');
  assert.equal(E.budgetEcran(LECTEUR, { recu }, T, true), null, 'une enceinte : pas un écran');
  assert.equal(E.budgetEcran(null, { recu }, T, true), null);
});
