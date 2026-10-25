/* Un lecteur, lu (chantier Médias, tâche 2 ; M6, M10, M11, M14 ; § 5, § 7).
 *
 * Ce qui est garanti ici, sans écran (lecteur.js est pur) :
 *  - M11 : les BITS décident de chaque commande — une Echo officielle (5644) n'a ni lecture ni pause, la jumelle HACS (318399)
 *    tout, une Apple TV (450487) sait parcourir et s'éteindre, le haut-parleur d'une sonnette (136708) ne lit rien ;
 *  - M10 : l'interrupteur ne sert que si `TURN_ON` et `TURN_OFF` existent et que l'appareil n'est pas une Echo (`estAlexa`) ;
 *  - M14 : le jumeau — celle qui a le plus de bits de transport commande (`ctl`), la carte garde l'officielle (`haid`), ce qui
 *    joue se lit sur celle qui joue, le volume sur celle qui le règle ; un principal mort laisse la main à son jumeau ;
 *  - M6, § 5 : la phrase, dans l'ordre — indisponible depuis, l'annonce en vol, éteinte, rien en lecture, en pause · titre,
 *    titre · artiste ; une série, une radio, une TV sans titre ; le geste d'abord (`marche`, `lecture`) ;
 *  - les mots du volume (« Volume 30 % », « Muet », « 30 % »), le genre, le glyphe, la position qui avance, les temps. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const L = await import('../src/lecteur.js');
const { BITS, estAlexa, lireLecteur, commandesLecteur, phraseLecteur, titreLecteur, estRadio, volumeTexte, pourcentTexte, genreLecteur, glypheLecteur, posLecteur, fmtTemps, nomLecteur } = L;

const NBSP = String.fromCharCode(160);
const iso = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const st = (state, attributes = {}, depuis = iso(14, 20)) => ({ state, attributes, last_changed: depuis, last_updated: depuis });
const OFFICIELLE = 'media_player.chambre_lino_echo_dot', HACS = 'media_player.echo_dot_chambre_lino', ATV = 'media_player.apple_tv_salon', SONNETTE = 'media_player.sonnette_haut_parleur';
const paire = (etatOff = 'playing', etatHacs = 'playing', hacsAttrs = {}) => ({
  [OFFICIELLE]: st(etatOff, { friendly_name: 'Echo Dot - Chambre Lino', supported_features: 5644, volume_level: .3, device_class: 'speaker' }),
  [HACS]: st(etatHacs, { friendly_name: 'Echo Dot Chambre Lino', supported_features: 318399, volume_level: .3, media_title: 'Bin K’uchul Xibalba', media_artist: 'Metal_Chaos', media_duration: 256, media_position: 91, media_position_updated_at: new Date(Date.now() - 10000).toISOString(), shuffle: true, repeat: 'all', app_name: 'Amazon Music', ...hacsAttrs }),
});
const ECHO = { haid: OFFICIELLE, ma: HACS, alexa: true };

test('M11 : les bits décident — ce qu’une entité ne sait pas n’est pas dessiné', () => {
  assert.deepEqual([BITS.PAUSE, BITS.SEEK, BITS.VOLUME_SET, BITS.VOLUME_MUTE, BITS.PREVIOUS, BITS.NEXT, BITS.TURN_ON, BITS.TURN_OFF, BITS.PLAY, BITS.SHUFFLE_SET, BITS.BROWSE_MEDIA, BITS.REPEAT_SET],
    [1, 2, 4, 8, 16, 32, 128, 256, 16384, 32768, 131072, 262144]);
  // Une Echo officielle seule (5644 = volume, muet, play_media, pas de volume, stop) : le volume et le muet, rien d'autre.
  const seule = lireLecteur({ [OFFICIELLE]: st('idle', { supported_features: 5644, volume_level: .3 }) }, { haid: OFFICIELLE, ma: null, alexa: true });
  assert.deepEqual(commandesLecteur(seule), { lecture: false, precedent: false, suivant: false, aleatoire: false, repeter: false, chercher: false, volume: true, muet: true, parcourir: false, marche: false });
  // La jumelle HACS (318399) sait tout — sauf parcourir (aucun arbre) : « Parcourir » quitte les Echo.
  const dot = lireLecteur(paire(), ECHO);
  assert.deepEqual(commandesLecteur(dot), { lecture: true, precedent: true, suivant: true, aleatoire: true, repeter: true, chercher: true, volume: true, muet: true, parcourir: false, marche: false });
  // Une Apple TV (450487) : tout, l'interrupteur compris (pas une Echo), et la bibliothèque — mais pas le muet : 450487 n'a pas le bit 8.
  const atv = lireLecteur({ [ATV]: st('playing', { supported_features: 450487, volume_level: .4, media_title: 'Stranger Things', media_duration: 4672, device_class: 'tv' }) }, { haid: ATV, ma: null, alexa: false });
  assert.deepEqual(commandesLecteur(atv), { lecture: true, precedent: true, suivant: true, aleatoire: true, repeter: true, chercher: true, volume: true, muet: false, parcourir: true, marche: true });
  // Le haut-parleur d'une sonnette (136708 : volume, play_media, stop, browse) : le volume et la bibliothèque ; ni lecture, ni pause, ni muet.
  const sonnette = lireLecteur({ [SONNETTE]: st('idle', { supported_features: 136708, volume_level: .5 }) }, { haid: SONNETTE, ma: null, alexa: false });
  assert.deepEqual(commandesLecteur(sonnette), { lecture: false, precedent: false, suivant: false, aleatoire: false, repeter: false, chercher: false, volume: true, muet: false, parcourir: true, marche: false });
  // Sans `volume_level`, pas de volume — quels que soient les bits ; sans durée, pas de recherche.
  const sansVolume = lireLecteur({ [ATV]: st('playing', { supported_features: 450487 }) }, { haid: ATV, ma: null, alexa: false });
  assert.deepEqual([commandesLecteur(sansVolume).volume, commandesLecteur(sansVolume).muet, commandesLecteur(sansVolume).chercher], [false, false, false]);
});

test('M10 : l’interrupteur s’il sert — les deux bits, et pas une Echo', () => {
  assert.deepEqual(['alexa_media', 'alexa_devices', 'apple_tv', 'cast', null].map(estAlexa), [true, true, false, false, false]);
  // Une Echo HACS a les bits on/off (318399 porte 128 et 256) : ils ne coupent rien, la bascule n'est pas dessinée.
  const dot = lireLecteur(paire(), ECHO);
  assert.ok(dot.alexa && (dot.bits & BITS.TURN_ON) && (dot.bits & BITS.TURN_OFF));
  assert.equal(commandesLecteur(dot).marche, false);
  // Une barre de son `cast` (152461 : 128 et 256) : la bascule.
  const barre = lireLecteur({ 'media_player.barre': st('off', { supported_features: 152461 }) }, { haid: 'media_player.barre', ma: null, alexa: false });
  assert.equal(commandesLecteur(barre).marche, true);
  // Un seul des deux bits : pas de bascule.
  const demi = lireLecteur({ 'media_player.demi': st('off', { supported_features: 128 }) }, { haid: 'media_player.demi', ma: null, alexa: false });
  assert.equal(commandesLecteur(demi).marche, false);
});

test('M14 : le jumeau — la jumelle HACS commande, l’officielle garde la carte, ce qui joue se lit sur celle qui joue', () => {
  const S = paire('playing', 'playing');
  const l = lireLecteur(S, ECHO);
  assert.deepEqual([l.haid, l.ma, l.ctl, l.volId], [OFFICIELLE, HACS, HACS, HACS], 'la HACS a les bits de transport et de volume : elle commande');
  assert.deepEqual([l.title, l.artist, l.dur, l.app, l.shuffle, l.repeat], ['Bin K’uchul Xibalba', 'Metal_Chaos', 256, 'Amazon Music', true, 'all']);
  assert.deepEqual([l.on, l.playing, l.paused, l.indispo, l.vol, l.hasVol, l.muted, l.alexa], [true, true, false, false, 30, true, false, true]);
  assert.equal(l.bits, 5644 | 318399, 'l’union des deux : ce que l’appareil sait, par l’une ou l’autre');
  assert.equal(l.bitsCtl, 318399);
  // L'officielle dit `idle` quand la HACS joue : la carte dit ce qui joue.
  const l2 = lireLecteur(paire('idle', 'playing'), ECHO);
  assert.deepEqual([l2.playing, l2.title], [true, 'Bin K’uchul Xibalba']);
  // En pause des deux côtés : en pause, le titre gardé.
  const l3 = lireLecteur(paire('paused', 'paused'), ECHO);
  assert.deepEqual([l3.playing, l3.paused, l3.title], [false, true, 'Bin K’uchul Xibalba']);
  // Le principal mort, la jumelle vivante : pas indisponible, la jumelle commande ; les deux mortes : indisponible, « depuis » la dernière tombée.
  const l4 = lireLecteur({ ...paire('unavailable', 'playing'), [OFFICIELLE]: st('unavailable', { supported_features: 5644 }, iso(9, 0)) }, ECHO);
  assert.deepEqual([l4.indispo, l4.ctl, l4.on, l4.playing], [false, HACS, true, true]);
  const l5 = lireLecteur({ [OFFICIELLE]: st('unavailable', { supported_features: 5644 }, iso(9, 0)), [HACS]: st('unavailable', { supported_features: 318399 }, iso(14, 20)) }, ECHO);
  assert.deepEqual([l5.indispo, l5.on, l5.depuis], [true, false, iso(14, 20)]);
  // Une entité absente des états : indisponible, sans « depuis ».
  const l6 = lireLecteur({}, { haid: OFFICIELLE, ma: null });
  assert.deepEqual([l6.indispo, l6.depuis, l6.ctl, l6.volId], [true, null, OFFICIELLE, OFFICIELLE]);
  // Sans jumeau, l'entité fait tout : Music Assistant d'avant (`ma`) suit la même règle que la jumelle HACS.
  const ma = lireLecteur({ 'media_player.natif': st('idle', { supported_features: 4 | 8, volume_level: .4 }), 'media_player.ma': st('playing', { supported_features: 16384 | 1 | 16 | 32, media_title: 'Une chanson' }) }, { haid: 'media_player.natif', ma: 'media_player.ma' });
  assert.deepEqual([ma.ctl, ma.volId, ma.title, ma.vol, ma.playing], ['media_player.ma', 'media_player.natif', 'Une chanson', 40, true]);
});

test('M6, § 5 : la phrase d’état, dans l’ordre, et son encre', () => {
  const dot = lireLecteur(paire(), ECHO);
  assert.deepEqual(phraseLecteur(dot), { texte: 'Bin K’uchul Xibalba · Metal_Chaos', encre: 'var(--o-text1)', panne: false }, '6. en lecture : « {titre} · {artiste} »');
  assert.deepEqual(phraseLecteur(lireLecteur(paire('paused', 'paused'), ECHO)), { texte: 'En pause · Bin K’uchul Xibalba · Metal_Chaos', encre: 'var(--o-text2)', panne: false }, '5. en pause · le titre');
  const idle = lireLecteur({ [OFFICIELLE]: st('idle', { supported_features: 5644, volume_level: .3 }) }, { haid: OFFICIELLE, ma: null, alexa: true });
  assert.deepEqual(phraseLecteur(idle), { texte: 'Rien en lecture', encre: 'var(--o-text2)', panne: false }, '4. rien en lecture — plus jamais « En pause » sur un lecteur inactif');
  const off = lireLecteur({ [ATV]: st('off', { supported_features: 450487 }) }, { haid: ATV, ma: null });
  assert.deepEqual(phraseLecteur(off), { texte: 'Éteinte', encre: 'var(--o-text2)', panne: false }, '3. éteinte (le mot des lumières)');
  assert.deepEqual(phraseLecteur(lireLecteur({ [ATV]: st('standby', { supported_features: 450487 }) }, { haid: ATV })).texte, 'Éteinte', '`standby` aussi');
  assert.deepEqual(phraseLecteur(dot, { annonce: 'À table !' }), { texte: 'Annonce : « À table ! »', encre: 'var(--o-accent-soft)', panne: false }, '2. une annonce en vol passe avant tout, sauf la panne');
  const morte = lireLecteur({ [OFFICIELLE]: st('unavailable', { supported_features: 5644 }, iso(14, 20)) }, { haid: OFFICIELLE, ma: null });
  assert.deepEqual(phraseLecteur(morte, { annonce: 'À table !' }), { texte: 'Indisponible depuis 14:20', encre: 'var(--o-bad)', panne: true }, '1. indisponible depuis, en rouge, le liseré');
  const hier = new Date(); hier.setDate(hier.getDate() - 1); hier.setHours(22, 5, 0, 0);
  assert.equal(phraseLecteur(lireLecteur({ [OFFICIELLE]: st('unavailable', {}, hier.toISOString()) }, { haid: OFFICIELLE })).texte, 'Indisponible depuis hier', '« depuis hier » la veille — la règle des lumières ; la date au-delà, celle des prises');
  assert.equal(phraseLecteur(lireLecteur({}, { haid: OFFICIELLE })).texte, 'Indisponible', 'retirée : sans « depuis »');
  // Le geste d'abord : une avance remplace l'état lu.
  assert.equal(phraseLecteur(dot, { lecture: false }).texte, 'En pause · Bin K’uchul Xibalba · Metal_Chaos');
  assert.equal(phraseLecteur(lireLecteur(paire('paused', 'paused'), ECHO), { lecture: true }).texte, 'Bin K’uchul Xibalba · Metal_Chaos');
  assert.equal(phraseLecteur(dot, { marche: false }).texte, 'Éteinte');
  assert.equal(phraseLecteur(off, { marche: true }).texte, 'Rien en lecture', 'allumée par le geste, sans titre : rien en lecture');
  // En lecture sans rien à dire : « En lecture », jamais « Lecture » (l'état d'avant).
  const muette = lireLecteur({ [OFFICIELLE]: st('playing', { supported_features: 5644 }) }, { haid: OFFICIELLE });
  assert.equal(phraseLecteur(muette).texte, 'En lecture');
});

test('§ 5 : une série, une radio, une TV sans titre, un titre sans artiste', () => {
  const tv = (a) => lireLecteur({ [ATV]: st('playing', { supported_features: 450487, device_class: 'tv', ...a }) }, { haid: ATV });
  assert.equal(titreLecteur(tv({ media_title: 'Stranger Things', media_artist: 'S4 - E1', app_name: 'Netflix' })), 'Stranger Things · S4 - E1', 'ce que le lecteur met dans l’artiste, comme la démo');
  assert.equal(titreLecteur(tv({ media_series_title: 'Stranger Things', media_title: 'Chapter One', media_season: 4, media_episode: 1 })), 'Stranger Things · S4 E1', 'la série et son épisode quand ils existent');
  assert.equal(titreLecteur(tv({ app_name: 'Netflix' })), 'Netflix', 'une TV sans titre dit son application');
  assert.equal(titreLecteur(tv({ media_title: 'Clair de Lune' })), 'Clair de Lune', 'un titre sans artiste');
  const radio = lireLecteur({ [HACS]: st('paused', { supported_features: 318399, media_title: 'France Inter', media_artist: 'Radio', media_content_type: 'channel', app_name: 'TuneIn' }) }, { haid: HACS });
  assert.ok(estRadio(radio));
  assert.equal(titreLecteur(radio), 'France Inter', 'une radio sans durée dit sa station — « En direct » n’est écrit que dans la popup');
  assert.equal(phraseLecteur(radio).texte, 'En pause · France Inter');
  assert.equal(estRadio(lireLecteur(paire(), ECHO)), false, 'un morceau avec une durée n’est pas une radio');
});

test('les mots du volume : le nombre et son unité ne se séparent pas ; le genre, le glyphe', () => {
  assert.equal(volumeTexte(30, false), 'Volume 30' + NBSP + '%');
  assert.equal(volumeTexte(30, true), 'Muet');
  assert.equal(pourcentTexte(30), '30' + NBSP + '%');
  assert.equal(pourcentTexte(null), '—' + NBSP + '%');
  const dot = lireLecteur(paire(), ECHO), tv = lireLecteur({ [ATV]: st('off', { device_class: 'tv' }) }, { haid: ATV });
  assert.deepEqual([genreLecteur(dot, 'Echo Dot (3rd Gen)'), genreLecteur(dot), genreLecteur(tv)], ['Echo Dot (3rd Gen)', 'Enceinte', 'Téléviseur'], 'le modèle du registre, sinon la classe');
  assert.deepEqual([glypheLecteur(dot), glypheLecteur(tv)], ['speaker', 'screen']);
  assert.equal(nomLecteur({}, { haid: OFFICIELLE, name: 'Echo Dot - Chambre Lino' }), 'Echo Dot - Chambre Lino');
  assert.equal(nomLecteur(paire(), { haid: OFFICIELLE }), 'Echo Dot - Chambre Lino', 'sans nom configuré, celui de Home Assistant');
  assert.equal(nomLecteur(paire(), { haid: OFFICIELLE }, 'Mon Echo'), 'Mon Echo', 'l’étiquette de l’éditeur d’abord');
});

test('la position avance avec le temps en lecture, bornée par la durée ; les temps s’écrivent m:ss', () => {
  const t0 = Date.now();
  const l = lireLecteur(paire(), ECHO);
  assert.equal(Math.round(posLecteur(l, l.posAt + 10000)), 101, '91 s publiées il y a 10 s : 101');
  assert.equal(posLecteur(l, l.posAt + 10 * 60000), 256, 'jamais au-delà de la durée');
  const pause = lireLecteur(paire('paused', 'paused'), ECHO);
  assert.equal(posLecteur(pause, t0 + 60000), 91, 'en pause, la position ne bouge pas');
  assert.equal(posLecteur(lireLecteur({ [OFFICIELLE]: st('idle', {}) }, { haid: OFFICIELLE }), t0), null);
  assert.deepEqual([fmtTemps(0), fmtTemps(65), fmtTemps(256), fmtTemps(4672), fmtTemps(null), fmtTemps(-3)], ['0:00', '1:05', '4:16', '1:17:52', '0:00', '0:00']);
});

test('M15, M16 : le compte d’une liste de lecteurs — la paire compte une fois et joue par sa jumelle ; un indisponible compte dans le total, pas parmi les vivants', () => {
  const S = { ...paire('idle', 'playing'), [ATV]: st('off', { supported_features: 450487, device_class: 'tv' }), 'media_player.bureau': st('unavailable', { supported_features: 5644 }) };
  const lecteurs = [ECHO, { haid: ATV, ma: null, alexa: false }, { haid: 'media_player.bureau', ma: null, alexa: true }];
  assert.deepEqual(L.compteLecteurs(S, lecteurs), { enLecture: 1, vivants: 2, total: 3 }, 'l’Echo joue par sa jumelle HACS ; l’Apple TV éteinte répond ; l’Echo du bureau ne répond pas');
  assert.deepEqual(L.compteLecteurs(S, []), { enLecture: 0, vivants: 0, total: 0 });
  assert.deepEqual(L.compteLecteurs({}, lecteurs), { enLecture: 0, vivants: 0, total: 3 }, 'sans états, personne ne répond');
});

/* ── Passe bis du 17/10 (ADR 0208) ─────────────────────────────────────────────────────────────────────────────────────────────── */

test('passe bis, M14 : une jumelle INDISPONIBLE ne commande pas — Home Assistant lui garde ses bits, la puce de lecture partait dans le vide ; le volume reste sur l’officielle', () => {
  const S = { ...paire('idle', 'unavailable'), [HACS]: st('unavailable', { supported_features: 318399, volume_level: .3 }, iso(9, 0)) };
  const l = lireLecteur(S, ECHO);
  assert.deepEqual([l.indispo, l.ctl, l.volId, l.on, l.playing, l.vol], [false, OFFICIELLE, OFFICIELLE, true, false, 30], 'l’officielle répond : elle garde la carte, le volume est le sien');
  assert.deepEqual([commandesLecteur(l).lecture, commandesLecteur(l).suivant, commandesLecteur(l).volume], [false, false, true], 'aucune puce de lecture (5644 n’a ni lecture ni pause) ; le volume reste');
  assert.equal(l.bitsCtl, 5644, 'les bits de celle qui commande, pas l’union');
  assert.equal(phraseLecteur(l).texte, 'Rien en lecture');
  // Une jumelle morte dont l'officielle joue : « En lecture », sans titre — on ne sait pas ce qui joue, on ne l'invente pas.
  const l2 = lireLecteur({ ...S, [OFFICIELLE]: st('playing', { supported_features: 5644, volume_level: .3 }) }, ECHO);
  assert.deepEqual([l2.ctl, l2.playing, l2.title], [OFFICIELLE, true, null]);
  assert.equal(phraseLecteur(l2).texte, 'En lecture');
});

test('passe bis, M14 : l’état d’une paire se lit sur celle qui COMMANDE dès qu’elle a des bits de transport — l’officielle restée `playing` ne masque plus la pause de la jumelle', () => {
  const enPause = lireLecteur(paire('playing', 'paused'), ECHO);
  assert.deepEqual([enPause.ctl, enPause.playing, enPause.paused, enPause.title], [HACS, false, true, 'Bin K’uchul Xibalba'], 'la jumelle en pause : en pause');
  assert.equal(phraseLecteur(enPause).texte, 'En pause · Bin K’uchul Xibalba · Metal_Chaos');
  const inactive = lireLecteur(paire('playing', 'idle', { media_title: null, media_artist: null, media_duration: null, media_position: null, app_name: null }), ECHO);
  assert.deepEqual([inactive.playing, inactive.paused, inactive.idle, inactive.title], [false, false, true, null], 'la jumelle inactive : rien en lecture, quoi que dise l’officielle');
  assert.equal(phraseLecteur(inactive).texte, 'Rien en lecture');
  // L'inverse tient toujours : l'officielle `idle`, la jumelle joue.
  assert.deepEqual([lireLecteur(paire('idle', 'playing'), ECHO).playing, lireLecteur(paire('paused', 'playing'), ECHO).playing], [true, true]);
  // La position et le titre viennent de `ctl` aussi (ici l'officielle n'en a pas : rien ne change) ; le compte suit.
  assert.deepEqual(L.compteLecteurs(paire('playing', 'paused'), [ECHO]), { enLecture: 0, vivants: 1, total: 1 });
  // Sans bits de transport d'aucun côté (deux officielles ?), l'une ou l'autre : ce qui joue se lit sur celle qui joue, comme avant.
  const sansTransport = lireLecteur({ 'media_player.a': st('idle', { supported_features: 5644 }), 'media_player.b': st('playing', { supported_features: 5644, media_title: 'Un flux' }) }, { haid: 'media_player.a', ma: 'media_player.b' });
  assert.deepEqual([sansTransport.playing, sansTransport.title], [true, 'Un flux']);
});

test('passe bis, § 5 : une TV `idle` (ou `on`) dans le menu d’une appli dit « Rien en lecture » — l’état prime sur un titre que l’appli prêterait ; en lecture, l’appli reste un titre', () => {
  const tv = (etat, a = {}) => lireLecteur({ [ATV]: st(etat, { supported_features: 450487, device_class: 'tv', volume_level: .4, app_name: 'Netflix', ...a }) }, { haid: ATV, ma: null, alexa: false });
  for (const etat of ['idle', 'on']) {
    const l = tv(etat);
    assert.deepEqual([l.idle, l.playing, l.paused, l.app, titreLecteur(l)], [true, false, false, 'Netflix', null], etat + ' : pas de titre ; l’appli reste à sa place de source (M10)');
    assert.deepEqual(phraseLecteur(l), { texte: 'Rien en lecture', encre: 'var(--o-text2)', panne: false }, etat + ' : « Rien en lecture », pas « En pause · Netflix »');
  }
  assert.deepEqual([tv('playing').idle, titreLecteur(tv('playing')), phraseLecteur(tv('playing')).texte], [false, 'Netflix', 'Netflix'], 'en lecture sans titre : l’appli, comme avant');
  assert.deepEqual([tv('paused').idle, phraseLecteur(tv('paused')).texte], [false, 'En pause · Netflix'], 'en pause dans l’appli : en pause');
  // Le geste d'abord : « Lire » sur une TV inactive dit « En lecture » le temps de l'avance.
  assert.equal(phraseLecteur(tv('idle'), { lecture: true }).texte, 'En lecture');
  // Une radio `idle` qui garderait son appli : pas un titre non plus.
  assert.equal(titreLecteur(tv('idle', { media_content_type: 'channel' })), null);
});

test('chantier Mode enfant, E15 : deux lignes AVANT « Éteinte » — « Coucher · revient à 07:30 », « Temps écoulé · demain 07:30 » (ou « · demande envoyée ») ; au coucher, ce qui joue se nomme ; le temps écoulé ne change rien à une lecture', () => {
  const dot = lireLecteur(paire(), ECHO), off = lireLecteur(paire('off', 'off'), ECHO);
  const coucher = { bloque: 'coucher', reprise: '07:30', demande: null };
  const temps = { bloque: 'temps', reprise: '07:30', demande: null };
  assert.deepEqual(phraseLecteur(off, { enfant: coucher }), { texte: 'Coucher · revient à 07:30', encre: 'var(--o-text2)', panne: false }, 'éteinte au coucher : quand elle revient, pas « Éteinte »');
  assert.deepEqual(phraseLecteur(off, { enfant: temps }), { texte: 'Temps écoulé · demain 07:30', encre: 'var(--o-text2)', panne: false }, 'éteinte, le temps écoulé : demain');
  assert.equal(phraseLecteur(off, { enfant: { ...temps, demande: { appareil: ATV, quand: 1, reponse: null } } }).texte, 'Temps écoulé · demande envoyée', 'une demande en attente');
  assert.equal(phraseLecteur(off, { enfant: { ...temps, demande: { appareil: ATV, quand: 1, reponse: 'refusee' } } }).texte, 'Temps écoulé · demain 07:30', 'une demande répondue n’est plus « envoyée »');
  // En lecture au coucher : ce qui joue — le son pour dormir (la maquette : « Coucher · bruit blanc ») ; le temps écoulé, lui, ne
  // change pas une lecture (la maison éteint dans les 20 s, la carte ne ment pas d'ici là).
  assert.deepEqual(phraseLecteur(dot, { enfant: coucher }), { texte: 'Coucher · Bin K’uchul Xibalba · Metal_Chaos', encre: 'var(--o-text2)', panne: false });
  assert.equal(phraseLecteur(dot, { enfant: temps }).texte, 'Bin K’uchul Xibalba · Metal_Chaos');
  assert.equal(phraseLecteur(lireLecteur(paire('idle', 'idle'), ECHO), { enfant: coucher }).texte, 'Coucher · revient à 07:30', 'inactive au coucher : quand elle revient');
  assert.equal(phraseLecteur(lireLecteur({ [OFFICIELLE]: st('playing', { supported_features: 5644 }) }, { haid: OFFICIELLE }), { enfant: coucher }).texte, 'Coucher · En lecture', 'en lecture sans rien à dire');
  // La panne et l'annonce passent avant ; sans blocage, rien ne change ; un profil illisible non plus.
  assert.equal(phraseLecteur(dot, { enfant: coucher, annonce: 'À table !' }).texte, 'Annonce : « À table ! »');
  assert.equal(phraseLecteur(lireLecteur({}, { haid: OFFICIELLE }), { enfant: coucher }).texte, 'Indisponible');
  assert.equal(phraseLecteur(off, { enfant: { bloque: null, reprise: '07:30', demande: null } }).texte, 'Éteinte');
  assert.equal(phraseLecteur(off, { enfant: 'cassé' }).texte, 'Éteinte');
  // Le geste d'abord : une Echo au coucher mise en pause dit quand elle revient ; allumée par le geste et bloquée, le blocage.
  assert.equal(phraseLecteur(dot, { enfant: coucher, lecture: false }).texte, 'Coucher · revient à 07:30');
  assert.equal(phraseLecteur(off, { enfant: temps, marche: true }).texte, 'Temps écoulé · demain 07:30');
});

test('passe bis 2, § 5, M11 : « Rien en lecture » exactement quand il n’y a rien à reprendre — en pause SANS titre, « En pause » (la carte garde sa puce) ; inactive ou sans rien, « Rien en lecture » (pas de puce)', () => {
  const seule = (etat, a = {}) => lireLecteur({ [HACS]: st(etat, { supported_features: 318399, volume_level: .3, ...a }) }, { haid: HACS, ma: null, alexa: true });
  // En pause sans titre ni appli : il y a quelque chose à reprendre — § 5, ligne 5 : « En pause », plus « Rien en lecture ».
  const pause = seule('paused');
  assert.deepEqual([pause.paused, pause.idle, titreLecteur(pause), phraseLecteur(pause).texte], [true, false, null, 'En pause']);
  // Le geste d'abord : « Pause » sur un lecteur qui joue sans titre dit « En pause » le temps de l'avance — pas « Rien en lecture ».
  assert.equal(phraseLecteur(seule('playing'), { lecture: false }).texte, 'En pause');
  // Rien à reprendre — ni en lecture, ni en pause, ni un titre (`buffering` sans rien, `idle`) : « Rien en lecture » ; la carte n'a pas de puce (tests/carte_media).
  for (const etat of ['buffering', 'idle']) {
    const rien = seule(etat);
    assert.deepEqual([rien.playing, rien.paused, !!(rien.playing || rien.paused || titreLecteur(rien)), phraseLecteur(rien).texte], [false, false, false, 'Rien en lecture'], etat);
  }
  // Un titre sans lecture ni pause (un état que l'intégration nomme autrement) : à reprendre — « En pause · {titre} », comme avant.
  assert.equal(phraseLecteur(seule('buffering', { media_title: 'Ruinas' })).texte, 'En pause · Ruinas');
});
