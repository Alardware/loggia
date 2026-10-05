/* Les caméras ne décodent plus pour personne (lot 14 de l'audit du 03/10).
 *
 * Sous l'écran de veille — posé PAR-DESSUS l'Accueil sans le démonter — et
 * dans un onglet caché, chaque caméra gardait sa session WebRTC, HLS ou MJPEG
 * toute la nuit, ou retéléchargeait sa vignette toutes les deux secondes. La
 * démo n'a pas de vraie caméra : on le prouve ici en faisant TOURNER le code.
 *
 * Deux étages. `src/regard.js` est pur : un document et une horloge tenus à la
 * main suffisent. `CamLive` et `HaImage` sont des composants : on les exécute
 * avec une doublure minimale des crochets de React (useState, useEffect,
 * useRef — ni DOM ni react-dom), une fausse connexion Home Assistant, un faux
 * RTCPeerConnection et les minuteurs simulés de node:test. On compte ce qui
 * coûte : les sessions ouvertes et fermées, les vignettes demandées.
 *
 * `regard.js` est importé DANS chaque test qui le lit : sur le code d'avant,
 * chaque test échoue pour sa propre raison, pas tous pour un module absent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

const lire = (...p) => readFileSync(new URL('../' + p.join('/'), import.meta.url), 'utf8');
const regard = () => import('../src/regard.js');

/* La doublure de React, pour camera.jsx SEUL : ses crochets passent par
 * `globalThis.__crochetsLot14`, que `monter` remplit. Le JSX, lui, garde le
 * vrai `react/jsx-runtime` : les éléments rendus sont de vrais éléments. */
const DOUBLURE = 'data:text/javascript,' + encodeURIComponent([
  'const c = () => globalThis.__crochetsLot14;',
  'export const useState = (i) => c().useState(i);',
  'export const useEffect = (f, d) => c().useEffect(f, d);',
  'export const useRef = (v) => c().useRef(v);',
].join('\n'));
const AIGUILLAGE = 'data:text/javascript,' + encodeURIComponent([
  'export async function resolve(spec, ctx, next) {',
  "  if (spec === 'react' && ctx.parentURL && /\\/src\\/camera\\.jsx$/.test(ctx.parentURL)) return { url: " + JSON.stringify(DOUBLURE) + ', shortCircuit: true };',
  '  return next(spec, ctx);',
  '}',
].join('\n'));
register('./jsx-hooks.mjs', import.meta.url);
register(AIGUILLAGE);
const { CamLive, HaImage } = await import('../src/camera.jsx');

// ── Le document : visible ou caché, avec ou sans la classe de la veille ──────
function installerDocument() {
  const classes = new Set();
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.documentElement = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } };
  globalThis.document = doc;
  return doc;
}
const cacher = (doc) => { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); };
const montrer = (doc) => { doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); };
// Ce que fait ecranveille.jsx : la classe que wx3d lit, puis l'annonce.
const veille = (doc, on) => {
  if (on) doc.documentElement.classList.add('loggia-ambient-on'); else doc.documentElement.classList.remove('loggia-ambient-on');
  doc.dispatchEvent(new Event('loggia-veille'));
};

/** Une horloge tenue à la main, pour `regard.js` seul. */
function horloge() {
  let t = 0, n = 0;
  const minuteurs = new Map();
  return {
    minuteurs,
    setTimeout(f, ms) { n += 1; minuteurs.set(n, { f, a: t + ms }); return n; },
    clearTimeout(id) { minuteurs.delete(id); },
    avancer(ms) { t += ms; for (const [id, m] of [...minuteurs]) if (m.a <= t) { minuteurs.delete(id); m.f(); } },
  };
}

// ── 1. regard.js, pur ────────────────────────────────────────────────────────

test('pageRegardee : visible et sans veille, oui ; onglet caché ou veille posée, non', async () => {
  const { pageRegardee, CLASSE_VEILLE, EVENEMENT_VEILLE } = await regard();
  assert.equal(CLASSE_VEILLE, 'loggia-ambient-on', 'la classe que pose la veille et que wx3d lit déjà');
  assert.equal(EVENEMENT_VEILLE, 'loggia-veille');
  const doc = installerDocument();
  assert.equal(pageRegardee(doc), true);
  doc.visibilityState = 'hidden';
  assert.equal(pageRegardee(doc), false, 'onglet caché');
  doc.visibilityState = 'visible';
  doc.documentElement.classList.add(CLASSE_VEILLE);
  assert.equal(pageRegardee(doc), false, 'la veille recouvre la page');
  assert.equal(pageRegardee(null), true, 'hors navigateur : rien à couper');
});

test('suivreRegard sans grâce : la perte et le retour passent tout de suite', async () => {
  const { suivreRegard } = await regard();
  const doc = installerDocument();
  const vu = [];
  const arreter = suivreRegard((v) => vu.push(v), { doc, horloge: horloge() });
  assert.deepEqual(vu, [true], 'l’abonnement redit l’état : le rendu a pu le précéder');
  cacher(doc);
  montrer(doc);
  veille(doc, true);
  veille(doc, false);
  assert.deepEqual(vu, [true, false, true, false, true]);
  arreter();
});

test('suivreRegard avec grâce : un retour rapide ne coupe rien, une absence longue coupe à l’échéance', async () => {
  const { suivreRegard, GRACE_DIRECT } = await regard();
  assert.ok(GRACE_DIRECT >= 10000 && GRACE_DIRECT <= 60000, 'quelques dizaines de secondes, pas une nuit ni un clin d’œil');
  const doc = installerDocument();
  const h = horloge();
  const vu = [];
  const arreter = suivreRegard((v) => vu.push(v), { grace: GRACE_DIRECT, doc, horloge: h });
  cacher(doc);
  h.avancer(GRACE_DIRECT - 1);
  assert.deepEqual(vu, [true], 'pendant la grâce, rien ne bascule');
  montrer(doc);
  assert.equal(h.minuteurs.size, 0, 'le retour annule l’échéance');
  h.avancer(GRACE_DIRECT);
  assert.deepEqual(vu, [true], 'retour rapide : jamais coupé, rien à renégocier');
  veille(doc, true);
  cacher(doc);
  assert.equal(h.minuteurs.size, 1, 'veille puis onglet caché : une seule échéance, pas deux');
  h.avancer(GRACE_DIRECT);
  assert.deepEqual(vu, [true, false], 'absence longue : coupé à l’échéance');
  montrer(doc);
  assert.deepEqual(vu, [true, false], 'l’onglet revient, la veille recouvre toujours : toujours personne');
  veille(doc, false);
  assert.deepEqual(vu, [true, false, true], 'la veille se lève : le retour est immédiat');
  arreter();
});

test('suivreRegard : la classe fait foi à l’échéance, et débrancher retire tout', async () => {
  const { suivreRegard } = await regard();
  const doc = installerDocument();
  const h = horloge();
  const vu = [];
  const arreter = suivreRegard((v) => vu.push(v), { grace: 30000, doc, horloge: h });
  veille(doc, true);
  // La veille se lève sans que l'annonce arrive : l'échéance relit la classe.
  doc.documentElement.classList.remove('loggia-ambient-on');
  h.avancer(30000);
  assert.deepEqual(vu, [true], 'une annonce perdue ne coupe pas un direct que l’on regarde');
  veille(doc, false);
  assert.deepEqual(vu, [true], 'une annonce sans changement réel ne bascule rien');
  cacher(doc);
  arreter();
  assert.equal(h.minuteurs.size, 0, 'débranché : plus d’échéance');
  h.avancer(60000);
  montrer(doc);
  assert.deepEqual(vu, [true], 'débranché : plus d’écoute');
  assert.doesNotThrow(() => suivreRegard(() => {}, { doc: null })(), 'hors navigateur, rien ne se branche');
});

// ── 2. Les composants, exécutés avec une doublure des crochets ───────────────

/** Monte `Comp` : rend, branche de faux éléments sur les références, joue les
 * effets dont les dépendances ont changé, et recommence tant qu'un état a
 * bougé. Les états posés plus tard (après un `await`, sur un événement)
 * attendent l'appel suivant à `rendre()` — comme un commit de React. */
function monter(Comp, props) {
  const cases = [];
  const elements = {};
  let curseur = 0, sale = false, arbre = null, aFaire = [];
  const crochets = {
    useState(init) {
      const k = curseur++;
      if (!cases[k]) cases[k] = { v: typeof init === 'function' ? init() : init };
      const c = cases[k];
      return [c.v, (nv) => { const v = typeof nv === 'function' ? nv(c.v) : nv; if (!Object.is(v, c.v)) { c.v = v; sale = true; } }];
    },
    useRef(init) { const k = curseur++; if (!cases[k]) cases[k] = { current: init }; return cases[k]; },
    useEffect(f, deps) {
      const k = curseur++;
      const e = cases[k];
      if (e && deps && e.deps && deps.length === e.deps.length && deps.every((d, i) => Object.is(d, e.deps[i]))) return;
      aFaire.push({ k, f, deps });
    },
  };
  const brancher = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(brancher); return; }
    const ref = 'ref' in n ? n.ref : null;
    if (ref && typeof ref === 'object' && ref.current == null) {
      ref.current = n.type === 'video' ? fauxVideo() : { src: '', onerror: null, removeAttribute(a) { if (a === 'src') this.src = ''; } };
      elements[n.type] = ref.current;
    }
    if (n.props && n.props.children) brancher(n.props.children);
  };
  const rendre = () => {
    for (let tour = 0; tour < 50; tour += 1) {
      globalThis.__crochetsLot14 = crochets;
      sale = false; curseur = 0; aFaire = [];
      arbre = Comp(props);
      brancher(arbre);
      for (const { k, f, deps } of aFaire) {
        const e = cases[k];
        if (e && e.nettoyer) e.nettoyer();
        const r = f();
        cases[k] = { deps, nettoyer: typeof r === 'function' ? r : null };
      }
      if (!sale) return arbre;
    }
    throw new Error('le rendu ne se stabilise pas');
  };
  const demonter = () => { for (const c of cases) if (c && c.nettoyer) c.nettoyer(); };
  rendre();
  return { rendre, demonter, elements, get arbre() { return arbre; } };
}

/** Une vidéo qui compte ses images comme `getVideoPlaybackQuality`. */
function fauxVideo() {
  return {
    srcObject: null, src: '', onerror: null, images: 0,
    canPlayType: () => '', // pas de HLS natif : le repli va droit au MJPEG
    play() { return Promise.resolve(); }, pause() {}, load() {},
    removeAttribute(a) { if (a === 'src') this.src = ''; },
    getVideoPlaybackQuality() { return { totalVideoFrames: this.images }; },
  };
}

/** La connexion de Home Assistant : elle note tout ce qu'on lui demande. */
function fausseConnexion() {
  const journal = [], abonnements = [];
  return {
    journal, abonnements,
    sendMessagePromise(msg) {
      journal.push(msg.type);
      if (msg.type === 'camera/webrtc/get_client_config') return Promise.resolve({ configuration: { iceServers: [] } });
      if (msg.type === 'auth/sign_path') return Promise.resolve({ path: '/signe' + msg.path });
      return Promise.resolve({});
    },
    subscribeMessage(cb, msg) {
      journal.push(msg.type);
      const a = { type: msg.type, ferme: false };
      abonnements.push(a);
      return Promise.resolve(() => { a.ferme = true; });
    },
  };
}

const sessions = [];
globalThis.RTCPeerConnection = class extends EventTarget {
  constructor() { super(); this.ferme = false; this.iceConnectionState = 'new'; this.localDescription = null; sessions.push(this); }
  addTransceiver() {}
  async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription() {}
  close() { this.ferme = true; this.iceConnectionState = 'closed'; }
};
const livrerPiste = (pc) => { const e = new Event('track'); e.streams = [{ flux: sessions.indexOf(pc) }]; pc.dispatchEvent(e); };

// Laisser passer les promesses en attente (`setImmediate` n'est pas simulé).
const vider = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r)); };

/** Le temps passe, seconde par seconde. Le navigateur décode tant que
 * l'onglet est visible — la veille ne l'en empêche pas, un onglet caché peut
 * s'arrêter : c'est le pire cas, celui que le guet du gel doit supporter. */
async function laisserPasser(t, doc, video, ms) {
  for (let fait = 0; fait < ms; fait += 1000) {
    if (video && doc.visibilityState === 'visible') video.images += 25;
    t.mock.timers.tick(1000);
    await vider();
  }
}

const hassDe = (conn) => ({ auth: { data: { access_token: 'jeton-de-test' } }, connection: conn });

/** Un direct établi : la négociation a abouti, la piste est arrivée. */
async function directEtabli(t, doc) {
  sessions.length = 0;
  const conn = fausseConnexion();
  const h = monter(CamLive, { hass: hassDe(conn), haid: 'camera.entree', online: true, nom: 'Entrée' });
  await vider(); h.rendre();
  assert.equal(sessions.length, 1, 'page visible : une négociation, comme avant');
  livrerPiste(sessions[0]);
  t.mock.timers.tick(150); await vider(); h.rendre();
  assert.ok(h.elements.video && h.elements.video.srcObject, 'la piste est branchée sur la vidéo');
  return { conn, h };
}

test('CamLive : monté dans un onglet caché, il n’ouvre aucune session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  sessions.length = 0;
  const doc = installerDocument();
  doc.visibilityState = 'hidden';
  const conn = fausseConnexion();
  const h = monter(CamLive, { hass: hassDe(conn), haid: 'camera.entree', online: true, nom: 'Entrée' });
  await vider(); h.rendre();
  await laisserPasser(t, doc, null, 20000);
  assert.equal(sessions.length, 0, 'une session WebRTC ouverte pour un onglet que personne ne voit');
  assert.deepEqual(conn.journal, [], 'Home Assistant a été sollicité pour personne : ' + conn.journal.join(', '));
  montrer(doc); h.rendre(); await vider();
  assert.equal(sessions.length, 1, 'l’onglet se montre : le direct part aussitôt');
  h.demonter();
});

test('CamLive : sous la veille, le direct tient la grâce puis se ferme ; le réveil le rouvre', async (t) => {
  const { GRACE_DIRECT } = await regard().catch(() => ({ GRACE_DIRECT: 30000 }));
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const doc = installerDocument();
  const { conn, h } = await directEtabli(t, doc);
  const video = h.elements.video;
  veille(doc, true); h.rendre();
  await laisserPasser(t, doc, video, GRACE_DIRECT - 1000); h.rendre();
  assert.equal(sessions[0].ferme, false, 'pendant la grâce, la session reste : un réveil rapide ne renégocie rien');
  assert.ok(!conn.journal.includes('auth/sign_path'), 'pendant la grâce, pas de repli MJPEG');
  await laisserPasser(t, doc, video, 1000); h.rendre(); await vider();
  assert.equal(sessions[0].ferme, true, 'la veille recouvre la page depuis la grâce : la session WebRTC est toujours ouverte');
  assert.equal(conn.abonnements[0].ferme, true, 'l’abonnement camera/webrtc/offer reste ouvert sous la veille');
  assert.equal(video.srcObject, null, 'la vidéo garde son flux');
  await laisserPasser(t, doc, video, 10 * 60000); h.rendre();
  assert.equal(sessions.length, 1, 'sous la veille, rien ne se rouvre');
  veille(doc, false); h.rendre(); await vider();
  assert.equal(sessions.length, 2, 'au réveil, le direct se renégocie aussitôt');
  h.demonter();
});

test('CamLive : onglet caché moins que la grâce, le direct revient tel quel — pas de faux gel, pas de MJPEG', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const doc = installerDocument();
  const { conn, h } = await directEtabli(t, doc);
  await laisserPasser(t, doc, h.elements.video, 6000); h.rendre();
  // Onglet caché vingt secondes, le décodage arrêté : le compteur d'images ne bouge plus.
  cacher(doc); h.rendre();
  await laisserPasser(t, doc, h.elements.video, 20000); h.rendre();
  montrer(doc); h.rendre(); await vider();
  await laisserPasser(t, doc, h.elements.video, 30000); h.rendre();
  assert.equal(sessions.length, 1, 'un retour rapide a renégocié le direct');
  assert.equal(sessions[0].ferme, false, 'un retour rapide a trouvé la session fermée');
  assert.ok(!conn.journal.includes('auth/sign_path'), 'un compteur figé par l’onglet caché a passé pour un gel : repli MJPEG');
  h.demonter();
  assert.equal(sessions[0].ferme, true, 'démonté : la session se ferme, comme avant');
});

test('HaImage : plus de vignette quand personne ne regarde, la dernière reste, le retour en relit une aussitôt', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const doc = installerDocument();
  const requetes = [];
  const fetchAvant = globalThis.fetch;
  globalThis.fetch = async (url) => { requetes.push(url); return { ok: true, blob: async () => new Blob(['jpeg']) }; };
  const revoquees = [];
  const revoquer = t.mock.method(URL, 'revokeObjectURL', (u) => { revoquees.push(u); });
  try {
    const h = monter(HaImage, { hass: { auth: { data: { access_token: 'jeton-de-test' } } }, haid: 'camera.entree', refreshMs: 2000 });
    await vider(); h.rendre();
    assert.equal(requetes.length, 1, 'visible : une vignette tout de suite');
    t.mock.timers.tick(2000); await vider(); h.rendre();
    assert.equal(requetes.length, 2, 'puis une toutes les deux secondes');
    const affichee = h.arbre && h.arbre.props.src;
    assert.ok(String(affichee).startsWith('blob:'), 'une image est affichée');
    assert.equal(revoquees.length, 1, 'l’image remplacée est libérée');

    cacher(doc); h.rendre();
    t.mock.timers.tick(60000); await vider(); h.rendre();
    assert.equal(requetes.length, 2, `onglet caché : ${requetes.length - 2} vignettes téléchargées pour personne en une minute`);
    assert.equal(h.arbre && h.arbre.props.src, affichee, 'la dernière image reste affichée pendant la pause');
    assert.ok(!revoquees.includes(affichee), 'la pause a libéré l’image encore affichée');

    montrer(doc); h.rendre(); await vider(); h.rendre();
    assert.equal(requetes.length, 3, 'au retour, une vignette aussitôt, sans attendre le tour suivant');
    veille(doc, true); h.rendre();
    t.mock.timers.tick(60000); await vider();
    assert.equal(requetes.length, 3, 'sous la veille non plus');
    h.demonter();
    assert.ok(revoquees.includes(h.arbre.props.src), 'démontée : la dernière image est libérée');
    revoquer.mock.restore();
  } finally {
    globalThis.fetch = fetchAvant;
  }
});

// ── 3. Le branchement ────────────────────────────────────────────────────────

test('la veille annonce sa classe, en la posant comme en la retirant', () => {
  const v = lire('src', 'ecranveille.jsx');
  assert.ok(v.includes("import { annoncerVeille } from './regard.js';"));
  const i = v.indexOf("document.documentElement.classList.add('loggia-ambient-on');");
  assert.ok(i > 0, 'la veille ne pose plus sa classe');
  const effet = v.slice(i, v.indexOf('}, []);', i));
  assert.match(effet, /classList\.add\('loggia-ambient-on'\);[\s\S]*annoncerVeille\(\);\s*return/, 'la pose n’est plus annoncée');
  assert.match(effet, /classList\.remove\('loggia-ambient-on'\); annoncerVeille\(\);/, 'le retrait n’est plus annoncé : les caméras resteraient coupées au réveil');
});

test('le direct et la vignette dépendent du regard, avec et sans grâce', () => {
  const cam = lire('src', 'camera.jsx');
  assert.ok(cam.includes('const regardee = useRegard(GRACE_DIRECT);'), 'le direct ne suit plus le regard, ou sans grâce');
  assert.ok(cam.includes('const regardee = useRegard(0);'), 'la vignette ne suit plus le regard');
  assert.ok(cam.includes('}, [haid, online, authentifie, conn, regardee]);'));
  assert.ok(cam.includes('}, [haid, authentifie, refreshMs, kind, regardee]);'));
  // Coupé sans démonter `<video>` ni `<img>` : en « off », le rendu est vide
  // et le nettoyage suivant ne retrouverait plus le flux MJPEG à refermer.
  assert.ok(/if \(!regardee\) return;/.test(cam) && !/if \([^)]*!regardee[^)]*\) \{ setMode\('off'\)/.test(cam));
});
