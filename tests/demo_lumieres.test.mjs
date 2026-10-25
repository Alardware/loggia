/* La démo porte les lumières de sa maquette (chantier Lumières, § 9).
 *
 * Les six lampes de « Cartes lumières », à toute heure — leur journée est celle
 * de la maquette, vue à 20:40, ramenée tout entière avant l'heure de la démo
 * quand elle s'ouvre plus tôt —, le carnet du serveur (§ 6.2) qui en répond, et
 * le faux serveur qui applique la luminosité, le blanc et la couleur. La démo
 * n'importe pas lumieres.js : un module du démarrage n'a rien à faire dans le
 * morceau de la démo. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { maisonLumieresDemo, appliquerLumiereDemo, minuteurSiEteint, gesteLumiereDemo } = await import('../src/demo.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const A = (h, m, j = 14) => new Date(2026, 9, j, h, m).getTime();
const hm = (ms) => new Date(ms).toTimeString().slice(0, 5);
const LAMPES = ['light.bureau', 'light.ampoule_chambre', 'light.chambre', 'light.veilleuse_chambre_lino', 'light.cuisine', 'switch.applique_exterieur'];

test('§ 9 : les six lampes de sa maquette, à 20:40 — leurs états, leurs heures, le minuteur', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const S = m.states;
  const vu = (id) => [S[id].state, hm(Date.parse(S[id].last_changed))];
  assert.deepEqual(LAMPES.map(vu), [['on', '18:05'], ['on', '20:10'], ['off', '07:50'], ['on', '20:30'], ['off', '20:20'], ['on', '20:24']]);
  assert.deepEqual([S['light.bureau'].attributes.brightness, S['light.bureau'].attributes.color_mode], [255, 'brightness'], 'le variateur du bureau à 100 %');
  const a = S['light.ampoule_chambre'].attributes;
  assert.deepEqual([a.brightness, a.color_mode, a.color_temp_kelvin, a.min_color_temp_kelvin, a.max_color_temp_kelvin], [115, 'color_temp', 2700, 2200, 6500], 'l’ampoule en blanc doux à 45 %');
  const v = S['light.veilleuse_chambre_lino'].attributes;
  assert.deepEqual([v.brightness, v.color_mode, v.hs_color, v.rgb_color, v.supported_color_modes], [38, 'xy', [275, 100], [149, 0, 255], ['color_temp', 'xy']], 'la veilleuse en violet à 15 %');
  assert.deepEqual(S['switch.applique_exterieur'].attributes, { friendly_name: 'Applique Extérieur' }, 'l’applique : un switch, tout ou rien');
  assert.equal(S['light.chambre'].attributes.brightness, null, 'éteinte, Home Assistant efface la luminosité');
  assert.equal(hm(m.minuteur().fin * 1000), '21:10');
  assert.equal(m.etat().lumieres['light.chambre'].dernier.bri, 80, 'le carnet garde son dernier niveau : « se rallumera à 80 % »');
  assert.deepEqual(m.etat().lumieres['light.veilleuse_chambre_lino'].dernier, { bri: 15, mode: 'xy', kelvin: null, hs: [275, 100] });
  assert.equal(m.etat().lumieres['light.cuisine'].dernier.bri, 100);
});

test('§ 9 : à toute heure, la même scène — décalée à l’heure de la démo, jamais dans son avenir', async () => {
  for (const [h, mn] of [[0, 30], [2, 0], [9, 0], [16, 20], [20, 40], [23, 50]]) {
    const t = A(h, mn);
    const m = maisonLumieresDemo({ quand: t });
    const S = m.states;
    const quoi = h + ':' + mn;
    assert.deepEqual(LAMPES.map(id => S[id].state), ['on', 'on', 'off', 'on', 'off', 'on'], quoi);
    for (const id of LAMPES) assert.ok(Date.parse(S[id].last_changed) <= t, quoi + ' · ' + id + ' : un changement dans l’avenir');
    const fin = m.minuteur().fin * 1000;
    assert.ok(fin > t && fin - t <= 30 * 60000, quoi + ' : le minuteur de l’ampoule tourne encore, une demi-heure au plus');
    for (const id of LAMPES) {
      const { evenements } = await m.journal(id);
      assert.ok(evenements.length > 1, quoi + ' · ' + id);
      assert.ok(evenements[0].when * 1000 < A(0, 0, 13), quoi + ' · ' + id + ' : la note d’avant la veille à 00:00 ouvre le journal (le contrat du plan 1)');
      assert.ok(evenements.slice(1).every((e, i) => e.when * 1000 <= t && e.when * 1000 >= A(0, 0, 13) && evenements[i].when <= e.when), quoi + ' · ' + id + ' : puis depuis la veille à 00:00, dans l’ordre du temps');
    }
    assert.equal(m.etat().lumieres['light.chambre'].dernier.bri, 80, quoi);
  }
});

test('§ 9 : l’histoire est fixée à la première lecture du jour — une démo restée ouverte ne la refait pas', async () => {
  const m = maisonLumieresDemo({ quand: A(9, 0) });
  const avant = await m.journal('light.bureau');
  const minuteur = m.minuteur();
  m.avancer(70 * 60000);
  assert.deepEqual(await m.journal('light.bureau'), avant);
  assert.deepEqual(m.minuteur(), minuteur);
});

test('§ 9 : qui a allumé — l’interrupteur, Loggia, une automatisation —, et la pose du minuteur au journal de Loggia', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const dernier = async (id) => (await m.journal(id)).evenements.at(-1);
  assert.deepEqual(await dernier('light.bureau'), { when: A(18, 5) / 1000, state: 'on', bri: 100, reglage: false, context_user_id: null, context_event_type: null, context_name: null });
  assert.equal((await dernier('light.ampoule_chambre')).context_user_id, 'demo', 'depuis Loggia');
  assert.deepEqual(await dernier('light.veilleuse_chambre_lino'), { when: A(20, 30) / 1000, state: 'on', bri: 15, reglage: false, context_user_id: null,
    context_event_type: 'automation_triggered', context_name: 'Coucher de Lino' });
  assert.equal((await dernier('switch.applique_exterieur')).context_name, 'Coucher du soleil');
  assert.equal((await m.journal('light.ampoule_chambre')).evenements.find(e => e.state === 'on').context_name, 'Réveil');
  const pose = m.regles().filter(l => l.module === 'minuteurs' && (l.cibles || []).includes('light.ampoule_chambre'));
  assert.deepEqual(pose.map(l => [l.quoi, l.motif, hm(l.ts * 1000)]), [['poser', '60 min', '20:10']]);
  await assert.rejects(m.journal(''), (e) => e.code === 'invalid_format');
});

test('§ 9 : le faux serveur applique la luminosité, le blanc et la couleur ; le carnet note allumages et réglages', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const S = m.states;
  m.geste('light.bureau', 'turn_on', { brightness_pct: 60 });
  assert.equal(S['light.bureau'].attributes.brightness, 153);
  assert.equal(hm(Date.parse(S['light.bureau'].last_changed)), '18:05', 'un réglage ne change pas l’état : « depuis » ne bouge pas');
  m.avancer(10000);
  m.geste('light.bureau', 'turn_on', { brightness_pct: 70 });
  m.avancer(40000);
  m.geste('light.bureau', 'turn_on', { brightness_pct: 20 });
  const reglages = (await m.journal('light.bureau')).evenements.filter(e => e.reglage).map(e => [e.bri, e.context_user_id]);
  assert.deepEqual(reglages, [[70, 'demo'], [20, 'demo']], 'deux réglages à moins de 30 s ne font qu’une note, la dernière valeur');
  m.geste('light.chambre', 'turn_on', {});
  assert.equal(S['light.chambre'].attributes.brightness, 204, 'rallumée sans rien dire : à son dernier niveau, 80 %');
  assert.equal((await m.journal('light.chambre')).evenements.at(-1).bri, 80);
  m.geste('light.ampoule_chambre', 'turn_on', { color_temp_kelvin: 9000 });
  assert.equal(S['light.ampoule_chambre'].attributes.color_temp_kelvin, 6500, 'borné à l’ampoule');
  m.geste('light.veilleuse_chambre_lino', 'turn_on', { hs_color: [0, 100] });
  assert.deepEqual([S['light.veilleuse_chambre_lino'].attributes.color_mode, S['light.veilleuse_chambre_lino'].attributes.rgb_color], ['xy', [255, 0, 0]]);
  assert.deepEqual(m.etat().lumieres['light.veilleuse_chambre_lino'].dernier, { bri: 15, mode: 'xy', kelvin: null, hs: [0, 100] }, 'la couleur seule : le carnet la garde, le journal n’en dit rien');
  m.geste('light.veilleuse_chambre_lino', 'turn_off');
  assert.deepEqual([S['light.veilleuse_chambre_lino'].state, S['light.veilleuse_chambre_lino'].attributes.brightness, S['light.veilleuse_chambre_lino'].attributes.hs_color], ['off', null, null]);
  m.geste('switch.applique_exterieur', 'turn_off');
  assert.equal(S['switch.applique_exterieur'].state, 'off');
  assert.equal((await m.journal('switch.applique_exterieur')).evenements.at(-1).bri, null, 'tout ou rien : pas de niveau');
});

test('§ 9 : une lampe muette ne répond pas ; rien ne change sans service qui allume ou éteint', () => {
  const muette = { state: 'unavailable', attributes: { supported_color_modes: ['brightness'] } };
  assert.equal(appliquerLumiereDemo(muette, 'light.x', 'turn_on', { brightness_pct: 50 }), null);
  assert.equal(appliquerLumiereDemo({ state: 'on', attributes: {} }, 'light.x', 'set_effect', {}), null);
  assert.deepEqual(appliquerLumiereDemo({ state: 'on', attributes: { supported_color_modes: ['onoff'] } }, 'light.x', 'toggle').state, 'off');
});

test('§ 9 : la veilleuse de Lino est celle de la règle Nuit ; les lampes nouvelles ont leur pièce', () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  assert.deepEqual(m.nuit().veilleuse.lampes, ['light.veilleuse_chambre_lino']);
  assert.deepEqual(m.nuit().coucher.sauf, ['light.veilleuse_chambre_lino'], 'le coucher ne l’éteint pas');
  const piece = (id) => (m.index().entities.find(e => e.id === id) || {}).area;
  assert.deepEqual(['light.ampoule_chambre', 'light.veilleuse_chambre_lino', 'switch.applique_exterieur', 'light.bureau'].map(piece), ['chambre', 'chambre', 'entree', 'bureau']);
  assert.ok(m.states['light.salon'] && m.states['light.entree'], 'le salon et l’entrée gardent leurs lampes');
  assert.equal(m.states['light.salon'].attributes.color_mode, 'rgb', 'la lampe du salon dit son mode : sa carte prend sa couleur');
});

test('§ 9 : le faux serveur répond au carnet, et son minuteur éteint aussi les lumières', () => {
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/lumieres/etat') return Promise.resolve(lumieresDemo(states));"));
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/lumieres/journal') return journalLumiereDemo(msg, states);"));
  assert.ok(DEMO.includes('if (lampes.filter(x => gesteLumiereDemo(states, x, service, data || {})).length) el.hass = { ...el.hass, states };'));
  assert.ok(DEMO.includes("if (lampeDemo(x)) { if (gesteLumiereDemo(states, x, 'turn_off', {}, { utilisateur: null })) el.hass = { ...el.hass, states }; }"));
  assert.ok(DEMO.includes('if (!PRISES_DEMO.includes(x) && !lampeDemo(x)) return;'));
  assert.ok(DEMO.includes("loggia_switchlights: ['switch.applique_exterieur'],"), 'l’applique est déclarée lumière');
  assert.ok(!/from '\.\/lumieres(etat)?\.js'/.test(DEMO), 'la démo n’importe pas les modules du démarrage');
});

test('le contrat du plan 1 : `maintenant` en secondes, chaque lampe suivie, `dernier` null tant qu’elle n’a pas été vue allumée ; le journal ouvre sur la note d’avant', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const e = m.etat();
  assert.equal(e.maintenant, A(20, 40) / 1000, 'un nombre, des secondes');
  assert.deepEqual(e.lumieres['light.entree'], { dernier: null }, 'jamais vue allumée : ni repère gris, ni « se rallumera à »');
  assert.deepEqual(e.lumieres['switch.applique_exterieur'], { dernier: { bri: null, mode: null, kelvin: null, hs: null } }, 'un switch-lumière vu allumé');
  const premiere = (await m.journal('light.bureau')).evenements[0];
  assert.deepEqual([hm(premiere.when * 1000), new Date(premiere.when * 1000).getDate(), premiere.state], ['23:00', 12, 'off'], 'l’état de la lampe quand la fenêtre s’ouvre');
  const salon = (await m.journal('light.salon')).evenements;
  assert.deepEqual(salon.map(x => [x.when, x.state, x.bri]), [[Date.parse(m.states['light.salon'].last_changed) / 1000, 'on', 71]], 'une lampe sans histoire, allumée : vue s’allumer à l’heure de son état');
});

test('§ 8 et 9 : la veilleuse s’éteint par la règle Nuit, en un fondu de 5 min — paliers et extinction sans contexte, après la ligne de Loggia', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const { evenements } = await m.journal('light.veilleuse_chambre_lino');
  assert.deepEqual(evenements.slice(1).map(x => [hm(x.when * 1000), x.state, x.bri, x.reglage, x.context_user_id, x.context_name]), [
    ['05:50', 'on', 15, false, null, null], ['06:51', 'on', 9, true, null, null], ['06:53', 'on', 4, true, null, null],
    ['06:55', 'off', null, false, null, null], ['20:30', 'on', 15, false, null, 'Coucher de Lino']]);
  const nuit = m.regles().filter(l => l.module === 'nuit' && l.regle === 'veilleuse');
  assert.deepEqual(nuit.map(l => [l.quoi, l.cibles, hm(l.ts * 1000)]), [['eteindre', ['light.veilleuse_chambre_lino'], '06:50']]);
  assert.equal(m.nuit().veilleuse.fondu, 5, 'le fondu de la règle, en minutes');
});

/* ── Passe de finition 9 bis B ─────────────────────────────────────────────────── */

test('point 5 : une lampe sans histoire (le salon) — son réglage courant est noté au carnet dès le premier geste : éteinte, elle garde son repère ; rallumée, elle reprend sa couleur', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const S = m.states;
  const reglage = { bri: 71, mode: 'rgb', kelvin: null, hs: [31, 64] };
  assert.deepEqual(m.etat().lumieres['light.salon'].dernier, reglage, 'vu allumé : son état fait foi, avant tout geste');
  m.geste('light.salon', 'turn_off');
  assert.equal(S['light.salon'].state, 'off');
  assert.deepEqual(m.etat().lumieres['light.salon'].dernier, reglage, 'éteinte, le carnet garde son réglage : le repère gris à 71 %, au lieu de `dernier: null`');
  m.geste('light.salon', 'turn_on');
  const a = S['light.salon'].attributes;
  assert.deepEqual([a.color_mode, a.hs_color, a.rgb_color, Math.round(a.brightness / 2.55)], ['rgb', [31, 64], [255, 176, 92], 71],
    'rallumée sans rien dire : sa couleur et son niveau d’avant — pas 100 % en `color_temp` sans kelvin, donc en or');
  // Le journal garde la continuité : la ligne que la lampe sans histoire avait déjà (allumée, 71 %), puis ses deux gestes.
  const { evenements } = await m.journal('light.salon');
  assert.deepEqual(evenements.map(e => [e.state, e.bri, e.reglage, e.context_user_id]), [['on', 71, false, null], ['off', null, false, 'demo'], ['on', 71, false, 'demo']]);
  assert.ok(evenements[0].when <= evenements[1].when, 'dans l’ordre du temps');
  // Une lampe éteinte et sans histoire (l’entrée) n’a rien à noter avant son premier geste.
  assert.deepEqual(m.etat().lumieres['light.entree'], { dernier: null });
  m.geste('light.entree', 'turn_on', { brightness_pct: 40 });
  assert.equal(m.etat().lumieres['light.entree'].dernier.bri, 40, 'allumée par un geste : le carnet la voit allumée à ce niveau');
});

test('point 5 : le premier geste sur une lampe sans histoire n’est noté qu’une fois — un réglage ne le refait pas', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  m.geste('light.salon', 'turn_on', { brightness_pct: 30 });
  m.avancer(60000);
  m.geste('light.salon', 'turn_on', { brightness_pct: 90 });
  const { evenements } = await m.journal('light.salon');
  assert.deepEqual(evenements.map(e => [e.state, e.bri, e.reglage]), [['on', 71, false], ['on', 30, true], ['on', 90, true]],
    'l’allumage vu, puis deux réglages à plus de 30 s l’un de l’autre');
  assert.equal(m.etat().lumieres['light.salon'].dernier.hs[0], 31, 'la couleur du salon est restée la sienne');
});

test('point 6 : une couleur, puis 70 % en moins de 30 s — « Réglée à 70 % » paraît au journal ; la couleur seule n’y fait toujours aucune ligne', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const id = 'light.veilleuse_chambre_lino';
  const duSoir = async () => (await m.journal(id)).evenements.filter(e => e.context_user_id === 'demo');
  m.geste(id, 'turn_on', { hs_color: [0, 100] });
  assert.equal((await duSoir()).length, 0, 'la couleur seule : rien au journal');
  m.avancer(10000);
  m.geste(id, 'turn_on', { brightness_pct: 70 });
  const lignes = await duSoir();
  assert.deepEqual(lignes.map(e => [e.state, e.bri, e.reglage]), [['on', 70, true]], '« Réglée à 70 % » — la note silencieuse de la couleur ne l’avale plus');
  assert.deepEqual(m.etat().lumieres[id].dernier, { bri: 70, mode: 'xy', kelvin: null, hs: [0, 100] }, 'le carnet garde la couleur ET le niveau');
  // Un blanc, de même, sur l'ampoule.
  const b = 'light.ampoule_chambre';
  m.geste(b, 'turn_on', { color_temp_kelvin: 4000 });
  m.avancer(5000);
  m.geste(b, 'turn_on', { brightness_pct: 80 });
  assert.deepEqual((await m.journal(b)).evenements.filter(e => e.reglage).map(e => e.bri), [80]);
  // Deux réglages de niveau à moins de 30 s l'un de l'autre ne font toujours qu'une note, la dernière valeur.
  m.avancer(5000);
  m.geste(b, 'turn_on', { brightness_pct: 55 });
  assert.deepEqual((await m.journal(b)).evenements.filter(e => e.reglage).map(e => e.bri), [55]);
  // …même si un blanc s'est glissé entre les deux : il n'est pas une note chez le serveur, il ne reporte pas les 30 s — et le carnet garde le blanc ET le niveau.
  m.avancer(5000);
  m.geste(b, 'turn_on', { color_temp_kelvin: 2200 });
  m.avancer(5000);
  m.geste(b, 'turn_on', { brightness_pct: 35 });
  assert.deepEqual((await m.journal(b)).evenements.filter(e => e.reglage).map(e => e.bri), [35], 'une seule note, la dernière valeur');
  assert.deepEqual(m.etat().lumieres[b].dernier, { bri: 35, mode: 'color_temp', kelvin: 2200, hs: null });
  // Passé 30 s, le réglage suivant est une nouvelle ligne.
  m.avancer(31000);
  m.geste(b, 'turn_on', { brightness_pct: 90 });
  assert.deepEqual((await m.journal(b)).evenements.filter(e => e.reglage).map(e => e.bri), [35, 90]);
});

test('point 10 : une lampe ou une prise qui passe à `off` n’a plus de minuteur — comme le vrai composant (`_sur_etat`) ; `unavailable` ne l’annule pas', () => {
  const m = maisonLumieresDemo();
  const id = 'light.bureau';
  m.poserMinuteur(id, 30);
  m.geste(id, 'turn_on', { brightness_pct: 50 });
  assert.ok(m.minuteurs()[id], 'un réglage n’éteint pas : le minuteur tient');
  m.geste(id, 'turn_off');
  assert.equal(m.minuteurs()[id], undefined, 'éteinte à la main : plus de minuteur');
  m.geste(id, 'turn_on');
  assert.equal(m.minuteurs()[id], undefined, 'rallumée, elle ne retrouve pas son « S’éteint à »');
  // Un minuteur sur une autre lampe n'est pas touché, et le switch-lumière de la maison suit la même règle.
  m.poserMinuteur('light.ampoule_chambre', 15);
  m.poserMinuteur('switch.applique_exterieur', 15);
  m.geste('switch.applique_exterieur', 'turn_off');
  assert.deepEqual(Object.keys(m.minuteurs()).sort(), ['light.ampoule_chambre'], 'seule l’ampoule de la chambre garde le sien');
  // La règle elle-même — celle de `toucher`, que la prise (`switch.prise_*`) traverse : « off » seulement.
  m.poserMinuteur('switch.prise_nas_zephyr', 30);
  minuteurSiEteint('switch.prise_nas_zephyr', 'unavailable');
  minuteurSiEteint('switch.prise_nas_zephyr', 'on');
  assert.ok(m.minuteurs()['switch.prise_nas_zephyr'], 'une prise qui décroche n’a pas été éteinte');
  minuteurSiEteint('switch.prise_nas_zephyr', 'off');
  assert.equal(m.minuteurs()['switch.prise_nas_zephyr'], undefined, 'coupée : plus de minuteur');
  minuteurSiEteint('switch.inconnue', 'off');
  // Les trois endroits où la démo écrit un état `off` la suivent : `toucher` (prises, tout le reste), le scénario, la lampe.
  assert.ok(DEMO.includes("states[id] = { state: patch != null ? String(patch) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: maintenant(), last_changed: maintenant() };\n    minuteurSiEteint(id, states[id].state);"),
    '`toucher` : une prise coupée, ou tout ce qui passe à `off`');
  assert.ok(DEMO.includes("if (etat) { states[hid] = { ...st, state: etat, last_changed: new Date().toISOString() }; minuteurSiEteint(hid, etat); }"), 'un scénario qui éteint les lumières');
});

/* ── Passe de finition 11 bis, R4 : la démo fond ses réglages comme le serveur ──────────────────────────
 *
 * `noter` (custom_components/loggia/lumieres_calcul.py) : un réglage de niveau à moins de FONDRE_S (30 s) du dernier niveau noté
 * — l'allumage ou le réglage d'avant — se fond dans SA note, à la dernière valeur ; la note garde l'heure et l'auteur du PREMIER
 * changement, et chaque pas prolonge les 30 s (`niveau_a`). Il ne se fond que chez le même auteur, ou sans auteur (l'écho de
 * l'ampoule). Une couleur seule n'est pas une note. La démo ne fondait que dans un autre RÉGLAGE — jamais dans l'allumage — et
 * déplaçait la note à l'heure du dernier pas. */
const duSoir = async (m, id) => (await m.journal(id)).evenements.filter(e => e.context_user_id === 'demo' || e.context_user_id === 'autre');
const lignes = (notes) => notes.map(e => [e.state, e.bri, e.reglage, e.context_user_id, e.when * 1000]);

test('11 bis, R4 : un réglage à moins de 30 s d’un allumage se fond dans « Allumée à … » — la note garde l’heure de l’allumage, à la dernière valeur', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const id = 'light.cuisine';                         // éteinte depuis 20:20
  m.geste(id, 'turn_on', {});                          // allumée depuis Loggia : « Allumée à 100 % »
  m.avancer(12000);
  m.geste(id, 'turn_on', { brightness_pct: 60 });      // 12 s plus tard : un réglage, qui se fond dans l’allumage
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 60, false, 'demo', A(20, 40)]],
    'UNE note : l’allumage (pas « Réglée à »), au dernier niveau, à l’heure du PREMIER changement');
  m.avancer(8000);
  m.geste(id, 'turn_on', { brightness_pct: 30 });      // encore à moins de 30 s du dernier niveau : il y reste
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 30, false, 'demo', A(20, 40)]]);
  // Passé 30 s depuis le dernier niveau noté, un réglage est une ligne à lui : « Réglée à … », à SON heure.
  m.avancer(31000);
  m.geste(id, 'turn_on', { brightness_pct: 80 });
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 30, false, 'demo', A(20, 40)], ['on', 80, true, 'demo', A(20, 40) + 51000]]);
});

test('11 bis, R4 : une note de réglage garde l’heure de son PREMIER changement — la glissière qu’on promène ne la décale pas, chaque pas prolonge les 30 s', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const id = 'light.bureau';                           // allumée depuis 18:05 (l’histoire de sa journée)
  m.geste(id, 'turn_on', { brightness_pct: 60 });
  for (const pct of [55, 50, 45, 40]) { m.avancer(20000); m.geste(id, 'turn_on', { brightness_pct: pct }); }
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 40, true, 'demo', A(20, 40)]],
    'cinq pas sur 80 s, un seul réglage : le dernier niveau, l’heure du premier pas (chaque pas à moins de 30 s du précédent)');
  // Un trou de 30 s ou plus, et le suivant est une note à lui — à son heure.
  m.avancer(30000);
  m.geste(id, 'turn_on', { brightness_pct: 90 });
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 40, true, 'demo', A(20, 40)], ['on', 90, true, 'demo', A(20, 40) + 110000]]);
});

test('11 bis, R4 : comme le serveur, un réglage ne se fond que chez le même auteur, ou sans auteur — l’écho d’une ampoule se fond, le réglage d’un autre compte est une ligne à lui', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const id = 'light.cuisine';
  m.geste(id, 'turn_on', {});                           // le compte de la démo allume
  m.avancer(5000);
  // L'écho de l'ampoule, qui confirme son niveau : aucun auteur — il se fond dans la note du compte.
  gesteLumiereDemo(m.states, id, 'turn_on', { brightness_pct: 70 }, { utilisateur: null, maintenant: A(20, 40) + 5000 });
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 70, false, 'demo', A(20, 40)]]);
  m.avancer(5000);
  // Un autre compte règle, à 5 s : un autre auteur — une ligne à lui, et la note du premier reste ce qu’elle était.
  gesteLumiereDemo(m.states, id, 'turn_on', { brightness_pct: 40 }, { utilisateur: 'autre', maintenant: A(20, 40) + 10000 });
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 70, false, 'demo', A(20, 40)], ['on', 40, true, 'autre', A(20, 40) + 10000]]);
  m.avancer(5000);
  // Et ce second auteur, qui règle encore à moins de 30 s : se fond dans SA note.
  gesteLumiereDemo(m.states, id, 'turn_on', { brightness_pct: 25 }, { utilisateur: 'autre', maintenant: A(20, 40) + 15000 });
  assert.deepEqual(lignes(await duSoir(m, id)), [['on', 70, false, 'demo', A(20, 40)], ['on', 25, true, 'autre', A(20, 40) + 10000]]);
});

test('11 bis, R4 : le carnet garde ce que la lampe a de plus récent — une couleur seule posée ENTRE l’allumage et un réglage fondu dans lui ne le rend pas périmé', async () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const id = 'light.veilleuse_chambre_lino';            // en couleur, allumée depuis 20:30 par l’automatisation
  m.geste(id, 'turn_off');
  m.avancer(1000);
  m.geste(id, 'turn_on', {});                           // allumée de nouveau par Loggia : la note de l’allumage
  m.avancer(4000);
  m.geste(id, 'turn_on', { hs_color: [0, 100] });       // une couleur seule : aucune ligne, mais le carnet la garde
  m.avancer(5000);
  m.geste(id, 'turn_on', { brightness_pct: 40 });       // un réglage : il se fond dans l’allumage (10 s après lui)
  assert.deepEqual((await duSoir(m, id)).map(e => [e.state, e.bri, e.reglage]), [['off', null, false], ['on', 40, false]], 'l’extinction, puis l’allumage au dernier niveau');
  const rouge40 = { bri: 40, mode: 'xy', kelvin: null, hs: [0, 100] };
  assert.deepEqual(m.etat().lumieres[id].dernier, rouge40, 'le niveau 40 % ET la couleur rouge : la couleur seule, plus récente que l’allumage, ne ramène pas l’ancien niveau');
  m.geste(id, 'turn_off');
  assert.deepEqual(m.etat().lumieres[id].dernier, rouge40, 'éteinte, le repère gris dit 40 %, en rouge');
  m.geste(id, 'turn_on', {});
  const a = m.states[id].attributes;
  assert.deepEqual([Math.round(a.brightness / 2.55), a.hs_color], [40, [0, 100]], 'rallumée sans rien dire : 40 %, rouge');
});

test('ADR 0261 : dans la démo, « Bonne nuit » éteint « sauf les veilleuses » — la veilleuse de Lino n’est pas une cible', () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const S = m.states;
  assert.equal(S['light.veilleuse_chambre_lino'].state, 'on', 'à 20:40 la veilleuse est allumée');
  const nuit = m.scenarios().find(s => s.id === 'nuit');
  const lumieres = nuit.resume.find(r => r.famille === 'lumieres');
  assert.equal(lumieres.geste, 'eteindre');
  const allumees = Object.keys(S).filter(id => id.indexOf('light.') === 0 && S[id].state === 'on');
  assert.ok(allumees.includes('light.veilleuse_chambre_lino'));
  assert.equal(lumieres.n, allumees.length - 1, 'toutes les lampes allumées, moins la veilleuse');
  const tout = m.scenarios().find(s => s.id === 'tout_eteindre');
  const sansGarde = tout && tout.resume.find(r => r.famille === 'lumieres');
  // ASSERTION MODIFIÉE (retouches du 19/10, R6 — les veilleuses sont épargnées PARTOUT) : sans l'option aussi, une extinction ne compte pas la veilleuse.
  if (sansGarde) assert.equal(sansGarde.n, allumees.length - 1, 'sans la garde cochée, la veilleuse est épargnée quand même');
});

/* TEST AJOUTÉ (retouches du 19/10, R4). La démo porte chaque cas : le plafonnier du salon publie des effets (`effect_list`,
 * `effect`, le bit 4 de `supported_features`), et le moteur de la démo applique `effect` à `light.turn_on` comme Home Assistant —
 * un effet hors liste est ignoré, un réglage ne le défait pas, éteinte il s'efface, rallumée sans rien dire : « aucun ». */
test('R4 : la démo porte le cas des effets — le plafonnier du salon en publie, et `light.turn_on` avec `effect` l’applique', () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const S = m.states;
  const a = S['light.salon'].attributes;
  assert.ok(Array.isArray(a.effect_list) && a.effect_list.length >= 3, 'une liste d’effets réaliste');
  assert.equal(a.effect, 'None', 'aucun effet en cours');
  assert.equal(a.supported_features & 4, 4, 'la fonction effet annoncée (le bit 4 de `supported_features`)');
  m.geste('light.salon', 'turn_on', { effect: 'candle' });
  assert.equal(S['light.salon'].attributes.effect, 'candle', 'l’effet s’applique');
  assert.equal(S['light.salon'].state, 'on');
  m.geste('light.salon', 'turn_on', { brightness_pct: 50 });
  assert.equal(S['light.salon'].attributes.effect, 'candle', 'un réglage ne le défait pas');
  m.geste('light.salon', 'turn_on', { effect: 'inconnu' });
  assert.equal(S['light.salon'].attributes.effect, 'candle', 'un effet que la liste ne nomme pas est ignoré');
  m.geste('light.salon', 'turn_off');
  assert.equal(S['light.salon'].attributes.effect, null, 'éteinte, plus d’effet');
  m.geste('light.salon', 'turn_on');
  assert.equal(S['light.salon'].attributes.effect, 'None', 'rallumée sans rien dire : aucun effet');
  m.geste('light.salon', 'turn_on', { effect: 'None' });
  assert.equal(S['light.salon'].attributes.effect, 'None');
  m.geste('light.cuisine', 'turn_off');
  m.geste('light.cuisine', 'turn_on', { effect: 'candle' });
  assert.ok(!('effect' in S['light.cuisine'].attributes), 'une lampe sans effets n’en reçoit pas');
});

/* TEST AJOUTÉ (retouches du 19/10, R6 — sa décision : les veilleuses sont épargnées PARTOUT). Dans la démo comme au serveur, une
 * EXTINCTION de la famille lumières par un scénario épargne toujours la veilleuse de la règle Nuit, que l'option « sauf les
 * veilleuses » soit cochée ou non ; un allumage n'est pas concerné. */
test('R6 : une extinction par un scénario épargne toujours la veilleuse, option cochée ou non ; un allumage n’est pas concerné', () => {
  const m = maisonLumieresDemo({ quand: A(20, 40) });
  const S = m.states;
  const lino = 'light.veilleuse_chambre_lino';
  assert.equal(S[lino].state, 'on');
  const allumees = Object.keys(S).filter(id => id.indexOf('light.') === 0 && S[id].state === 'on');
  const tout = m.scenarios().find(s => s.id === 'tout_eteindre');
  assert.equal(tout.resume.find(r => r.famille === 'lumieres').n, allumees.length - 1, '« Tout éteindre » (sans l’option) ne compte pas la veilleuse');
  assert.ok(!m.cibles({ famille: 'lumieres', geste: 'eteindre', portee: 'maison' }).includes(lino), 'éteindre, sans l’option : épargnée');
  assert.ok(!m.cibles({ famille: 'lumieres', geste: 'eteindre', portee: 'maison', sauf_veilleuses: true }).includes(lino), 'un ancien scénario qui porte encore le champ : épargnée aussi');
  assert.ok(m.cibles({ famille: 'lumieres', geste: 'allumer', portee: 'maison' }).includes(lino), 'allumer : la veilleuse est une cible comme une autre');
  m.lancerScenario('tout_eteindre');
  assert.equal(S[lino].state, 'on', 'lancé : la veilleuse reste allumée');
  assert.ok(allumees.filter(id => id !== lino).every(id => S[id].state === 'off'), 'les autres s’éteignent');
});
