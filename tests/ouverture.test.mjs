/* Une OUVERTURE, sa tuile et sa popup (ADR 0388 ; ses maquettes du 22/11) : ce qui se calcule (src/ouverture.js), où elles se
 * branchent (la carte générique, la fiche d'un binaire, la vue Sécurité), ce que la démo montre, et l'accord avec le serveur
 * (custom_components/loggia/ouvertures.py) sur les délais, le rappel et la nuit.
 *
 * Garanti ici :
 *  - la tuile dit « Ouverte depuis 4 min » / « ouverte à 17:21 », « Fermée » / « depuis 09:12 », « Pile faible : à changer » pour
 *    une fermée à pile faible, « fermée toute la journée » sans changement du jour, « Indisponible » / « plus de signal depuis » ;
 *    ouverte dès minuit, « Ouverte depuis plus de … » — jamais l'heure de `last_changed` seule (ADR 0031) ;
 *  - la popup : « depuis 12 min 03 s » à la seconde, « Ouverte à 17:09 », l'alerte passé le délai — jamais avec « Jamais » ;
 *  - la journée (ouvertures, temps ouvert, dernière, bandes) et la semaine (une ouverture par jour où elle COMMENCE) ;
 *  - le genre : un ouvrant sans nom (`opening`) est « ouvert » ;
 *  - le réglage : une table `{ entité: { delai, nuit } }`, bornée, qui s'efface revenue à rien ;
 *  - la tuile et la popup se chargent à la demande : le démarrage n'en porte que l'adresse. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const O = await import('../src/ouverture.js');
const { maisonCapteursDemo } = await import('../src/demo.js');
const { lireJournee } = await import('../src/journeelue.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const MIN = 60000;
// Un jour PASSÉ : la démo borne son historique à l'heure réelle — un jour à venir y perdrait ses passages de l'après-midi.
const A = (h, m, s = 0) => new Date(2026, 9, 15, h, m, s).getTime();
const MINUIT = A(0, 0);
const iso = (t) => new Date(t).toISOString();
const porte = (state, lc, classe = 'door') => ({ state, last_changed: iso(lc), attributes: { device_class: classe, friendly_name: 'Porte' } });

// ── Le réglage ─────────────────────────────────────────────────────────────

test('le réglage est borné : un délai de la liste, la nuit vraie ou fausse ; rien de choisi, rien ne part', () => {
  assert.deepEqual(O.reglageOuverture(null, 'binary_sensor.x'), { delai: 0, nuit: false });
  assert.deepEqual(O.reglageOuverture({ 'binary_sensor.x': { delai: 7, nuit: 'oui' } }, 'binary_sensor.x'), { delai: 0, nuit: false });
  assert.deepEqual(O.reglageOuverture({ 'binary_sensor.x': { delai: 30, nuit: true } }, 'binary_sensor.x'), { delai: 30, nuit: true });
  assert.deepEqual(O.DELAIS_OUVERTURE, [0, 5, 10, 30]);
});

test('un geste pose son réglage, garde les autres, et s’efface revenu à rien', () => {
  const t1 = O.poserReglage({ 'binary_sensor.a': { delai: 5, nuit: false } }, 'binary_sensor.b', { delai: 10 });
  assert.deepEqual(t1, { 'binary_sensor.a': { delai: 5, nuit: false }, 'binary_sensor.b': { delai: 10, nuit: false } });
  const t2 = O.poserReglage(t1, 'binary_sensor.b', { nuit: true });
  assert.deepEqual(t2['binary_sensor.b'], { delai: 10, nuit: true });
  const t3 = O.poserReglage(O.poserReglage(t2, 'binary_sensor.b', { delai: 0 }), 'binary_sensor.b', { nuit: false });
  assert.deepEqual(Object.keys(t3), ['binary_sensor.a']);
  assert.deepEqual(O.poserReglage(null, 'binary_sensor.c', { delai: 5 }), { 'binary_sensor.c': { delai: 5, nuit: false } });
});

test('le dessin et le genre suivent la classe', () => {
  assert.equal(O.dessinOuverture('door'), 'porte');
  assert.equal(O.dessinOuverture('garage_door'), 'porte');
  assert.equal(O.dessinOuverture('window'), 'fenetre');
  assert.equal(O.dessinOuverture('opening'), 'fenetre');
  assert.equal(O.auMasculin('opening'), true);
  assert.equal(O.auMasculin('door'), false);
});

// ── La journée et la semaine ───────────────────────────────────────────────

const JOUR = [{ t: MINUIT - 3600e3, s: 'off' }, { t: A(7, 32), s: 'on' }, { t: A(7, 35), s: 'off' }, { t: A(12, 25), s: 'on' }, { t: A(12, 40), s: 'off' }, { t: A(17, 9), s: 'on' }];

test('la journée : les épisodes, combien, le temps ouvert, la dernière, celle en cours', () => {
  const j = O.journeeOuverture(JOUR, MINUIT, A(17, 21));
  assert.equal(j.fois, 3);
  assert.equal(j.total, (3 + 15 + 12) * MIN);
  assert.equal(j.derniere, A(17, 9));
  assert.equal(j.finDerniere, null, 'la dernière est en cours');
  assert.deepEqual(j.episodes.map(e => e.enCours), [false, false, true]);
  assert.ok(Math.abs(j.maintenant - (17 * 60 + 21) / 14.4) < 1e-9);
  assert.ok(Math.abs(j.bandes[1].l - (12 * 60 + 25) / 14.4) < 1e-9 && Math.abs(j.bandes[1].w - 15 / 14.4) < 1e-9);
  const ferme = O.journeeOuverture(JOUR.slice(0, 5), MINUIT, A(17, 21));
  assert.equal(ferme.finDerniere, A(12, 40));
});

test('ouverte dès minuit : l’épisode compte, son heure se tait', () => {
  const j = O.journeeOuverture([{ t: MINUIT - 600e3, s: 'on' }, { t: A(8, 0), s: 'off' }], MINUIT, A(9, 0));
  assert.equal(j.fois, 1);
  assert.equal(j.total, 8 * 3600e3);
  assert.equal(j.derniere, null);
});

test('la semaine compte une ouverture le jour où elle COMMENCE, et pas l’état du début de la lecture', () => {
  const debut = MINUIT - 6 * 86400e3;
  const etats = [{ t: debut, s: 'on' }, { t: debut + 3600e3, s: 'off' }, { t: MINUIT - 86400e3 + 3600e3, s: 'on' }, { t: MINUIT - 60e3, s: 'off' }, { t: MINUIT - 30e3, s: 'on' }, { t: A(1, 0), s: 'off' }, { t: A(9, 0), s: 'on' }];
  const s = O.semaineOuverture(etats, A(10, 0));
  assert.deepEqual(s.map(j => j.n), [0, 0, 0, 0, 0, 2, 1]);
  assert.equal(s[6].debut, MINUIT);
  assert.equal(O.totalSemaine(s), '3 ouvertures');
  assert.equal(O.totalSemaine([{ n: 1 }]), '1 ouverture');
});

test('un capteur qui se tait puis revient « ouvert » n’a pas été rouvert : une seule ouverture, comme au serveur', () => {
  const etats = [{ t: MINUIT, s: 'off' }, { t: A(9, 0), s: 'on' }, { t: A(9, 5), s: 'unavailable' }, { t: A(9, 20), s: 'on' }, { t: A(9, 30), s: 'off' }];
  const j = O.journeeOuverture(etats, MINUIT, A(12, 0));
  assert.equal(j.fois, 1);
  assert.equal(j.total, 30 * MIN);
  assert.deepEqual(O.semaineOuverture(etats, A(12, 0)).map(x => x.n)[6], 1);
});

test('la journée garde sa vraie longueur : 25 heures au passage à l’heure d’hiver', () => {
  const debut = new Date(2026, 9, 25).getTime(); // dimanche 25/10/2026, 25 heures à Paris
  const fin = new Date(2026, 9, 25, 23, 0).getTime();
  const j = O.journeeOuverture([{ t: debut, s: 'off' }, { t: new Date(2026, 9, 25, 22, 0).getTime(), s: 'on' }], debut, fin);
  assert.ok(Math.abs(j.maintenant - 24 / 25 * 100) < 1e-9, 'maintenant à 24 h sur 25');
  assert.ok(j.bandes[0].l + j.bandes[0].w <= 100);
});

test('la tuile relit sa journée quand la porte change ; la popup voit l’ouverture de la veille pour son alerte', () => {
  assert.match(lire('src/carteouverture.jsx'), /useJournee\(hass, \[id\], st \? st\.last_changed : null\)/);
  assert.match(lire('src/journeelue.js'), /export function useJournee\(hass, ids, relire = null\)[\s\S]*\}, \[connecte, sig, jour, relire\]\);/);
  assert.match(lire('src/ficheouverture.jsx'), /const depuisAlerte = depuis != null \? depuis : etats \? depuisQuand\(etats, semaine\.debut, st\) : null;/);
});

test('l’état vivant complète la lecture quand l’enregistreur n’a pas encore écrit le changement', () => {
  const lu = [{ t: MINUIT, s: 'off' }];
  assert.deepEqual(O.etatsVivants(lu, porte('on', A(9, 2)), MINUIT), [{ t: MINUIT, s: 'off' }, { t: A(9, 2), s: 'on' }]);
  assert.deepEqual(O.etatsVivants(lu, porte('off', A(9, 2)), MINUIT), lu);
});

// ── La tuile ───────────────────────────────────────────────────────────────

test('la tuile, ouverte : « Ouverte depuis 4 min » et « ouverte à 17:21 », à l’heure de l’historique', () => {
  const v = O.vueTuileOuverture({ st: porte('on', A(17, 21)), etats: [{ t: MINUIT, s: 'off' }, { t: A(17, 21), s: 'on' }], debut: MINUIT, maintenant: A(17, 25) });
  assert.deepEqual([v.ton, v.etat, v.sous], ['ouvert', 'Ouverte depuis 4 min', 'ouverte à 17:21']);
});

test('la tuile, ouverte depuis la veille : « depuis plus de » ce qu’on sait — jamais l’heure du redémarrage', () => {
  const v = O.vueTuileOuverture({ st: porte('on', A(3, 12)), etats: [{ t: MINUIT, s: 'on' }], debut: MINUIT, maintenant: A(9, 12) });
  assert.deepEqual([v.etat, v.sous], ['Ouverte depuis plus de 9 h 12', 'ouverte avant minuit']);
  const pasLue = O.vueTuileOuverture({ st: porte('on', A(3, 12)), etats: null, debut: MINUIT, maintenant: A(9, 12) });
  assert.deepEqual([pasLue.etat, pasLue.sous], ['Ouverte', null]);
});

test('la tuile, fermée : « depuis 09:12 », la pile faible d’abord, « fermée toute la journée » sans changement', () => {
  const etats = [{ t: MINUIT, s: 'off' }, { t: A(8, 0), s: 'on' }, { t: A(9, 12), s: 'off' }];
  assert.deepEqual(O.vueTuileOuverture({ st: porte('off', A(9, 12)), etats, debut: MINUIT, maintenant: A(10, 0) }).sous, 'depuis 09:12');
  assert.equal(O.vueTuileOuverture({ st: porte('off', A(9, 12)), etats, debut: MINUIT, faible: true }).sous, 'Pile faible : à changer');
  const calme = O.vueTuileOuverture({ st: porte('off', A(3, 0)), etats: [{ t: MINUIT, s: 'off' }], debut: MINUIT });
  assert.deepEqual([calme.ton, calme.etat, calme.sous], [null, 'Fermée', 'fermée toute la journée']);
});

test('la tuile, muette : « Indisponible » et « plus de signal depuis 16:55 »', () => {
  const v = O.vueTuileOuverture({ st: porte('unavailable', A(16, 55)), etats: [], debut: MINUIT });
  assert.deepEqual([v.ton, v.muet, v.etat, v.sous], ['muet', true, 'Indisponible', 'plus de signal depuis 16:55']);
  assert.equal(O.vueTuileOuverture({ st: null, etats: null, debut: MINUIT }).etat, 'Indisponible');
});

test('un ouvrant sans nom se dit au masculin', () => {
  const st = porte('on', A(17, 21), 'opening');
  assert.equal(O.vueTuileOuverture({ st, etats: [{ t: A(17, 21), s: 'on' }], debut: MINUIT, maintenant: A(17, 25) }).etat, 'Ouvert depuis 4 min');
  assert.equal(O.vueTuileOuverture({ st: porte('off', A(1, 0), 'opening'), etats: [{ t: MINUIT, s: 'off' }], debut: MINUIT }).sous, 'fermé toute la journée');
  assert.equal(O.alerteOuverture({ st, depuis: A(17, 0), delai: 10, maintenant: A(17, 21) }), 'Ouvert depuis plus de 10 min. Pensez à le fermer.');
  assert.equal(O.motsOuverture('opening').prevenir, 'Me prévenir s’il reste ouvert');
});

// ── La popup ───────────────────────────────────────────────────────────────

test('le haut de la popup : à la seconde ouverte, « Fermée depuis » fermée', () => {
  const ouverte = O.vueHautOuverture({ st: porte('on', A(17, 9)), jour: {}, depuis: A(17, 9), debut: MINUIT, maintenant: A(17, 21, 3) });
  assert.deepEqual([ouverte.etat, ouverte.depuis, ouverte.sous], ['Ouverte', 'depuis 12 min 03 s', 'Ouverte à 17:09']);
  const fermee = O.vueHautOuverture({ st: porte('off', A(17, 4)), jour: { finDerniere: A(17, 4) }, depuis: A(17, 4), debut: MINUIT, maintenant: A(17, 21) });
  assert.deepEqual([fermee.etat, fermee.depuis, fermee.sous], ['Fermée', 'depuis 17:04', 'Fermée depuis 17 min']);
  const calme = O.vueHautOuverture({ st: porte('off', A(1, 0)), jour: { finDerniere: null }, depuis: null, debut: MINUIT, maintenant: A(17, 21) });
  assert.deepEqual([calme.depuis, calme.sous], ['toute la journée', 'Aucune ouverture aujourd’hui']);
  assert.equal(O.dureeVive(45e3), '45 s');
  assert.equal(O.dureeVive(65 * MIN), '1 h 05');
});

test('l’alerte de la popup : passé le délai seulement, jamais avec « Jamais », jamais fermée', () => {
  const st = porte('on', A(17, 9));
  assert.equal(O.alerteOuverture({ st, depuis: A(17, 9), delai: 10, maintenant: A(17, 21) }), 'Ouverte depuis plus de 10 min. Pensez à la fermer.');
  assert.equal(O.alerteOuverture({ st, depuis: A(17, 9), delai: 30, maintenant: A(17, 21) }), null);
  assert.equal(O.alerteOuverture({ st, depuis: A(17, 9), delai: 0, maintenant: A(17, 21) }), null);
  assert.equal(O.alerteOuverture({ st: porte('off', A(17, 9)), depuis: A(17, 9), delai: 5, maintenant: A(17, 21) }), null);
  assert.equal(O.alerteOuverture({ st, depuis: null, delai: 5, maintenant: A(17, 21) }), null);
});

test('une ligne de la liste : « 12:25 → 12:40 » et « 15 min » ; en cours, « → maintenant » et « en cours »', () => {
  assert.deepEqual(O.ligneEpisode({ a: A(12, 25), b: A(12, 40), enCours: false }), { plage: '12:25 → 12:40', duree: '15 min', enCours: false });
  assert.deepEqual(O.ligneEpisode({ a: A(17, 9), b: A(17, 21), enCours: true }), { plage: '17:09 → maintenant', duree: 'en cours', enCours: true });
});

// ── Les branchements ───────────────────────────────────────────────────────

test('la carte générique charge la tuile d’une ouverture à la demande, et plus le dessin d’avant', () => {
  const src = lire('src/cartes/generique.jsx');
  assert.match(src, /lazyRecharge\(\(\) => import\('\.\.\/carteouverture\.jsx'\)\)/);
  assert.match(src, /if \(ouvrant\) \{[\s\S]{0,400}<CarteOuvertureContent id=\{id\} hass=\{hass\} nom=\{nom\} ico=\{ico\} pile=\{pile\} onOpen=\{onOpen\} \/>/);
  assert.doesNotMatch(src, /IlluOuvrant/);
  assert.doesNotMatch(src, /from '\.\.\/carteouverture\.jsx'/, 'jamais un import statique : le démarrage la porterait');
});

test('la fiche d’un binaire ouvre la popup des ouvertures pour leurs classes, la fiche d’avant pour les autres', () => {
  const src = lire('src/appareils/fiches.jsx');
  assert.match(src, /const FicheOuvertureContent = lazyRecharge\(\(\) => import\('\.\.\/ficheouverture\.jsx'\)\);/);
  assert.match(src, /\{OUVRANT_DCS\.indexOf\(classe\) >= 0\s*\? <FicheOuvertureContent [^>]*briques=\{BRIQUES_CAPTEUR\}/);
  assert.match(src, /: <FicheBinaireContent /);
});

test('la popup : l’en-tête commun (une seule croix), pas de feuille à elle, le rappel aux administrateurs seulement', () => {
  const src = lire('src/ficheouverture.jsx');
  assert.equal((src.match(/<EnteteFiche /g) || []).length, 1);
  assert.doesNotMatch(src, /<BottomSheet|<CroixFeuille/);
  assert.match(src, /const reglable = !compteOrdinaire\(hass\);/);
  assert.match(src, /\{reglable && \(/);
  assert.match(src, /cfgSet\(\{ \[CLE_OUVERTURES\]: \(brut\) => poserReglage\(brut, id, patch\) \}\)/);
  // Le choisi en bleu plein, texte blanc.
  assert.match(src, /background: on \? 'var\(--o-accent-fond\)' : 'var\(--o-s1\)', color: on \? '#fff'/);
  // Les sept jours : une lecture qui finit MAINTENANT (`history/period` s'arrête sinon un jour après son début).
  assert.match(src, /'&end_time=' \+ encodeURIComponent\(new Date\(\)\.toISOString\(\)\)/);
});

test('la vue Sécurité titre « Ouvertures » et compte les ouvertes', () => {
  const src = lire('src/views/securite.jsx');
  assert.match(src, /if \(k === 'sect:ouvrants'\) return tr\('Ouvertures'\);/);
  assert.match(src, /trN\(nOuvertes, '\{n\} ouverte', '\{n\} ouvertes'\)/);
});

test('les couleurs sont des jetons du thème : aucune couleur écrite dans la tuile, la popup, le dessin', () => {
  for (const f of ['src/carteouverture.jsx', 'src/ficheouverture.jsx', 'src/dessinouverture.jsx']) {
    const sansCommentaires = lire(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const couleurs = (sansCommentaires.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter(c => c.toLowerCase() !== '#fff');
    assert.deepEqual(couleurs, [], f);
  }
});

// ── L'accord avec le serveur ───────────────────────────────────────────────

test('l’écran et le serveur disent les mêmes délais, le même rappel, la même nuit', () => {
  const py = lire('custom_components/loggia/ouvertures.py');
  assert.match(py, /^CLE = "loggia_ouvertures"$/m);
  assert.equal(O.CLE_OUVERTURES, 'loggia_ouvertures');
  assert.match(py, /^DELAIS = \(0, 5, 10, 30\)$/m);
  assert.match(py, new RegExp('^REPRISE_MIN = ' + O.REPRISE_OUVERTURE + '$', 'm'));
  assert.match(py, new RegExp('^NUIT_DEBUT, NUIT_FIN = ' + O.NUIT_OUVERTURE.debut + ' \\* 60, ' + O.NUIT_OUVERTURE.fin + ' \\* 60$', 'm'));
  assert.match(lire('custom_components/loggia/rechargement.py'), /"loggia_ouvertures": "ouvertures",/);
});

// ── La démo ────────────────────────────────────────────────────────────────

test('la démo règle le rappel de la porte et de la baie, et raconte leur semaine', () => {
  const demo = lire('src/demo.js');
  assert.match(demo, /loggia_ouvertures: \{ 'binary_sensor\.porte_entree': \{ delai: 10, nuit: true \}, 'binary_sensor\.baie_vitree': \{ delai: 10, nuit: true \} \}/);
  const t = A(17, 21);
  const maison = maisonCapteursDemo({ quand: t });
  const d = new Date(O.semaineOuverture([], t)[0].debut);
  const chemin = 'history/period/' + d.toISOString() + '?filter_entity_id=binary_sensor.porte_entree&end_time=' + encodeURIComponent(new Date(t).toISOString()) + '&minimal_response&no_attributes';
  const etats = lireJournee(maison.historique(chemin))['binary_sensor.porte_entree'];
  const semaine = O.semaineOuverture(etats, t);
  assert.deepEqual(semaine.map(j => j.n), [6, 4, 9, 5, 7, 12, 2], 'la semaine de sa maquette, et les deux passages du jour');
  const baie = lireJournee(maison.historique(chemin.replace('porte_entree', 'baie_vitree')))['binary_sensor.baie_vitree'];
  assert.equal(baie[baie.length - 1].s, 'on', 'la baie est ouverte maintenant');
});
