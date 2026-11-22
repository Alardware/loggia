// ─────────────────────────────────────────────────
// Agenda, veille, suppressions et Spotify (audit du 12/11, lot 4) : E25, E27,
// E28, I2 et I4.
//
// Joués quand c'est possible : les calculs purs importés (l'encre d'un bloc
// d'agenda, les voies de la semaine, les contrastes de la veille), les fiches
// montées par le harnais des crochets (tests/crochets.mjs). Le reste se lit dans
// la source, comme tests/audit_1211_lot3bis_profil.test.mjs pour le profil.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monter, texteDe, horlogeFausse } from './crochets.mjs';
import { lireCouleur, contraste, composer, SEUILS } from '../src/contraste.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const { encreSurTeinte, voiesDesBlocs } = await import('../src/feuilleagenda.jsx');
const FichePiece = (await import('../src/fichepiece.jsx')).default;
const FicheScenario = (await import('../src/fichescenario.jsx')).default;
const RangeeSpotify = (await import('../src/spotifymedias.jsx')).default;

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const fois = (texte, motif) => texte.split(motif).length - 1;
const tours = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const etatVide = () => setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null, save: null });

// ── E25 : le blanc sur l'accent clair, et sur les teintes d'agenda ───────────

test('E25 — « Ajouter le rappel », « + Événement » et le « + » des courses posent leur blanc sur `--o-accent-fond`', () => {
  const rappel = lire('src/nouveaurappel.jsx');
  assert.ok(rappel.includes("style={{ minHeight: 44, borderRadius: 12, border: 'none', background: 'var(--o-accent-fond)', color: '#fff',"), '« Ajouter le rappel » : du blanc sur l’accent clair');
  const courses = lire('src/courses.jsx');
  assert.ok(courses.includes("style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: 'none', background: 'var(--o-accent-fond)', color: '#fff',"), 'le « + » des courses : du blanc sur l’accent clair');
  const agenda = lire('src/feuilleagenda.jsx');
  assert.ok(agenda.includes("borderRadius: large ? 12 : '50%', border: 'none', background: 'var(--o-accent-fond)', color: '#fff',"), '« + Événement » : du blanc sur l’accent clair');
  for (const [nom, f] of [['nouveaurappel', rappel], ['courses', courses], ['feuilleagenda', agenda]]) {
    assert.ok(!f.includes("background: 'var(--o-accent)', color: '#fff'"), nom + ' : un bouton blanc sur l’accent clair reste');
  }
});

/* Les six teintes de `teinteAgenda` (agendarail.jsx), lues dans la source : le test suit si la palette change. */
const TEINTES = (() => {
  const m = lire('src/agendarail.jsx').match(/const TEINTES = \[([^\]]+)\]/);
  assert.ok(m, 'la palette des agendas a changé de forme');
  return m[1].split(/'\s*,\s*'/).map(s => s.replace(/'/g, '').trim());
})();
const FEUILLES = [[18, 24, 36], [242, 244, 247]];
const bloc = (rgb) => { const c = lireCouleur('rgb(' + rgb + ')'); return FEUILLES.map(f => composer(f, [c[0], c[1], c[2], 0.92])); };

test('E25 — l’encre d’un bloc d’agenda tient 4,5 pour 1 sur sa teinte, sur la feuille sombre comme sur la claire', () => {
  assert.equal(TEINTES.length, 6, 'la palette des agendas a changé : ' + TEINTES.join(' | '));
  for (const rgb of TEINTES) {
    const encre = lireCouleur(encreSurTeinte(rgb));
    assert.ok(encre, rgb + ' : encre illisible (' + encreSurTeinte(rgb) + ')');
    for (const f of bloc(rgb)) {
      const r = contraste(encre, f);
      assert.ok(r >= SEUILS.wcag, rgb + ' : ' + encreSurTeinte(rgb) + ' ne tient que ' + r.toFixed(2) + ' pour 1');
    }
  }
  // Le constat de l'audit : le blanc ne tenait pas — l'orange, le cyan, le vert autour de 2 pour 1.
  for (const rgb of ['255,166,60', '64,196,214', '46,196,136']) {
    const pire = Math.min(...bloc(rgb).map(f => contraste([255, 255, 255], f)));
    assert.ok(pire < 2.2, rgb + ' : le blanc y tenait déjà (' + pire.toFixed(2) + ')');
  }
  // Et une teinte sombre garde son blanc : l'encre ne s'assombrit que si le blanc manque son seuil.
  assert.equal(encreSurTeinte('20,40,120'), '#fff');
});

test('E25 — les blocs de la semaine, la bande des journées et la coche d’un agenda prennent cette encre', () => {
  const f = lire('src/feuilleagenda.jsx');
  assert.equal(fois(f, "background: 'rgba(' + e.rgb + ',.92)', color: encreSurTeinte(e.rgb)"), 2, 'un bloc d’agenda garde son texte blanc');
  assert.ok(f.includes("background: on ? 'rgba(' + c.rgb + ',1)' : 'transparent', color: encreSurTeinte(c.rgb) }}>"), 'la coche d’un agenda reste blanche sur sa teinte');
  assert.ok(!f.includes("lineHeight: 1.2, opacity: .85, fontVariantNumeric"), 'l’heure d’un bloc repasse à 85 % : 3,6 pour 1');
});

// ── E27 : deux rendez-vous à la même heure, côte à côte ──────────────────────

test('E27 — deux rendez-vous à la même heure se partagent la colonne, chacun sa voie', () => {
  // 10 h – 11 h deux fois : deux voies, une chacun.
  assert.deepEqual(voiesDesBlocs([{ y: 480, h: 48 }, { y: 480, h: 48 }]), [{ voie: 0, voies: 2 }, { voie: 1, voies: 2 }]);
  // Seul à son heure : toute la largeur.
  assert.deepEqual(voiesDesBlocs([{ y: 480, h: 48 }]), [{ voie: 0, voies: 1 }]);
  // Bout à bout (10–11 h puis 11–12 h) : rien ne se recouvre, chacun la colonne entière.
  assert.deepEqual(voiesDesBlocs([{ y: 480, h: 48 }, { y: 528, h: 48 }]), [{ voie: 0, voies: 1 }, { voie: 0, voies: 1 }]);
  // En chaîne : 9–11, 10–12, 11 h 30–13 h. Le troisième reprend la voie libérée par le premier ; le groupe garde deux voies.
  assert.deepEqual(voiesDesBlocs([{ y: 432, h: 96 }, { y: 480, h: 96 }, { y: 552, h: 72 }]),
    [{ voie: 0, voies: 2 }, { voie: 1, voies: 2 }, { voie: 0, voies: 2 }]);
  // Trois à la même heure, puis un seul l'après-midi : trois voies le matin, la colonne entière ensuite.
  assert.deepEqual(voiesDesBlocs([{ y: 480, h: 48 }, { y: 480, h: 48 }, { y: 480, h: 48 }, { y: 720, h: 48 }]).map(v => v.voies), [3, 3, 3, 1]);
  // L'ordre reçu est rendu tel quel, même non trié.
  assert.deepEqual(voiesDesBlocs([{ y: 528, h: 48 }, { y: 480, h: 96 }]), [{ voie: 1, voies: 2 }, { voie: 0, voies: 2 }]);
  // La hauteur DESSINÉE compte : deux blocs de dix minutes, posés à 24 px, se recouvrent à l'écran.
  assert.deepEqual(voiesDesBlocs([{ y: 480, h: 24 }, { y: 488, h: 24 }]).map(v => v.voies), [2, 2]);
});

test('E27 — la grille pose chaque bloc dans sa voie, et garde la colonne entière à qui est seul', () => {
  const f = lire('src/feuilleagenda.jsx');
  assert.ok(f.includes('const voies = voiesDesBlocs(places);'), 'la grille ne calcule plus les voies');
  assert.ok(f.includes("const largeur = n > 1 ? { left: 'calc(' + (voie * 100 / n) + '% + 1px)', width: 'calc(' + (100 / n) + '% - 2px)' } : { left: 2, right: 2 };"), 'les blocs ne se partagent plus la largeur');
  assert.ok(f.includes("<div key={e.cle} style={{ position: 'absolute', ...largeur, top: y, height: h }}>"), 'un bloc reprend toute la colonne et cache son voisin');
  assert.ok(f.includes('return { y, h: Math.max(24, brut) };'), 'les voies ne se calculent plus sur la hauteur dessinée');
});

// ── E28 : la consigne de la veille ───────────────────────────────────────────

test('E28 — « Touchez l’écran pour revenir » se lit, le jour comme la nuit, sans éclairer la chambre', () => {
  const v = lire('src/ecranveille.jsx');
  assert.ok(v.includes("right: 28, fontSize: 11, fontWeight: 700, color: nuit ? ENCRE : encre(.62) }}>{tr('Touchez l’écran pour revenir')}</div>"), 'la consigne reprend une encre trop pâle');
  assert.ok(!v.includes('color: encre(.3) }}'), 'la consigne repasse à 30 %');
  // Les couleurs de la veille, lues dans la source : le fond, l'encre, le voile de nuit du bloc.
  const fond = lireCouleur(v.match(/const FOND = '([^']+)'/)[1]);
  const encre = lireCouleur(v.match(/const ENCRE = '([^']+)'/)[1]);
  assert.ok(v.includes('opacity: nuit ? .55 : 1'), 'le voile de nuit du bloc a changé : refaire le calcul');
  const jour = contraste(composer(fond, [encre[0], encre[1], encre[2], 0.62]), fond);
  const nuit = contraste(composer(fond, [encre[0], encre[1], encre[2], 0.55]), fond);
  const avant = contraste(composer(fond, [encre[0], encre[1], encre[2], 0.3 * 0.55]), fond);
  assert.ok(jour >= SEUILS.wcag, 'le jour : ' + jour.toFixed(2) + ' pour 1');
  assert.ok(nuit >= SEUILS.wcag, 'la nuit : ' + nuit.toFixed(2) + ' pour 1');
  assert.ok(nuit < jour, 'la nuit, la consigne doit rester plus sombre que le jour');
  assert.ok(avant < 2, 'le constat de l’audit ne tient plus (' + avant.toFixed(2) + ')');
});

// ── I2 : supprimer se confirme ───────────────────────────────────────────────

/* Le bouton « Supprimer » / « Confirmer ? » d'une feuille montée : `dedans()` déroule le contenu du `BottomSheet`. */
function feuille(Comp, props) {
  const fermetures = [];
  const m = monter(Comp, props);
  const dedans = () => m.arbre.props.children(() => fermetures.push(1));
  const bouton = () => {
    const out = [];
    const aller = (n) => { if (n == null || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(aller); return; } if (n.type === 'button' && /^(Supprimer|Confirmer \?)$/.test(texteDe(n))) out.push(n); aller(n.props && n.props.children); };
    aller(dedans());
    assert.equal(out.length, 1, 'un seul bouton de suppression attendu');
    return out[0];
  };
  return { m, fermetures, bouton };
}

function jouerArmement(Comp, props, supprimes, attendu) {
  const h = horlogeFausse();
  h.installer();
  try {
    const f = feuille(Comp, props);
    assert.equal(texteDe(f.bouton()), 'Supprimer');
    assert.equal(f.bouton().props.style.background, 'rgba(var(--o-bad-rgb),.12)', 'au repos, le bouton garde son dessin');

    // Premier appui : rien ne part, le bouton s'arme — rouge plein, « Confirmer ? ».
    f.bouton().props.onClick(); f.m.rendre();
    assert.deepEqual(supprimes, [], 'un seul appui a supprimé');
    assert.equal(texteDe(f.bouton()), 'Confirmer ?');
    assert.equal(f.bouton().props.style.background, 'var(--o-bad)', 'armé, le bouton ne passe pas au rouge plein');
    assert.equal(f.bouton().props.style.color, '#fff');

    // Sans second appui, il se désarme seul au bout de 4 s.
    h.avancer(3999); f.m.effets();
    assert.equal(texteDe(f.bouton()), 'Confirmer ?', 'désarmé trop tôt');
    h.avancer(1); f.m.effets();
    assert.equal(texteDe(f.bouton()), 'Supprimer', 'un bouton armé le reste : un appui distrait, plus tard, supprimerait');
    f.bouton().props.onClick(); f.m.rendre();
    assert.deepEqual(supprimes, [], 'désarmé, un appui a supprimé');

    // Deux appuis rapprochés : la suppression part.
    f.bouton().props.onClick(); f.m.rendre();
    assert.deepEqual(supprimes, [attendu]);
    return f;
  } finally { h.restaurer(); }
}

test('I2 — une pièce : le premier appui arme « Supprimer », le second supprime, 4 s sans appui le désarment', () => {
  etatVide();
  const supprimes = [];
  const briques = { habillagePiece: () => ({ glyphe: 'home', teinte: 'accent' }), TEINTES_PIECE: [{ id: 'accent', label: 'Bleu', rgb: '79,140,255', col: 'var(--o-accent-soft)' }],
    ICONES_PIECE: [], ChoixIcone: () => null, FicheRangee: () => null, RmBascule: () => null };
  const f = jouerArmement(FichePiece, { nom: 'Salon', hass: { states: {} }, onEnregistrer: () => {}, onSupprimer: (n) => supprimes.push(n), onClose: () => {}, briques }, supprimes, 'Salon');
  assert.equal(f.fermetures.length, 1, 'supprimée, la fiche ne se ferme pas');
});

test('I2 — un scénario : le même geste, et la suppression part au serveur une seule fois', async () => {
  etatVide();
  const supprimes = [];
  const briques = { ChoixIcone: () => null, FicheRangee: () => null, RmBascule: () => null, boutonEdition: () => ({}), BOUTON_PETIT: {} };
  const scenario = { id: 'apero', nom: 'Apéro', icone: 'glass', teinte: 'accent', actions: [], integre: false };
  const f = jouerArmement(FicheScenario, { scenario, onEnregistrer: (p) => { if (p.supprimer) supprimes.push(p.supprimer); return Promise.resolve(); }, onClose: () => {}, briques }, supprimes, 'apero');
  await tours();
  assert.equal(f.fermetures.length, 1, 'supprimé, la fiche ne se ferme pas');
});

test('I2 — un événement d’agenda : armé, rouge plein par-dessus le repos, désarmé seul au bout de 4 s', () => {
  const f = lire('src/feuilleagenda.jsx');
  const debut = f.indexOf('function FicheEvenement(');
  const fiche = f.slice(debut, f.indexOf('\n}\n', debut) + 2);
  assert.ok(fiche.includes('if (!arme) { setArme(true); return; }'), 'supprimer part de nouveau d’un seul toucher');
  assert.ok(fiche.includes("background: 'rgba(var(--o-bad-rgb),.12)', color: 'var(--o-bad)'") && fiche.includes("transition: 'background .2s, color .2s', ...(arme ? SUPPR_ARME : null) }}>"), 'armé, le bouton ne passe pas au rouge plein');
  assert.ok(f.includes("const SUPPR_ARME = { background: 'var(--o-bad)', color: '#fff' };"), 'le rouge plein du bouton armé a changé');
  assert.ok(fiche.includes('useEffect(() => { if (!arme || enVol) return undefined; const t = setTimeout(() => setArme(false), 4000); return () => clearTimeout(t); }, [arme, enVol]);'),
    'un bouton armé le reste : un appui distrait, plus tard, supprimerait le rendez-vous');
  assert.ok(fiche.includes("{arme ? tr('Confirmer ?') : null}"), 'armé, le bouton ne dit pas « Confirmer ? »');
});

// ── I4 : « Réessayer » quand Spotify ne répond pas ───────────────────────────

test('I4 — Spotify ne répond pas : « Réessayer » relit la liste des playlists, et ne lance jamais de musique', async () => {
  const SPOTIFY = 'media_player.spotify_lot4';
  setLoggiaState({ index: { entityMeta: new Map([[SPOTIFY, { platform: 'spotify' }]]), deviceMeta: new Map() }, ent: {}, cfg: {}, resolved: null, save: () => true });
  try {
    const appels = [];
    let repond = false;
    const hass = { states: { [SPOTIFY]: { entity_id: SPOTIFY, state: 'idle', attributes: {} } }, user: { is_admin: true },
      callWS: (msg) => { appels.push(msg.type); return repond ? Promise.resolve({ children: [] }) : Promise.reject({ code: 'timeout', message: 'coupé' }); } };
    const r = monter(RangeeSpotify, { hass });
    await tours(); r.rendre();
    const alerte = () => r.trouver(e => e.props && e.props.role === 'alert')[0];
    const reessayer = () => r.trouver(e => e.type === 'button' && texteDe(e) === 'Réessayer')[0];
    assert.ok(alerte() && texteDe(alerte()).includes('Spotify ne répond pas.'), 'l’échec n’est pas dit');
    assert.ok(reessayer(), 'pas de « Réessayer » dans le message d’échec');
    assert.deepEqual(appels, ['loggia/spotify/playlists']);

    repond = true;
    r.appuyer(reessayer());
    await tours(); r.rendre();
    assert.deepEqual(appels, ['loggia/spotify/playlists', 'loggia/spotify/playlists'], '« Réessayer » ne redemande pas la liste');
    assert.equal(alerte(), undefined, 'relue, la liste laisse l’erreur à l’écran');
    assert.ok(r.texte().includes('Aucune playlist dans votre compte Spotify.'), 'relue, la rangée ne dit pas ce qu’elle a trouvé');
    assert.ok(!appels.includes('loggia/spotify/jouer'), 'réessayer a lancé une lecture');
  } finally { etatVide(); }
});
