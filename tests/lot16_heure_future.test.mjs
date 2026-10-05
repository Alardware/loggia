/* Une heure À VENIR n'est pas « À l'instant » (lot 16, 05/10).
 *
 * `relTime` (format.js) calculait `maintenant - date` et rendait « À l'instant »
 * pour tout ce qui passait sous 60 s — donc pour TOUT le futur, l'écart y est
 * négatif. La fiche d'un appareil (`LigneEntite`, App.jsx) lui passe chaque
 * capteur horodaté : la prochaine alarme du téléphone, le prochain lever du
 * soleil, la prochaine collecte s'affichaient « À l'instant ». La tuile d'une
 * entité `datetime` (CvCard) aussi.
 *
 * Ce qui est vérifié : le passé ne bouge pas d'une lettre ; une petite avance
 * (une minute au plus : l'horloge de la tablette qui retarde sur celle de HA)
 * reste « À l'instant » ; au-delà, l'heure dite telle quelle, au plus court
 * sans mentir — l'heure seule aujourd'hui, le jour court dans les six jours,
 * la date au-delà, l'année si ce n'est pas celle-ci. Les jours se comptent au
 * calendrier : 23 h 30 → 0 h 30 est demain, et le dimanche du passage à
 * l'heure d'hiver (25 h) reste « aujourd'hui » jusqu'à son 23 h 30.
 *
 * L'heure seule s'épingle en toutes lettres. Le jour et la date, eux, ont une
 * ponctuation qu'ICU change d'une version à l'autre (relecture du 05/10 : la CI
 * tourne sous Node 22, ce poste sous Node 25) : on les compare à `Intl` avec
 * les options ATTENDUES — c'est le choix du format qui est épinglé — et l'on
 * vérifie le sens par les morceaux (le jour, le mois, l'année, l'heure).
 *
 * La langue est FIXÉE avant le premier import (règle de la CI), le fuseau
 * aussi (les heures attendues sont celles de Paris), et `Date.now` est figé le
 * temps d'un appel. L'anglais se demande ensuite par `preparerLangue`, en
 * dernier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { relTime } = await import('../src/format.js');
const { langue, preparerLangue } = await import('../src/i18n.js');

/* Intl glisse des espaces insécables (fines ou non) entre ses morceaux. */
const net = (s) => s.replace(/[\s  ]/g, ' ');

/* Lundi 5 octobre 2026, 14 h à Paris. */
const MAINTENANT = Date.UTC(2026, 9, 5, 12, 0, 0);
function aFige(fn, quand = MAINTENANT) {
  const avant = Date.now;
  Date.now = () => quand;
  try { return fn(); } finally { Date.now = avant; }
}
const dans = (s, depuis = MAINTENANT) => new Date(depuis + s * 1000).toISOString();
const ilYA = (s) => dans(-s);

/* Les trois formats attendus, tels qu'Intl les écrit dans la langue donnée. */
const HEURE = { hour: '2-digit', minute: '2-digit' };
const JOUR = { weekday: 'short', ...HEURE };
const DATE = { day: 'numeric', month: 'short', ...HEURE };
const ANNEE = { ...DATE, year: 'numeric' };
const intl = (loc, iso, o) => net(new Date(iso).toLocaleString(loc, o));

test('le fuseau du test est bien Paris', () => {
  assert.equal(new Date(MAINTENANT).getHours(), 14, 'process.env.TZ n’a pas pris');
  assert.equal(new Date(MAINTENANT).getDay(), 1, 'le 5 octobre 2026 est un lundi');
});

test('relTime : le passé ne change pas d’une lettre', () => {
  aFige(() => {
    assert.equal(relTime(ilYA(0)), 'À l\'instant');
    assert.equal(relTime(ilYA(30)), 'À l\'instant');
    assert.equal(relTime(ilYA(59)), 'À l\'instant');
    assert.equal(relTime(ilYA(60)), 'Il y a 1 min');
    assert.equal(relTime(ilYA(3 * 60)), 'Il y a 3 min');
    assert.equal(relTime(ilYA(2 * 3600)), 'Il y a 2 h');
    assert.equal(relTime(ilYA(5 * 86400)), 'Il y a 5 j');
    assert.equal(relTime(ilYA(400 * 86400)), 'Il y a 400 j');
  });
  for (const rien of ['pas une date', '', null, undefined]) assert.equal(relTime(rien), '', String(rien));
});

test('relTime : une petite avance reste « À l’instant » (horloge qui retarde)', () => {
  aFige(() => {
    assert.equal(relTime(dans(1)), 'À l\'instant');
    assert.equal(relTime(dans(30)), 'À l\'instant');
    assert.equal(relTime(dans(60)), 'À l\'instant', 'à 60 s pile, encore le décalage d’horloge');
  });
});

test('relTime : une date À VENIR dit son heure, pas « À l’instant »', () => {
  aFige(() => {
    assert.equal(net(relTime(dans(61))), '14:01', 'au-delà d’une minute');
    assert.equal(net(relTime(dans(2 * 3600))), '16:00', 'plus tard aujourd’hui : l’heure seule');
    // Le prochain réveil : mardi 7 h à Paris (5 h UTC). Demain : le jour court.
    const reveil = '2026-10-06T05:00:00+00:00';
    assert.equal(net(relTime(reveil)), intl('fr-FR', reveil, JOUR));
    assert.match(net(relTime(reveil)), /^mar\.,? 07:00$/);
    // Dans six jours, le nom du jour ne désigne encore qu'une date.
    assert.equal(net(relTime(dans(6 * 86400))), intl('fr-FR', dans(6 * 86400), JOUR));
    assert.match(net(relTime(dans(6 * 86400))), /^dim\.,? 14:00$/);
    // Une semaine pile : « lun. 14:00 » se lirait comme aujourd'hui → la date.
    const semaine = dans(7 * 86400);
    assert.equal(net(relTime(semaine)), intl('fr-FR', semaine, DATE));
    assert.match(net(relTime(semaine)), /^12 oct\..*14:00$/);
    assert.doesNotMatch(net(relTime(semaine)), /lun|2026/, 'ni le jour, ni l’année en cours');
    const noel = '2026-12-24T19:30:00+01:00';
    assert.equal(net(relTime(noel)), intl('fr-FR', noel, DATE));
    assert.match(net(relTime(noel)), /^24 déc\..*19:30$/);
    // Un certificat qui expire l'an prochain : sans l'année, la date mentirait.
    const certificat = '2027-01-15T08:00:00Z';
    assert.equal(net(relTime(certificat)), intl('fr-FR', certificat, ANNEE));
    assert.match(net(relTime(certificat)), /^15 janv\. 2027.*09:00$/);
  });
});

test('relTime : les jours se comptent au calendrier, pas par 24 h', () => {
  // Lundi 23 h 30 : une heure plus tard, c'est déjà mardi.
  const soir = Date.UTC(2026, 9, 5, 21, 30, 0);
  aFige(() => {
    assert.equal(net(relTime(dans(3600, soir))), intl('fr-FR', dans(3600, soir), JOUR));
    assert.match(net(relTime(dans(3600, soir))), /^mar\.,? 00:30$/);
    assert.equal(net(relTime(dans(20 * 60, soir))), '23:50');
  }, soir);
  // Dimanche 25 octobre 2026, passage à l'heure d'hiver : la journée dure 25 h.
  // De 0 h 30 à 23 h 30, 24 h passent — et c'est toujours aujourd'hui.
  const nuit = Date.UTC(2026, 9, 24, 22, 30, 0);
  aFige(() => {
    assert.equal(new Date(nuit).getHours(), 0);
    assert.equal(net(relTime(dans(24 * 3600, nuit))), '23:30', 'une journée de 25 h');
  }, nuit);
});

test('relTime en anglais : les mots de la langue, l’heure d’Intl', async () => {
  await import('../src/langues/en.js');
  for (let i = 0; i < 100 && langue() !== 'en'; i++) {
    preparerLangue({ language: 'en' });
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(langue(), 'en', 'le catalogue anglais ne s’est pas chargé');
  aFige(() => {
    assert.equal(relTime(ilYA(30)), 'Just now');
    assert.equal(relTime(ilYA(3 * 60)), '3 min ago');
    assert.equal(relTime(dans(30)), 'Just now');
    assert.equal(net(relTime(dans(2 * 3600))), '16:00', 'en-GB : 24 h, comme le reste de l’écran');
    const reveil = '2026-10-06T05:00:00+00:00';
    assert.equal(net(relTime(reveil)), intl('en-GB', reveil, JOUR));
    assert.match(net(relTime(reveil)), /^Tue,? 07:00$/);
    assert.equal(net(relTime(dans(7 * 86400))), intl('en-GB', dans(7 * 86400), DATE));
    assert.match(net(relTime(dans(7 * 86400))), /^12 Oct.*14:00$/);
    assert.equal(net(relTime('2027-01-15T08:00:00Z')), intl('en-GB', '2027-01-15T08:00:00Z', ANNEE));
    assert.match(net(relTime('2027-01-15T08:00:00Z')), /^15 Jan 2027.*09:00$/);
  });
});
