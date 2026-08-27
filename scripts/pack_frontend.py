"""Porte le build Vite dans le composant, sans jeter ce que des clients lisent encore.

Le frontend est servi depuis `custom_components/loggia/frontend/`. Deux regles
tiennent tout ce fichier :

1. Le CSS est INLINE dans `index.html`. Les caches iOS gardent volontiers un
   vieux html ; s'il pointe une feuille de style supprimee, le dashboard s'affiche
   nu. Inline, le html est autonome.

2. La copie est ADDITIVE, jamais un miroir. Un navigateur au cache perime demande
   encore l'ancien `index-<hash>.js` : l'effacer lui donne un ecran blanc. Les
   trois derniers de chaque famille restent.

Ce script vivait dans le dossier temporaire du build, que Windows nettoie. Il est
au depot maintenant.
"""
from __future__ import annotations

import io
import os
import re
import shutil
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# `dist` du DEPOT, la ou `npm run build` ecrit. Le defaut a longtemps designe
# `Temp/orion_v2/dist`, l'ancien atelier : un `npm run build` a la racine puis un
# pack empaquetait alors un build etranger, parfois vieux de plusieurs heures. Le
# 27/08/2026 cela a mis en ligne une 2.8.0 dont l'`index.html` reclamait un bundle
# d'avant les corrections — tableau de bord mort chez l'utilisateur.
DIST = os.environ.get('LOGGIA_DIST', os.path.join(RACINE, 'dist'))
CIBLE = os.path.join(RACINE, 'custom_components', 'loggia', 'frontend')
GARDE = 3


def verifier_fraicheur(dist, racine):
    """Refuse un build plus vieux que les sources. Rend un message, ou None.

    Le pack est silencieux par nature : il copie ce qu'on lui donne. Sans cette
    garde, un `dist` perime passe toutes les etapes suivantes — lint, tests et CI
    portent sur les sources, jamais sur le bundle.
    """
    index = os.path.join(dist, 'index.html')
    if not os.path.exists(index):
        return 'aucun index.html dans ' + dist + ' — lancer `npm run build`'

    bati = os.path.getmtime(index)
    plus_recent, quand = None, 0
    for rep, _, fichiers in os.walk(os.path.join(racine, 'src')):
        for f in fichiers:
            if not f.endswith(('.js', '.jsx', '.css')):
                continue
            t = os.path.getmtime(os.path.join(rep, f))
            if t > quand:
                plus_recent, quand = os.path.join(rep, f), t

    if plus_recent and quand > bati:
        return ('build perime : ' + os.path.relpath(plus_recent, racine) +
                ' a change apres le dernier `npm run build` — rebatir avant de packer')
    return None


def inliner_css(html, dossier_assets):
    """Remplace la feuille de style par son contenu."""
    m = re.search(r'\s*<link rel="stylesheet"[^>]*href="\./assets/(index-[^"]+\.css)"[^>]*>', html)
    if not m:
        return html
    chemin = os.path.join(dossier_assets, m.group(1))
    with open(chemin, encoding='utf-8') as f:
        css = f.read()
    return html[:m.start()] + '\n  <style>' + css + '</style>' + html[m.end():]


def retenir(dossier, prefixe, suffixe, proteges=()):
    """Supprime les bundles au-dela des `GARDE` plus recents. Rend les effaces.

    `proteges` liste ce que l'`index.html` courant reference. Sans cette garde, la
    rentention a efface le bundle du jour : `shutil.copyfile` ne reporte pas les
    dates, tous les fichiers venaient d'etre ecrits a la meme seconde, et « les
    trois plus recents » ne voulait plus rien dire.
    """
    def famille(f):
        return f.startswith(prefixe) and f.endswith(suffixe)

    fichiers = [f for f in os.listdir(dossier) if famille(f) and f not in proteges]
    fichiers.sort(key=lambda f: os.path.getmtime(os.path.join(dossier, f)), reverse=True)
    # Les proteges comptent dans le quota, mais SEULS ceux de cette famille : sinon
    # `vendor` et les images, proteges eux aussi, epuiseraient le quota des `index-*`.
    deja = sum(1 for f in proteges if famille(f))
    efface = []
    for f in fichiers[max(GARDE - deja, 0):]:
        os.remove(os.path.join(dossier, f))
        efface.append(f)
    return efface


def atteignables(dist):
    """Les fichiers que `index.html` finit par demander, de proche en proche.

    Vite compile avec `emptyOutDir: false` : le dossier de sortie n'est jamais
    purge, et les bundles de toutes les compilations passees s'y empilent. La
    copie etait aveugle — elle emportait ce tas vers le depot, d'ou il partait
    chez chaque utilisateur par HACS. Sept avatars nommes d'apres les prenoms du
    foyer ont voyage ainsi, references par aucune page.

    On suit donc les references en cascade : le HTML, puis les js et les css
    qu'il tire. Ce qui n'est atteignable par aucun chemin ne sert a personne.

    Renvoie None quand `index.html` manque : sans lui on ne peut rien trancher,
    et mieux vaut trop copier que casser le paquet.
    """
    index = os.path.join(dist, 'index.html')
    if not os.path.exists(index):
        return None
    vus, a_voir = set(), []
    with io.open(index, encoding='utf-8') as fh:
        a_voir += re.findall(r'assets/([A-Za-z0-9._-]+)', fh.read())
    while a_voir:
        f = a_voir.pop()
        if f in vus:
            continue
        vus.add(f)
        p = os.path.join(dist, 'assets', f)
        if os.path.exists(p) and f.endswith(('.js', '.css')):
            try:
                with io.open(p, encoding='utf-8', errors='ignore') as fh:
                    a_voir += re.findall(
                        r'["\'/]([A-Za-z0-9._-]+\.(?:js|css|jpg|jpeg|png|webp|svg|woff2?))',
                        fh.read())
            except Exception:
                pass
    return vus


def copier_arbre(src, dst, garder=None):
    n = 0
    for racine, _, fichiers in os.walk(src):
        rel = os.path.relpath(racine, src)
        cible = dst if rel == '.' else os.path.join(dst, rel)
        os.makedirs(cible, exist_ok=True)
        for f in fichiers:
            if garder is not None and rel == '.' and f not in garder:
                continue
            # `copy2` et non `copyfile` : la date de chaque fichier sert a decider
            # quels bundles garder.
            shutil.copy2(os.path.join(racine, f), os.path.join(cible, f))
            n += 1
    return n


def main():
    if not os.path.isdir(DIST):
        print('build introuvable :', DIST)
        return 1

    souci = verifier_fraicheur(DIST, RACINE)
    if souci and os.environ.get('LOGGIA_PACK_FORCE') != '1':
        print('REFUS :', souci)
        print('        (LOGGIA_PACK_FORCE=1 passe outre)')
        return 1

    assets_src = os.path.join(DIST, 'assets')
    assets_dst = os.path.join(CIBLE, 'assets')
    os.makedirs(assets_dst, exist_ok=True)

    # Ne recopier que ce qui sert : voir `atteignables`.
    n = copier_arbre(assets_src, assets_dst, atteignables(DIST))

    # Tout ce que Vite a copie depuis `public/` : polices, logo, images.
    autres = 0
    for f in os.listdir(DIST):
        chemin = os.path.join(DIST, f)
        if f in ('assets', 'index.html'):
            continue
        if os.path.isdir(chemin):
            autres += copier_arbre(chemin, os.path.join(CIBLE, f))
        else:
            shutil.copyfile(chemin, os.path.join(CIBLE, f))
            autres += 1

    with open(os.path.join(DIST, 'index.html'), encoding='utf-8') as f:
        html = f.read()
    html = inliner_css(html, assets_src)
    if '<style>' not in html:
        print('ATTENTION : le CSS n a pas ete inline — feuille de style introuvable')
    with open(os.path.join(CIBLE, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)

    # Ce que le html qu'on vient d'ecrire demande : intouchable.
    reference = set(re.findall(r'\./assets/([A-Za-z0-9_.-]+)', html))

    # Le html demande-t-il des fichiers qu'on n'a pas poses ? Un paquet qui se
    # reclame d'un bundle absent donne un ecran blanc, et rien avant cette ligne
    # ne le voit : lint, tests et CI lisent les sources, pas le paquet.
    manquants = sorted(f for f in reference
                       if not os.path.exists(os.path.join(assets_dst, f)))
    if manquants:
        print('REFUS : le html reclame des fichiers absents du paquet :', manquants)
        return 1

    efface = (retenir(assets_dst, 'index-', '.js', reference)
              + retenir(assets_dst, 'index-', '.css', reference))
    print('bundle publie       :', ', '.join(sorted(f for f in reference if f.endswith('.js'))))
    print('assets copies       :', n)
    print('fichiers publics    :', autres)
    print('anciens bundles otes:', len(efface), efface if efface else '')
    print('cible               :', CIBLE)
    return 0


if __name__ == '__main__':
    sys.exit(main())
