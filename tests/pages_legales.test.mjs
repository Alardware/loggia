// ─────────────────────────────────────────────────────────────────────────────
// Les pages légales du site en ligne (GitHub Pages).
//
// Quatre pages statiques, en français, dans `site/legal/` : mentions légales,
// confidentialité, conditions d'utilisation, cookies. Elles ne valent que si
// elles disent VRAI — d'où ces tests, qui tiennent trois choses :
//
//   1. ce que la loi demande y est (LCEN art. 1-1 : éditeur, hébergeur) ;
//   2. ce qu'elles affirment du code reste exact (aucun cookie, les clés de
//      session, le micro jamais ouvert en démo, aucune adresse tierce) — le jour
//      où le code change, le test tombe et la page se relit ;
//   3. elles ne partent que sur le site, jamais dans le paquet que HACS livre :
//      la politique d'un site web n'a rien à faire dans le Home Assistant des gens.
//
// Aucune adresse e-mail n'est écrite ici : `npm run audit` les refuse dans
// `tests/`, et il a raison. On vérifie qu'un contact EXISTE, pas lequel.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const PAGES = ['mentions-legales.html', 'confidentialite.html', 'cgu.html', 'cookies.html'];
const page = (nom) => lire('site', 'legal', nom);

/** Tous les fichiers de code de `src/` (pas les images ni les SVG). */
function sources(dir = join(RACINE, 'src'), out = []) {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(m?js|jsx|css)$/.test(nom)) out.push(p);
  }
  return out;
}
const SRC = sources().map((p) => ({ p, texte: readFileSync(p, 'utf8') }));

test('les quatre pages existent, en français, lisibles sans JavaScript', () => {
  for (const nom of PAGES) {
    const h = page(nom);
    assert.ok(h.includes('<html lang="fr">'), nom + ' : langue déclarée');
    assert.ok(h.includes('<meta name="viewport" content="width=device-width, initial-scale=1" />'), nom + ' : téléphone');
    assert.match(h, /<title>[^<]+ — Loggia<\/title>/, nom + ' : titre');
    assert.match(h, /<meta name="description" content="[^"]{50,}"/, nom + ' : description');
    assert.equal(h.split('<h1').length - 1, 1, nom + ' : un seul titre de page');
    assert.ok(h.includes('<main id="contenu">') && h.includes('href="#contenu"'), nom + ' : lien d’évitement vers le contenu');
    assert.ok(h.includes('<nav aria-label="Pages légales">'), nom + ' : menu nommé');
    assert.ok(!/<script/i.test(h), nom + ' : aucun script, la page se lit sans JavaScript');
    for (const autre of PAGES) assert.ok(h.includes('href="./' + autre + '"'), nom + ' mène à ' + autre);
    assert.equal(h.split('aria-current="page"').length - 1, 1, nom + ' : la page courante est dite une fois');
    assert.ok(h.includes('href="../"'), nom + ' : retour à la démonstration');
    assert.match(h, /Dernière mise à jour : <time datetime="\d{4}-\d{2}-\d{2}">/, nom + ' : date de mise à jour');
  }
});

test('aucune ressource tierce : les pages se servent entièrement depuis le site', () => {
  for (const nom of PAGES) {
    const h = page(nom);
    // Un lien <a> vers l'extérieur est permis ; charger quoi que ce soit, non.
    assert.ok(!/<(?:link|img|iframe|source|video|audio|object|embed)\b[^>]*(?:href|src)="(?:https?:)?\/\//i.test(h), nom + ' charge une ressource externe');
  }
  const css = lire('site', 'legal', 'legal.css');
  assert.ok(!/url\(\s*['"]?(?:https?:)?\/\//i.test(css) && !css.includes('@import'), 'la feuille de style charge une ressource externe');
});

test('les mentions légales portent ce que la loi demande (LCEN art. 1-1)', () => {
  const h = page('mentions-legales.html');
  for (const m of [
    'Guillaume Alard', 'à titre non professionnel', 'article 1-1', 'loi n° 2004-575',
    'Directeur de la publication',
    'GitHub, Inc.', '88 Colin P. Kelly Jr. Street', 'San Francisco, CA 94107', 'États-Unis',
    // La licence des icônes (UIcons, Flaticon) EXIGE cette attribution.
    'UIcons', 'Flaticon', 'SIL Open Font License', 'licence MIT',
  ]) assert.ok(h.includes(m), 'manque : ' + m);
});

test('un contact existe, et aucun repère à compléter ne part en ligne', () => {
  for (const nom of PAGES) {
    const h = page(nom);
    assert.ok(!/À COMPLÉTER|A COMPLETER|TODO|lorem ipsum/i.test(h), nom + ' porte encore un repère à compléter');
  }
  for (const nom of ['mentions-legales.html', 'confidentialite.html']) {
    assert.match(page(nom), /href="mailto:[^"@\s]+@[^"@\s]+\.[a-z]{2,}"/, nom + ' : une adresse de contact');
  }
});

test('la politique des cookies dit vrai : aucun cookie, et chaque clé de session est nommée', () => {
  const h = page('cookies.html');
  for (const { p, texte } of SRC) assert.ok(!texte.includes('document.cookie'), p + ' lit ou écrit un cookie : la page « cookies » est à relire');

  const cles = new Set();
  for (const { texte } of SRC) {
    for (const m of texte.matchAll(/sessionStorage\.(?:get|set|remove)Item\(\s*'([^']+)'/g)) cles.add(m[1]);
  }
  // Deux clés passent par une constante : on tient la constante ET sa valeur.
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes("const ONGLET_CLE = 'loggia-accueil-onglet';"));
  assert.ok(app.includes("const cle = 'loggia-defilement';"));
  cles.add('loggia-accueil-onglet');
  cles.add('loggia-defilement');

  assert.ok(cles.size >= 8, 'la recherche des clés ne trouve plus rien : le test ne garde plus rien');
  for (const c of cles) assert.ok(h.includes('<code>' + c + '</code>'), 'clé de session absente de la page : ' + c);
  // Dans l'autre sens : la page ne garde pas une clé que le code n'écrit plus.
  for (const m of h.matchAll(/<code>(loggia[-_][a-z_-]+)<\/code>/g)) assert.ok(cles.has(m[1]), 'clé nommée par la page mais absente du code : ' + m[1]);
});

test('la confidentialité dit vrai : ni mesure d’audience, ni adresse tierce, micro fermé en démo', () => {
  // Aucune mesure d'audience, aucun envoi en arrière-plan.
  for (const { p, texte } of SRC) {
    assert.ok(!/sendBeacon|googletagmanager|google-analytics|gtag\(|matomo|posthog|hotjar/i.test(texte), p + ' : mesure d’audience');
  }
  // Les seules adresses externes du code : des liens que l'on CLIQUE (GitHub,
  // Ko-fi), deux exemples d'adresse Home Assistant, l'espace de noms SVG. Une
  // adresse de plus oblige à relire la politique de confidentialité.
  const PERMIS = new Set(['www.w3.org', 'homeassistant.local', 'xxxx.ui.nabu.casa', 'github.com', 'ko-fi.com']);
  for (const { p, texte } of SRC) {
    for (const m of texte.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      assert.ok(PERMIS.has(m[1].toLowerCase()), p + ' nomme ' + m[1] + ' : la politique de confidentialité est à relire');
    }
  }
  // Le micro : la liaison à Home Assistant est exigée AVANT de le demander, et
  // la démo n'a pas cette liaison — il ne s'ouvre donc jamais sur le site.
  const voix = lire('src', 'voix.js');
  const iSocket = voix.indexOf("throw new Error('socket')");
  const iMicro = voix.indexOf('getUserMedia({');
  assert.ok(iSocket > 0 && iMicro > iSocket, 'le micro serait demandé avant de vérifier la liaison');
  assert.ok(!/\bsocket\s*:/.test(lire('src', 'demo.js')), 'la démo simule une liaison : le micro pourrait s’ouvrir sur le site');
  // La caméra : une seule option, coupée par défaut, nommée par la page.
  assert.ok(lire('src', 'App.jsx').includes("localStorage.getItem('loggia-ambmotion') === '1'"));
  assert.ok(lire('src', 'views', 'parametres.jsx').includes("label={tr('Réveil par la caméra')}"));
  const h = page('confidentialite.html');
  for (const m of ['Réveil par la caméra', 'adresse IP', 'GitHub', 'Data Privacy Framework', 'CNIL', '3 place de Fontenoy', 'Ko-fi']) {
    assert.ok(h.includes(m), 'manque : ' + m);
  }
});

test('les conditions d’utilisation couvrent la licence, la sécurité et les dons', () => {
  const h = page('cgu.html');
  for (const m of ['licence MIT', 'sans garantie', 'système de sécurité', 'Ko-fi', 'sans contrepartie', 'droit français']) {
    assert.ok(h.includes(m), 'manque : ' + m);
  }
});

test('les pages ne partent que sur le site, jamais dans le paquet HACS', () => {
  // `public/` est copié dans TOUTES les constructions, donc dans le paquet.
  assert.ok(!existsSync(join(RACINE, 'public', 'legal')), 'public/legal partirait dans le paquet HACS');
  const vite = lire('vite.config.js');
  assert.ok(vite.includes("if (mode === 'demo') config.plugins.push(siteEnLigne);"), 'le site ne se copie qu’en mode demo');
  assert.ok(vite.includes("cpSync(join(racine, 'site'), sortie, { recursive: true });"));
  assert.ok(!/\bsite\b/.test(lire('scripts', 'pack_frontend.py')), 'le paquet HACS ne lit jamais site/');
  // Corriger une page légale suffit à republier le site.
  assert.ok(lire('.github', 'workflows', 'demo.yml').includes("- 'site/**'"), 'une page légale corrigée ne se publierait pas');
  // Le lien du badge n'existe que dans la construction en ligne : sur une
  // installation, `?demo` n'a pas ces pages et le lien mènerait nulle part.
  const demo = lire('src', 'demo.js');
  assert.ok(demo.includes("if (import.meta.env.MODE === 'demo') {"));
  assert.ok(demo.includes("lien.href = './legal/mentions-legales.html';"));
});
