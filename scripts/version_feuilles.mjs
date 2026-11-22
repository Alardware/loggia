/* Les feuilles de `public/` portent la VERSION DE LEUR CONTENU (16/11).
 *
 * Constat, mesuré sur une installation réelle le 16/11 : la page citait `./fonts/fonts.css` et
 * `./fonts/uicons-regular-rounded.css` par une adresse qui ne change jamais, et Home Assistant sert le paquet sans durée de
 * cache (`panel.py`, `cache_headers=False`). Un navigateur décide alors seul : il garde le fichier un dixième de son âge.
 * Une feuille vieille de cinq semaines restait ainsi plus de trois jours en cache après avoir été remplacée — Outfit, la
 * police de Prisme, n'était pas chargée deux jours après l'installation du thème, et un rechargement forcé de la page
 * (Ctrl + F5) n'y changeait rien : il ne rafraîchit pas les feuilles du cadre.
 *
 * Les fichiers que Vite produit n'ont pas ce défaut : leur nom porte une empreinte (`boot-<hash>.js`). Ce greffon donne la
 * même garantie aux feuilles de `public/` : `./fonts/fonts.css` devient `./fonts/fonts.css?v=<empreinte>`. Feuille
 * inchangée, même adresse — le cache sert ; feuille modifiée, adresse nouvelle — tout navigateur la redemande.
 *
 * Ce qui n'est PAS couvert : les polices elles-mêmes (`.woff2`) et les images de `public/`, citées par des noms stables. Une
 * police remplacée sous le même nom resterait en cache ; une police nouvelle porte un nom nouveau, c'est la règle ici.
 *
 * `order: 'post'` : la page a fini de passer par Vite, qui ne voit donc jamais l'adresse avec sa version. Les
 * préchargements de polices d'index.html ne bougent pas : une police se résout depuis sa feuille sans la version de
 * celle-ci, à la même adresse qu'avant (tests/lot14_chargement.test.mjs). */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Un commentaire est sauté, pas retiré ; une balise <link> est lue entière.
const BALISE = /<!--[\s\S]*?-->|<link\b[^>]*>/g;
const FEUILLE = /\bhref="\.\/([^"?#]+\.css)"/;

/** Les huit premiers caractères du SHA-256 : assez pour qu'un contenu changé change d'adresse. */
export const empreinte = (octets) => createHash('sha256').update(octets).digest('hex').slice(0, 8);

/** Pose `?v=<empreinte>` sur chaque feuille de `public/` que la page cite. `lire(chemin)` rend les octets, ou null. */
export function versionnerFeuilles(html, lire) {
  let posees = 0;
  const sortie = html.replace(BALISE, (balise) => {
    if (balise.startsWith('<!--') || !/\brel="stylesheet"/.test(balise)) return balise;
    const m = balise.match(FEUILLE);
    // Une feuille d'`assets/` porte déjà son empreinte dans son nom : Vite s'en charge.
    if (!m || m[1].startsWith('assets/')) return balise;
    const octets = lire(m[1]);
    // Une feuille renommée ou retirée de `public/` ne doit pas repartir sans version, en silence.
    if (!octets) throw new Error('index.html cite ./' + m[1] + ', absent de public/ : la feuille ne peut pas recevoir sa version');
    posees++;
    return balise.replace(m[0], 'href="./' + m[1] + '?v=' + empreinte(octets) + '"');
  });
  if (!posees) throw new Error('index.html ne cite plus aucune feuille de public/ : le greffon des versions ne sert plus à rien, ou son repère a changé');
  return sortie;
}

export function greffonVersionDesFeuilles() {
  let racine = '';
  return {
    name: 'loggia-version-des-feuilles',
    apply: 'build',
    configResolved(c) { racine = c.root; },
    transformIndexHtml: {
      order: 'post',
      handler: (html) => versionnerFeuilles(html, (chemin) => {
        const fichier = join(racine, 'public', chemin);
        return existsSync(fichier) ? readFileSync(fichier) : null;
      }),
    },
  };
}
