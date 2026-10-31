/* La fiche d'un lecteur (chantier Médias, tâche 6 ; sa maquette « Cartes médias », cadres 1b à 1e ; § 6.5 à 6.10 ; M7, M10 à M13, M18, M19).
 *
 * On la JOUE (tests/crochets.mjs) telle que la coquille d'App.jsx la monte : la VUE de sa carte (`useVueLecteur`), ses briques, sur
 * les lecteurs de la démo (`maisonMediasDemo`, § 8) appariés par `resolveMedia` — la paire jumelle de l'Echo Dot, l'Apple TV et sa
 * télécommande, l'Echo de la cuisine sans officielle, l'Echo Show en pause sur une radio, l'Echo Dot du bureau indisponible. Sous
 * `?fiche_media`, App.jsx exporte la vue et les briques — le fichier n'est pas touché. Un panneau est un composant : le harnais ne
 * rend pas les enfants, on les monte à leur tour (`sous`), avec les props que la fiche leur passe. Ce qui est garanti :
 *  - § 6.5 : l'en-tête commun — la plaque (la pochette en lecture), le nom, « {pièce} · {genre} », la bascule si elle sert (M10) ;
 *  - § 6.6 : ce qui joue, la progression (1:31 / 4:16) qui se glisse et se tient au clavier, les cinq commandes par leurs bits (M11),
 *    explicites (M13) ; « En direct » et « En pause » sur une radio ; « Rien en lecture » et la phrase qui dit quoi faire ; « Éteinte »
 *    et la puce « Allumer » ; le volume : le muet, la barre de la maison (piste 32), « 30 % » ;
 *  - § 6.7 : « Dire à Alexa » — le champ, Entrée envoie la phrase à la jumelle (`play_media`, `custom`), une seule en vol, l'étoile
 *    garde et la phrase devient une puce (M19) ; « Annonce » (M9, tâche 7) — « Toute la maison » par la `notify` du groupe, les Echo
 *    choisies par leur `notify` « Annoncer » ou `notify.alexa_media`, les quatre annonces prêtes, les cartes visées qui l'écrivent ;
 *  - § 6.8 : Applications / Télécommande — des puces de 56 px, le logo connu seulement (M18), « Toutes les applis · 19 », lancer une
 *    appli (`select_source`) ; le pavé, Veille selon l'état connu ;
 *  - § 6.9, § 6.10 : la bibliothèque et « Parcourir la bibliothèque » (le navigateur), « L'appareil » ;
 *  - M7 : indisponible — le liseré sur le panneau de ce qui joue, le mot et la phrase, plus aucune commande ;
 *  - la coquille : la vue, le glyphe, l'épingle, la fiche universelle et les briques ; le contenu n'importe jamais App.jsx. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fiche_media')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fiche_media'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueLecteur, BRIQUES_MEDIA };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?fiche_media', import.meta.url).href);
const C = (await import(new URL('../src/fichemedia.jsx', import.meta.url).href)).default;
const E = await import('../src/lecteuretat.js');
const { maisonMediasDemo } = await import('../src/demo.js');
const { buildIndex, capabilities } = await import('../src/discovery.js');
const { resolveMedia } = await import('../src/resolve.js');
const { marqueDe } = await import('../src/marques.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = MONOLITHE;
const MEDIA = lire('src/fichemedia.jsx');

const NBSP = String.fromCharCode(160);
const QUAND = new Date(2026, 9, 17, 20, 40, 0, 0).getTime();
const ATV = 'media_player.apple_tv_chambre', OFF = 'media_player.chambre_echo_dot', HACS = 'media_player.echo_dot_chambre', CUISINE = 'media_player.echo_cuisine', SHOW = 'media_player.echo_show', BUREAU = 'media_player.bureau_echo_dot', PARTOUT = 'media_player.partout';

/* La maison de la démo, appariée comme l'écran l'apparie (le contrat de tests/demo_medias) : un `hass` dont chaque lecture est un
 * objet neuf, les services appelés notés. */
function poser(retouche = null, retoucheListe = null) {
  const m = maisonMediasDemo({ quand: QUAND });
  const courants = m.states;
  if (retouche) retouche(courants);
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area, entry_type: d.entry_type })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: courants });
  const media = resolveMedia({ index: ix, caps: capabilities({ states: courants, index: ix }), states: courants });
  // Une liste retouchée (un second groupe…) : ce que l'appariement aurait rendu dans une autre maison.
  if (retoucheListe) media.list = retoucheListe(media.list);
  setLoggiaState({ index: ix, ent: {}, cfg: {}, resolved: { media } });
  E.reglerLecteurs();
  const appels = [], bruts = [];
  const hass = () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    callService: (d, s, data, cible) => { bruts.push({ d, s, data }); appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), ...Object.entries(data || {}).filter(([k]) => k !== 'entity_id').map(([k, v]) => k + '=' + v)].join(' ')); return Promise.resolve(); } });
  return { appels, bruts, courants, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  // Les favoris et les applis récentes lisent `localStorage` tout nu : un magasin vide, à nous, le temps du test.
  const memoire = new Map();
  const avant = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } } });
  /* Le test vit à `QUAND` (passe bis 2 du 17/10, point 6) : la maison de la démo est posée à 20:40 le 17/10, et la vue lit `Date.now()` — pour
   * « Indisponible depuis 14:05 » (« hier » le lendemain), pour le temps d'écran qui descend depuis la réception de l'état (`budgetEcran`). Sans
   * ce gel, le fichier échouait dès 20:41 le 17/10 et dès minuit pour le reste. Aucun test d'ici ne compte sur une horloge qui avance : les
   * minuteurs sont ceux de `horlogeFausse`. */
  const maintenant = Date.now;
  Date.now = () => QUAND;
  try { return await fn({ h, d }); } finally {
    Date.now = maintenant;
    h.restaurer(); d.restaurer();
    if (avant) Object.defineProperty(globalThis, 'localStorage', avant); else delete globalThis.localStorage;
  }
}
// La fiche telle que la coquille la monte : la vue de la carte et les briques d'App.jsx ; `maintenant` fige la progression.
const Fiche = ({ hass, id, onFiche = () => {}, maintenant = QUAND }) => C({ id, vue: F.useVueLecteur(hass, id), briques: F.BRIQUES_MEDIA, onFiche, glyphe: null, epingle: null, maintenant });
const fiche = (w, id, props = {}) => monter(Fiche, { hass: w.hass(), id, ...props });
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
// Un panneau de la fiche, monté avec les props qu'elle lui passe (le harnais ne rend pas les composants enfants).
const sous = (m, nom) => { const el = de(m, nom)[0]; assert.ok(el, nom + ' : le panneau manque'); return monter(el.type, el.props); };
const bouton = (m, nom) => m.trouver(e => e.type === 'button' && (e.props['aria-label'] === nom || e.props.title === nom || texteDe(e) === nom))[0];
const boutons = (m) => m.trouver(e => e.type === 'button');
const curseur = (m, nom) => m.trouver(e => e.props && e.props.role === 'slider' && e.props['aria-label'] === nom)[0];
const classe = (m, c) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf(c) >= 0)[0];
const champ = (m) => m.trouver(e => e.type === 'input')[0];
const touche = (el, key) => el.props.onKeyDown({ key, preventDefault() {}, stopPropagation() {} });
// La bascule de l'en-tête : dans le fragment `epingle` que la fiche passe à EnteteFiche.
const basculeDe = (m) => [].concat(de(m, 'EnteteFiche')[0].props.epingle.props.children).find(x => x && x.type && x.type.name === 'RmBascule');
const rangeeAppareil = (m) => m.trouver(e => e.type === 'button' && texteDe(e).startsWith('L’appareil'))[0];

test('§ 6.5 : l’en-tête commun — la pochette dans la plaque, le nom, « Chambre · Echo Dot (3e génération) » ; une Echo n’a pas de bascule (M10), une TV en a une', () => dans(() => {
  const w = poser();
  const m = fiche(w, OFF);
  const [entete] = de(m, 'EnteteFiche');
  assert.equal(entete.props.nom, 'Echo Dot - Chambre');
  assert.equal(entete.props.sousNom, 'Chambre · Echo Dot (3e génération)', 'la pièce, puis le modèle de l’appareil');
  assert.equal(entete.props.plaque.fond, 'rgba(var(--o-rose-rgb),.16)', 'teintée comme la carte : le rose de la maison hors navigateur (la pochette ne se lit pas ici)');
  assert.ok(entete.props.plaque.glyphe && entete.props.plaque.glyphe.type === 'img' && entete.props.plaque.glyphe.props.src.startsWith('data:image/svg+xml,'), 'la pochette dans la plaque');
  assert.equal(basculeDe(m), undefined, 'une Echo ne s’éteint pas : pas de bascule');
  const tv = fiche(w, ATV);
  const bascule = basculeDe(tv);
  assert.deepEqual([bascule.props.on, bascule.props.nom], [false, 'Apple TV Chambre'], 'la TV a les deux bits : la bascule, dans l’en-tête');
  bascule.props.onToggle();
  assert.deepEqual(w.appels, ['media_player.turn_on ' + ATV], 'éteinte, la bascule allume — jamais `toggle`');
  assert.equal(de(tv, 'EnteteFiche')[0].props.sousNom, 'Chambre · Apple TV 4K');
  assert.deepEqual([de(tv, 'EnteteFiche')[0].props.plaque.fond, de(tv, 'EnteteFiche')[0].props.plaque.encre], ['var(--o-s1)', 'var(--o-text3)'], 'éteinte : la plaque grise');
}));

test('§ 6.6 : en lecture — le titre, l’artiste, « En lecture · Amazon Music », la progression 1:31 / 4:16 qui se glisse et s’entend en temps, les cinq commandes explicites sur la jumelle', () => dans(() => {
  const w = poser();
  const m = fiche(w, OFF);
  assert.equal(classe(m, 'o-panne'), undefined, 'vivante');
  const joue = sous(m, 'CeQuiJoue');
  const t = joue.texte();
  assert.ok(t.includes('Bin K’uchul Xibalba') && t.includes('Metal_Chaos') && t.includes('En lecture · Amazon Music'), 'ce qui joue, et la source (M10)');
  assert.ok(!t.includes('En direct'), 'un morceau qui a une durée n’est pas un direct');
  const prog = sous(joue, 'Progression');
  assert.ok(prog.texte().includes('1:31') && prog.texte().includes('4:16'), 'les deux temps');
  const barre = curseur(prog, 'Position dans le morceau');
  assert.deepEqual([barre.props['aria-valuetext'], Math.round(barre.props['aria-valuenow']), barre.props.style.touchAction], ['1:31', 36, 'pan-y'], 'la valeur lue en temps ; un doigt qui défile ne cherche pas');
  touche(barre, 'End');
  assert.deepEqual(w.appels, ['media_player.media_seek ' + HACS + ' seek_position=256'], 'Fin : la fin du morceau, sur la jumelle qui commande (M14)');
  prog.rendre();
  assert.equal(curseur(prog, 'Position dans le morceau').props['aria-valuetext'], '4:16', 'le geste se voit tout de suite');
  const cmd = sous(joue, 'Commandes');
  for (const nom of ['Aléatoire', 'Piste précédente', 'Pause', 'Piste suivante', 'Répéter']) assert.ok(bouton(cmd, nom), nom + ' : le bit est là, la commande aussi (M11)');
  assert.deepEqual([bouton(cmd, 'Pause').props.style.width, bouton(cmd, 'Piste suivante').props.style.width, bouton(cmd, 'Répéter').props.style.width], [68, 52, 44], 'les tailles de sa maquette');
  assert.deepEqual([bouton(cmd, 'Pause').props.style.background, bouton(cmd, 'Aléatoire').props['aria-pressed']], ['var(--o-accent-fond)', false], 'la lecture en accent ; aléatoire au repos');
  w.appels.length = 0;
  cmd.appuyer(bouton(cmd, 'Pause'));
  cmd.appuyer(bouton(cmd, 'Piste suivante'));
  cmd.appuyer(bouton(cmd, 'Aléatoire'));
  cmd.appuyer(bouton(cmd, 'Répéter'));
  assert.deepEqual(w.appels, ['media_player.media_pause ' + HACS, 'media_player.media_next_track ' + HACS, 'media_player.shuffle_set ' + HACS + ' shuffle=true', 'media_player.repeat_set ' + HACS + ' repeat=all'],
    'M13 : `media_pause` quand le lecteur joue ; chaque service explicite, sur la jumelle');
  // Le geste d'abord : la fiche redit « En pause » et propose « Lire ».
  m.rendre();
  const apres = sous(m, 'CeQuiJoue');
  assert.ok(apres.texte().includes('En pause') && bouton(sous(apres, 'Commandes'), 'Lire'));
}));

test('§ 6.6 : le volume — la puce du muet, la barre de la maison (piste 32, zone 44), « 30 % » ; glisser règle, le muet coupe', () => dans(() => {
  const w = poser();
  const m = fiche(w, OFF);
  const [jauge] = de(m, 'RmJauge');
  assert.deepEqual([jauge.props.v, jauge.props.piste, jauge.props.zone, jauge.props.marge, jauge.props.label, jauge.props.couleur, jauge.props.grade, jauge.props.eteinte],
    [30, 32, 44, 0, 'Volume Echo Dot - Chambre', 'var(--o-accent)', F.BRIQUES_MEDIA.gradeVolume, false]);
  assert.ok(m.texte().includes('30' + NBSP + '%'), '« 30 % », insécable');
  jauge.props.onCommit(60);
  const muet = bouton(m, 'Couper le son');
  assert.equal(muet.props['aria-pressed'], false);
  m.appuyer(muet);
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.6', 'media_player.volume_mute ' + HACS + ' is_volume_muted=true'], 'sur l’entité qui a le bit');
}));

test('§ 6.6 : en pause sur une radio — « En direct », « En pause », pas de progression ; « Lire » envoie `media_play`', () => dans(() => {
  const w = poser();
  const m = fiche(w, SHOW);
  const joue = sous(m, 'CeQuiJoue');
  const t = joue.texte();
  assert.ok(t.includes('France Inter') && t.includes('En direct') && t.includes('En pause'), 'un flux sans durée est un direct');
  assert.equal(de(joue, 'Progression').length, 0, 'rien à glisser sans durée');
  const cmd = sous(joue, 'Commandes');
  assert.ok(!bouton(cmd, 'Pause'));
  cmd.appuyer(bouton(cmd, 'Lire'));
  assert.deepEqual(w.appels, ['media_player.media_play ' + SHOW]);
}));

test('§ 6.6, § 6.7 : rien en lecture — le mot, la phrase qui dit quoi faire, le volume sans commandes ; « Dire à Alexa » : Entrée envoie la phrase à la jumelle, une seule en vol, l’étoile garde et la phrase devient une puce (M19)', () => dans(async () => {
  const w = poser();
  const m = fiche(w, CUISINE);
  const t = m.texte();
  assert.ok(t.includes('Rien en lecture') && t.includes('Touchez une phrase ci-dessous, ou dites-la à Alexa.'), 'le mot et la phrase d’une Echo');
  assert.deepEqual([de(m, 'CeQuiJoue').length, de(m, 'Bibliotheque').length, de(m, 'PanneauTv').length], [0, 0, 0], 'rien ne joue : ni commandes, ni progression ; une Echo ne parcourt pas, n’a pas d’applis');
  // Passe bis 2 (M11) : « Rien en lecture » n'a pas de puce de lecture dans la popup non plus — la rangée des commandes vit dans `CeQuiJoue`, absent.
  assert.equal(boutons(m).filter(b => /^(Lire|Pause)$/.test(b.props['aria-label'] || '')).length, 0, 'aucune puce lecture/pause inerte');
  assert.equal(de(m, 'RmJauge')[0].props.v, 35, 'le volume, lui, est là');
  const pe = sous(m, 'PanneauEcho');
  assert.deepEqual(de(pe, 'Segment')[0].props.options.map(o => o.label), ['Dire à Alexa', 'Annonce'], 'la jumelle HACS sait la phrase ET l’annonce : les deux');
  const da = sous(pe, 'DireAAlexa');
  assert.ok(da.texte().includes('Ce qui suit « Alexa », en un geste'));
  const saisie = champ(da);
  assert.equal(saisie.props.placeholder, 'Autre chose : mets du jazz');
  assert.equal(bouton(da, 'Envoyer à Alexa').props['aria-disabled'], true, 'rien à envoyer sans phrase');
  saisie.props.onChange({ target: { value: 'mets du jazz' } }); da.rendre();
  touche(champ(da), 'Enter'); da.rendre();
  assert.deepEqual(w.appels, ['media_player.play_media ' + CUISINE + ' media_content_id=mets du jazz media_content_type=custom'], 'la phrase telle quelle, à la jumelle HACS');
  assert.ok(da.texte().includes('Envoyé à Alexa : « mets du jazz »') && champ(da).props.value === '', 'dit, et le champ vidé');
  // Une seule en vol (M13) : tant que la première n'a pas répondu, la seconde n'envoie rien.
  champ(da).props.onChange({ target: { value: 'encore' } }); da.rendre();
  assert.equal(bouton(da, 'Envoyer à Alexa').props['aria-disabled'], true);
  touche(champ(da), 'Enter'); da.rendre();
  assert.equal(w.appels.length, 1, 'la seconde phrase attend');
  await Promise.resolve(); await Promise.resolve(); da.rendre();
  assert.equal(bouton(da, 'Envoyer à Alexa').props['aria-disabled'], undefined, 'répondu : on peut envoyer de nouveau');
  // L'étoile garde la phrase du champ : elle devient une puce, choisie le temps d'une avance quand on l'envoie.
  champ(da).props.onChange({ target: { value: 'France Inter' } }); da.rendre();
  da.appuyer(bouton(da, 'Garder'));
  const puce = bouton(da, 'France Inter');
  // 44 px au moins : la puce grandit à deux lignes pour une phrase longue (passe bis : « Musique pour dormir » finissait en « … » à 390 px).
  assert.ok(puce && puce.props['aria-pressed'] === false && puce.props.style.minHeight === 44 && puce.props.style.height === 'auto', 'la phrase gardée, une puce de 44 px au moins');
  da.appuyer(puce);
  assert.equal(w.appels[1], 'media_player.play_media ' + CUISINE + ' media_content_id=France Inter media_content_type=custom');
  assert.equal(bouton(da, 'France Inter').props['aria-pressed'], true, 'choisie : elle vient d’être envoyée');
}));

test('§ 6.6, § 6.8, § 6.9, § 6.10 : une TV éteinte — « Éteinte », « Allumer » ; Applications / Télécommande : les puces de 56 px, le logo connu seulement (M18), « Toutes les applis · 19 », lancer ; le pavé, Veille ; la bibliothèque ; L’appareil', () => dans(() => {
  const w = poser();
  const ouvertes = [];
  const m = fiche(w, ATV, { onFiche: (id) => ouvertes.push(id) });
  const t = m.texte();
  assert.ok(t.includes('Éteinte') && t.includes('Ou lancez une appli : elle allume la TV.'), 'éteinte, et ce qu’on peut faire');
  assert.ok(!t.includes('Rien en lecture') && de(m, 'RmJauge').length === 0 && de(m, 'CeQuiJoue').length === 0, 'ni faux état, ni volume éteinte');
  // Applications / Télécommande, ouvert sur les applications.
  const pt = sous(m, 'PanneauTv');
  const [seg] = de(pt, 'Segment');
  assert.deepEqual([seg.props.value, seg.props.options.map(o => o.label)], ['applis', ['Applications', 'Télécommande']]);
  const applis = boutons(pt).filter(b => b.props.style && b.props.style.height === 56);
  assert.equal(applis.length, 8, 'huit puces devant');
  assert.ok(!applis.find(b => b.props.title === 'Netflix'), 'les récentes d’abord, puis l’ordre de l’appareil : Netflix est neuvième');
  const noms = applis.map(b => b.props.title);
  assert.deepEqual(noms.map(n => !!marqueDe(n)).filter(Boolean).length > 0 && noms.map(n => !marqueDe(n)).filter(Boolean).length > 0, true, 'témoin : des marques connues et d’autres pas');
  assert.deepEqual(applis.map(b => [].concat(b.props.children).some(c => c && c.type && c.type.name === 'Ico')), noms.map(n => !!marqueDe(n)), 'le logo seulement quand la marque est connue ; le nom toujours, jamais des initiales (M18)');
  assert.ok(applis.every(b => texteDe(b) === b.props.title));
  const tout = bouton(pt, 'Toutes les applis · 19');
  assert.equal(tout.props['aria-expanded'], false);
  pt.appuyer(tout);
  assert.equal(boutons(pt).filter(b => b.props.style && b.props.style.height === 56).length, 19, 'déplié : toutes');
  w.appels.length = 0;
  pt.appuyer(boutons(pt).find(b => b.props.title === 'Netflix'));
  assert.deepEqual(w.appels, ['media_player.select_source ' + ATV + ' source=Netflix'], 'lancer une appli : `select_source`, elle allume la TV');
  assert.equal(boutons(pt).filter(b => b.props.style && b.props.style.height === 56)[0].props.title, 'Netflix', 'la lancée passe devant');
  assert.equal(boutons(pt).find(b => b.props.title === 'Netflix').props['aria-pressed'], true, 'et se souligne');
  // La télécommande : le pavé, puis Retour · Accueil · Lecture · Veille.
  seg.props.onChange('tele'); pt.rendre();
  for (const nom of ['Haut', 'Bas', 'Gauche', 'Droite', 'OK', 'Retour', 'Accueil', 'Lecture', 'Veille']) assert.ok(bouton(pt, nom), nom + ' manque au pavé');
  w.appels.length = 0;
  pt.appuyer(bouton(pt, 'OK'));
  assert.ok(w.appels[0].startsWith('remote.send_command remote.apple_tv_chambre'), 'une touche passe par la télécommande de l’appareil : ' + w.appels[0]);
  w.appels.length = 0;
  pt.appuyer(bouton(pt, 'Veille'));
  assert.deepEqual(w.appels, ['media_player.turn_on ' + ATV], 'Veille selon l’état connu : éteinte, elle allume — jamais un basculement');
  // « Allumer » : le geste d'abord — la fiche la tient pour allumée, et Veille éteint désormais.
  w.appels.length = 0;
  m.appuyer(bouton(m, 'Allumer'));
  assert.deepEqual(w.appels, ['media_player.turn_on ' + ATV]);
  m.rendre();
  assert.ok(!bouton(m, 'Allumer') && !m.texte().includes('Éteinte') && m.texte().includes('Rien en lecture'), 'allumée à l’instant : « Rien en lecture », plus de puce « Allumer »');
  const pt2 = sous(m, 'PanneauTv');
  de(pt2, 'Segment')[0].props.onChange('tele'); pt2.rendre();
  w.appels.length = 0;
  pt2.appuyer(bouton(pt2, 'Veille'));
  assert.deepEqual(w.appels, ['media_player.turn_off ' + ATV], 'allumée, Veille éteint');
  // La bibliothèque, et L'appareil.
  const bi = sous(m, 'Bibliotheque');
  assert.ok(bi.texte().includes('Bibliothèque'));
  bi.appuyer(bouton(bi, 'Parcourir la bibliothèque'));
  m.rendre();
  assert.equal(de(m, 'NavigateurMedias')[0].props.id, ATV, 'la seconde feuille, inchangée');
  m.appuyer(rangeeAppareil(m));
  assert.deepEqual(ouvertes, [ATV]);
}));

test('M7 : indisponible — le liseré sur le panneau de ce qui joue, « Indisponible » et « Indisponible depuis 14:05 », plus aucune commande ; L’appareil reste', () => dans(() => {
  const w = poser();
  const m = fiche(w, BUREAU);
  const panne = classe(m, 'o-panne');
  assert.ok(panne && panne.props['data-panneau'] === 'lecture', 'le liseré qui respire, sur le panneau');
  const t = m.texte();
  assert.ok(t.includes('Indisponible') && t.includes('Indisponible depuis 14:05'), 'le mot, et la phrase de la carte');
  assert.ok(!t.includes('Rien en lecture') && !t.includes('Éteinte'), 'rien d’inventé');
  assert.deepEqual(boutons(m).map(b => texteDe(b)), ['L’appareilL’épingle, les commandes et toutes ses entités'], 'une seule rangée, qui ne commande pas l’appareil');
  assert.deepEqual([de(m, 'RmJauge').length, basculeDe(m), de(m, 'CeQuiJoue').length, de(m, 'DireAAlexa').length, de(m, 'PanneauTv').length, de(m, 'Bibliotheque').length], [0, undefined, 0, 0, 0, 0]);
}));

test('§ 6.6 : répéter garde ses trois états — « 1 » en exposant sur « one », et la puce choisie ; aléatoire choisi quand il l’est', () => dans(() => {
  const w = poser((S) => { S[HACS].attributes.repeat = 'one'; S[HACS].attributes.shuffle = true; });
  const m = fiche(w, OFF);
  const cmd = sous(sous(m, 'CeQuiJoue'), 'Commandes');
  const repeter = bouton(cmd, 'Répéter');
  assert.equal(repeter.props['aria-pressed'], true);
  assert.ok([].concat(repeter.props.children).some(c => c && c.type === 'span' && c.props.children === '1'), '« 1 » en exposant');
  assert.equal(bouton(cmd, 'Aléatoire').props['aria-pressed'], true);
  cmd.appuyer(repeter);
  cmd.appuyer(bouton(cmd, 'Aléatoire'));
  assert.deepEqual(w.appels, ['media_player.repeat_set ' + HACS + ' repeat=off', 'media_player.shuffle_set ' + HACS + ' shuffle=false'], 'off → all → one → off ; aléatoire se défait');
}));

test('§ 6.7, M9 : l’annonce — « Sur » : toute la maison (le groupe), puis chaque Echo qui sait annoncer ; une annonce prête part en UN appel sur la `notify` du groupe, les cartes visées l’écrivent ; une seule en vol', () => dans(async () => {
  const w = poser();
  const m = fiche(w, OFF);
  const pe = sous(m, 'PanneauEcho');
  const [seg] = de(pe, 'Segment');
  assert.equal(seg.props.value, 'alexa', 'il s’ouvre sur « Dire à Alexa »');
  seg.props.onChange('annonce'); pe.rendre();
  assert.equal(de(pe, 'DireAAlexa').length, 0);
  const an = sous(pe, 'Annonce');
  const cibles = boutons(an).filter(b => b.props['aria-pressed'] !== undefined).map(b => [texteDe(b), b.props['aria-pressed']]);
  // ASSERTION MODIFIÉE (passe bis, 17/10) : chaque groupe est proposé en puce, après « Toute la maison » et avant les Echo.
  assert.deepEqual(cibles, [['Toute la maison', true], ['Partout', false], ['Echo Dot - Chambre', false], ['Echo de la cuisine', false], ['Echo Show Salon', false]],
    '« Toute la maison » d’abord, choisie ; le groupe en puce ; puis chaque Echo qui sait annoncer — pas l’Echo du bureau (officielle sans `notify`, indisponible)');
  assert.equal(F.BRIQUES_MEDIA && (await import('../src/state.js')).medPlayers().find(p => p.haid === PARTOUT).groupe, true, 'le groupe « Partout », reconnu (à son modèle « Speaker Group »)');
  assert.equal(champ(an).props.placeholder, 'Votre annonce : je rentre à la maison');
  assert.equal(bouton(an, 'Annoncer').props['aria-disabled'], true, 'rien à annoncer sans texte');
  const pretes = ['À table !', 'On part dans 5 minutes', 'Au lit, les enfants', 'Je rentre bientôt'];
  // 44 px au moins, deux lignes s'il le faut (passe bis : « On part dans 5 minutes » finissait en « … » dans 149 px à 390 px).
  for (const a of pretes) assert.ok(bouton(an, a) && bouton(an, a).props.style.minHeight === 44 && bouton(an, a).props.style.whiteSpace === 'normal', a + ' : une puce de 44 px au moins');
  an.appuyer(bouton(an, 'À table !'));
  assert.deepEqual(w.bruts, [{ d: 'notify', s: 'send_message', data: { entity_id: 'notify.partout_annoncer', message: 'À table !' } }], 'toute la maison : UN appel, la `notify` du groupe');
  assert.deepEqual([OFF, CUISINE, SHOW, PARTOUT, ATV].map(id => E.annonceDe(id)), ['À table !', 'À table !', 'À table !', 'À table !', null], 'les cartes des Echo l’écrivent — et celle du groupe ; pas la TV');
  assert.ok(an.texte().includes('Annoncé sur toute la maison : « À table ! »'));
  // Une seule en vol (M13).
  an.appuyer(bouton(an, 'Je rentre bientôt'));
  assert.equal(w.bruts.length, 1, 'la seconde attend la réponse de la première');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); an.rendre();
  assert.equal(bouton(an, 'Je rentre bientôt').props['aria-disabled'], undefined, 'répondu');
}));

test('§ 6.7, M9 : des Echo choisies — l’officielle par sa `notify` « Annoncer » (`notify.send_message`), la jumelle HACS seule par `notify.alexa_media` ; la ligne nomme les cibles', () => dans(async () => {
  const w = poser();
  const m = fiche(w, CUISINE);
  const pe = sous(m, 'PanneauEcho');
  de(pe, 'Segment')[0].props.onChange('annonce'); pe.rendre();
  const an = sous(pe, 'Annonce');
  an.appuyer(bouton(an, 'Echo de la cuisine'));
  an.appuyer(bouton(an, 'Echo Dot - Chambre'));
  assert.deepEqual(boutons(an).filter(b => b.props['aria-pressed'] !== undefined).map(b => b.props['aria-pressed']), [false, false, true, true, false], 'deux Echo choisies : ni « Toute la maison » ni le groupe ne le sont');
  champ(an).props.onChange({ target: { value: 'je rentre' } }); an.rendre();
  touche(champ(an), 'Enter'); an.rendre();
  assert.deepEqual(w.bruts, [
    { d: 'notify', s: 'send_message', data: { entity_id: 'notify.chambre_echo_dot_annoncer', message: 'je rentre' } },
    { d: 'notify', s: 'alexa_media', data: { message: 'je rentre', target: CUISINE, data: { type: 'announce' } } },
  ], 'l’officielle par sa sœur « Annoncer », la jumelle HACS par le service de HACS (§ 7.2)');
  assert.deepEqual([OFF, CUISINE, SHOW, PARTOUT].map(id => E.annonceDe(id)), ['je rentre', 'je rentre', null, null], 'les cartes visées seulement');
  assert.ok(an.texte().includes('Annoncé sur Echo Dot - Chambre, Echo de la cuisine : « je rentre »') && champ(an).props.value === '');
  // Toute la maison, de nouveau : la puce se rechoisit seule.
  an.appuyer(bouton(an, 'Toute la maison'));
  assert.deepEqual(boutons(an).filter(b => b.props['aria-pressed'] !== undefined).map(b => b.props['aria-pressed']), [true, false, false, false, false]);
  // Le groupe choisi seul : sa `notify`, et sa carte seule l'écrit — une fois la première annonce répondue (une seule en vol).
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); an.rendre();
  an.appuyer(bouton(an, 'Partout'));
  champ(an).props.onChange({ target: { value: 'à table' } }); an.rendre();
  touche(champ(an), 'Enter'); an.rendre();
  assert.deepEqual(w.bruts.at(-1), { d: 'notify', s: 'send_message', data: { entity_id: 'notify.partout_annoncer', message: 'à table' } });
  assert.ok(an.texte().includes('Annoncé sur Partout : « à table »'));
}));

test('passe bis, M9 : deux groupes — aucun n’est « toute la maison » : chaque Echo l’une après l’autre ; les deux groupes restent en puces', () => dans(async () => {
  const w = poser(null, (liste) => [...liste, { id: 'media_player.etage', haid: 'media_player.etage', name: 'Étage', area: null, ma: null, alexa: true, modele: 'Speaker Group', annonce: 'notify.etage_annoncer', annonceHacs: null, groupe: true }]);
  const m = fiche(w, OFF);
  const pe = sous(m, 'PanneauEcho');
  de(pe, 'Segment')[0].props.onChange('annonce'); pe.rendre();
  const an = sous(pe, 'Annonce');
  assert.deepEqual(boutons(an).filter(b => b.props['aria-pressed'] !== undefined).map(texteDe), ['Toute la maison', 'Partout', 'Étage', 'Echo Dot - Chambre', 'Echo de la cuisine', 'Echo Show Salon'], 'les deux groupes en puces, puis les Echo');
  an.appuyer(bouton(an, 'À table !'));
  assert.deepEqual(w.bruts, [
    { d: 'notify', s: 'send_message', data: { entity_id: 'notify.chambre_echo_dot_annoncer', message: 'À table !' } },
    { d: 'notify', s: 'alexa_media', data: { message: 'À table !', target: [CUISINE, SHOW], data: { type: 'announce' } } },
  ], 'lequel des deux serait toute la maison ? chaque Echo, un appel par service');
  assert.deepEqual([OFF, CUISINE, SHOW, PARTOUT, 'media_player.etage'].map(id => E.annonceDe(id)), ['À table !', 'À table !', 'À table !', null, null], 'les cartes des Echo l’écrivent ; pas celles des groupes, qui n’ont rien reçu');
}));

test('passe bis, M14 : une jumelle HACS indisponible ne reçoit ni phrase ni annonce — pas de « Dire à Alexa », l’annonce passe par l’officielle ; une Echo HACS seule et morte sort des cibles', () => dans(async () => {
  const w = poser((c) => { c[HACS].state = 'unavailable'; c[CUISINE].state = 'unavailable'; });
  const m = fiche(w, OFF);
  assert.ok(!m.texte().includes('Indisponible'), 'l’officielle répond : la carte vit');
  const pe = sous(m, 'PanneauEcho');
  assert.deepEqual([de(pe, 'Segment').length, de(pe, 'DireAAlexa').length, de(pe, 'Annonce').length], [0, 0, 1], 'sans jumelle vivante, pas de phrase : l’annonce seule, par la `notify` de l’officielle');
  const an = sous(pe, 'Annonce');
  assert.deepEqual(boutons(an).filter(b => b.props['aria-pressed'] !== undefined).map(texteDe), ['Toute la maison', 'Partout', 'Echo Dot - Chambre', 'Echo Show Salon'], 'l’Echo de la cuisine, HACS seule et morte, n’est plus une cible');
  an.appuyer(bouton(an, 'Toute la maison')); an.appuyer(bouton(an, 'Partout'));
  an.appuyer(bouton(an, 'Toute la maison'));
  // Toute la maison sans groupe : chaque Echo vivante — pas la cuisine.
  const sansGroupe = poser((c) => { c[HACS].state = 'unavailable'; c[CUISINE].state = 'unavailable'; }, (liste) => liste.filter(p => p.haid !== PARTOUT));
  /* ASSERTION MODIFIÉE (passe bis du 17/10, marquée à la passe bis 2 ; M9, M14) : sans groupe, « Toute la maison » n'appelle que les
   * Echo qui RÉPONDENT — la cuisine, HACS seule et morte, sort de la cible du service de HACS, là où l'écriture d'avant la comptait. */
  const an2 = sous(sous(fiche(sansGroupe, OFF), 'PanneauEcho'), 'Annonce');
  an2.appuyer(bouton(an2, 'À table !'));
  assert.deepEqual(sansGroupe.bruts, [
    { d: 'notify', s: 'send_message', data: { entity_id: 'notify.chambre_echo_dot_annoncer', message: 'À table !' } },
    { d: 'notify', s: 'alexa_media', data: { message: 'À table !', target: SHOW, data: { type: 'announce' } } },
  ], 'l’officielle par sa sœur, l’Echo Show par le service de HACS ; rien pour la cuisine, morte');
  assert.deepEqual([OFF, SHOW, CUISINE].map(id => E.annonceDe(id)), ['À table !', 'À table !', null]);
}));

test('§ 6.7 : le groupe « Partout » (officielle seule) n’a que « Annonce », sans segment ; l’Echo du bureau n’a pas de panneau', () => dans(() => {
  const w = poser();
  const partout = fiche(w, PARTOUT);
  const pe = sous(partout, 'PanneauEcho');
  assert.deepEqual([de(pe, 'Segment').length, de(pe, 'DireAAlexa').length, de(pe, 'Annonce').length], [0, 0, 1], 'sans jumelle HACS, pas de phrase : l’annonce seule, sans segment');
  assert.ok(!partout.texte().includes('Touchez une phrase'), 'la phrase du conseil ne promet pas un panneau absent');
  assert.equal(de(fiche(w, BUREAU), 'PanneauEcho').length, 0, 'indisponible, et sans `notify` : rien');
}));

test('la coquille (App.jsx) : la vue de la carte, le glyphe, l’épingle, la fiche universelle et les briques ; le contenu n’importe jamais App.jsx ni la feuille', () => {
  const i = APP.indexOf('\nfunction FicheMedia(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  /* ASSERTION MODIFIÉE (chantier Médias, tâche 6 puis passe bis du 17/10, marquée à la passe bis 2 ; M12) : la coquille passe à la fiche
   * la VUE de sa carte (`useVueLecteur`), ses briques, le glyphe et l'épingle — à la place de la lecture d'avant (`mpRead`) et du `hass`
   * nu que l'écriture d'avant épinglait. */
  assert.ok(coquille.includes('const vue = useVueLecteur(hass, id);'), 'la vue de sa carte');
  assert.ok(coquille.includes('<FicheMediaContent id={id} vue={vue} briques={BRIQUES_MEDIA} onFiche={setFiche}'), 'la vue, les briques, la fiche universelle');
  assert.ok(coquille.includes('glyphe={<GlypheCarte id={id} size={18}><Fi i={glypheLecteur(vue.l)} size={18} /></GlypheCarte>} epingle={<BoutonEpingle id={id} />}'), 'le glyphe de la carte (l’icône choisie devant) et l’épingle');
  assert.ok(coquille.includes('{fiche && <FicheAppareil id={fiche} hass={vue.hass} onClose={() => setFiche(null)} />}'), 'la fiche universelle, sur le hass vivant');
  assert.ok(APP.includes('const BRIQUES_MEDIA = { RmBascule, RmJauge, Segment, gradeVolume: GRADE_VOLUME };'), 'les briques : la bascule, la barre, le groupe segmenté, le dégradé du volume');
  /* ASSERTION MODIFIÉE (passe bis du 17/10, point 10) : fichemedia.jsx porte UNE feuille, et une seule — la coquille de la seconde feuille,
   * « Réglages parent » (`FicheEnfant`), sur le modèle de `FicheMedia` : le `BottomSheet`, le `Suspense` DEDANS avec un repli de hauteur, le
   * contenu à la demande (ficheenfant.jsx) dedans. La feuille du LECTEUR, elle, reste à la coquille d'App.jsx. */
  assert.ok(!/from '\.\/App\.jsx'/.test(MEDIA) && !/\bmpRead\b|extractNpAccent|backdropFilter|play_pause'/.test(MEDIA), 'ni App.jsx, ni le fond flouté, ni `play_pause`');
  assert.equal((MEDIA.match(/<BottomSheet/g) || []).length, 1, 'une seule feuille dans fichemedia.jsx : la coquille des réglages du mode enfant');
  const i2 = MEDIA.indexOf('\nfunction FicheEnfant({ onClose, ...props }) {');
  const coquilleEnfant = MEDIA.slice(i2, MEDIA.indexOf('\n}\n', i2));
  const f = coquilleEnfant.indexOf('<BottomSheet onClose={onClose}>'), s = coquilleEnfant.indexOf('<Suspense fallback={<div style={{ minHeight: 260 }} />}>'), c2 = coquilleEnfant.indexOf('<ContenuEnfant {...props} />');
  assert.ok(f >= 0 && s > f && c2 > s && coquilleEnfant.indexOf('</Suspense>') < coquilleEnfant.indexOf('</BottomSheet>'), 'la feuille, puis la frontière DEDANS, puis le contenu');
  assert.ok(MEDIA.includes("const ContenuEnfant = lazyRecharge(() => import('./ficheenfant.jsx'));") && !MEDIA.includes('<Suspense fallback={null}>'), 'le contenu seul est à la demande ; plus de frontière hors de la feuille');
});

/* ── Le mode enfant dans la popup (chantier Mode enfant, tâche 5 ; E18 à E20, E23 ; § 6.3 ; sa maquette, cadres 2b et 2c) ─────────
 *
 * La maison a un profil (`loggia_enfant`, la chambre) et le serveur — doublé — a dit ce qu'il fait de chaque lecteur. Ce qui est
 * garanti : le panneau « Mode enfant » entre ce qui joue et le panneau du genre — le temps d'écran en grand, « C'est fini pour
 * aujourd'hui » et la demande, « C'est l'heure de dormir » et ses puces, les rangées « Coucher » et « Annonces de la maison », la
 * rangée « Réglages parent » (« Code à 4 chiffres », « Ouvrir » pour un administrateur) ; la ligne du plafond sous la barre de
 * volume, hachurée ; le bandeau des limites levées ; un profil désactivé n'a qu'une rangée ; sans profil, la rangée « Mode enfant ·
 * Désactivé » d'un lecteur qui a une pièce ouvre la feuille (le pavé d'abord pour un compte ordinaire) ; la phrase des Restrictions
 * sous les applications ; un module qui n'a pas démarré le dit. */

const EN = await import('../src/enfantetat.js');
const ANNONCES = 'switch.chambre_echo_dot_annonces';
const CFG_ENFANT = { profils: { chambre: { nom: 'Lino', zone: 'chambre', actif: true, ajouts: [ATV], ecrans: null, volume_max: 40, coucher_max: 20, budget: { semaine: 90, weekend: 90 }, heures: { semaine: ['07:30', '20:30'], weekend: ['08:30', '21:00'] }, dormir: true, voix: true, phrases_dormir: ['joue du bruit blanc', 'joue de la musique pour dormir'] } }, simulation: { actif: false } };
const VUE_ENFANT = (sur = {}) => ({ profil: 'chambre', nom: 'Lino', actif: true, leve_jusqua: null, plafond: 40, bloque: null, reprise: '07:30', ecran: null, dormir: null, demande: null, ...sur });
const ECRAN_ENFANT = { budget_min: 90, utilise_s: 3300, bonus_min: 0, reste_s: 2100 };
const APPAREILS_ENFANT = [{ entite: OFF, ajoute: false, ecran: false, parler: 'notify.chambre_echo_dot_parler', annonces: ANNONCES, hacs: HACS }, { entite: ATV, ajoute: true, ecran: true, parler: null, annonces: null, hacs: null }];
const ETAT_ENFANT = (lecteurs, profil = {}, racine = {}) => ({ maintenant: QUAND / 1000, demarre: true, simulation: false, recu: QUAND,
  profils: { chambre: { nom: 'Lino', zone: 'chambre', actif: true, leve_jusqua: null, demande: null, voix: true, dormir: true, appareils: APPAREILS_ENFANT, ...profil } }, lecteurs, ...racine });
/* La maison avec un profil : la configuration commune porte le profil de la chambre, la sœur « Annonces » de l'Echo est allumée, et
 * le serveur doublé répond aux commandes du mode enfant par l'état qu'on lui donne (`reponses`). */
function poserEnfant(etat, { retouche = null, cfg = CFG_ENFANT, admin = true, reponses = null } = {}) {
  const w = poser((c) => { c[ANNONCES] = { state: 'on', attributes: { friendly_name: 'Echo Dot - Chambre Annonces' }, last_changed: new Date(QUAND).toISOString(), last_updated: new Date(QUAND).toISOString() }; if (retouche) retouche(c); });
  setLoggiaState({ cfg: { loggia_enfant: cfg } });
  EN.reglerEnfantEtat({ hass: { callWS: () => new Promise(() => {}) } });
  if (etat) EN.poserEtatEnfant(etat);
  const ws = [];
  const hass = () => ({ ...w.hass(), user: { id: 'u', name: 'Papa', is_admin: admin }, callWS: (msg) => { ws.push(msg); const r = reponses && reponses[msg.type]; return r ? Promise.resolve(typeof r === 'function' ? r(msg) : r) : Promise.resolve(etat); } });
  return { ...w, hass, ws };
}
const ficheEnfant = (w, id, props = {}) => monter(Fiche, { hass: w.hass(), id, ...props });
const finEnfant = () => { EN.reglerEnfantEtat({}); setLoggiaState({ cfg: {} }); };
const attendre = () => new Promise(r => setImmediate(r));

test('§ 6.3 : une Echo sous profil, dans les heures — le panneau « Mode enfant » après ce qui joue : « Coucher · À 21:00 », « Annonces de la maison · Reçues », la rangée « Réglages parent » (« Ouvrir » pour un administrateur, « Code à 4 chiffres » sinon) ; la barre hachurée et « Le volume s’arrête à 40 % »', () => dans(() => {
  const w = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }));
  const m = ficheEnfant(w, OFF);
  const p = sous(m, 'PanneauEnfant');
  const t = p.texte();
  // Le 17 octobre 2026 est un samedi : les heures du week-end finissent à 21:00.
  assert.ok(t.includes('Coucher') && t.includes('À 21:00'), 'la rangée du coucher : ' + t);
  assert.ok(t.includes('Annonces de la maison') && t.includes('Reçues'), 'la sœur « Annonces », allumée');
  assert.ok(t.includes('Réglages parent') && t.includes('Ouvrir') && !t.includes('Code à 4 chiffres'), 'un administrateur ouvre sans code');
  assert.ok(!t.includes('Mode enfant désactivé') && !t.includes('Limites levées'), 'pas de bandeau quand le profil agit : jamais « Tout va bien »');
  const [jauge] = de(m, 'RmJauge');
  assert.equal(jauge.props.plafond, 40, 'la barre de la popup porte le plafond (hachurée, aria-valuemax)');
  assert.ok(m.texte().includes('Le volume s’arrête à 40' + NBSP + '%'), 'la ligne du plafond sous la barre : ' + m.texte());
  // Un compte ordinaire : le code d'abord.
  const o = ficheEnfant(poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }), { admin: false }), OFF);
  assert.ok(sous(o, 'PanneauEnfant').texte().includes('Code à 4 chiffres'));
  // La sœur coupée : « Coupées » ; sans sœur : pas de rangée.
  const c = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }), { retouche: (s) => { s[ANNONCES].state = 'off'; } });
  assert.ok(sous(ficheEnfant(c, OFF), 'PanneauEnfant').texte().includes('Coupées'));
  const sans = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }, { appareils: [{ ...APPAREILS_ENFANT[0], annonces: null }] }));
  assert.ok(!sous(ficheEnfant(sans, OFF), 'PanneauEnfant').texte().includes('Annonces de la maison'));
  finEnfant();
}));

test('§ 6.3, E13 : un écran dont le temps est écoulé — « C’est fini pour aujourd’hui », la phrase, « Demander 15 min de plus » → `enfant/demander` ; la demande envoyée, puis refusée ; en lecture avec du budget, le temps en grand', () => dans(async () => {
  const demande = { appareil: ATV, quand: QUAND / 1000, reponse: null };
  const w = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ bloque: 'temps', ecran: { ...ECRAN_ENFANT, utilise_s: 5400, reste_s: 0 } }) }),
    { reponses: { 'loggia/enfant/demander': ETAT_ENFANT({ [ATV]: VUE_ENFANT({ bloque: 'temps', ecran: { ...ECRAN_ENFANT, utilise_s: 5400, reste_s: 0 }, demande }) }, { demande }) } });
  const m = ficheEnfant(w, ATV);
  const p = sous(m, 'PanneauEnfant');
  const t = p.texte();
  assert.ok(t.includes('C’est fini pour aujourd’hui') && t.includes('Les 1 h 30 d’écran du jour sont utilisées. Apple TV Chambre revient demain à 07:30.'), t);
  const demander = bouton(p, 'Demander 15 min de plus');
  assert.ok(demander, 'la puce de la demande');
  p.appuyer(demander);
  await attendre();
  assert.deepEqual(w.ws, [{ type: 'loggia/enfant/demander', profil: 'chambre' }]);
  m.rendre();
  const p2 = sous(m, 'PanneauEnfant');
  assert.ok(p2.texte().includes('Demande envoyée · en attente de réponse') && !bouton(p2, 'Demander 15 min de plus'), 'l’état rendu est posé : la demande attend');
  // Refusée : demain.
  const r = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ bloque: 'temps', ecran: { ...ECRAN_ENFANT, utilise_s: 5400, reste_s: 0 }, demande: { ...demande, reponse: 'refusee' } }) }));
  assert.ok(sous(ficheEnfant(r, ATV), 'PanneauEnfant').texte().includes('Demande refusée · demain dès 07:30'));
  // En lecture, avec du budget : « 1 h 25 », « restantes, dont 15 min accordées par vous », « 55 min utilisées · sur 1 h 45 ».
  const b = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ ecran: { ...ECRAN_ENFANT, bonus_min: 15, reste_s: 5100 } }) }),
    { retouche: (c) => { c[ATV] = { ...c[ATV], state: 'playing', attributes: { ...c[ATV].attributes, app_name: 'Disney+', media_title: 'Bluey', volume_level: .3 } }; } });
  /* ASSERTION RENDUE INDÉPENDANTE DE L'HORLOGE (passe bis 2 du 17/10, point 6) : l'écran est allumé, et `budgetEcran` retranche le temps RÉEL écoulé
   * depuis la réception de l'état (`recu: QUAND`, le samedi 17/10 à 20:40) — le test échouait dès 20:41, et échouerait tous les jours suivants. La
   * vue lit `Date.now()` à son rendu : `dans` le fige à `QUAND` ; le temps écoulé vaut zéro, à toute heure de toute date. */
  const pb = sous(ficheEnfant(b, ATV), 'PanneauEnfant');
  const tb = pb.texte();
  assert.ok(tb.includes('1 h 25') && tb.includes('restantes, dont 15 min accordées par vous') && tb.includes('55 min utilisées') && tb.includes('sur 1 h 45'), tb);
  assert.ok(!tb.includes('Demander 15 min de plus'), 'du budget : rien à demander');
  const s = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ ecran: ECRAN_ENFANT }) }));
  assert.ok(sous(ficheEnfant(s, ATV), 'PanneauEnfant').texte().includes('restantes aujourd’hui'));
  finEnfant();
}));

test('§ 6.3, E10 : une Echo au coucher — « C’est l’heure de dormir », la phrase, « Bruit blanc » et « Musique pour dormir » → `enfant/dormir` ; sons coupés : la phrase de l’Echo, ni puces ni volume ; la ligne du plafond dit « au coucher »', () => dans(async () => {
  const coucher = { [OFF]: VUE_ENFANT({ bloque: 'coucher', plafond: 20 }), [HACS]: VUE_ENFANT({ bloque: 'coucher', plafond: 20 }) };
  const idle = (c) => { c[OFF].state = 'idle'; c[HACS].state = 'idle'; };
  const w = poserEnfant(ETAT_ENFANT(coucher), { retouche: idle });
  const m = ficheEnfant(w, OFF);
  const p = sous(m, 'PanneauEnfant');
  const t = p.texte();
  assert.ok(t.includes('C’est l’heure de dormir') && t.includes('Les sons pour dormir restent, à 20' + NBSP + '% max. Le reste revient à 07:30.'), t);
  const bruit = bouton(p, 'Bruit blanc'), musique = bouton(p, 'Musique pour dormir');
  assert.ok(bruit && musique, 'les deux puces de la maquette');
  p.appuyer(bruit);
  await attendre();
  // Une seule commande en vol : la seconde part quand la première a répondu.
  p.appuyer(musique);
  await attendre();
  assert.deepEqual(w.ws, [{ type: 'loggia/enfant/dormir', profil: 'chambre', son: 0 }, { type: 'loggia/enfant/dormir', profil: 'chambre', son: 1 }]);
  assert.ok(m.texte().includes('Le volume s’arrête à 20' + NBSP + '% au coucher'), m.texte());
  assert.equal(de(m, 'RmJauge')[0].props.plafond, 20);
  // Sons coupés : la phrase de l'Echo, pas de puces — et le volume part de la popup (la maquette).
  const c = poserEnfant(ETAT_ENFANT(coucher, { dormir: false }), { retouche: idle });
  const mc = ficheEnfant(c, OFF);
  const pc = sous(mc, 'PanneauEnfant');
  assert.ok(pc.texte().includes('L’Echo revient demain à 07:30. Les annonces de la maison passent toujours.') && !bouton(pc, 'Bruit blanc'));
  assert.equal(de(mc, 'RmJauge').length, 0, 'le volume part de la popup quand les sons sont coupés');
  // Sans jumelle HACS qui réponde : pas de puces (M11), la phrase reste.
  const sj = poserEnfant(ETAT_ENFANT(coucher, { appareils: [{ ...APPAREILS_ENFANT[0], hacs: null }] }), { retouche: idle });
  assert.ok(!bouton(sous(ficheEnfant(sj, OFF), 'PanneauEnfant'), 'Bruit blanc'));
  finEnfant();
}));

/* TEST AJOUTÉ (passe bis du 17/10, points 2, 9 et 13) : la popup d'un écran bloqué et éteint fait comme la carte étroite (E16) — ni « Allumer »
 * ni « lancez une appli », la puce inerte « Revient à 07:30 » et la ligne qui dit pourquoi ; ses applications ne se lancent pas (la maison
 * déferait l'allumage) ; la seconde ligne de l'en-tête dit « Mode enfant · profil de Lino » (la maquette, 2b et 2c) ou « Limites levées
 * jusqu'à 21:10 » ; la barre dit le plafond au lecteur d'écran ; sous les puces des sons pour dormir, la limite honnête (§ 9, ADR 0212). */
test('passe bis, points 2, 9, 13 : bloqué et éteint — « Revient à 07:30 », pourquoi, ni « Allumer » ni appli ; l’en-tête dit le profil ; la barre dit le plafond ; la limite sous les puces', () => dans(() => {
  const w = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ bloque: 'temps', ecran: { ...ECRAN_ENFANT, utilise_s: 5400, reste_s: 0 } }) }));
  const m = ficheEnfant(w, ATV);
  assert.equal(bouton(m, 'Allumer'), undefined, 'pas d’« Allumer » : la maison le déferait vingt secondes plus tard');
  assert.ok(!m.texte().includes('Ou lancez une appli'), 'ni « lancez une appli »');
  const revient = m.trouver(e => e.props && e.props['data-revient'] === '')[0];
  assert.ok(revient && revient.type === 'span' && texteDe(revient).includes('Revient à 07:30'), 'la puce inerte de la carte, non cliquable');
  assert.ok(m.texte().includes('Rallumé, l’écran s’éteindrait 20 secondes plus tard : le mode enfant le tient jusqu’à 07:30.'), 'la ligne qui dit pourquoi');
  assert.deepEqual(w.appels, [], 'rien n’est parti');
  // Les applications : aucune puce, la ligne qui dit quand elles reviennent, et où elles se verrouillent vraiment (§ 4).
  const pt = sous(m, 'PanneauTv');
  assert.equal(pt.trouver(e => e.type === 'button').length, 0, 'aucun bouton tendu que la maison déferait');
  assert.ok(pt.texte().includes('Les applications reviennent à 07:30 : le mode enfant tient l’écran.') && pt.texte().includes('Restrictions'), pt.texte());
  // L'en-tête (point 13) : « Mode enfant · profil de Lino » à la place de « Chambre · Apple TV 4K » ; levées, l'heure ; hors profil, la ligne d'avant.
  assert.equal(de(m, 'EnteteFiche')[0].props.sousNom, 'Mode enfant · profil de Lino');
  const leve = QUAND / 1000 + 1800;
  const ml = ficheEnfant(poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT({ leve_jusqua: leve, plafond: null }), [HACS]: VUE_ENFANT({ leve_jusqua: leve, plafond: null }) }, { leve_jusqua: leve })), OFF);
  assert.equal(de(ml, 'EnteteFiche')[0].props.sousNom, 'Limites levées jusqu’à 21:10');
  assert.equal(de(ml, 'RmJauge')[0].props.etat, null, 'levées : rien à dire de plus au lecteur d’écran');
  assert.equal(de(fiche(poser(), OFF), 'EnteteFiche')[0].props.sousNom, 'Chambre · Echo Dot (3e génération)');
  // La barre dit le plafond (point 9) : « max 40 % » ; coupé, « Muet · max 40 % ».
  const me = ficheEnfant(poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() })), OFF);
  assert.equal(de(me, 'RmJauge')[0].props.etat, 'max 40' + NBSP + '%');
  const mu = ficheEnfant(poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }), { retouche: (c) => { c[HACS].attributes.is_volume_muted = true; } }), OFF);
  assert.equal(de(mu, 'RmJauge')[0].props.etat, 'Muet · max 40' + NBSP + '%');
  // Sous les puces des sons pour dormir (point 2, § 9) : la limite honnête, avec les mots de la conception ; sans puces, pas de ligne.
  const idle = (c) => { c[OFF].state = 'idle'; c[HACS].state = 'idle'; };
  const coucher = { [OFF]: VUE_ENFANT({ bloque: 'coucher', plafond: 20 }), [HACS]: VUE_ENFANT({ bloque: 'coucher', plafond: 20 }) };
  const pc = sous(ficheEnfant(poserEnfant(ETAT_ENFANT(coucher), { retouche: idle }), OFF), 'PanneauEnfant');
  const limite = pc.trouver(e => e.props && e.props['data-limite-dormir'] === '')[0];
  assert.ok(limite && bouton(pc, 'Bruit blanc'), 'la ligne, avec les puces');
  assert.equal(texteDe(limite), 'Un son lancé à la voix est mis en pause 20 secondes après : la maison ne distingue pas une berceuse d’autre chose. Les sons pour dormir passent par ces puces, ou le parent lève les limites.');
  assert.ok(pc.texte().indexOf('Musique pour dormir') < pc.texte().indexOf('Un son lancé à la voix'), 'sous les puces, pas au-dessus');
  const sj = poserEnfant(ETAT_ENFANT(coucher, { appareils: [{ ...APPAREILS_ENFANT[0], hacs: null }] }), { retouche: idle });
  assert.ok(!sous(ficheEnfant(sj, OFF), 'PanneauEnfant').texte().includes('Un son lancé à la voix'));
  finEnfant();
}));

test('E14, E20 : levées — le bandeau et « Limites levées : volume libre » ; désactivé — pas de panneau, la rangée « Mode enfant · Désactivé », « volume libre » ; sans profil, la rangée d’un lecteur qui a une pièce ouvre la feuille (le pavé d’abord pour un compte ordinaire) ; sans pièce, rien', () => dans(() => {
  const leve = QUAND / 1000 + 1800;
  const w = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT({ leve_jusqua: leve, plafond: null }), [HACS]: VUE_ENFANT({ leve_jusqua: leve, plafond: null }) }, { leve_jusqua: leve }));
  const m = ficheEnfant(w, OFF);
  const t = sous(m, 'PanneauEnfant').texte();
  assert.ok(t.includes('Limites levées jusqu’à 21:10'), 'le bandeau : ' + t);
  assert.ok(m.texte().includes('Limites levées : volume libre'));
  assert.equal(de(m, 'RmJauge')[0].props.plafond, null, 'aucune borne');
  // Désactivé.
  const d = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT({ actif: false, plafond: null }), [HACS]: VUE_ENFANT({ actif: false, plafond: null }) }, { actif: false }),
    { cfg: { ...CFG_ENFANT, profils: { chambre: { ...CFG_ENFANT.profils.chambre, actif: false } } } });
  const md = ficheEnfant(d, OFF);
  assert.equal(de(md, 'PanneauEnfant').length, 0, 'un profil désactivé n’a pas de panneau (§ 6.3)');
  const rangee = md.trouver(e => e.type === 'button' && texteDe(e).startsWith('Mode enfant'))[0];
  assert.ok(rangee && texteDe(rangee).includes('Désactivé'), 'la rangée « Mode enfant · Désactivé »');
  assert.ok(md.texte().includes('Mode enfant désactivé : volume libre'));
  // Sans profil dans la maison : la rangée d'un lecteur qui a une pièce ; un administrateur ouvre la feuille sur un profil neuf, du nom de la pièce.
  const n = poserEnfant(null, { cfg: { profils: {}, simulation: { actif: false } } });
  const mn = ficheEnfant(n, OFF);
  const rn = mn.trouver(e => e.type === 'button' && texteDe(e).startsWith('Mode enfant'))[0];
  assert.ok(rn && texteDe(rn).includes('Désactivé'));
  mn.appuyer(rn);
  const feuille = mn.trouver(e => e.props && e.props.ident && e.props.lecteurs)[0];
  assert.ok(feuille, 'la feuille des réglages, chargée à la demande');
  assert.deepEqual([feuille.props.ident, feuille.props.nom, feuille.props.zone, feuille.props.admin], ['chambre', 'Chambre', 'chambre', true], 'un profil neuf : la zone de la pièce, son nom');
  assert.equal(de(mn, 'PinModal').length, 0, 'un administrateur n’a rien à prouver');
  // Un compte ordinaire : le pavé, avec son pourquoi ; le code accepté ouvre la feuille.
  const o = poserEnfant(null, { cfg: { profils: {}, simulation: { actif: false } }, admin: false });
  const mo = ficheEnfant(o, OFF);
  mo.appuyer(mo.trouver(e => e.type === 'button' && texteDe(e).startsWith('Mode enfant'))[0]);
  const [pave] = de(mo, 'PinModal');
  assert.ok(pave && pave.props.sousTitre === 'Requis pour les réglages du mode enfant', 'le pavé dit pourquoi');
  assert.equal(mo.trouver(e => e.props && e.props.ident && e.props.lecteurs).length, 0, 'pas de feuille avant le code');
  pave.props.onSuccess(); mo.rendre();
  assert.equal(de(mo, 'PinModal').length, 0);
  assert.ok(mo.trouver(e => e.props && e.props.ident && e.props.lecteurs)[0], 'le code accepté : la feuille');
  // « Partout » n'a pas de pièce : ni rangée, ni panneau.
  const mp = ficheEnfant(n, PARTOUT);
  assert.equal(mp.trouver(e => e.type === 'button' && texteDe(e).startsWith('Mode enfant')).length, 0);
  finEnfant();
}));

test('§ 4, § 8 : sous un profil, les applications disent où elles se verrouillent ; un module qui n’a pas démarré le dit dans le panneau', () => dans(() => {
  const w = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ ecran: ECRAN_ENFANT }) }));
  const pt = sous(ficheEnfant(w, ATV), 'PanneauTv');
  assert.ok(pt.texte().includes('Les applications se verrouillent dans les Réglages de l’Apple TV (Restrictions), pas ici.'), pt.texte());
  const sans = poserEnfant(null, { cfg: { profils: {}, simulation: { actif: false } } });
  assert.ok(!sous(ficheEnfant(sans, ATV), 'PanneauTv').texte().includes('Restrictions'), 'sans profil, rien');
  const d = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }, {}, { demarre: false }));
  assert.ok(sous(ficheEnfant(d, OFF), 'PanneauEnfant').texte().includes('Le mode enfant n’a pas démarré'));
  finEnfant();
}));

/* ── La passe bis 2 du 17/10 (chantier Mode enfant) : le pourcentage suit le doigt, l'écran bloqué n'a plus de bascule ──────────── */

/* TEST AJOUTÉ (passe bis 2 du 17/10, point 1 ; sa capture : « Volume 50 % » figé tant que la barre est tenue). Le pourcentage de la popup
 * (à droite de la barre) suit le doigt comme le mot de la carte : la vue du lecteur garde la valeur sous le doigt (`RmJauge`, `onGlisse`).
 * L'ordre ne part qu'au relâcher, une seule fois ; et rendre le son, ou le couper, se voit tout de suite. */
test('passe bis 2, point 1 : le pourcentage de la popup suit le doigt — « 50 % » pendant le glisser, un seul `volume_set` au relâcher, le plafond jamais dépassé ; le muet se voit tout de suite', () => dans(() => {
  const w = poser();
  const m = fiche(w, OFF);
  const pourcent = (x) => texteDe(x.trouver(e => e.type === 'span' && e.props.style && e.props.style.width === 48)[0]);
  const sousLeDoigt = (jauge, clientX) => {
    // Le harnais ne rend pas les enfants : la VRAIE barre se monte avec les props que la fiche lui passe.
    const barre = monter(F.BRIQUES_MEDIA.RmJauge, jauge.props);
    const el = { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, width: 226 }), classList: { add() {}, remove() {} }, setPointerCapture() {}, onpointermove: null, onpointerup: null, onpointercancel: null };
    barre.arbre.props.onPointerDown({ stopPropagation() {}, preventDefault() {}, currentTarget: el, clientX, pointerId: 1 });
    return el;
  };
  assert.equal(pourcent(m), '30' + NBSP + '%');
  assert.equal(typeof de(m, 'RmJauge')[0].props.onGlisse, 'function', 'la barre de la popup annonce le doigt');
  const el = sousLeDoigt(de(m, 'RmJauge')[0], 100);
  m.rendre();
  assert.equal(pourcent(m), '50' + NBSP + '%', 'posé sur la barre : le pourcentage suit');
  for (const [x, attendu] of [[130, 65], [190, 95], [20, 10]]) {
    el.onpointermove({ clientX: x });
    m.rendre();
    assert.equal(pourcent(m), attendu + NBSP + '%', 'il suit le doigt, à ' + attendu);
    assert.equal(de(m, 'RmJauge')[0].props.v, attendu);
  }
  assert.deepEqual(w.appels, [], 'rien ne part pendant le glisser');
  el.onpointerup();
  m.rendre();
  assert.deepEqual(w.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.1'], 'UN seul `volume_set`, au relâcher');
  assert.equal(pourcent(m), '10' + NBSP + '%', 'le geste d’abord : il garde la valeur posée');
  // Le muet : le geste d'abord (la maison ne répond pas, la doublure garde son état).
  m.appuyer(bouton(m, 'Couper le son'));
  assert.equal(bouton(m, 'Rétablir le son').props['aria-pressed'], true, 'coupé tout de suite');
  assert.equal(pourcent(m), 'Muet');
  // Sous un plafond du mode enfant, la valeur montrée ne dépasse pas la barre.
  const e = poserEnfant(ETAT_ENFANT({ [OFF]: VUE_ENFANT(), [HACS]: VUE_ENFANT() }));
  const me = ficheEnfant(e, OFF);
  const el2 = sousLeDoigt(de(me, 'RmJauge')[0], 100);
  for (const x of [100, 190, 225]) { el2.onpointermove({ clientX: x }); me.rendre(); assert.equal(pourcent(me), '40' + NBSP + '%', 'à ' + x + ' px : le plafond, pas plus'); }
  el2.onpointerup();
  assert.deepEqual(e.appels, ['media_player.volume_set ' + HACS + ' volume_level=0.4']);
  finEnfant();
}));

/* TEST AJOUTÉ (passe bis 2 du 17/10, point 2). L'en-tête de la popup d'un écran bloqué offrait sa bascule (« un parent peut allumer, la maison
 * éteindra à nouveau ») : l'enfant allume, la maison rééteint vingt secondes plus tard. Le corps de la popup dit déjà « Revient à {h} » ;
 * l'en-tête n'offre plus rien — temps écoulé ou coucher, éteint ou allumé. Les limites levées, un profil éteint : la bascule est là. */
test('passe bis 2, point 2 : l’en-tête d’un écran bloqué n’a plus de bascule — temps écoulé ou coucher, éteint ou allumé ; dans ses heures, limites levées ou profil éteint, elle est là', () => dans(() => {
  const ecoule = { bloque: 'temps', ecran: { ...ECRAN_ENFANT, utilise_s: 5400, reste_s: 0 } };
  const allumee = (c) => { c[ATV] = { ...c[ATV], state: 'playing', attributes: { ...c[ATV].attributes, app_name: 'Disney+', media_title: 'Bluey', volume_level: .3 } }; };
  const bascule = (vue, retouche = null) => basculeDe(ficheEnfant(poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT(vue) }), { retouche }), ATV));
  assert.equal(bascule(ecoule), undefined, 'temps écoulé, éteinte');
  assert.equal(bascule(ecoule, allumee), undefined, 'temps écoulé, allumée (la grâce de vingt secondes) : pas de bascule non plus');
  assert.equal(bascule({ bloque: 'coucher', plafond: 20 }), undefined, 'au coucher, éteinte');
  assert.equal(bascule({ bloque: 'coucher', plafond: 20 }, allumee), undefined, 'au coucher, allumée');
  // Le corps dit déjà pourquoi, et ce qui revient : inerte, jamais un bouton.
  const m = ficheEnfant(poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT(ecoule) })), ATV);
  assert.ok(m.trouver(e => e.props && e.props['data-revient'] === '').length === 1 && bouton(m, 'Allumer') === undefined);
  // Dans ses heures : la bascule de l'en-tête, `turn_on` explicite.
  const w = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ ecran: ECRAN_ENFANT }) }));
  const b = basculeDe(ficheEnfant(w, ATV));
  assert.deepEqual([b.props.on, b.props.nom], [false, 'Apple TV Chambre']);
  b.props.onToggle();
  assert.deepEqual(w.appels, ['media_player.turn_on ' + ATV]);
  // Les limites levées, ou le profil éteint : la fiche est celle d'avant.
  const leve = QUAND / 1000 + 1800;
  assert.ok(bascule({ ...ecoule, leve_jusqua: leve, plafond: null }), 'limites levées');
  assert.ok(bascule({ ...ecoule, actif: false, plafond: null }), 'profil désactivé');
  finEnfant();
  assert.ok(basculeDe(fiche(poser(), ATV)), 'sans profil : la bascule d’avant');
}));

/* ── La passe bis 3 du 17/10 (chantier Mode enfant) : la bibliothèque d'un écran bloqué ─────────────────────────────────────────── */

/* TEST AJOUTÉ (passe bis 3 du 17/10, point 2). Un écran bloqué gardait « Parcourir la bibliothèque » : il mène à `play_media`
 * (navigateurmedias.jsx), qui réveille l'Apple TV — la maison la rééteint vingt secondes plus tard. Bloqué, la bibliothèque ne s'offre plus
 * (ses favoris non plus : `play_media` eux aussi), comme les applis et la télécommande ; la phrase de « Rien en lecture » ne la montre plus
 * du doigt ; un navigateur ouvert au moment du blocage se ferme, et ne se rouvre pas seul. Dans ses heures, ou les limites levées : elle est là. */
test('passe bis 3, point 2 : un écran bloqué n’offre pas « Parcourir la bibliothèque » — éteint ou allumé, temps écoulé ou coucher ; le conseil se tait ; un navigateur ouvert se ferme ; dans ses heures, elle est là', () => dans(() => {
  const ecoule = { bloque: 'temps', ecran: { ...ECRAN_ENFANT, utilise_s: 5400, reste_s: 0 } };
  // Allumée, rien en lecture : la grâce de vingt secondes, ou un écran sans interrupteur que la maison ne peut pas éteindre.
  const allumee = (c) => { c[ATV] = { ...c[ATV], state: 'idle' }; };
  const biblio = (vue, retouche = null) => de(ficheEnfant(poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT(vue) }), { retouche }), ATV), 'Bibliotheque').length;
  assert.equal(biblio(ecoule), 0, 'temps écoulé, éteinte');
  assert.equal(biblio(ecoule, allumee), 0, 'temps écoulé, allumée');
  assert.equal(biblio({ bloque: 'coucher', plafond: 20 }), 0, 'au coucher, éteinte');
  assert.equal(biblio({ bloque: 'coucher', plafond: 20 }, allumee), 0, 'au coucher, allumée');
  // Allumée et bloquée, « Rien en lecture » ne montre plus du doigt ce qui n'est pas là — ni applis, ni bibliothèque.
  const m = ficheEnfant(poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT(ecoule) }), { retouche: allumee }), ATV);
  assert.ok(m.texte().includes('Rien en lecture') && !m.texte().includes('ci-dessous'), m.texte());
  assert.equal(bouton(m, 'Parcourir la bibliothèque'), undefined);
  // Dans ses heures : la bibliothèque, et le conseil d'avant ; « Parcourir la bibliothèque » ouvre le navigateur.
  const w = poserEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ ecran: ECRAN_ENFANT }) }), { retouche: allumee });
  const libre = ficheEnfant(w, ATV);
  assert.ok(libre.texte().includes('Lancez une appli ci-dessous.'), 'dans ses heures, le conseil revient');
  const bi = sous(libre, 'Bibliotheque');
  bi.appuyer(bouton(bi, 'Parcourir la bibliothèque'));
  libre.rendre();
  assert.equal(de(libre, 'NavigateurMedias').length, 1, 'le navigateur s’ouvre');
  // Le temps s'écoule pendant qu'on parcourt : le navigateur se ferme, la bibliothèque part.
  EN.poserEtatEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT(ecoule) }));
  libre.rendre();
  assert.deepEqual([de(libre, 'NavigateurMedias').length, de(libre, 'Bibliotheque').length], [0, 0], 'bloqué : ni navigateur ni bibliothèque');
  // Les limites levées : la bibliothèque revient, le navigateur ne se rouvre pas tout seul.
  const leve = QUAND / 1000 + 1800;
  EN.poserEtatEnfant(ETAT_ENFANT({ [ATV]: VUE_ENFANT({ ...ecoule, leve_jusqua: leve, plafond: null }) }, { leve_jusqua: leve }));
  libre.rendre();
  assert.deepEqual([de(libre, 'Bibliotheque').length, de(libre, 'NavigateurMedias').length], [1, 0], 'levées : la bibliothèque, sans navigateur rouvert');
  assert.deepEqual(w.appels, [], 'rien n’est parti');
  finEnfant();
  // Sans profil, rien ne change.
  assert.equal(de(fiche(poser(), ATV), 'Bibliotheque').length, 1, 'sans profil : la bibliothèque d’avant');
}));
