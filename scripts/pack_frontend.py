"""Porte le build Vite dans le composant, sans jeter ce que des clients lisent encore.

Le frontend est servi depuis `custom_components/loggia/frontend/`. Trois regles
tiennent tout ce fichier :

1. Le CSS est INLINE dans `index.html`. Les caches iOS gardent volontiers un
   vieux html ; s'il pointe une feuille de style supprimee, le dashboard s'affiche
   nu. Inline, le html est autonome.

2. La copie est ADDITIVE, jamais un miroir. Un navigateur au cache perime demande
   encore l'ancien `index-<hash>.js` : l'effacer lui donne un ecran blanc. Les
   DEUX derniers de chaque famille restent — celui du jour, et celui d'avant.

   Trois generations pesaient 8 Mo dans le depot pour 1 Mo utile, et chaque
   version en poussait deux de plus, pour toujours (plan du 22/09, point M2).
   Deux suffisent : le cache d'un client ne saute qu'une version a la fois, et
   celui qui en a saute deux recharge la page.

3. Ce que le build ne produit PLUS DU TOUT s'en va, lui, en entier. La regle 2
   garde les deux derniers de chaque famille ; une famille que Vite a cessee de
   produire ne redescend donc jamais sous deux, et restait pour toujours.

   Mesure du 27/09 : `aspirateur-*.js`, `meteo-*.js`, `robot-*.js` (devenu
   `ficherobot-*`) et `boot-*.css` (renomme `index-*.css`) tenaient 160 Ko dans
   chaque installation, cites par aucun fichier du paquet — et reclamant
   eux-memes six chunks absents du dossier : 404 garantis pour le client qui
   les aurait demandes. Meme cause cote fichiers publics, ou la copie ne
   regardait rien du tout : `public/fonts/` a perdu la variante PLEINE des
   icones le 23/09, le paquet la livrait encore, 338 Ko pour rien.

   La regle 2 protege le client d'HIER. Celui d'avant-hier est deja perdu par
   elle — lui garder une famille morte ne le sauve pas, et la fait payer a tout
   le monde, a chaque installation, pour toujours.

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
GARDE = 2


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

    `dist` est purge a chaque compilation depuis le 23/09, mais cette garde
    reste : la copie etait aveugle du temps ou les bundles de toutes les
    compilations passees s'y empilaient — elle emportait ce tas vers le depot,
    d'ou il partait chez chaque utilisateur par HACS. Sept avatars nommes
    d'apres les prenoms du foyer ont voyage ainsi, references par aucune page.

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


def bundles_morts(dossier, vivants):
    """Les bundles du paquet dont le build courant ne produit plus l'equivalent.

    `vivants` vient d'`atteignables` : tout ce que l'`index.html` du jour finit
    par demander. Un fichier qui n'y est pas appartient soit a la generation
    d'avant — qu'on garde (regle 2) —, soit a un module que Vite ne produit plus
    du tout — et celui-la, plus personne ne le nommera jamais.

    Le tri se fait FICHIER PAR FICHIER, et non par « famille » decoupee au
    dernier tiret : un hash Vite peut lui-meme contenir un tiret. Le 27/09, ce
    decoupage rangeait `demo-B6-lYSYp.js` (vivant) et `demo-DpsM1nrN.js` (la
    generation d'avant) dans deux familles differentes, et faisait passer la
    seconde pour morte.

    On essaie donc TOUTES les coupures possibles du nom, de la plus longue a la
    plus courte : si l'une d'elles est aussi le debut d'un fichier vivant de meme
    extension, le module existe encore et le fichier reste. Le doute profite au
    client : on ne retire que ce dont aucune coupure ne repond.

    Rend une liste de noms. Vide quand `vivants` l'est ou vaut None : sans
    reference sure on ne tranche pas, et l'on garde tout.
    """
    if not vivants:
        return []
    morts = []
    for f in sorted(os.listdir(dossier)):
        if f in vivants:
            continue
        suf = next((s for s in ('.js', '.css') if f.endswith(s)), None)
        if suf is None:
            continue
        base = f[:-len(suf)]
        coupures = [base[:i + 1] for i, c in enumerate(base) if c == '-']
        if not coupures:
            continue
        vif = any(v.endswith(suf) and any(v.startswith(p) for p in coupures)
                  for v in vivants)
        if not vif:
            morts.append(f)
    return morts


def renvois_morts(dossier, proteges):
    """Regle 4 : un fichier garde qui en reclame un absent s'en va aussi.

    La regle 2 garde les `GARDE` dernieres generations DE CHAQUE FAMILLE. Elle
    suppose que les familles tournent ensemble — elles ne le font pas. Un
    `wx3d-*` dont le contenu n'a pas bouge garde son empreinte pendant que
    `boot-*`, qui embarque l'ecran, en change a chaque compilation. Au bout de
    quelques versions, le `boot` de la generation precedente — garde — reclame
    un `wx3d` de la generation d'avant — rattrape par la rotation, donc parti.

    Mesure du 27/09 sur le paquet de la v3.76.0 publiee : **36 renvois morts**.
    La generation N-1 existe pour servir le client au cache perime ; une
    generation N-1 trouee ne sert personne, elle lui donne des 404.

    On retire donc, jusqu'a point fixe, tout fichier garde dont une reference
    manque — retirer l'un peut en condamner un autre. La generation VIVANTE est
    protegee : si elle est trouee, c'est la compilation qui est fautive, et le
    refus plus bas le dit deja.
    """
    empreinte = re.compile(
        r'^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*-[A-Za-z0-9_-]{8}\.(?:js|css)$')
    partis = []
    while True:
        presents = set(os.listdir(dossier))
        tour = []
        for f in sorted(presents):
            if f in proteges or not f.endswith(('.js', '.css')):
                continue
            try:
                with io.open(os.path.join(dossier, f), encoding='utf-8', errors='ignore') as fh:
                    refs = re.findall(r'["\'/]([A-Za-z0-9._-]+\.(?:js|css))', fh.read())
            except Exception:
                continue
            # Une reference n'est un renvoi de paquet que si elle porte une
            # empreinte : `index.css` ou `panel.js` ne sont pas des bundles.
            if any(empreinte.match(r) and r not in presents for r in refs):
                tour.append(f)
        if not tour:
            return partis
        for f in tour:
            os.remove(os.path.join(dossier, f))
        partis += tour


def balayer_publics(dist, cible):
    """Retire du paquet les fichiers publics que `public/` ne produit plus.

    Vite recopie `public/` tel quel a la racine de `dist` ; le pack le reportait
    sans jamais rien reprendre. Un fichier retire de `public/` restait donc livre
    a vie — la variante pleine des icones, 338 Ko, cinq semaines apres son
    retrait des sources.

    Le miroir est sans danger ici : ces noms-la sont STABLES (`fonts/fonts.css`,
    `logo.png`, `panel.js`), jamais haches. Aucun client, meme au cache le plus
    perime, ne reclame un nom que la page ne porte plus ; et celui qui garderait
    un html d'avant le retrait a de toute facon perdu ses bundles a la regle 2.

    `assets` et `index.html` ne sont PAS concernes : ils ont leurs propres regles
    (atteignabilite, retenue par famille, style inline).
    """
    intouchables = ('assets', 'index.html')
    attendus = {f for f in os.listdir(dist) if f not in intouchables}
    otes = []
    for f in sorted(os.listdir(cible)):
        if f in intouchables:
            continue
        chemin = os.path.join(cible, f)
        if f not in attendus:
            dossier = os.path.isdir(chemin)
            if dossier:
                shutil.rmtree(chemin)
            else:
                os.remove(chemin)
            otes.append(f + '/' if dossier else f)
            continue
        if not os.path.isdir(chemin):
            continue
        source = os.path.join(dist, f)
        if not os.path.isdir(source):
            continue
        for rep, _, fichiers in os.walk(chemin):
            rel = os.path.relpath(rep, chemin)
            miroir = source if rel == '.' else os.path.join(source, rel)
            for g in sorted(fichiers):
                if not os.path.exists(os.path.join(miroir, g)):
                    os.remove(os.path.join(rep, g))
                    otes.append((f + '/' + g).replace(os.sep, '/'))
    return otes


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

    # Ne recopier que ce qui sert : voir `atteignables`. Le meme ensemble sert
    # plus bas a reconnaitre les familles que le build ne produit plus (regle 3).
    vivants = atteignables(DIST)
    n = copier_arbre(assets_src, assets_dst, vivants)

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

    # ... et retirer ce que `public/` ne contient plus (regle 3).
    publics_otes = balayer_publics(DIST, CIBLE)

    with open(os.path.join(DIST, 'index.html'), encoding='utf-8') as f:
        html = f.read()
    html = inliner_css(html, assets_src)
    # Normalisation : sur une source a fins de ligne Windows, Vite laisse un \r
    # orphelin en retirant la balise <script> d'amorce — une ligne vide que le
    # meme build sous Linux n'a pas. La CI compare les deux au caractere pres :
    # fins de ligne LF et pas de ligne vide, quel que soit l'OS qui packe.
    html = html.replace('\r\n', '\n').replace('\r', '\n')
    html = re.sub(r'\n[ \t]*\n+', '\n', html)
    if '<style>' not in html:
        print('ATTENTION : le CSS n a pas ete inline — feuille de style introuvable')
    with open(os.path.join(CIBLE, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
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

    # TOUTES les familles, pas seulement `index-`.
    #
    # La retenue ne portait que sur `index-*`. Les autres bundles — `boot`,
    # `meteo`, `parametres`, `vacplan`, `wx3d`, `Onboarding`, `en`, `demo` —
    # n'etaient jamais elagues : chaque compilation en deposait une version de
    # plus, et rien ne les reprenait. Mesure du 06/09 : 1 295 fichiers dans
    # `assets`, dont 215 copies de `meteo-*`, 215 de `parametres-*` et 185 de
    # `boot-*`, pour 158 Mo. Tout cela partait chez chaque utilisateur par HACS,
    # et grossissait le depot a chaque version.
    #
    # On decouvre les familles au lieu de les nommer : un nouveau point d'entree
    # ajoute par Vite serait autrement oublie a son tour, en silence.
    familles = set()
    for f in os.listdir(assets_dst):
        for suf in ('.js', '.css'):
            if f.endswith(suf) and '-' in f[:-len(suf)]:
                familles.add((f[:f[:-len(suf)].rindex('-') + 1], suf))
    # Ce que le build ne produit plus du tout s'en va d'abord (regle 3) : la
    # retenue ci-dessous n'a plus alors que des generations a departager.
    morts = bundles_morts(assets_dst, vivants)
    for f in morts:
        os.remove(os.path.join(assets_dst, f))
    efface = []
    for prefixe, suffixe in sorted(familles):
        efface += retenir(assets_dst, prefixe, suffixe, reference)
    # Regle 4, en DERNIER : les deux balayages ci-dessus viennent peut-etre de
    # retirer ce qu'une generation gardee reclamait.
    troues = renvois_morts(assets_dst, reference)
    print('bundle publie       :', ', '.join(sorted(f for f in reference if f.endswith('.js'))))
    print('assets copies       :', n)
    print('fichiers publics    :', autres)
    print('anciens bundles otes:', len(efface), efface if efface else '')
    print('modules disparus    :', len(morts), morts if morts else '')
    print('renvois morts otes  :', len(troues), troues if troues else '')
    print('publics disparus    :', len(publics_otes), publics_otes if publics_otes else '')
    print('cible               :', CIBLE)
    return 0


if __name__ == '__main__':
    sys.exit(main())
