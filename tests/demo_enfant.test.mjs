/* La démo porte le mode enfant de sa maquette (chantier Mode enfant, tâche 6 ; § 10 ; E24).
 *
 * Ce qui est garanti ici, l'horloge de la démo réglée :
 *  - le profil « Lino » sur la chambre de la maquette : l'Echo Dot (ses deux entités, « Parler », la sœur « Annonces ») et l'Apple TV
 *    ajoutée, le plafond à 40 %, 1 h 30 d'écran, 07:30 – 20:30 en semaine (08:30 – 21:00 le week-end), les sons pour dormir, la voix ;
 *  - les TROIS situations suivent l'heure : avant 18:15, autorisé (55 min utilisées, 35 min restantes) ; de 18:15 au coucher, le temps
 *    écoulé ; hors des heures, le coucher (le plafond à 20, « revient à 07:30 ») ;
 *  - le faux serveur répond aux six commandes, avec les droits du vrai : la demande (une à la fois, notée au journal — la démo ne
 *    sonne pas), la réponse du parent, lever et rétablir, les réglages — le code de la maison les ouvre à un compte ordinaire ;
 *  - un son pour dormir fait jouer son titre sur la jumelle HACS ; la maison RAMÈNE : un volume au-dessus du plafond redescend une
 *    seconde après, un écran bloqué rallumé s'éteint vingt secondes après ;
 *  - chaque mot du journal du mode enfant a sa clé (les sept langues). */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonMediasDemo } = await import('../src/demo.js');
const en = (await import('../src/langues/en.js')).default;
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Le mardi 13 octobre 2026 : un jour de semaine, 07:30 – 20:30 ; le 17 est un samedi.
const A = (h, m, d = 13) => new Date(2026, 9, d, h, m, 0, 0).getTime();
const OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', ATV = 'media_player.apple_tv_chambre', ANNONCES = 'switch.chambre_echo_dot_annonces';
const CODE_REQUIS = { code: 'code_admin_requis' };
const refuse = async (p, code) => { try { await p; } catch (e) { assert.equal(e && e.code, code, 'le refus porte son code : ' + JSON.stringify(e)); return; } assert.fail('accepté, alors que ' + code + ' était attendu'); };

test('§ 10 : le profil de la maquette, et les trois situations qui suivent l’heure — autorisé, temps écoulé, coucher ; le week-end a ses heures', () => {
  const m = maisonMediasDemo({ quand: A(17, 40) });
  const e = m.enfant();
  assert.deepEqual([e.demarre, e.simulation, Object.keys(e.profils)], [true, false, ['chambre']]);
  const p = e.profils.chambre;
  assert.deepEqual([p.nom, p.zone, p.actif, p.leve_jusqua, p.demande, p.voix, p.dormir], ['Lino', 'chambre', true, null, null, true, true]);
  assert.deepEqual(p.appareils.map(a => [a.entite, a.ajoute, a.ecran, a.parler, a.annonces, a.hacs]),
    [[OFF, false, false, 'notify.chambre_echo_dot_parler', ANNONCES, HACS], [ATV, true, true, null, null, null]], 'l’Echo de la pièce avec ses sœurs et sa jumelle, l’Apple TV ajoutée');
  assert.deepEqual([m.states[ANNONCES].state, m.states[ANNONCES].attributes.friendly_name], ['on', 'Echo Dot - Chambre Annonces'], 'la sœur « Annonces » de l’officielle, allumée');
  assert.deepEqual([e.lecteurs[OFF].plafond, e.lecteurs[OFF].bloque, e.lecteurs[HACS].plafond, e.lecteurs[ATV].bloque, e.lecteurs[ATV].reprise], [40, null, 40, null, '07:30']);
  assert.deepEqual(e.lecteurs[ATV].ecran, { budget_min: 90, utilise_s: 3300, bonus_min: 0, reste_s: 2100 }, '55 min utilisées à 17:40 : 35 min restantes');
  assert.equal(e.lecteurs[OFF].ecran, null, 'une enceinte n’a pas de temps d’écran');
  assert.equal(m.config().loggia_enfant.profils.chambre.volume_max, 40, 'la configuration commune porte le profil');
  const t = maisonMediasDemo({ quand: A(18, 20) }).enfant();
  assert.deepEqual([t.lecteurs[ATV].bloque, t.lecteurs[ATV].ecran.reste_s, t.lecteurs[ATV].ecran.utilise_s, t.lecteurs[OFF].bloque, t.lecteurs[OFF].plafond], ['temps', 0, 5400, null, 40], '18:20 : le temps est écoulé, l’Echo garde son plafond');
  const c = maisonMediasDemo({ quand: A(20, 45) }).enfant();
  assert.deepEqual([c.lecteurs[ATV].bloque, c.lecteurs[OFF].bloque, c.lecteurs[OFF].plafond, c.lecteurs[OFF].reprise, c.lecteurs[HACS].bloque], ['coucher', 'coucher', 20, '07:30', 'coucher'], '20:45 : le coucher, le plafond à 20');
  const soir = maisonMediasDemo({ quand: A(20, 45) }).states;
  assert.deepEqual([m.states[OFF].attributes.volume_level, m.states[HACS].attributes.volume_level, soir[OFF].attributes.volume_level, soir[HACS].attributes.volume_level], [.3, .3, .2, .2],
    'le volume de l’Echo, sur ses deux entités : 30 % dans les heures, déjà ramené à 20 % au coucher — la maison ne laisse pas un volume au-dessus du plafond');
  const we = maisonMediasDemo({ quand: A(20, 45, 17) }).enfant();
  assert.deepEqual([we.lecteurs[OFF].bloque, we.lecteurs[OFF].plafond, we.lecteurs[ATV].reprise], [null, 40, '08:30'], 'le samedi : 08:30 – 21:00, encore autorisé à 20:45 ; la reprise est celle du dimanche');
  const matin = maisonMediasDemo({ quand: A(7, 0) }).enfant();
  assert.deepEqual([matin.lecteurs[ATV].bloque, matin.lecteurs[ATV].reprise], ['coucher', '07:30'], 'avant les heures : le coucher encore, la reprise du jour même');
});

test('E13 : la demande — depuis un écran bloqué par le temps, une à la fois, notée au journal ; la réponse du parent accorde 15 min ou refuse jusqu’à demain ; pas de demande au coucher', async () => {
  const m = maisonMediasDemo({ quand: A(18, 20) });
  const r = await m.ws({ type: 'loggia/enfant/demander', profil: 'chambre' }, { admin: false });
  assert.deepEqual([r.profils.chambre.demande.appareil, r.profils.chambre.demande.reponse, r.lecteurs[ATV].demande.appareil], [ATV, null, ATV], 'la demande attend, visible sur le profil et sur l’écran');
  const lignes = m.regles().journal.filter(l => l.module === 'enfant');
  assert.deepEqual(lignes.map(l => [l.regle, l.quoi, l.cibles]), [['demande', 'demande', [ATV]]], 'la notification se note au journal : la démo ne sonne pas');
  await refuse(m.ws({ type: 'loggia/enfant/demander', profil: 'chambre' }), 'invalid_format');
  await refuse(m.ws({ type: 'loggia/enfant/repondre', profil: 'chambre', accorder: true }, { admin: false }), 'code_admin_requis');
  const ok = await m.ws({ type: 'loggia/enfant/repondre', profil: 'chambre', accorder: true });
  assert.deepEqual([ok.profils.chambre.demande.reponse, ok.lecteurs[ATV].ecran.bonus_min, ok.lecteurs[ATV].ecran.reste_s, ok.lecteurs[ATV].bloque], ['accordee', 15, 900, null], '15 min de plus : l’écran n’est plus bloqué');
  assert.ok(m.regles().journal.some(l => l.module === 'enfant' && l.quoi === '15 min accordées' && l.motif === 'depuis l’écran'));
  // Refusée : jusqu'à demain.
  const m2 = maisonMediasDemo({ quand: A(18, 20) });
  await m2.ws({ type: 'loggia/enfant/demander', profil: 'chambre' });
  const non = await m2.ws({ type: 'loggia/enfant/repondre', profil: 'chambre', accorder: false });
  assert.deepEqual([non.profils.chambre.demande.reponse, non.lecteurs[ATV].bloque], ['refusee', 'temps']);
  await refuse(m2.ws({ type: 'loggia/enfant/demander', profil: 'chambre' }), 'invalid_format');
  // Rien à demander quand l'écran n'est pas bloqué par le temps : avant, ou au coucher.
  await refuse(maisonMediasDemo({ quand: A(17, 40) }).ws({ type: 'loggia/enfant/demander', profil: 'chambre' }), 'invalid_format');
  await refuse(maisonMediasDemo({ quand: A(20, 45) }).ws({ type: 'loggia/enfant/demander', profil: 'chambre' }), 'invalid_format');
});

test('E2 B, E14 : les réglages et la levée veulent le code de la maison ou un administrateur ; le code ouvre cinq minutes ; un patch illisible se refuse ; lever puis rétablir', async () => {
  const m = maisonMediasDemo({ quand: A(17, 40) });
  await refuse(m.ws({ type: 'loggia/enfant/config', patch: { profils: { chambre: { volume_max: 55 } } } }, { admin: false }), 'code_admin_requis');
  await refuse(m.ws({ type: 'loggia/enfant/lever', profil: 'chambre', minutes: 30 }, { admin: false }), 'code_admin_requis');
  /* ASSERTION MODIFIÉE (audit du 28/10, H1 ; ADR 0279) : jamais défini, AUCUN code n'ouvre rien — `0000` ouvrait tout — et le
   * refus se nomme. Un administrateur pose le code, puis le parent le tape. */
  await refuse(m.ws({ type: 'loggia/pin/verifier', pin: '0000' }), 'code_non_defini');
  assert.deepEqual(await m.ws({ type: 'loggia/pin/definir', pin: '4321' }), { defini: true });
  assert.deepEqual(await m.ws({ type: 'loggia/pin/verifier', pin: '1234' }), { ok: false, bloque: 0 }, 'un code faux n’ouvre rien');
  await refuse(m.ws({ type: 'loggia/enfant/config', patch: { profils: { chambre: { volume_max: 55 } } } }, { admin: false }), 'code_admin_requis');
  assert.deepEqual(await m.ws({ type: 'loggia/pin/verifier', pin: '4321' }), { ok: true });
  const r = await m.ws({ type: 'loggia/enfant/config', patch: { profils: { chambre: { volume_max: 55 } } } }, { admin: false });
  assert.deepEqual([r.config.profils.chambre.volume_max, r.etat.lecteurs[OFF].plafond, m.config().loggia_enfant.profils.chambre.volume_max], [55, 55, 55], 'le code de la maison a ouvert les réglages : le plafond change partout');
  await refuse(m.ws({ type: 'loggia/enfant/config', patch: { profils: { chambre: { volume_max: 500 } } } }), 'invalid_format');
  await refuse(m.ws({ type: 'loggia/enfant/config', patch: { profils: { chambre: { heures: { semaine: ['25:00', '20:30'] } } } } }), 'invalid_format');
  assert.equal(m.config().loggia_enfant.profils.chambre.volume_max, 55, 'un patch refusé n’écrit rien');
  // Lever les limites : plus de plafond ni de blocage, le profil le dit ; rétablir.
  const leve = await m.ws({ type: 'loggia/enfant/lever', profil: 'chambre', minutes: 30 });
  assert.ok(leve.profils.chambre.leve_jusqua > A(17, 40) / 1000 && leve.lecteurs[OFF].plafond === null && leve.lecteurs[OFF].actif === true, 'levées : le profil reste allumé, sans borne');
  assert.ok(m.regles().journal.some(l => l.module === 'enfant' && l.quoi === 'limites levées'));
  const retabli = await m.ws({ type: 'loggia/enfant/lever', profil: 'chambre', minutes: 0 });
  assert.deepEqual([retabli.profils.chambre.leve_jusqua, retabli.lecteurs[OFF].plafond], [null, 55]);
  // La bascule du profil : désactivé, rien n'agit, tout se voit.
  const eteint = await m.ws({ type: 'loggia/enfant/config', patch: { profils: { chambre: { actif: false } } } });
  assert.deepEqual([eteint.etat.profils.chambre.actif, eteint.etat.lecteurs[OFF].plafond, eteint.etat.lecteurs[OFF].actif], [false, null, false]);
  // « Observer sans agir » : le drapeau à la racine, comme le planning de chauffe.
  const obs = await m.ws({ type: 'loggia/enfant/config', patch: { simulation: { actif: true } } });
  assert.equal(obs.etat.simulation, true);
});

test('E10, E24 : un son pour dormir fait jouer son titre sur la jumelle HACS ; la maison ramène — le volume au-dessus du plafond une seconde après, l’écran bloqué rallumé vingt secondes après ; rien hors profil ni sous le plafond', async () => {
  const m = maisonMediasDemo({ quand: A(20, 45) });
  const S = m.states;
  const dodo = await m.ws({ type: 'loggia/enfant/dormir', profil: 'chambre', son: 0 }, { admin: false });
  assert.deepEqual([S[HACS].state, S[HACS].attributes.media_title, dodo.lecteurs[OFF].dormir != null], ['playing', 'Bruit blanc', true], 'la phrase « joue du bruit blanc » fait jouer « Bruit blanc »');
  await refuse(m.ws({ type: 'loggia/enfant/dormir', profil: 'chambre', son: 7 }), 'invalid_format');
  assert.ok(m.regles().journal.some(l => l.module === 'enfant' && l.quoi === 'son pour dormir' && l.cibles[0] === HACS));
  // Le volume monté à 70 % sur l'Echo au coucher (plafond 20) : une seconde plus tard, la maison le ramène, sur les deux entités.
  const planifies = [];
  const plusTard = (f, ms) => planifies.push([ms, f]);
  m.geste('media_player', 'volume_set', { entity_id: HACS, volume_level: .7 });
  m.ramener('volume_set', { entity_id: HACS, volume_level: .7 }, plusTard);
  assert.deepEqual(planifies.map(([ms]) => ms), [1000]);
  planifies[0][1]();
  assert.deepEqual([S[HACS].attributes.volume_level, S[OFF].attributes.volume_level], [.2, .2], 'ramené au plafond du coucher, jamais plus haut');
  const ramene = m.regles().journal.find(l => l.module === 'enfant' && l.quoi === 'volume ramené');
  assert.deepEqual([ramene.regle, ramene.cibles, ramene.motif], ['plafond', [HACS], 'de 70 à 20 % · à la voix ou sur l’appareil']);
  // Sous le plafond : rien ; un lecteur hors profil : rien.
  planifies.length = 0;
  m.ramener('volume_set', { entity_id: HACS, volume_level: .15 }, plusTard);
  m.ramener('volume_set', { entity_id: 'media_player.echo_cuisine', volume_level: .9 }, plusTard);
  assert.deepEqual(planifies, []);
  // L'Apple TV rallumée au coucher : vingt secondes plus tard, éteinte, et le journal le dit.
  m.geste('media_player', 'turn_on', { entity_id: ATV });
  assert.equal(S[ATV].state, 'idle');
  m.ramener('turn_on', { entity_id: ATV }, plusTard);
  assert.deepEqual(planifies.map(([ms]) => ms), [20000]);
  planifies[0][1]();
  assert.equal(S[ATV].state, 'off');
  const coupure = m.regles().journal.find(l => l.module === 'enfant' && l.quoi === 'écran éteint');
  assert.deepEqual([coupure.regle, coupure.cibles, coupure.motif], ['coupure', [ATV], 'rallumé']);
  // Dans les heures, avec du budget : allumer n'appelle rien.
  const libre = maisonMediasDemo({ quand: A(17, 40) });
  planifies.length = 0;
  libre.ramener('turn_on', { entity_id: ATV }, plusTard);
  libre.ramener('volume_set', { entity_id: HACS, volume_level: .35 }, plusTard);
  assert.deepEqual(planifies, []);
  // Le chemin du vrai faux serveur : les services des lecteurs passent par `ramenerEnfantDemo` dans `installerDemo`.
  assert.ok(DEMO.includes("ramenerEnfantDemo(states, service, { ...(data || {}), entity_id: id }, toucher);"), 'la démo installée ne ramène pas');
  // Et l'horloge des médias se fige par l'URL (`?demo&heure=18:20`) : les trois situations se regardent sans attendre l'heure.
  assert.ok(DEMO.includes("const heure = q.get('heure');") && DEMO.includes("horlogeMedias = () => { const d = new Date(); d.setHours(h, mn, 0, 0); return d.getTime(); };"), '`heure=` ne fige plus l’horloge des médias');
});

test('chaque mot du journal du mode enfant a sa clé — la règle, ce qui est fait, le motif ; le détail d’un son pour dormir reste vide (la phrase est celle du parent)', async () => {
  const m = maisonMediasDemo({ quand: A(18, 20) });
  await m.ws({ type: 'loggia/enfant/demander', profil: 'chambre' });
  await m.ws({ type: 'loggia/enfant/repondre', profil: 'chambre', accorder: false });
  await m.ws({ type: 'loggia/enfant/lever', profil: 'chambre', minutes: 30 });
  await m.ws({ type: 'loggia/enfant/lever', profil: 'chambre', minutes: 0 });
  // Le journal du jour se lit AVANT la maison du soir : une maison neuve repart d'un journal vide.
  const jour = m.regles().journal.filter(l => l.module === 'enfant');
  const nuit = maisonMediasDemo({ quand: A(20, 45) });
  await nuit.ws({ type: 'loggia/enfant/dormir', profil: 'chambre', son: 1 });
  const planifies = [];
  // Comme la démo installée : le geste s'applique aux états, PUIS la maison regarde s'il faut ramener.
  nuit.geste('media_player', 'volume_set', { entity_id: OFF, volume_level: .6 });
  nuit.ramener('volume_set', { entity_id: OFF, volume_level: .6 }, (f) => planifies.push(f));
  nuit.geste('media_player', 'turn_on', { entity_id: ATV });
  nuit.ramener('turn_on', { entity_id: ATV }, (f) => planifies.push(f));
  planifies.forEach(f => f());
  const lignes = [...jour, ...nuit.regles().journal.filter(l => l.module === 'enfant')];
  assert.deepEqual(lignes.map(l => l.quoi), ['demande', 'demande refusée', 'limites levées', 'limites rétablies', 'son pour dormir', 'volume ramené', 'écran éteint'], 'le journal du mode enfant, ligne à ligne');
  const cle = (k) => Object.prototype.hasOwnProperty.call(en, k);
  const remplir = (gab, args) => Object.keys(args || {}).reduce((s, k) => s.split('{' + k + '}').join(String(args[k])), gab);
  const sansCle = [];
  for (const l of lignes) {
    for (const champ of ['regle', 'quoi', 'motif', 'detail']) {
      const parties = l.g && l.g[champ];
      if (parties) {
        for (const [gabarit] of parties) if (!cle(gabarit)) sansCle.push(champ + ' · ' + gabarit);
        assert.equal(l[champ], parties.map(([gab, args]) => remplir(gab, args)).join(' · '));
      } else if (l[champ] && !cle(l[champ])) sansCle.push(champ + ' · ' + l[champ]);
    }
  }
  assert.deepEqual(sansCle, [], 'sans clé, ces mots s’affichent en français dans les sept langues');
  assert.ok(lignes.every(l => l.simule === false && typeof l.ts === 'number'));
});
