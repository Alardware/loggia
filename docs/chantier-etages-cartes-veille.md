# Quatre chantiers pour Loggia — accueil, étages, coût, cartes Lovelace

Document de passation, écrit le 05/10/2026. À lire en entier avant de toucher
au code : il contient les faits **vérifiés dans le dépôt**, pas des souvenirs.

Il est né de la comparaison avec deux dashboards Home Assistant :

- [`dwainscheeren/dwains-dashboard-next`](https://github.com/dwainscheeren/dwains-dashboard-next)
  — MIT, livré en simple ressource Lovelace ;
- [`Bobsilvio/oikos`](https://github.com/Bobsilvio/oikos) — **propriétaire et
  payant** (quinze jours d'essai, puis abonnement), livré en add-on ou en
  conteneur Docker.

La plupart de ce qu'ils font, Loggia le fait déjà, souvent plus loin. Quatre
choses manquaient vraiment ; les voici.

> **Oikos est fermé.** On n'en reprend **aucun code, aucun visuel, aucun texte**
> — seulement des idées, ce qui est libre. Ce document ne cite aucun de ses
> fichiers et n'en a lu que la présentation publique.

---

## 0. Le terrain

| | |
|---|---|
| Dépôt | `C:\Users\micro\OrionV2-source`, distant `Alardware/loggia` |
| Branche au moment d'écrire | `main`, propre, à jour, **v3.86.0** (05/10) |
| Dernière décision ici | **0155** |
| Composant | `custom_components/loggia/` (Python) |
| Interface | `src/` (React + Vite), empaquetée dans `custom_components/loggia/frontend/` |

**`main` est protégée** : branche → PR → `gh pr checks` → fusion. HACS suit les
**releases**, pas les commits.

**Avant tout push** : `npm run lint`, la suite de tests, `npm run audit`.
Si `npm test` meurt au hasard en `Zone Allocation failed`, ce n'est pas Loggia
(un autre logiciel mange la mémoire) : passer par
`node --test --test-concurrency=1 tests/*.test.mjs`.

**Déploiement d'essai** :
`npm run build` → `python scripts/pack_frontend.py` →
`robocopy custom_components/loggia \\<adresse-de-votre-HA>\config\custom_components\loggia /E`
(jamais `/MIR` ni `/PURGE` : la copie est additive). Puis **dire** qu'un
redémarrage de Home Assistant est nécessaire — ne pas le faire soi-même.

### Deux agents sur la même installation

Une autre session (« Luna ») travaille sur une **autre copie du dépôt** mais
écrit dans le **même** Home Assistant. Le dernier déploiement gagne en silence.
Lire l'`index.html` du partage avant d'écraser.

Conséquence directe ici : **vérifier les numéros d'ADR libres avant d'en écrire
une**, et le faire sur `origin/main` — `ls docs/decisions/` dans un arbre en
retard ne suffit pas. Au 05/10 les deux arbres sont réunis sur la v3.86.0, et la
dernière décision est la **0155**.

### Règles dures à respecter

- **Répondre en français.** Code, commentaires, commits, ADR, PR : en français.
- **Jamais de commit, push, PR, fusion ou release sans un « go » explicite qui
  porte sur CE travail.** Un accord ne se reporte pas d'une tâche à la suivante.
  Écrire, tester, construire et déployer chez lui reste normal.
- **Ne jamais allumer ses lumières.** Veilleuses, lampadaire et extérieur
  s'allument chez lui sans raison connue : aucun essai hors de la démonstration
  factice (`?demo`), jamais sur son Home Assistant.
- **Aucun `entity_id` en dur** dans `src/`.
- **Jamais de `<select>` natif** : tout menu passe par `ListeChoix`, toute
  suggestion par `ChampSuggere` (`src/ui.jsx`).
- **Puce / onglet / filtre choisi** = `--o-accent-fond` + texte blanc. Sans
  exception.
- **Pas de boîte dans une boîte** : titre de section + grille sur la page,
  jamais des cartes dans un cadre.
- **Les liserés** (réglage Apparence) valent pour **toutes** les cartes : plus
  de `border: 'none'` en dur.
- **Le polonais de `pl.js` est intouchable** (traduit par un Polonais,
  GitHub Seba882) : ne jamais réécrire une valeur existante. Un texte nouveau en
  polonais se signale pour relecture.
- Toute chaîne passée à `tr()` doit exister dans les **six** catalogues
  (`src/langues/{en,de,es,it,nl,pl}.js`) ; une clé que plus rien n'appelle doit
  en sortir. Les tests le vérifient.
- Un compte qui peut valoir 1 passe par **`trN(n, singulier, pluriel)`**, dont
  le paramètre est `{n}`.

### Un piège qui a déjà coûté cher

`toISOString()` rend de l'**UTC**. Une journée entière (`start.date`, `due`
d'une tâche) se dit en date **locale**, sinon après 22 h en France « demain »
redevient aujourd'hui. Un rendez-vous à l'heure, lui, est un instant et part
bien en ISO.

---

## Chantier 1 — Les étages

> **La plomberie est déjà posée. Personne n'a jamais branché le robinet.**

Home Assistant a un registre d'étages (*floors*) : chaque zone peut appartenir
à un étage, qui porte un nom et un **niveau** (−1 pour le sous-sol, 0 pour le
rez-de-chaussée, etc.).

### Ce qui existe déjà — vérifié

| Fichier | Ligne | Ce qu'il fait |
|---|---|---|
| `custom_components/loggia/discovery.py` | 88 | lit `floor_registry` |
| `custom_components/loggia/discovery.py` | 92 | expose `{id, name, level}` par étage |
| `custom_components/loggia/discovery.py` | 70 | chaque zone porte son `floor_id` |
| `src/discovery.js` | 53, 156 | lit `config/floor_registry/list` en direct |
| `src/discovery.js` | 119, 135 | normalise zones et étages |
| `src/discovery.js` | 244 | **l'index porte `floor` sur chaque pièce** |

### Ce qui manque

**Aucune vue ne s'en sert.** Les seuls `floor` de `src/App.jsx` sont des
`Math.floor`. L'information traverse tout le système et meurt à l'arrivée.

### Le travail

Regrouper les pièces par étage là où une liste de pièces est longue — la vue
**Pièces** d'abord, l'Accueil ensuite si ça a du sens. Un titre d'étage, puis
sa grille de pièces.

Points d'attention :

- **Trier par `level`**, pas par nom : le sous-sol (−1) vient avant le
  rez-de-chaussée (0), qui vient avant l'étage (1).
- **Une maison de plain-pied n'a aucun étage déclaré** — c'est le cas le plus
  courant. Sans étage, **rien ne change** : pas de titre, pas de groupe. Même
  règle que partout dans Loggia : pas de source, pas d'affichage.
- **Les pièces sans étage** ne disparaissent pas : elles vont dans un groupe
  sans titre, à la fin.
- Le nom d'un étage **vient de Home Assistant** : il ne se traduit pas.
- Regrouper ne doit pas casser l'**ordre des cartes par format d'écran**
  (`disposition.js`) ni la taille choisie pour chaque carte.
- Pas de nouveau réglage sans raison : si le groupement est évident, il n'a pas
  besoin d'un interrupteur.

---

## Chantier 2 — Le coût de l'énergie

> **Même histoire que les étages : résolu, jamais affiché.**

Oikos met en avant une carte « facture ». En allant voir ce que Loggia en fait,
on tombe sur le même robinet non branché.

### Ce qui existe déjà — vérifié

`src/resolve.js:371` résout, depuis les préférences du tableau de bord Énergie
de Home Assistant :

```js
coutJour: (from && from.stat_cost) || null,
```

`stat_cost` est la statistique de **coût** que Home Assistant calcule lui-même
à partir du tarif déclaré dans son tableau de bord Énergie.

### Ce qui manque

`grep -rn "coutJour" src/` → **une seule occurrence : la ligne qui le crée.**
Aucune vue ne l'affiche. On va chercher le coût du jour chez Home Assistant, on
le range dans l'index, et on n'en fait rien.

### Le travail

Montrer ce coût là où il a du sens — la vue Énergie d'abord.

Points d'attention :

- **Pas de tarif déclaré, pas de coût.** `stat_cost` est `null` chez qui n'a pas
  renseigné son prix du kWh dans Home Assistant. Rien ne s'affiche alors : pas
  de zéro, pas de tiret, pas de carte vide.
- **La monnaie vient de Home Assistant** (`hass.config.currency`), jamais d'une
  table écrite dans Loggia. Elle n'est pas forcément l'euro.
- **Le formatage suit la langue choisie**, pas celle du navigateur — voir
  `src/unites.js` et la règle des sept langues.
- Ne pas recalculer un coût soi-même à partir d'un prix et d'une consommation :
  Home Assistant le fait déjà, avec les heures creuses et les tarifs multiples.
  Reprendre son chiffre.
- Vérifier au passage si `stat_cost` existe aussi pour l'**injection** (ce que
  le réseau rachète) : la même ligne pourrait porter les deux sens.

Petit chantier, déjà à moitié fait. Bon candidat juste après le retour à
l'accueil.

---

## Chantier 3 — Les cartes Lovelace tierces

> **Le seul vrai écart de toute la comparaison — et les DEUX projets le font.**

Dwains les insère à cinq emplacements d'une zone. Oikos en fait un argument de
vente : « vos cartes Mushroom, Bubble, card-mod continuent de marcher, il suffit
de coller le YAML ». Deux projets concurrents jugent la chose indispensable, et
tous deux par **collage de YAML**. C'est un bon indice sur l'approche à prendre.

### Le constat — vérifié

`grep -rn "loadCardHelpers" src/` → **0 résultat.** Ni `hui-card`, ni
`createCardElement`, ni `custom:`.

Le catalogue de cartes de Loggia est riche (`CV_TYPE_NOMS` dans `src/App.jsx`
en liste une vingtaine) mais **fermé** : impossible de poser une
`mini-graph-card`, une `apexcharts-card`, ou même une `type: tile` de Home
Assistant. Tout l'écosystème HACS est hors de portée.

### Le mécanisme

Home Assistant expose `window.loadCardHelpers()`, qui rend un objet avec
`createCardElement(config)`. L'élément obtenu est un élément DOM auquel on
affecte `.hass` ; il faut le **réaffecter à chaque changement d'état**.

Dans React, cela veut dire un conteneur avec une `ref`, un `useEffect` qui crée
l'élément quand la configuration change, et un autre qui pousse `hass`.

### Points d'attention

- **Une carte tierce peut ne pas exister** (ressource absente, nom mal écrit).
  Elle doit alors afficher un message clair, pas une page blanche — et surtout
  pas faire tomber la vue entière.
- **Une carte tierce peut lever une erreur** à la construction : l'entourer.
- **La configuration est du YAML.** Il faut un champ de saisie et un analyseur.
  Vérifier ce que le dépôt embarque déjà avant d'ajouter une dépendance.
- **Le thème.** Les cartes Home Assistant lisent les variables CSS de HA
  (`--primary-color`, `--card-background-color`…), pas celles de Loggia
  (`--o-*`). Sans pont, une carte tierce détonnera. À regarder tôt : c'est ce
  qui décidera si le résultat est présentable.
- **Où les poser.** Le projet comparé en permet cinq emplacements par zone.
  Pour Loggia, le plus naturel est une **carte du catalogue** parmi les autres,
  posable comme n'importe laquelle. Lui demander avant de choisir.
- La carte doit rester **posable** depuis la bibliothèque, et la bibliothèque
  s'actualise à chaque nouvelle famille de carte.

C'est le plus gros des trois. Le découper : d'abord afficher une carte dont la
configuration est écrite à la main, voir ce que ça donne à l'écran, et seulement
ensuite l'éditeur.

---

## Chantier 4 — Le retour à l'accueil après inactivité

> **Le plus petit des quatre. À faire en premier.**

Les deux projets comparés l'ont : Dwains sous « wall tablet », Oikos sous
« screen saver ». La veille de Loggia couvre déjà la moitié du besoin.

### Le constat — vérifié

`grep -rn "inactivite\|inactivity\|retourAccueil\|idleTimer" src/` → **rien.**

Loggia a bien une **veille** (`ambient`, lu dans `localStorage` à
`src/App.jsx:14767`), avec sa plage horaire, ses photos de fond et son réveil
par la caméra. Mais rien ne ramène à l'accueil : si quelqu'un laisse une fiche
ouverte sur la tablette du couloir, elle y reste jusqu'au prochain passage.

### Le travail

Un délai réglable — 0 (coupé), 1, 2, 5, 10, 30 minutes — après lequel :

1. les feuilles et fiches ouvertes se **ferment** ;
2. la vue revient à l'**Accueil**.

### Points d'attention

- **Par appareil**, dans `localStorage`, comme `ambient` : la tablette du
  couloir et le téléphone n'ont pas le même besoin.
- **Coupé par défaut.** Personne ne doit voir son écran bouger tout seul sans
  l'avoir demandé.
- **Ce qui compte comme activité** : pointeur, clavier, toucher. Un changement
  d'état de la maison **n'en est pas une** — sinon le délai ne s'écoulerait
  jamais dans une maison vivante.
- **Ne pas interrompre une saisie en cours** : un formulaire ouvert avec du
  texte dedans ne doit pas se fermer sous les doigts.
- Son réglage va dans **Paramètres**, à côté de la veille — même famille.
  Vérifier que Paramètres ne répète pas ce qu'une page règle déjà.
- Le minuteur vit dans l'onglet, et c'est **normal ici** : il ne s'agit pas
  d'une action différée sur la maison (celles-là vivent dans le composant), mais
  du comportement d'un écran.

---

## Ordre conseillé

1. **Le retour à l'accueil** (chantier 4) — petit, isolé, visible tout de suite.
2. **Le coût de l'énergie** (chantier 2) — une ligne existe déjà, il ne
   manque que l'affichage.
3. **Les étages** (chantier 1) — la donnée est déjà là, c'est du travail de vue.
4. **Les cartes Lovelace tierces** (chantier 3) — le gros morceau, à découper.

Les trois premiers se ressemblent : **la donnée est déjà calculée et personne ne
la montre**. Ils devraient aller vite. Le quatrième est d'une autre nature.

Chacun mérite sa décision dans `docs/decisions/` et son propre commit. Vérifier
les numéros libres (voir « Deux agents » plus haut).

> **Deux fois le même défaut.** Les étages et le coût du jour traversent tout le
> système et meurent à l'arrivée. S'il y a une leçon à tirer, c'est qu'il
> vaudrait la peine de chercher les **autres** champs de l'index que plus
> personne ne lit — un test de ce genre existe déjà pour les exports
> (`tests/exports_sans_client.test.mjs`) et pour les clés de langue.

---

## Ce qui a été écarté, et pourquoi

Pour qu'on ne les repropose pas comme des découvertes :

- **Apparaître dans le dialogue « Ajouter un tableau de bord ».** Ce dialogue
  liste des *stratégies Lovelace*. Loggia est un panneau custom
  (`custom_components/loggia/panel.py:86`) qui apparaît **tout seul dans la
  barre latérale** dès l'installation. Y figurer obligerait l'utilisateur à
  créer un dashboard : moins simple, pas plus.
- **Le chargement à la demande.** Déjà fait — huit modules en `lazy()` dans
  `src/App.jsx`, et `three.js` (440 Ko) déjà séparé. Ce qui reste vrai, c'est
  que `boot` pèse **1000 Ko** parce qu'`App.jsx` fait 25 000 lignes : c'est un
  autre chantier, autrement plus lourd.
- **Les permissions par utilisateur.** Déjà faites, et mieux : la frontière des
  droits sépare ce qu'une **erreur coûte** (décision 0125), pas le commun du
  personnel.
- **Une section « dépannage » sur les ressources Lovelace.** Ne concerne que les
  dashboards livrés en ressource JS. Loggia n'en déclare aucune, et porte déjà
  un jeton anti-cache `?v=version.mtime` sur ses URL
  (`custom_components/loggia/panel.py:79`).
- **Les blueprints** (pages et remplacements de cartes installables depuis une
  galerie JSON). Joli sur le papier, lourd à bâtir, et les vues personnalisées
  couvrent déjà une part du besoin. Pas maintenant.

Et du côté d'Oikos :

- **L'éditeur en glisser-déposer libre**, qui pose les widgets où l'on veut sur
  un canevas. **Contraire à une règle dure de Loggia** : grille commune sur
  tous les écrans, cartes compactes 88 ou standard 184, « le contenu s'adapte à
  la carte ». Un canevas libre casserait l'alignement partout, et les
  dispositions par format d'écran avec lui. À ne pas reproposer.
- **Le magasin communautaire de cartes** et le **SDK** pour en écrire. Cela
  suppose une infrastructure, une modération et des mises à jour à tenir : hors
  de proportion pour un projet tenu par une personne.
- **Le fond qui suit la météo et les thèmes clair/sombre.** Déjà là, et plus
  loin : effets météo, ciel étoilé, météo en 3D, une trentaine de thèmes avec
  garde de contraste (décision 0060).
- **La génération de cartes par description à une IA.** Hors sujet pour un
  composant Home Assistant, et impossible à tenir hors ligne.
- **Son mode de distribution** (add-on Home Assistant ou conteneur Docker
  partageant `/config`). Le composant personnalisé de Loggia est plus simple
  pour l'utilisateur : rien à installer à côté.
- **Son modèle économique** (essai de quinze jours puis abonnement). Loggia est
  gratuit et ouvert ; ce n'est pas un détail de licence, c'est ce qu'il est.

---

## Une piste à vérifier, sans rapport avec les quatre

Les notes de version disent « redémarrage de Home Assistant requis » à chaque
fois. Or `panel.py:45` sert le frontend avec `cache_headers=False`, et le jeton
anti-cache porte la date de construction du fichier. **Une version qui ne
touche que `src/` pourrait n'exiger qu'un rechargement du navigateur.**

Le jeton étant calculé au démarrage (`panel.py:63`), ce n'est **pas** établi :
cela se teste, sur une version sans aucun changement Python. Si c'était vrai,
ce serait un vrai confort à la mise à jour.
