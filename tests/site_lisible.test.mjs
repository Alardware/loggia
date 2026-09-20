// ─────────────────────────────────────────────────────────────────────────────
// Le site en ligne, lisible par tous — et par ce qui n'a pas d'yeux (ADR 0063).
//
// Deux publics que la démo oubliait :
//
//   - un moteur de recherche ou un agent IA, qui n'exécute pas JavaScript et ne
//     voyait qu'un `<div id="root">` vide. Le site reçoit une description, des
//     données structurées, un contenu de repli, un `llms.txt`, un plan du site —
//     par le greffon `siteEnLigne`, donc JAMAIS dans le paquet HACS ;
//   - un lecteur d'écran, qui saute de titre en titre et lit le nom des images.
//     L'Accueil n'avait aucun titre ; les caméras et les icônes météo, aucun nom.
//
// Les pages légales ont leur propre fichier (pages_legales.test.mjs).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const SITE = 'https://alardware.github.io/loggia/';
const LEGALES = readdirSync(join(RACINE, 'site', 'legal')).filter((n) => n.endsWith('.html')).sort();

function sources(dir = join(RACINE, 'src'), out = []) {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.jsx$/.test(nom)) out.push(p);
  }
  return out;
}

test('la page du paquet HACS reste nue : tout ce qui suit ne vit que sur le site', () => {
  const index = lire('index.html');
  // Les trois repères que le greffon remplace. S'ils bougent, il lève une erreur.
  for (const m of ['<title>Loggia</title>', '</head>', '<div id="root"></div>']) assert.ok(index.includes(m), 'repère disparu : ' + m);
  assert.ok(!/noscript|ld\+json|og:title|rel="canonical"/.test(index), 'la page servie par Home Assistant n’a pas besoin du référencement');
  const vite = lire('vite.config.js');
  assert.ok(vite.includes("transformIndexHtml: {") && vite.includes("order: 'pre',"));
  assert.ok(vite.includes("gabarit('_tete.html').replace('{{version}}', version)") && vite.includes("gabarit('_sans-script.html')"));
  assert.ok(vite.includes("filter: (src) => !basename(src).startsWith('_')"), 'un gabarit s’injecte, il ne se copie pas');
  assert.ok(vite.includes("if (mode === 'demo') config.plugins.push(siteEnLigne);"));
});

test('l’en-tête du site : une description, une adresse canonique, des données structurées valides', () => {
  const t = lire('site', '_tete.html');
  const desc = (t.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
  assert.ok(desc.length >= 70 && desc.length <= 200, 'description de ' + desc.length + ' caractères');
  assert.ok(t.includes('<link rel="canonical" href="' + SITE + '" />'));
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:locale']) assert.ok(t.includes('property="' + p + '"'), p);
  // Rien ne se CHARGE d'ailleurs : l'adresse canonique et l'image de partage
  // sont des adresses du site lui-même, l'icône est relative.
  for (const m of t.matchAll(/<(?:link|script|img)\b[^>]*(?:href|src)="(https?:[^"]+)"/g)) assert.ok(m[1].startsWith(SITE), 'ressource externe : ' + m[1]);
  const brut = (t.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/) || [])[1];
  const ld = JSON.parse(brut.replace('{{version}}', '1.2.3'));
  assert.equal(ld['@type'], 'SoftwareApplication');
  assert.equal(ld.softwareVersion, '1.2.3', 'la version vient de package.json, à la construction');
  assert.equal(ld.offers.price, '0');
  assert.equal(ld.isAccessibleForFree, true);
  assert.equal(ld.author.name, 'Guillaume Alard');
  assert.ok(ld.license.endsWith('/LICENSE'));
});

test('sans JavaScript, la page dit ce qu’est Loggia et où aller — en français et en anglais', () => {
  const n = lire('site', '_sans-script.html');
  assert.ok(n.startsWith('<noscript>') && n.trimEnd().endsWith('</noscript>'));
  assert.equal(n.split('<h1').length - 1, 1);
  assert.ok(n.includes('<div lang="fr">') && n.includes('<div lang="en"'));
  assert.ok(n.includes('href="https://github.com/Alardware/loggia"'));
  for (const p of LEGALES) assert.ok(n.includes('href="./legal/' + p + '"'), 'page légale absente du repli : ' + p);
  assert.ok(!/<script|<img|<iframe/i.test(n), 'le repli ne charge rien');
});

test('llms.txt et le plan du site nomment chaque page', () => {
  const l = lire('site', 'llms.txt');
  assert.ok(l.startsWith('# Loggia\n') || l.startsWith('# Loggia\r\n'), 'un titre de niveau 1 en tête');
  assert.match(l, /^> .{80,}/m, 'un résumé en citation');
  assert.ok(l.includes('](https://github.com/Alardware/loggia)') && l.includes('](' + SITE + ')'));
  const plan = lire('site', 'sitemap.xml');
  assert.ok(plan.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(plan.includes('<loc>' + SITE + '</loc>'));
  for (const p of LEGALES) {
    assert.ok(l.includes('](' + SITE + 'legal/' + p + ')'), 'llms.txt oublie ' + p);
    assert.ok(plan.includes('<loc>' + SITE + 'legal/' + p + '</loc>'), 'le plan du site oublie ' + p);
  }
  assert.equal(plan.split('<loc>').length - 1, LEGALES.length + 1, 'le plan du site nomme une page qui n’existe plus');
});

test('chaque vue a un titre, et l’Accueil des titres de section', () => {
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes("<h1 className=\"o-vh\">{tr('Accueil')}</h1>"), 'l’Accueil n’a plus de titre de page');
  assert.ok(lire('src', 'index.css').includes('.o-vh { position: absolute !important; width: 1px; height: 1px;'), 'lu, pas vu');
  assert.ok(!app.includes('<div style={sectionTitle}>'), 'un titre de section est redevenu un simple bloc');
  assert.equal(app.split('<h2 style={sectionTitle}>').length - 1, 5);
  // Un h2 sans ces deux annulations changerait de taille et de marge à l'œil.
  assert.ok(app.includes("const sectionTitle = { margin: 0, fontWeight: 400,"));
});

test('aucune image sans texte alternatif, et celles qui disent quelque chose ont un nom', () => {
  for (const p of sources()) {
    const s = readFileSync(p, 'utf8');
    // Jusqu'au `/>` : un `=>` dans un attribut fermerait trop tôt une regex naïve.
    // L'espace écarte les `<img>` cités dans un commentaire.
    for (const m of s.matchAll(/<img\s/g)) {
      const balise = s.slice(m.index, s.indexOf('/>', m.index) + 2);
      assert.ok(/\salt=/.test(balise), p + ' : <img> sans alt — ' + balise.slice(0, 70));
    }
  }
  // Le flux d'une caméra porte le nom de la caméra, sous ses trois formes.
  const cam = lire('src', 'camera.jsx');
  assert.ok(cam.includes("const dit = nom ? tr('Caméra {x}, en direct', { x: nom }) : tr('Flux de la caméra');"));
  assert.ok(cam.includes('<video ref={vidRef} aria-label={dit}') && cam.includes('<img ref={imgRef} alt={dit}') && cam.includes('kind="camera" alt={dit} />'));
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes('online={c.online} nom={c.label} />') && app.includes('online={online} nom={nom} />'), 'les tuiles ne donnent plus le nom de la caméra');
  // L'icône météo dit la condition — plus « météo », et jamais alt vide + étiquette.
  const wx = lire('src', 'wxutil.jsx');
  assert.ok(wx.includes('<img src={src} alt={nom}') && wx.includes('role="img" aria-label={nom}'));
  assert.ok(!wx.includes("aria-label={tr('météo')}") && !/alt=""\s+aria-label/.test(wx));
  const en = lire('src', 'langues', 'en.js');
  for (const c of ["'Tornade':", "'Lever du soleil':", "'Coucher du soleil':", "'Caméra {x}, en direct':"]) assert.ok(en.includes(c), 'traduction absente : ' + c);
});

test('l’audit de contraste se rejoue : ?theme= dans la démo', () => {
  const main = lire('src', 'main.jsx');
  assert.ok(main.includes("const th = q.get('theme');"));
  assert.ok(main.includes("if (th != null && /^[a-z]{0,20}$/.test(th)) localStorage.setItem('loggia-theme', th);"));
});
