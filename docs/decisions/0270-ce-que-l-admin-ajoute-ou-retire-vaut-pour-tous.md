# 0270 — Ce que l'admin ajoute ou retire vaut pour tous

*20 octobre 2026 — à l'essai (rien de publié)*

## Le problème

> « Sur PC ou mobile, en admin, si je supprime une carte ou en ajoute une, ça
> ne se répète pas sur les autres profils et appareils : du coup je suis
> obligé, pour chacun, de reproduire l'opération, ce qui est pénible. »

L'ADR 0185 a séparé trois couches : la **maison** (ce qui existe), le
**profil** (comment c'est rangé), l'**appareil** (ce qu'il sait de lui). Elle
a rangé dans la deuxième tout ce que portent les clés d'agencement — l'ordre et
les tailles, juste, mais aussi le **contenu** : quelles cartes existent sur une
vue, quelles sections et quels widgets sur l'Accueil, quelles épingles dans les
Favoris. Ajouter une carte en admin ne valait donc que pour son profil.

Sa propre frontière du 11/10 le disait déjà : « la seule chose commune à tous,
c'est l'ajout, la suppression et la modification d'entités ».

## Décidé

Le **contenu** se sépare du **rangement**, sans nouvelle clé :

| | Partagé par | Sous-clés |
|---|---|---|
| Contenu | tous les profils, tous les formats | vues à cartes : `added`, `removed` (avec `labels`, `types` d'une carte ajoutée) ; Favoris : les épingles présentes ; Accueil : `caches`, `ajoutees` |
| Rangement | chaque profil, chaque format | `order`, `larges`, `compacts`, la taille d'une épingle, `main`/`rail`, `tailles`, `places`, `styles` |

**Quand le profil qui agit est Admin**, `cfgSet` (state.js) compare sa part
avant et après le geste. Le changement de contenu qu'il y trouve
(`contenupartage.js`) est appliqué à la part de **chaque** profil — la part
commune `*` comprise, donc aussi les profils qui n'ont jamais rien rangé —,
dans le **même** envoi. C'est le mécanisme que l'ADR 0185 réservait aux pièces
renommées (une valeur-fonction appliquée à toutes les parts).

Le report est **idempotent** (« cette carte est présente / absente ») : il ne
touche rien chez l'admin, et rien d'autre que le contenu chez les autres. Il ne
vide jamais une part (un profil vidé retomberait sur la part commune).

**Un profil ordinaire** range toujours chez lui seul : son retrait vaut
« masquer pour moi ». Supprimer pour tout le monde est un geste d'admin.

**Une suppression de l'admin vaut partout**, y compris chez un profil qui avait
ajouté la carte lui-même (son choix : l'option la plus prévisible). Une carte
ajoutée par l'admin arrive à la fin du rangement de chacun ; ce qu'un profil
avait retiré lui-même reste retiré.

Le passage central couvre tous les chemins d'un coup : la croix, la feuille
d'ajout, l'épingle depuis une fiche, « Toutes les cartes », l'annuler et le
refaire de l'Accueil. L'Accueil reporte sur la grille de l'ordinateur et sur
chaque format ou appareil qui a ses propres sections.

## Ce que ça entraîne

- Aucun changement côté serveur, aucune nouvelle clé, aucun redémarrage de
  Home Assistant : c'est une forme de valeur, comme le marqueur `__profils`.
- Ce que chacun avait déjà ajouté ou retiré profil par profil reste tel quel ;
  seuls les gestes suivants de l'admin se reportent.
- « Toutes les cartes » fait par l'admin remet le contenu par défaut **pour
  tous** (ses retraits levés le sont partout).
- Les vues personnalisées, les pièces et les caméras étaient déjà communes
  (configuration de la maison, réservée admin) : rien ne change pour elles.
- **Non fait** : remplacer l'entité d'une carte (`replace`) ne se reporte pas
  encore aux autres profils ; une épingle gabarit retypée part chez les autres
  à la fin de leur rangement.

Tests : `tests/contenu_partage.test.mjs` (l'admin retire, ajoute, remet une
carte ; Favoris ; Accueil sur le téléphone et sur les formats ; un profil
ordinaire et un changement d'ordre restent à leur auteur) ;
`tests/reglages_par_profil.test.mjs` reste vrai pour le rangement et les
profils ordinaires.
