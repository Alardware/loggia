# ADR 0079 — Un repli refuse, il n'élargit pas

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point M10 du plan du 22/09. Quatre replis du composant qui, au lieu de refuser
ou de le dire, laissaient passer.

## Le cœur : un compte illisible donnait les droits de la maison

Le service `loggia.scenario` lit le compte qui l'appelle pour n'agir que sur ce
que cette personne a le droit de piloter :

```python
utilisateur = await hass.auth.async_get_user(uid)
controle=controle_de(utilisateur) if uid else None
```

`controle_de(None)` rend `None`, c'est-à-dire **aucun filtre**. C'est le bon
sens quand il n'y a pas d'utilisateur du tout — une automatisation, un
interrupteur sans fil : la maison agit sous ses propres droits, et c'est voulu.

Mais si la lecture échouait, `utilisateur` valait `None` alors que `uid` était
bien présent. Le scénario partait donc avec les droits de la maison entière, au
nom de quelqu'un dont on n'avait pas pu vérifier ce qu'il pouvait faire. C'est
l'inverse exact de l'ADR 0045, et un élargissement silencieux.

**Un appel qui PORTE un identifiant doit pouvoir le résoudre, sinon il ne part
pas.** La règle est une fonction pure, `compte_resolu(uid, utilisateur)`, à
côté de `controle_de` : elle s'énonce en une ligne et se teste sans Home
Assistant. Le refus est écrit au journal.

## Un module qui rate son démarrage le dit, et le retient

Dix modules posaient `hass.async_create_task(self._async_demarrer())` et s'en
remettaient là. Une tâche qui lève n'est retrouvée par personne : au mieux Home
Assistant écrit « Task exception was never retrieved » quand le ramasse-miettes
passe, au pire rien. Le module répondait ensuite à l'écran comme si de rien
n'était — table vide, aucune reprise, aucun mot. Seul `scenarios.py` enveloppait.

`regles.demarrer(hass, module, coro, nom)` remplace les dix appels. L'échec est
écrit, et il se retient : `module.demarrage` vaut `None` tant que la tâche n'a
pas tourné, puis `True` ou `False`. Ce qu'un module rend à l'écran peut donc
dire qu'il n'a pas démarré, au lieu de se taire.

## Trois replis muets qui parlent

- **`robots._registre`** : sans registre des entités, le robot perd sa
  plateforme et ses aires, et le planning passe entier. Signalé **une fois par
  vie du process** — répété à chaque lecture, il noierait le journal.
- **`volets._expiration`** : sans l'heure du soleil, un ordre en attente expire
  douze heures plus tard au lieu du prochain lever ou coucher. Cela ne se
  devine pas.
- **`scenarios._ids` et `inventaire`** : des états ou des registres illisibles
  rendaient une liste vide, que le scénario lit comme « rien à faire ». Il
  passait sans rien toucher et sans rien dire.

## Ce qui n'est pas fait, et pourquoi

`async_unload_entry` ne retire que le panneau ; les dix méthodes `async_arreter`
existent et ne sont appelées nulle part. Le plan le renvoyait déjà au point S7,
et il a raison : les modules ne sont pas reconstruits au rechargement — ils sont
gardés dans `hass.data` exprès, parce que les vues HTTP et les commandes
WebSocket ne se désenregistrent pas. Les arrêter au déchargement sans revoir ce
cycle de vie couperait leurs minuteurs pour de bon, sans jamais les relancer.
C'est un chantier à part, pas une ligne à ajouter.

## Conséquences

- **Redémarrage de Home Assistant requis** : le composant change.
- Un scénario lancé par le service au nom d'un compte illisible ne part plus.
  Sur une installation saine, rien ne change : le compte se lit.
- Le journal de Home Assistant peut porter quatre avertissements de plus, tous
  sur des pannes qui étaient déjà là et qu'il taisait.

Tests : tests/python/test_robustesse.py (+3, dont la règle pure et le démarrage
gardé), le relevé des lectures muettes réaligné.
