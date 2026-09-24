# ADR 0087 — Ce que la CI exécute est nommé par son commit

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point M15 du plan du 22/09 : « La chaîne d'approvisionnement des workflows ».

## Le constat

Les trois workflows appelaient dix actions, toutes référencées par un **tag de
majeure** : `actions/checkout@v7`, `github/codeql-action/init@v4`, et ainsi de
suite. Aucun `.github/dependabot.yml`.

Un tag n'est pas une version. C'est un nom, et un nom se déplace. Qui prend le
contrôle du dépôt d'une action déplace `v7` sur son propre commit, et chaque
dépôt qui l'utilise exécute ce code au prochain push — **sans qu'aucun fichier
ait changé nulle part**. Il n'y a rien à relire, rien à réviser, aucune trace
dans l'historique du dépôt victime.

Ce qui tourne ici a le droit de lire le dépôt, d'écrire dans Security, et de
publier sur GitHub Pages. Ce n'est pas rien à laisser à un nom mobile.

## La décision

**Chaque `uses:` porte le SHA du commit**, avec sa version en commentaire :

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

Dix-sept références, sept actions distinctes. **Les versions exécutées ne
changent pas** : chaque SHA est celui vers lequel son tag pointait au 24/09,
vérifié un par un auprès de GitHub. Ce qui change, c'est qu'elles ne peuvent
plus bouger sous nos pieds.

Le commentaire n'est pas décoratif : un SHA seul est illisible, personne ne
sait s'il date de six jours ou de six ans.

### Deux exceptions, et elles sont dites

`home-assistant/actions/hassfest@master` et `hacs/action@main` restent sur leur
branche. Home Assistant et HACS publient leurs règles de validation là, sans
poser de tag. Les figer rendrait la CI **verte à tort** : elle validerait le
manifeste contre les règles d'un jour donné, pendant que HACS refuserait le
dépôt à l'installation.

Le commentaire est à leur ligne, dans le workflow, pas seulement ici.

## L'envers, sans lequel c'est pire

**Un SHA épinglé ne se met plus à jour tout seul.** Épingler sans surveiller,
c'est figer une version vulnérable pour toujours — l'inverse de ce qu'on
cherche.

`.github/dependabot.yml` le relève, **chaque semaine, en un seul lot** : sept
actions, sept pull requests hebdomadaires rendraient l'avis illisible, et un
avis illisible ne se lit pas.

**`npm` n'y est pas, à dessein.** Le paquet HACS embarque un bundle versionné
dans `custom_components/loggia/frontend/` : une montée de dépendance demande de
reconstruire et de repackager, ce qu'une pull request automatique ne fait pas.
Les **alertes** Dependabot restent actives — c'est la lecture qui compte, pas
la PR. C'est la règle déjà en vigueur, écrite ici pour qu'elle survive à ce
fichier.

## Le garde-fou

`tests/workflows_epingles.test.mjs`, cinq contrôles :

- chaque `uses:` porte un SHA de quarante caractères, **sauf** les deux
  références nommées — y ajouter une ligne est une décision, pas un oubli ;
- chaque SHA garde sa version en commentaire ;
- les deux branches flottantes portent une explication à leur ligne ;
- Dependabot ne déclare que `github-actions`, et il a un rythme ;
- le balayage trouve au moins dix appels — sans quoi une expression régulière
  cassée rendrait tout le reste vert en ne trouvant rien.

Vérifié en dé-épinglant une action : le test la nomme et échoue.

`tests/securite_github.test.mjs` visait `github/codeql-action/init@v4` par son
tag. Son intention — les deux étapes, sur la majeure 4 — reste vraie ; elle
vise maintenant le chemin de l'action et la version du commentaire.

## Conséquences

- **Rien ne change à l'exécution** : mêmes actions, mêmes versions.
- Monter une action devient un commit lisible, proposé et daté, au lieu d'un
  glissement silencieux.
- Ce qui reste hors de portée est du ressort de GitHub, pas d'un fichier :
  l'activation de Dependabot et la protection de branche sont tes réglages.

Tests : 960 au vert côté JS (+5), 573 côté Python, lint propre, audit propre.
