/* L'état du distributeur côté serveur : un cache compté par références
 * (ADR 0155, 05/10).
 *
 * La carte (son prochain repas) et la fiche (le Planning) lisent la même
 * réponse de `loggia/distributeurs/etat`. Ce qui est garanti ici, source et
 * horloge doublées, sans React :
 *  - rien ne part sans abonné — aucun montage à la racine ;
 *  - 60 s pour une carte, 15 s et `detail: true` tant que la fiche est ouverte,
 *    et la cadence revient à 60 s quand elle se ferme, à zéro sans abonné ;
 *  - le premier abonné, et la fiche qui s'ouvre, relisent aussitôt ;
 *  - serveur muet : `erreur`, sans effacer ce qu'on savait ; une réponse plus
 *    vieille ne recouvre pas une plus fraîche (ni l'écriture de la fiche) ;
 *  - pas encore de `hass` : on réessaie vite, ce n'est pas une panne ;
 *  - désabonner deux fois ne fausse pas le compte.
 * Sur l'état de départ, ce fichier rougit en entier : le module n'existe pas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const E = await import('../src/distributeuretat.js');

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

test('sans abonné, rien ne part ; le premier abonné relit aussitôt, puis toutes les 60 s', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerDistributeurEtat({ hass: s.hass, horloge: h });
  await E.rafraichirDistributeur();
  assert.equal(s.appels.length, 0, 'une lecture sans abonné : le serveur interrogé depuis la racine');
  assert.deepEqual(h.repetitions(), [], 'un sondage sans abonné');
  const fin = E.abonnerDistributeur();
  assert.equal(s.appels.length, 1, 'le premier abonné attend 60 s sa première réponse');
  assert.deepEqual(s.appels[0].msg, { type: 'loggia/distributeurs/etat' }, 'la carte ne demande pas le détail');
  assert.deepEqual(h.repetitions(), [60000]);
  const deux = E.abonnerDistributeur();
  assert.equal(s.appels.length, 1, 'une seconde carte ne relit pas : le cache est partagé');
  assert.deepEqual(h.repetitions(), [60000], 'un seul sondage pour toutes les cartes');
  h.tic();
  assert.equal(s.appels.length, 2);
  fin(); deux();
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
  assert.deepEqual(E.compteDistributeur(), { abonnes: 0, detailles: 0, periode: 0 });
});

test('la fiche ouverte : 15 s et le détail, puis retour à 60 s quand elle se ferme', () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerDistributeurEtat({ hass: s.hass, horloge: h });
  const carte = E.abonnerDistributeur();
  const fiche = E.abonnerDistributeur({ detail: true });
  assert.equal(s.appels.length, 2, 'la fiche qui s’ouvre relit aussitôt, avec le détail');
  assert.deepEqual(s.appels[1].msg, { type: 'loggia/distributeurs/etat', detail: true });
  assert.deepEqual(h.repetitions(), [15000]);
  h.tic();
  assert.deepEqual(s.appels[2].msg, { type: 'loggia/distributeurs/etat', detail: true }, 'tant que la fiche est ouverte, chaque lecture demande le détail');
  fiche();
  fiche();
  assert.deepEqual(E.compteDistributeur(), { abonnes: 1, detailles: 0, periode: 60000 }, 'désabonner deux fois fausse le compte');
  assert.deepEqual(h.repetitions(), [60000]);
  carte();
});

test('la réponse se publie ; un serveur muet se dit sans effacer ce qu’on savait', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerDistributeurEtat({ hass: s.hass, horloge: h });
  let vus = 0;
  const arret = E.ecouterEtatDistributeur(() => { vus += 1; });
  const fin = E.abonnerDistributeur();
  assert.deepEqual(E.lireEtatDistributeur(), { etat: null, erreur: false }, 'en attente : ni état ni panne');
  const instant = E.lireEtatDistributeur();
  assert.equal(E.lireEtatDistributeur(), instant, 'le même instantané tant que rien ne change (useSyncExternalStore)');
  const ETAT = { source: 'automatisations', automatisations: [] };
  s.appels[0].ok(ETAT);
  await attendre();
  assert.equal(E.lireEtatDistributeur().etat, ETAT);
  assert.equal(vus, 1);
  h.tic();
  s.appels[1].ko({ code: 'unknown_command' });
  await attendre();
  assert.deepEqual(E.lireEtatDistributeur(), { etat: ETAT, erreur: true }, 'une lecture ratée efface le planning qu’on avait');
  // Jamais de réponse : HA pas redémarré, la commande n'existe pas encore.
  E.reglerDistributeurEtat({ hass: s.hass, horloge: h });
  E.abonnerDistributeur();
  s.appels.at(-1).ko({ code: 'unknown_command' });
  await attendre();
  assert.deepEqual(E.lireEtatDistributeur(), { etat: null, erreur: true }, '« Planning indisponible pour l’instant »');
  arret(); fin();
});

test('une réponse plus vieille ne recouvre ni une plus fraîche, ni l’écriture de la fiche', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerDistributeurEtat({ hass: s.hass, horloge: h });
  E.abonnerDistributeur();
  h.tic();
  const [vieille, fraiche] = s.appels;
  fraiche.ok({ n: 2 });
  await attendre();
  vieille.ok({ n: 1 });
  await attendre();
  assert.deepEqual(E.lireEtatDistributeur().etat, { n: 2 }, 'la réponse d’avant a recouvert la plus récente');
  h.tic();
  const enVol = s.appels.at(-1);
  E.poserEtatDistributeur({ n: 'écrit' });
  enVol.ok({ n: 3 });
  await attendre();
  assert.deepEqual(E.lireEtatDistributeur().etat, { n: 'écrit' }, 'une lecture partie avant l’écriture l’a recouverte');
  h.tic();
  s.appels.at(-1).ok({ n: 4 });
  await attendre();
  assert.deepEqual(E.lireEtatDistributeur().etat, { n: 4 }, 'la lecture suivante reprend la main');
});

test('pas encore de hass : on réessaie vite, sans se dire en panne', async () => {
  const h = horlogeFactice();
  // La source réelle (getHass) n'a pas de document ici : null, comme au démarrage de l'application.
  E.reglerDistributeurEtat({ hass: null, horloge: h });
  const fin = E.abonnerDistributeur();
  assert.deepEqual(E.lireEtatDistributeur(), { etat: null, erreur: false }, 'pas de pont n’est pas une panne');
  assert.deepEqual(h.attentes(), [2000], 'sans hass, la carte attendrait 60 s sa première réponse');
  E.rafraichirDistributeur();
  assert.deepEqual(h.attentes(), [2000], 'une seule relance à la fois');
  fin();
  assert.deepEqual(h.attentes(), [], 'plus d’abonné : la relance part avec lui');
});

test('le crochet : abonné tant que monté et configuré, jamais depuis la racine', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/distributeuretat.js', import.meta.url), 'utf8');
  assert.ok(src.includes('useEffect(() => (actif ? abonnerDistributeur({ detail }) : undefined), [actif, detail]);'), 'le crochet s’abonne au montage et se désabonne au démontage');
  assert.ok(src.includes('return useSyncExternalStore(ecouterEtatDistributeur, lireEtatDistributeur, lireEtatDistributeur);'));
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  // Deux abonnés seulement : la carte et la fiche, et aucun ailleurs.
  assert.equal((app.match(/useEtatDistributeur\(/g) || []).length, 2, 'un abonné de plus : le serveur serait interrogé hors de la carte et de la fiche');
  assert.ok(app.includes('useEtatDistributeur(distributeurConfigure());'), 'la carte, tant qu’elle est montée et le distributeur configuré');
  assert.ok(app.includes('useEtatDistributeur(distributeurConfigure(), { detail: true });'), 'la fiche, avec le détail');
});
