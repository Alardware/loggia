/* Un refus du composant se dit par son CODE (audit du 03/10).
 *
 * Le composant refusait en français sans accents — « trop de scenarios (24 au
 * plus) », « valeur trop volumineuse pour la cle … » —, et l'écran affichait
 * ce texte tel quel, dans les sept langues : la fiche d'un scénario, le
 * planning d'un robot, l'import, le sondage des règles. Le toast reconnaissait
 * même le passage refusé vers un profil Admin à une expression sur ce
 * français.
 *
 * Ici : la table code → phrase (`src/refus.js`, rejouée par import), l'accord
 * entre les codes que le composant envoie et ceux que l'écran sait dire, et le
 * câblage des écrans qui affichaient le motif brut. Quel refus porte quel code
 * côté serveur : tests/python/test_websocket_api_execution.py.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { texteRefus, raisonEchec, enregistrerRefus } = await import('../src/refus.js');
/* MODIFIÉ (relecture des tâches 11 et 12 du chantier Chauffage) : les refus
 * de la configuration et de la maison du planning de chauffe sont sortis du
 * démarrage ; la fiche d'un chauffage et la barre « Maison », les seules à
 * pouvoir les recevoir, les enregistrent en se chargeant. L'écran les sait
 * donc dire une fois l'une d'elles chargée — enregistrés ici comme elles le
 * font (tests/chauffage_refus.test.mjs tient le partage). */
enregistrerRefus((await import('../src/refuschauffage.js')).REFUS_CHAUFFAGE);
/* ASSERTION MODIFIÉE (chantier IoT, tâche 4, 18/10 ; I3 A) : les refus d'un
 * départ de robot (`loggia/robots/lancer`) se chargent à la demande, au
 * premier refus (refusrobots.js) ; enregistrés ici comme l'écran le fait. */
enregistrerRefus((await import('../src/refusrobots.js')).REFUS_ROBOTS);

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const refus = (code, message) => ({ code, message });

test('une limite atteinte se dit dans la langue de l’écran, et la limite y est', () => {
  assert.equal(texteRefus(refus('trop_de_scenarios', 'trop de scenarios personnels, au plus : 24')),
    'Scénario non enregistré — 24 scénarios personnels au plus');
  assert.equal(texteRefus(refus('trop_d_actions', 'trop d\'actions (13), au plus : 12')),
    'Scénario non enregistré — 12 actions au plus');
  assert.equal(texteRefus(refus('trop_de_plannings', 'trop de plannings, au plus : 24')),
    'Planning non enregistré — 24 plannings au plus');
  // Par `raisonEchec` aussi : la fiche d'un scénario et celle d'un robot y passent.
  assert.equal(raisonEchec(refus('trop_de_scenarios', 'trop de scenarios personnels, au plus : 24')),
    'Scénario non enregistré — 24 scénarios personnels au plus', 'le motif du serveur revient dans la phrase de dernier recours');
  // Une limite que le composant ne nomme pas : la phrase aurait un trou à la
  // place du nombre. Rien de juste à dire — le dernier recours garde le motif.
  assert.equal(texteRefus(refus('trop_d_actions', 'trop d\'actions (13 > 12)')), null);
  assert.equal(raisonEchec(refus('trop_d_actions', 'trop d\'actions (13 > 12)')),
    'Réglage non enregistré — le composant l’a refusé : trop d\'actions (13 > 12)');
});

/* TEST AJOUTÉ (chantier IoT, tâche 4, 18/10 ; I3 A) : ce que le serveur
 * nomme — l'identifiant d'un robot, d'une zone — ne s'affiche jamais. */
test('un départ de robot refusé se dit, sans l’identifiant que le serveur nomme', () => {
  /* ASSERTION MODIFIEE (26/10, petit paquet) : `robot_injoignable` revient aussi pour une pause, une reprise, un retour à la base ou
   * « Localiser » par script (`_async_lancer_script`, robots.py), et le refus ne porte pas le geste : la phrase est neutre. */
  assert.equal(texteRefus(refus('robot_injoignable', 'robot injoignable : vacuum.robot')), 'Commande non envoyée — le robot ne répond pas');
  assert.equal(texteRefus(refus('deja_en_route', 'deja en route : vacuum.robot')), 'Départ non lancé — le robot est déjà en route');
  assert.equal(texteRefus(refus('pieces_inconnues', 'pieces inconnues de cette integration : vacuum.robot')),
    'Départ non lancé — Loggia ne sait pas viser des pièces avec ce robot');
  assert.equal(texteRefus(refus('zone_inconnue', 'zone inconnue de ce robot : switch.voisin_zone')),
    'Départ non lancé — cette zone n’appartient pas au robot');
  assert.equal(texteRefus(refus('commande_refusee', 'commande refusee par Home Assistant : vacuum.robot')),
    'Départ non lancé — Home Assistant a refusé la commande');
});

test('le passage refusé vers un profil Admin a son code, et sa phrase', () => {
  assert.equal(texteRefus(refus('code_admin_requis', 'le code administrateur est requis pour ce profil')),
    'Profil non changé — le code administrateur est requis');
  assert.equal(texteRefus(refus('code_admin_requis', 'le code administrateur n\'a pas pu etre verifie')),
    'Profil non changé — le code administrateur est requis', 'les deux motifs du composant, une seule phrase');
});

test('trop volumineux : la clé que le composant nomme, sinon celle que l’écran écrivait', () => {
  // `_payload_too_big` (websocket_api.py) : la clé après les deux-points.
  assert.equal(texteRefus(refus('payload_too_large', 'valeur trop volumineuse (300000 octets) : loggia_rooms')),
    '« loggia_rooms » non enregistré — trop volumineux');
  // Un plafond du commun ne nomme rien : l'écran sait ce qu'il écrivait.
  assert.equal(raisonEchec(refus('payload_too_large', 'stockage commun trop volumineux (1100000 > 1048576 octets)'), 'loggia_volets'),
    '« loggia_volets » non enregistré — trop volumineux');
  assert.equal(texteRefus(refus('payload_too_large', 'charge totale trop volumineuse (2000000 octets)')),
    'Réglage non enregistré — trop volumineux');
});

test('un code que la table ne connaît pas, ou une coupure : le dernier recours, traduit', () => {
  assert.equal(texteRefus(refus('invalid_format', 'famille inconnue : arrosage')), null);
  assert.equal(texteRefus(refus('toString', 'x')), null, 'un code n’est pas une propriété héritée de la table');
  for (const e of [null, undefined, 3, new Error('socket'), { error: { code: 3, message: 'Connection lost' } }]) {
    assert.equal(texteRefus(e), null, String(e));
  }
  assert.equal(raisonEchec(refus('invalid_format', 'famille inconnue : arrosage')),
    'Réglage non enregistré — le composant l’a refusé : famille inconnue : arrosage');
});

test('chaque code que le composant envoie, l’écran sait le dire', () => {
  const dossier = join(RACINE, 'custom_components', 'loggia');
  const py = readdirSync(dossier).filter(f => f.endsWith('.py'))
    .map(f => lire('custom_components', 'loggia', f)).join('\n');
  const codes = new Set([...py.matchAll(/RefusNomme\(\s*"([a-z_]+)"/g)].map(m => m[1]));
  assert.ok(codes.size >= 4, 'les refus nommés du composant sont illisibles : ' + [...codes].join(', '));
  assert.ok(lire('custom_components', 'loggia', 'websocket_api.py').includes('connection.send_error(msg["id"], "code_admin_requis", refus)'),
    'le passage refusé vers un profil Admin a perdu son code');
  for (const code of [...codes, 'code_admin_requis', 'not_admin']) {
    assert.ok(texteRefus(refus(code, 'motif : 1')), code + ' : le composant l’envoie, l’écran ne sait pas le dire');
  }
});

test('le câblage : plus de motif brut à l’écran, plus d’expression sur le français', () => {
  const app = lire('src', 'App.jsx');
  assert.ok(!app.includes('/code administrateur/i'), 'le toast relit de nouveau le motif français du composant');
  assert.ok(app.includes(": texteRefus(r) || tr('Commande non exécutée — Home Assistant a refusé ou n’a pas répondu');"),
    'les refus prévisibles ne passent plus par la table au toast');
  // ASSERTION MODIFIÉE (contre-relecture du lot 3 des capteurs) : la fiche d'un scénario est chargée à la demande — fichescenario.jsx.
  const fs = lire('src', 'fichescenario.jsx');
  const i = fs.indexOf('function FicheScenario(');
  const fiche = fs.slice(i, fs.indexOf('const valider = (close) =>', i));
  assert.ok(fiche.includes('setErr(estRefus(e) ? raisonEchec(e)'), 'la fiche d’un scénario affiche de nouveau le motif du serveur');
  const ui = lire('src', 'ui.jsx');
  const sondage = ui.slice(ui.indexOf('export function useEtatServeur('), ui.indexOf('export function RegleEntete('));
  assert.ok(!sondage.includes('e.message'), 'le sondage affiche de nouveau le motif du serveur');
  assert.ok(sondage.includes("setErr(siErreur || tr('Réglages indisponibles.'))"), 'une lecture ratée ne se dit plus par le repli traduit');
  assert.ok(!lire('src', 'ficherobot.jsx').includes("((e && (e.message || e.code)) || tr('Enregistrement impossible.'))"),
    'un planning de trop s’affiche de nouveau en français sans accents');
  assert.ok(lire('src', 'views', 'parametres.jsx').includes('return texteRefus(err) || err.message;'), 'l’import redit le motif du serveur');
  for (const [vue, repli] of [['journal', 'Impossible de rendre la main.'], ['interrupteurs', 'L’écoute ne répond pas.']]) {
    assert.ok(!lire('src', 'views', vue + '.jsx').includes(`(e && (e.message || e.code)) || tr('${repli}')`),
      vue + '.jsx : « Unauthorized » ou le motif du composant reviennent à l’écran');
  }
});
