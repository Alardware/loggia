"""Les alertes du telephone parlent la langue du serveur — sur le VRAI catalogue (05/10).

`textes_catalogue.py` est genere depuis les catalogues de l'ecran, et le test
JS le compare octet par octet. Mais rien ne reliait ce que alertes.py et
veilles.py ENVOIENT a ce catalogue : « Fumée détectée » retouche en
« Fumée détectée ! » dans le code, tout restait vert, et `traduire()`
retombait en silence sur le gabarit francais. Un Allemand recevait l'alerte
fumee en francais (audit de Luna, point 1 du groupe textes_vacplan).

Ici, sans monkeypatch : la liste de TOUS les gabarits que le code envoie —
tables comme BINAIRES, constantes `MSG_*` et `TITRE` de niveau module, lues
sur les envois eux-memes avec les `gabarit()` de leur chemin —, chacun
cherche dans chaque langue du vrai `TEXTES` ; une garde de syntaxe qui
n'ADMET dans un appel d'envoi que ces noms-la ; et des envois reels, Home
Assistant en allemand, sur chaque chemin.

La garde etait une liste noire (05/10, relecture du lot 16) : un TITRE propre
aux veilles, un `MSG_*` pose DANS une fonction, une seconde table comme
BINAIRES, un gabarit rendu par un appel (`"".join(…)`, `_gab()`) passaient,
huit tests verts et l'Allemand servi en francais. Elle est devenue une liste
blanche, et chaque echec dit quoi faire. Le contre-examen du meme jour en a
ferme huit de plus, que la premiere liste blanche laissait passer : un relais
hors ENVOIS, un `prevenir` direct sans `gabarit()`, un alias, un mot ecrit
dans un argument, une table changee apres l'import, un `global`, et deux
facons de parler au telephone depuis nuit.py.
"""
from __future__ import annotations

import ast
import asyncio
import re
from collections import Counter
from typing import NamedTuple

import pytest
from conftest import COMPOSANT, RACINE, FauxStore, charger

LANGUES = {"en", "de", "nl", "it", "es", "pl"}
REPERE = re.compile(r"\{\w+\}")
# Les seuls noms de module qu'un appel d'envoi peut citer : la liste des
# gabarits les lit, et eux seuls (05/10).
CONSTANTE = re.compile(r"^(TITRE|MSG_\w+)$")
QUOI_FAIRE = ("un texte qui part au telephone vit dans une constante de MODULE `MSG_*` "
              "(ou `TITRE`), ou dans une table `{cle: (categorie, message)}` comme BINAIRES ; "
              "sa cle va dans CLES_TELEPHONE (scripts/textes_serveur.mjs) et dans les sept "
              "catalogues de src/langues, puis `node scripts/textes_serveur.mjs`. Ses arguments "
              "({nom}, {v}) sont des donnees de Home Assistant, jamais un mot ecrit ici ; il part "
              "par un appel direct a une fonction d'ENVOIS, et une constante ne change plus apres "
              "l'import")


def lancer(coro):
    return asyncio.run(coro)


def reperes(texte: str) -> list[str]:
    return sorted(REPERE.findall(texte))


def _table(val) -> bool:
    """Une table de messages : `{cle: (categorie, …, message)}`, des chaines."""
    return (isinstance(val, dict) and bool(val)
            and all(isinstance(t, tuple) and len(t) >= 2 and all(isinstance(x, str) for x in t)
                    for t in val.values()))


def tables_de_messages(module) -> dict[str, list[str]]:
    """TOUTES les tables du module, pas seulement BINAIRES : une seconde
    (`SABOTAGE = {"tamper": ("fumee", "Sabotage détecté")}`) partait en
    francais sans qu'aucune liste ne la lise (05/10). Le message est le
    DERNIER element, celui que la garde laisse deballer."""
    return {k: [t[-1] for t in v.values()] for k, v in sorted(vars(module).items()) if _table(v)}


def gabarits_de(nom: str) -> list[str]:
    """Les cles que `nom`.py envoie VRAIMENT : chaque constante ou table citee
    par un envoi, avec autant de `gabarit()` que son chemin jusqu'a
    `prevenir` en traverse. La liste supposait que tout MSG_* d'alertes.py
    passait par `_envoyer` : un `prevenir(…, (MSG_ALARME, …))` direct
    envoyait « Alarme déclenchée », cle absente, en francais (05/10). Le
    TITRE des veilles et une seconde table comme BINAIRES y entrent aussi."""
    module = charger(nom)
    tables = tables_de_messages(module)
    out = []
    for cle, n in sorted(juger(nom)[1]):
        assert cle in tables or isinstance(vars(module).get(cle), str), f"{nom}.{cle} : ni texte ni table"
        for texte in tables.get(cle) or [vars(module)[cle]]:
            for _ in range(n):
                texte = module.gabarit(texte)
            out.append(texte)
    return out


# Les modules qui parlent au telephone, regles mis a part (le socle).
MODULES = ("alertes", "veilles")


def gabarits_produits() -> list[str]:
    return [g for nom in MODULES for g in gabarits_de(nom)]


def litteraux_js(src: str, debut: str) -> list[str]:
    """Les chaines du tableau JS ouvert par `debut`, jusqu'a SON crochet :
    commentaires sautes, guillemets simples, doubles ou obliques. A
    l'expression reguliere, `// l'ordre n'importe pas` dans le tableau faisait
    echouer le test sous un faux motif (05/10)."""
    i, out = src.index(debut) + len(debut), []
    while True:
        assert i < len(src), "tableau JS jamais ferme apres " + debut
        if src.startswith("//", i):
            fin = src.find("\n", i)
            i = len(src) if fin < 0 else fin
        elif src.startswith("/*", i):
            fin = src.find("*/", i + 2)
            assert fin >= 0, "commentaire jamais ferme dans " + debut
            i = fin + 2
        elif src[i] in "'\"`":
            q, j, buf = src[i], i + 1, []
            while src[j] != q:
                if src[j] == "\\":
                    e = src[j + 1]
                    if e == "u":
                        buf.append(chr(int(src[j + 2:j + 6], 16)))
                        j += 6
                        continue
                    buf.append({"n": "\n", "t": "\t"}.get(e, e))
                    j += 2
                else:
                    buf.append(src[j])
                    j += 1
            texte = "".join(buf)
            assert not (q == "`" and "${" in texte), "une cle du telephone est un texte fixe : " + texte
            out.append(texte)
            i = j + 1
        elif src[i] == "]":
            return out
        else:
            i += 1


def cles_telephone() -> list[str]:
    """La liste que le generateur recopie (scripts/textes_serveur.mjs)."""
    src = (RACINE / "scripts" / "textes_serveur.mjs").read_text(encoding="utf-8")
    return litteraux_js(src, "export const CLES_TELEPHONE = [")


def test_la_lecture_du_tableau_js_ne_se_laisse_pas_pieger():
    src = ("export const CLES_TELEPHONE = [\n  // l'ordre n'importe pas ];\n  'a : {nom}',\n"
           "  \"l’air\", /* ]; ' */ 'd\\'e', `f`,\n];\nconst AUTRE = ['g'];")
    assert litteraux_js(src, "export const CLES_TELEPHONE = [") == ["a : {nom}", "l’air", "d'e", "f"]


# ── Le catalogue reel ───────────────────────────────────────────────────────

def test_les_gabarits_produits_sont_ceux_que_recopie_le_generateur():
    """Ensembles, pas un compte fige : deux device_class peuvent partager un
    message (smoke et safety partagent deja la categorie), et le nombre n'a
    rien a dire de plus que les deux listes (05/10)."""
    produits, cles = set(gabarits_produits()), cles_telephone()
    assert produits, "aucun gabarit lu dans alertes.py ni veilles.py : la lecture est cassee"
    assert len(cles) == len(set(cles)), "une cle en double dans CLES_TELEPHONE : " + str(
        sorted(k for k, n in Counter(cles).items() if n > 1))
    manquent = sorted(produits - set(cles))
    assert not manquent, (f"envoye par le code, absent de CLES_TELEPHONE — il partirait en "
                          f"francais : {manquent}. Ajouter la cle a scripts/textes_serveur.mjs et "
                          "aux sept catalogues, puis node scripts/textes_serveur.mjs")
    morts = sorted(set(cles) - produits)
    # Un envoi que la garde refuse ne compte pas : c'est lui qu'il faut lire d'abord.
    refus = [(nom, f, ligne, r) for nom in MODULES for f, ligne, r in juger(nom)[0] if r]
    assert not morts, (f"dans CLES_TELEPHONE, plus envoye par le code : {morts}. "
                       + (f"D'abord les envois que la garde refuse : {refus}. " if refus else "")
                       + "Message retouche ? renommer la cle partout ; envoi retire ? retirer la cle")


def test_chaque_gabarit_a_sa_traduction_dans_chaque_langue():
    textes = charger("textes")
    assert LANGUES <= set(textes.TEXTES), sorted(textes.TEXTES)
    manques = []
    for langue in sorted(textes.TEXTES):
        cat = textes.TEXTES[langue]
        for g in gabarits_produits():
            v = cat.get(g)
            if not isinstance(v, str) or not v.strip():
                manques.append((langue, g, v))
            elif reperes(v) != reperes(g):
                manques.append((langue, g, "reperes " + str(reperes(v))))
            elif v == g:
                manques.append((langue, g, "laisse en francais"))
    assert manques == [], manques


def test_traduire_ne_rend_jamais_le_francais_hors_du_francais():
    textes = charger("textes")
    for g in gabarits_produits():
        args = {k[1:-1]: "Kueche" for k in reperes(g)}
        fr = textes.rendre_fr((g, args))
        for langue in sorted(LANGUES):
            assert textes.traduire((g, args), langue) != fr, (langue, g)


# ── Aucun appel d'envoi ne cite autre chose que les constantes lues ─────────

# Le rang du message dans chaque appel qui part au telephone (self exclu).
ENVOIS = {"_envoyer": 2, "_async_prevenir": 1, "prevenir": 2}
FONCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
# Ce qui change une table apres l'import : la liste la lit A L'IMPORT.
MUTANTS = {"update", "setdefault", "pop", "popitem", "clear", "__setitem__", "__delitem__"}


def _noeuds(racines):
    """Les noeuds d'UNE portee : on ne descend pas dans une fonction
    imbriquee, qui a la sienne. A l'echelle du module, un `message = "…"`
    ecrit dans une methode sans rapport faisait echouer l'appel d'une autre
    (05/10)."""
    pile = list(racines)
    while pile:
        n = pile.pop()
        if isinstance(n, FONCTIONS):
            continue
        yield n
        pile.extend(ast.iter_child_nodes(n))


def _portees(arbre: ast.Module):
    """(nom de la fonction, parametres, noeuds) de chaque portee ; le module
    n'a pas de nom (None), une lambda non plus ("")."""
    yield None, set(), list(_noeuds(arbre.body))
    for f in ast.walk(arbre):
        if isinstance(f, FONCTIONS):
            a = f.args
            params = {x.arg for x in a.posonlyargs + a.args + a.kwonlyargs}
            params |= {x.arg for x in (a.vararg, a.kwarg) if x}
            corps = [f.body] if isinstance(f, ast.Lambda) else f.body
            yield getattr(f, "name", ""), params, list(_noeuds(corps))


def _tables_ecrites(arbre: ast.Module) -> set[str]:
    """Les tables de messages ecrites au niveau du module (vue de la syntaxe)."""
    out = set()
    for n in arbre.body:
        cible = n.targets[0] if isinstance(n, ast.Assign) and len(n.targets) == 1 else getattr(n, "target", None)
        val = getattr(n, "value", None)
        if (isinstance(n, (ast.Assign, ast.AnnAssign)) and isinstance(cible, ast.Name)
                and isinstance(val, ast.Dict) and val.values
                and all(isinstance(t, ast.Tuple) and len(t.elts) >= 2
                        and all(isinstance(x, ast.Constant) and isinstance(x.value, str) for x in t.elts)
                        for t in val.values)):
            out.add(cible.id)
    return out


def _chaine(v: ast.AST) -> bool:
    """`v` vaut-il un texte ecrit a la main ? « … », f« … », « … » + x,
    « a » if c else « b », x or « … » — pas un `.get("friendly_name")`, qui
    n'en LIT qu'un."""
    if isinstance(v, ast.Constant):
        return isinstance(v.value, str)
    if isinstance(v, ast.JoinedStr):
        return True
    if isinstance(v, ast.BinOp) and isinstance(v.op, ast.Add):
        return _chaine(v.left) or _chaine(v.right)
    if isinstance(v, ast.IfExp):
        return _chaine(v.body) or _chaine(v.orelse)
    if isinstance(v, ast.BoolOp):
        return any(_chaine(x) for x in v.values)
    return False


class Portee(NamedTuple):
    fonction: str | None
    params: set
    lies: Counter
    deballes: Counter
    sources: dict
    valeurs: dict
    globaux: set
    fonctions: set
    cites: list
    relais: dict


def _arguments(elts: list, p: Portee) -> list[str]:
    """Les arguments d'un gabarit (`{"nom": …}`) : des donnees de Home
    Assistant, jamais un mot ecrit ici. `nom = … or "appareil inconnu"`
    partait en francais dans un message allemand, et les envois reels, qui
    ont tous un friendly_name, restaient verts (05/10)."""
    out = []
    for d in elts:
        if not (isinstance(d, ast.Dict) and all(isinstance(k, ast.Constant) for k in d.keys)):
            out.append(ast.unparse(d) + " : les arguments s'ecrivent en dict")
            continue
        for v in d.values:
            nom = v.id if isinstance(v, ast.Name) else None
            if _chaine(v) or (nom and nom not in p.params and any(_chaine(x) for x in p.valeurs.get(nom, ()))):
                out.append(ast.unparse(v) + " : un mot ecrit ici, dans un argument")
    return out


def _refus(e: ast.AST, p: Portee, cible: str, ligne: int, n: int = 0) -> list[str]:
    """Ce que la liste blanche refuse dans le message `e` (vide : admis).
    `n` compte les `gabarit()` deja traverses."""
    if isinstance(e, ast.List):
        return [r for x in e.elts for r in _refus(x, p, cible, ligne, n)]
    if isinstance(e, ast.Tuple) and e.elts:
        return _arguments(e.elts[1:], p) + _refus(e.elts[0], p, cible, ligne, n)
    if (isinstance(e, ast.Call) and isinstance(e.func, ast.Name) and e.func.id == "gabarit"
            and "gabarit" in p.fonctions and len(e.args) == 1 and not e.keywords):
        return _refus(e.args[0], p, cible, ligne, n + 1)
    if isinstance(e, ast.Name):
        nom = e.id
        fixe = p.fonction is None or (not p.lies[nom] and nom not in p.params)
        if CONSTANTE.match(nom) and nom in p.globaux and fixe:
            p.cites.append((nom, cible, n, ligne))
            return []
        # Un relais : le parametre `message` d'une fonction d'ENVOIS, que la
        # garde juge a CHAQUE appel. Celui d'une autre fonction (`_signaler(
        # self, texte)`) laissait passer `_signaler("Air vicié")` (05/10).
        if nom == "message" and p.fonction in ENVOIS and nom in p.params and not p.lies[nom]:
            p.relais.setdefault(p.fonction, set()).add((cible, n))
            return []
        if nom not in p.params and p.lies[nom] and p.lies[nom] == p.deballes[nom]:
            p.cites.extend((src, cible, n, ligne) for src in p.sources[nom])
            return []
    return [ast.unparse(e)]


def _resoudre(cible: str, n: int, relais: dict, vus=()) -> set[int]:
    """Combien de `gabarit()` un texte cite dans un appel a `cible` traverse
    avant `prevenir` (vide : il n'y arrive jamais)."""
    if cible == "prevenir":
        return {n}
    if cible in vus:
        return set()
    return {m for c, k in relais.get(cible, ()) for m in _resoudre(c, n + k, relais, (*vus, cible))}


def _hors_appel(arbre: ast.Module, tables: set[str]) -> list:
    """Ce que la garde ne saurait pas lire : un envoi par un alias ou un
    `getattr`, une constante re-liee par `global`, une table changee apres
    l'import. Les quatre passaient, la liste lisant les tables A L'IMPORT
    et la garde ne jugeant que les appels nommes (05/10)."""
    appeles = {id(n.func) for n in ast.walk(arbre) if isinstance(n, ast.Call)}
    out = []
    for n in ast.walk(arbre):
        nom = n.attr if isinstance(n, ast.Attribute) else (n.id if isinstance(n, ast.Name) else None)
        if nom in ENVOIS and id(n) not in appeles:
            out.append(("alias", n.lineno, [ast.unparse(n) + " : un envoi se fait par un appel direct"]))
        elif isinstance(n, ast.Constant) and n.value in ENVOIS:
            out.append(("getattr", n.lineno, [repr(n.value) + " : un envoi se nomme dans le code"]))
        elif isinstance(n, ast.Global):
            fixes = [x for x in n.names if CONSTANTE.match(x) or x in tables]
            if fixes:
                out.append(("global", n.lineno, [f"global {', '.join(fixes)} : une constante ne change pas"]))
        elif (isinstance(n, (ast.Subscript, ast.Attribute)) and isinstance(n.value, ast.Name)
              and n.value.id in tables
              and (not isinstance(n.ctx, ast.Load) if isinstance(n, ast.Subscript) else n.attr in MUTANTS)):
            out.append(("table", n.lineno, [ast.unparse(n) + " : une table s'ecrit d'un bloc"]))
    return out


def juger_source(source: str):
    """(appels, envoyes, ecrits) : chaque appel d'envoi et ce qu'il refuse ;
    les (constante ou table, nombre de gabarit()) qui arrivent a `prevenir` ;
    les noms ecrits au niveau du module. LISTE BLANCHE : le gabarit (tete
    du tuple, ou chaque element d'une liste) doit etre
      * une constante de module `MSG_*` / `TITRE`, jamais re-liee dans la portee ;
      * le parametre `message` d'une fonction d'ENVOIS, jamais re-lie (un relais) ;
      * le DERNIER nom de `cat, msg = TABLE[cle]`, TABLE etant une table du module ;
      * `gabarit(<l'un d'eux>)` ;
    et ses arguments, un dict sans mot ecrit ici. Tout le reste — litteral,
    f-chaine, variable locale, `MSG_*` local, attribut, `"".join(…)`, appel
    quelconque, relais d'une fonction hors ENVOIS — est refuse (05/10)."""
    arbre = ast.parse(source)
    globaux = {c.id for n in arbre.body if isinstance(n, (ast.Assign, ast.AnnAssign))
               for c in (n.targets if isinstance(n, ast.Assign) else [n.target]) if isinstance(c, ast.Name)}
    fonctions = {n.name for n in arbre.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    tables = _tables_ecrites(arbre)
    appels, cites, relais = _hors_appel(arbre, tables), [], {}
    for fonction, params, noeuds in _portees(arbre):
        lies, deballes, sources, valeurs = Counter(), Counter(), {}, {}
        for n in noeuds:
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
                lies[n.id] += 1
            if isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.NamedExpr)) and n.value is not None:
                for c in (n.targets if isinstance(n, ast.Assign) else [n.target]):
                    if isinstance(c, ast.Name):
                        valeurs.setdefault(c.id, []).append(n.value)
            if (isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Tuple)
                    and n.targets[0].elts and isinstance(n.targets[0].elts[-1], ast.Name)
                    and isinstance(n.value, ast.Subscript) and isinstance(n.value.value, ast.Name)
                    and n.value.value.id in tables):
                nom = n.targets[0].elts[-1].id
                deballes[nom] += 1
                sources.setdefault(nom, set()).add(n.value.value.id)

        portee = Portee(fonction, params, lies, deballes, sources, valeurs, globaux, fonctions, cites, relais)
        for n in noeuds:
            if not isinstance(n, ast.Call):
                continue
            nom = n.func.attr if isinstance(n.func, ast.Attribute) else getattr(n.func, "id", None)
            if nom not in ENVOIS:
                continue
            rang = ENVOIS[nom]
            if any(isinstance(x, ast.Starred) for x in n.args[:rang + 1]) or any(k.arg is None for k in n.keywords):
                appels.append((nom, n.lineno, ["*args / **kw : le message ne se lit plus"]))
                continue
            cibles = [n.args[rang]] if len(n.args) > rang else []
            cibles += [k.value for k in n.keywords if k.arg in ("message", "titre")]
            if not any(k.arg == "message" for k in n.keywords) and len(n.args) <= rang:
                appels.append((nom, n.lineno, ["message introuvable"]))
                continue
            appels.append((nom, n.lineno, [r for c in cibles for r in _refus(c, portee, nom, n.lineno)]))

    envoyes = set()
    for cle, cible, n, ligne in cites:
        arrivees = _resoudre(cible, n, relais)
        if not arrivees:
            appels.append((cible, ligne, [f"{cle} : {cible} n'arrive jamais a prevenir dans ce module"]))
        envoyes |= {(cle, m) for m in arrivees}
    return appels, envoyes, globaux | tables


def juger(nom: str):
    return juger_source((COMPOSANT / f"{nom}.py").read_text(encoding="utf-8"))


ADMIS = '''
TITRE = "Loggia — sûreté"
MSG_A = "Alarme"
BINAIRES = {"smoke": ("fumee", "Fumée détectée")}
def gabarit(m):
    return m + " : {nom}"
class X:
    async def _on(self, new, dc):
        cat, msg = BINAIRES[dc]
        await self._envoyer(new, cat, msg)
        await self._envoyer(new, "alarme", MSG_A, urgent=True)
    async def _envoyer(self, etat, categorie, message):
        nom = etat.attributes.get("friendly_name") or etat.entity_id
        await self._regles.prevenir("alertes", categorie, (gabarit(message), {"nom": nom}), titre=TITRE)
    def _sans_rapport(self):
        message = "veilles : rien a signaler"
        return message
'''

# Chaque evasion de la relecture du 05/10, et celles d'avant : refusees.
EVASIONS = {
    "litteral": 'async def f(s, e):\n    await s._envoyer(e, "fumee", "Fumée !")\n',
    "variable locale": 'async def f(s, e):\n    texte = "Fumée !"\n    await s._envoyer(e, "fumee", texte)\n',
    "message par mot-cle": 'async def f(s, e):\n    await s._envoyer(e, "fumee", message="Fumée !")\n',
    "titre ecrit": 'MSG_A = "a"\nasync def f(s):\n    await s.regles.prevenir("v", "r", MSG_A, titre="Loggia — v")\n',
    "MSG_ dans une fonction": 'async def f(s):\n    MSG_AIR = "{nom} : air vicié"\n'
                              '    await s.regles.prevenir("v", "co2", (MSG_AIR, {"nom": 1}))\n',
    "join": 'async def f(s):\n    gab = "".join(["{nom} : aerez"])\n'
            '    await s.regles.prevenir("v", "co2", (gab, {}))\n',
    "appel": 'def _gab():\n    return "{nom} : aerez"\n'
             'async def f(s):\n    await s.regles.prevenir("v", "co2", (_gab(), {}))\n',
    "attribut": 'async def f(s):\n    await s.regles.prevenir("v", "co2", (s.MSG_CO2, {}))\n',
    "table de chaines": 'T = {"a": "Sabotage"}\nasync def f(s, e, dc):\n    msg = T[dc]\n'
                        '    await s.regles.prevenir("a", "c", msg)\n',
    "parametre re-lie": 'async def _envoyer(s, e, c, message):\n    message = "Fumée !"\n'
                        '    await s._regles.prevenir("a", c, message)\n',
    "lambda": 'MSG_A = "a"\ndef f(s):\n    return lambda: s.regles.prevenir("a", "c", "Fumée !")\n',
    "*args": 'async def f(s, a):\n    await s.regles.prevenir(*a)\n',
    "**kw": 'async def f(s, kw):\n    await s.regles.prevenir("a", "c", **kw)\n',
    "relais hors ENVOIS": 'async def _signaler(s, message):\n    await s.regles.prevenir("v", "co2", message)\n'
                          'async def f(s):\n    await s._signaler("Air vicié")\n',
    "relais introuvable": 'MSG_A = "a"\nasync def f(s, e):\n    await s._envoyer(e, "c", MSG_A)\n',
    "alias": 'MSG_A = "a"\nasync def f(s):\n    dire = s.regles.prevenir\n    await dire("v", "r", "Fumée !")\n',
    "getattr": 'async def f(s):\n    await getattr(s.regles, "prevenir")("v", "r", "Fumée !")\n',
    "argument ecrit": 'MSG_A = "{nom}"\nasync def f(s):\n'
                      '    await s.regles.prevenir("v", "r", (MSG_A, {"nom": "inconnu"}))\n',
    "argument par un nom": 'MSG_A = "{nom}"\nasync def f(s, e):\n'
                           '    nom = e.get("friendly_name") or "appareil inconnu"\n'
                           '    await s.regles.prevenir("v", "r", (MSG_A, {"nom": nom}))\n',
    "arguments hors dict": 'MSG_A = "{nom}"\nasync def f(s, a):\n    await s.regles.prevenir("v", "r", (MSG_A, a))\n',
    "table modifiee": 'T = {"a": ("c", "Fumée")}\ndef f():\n    T["b"] = ("c", "Sabotage")\n',
    "table mise a jour": 'T = {"a": ("c", "Fumée")}\ndef f():\n    T.update(b=("c", "Sabotage"))\n',
    "global": 'MSG_A = "a"\ndef f():\n    global MSG_A\n    MSG_A = "Fumée !"\n',
}


def test_la_garde_admet_les_formes_du_code_et_rien_d_autre():
    appels, envoyes, _ = juger_source(ADMIS)
    assert [(f, r) for f, _, r in appels] == [("_envoyer", []), ("_envoyer", []), ("prevenir", [])]
    assert envoyes == {("BINAIRES", 1), ("MSG_A", 1), ("TITRE", 0)}
    for nom, source in EVASIONS.items():
        appels, _, _ = juger_source(source)
        assert any(r for _, _, r in appels), (nom, appels)


def test_la_liste_suit_le_chemin_jusqu_a_prevenir():
    """Le meme MSG_* par `_envoyer` (qui pose gabarit()) et par `prevenir`
    en direct : deux cles, « Alarme : {nom} » ET « Alarme » (05/10)."""
    source = ADMIS + ('    async def _direct(self, haid):\n'
                      '        await self._regles.prevenir("alertes", "alarme", (MSG_A, {"nom": haid}))\n')
    appels, envoyes, _ = juger_source(source)
    assert not any(r for _, _, r in appels), appels
    assert envoyes == {("BINAIRES", 1), ("MSG_A", 1), ("MSG_A", 0), ("TITRE", 0)}


@pytest.mark.parametrize("nom", MODULES)
def test_aucun_message_ecrit_dans_un_appel_d_envoi(nom):
    appels, _, _ = juger(nom)
    assert appels, (f"{nom}.py : aucun appel d'envoi trouve — ENVOIS ne connait plus les noms "
                    "des fonctions qui partent au telephone : les y remettre")
    fautifs = [(f, ligne, r) for f, ligne, r in appels if r]
    assert fautifs == [], f"{nom}.py : {fautifs}. {QUOI_FAIRE}"


@pytest.mark.parametrize("nom", MODULES)
def test_chaque_constante_et_chaque_table_part_bien(nom):
    """A la place des minimums 4 et 5 : un MSG_*, un TITRE ou une table que
    plus aucun envoi ne cite est un envoi disparu (05/10)."""
    module = charger(nom)
    _, envoyes, ecrits = juger(nom)
    attendus = {k for k in vars(module) if CONSTANTE.match(k)} | set(tables_de_messages(module))
    assert attendus <= ecrits, (f"{nom}.py : {sorted(attendus - ecrits)} ne sont pas ecrits "
                                f"au niveau du module ; {QUOI_FAIRE}")
    muets = sorted(attendus - {cle for cle, _ in envoyes})
    assert not muets, (f"{nom}.py : {muets} n'est plus cite par aucun appel d'envoi. Envoi retire "
                       "expres ? retirer la constante et sa cle de CLES_TELEPHONE ; sinon le retablir")


def test_le_message_est_bien_au_rang_que_la_garde_lit():
    """La garde lit l'argument de rang ENVOIS[f] : si la signature bouge, elle
    jugerait la categorie a la place du message."""
    for nom in (*MODULES, "regles"):
        for f in ast.walk(ast.parse((COMPOSANT / f"{nom}.py").read_text(encoding="utf-8"))):
            if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef)) and f.name in ENVOIS:
                params = [a.arg for a in f.args.posonlyargs + f.args.args]
                assert params[1 + ENVOIS[f.name]] == "message", (
                    f"{nom}.{f.name}{tuple(params)} : le message n'est plus au rang "
                    f"{ENVOIS[f.name]} — mettre ENVOIS a jour")


# ── Personne d'autre ne parle au telephone ──────────────────────────────────

# Demander si un service existe n'est pas envoyer.
LECTURES = {"has_service", "get", "async_services"}
NOTIFY = re.compile(r"^notify(\.\w+)?$")


def parle_au_telephone(source: str) -> bool:
    """`prevenir` (appele ou non : un alias suffit), ou "notify" passe a
    n'importe quel appel — async_call, regles.agir, un relais comme
    `_async_service("notify", …)` —, en litteral, en constante ou en
    mot-cle. Seule la forme `async_call("notify", …)` etait vue (05/10)."""
    arbre = ast.parse(source)
    noms = {c.id for n in ast.walk(arbre) if isinstance(n, ast.Assign)
            and isinstance(n.value, ast.Constant) and isinstance(n.value.value, str) and NOTIFY.match(n.value.value)
            for c in n.targets if isinstance(c, ast.Name)}

    def vaut_notify(e) -> bool:
        return ((isinstance(e, ast.Constant) and isinstance(e.value, str) and bool(NOTIFY.match(e.value)))
                or (isinstance(e, ast.Name) and e.id in noms))

    for n in ast.walk(arbre):
        if (isinstance(n, ast.Attribute) and n.attr == "prevenir") or (isinstance(n, ast.Name) and n.id == "prevenir"):
            return True
        if isinstance(n, ast.Call):
            quoi = n.func.attr if isinstance(n.func, ast.Attribute) else getattr(n.func, "id", None)
            if quoi not in LECTURES and any(vaut_notify(a) for a in [*n.args, *(k.value for k in n.keywords)]):
                return True
    return False


def test_la_detection_des_parleurs_voit_toutes_les_formes():
    for source in ('h.services.async_call("notify", "m", {})',
                   'h.services.async_call(domain="notify", service="m", service_data={})',
                   'NOTIFY = "notify"\nh.services.async_call(NOTIFY, "m", {})',
                   'regles.agir("nuit", "r", "notify", "mobile_app", ["x"], {})',
                   'regles.agir("nuit", "r", domaine="notify", service="m", cibles=[])',
                   'self._async_service("notify", "mobile_app", [], {"message": "x"})',
                   'svc = h.services.async_call\nsvc("notify", "m", {})',
                   'self.regles.prevenir("nuit", "r", MSG_X)',
                   'dire = self.regles.prevenir'):
        assert parle_au_telephone(source), source
    for source in ('h.services.has_service("notify", s)', 'regles.agir("v", "r", "light", "turn_on", [])',
                   '"""Appelle notify.* : la doc le dit."""', '_LOGGER.debug("notify.%s indisponible", s)',
                   'self._prevenir_main(h)'):
        assert not parle_au_telephone(source), source


def test_seuls_alertes_et_veilles_parlent_au_telephone():
    """Un troisieme module qui appellerait `prevenir` (ou notify.*) enverrait
    des gabarits que personne ne confronte au catalogue (05/10)."""
    parleurs = {f.stem for f in sorted(COMPOSANT.glob("*.py"))
                if parle_au_telephone(f.read_text(encoding="utf-8"))}
    assert parleurs == {*MODULES, "regles"}, (
        f"{sorted(parleurs)} parlent au telephone. Un module de plus : ses gabarits en constantes MSG_*, "
        "son nom dans MODULES ici, ses cles dans CLES_TELEPHONE")


# ── Des envois reels, Home Assistant en allemand ────────────────────────────

class FauxEtat:
    def __init__(self, entity_id, state, attributes=None):
        self.entity_id = entity_id
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_all(self, domaine):
        return [s for h, s in self.table.items() if h.startswith(domaine + ".")]

    def async_entity_ids(self, domaine):
        return [h for h in self.table if h.startswith(domaine + ".")]


class FauxServices:
    def __init__(self):
        self.appels = []

    def has_service(self, domaine, service):
        return service == "mobile"

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append(dict(data))


class FauxConfig:
    language = "de"


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.config = FauxConfig()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def envois(self):
        """Joue les seuls envois au telephone ; la maison qui reagit, non."""
        taches, self.taches = self.taches, []
        for coro in taches:
            if coro.cr_code.co_name == "_envoyer":
                lancer(coro)
            else:
                coro.close()


class Ev:
    def __init__(self, new, old):
        self.data = {"new_state": new, "old_state": old}


def magasin(store_module, partage):
    m = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    m._store = FauxStore({"users": {}, "shared": partage, "migrated": True})
    m._ancien = FauxStore(None)
    m._data = None
    m._lock = asyncio.Lock()
    return m


def alertes_en_allemand(store_module, etats):
    module, regles = charger("alertes"), charger("regles")
    cfg = {"actif": True, "service": "mobile", "cooldown_min": 5,
           "categories": {c: True for c in ("fumee", "gaz", "co", "fuite", "alarme", "portes")}}
    a = module.LoggiaAlertes.__new__(module.LoggiaAlertes)
    a._hass = FauxHass(etats)
    a._store = magasin(store_module, {"loggia_alertes": cfg})
    a._dernier, a._dangers, a._avant, a._vanne_coupee = {}, {}, {}, None
    a._regles = regles.Regles(a._hass, a._store)
    a._regles._depot = FauxStore(None)
    return a


def test_la_fumee_part_en_allemand(store_module):
    """Le chemin reel : l'evenement d'etat, puis `_envoyer`, puis le socle."""
    textes = charger("textes")
    fumee = FauxEtat("binary_sensor.k_rauch", "on", {"device_class": "smoke", "friendly_name": "Kueche"})
    a = alertes_en_allemand(store_module, {})
    a._on_state(Ev(fumee, FauxEtat(fumee.entity_id, "off", fumee.attributes)))
    a._hass.envois()
    (charge,) = a._hass.services.appels
    assert charge["message"] == textes.TEXTES["de"]["Fumée détectée : {nom}"].replace("{nom}", "Kueche")
    assert charge["message"] != "Fumée détectée : Kueche"
    assert charge["title"] == textes.TEXTES["de"]["Loggia — sûreté"]
    assert charge["data"]["channel"] == "alarm_stream", "toujours le canal critique"


def test_l_alarme_et_l_ouverture_partent_en_allemand(store_module):
    textes = charger("textes")
    alarme = FauxEtat("alarm_control_panel.haus", "triggered", {"friendly_name": "Haus"})
    a = alertes_en_allemand(store_module, {})
    a._on_state(Ev(alarme, FauxEtat(alarme.entity_id, "disarmed", alarme.attributes)))
    a._hass.envois()
    arme = FauxEtat("alarm_control_panel.haus", "armed_away", {"friendly_name": "Haus"})
    porte = FauxEtat("binary_sensor.tuer", "on", {"device_class": "door", "friendly_name": "Tuer"})
    b = alertes_en_allemand(store_module, {arme.entity_id: arme})
    lancer(b._porte_ouverte(porte))
    envoyes = [c["message"] for c in a._hass.services.appels + b._hass.services.appels]
    de = textes.TEXTES["de"]
    assert envoyes == [de["Alarme déclenchée : {nom}"].replace("{nom}", "Haus"),
                       de["Ouverture pendant que l’alarme est armée : {nom}"].replace("{nom}", "Tuer")]


def veilles_en_allemand(store_module, etats, cfg):
    module, regles = charger("veilles"), charger("regles")
    v = module.LoggiaVeilles.__new__(module.LoggiaVeilles)
    v.hass = FauxHass(etats)
    v.store = magasin(store_module, {"loggia_veilles": cfg, "loggia_alertes": {"service": "mobile"}})
    v.cfg = lancer(v.async_config())
    v.signales, v.creuses_en_cours, v._defait = set(), False, []
    v.regles = regles.Regles(v.hass, v.store)
    v.regles._depot = FauxStore(None)
    return v


def titres_admis(textes) -> set[str]:
    """Le titre d'une veille : « Loggia », le nom propre par defaut de
    `prevenir`, ou une traduction allemande — jamais un titre francais."""
    return {"Loggia"} | set(textes.TEXTES["de"].values())


def test_les_veilles_partent_en_allemand(store_module):
    textes = charger("textes")
    etats = {"sensor.pile": FauxEtat("sensor.pile", "9", {"device_class": "battery", "friendly_name": "Tuer"}),
             "sensor.tarif": FauxEtat("sensor.tarif", "HC")}
    cfg = {"batterie": {"actif": True, "seuil": 15},
           "creuses": {"actif": True, "entite": "sensor.tarif", "valeur": "HC"}}
    v = veilles_en_allemand(store_module, etats, cfg)
    lancer(v._async_batteries())
    lancer(v._async_creuses())
    de = textes.TEXTES["de"]
    envoyes = [c["message"] for c in v.hass.services.appels]
    assert envoyes == [de["{nom} : pile a {v} %"].replace("{nom}", "Tuer").replace("{v}", "9"),
                       de["Heures creuses : c’est le moment de lancer les machines"]]
    assert {c["title"] for c in v.hass.services.appels} <= titres_admis(textes)


def test_le_co2_et_les_consommables_partent_en_allemand(store_module):
    """Les deux chemins sans envoi reel : un gabarit rendu par un appel ou un
    attribut y passait toutes les gardes de syntaxe d'avant (05/10). Ce filet
    ne regarde pas la syntaxe, seulement ce qui arrive au telephone."""
    textes = charger("textes")
    etats = {"sensor.co2": FauxEtat("sensor.co2", "1500", {"device_class": "carbon_dioxide",
                                                           "friendly_name": "Buero"}),
             "sensor.filtre": FauxEtat("sensor.filtre", "5", {"unit_of_measurement": "%",
                                                              "friendly_name": "Filter"})}
    cfg = {"co2": {"actif": True, "seuil": 1400, "capteurs": ["sensor.co2"], "ventilation": []},
           "consommables": {"actif": True, "seuil": 10, "capteurs": ["sensor.filtre"]}}
    v = veilles_en_allemand(store_module, etats, cfg)
    lancer(v._async_co2())
    lancer(v._async_consommables())
    de = textes.TEXTES["de"]
    envoyes = [c["message"] for c in v.hass.services.appels]
    assert envoyes == [de["{nom} : {v} ppm, il faut aerer"].replace("{nom}", "Buero").replace("{v}", "1500"),
                       de["{nom} : {reste} restant, a remplacer"].replace("{nom}", "Filter")
                       .replace("{reste}", "5 %")]
    assert "aerer" not in envoyes[0] and "remplacer" not in envoyes[1], envoyes
    assert {c["title"] for c in v.hass.services.appels} <= titres_admis(textes)
