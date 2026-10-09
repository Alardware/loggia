// ─────────────────────────────────────────────────────────────────────────────
// Les heures creuses, retrouvées dans l'historique (06/10).
//
// Home Assistant ne publie nulle part les CRÉNEAUX d'un contrat : les
// intégrations de compteur donnent un capteur binaire, vrai quand on y est.
// La barre du tarif se reconstitue donc depuis son historique — la seule
// source qui dise ce qui s'est vraiment passé.
//
// Ce qui se vérifie ici : une plage encore ouverte se ferme sur la fenêtre et
// non sur son dernier changement, un trou coupe la plage au lieu d'être
// comblé, et aucun prix ne s'affirme quand rien ne permet de le choisir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plagesVraies, barreTarif, prixDuMoment, prixEnCours, prochainTarif } from '../src/tarif.js';
import { trouverCreneau } from '../src/creneau.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minuit à minuit, le 6 octobre 2026.
const T0 = new Date(2026, 9, 6, 0, 0).getTime();
const T1 = new Date(2026, 9, 7, 0, 0).getTime();
const h = (n, m = 0) => new Date(2026, 9, 6, n, m).getTime();
const etat = (t, s) => ({ state: s, last_changed: new Date(t).toISOString() });

test('deux créneaux d’heures creuses se retrouvent dans l’historique', () => {
  // Le contrat de la maison : 2 h – 7 h et 13 h – 16 h.
  const p = plagesVraies([
    etat(T0, 'off'), etat(h(2), 'on'), etat(h(7), 'off'),
    etat(h(13), 'on'), etat(h(16), 'off'),
  ], T0, T1);
  assert.equal(p.length, 2);
  assert.equal(new Date(p[0].debut).getHours(), 2);
  assert.equal(new Date(p[0].fin).getHours(), 7);
  assert.equal(new Date(p[1].debut).getHours(), 13);
  assert.equal(new Date(p[1].fin).getHours(), 16);
});

test('une plage encore ouverte se ferme sur la fenêtre', () => {
  // À 14 h 33, le créneau de 13 h court toujours : il doit aller jusqu'au bout
  // de la fenêtre, pas s'arrêter à l'instant du dernier changement.
  const p = plagesVraies([etat(T0, 'off'), etat(h(13), 'on')], T0, h(14, 33));
  assert.equal(p.length, 1);
  assert.equal(p[0].fin, h(14, 33));
});

test('une plage commencée avant la fenêtre part de son bord', () => {
  // L'historique rend d'abord l'état qui courait : il est horodaté AVANT minuit.
  const p = plagesVraies([etat(T0 - 3600e3, 'on'), etat(h(2), 'off')], T0, T1);
  assert.equal(p.length, 1);
  assert.equal(p[0].debut, T0, 'la plage ne commence pas la veille');
});

test('un trou coupe la plage au lieu d’être comblé', () => {
  const p = plagesVraies([
    etat(T0, 'off'), etat(h(2), 'on'), etat(h(3), 'unavailable'), etat(h(4), 'on'), etat(h(7), 'off'),
  ], T0, T1);
  assert.equal(p.length, 2, 'le silence de 3 h à 4 h ne s’invente pas');
  assert.equal(new Date(p[0].fin).getHours(), 3);
  assert.equal(new Date(p[1].debut).getHours(), 4);
});

test('un historique vide ne donne aucune plage', () => {
  assert.deepEqual(plagesVraies([], T0, T1), []);
  assert.deepEqual(plagesVraies(null, T0, T1), []);
  assert.deepEqual(plagesVraies([etat(T0, 'off')], T0, T1), []);
});

test('la barre place chaque créneau à sa place sur la journée', () => {
  const b = barreTarif([{ debut: h(2), fin: h(7) }, { debut: h(13), fin: h(16) }], T0, T1);
  assert.equal(b.length, 2);
  // 2 h sur 24 font un douzième de la barre ; 5 h en font cinq vingt-quatrièmes.
  assert.ok(Math.abs(b[0].gauche - 100 / 12) < 0.01, String(b[0].gauche));
  assert.ok(Math.abs(b[0].largeur - 500 / 24) < 0.01, String(b[0].largeur));
  assert.ok(Math.abs(b[1].gauche - 1300 / 24) < 0.01, String(b[1].gauche));
});

test('un créneau de quelques minutes garde un filet visible', () => {
  const b = barreTarif([{ debut: h(2), fin: h(2, 1) }], T0, T1);
  assert.ok(b[0].largeur >= 0.4, 'une minute sur 24 h ne doit pas disparaître');
});

test('le prix du moment suit le capteur binaire', () => {
  const c = { hc: 0.1605, hp: 0.2092 };
  assert.equal(prixDuMoment({ ...c, enHc: true }).valeur, 0.1605);
  assert.equal(prixDuMoment({ ...c, enHc: true }).enHc, true);
  assert.equal(prixDuMoment({ ...c, enHc: false }).valeur, 0.2092);
});

test('sans capteur binaire, deux prix ne permettent pas d’en choisir un', () => {
  // On ne devine pas l'heure creuse à l'horloge : les contrats diffèrent.
  const r = prixDuMoment({ hc: 0.16, hp: 0.21, enHc: null });
  assert.equal(r.valeur, null);
  assert.equal(r.enHc, null);
  assert.equal(r.unique, false);
});

test('un contrat à tarif unique n’a pas de créneau à connaître', () => {
  const r = prixDuMoment({ hc: null, hp: 0.2516, enHc: null });
  assert.equal(r.valeur, 0.2516);
  assert.equal(r.unique, true);
  // Et sans aucun prix, rien ne s'affirme.
  assert.equal(prixDuMoment({}).valeur, null);
  assert.equal(prixDuMoment({ hc: 'cher', hp: undefined }).valeur, null);
});

test('le prochain changement de tarif ne se devine que s’il est dans la journée', () => {
  const plages = [{ debut: h(2), fin: h(7) }, { debut: h(13), fin: h(16) }];
  // En heures creuses à 14 h : la bascule est la fin du créneau en cours.
  const a = prochainTarif(plages, h(14), true);
  assert.equal(a.versHc, false);
  assert.equal(a.instant, h(16));
  // En heures pleines à 10 h : le prochain créneau commence à 13 h.
  const b = prochainTarif(plages, h(10), false);
  assert.equal(b.versHc, true);
  assert.equal(b.instant, h(13));
  // Après le dernier créneau, la journée ne dit rien de demain.
  assert.equal(prochainTarif(plages, h(20), false), null);
  // Sans capteur binaire, on se taît.
  assert.equal(prochainTarif(plages, h(10), null), null);
  assert.equal(prochainTarif([], h(10), false), null);
});

test('Tempo : le tarif en cours est celui dont le compteur TOURNE (09/10)', () => {
  /* « Pour l'energie tout le monde n'est pas en HC HP, ça dépend des
   * contrats. » Tempo a SIX tarifs — bleu, blanc, rouge, chacun en heures
   * creuses et en heures pleines. Le code prenait le moins cher pour
   * « creuses » et le plus cher pour « pleines » : juste a deux tarifs, ou
   * c'est la definition meme du tarif reduit, FAUX a six. Il annoncait le
   * bleu creuses ou le rouge pleines, jamais les quatre autres.
   *
   * On ne devine pas la couleur du jour et on ne lit aucun nom d'entite : un
   * seul compteur TOURNE, celui du tarif en cours ; les autres sont figes
   * depuis des heures ou des jours. */
  const T = Date.parse('2026-10-09T12:00:00Z');
  const h = (n) => T - n * 3600000;
  // Six connexions Tempo. Celle qui a bouge il y a une minute est la bonne.
  const tempo = [
    { prix: 0.1296, instant: h(50), lisible: true },   // bleu creuses, avant-hier
    { prix: 0.1609, instant: h(48), lisible: true },   // bleu pleines
    { prix: 0.1486, instant: h(26), lisible: true },   // blanc creuses
    { prix: 0.1894, instant: h(24), lisible: true },   // blanc pleines
    { prix: 0.1568, instant: T - 60000, lisible: true },  // ROUGE CREUSES : il tourne
    { prix: 0.7562, instant: h(2), lisible: true },    // rouge pleines, ce matin
  ];
  assert.equal(prixEnCours(tempo), 0.1568, 'le prix ne suit plus le compteur qui tourne');
  // Et surtout : ce n'est ni le moins cher ni le plus cher.
  assert.notEqual(prixEnCours(tempo), 0.1296, 'on est revenu au moins cher');
  assert.notEqual(prixEnCours(tempo), 0.7562, 'on est revenu au plus cher');
});

test('un compteur muet ne vote pas, et sans rien de lisible on ne dit rien', () => {
  /* Le `last_changed` d'un capteur devenu `unavailable` dit l'instant ou il
   * s'est taine — pas une consommation. Il gagnerait la comparaison en
   * annoncant un prix qui n'a pas cours. */
  const T = Date.parse('2026-10-09T12:00:00Z');
  assert.equal(prixEnCours([
    { prix: 0.20, instant: T - 3600000, lisible: true },
    { prix: 0.99, instant: T, lisible: false },
  ]), 0.20, 'un compteur muet impose son prix');
  // Rien de lisible, pas de prix, pas d'instant : on se tait.
  assert.equal(prixEnCours([{ prix: 0.2, instant: T, lisible: false }]), null);
  assert.equal(prixEnCours([{ prix: null, instant: T, lisible: true }]), null);
  assert.equal(prixEnCours([{ prix: 0.2, instant: NaN, lisible: true }]), null);
  assert.equal(prixEnCours([]), null);
  assert.equal(prixEnCours(null), null);
});

test('la carte ne bascule sur le compteur qui tourne qu’au-delà de DEUX tarifs', () => {
  /* A un tarif c'est « Tarif unique », a deux le capteur binaire tranche et
   * reste plus reactif (il bascule a l'instant exact, la ou un compteur met
   * quelques minutes a bouger). Et la FICHE garde la main : si elle nomme les
   * deux prix, c'est elle qui decide. */
  const v = readFileSync(join(RACINE, 'src', 'views', 'energiehisto.jsx'), 'utf8');
  assert.ok(v.includes('const multi = num(EN.hcPrice) == null && num(EN.hpPrice) == null && duTableau.length > 2;'),
    'le seuil de bascule a change, ou la fiche a perdu la main');
  assert.ok(v.includes('instant: e ? Date.parse(e.last_changed || e.last_updated || \'\') : NaN'),
    'le mouvement du compteur ne se lit plus');
  assert.ok(v.includes("prix: p.valeur != null ? p.valeur : num(p.entite)"), 'le prix d’une connexion ne se lit plus');
  // Le libelle ne promet pas un creneau qu'on ne connait pas.
  assert.ok(v.includes("prix.multi ? tr('Tarif en cours')"), 'le libelle « Tarif en cours » a disparu');
  /* Et la legende se tait : `hcLu`/`hpLu` valent alors le moins cher et le
   * plus cher de TOUS les creneaux — en Tempo le bleu creuses et le rouge
   * pleines, qui n'ont jamais cours le meme jour. */
  assert.ok(v.includes('{!multi && hcLu != null &&') && v.includes('{!multi && hpLu != null &&'),
    'la legende réaffiche deux prix qui n’ont jamais cours ensemble');
});

test('le capteur de créneau se TROUVE, il ne se désigne plus à la main (09/10)', () => {
  /* Home Assistant ne lui donne ni `device_class` ni role dans le tableau de
   * bord Energie : il n'existait que designe a la main dans les Parametres —
   * en France comme ailleurs. Sans lui, ni barre des vingt-quatre heures, ni
   * « heures pleines a partir de... », et a deux tarifs le prix ne s'affichait
   * meme pas. Cela contredisait « tout operationnel sans configurer ».
   *
   * LA PARENTE NE MARCHE PAS, et c'est la mesure qui l'a dit : premier essai,
   * chercher le capteur aupres des compteurs declares, meme appareil, par
   * analogie avec la batterie. Sur une installation reelle, les compteurs
   * venaient d'une passerelle de teleinformation et le creneau du
   * fournisseur — ni le meme appareil, ni la meme entree de configuration.
   * Rien ne lie les deux : le creneau decrit le CONTRAT, les compteurs
   * decrivent le COMPTEUR.
   *
   * Ce qui marche : la CLE DE TRADUCTION (un identifiant d'integration, pas un
   * nom que l'utilisateur renomme) et l'UNICITE. */
  const maison = [
    { id: 'sensor.compteur_hc', cle: 'hc_consumption', desactive: false },
    { id: 'binary_sensor.compteur_coupure', cle: 'power_cut', desactive: false },
    { id: 'binary_sensor.contrat_creneau', cle: 'hc_active', desactive: false },
    { id: 'binary_sensor.porte', cle: 'door', desactive: false },
  ];
  assert.equal(trouverCreneau(maison), 'binary_sensor.contrat_creneau');
  // Mesure sur une installation reelle : un seul candidat sur 143 capteurs binaires.
  assert.equal(trouverCreneau(maison.filter(e => e.cle !== 'hc_active')), null);
});

test('la découverte du créneau parle plusieurs langues, et se tait quand elle doute', () => {
  const un = (cle, id = 'binary_sensor.x') => trouverCreneau([{ id, cle, desactive: false }]);
  // Les integrations ne parlent pas toutes francais.
  for (const cle of ['hc_active', 'off_peak', 'offpeak_now', 'economy_7', 'low_tariff',
    'niedertarif', 'dal_tarief', 'daluren', 'horas_valle', 'fascia_f3', 'taryfa_nocna', 'tempo_hc']) {
    assert.equal(un(cle), 'binary_sensor.x', `la cle « ${cle} » n’est plus reconnue`);
  }
  /* `hc` est un SIGLE : exige comme mot entier, sinon « technical » suffirait.
   * `fascia` seul veut dire « bandeau » : on exige le numero de tranche. Et
   * `strefa` (« zone ») est ecarte, n'importe quel detecteur peut le porter. */
  for (const cle of ['technical_alarm', 'fascia_led', 'strefa_ruchu', 'motion', 'battery_low', 'problem', '']) {
    assert.equal(un(cle), null, `la cle « ${cle} » passe pour un creneau tarifaire`);
  }
  // Un capteur qui n'est pas binaire ne dit pas un creneau, et un desactive non plus.
  assert.equal(trouverCreneau([{ id: 'sensor.tarif_hc', cle: 'hc_active', desactive: false }]), null);
  assert.equal(trouverCreneau([{ id: 'binary_sensor.x', cle: 'hc_active', desactive: true }]), null);
  /* DEUX candidats : deux contrats, ou un faux positif. On se tait — un
   * creneau faux ferait afficher un prix qui n'a pas cours. */
  assert.equal(trouverCreneau([
    { id: 'binary_sensor.a', cle: 'hc_active', desactive: false },
    { id: 'binary_sensor.b', cle: 'off_peak', desactive: false },
  ]), null);
  assert.equal(trouverCreneau([]), null);
  assert.equal(trouverCreneau(null), null);
});

test('le créneau trouvé complète la fiche, il ne la remplace pas', () => {
  /* Meme regle que tout le reste depuis l'ADR 0164 : la decouverte remplit, la
   * fiche decide quand elle nomme. `enHaids` fusionne deja ainsi — il suffit
   * que `resolveEnergy` publie le role. */
  const r = readFileSync(join(RACINE, 'src', 'resolve.js'), 'utf8');
  assert.ok(r.includes("import { trouverCreneau } from './creneau.js';"), 'la decouverte n’est plus branchee');
  assert.ok(r.includes('hcActive: trouverCreneau(listeEntites(index)),'),
    'le creneau ne se cherche plus dans toute la maison');
  // Il passe par le registre : cle de traduction et entite desactivee.
  assert.ok(r.includes("out.push({ id, cle: (m && m.translationKey) || '', desactive: !!(m && m.disabled) })"),
    'la decouverte ne lit plus la cle de traduction, ou ignore les entites desactivees');
});
