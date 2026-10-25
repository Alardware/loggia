/* L'ALLEMAND TUTOIE, COMME HOME ASSISTANT (19/10).
 *
 * Sa décision : le français vouvoie ; l'allemand, l'espagnol, l'italien et le
 * néerlandais tutoient comme l'interface de Home Assistant ; le polonais de
 * Seba882 ne se réécrit jamais. L'italien et le néerlandais ont leur garde
 * (tests/langues_registre_it_nl.test.mjs) ; voici celle de l'allemand.
 *
 * Relu valeur par valeur — compter les « Sie » ne suffit pas : en tête de
 * phrase, « Sie zeigt sich hier » ou « Sie gehen sofort aus » parlent de la
 * télécommande et des lampes (« elle », « elles »), pas de la personne. La
 * forme de politesse, c'est un « Sie », « Ihnen » ou « Ihr… » en MAJUSCULE au
 * fil de la phrase (« bis Sie ihn ändern », « Prüfen Sie, ob… », « Von Ihnen
 * hinzugefügt ») ; « ihr », « ihre » en minuscule restent « son », « leur ».
 * Vingt-et-une valeurs vouvoyaient (20/10) : six du plan 3D, trois du
 * chauffage, deux de la portée Zigbee, deux des fenêtres la nuit, cinq des
 * plantes et des piles, trois du mode enfant et de l'assistant. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DE = (await import(pathToFileURL(join(RACINE, 'src', 'langues', 'de.js')).href)).default;

// Toutes les valeurs, formes de pluriel comprises.
const valeurs = (cat) => Object.values(cat).flatMap(v => (typeof v === 'string' ? [v] : Object.values(v || {})))
  .filter(v => typeof v === 'string');

/* Un « Sie », « Ihnen » ou « Ihr… » majuscule précédé, dans la MÊME phrase,
 * d'au moins une lettre : jamais en tête de phrase (après `.`, `!`, `?`, `:`
 * ou au début), où la majuscule ne dit rien. Bornes de mot Unicode :
 * « Sieb » ou « Ihrer » dans « Ihrerseits » ne sont pas pris à part. */
const SIE = /(?<=\p{L}[^.!?:]*)(?<!\p{L})(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
const politesseDe = (v) => SIE.test(v);

test('la règle voit la forme de politesse, et laisse passer « elle » en tête de phrase', () => {
  for (const v of ['Diese Heizung behält ihren Sollwert von {t}, bis Sie ihn ändern.', 'Prüfen Sie, ob sie eingesteckt ist.',
    'Von Ihnen hinzugefügt', 'übrig, davon {n} Min. von Ihnen gewährt', 'Tippen Sie auf ein Objekt im Grundriss.',
    'Gibt es denselben Grundriss als .glb, nehmen Sie diese.'])
    assert.ok(politesseDe(v), 'allemand non vu : ' + v);
  for (const v of ['Noch nichts. Drücke eine Taste deiner Fernbedienung: Sie zeigt sich hier.', '{n} dieser Lampen können nicht ausblenden: Sie gehen sofort aus.',
    'Sie gilt für die nächsten Portionen.', 'Diese Heizung behält ihren Sollwert von {t}, bis du ihn änderst.',
    'Tippe auf ein Objekt im Grundriss.', 'Von dir hinzugefügt', 'Deine Durchsage: ich komme nach Hause', 'Ihre Durchsage'])
    assert.ok(!politesseDe(v), 'allemand vu à tort : ' + v);
});

test('aucune valeur allemande ne vouvoie', () => {
  const v = valeurs(DE);
  assert.ok(v.length > 2500, 'la lecture du catalogue a échoué : ' + v.length);
  assert.deepEqual(v.filter(politesseDe), []);
});

test('les valeurs reprises le 20/10 tutoient, et leurs clés n’ont pas bougé', () => {
  const attendu = {
    'Le fichier est arrivé incomplet. Réessayez.': 'Die Datei kam unvollständig an. Versuch es noch einmal.',
    'Touchez un objet du plan pour le relier à un appareil ou à une pièce.': 'Tippe auf ein Objekt im Grundriss, um es mit einem Gerät oder Raum zu verknüpfen.',
    'Ce chauffage garde son réglage jusqu’à ce que vous le changiez.': 'Diese Heizung behält ihre Einstellung, bis du sie änderst.',
    'Pensez à la fermer avant de dormir.': 'Denk daran, sie vor dem Schlafengehen zu schließen.',
    'Changez la pile.': 'Wechsle die Batterie.',
    'Ajouté par vous': 'Von dir hinzugefügt',
    'Votre annonce : je rentre à la maison': 'Deine Durchsage: ich komme nach Hause',
  };
  for (const [k, v] of Object.entries(attendu)) assert.equal(DE[k], v, k);
  const plan = DE['Ce plan est compressé en Draco, que Loggia ne lit pas encore. Exportez-le sans compression, ou compressé en meshopt.'];
  assert.ok(plan && plan.includes('Exportiere ihn'), 'le Draco vouvoie encore : ' + plan);
});
