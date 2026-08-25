# Le moteur universel

Comment Loggia comprend une installation Home Assistant qu'il n'a jamais vue.

Le dashboard a d'abord été écrit pour une maison précise. Le rendre utilisable
chez quelqu'un d'autre supposait de remplacer chaque supposition par une
lecture : au lieu de savoir que le volet du séjour a une position, demander à
chaque volet ce qu'il sait faire.

Sept modules s'en chargent. Chacun ne fait qu'une chose, ne dépend ni de React
ni du navigateur, et se teste seul. Aucun ne contient d'identifiant d'entité —
un test le vérifie à chaque exécution de la suite.

```
registres HA  →  index  →  appareils  →  capacités  →  actions
                                     ↘  profils   ↗
                                          ↓
                                    présentation  →  santé
```

---

## 1. `discovery.js` — ce que Home Assistant sait

Lit les quatre registres (zones, étages, appareils, entités) et les croise avec
`hass.states`.

**Le problème résolu.** Les commandes `config/*_registry/list` de Home Assistant
sont **réservées aux administrateurs**. Sur un compte ordinaire, la découverte
ne renvoyait rien : ni pièces, ni zones, ni appareils, et l'interface retombait
sur ce qu'elle pouvait deviner des seuls états. Le composant
`custom_components/loggia` tourne dans Home Assistant, lit ces registres avec ses
propres droits, et les expose à **tout compte authentifié** par la commande
`loggia/discovery`.

Le client garde le repli sur les commandes natives : si le composant n'est pas
installé, un administrateur obtient la même chose qu'avant.

**Ce qui en sort.** `buildIndex` rend `entityMeta` (appareil, zone, catégorie,
**plateforme**, classe), `deviceMeta` (fabricant, modèle, firmware, intégration,
`via`), les zones, les orphelines, et `services` — la liste de ce que
l'installation sait faire.

---

## 2. `devices.js` — l'appareil comme unité

Home Assistant expose des entités ; un thermostat en a cinq, une caméra huit. Le
dashboard raisonnait entité par entité, ce qui suffit pour afficher une valeur
mais pas pour répondre à « de quoi cet appareil est-il capable ».

Deux prudences y sont inscrites, plutôt que laissées à l'appelant :

- **Une entité sans appareil n'en fabrique pas un.** Les entités YAML, template
  et les groupes existent sans appartenir à rien.
- **Une seule entité muette ne met pas l'appareil hors ligne.** Le capteur de
  signal d'une caméra peut se taire alors que le flux enregistre.

**Le rattrapage d'intégration.** Un appareil sur dix n'a aucune intégration dans
le registre — il a été créé sans `identifiers`. Ses entités, elles, portent
toujours leur plateforme : `buildDevices` prend celle qui a créé le plus
d'entités de l'appareil et le signale par `integrationDeduite`.

---

## 3. `capabilities.js` — ce qu'une entité sait faire

**Trois sources, dans cet ordre.**

`supported_features` est un masque de bits dont le sens dépend du domaine : le
bit 4 vaut `SET_POSITION` pour un volet et `VOLUME_SET` pour un lecteur. Des
tables couvrent dix-huit domaines.

`supported_color_modes` ensuite, parce que **les lampes ne mettent ni la couleur
ni la luminosité dans le masque**. Deux lampes au masque identique peuvent être
l'une en `onoff` et l'autre en `xy`.

Les attributs présents enfin, pour ce que l'entité *rapporte* — distinct de ce
qu'elle *accepte*. Une climatisation qui ne publie pas `current_humidity` ne
mesure pas l'humidité, et afficher un tiret vaut mieux qu'inventer une valeur.

**Les services ne disent pas ce qu'une entité accepte.** Le domaine `cover`
publie `set_cover_tilt_position` même quand aucun volet de la maison n'a
d'inclinaison : les services appartiennent au DOMAINE. Ils servent donc de
garde-fou — un domaine non chargé ne commande rien — et de seule source pour les
domaines sans masque (un bouton, un script, un interrupteur).

**Pilotage et maintenance sont séparés.** Installer une mise à jour est une
capacité réelle, mais ce n'est pas commander la maison : sur une installation
ordinaire, les entités `update` sont les plus nombreuses de toutes et
noieraient tout classement. Les entités de réglage et de diagnostic sont
écartées pour la même raison.

---

## 4. `actions.js` — d'une capacité à un appel

`planAction` décide sans rien envoyer, ce qui le rend testable et permet à une
vue de savoir **à l'avance** si un geste aboutira. `runAction` envoie et
rapporte ce qui s'est passé.

Trois défauts corrigés par rapport aux appels directs :

| Avant | Maintenant |
|---|---|
| Aucune vérification : un volet sans position recevait `set_cover_position` | L'entité doit déclarer la capacité, sinon refus motivé |
| Bornes en dur (`5..30`) alors qu'une climatisation monte à 35 | Bornes lues sur l'entité, et `clamped` signale une valeur ramenée |
| `catch (e) {}` : un refus de permission ne laissait aucune trace | L'échec revient à l'appelant, avec le plan pour le diagnostic |

Le nom du service diffère souvent du nom de la capacité : `return_home` devient
`vacuum.return_to_base`, `set_brightness` devient `light.turn_on` avec
`brightness_pct`. La table de traduction couvre vingt-cinq domaines.

---

## 5. `profiles.js` — ce que les attributs ne disent pas

Une table **déclarative**. Un profil se reconnaît par intégration, fabricant,
modèle, ou par **comportement observé** — jamais par identifiant d'entité. Il
doit valoir chez quiconque possède le même matériel, et rester inerte chez qui
ne l'a pas.

Ce qu'un profil peut porter : `merge` (plusieurs entités pour un seul objet),
`roles` (qui porte quoi quand l'information est éparpillée), `hide`, `commands`
(services propres à une intégration), `presentation`, `notes`.

**La disponibilité passe avant la préférence.** Le profil des caméras
multi-flux préférait d'abord la haute définition — jusqu'à ce qu'une caméra
réelle publie trois flux dont le seul « haute définition » était hors service
pendant que les deux autres enregistraient. `primaryEntity` écarte donc ce qui
ne répond pas, puis trie par nom.

---

## 6. `present.js` — ce qu'une carte montre

Ne dessine rien : décide. Trois questions.

**Qui mérite une carte.** Un appareil avec du matériel derrière ET quelque chose
à montrer — une commande ou une valeur. Les entrées de service (un appareil par
dépôt suivi) sont écartées : légitimes, mais ce ne sont pas des objets qu'on
manipule.

**Quels boutons.** Ceux qui aboutissent, avec leurs bornes. Une commande à liste
n'est offerte que si l'entité publie de quoi choisir.

**Quoi dire quand ça ne répond pas.** Trois états plutôt qu'un booléen : `ok`,
`degraded` (une partie se tait, la carte reste utile), `offline` (ce qui est
affiché n'est plus d'actualité).

---

## 7. `health.js` — des incidents, pas des symptômes

Une installation ordinaire contient en permanence des centaines d'entités qui ne
répondent pas sans que rien n'aille mal. Afficher « 867 problèmes » n'informe
personne : cela apprend à ignorer ses propres alertes.

Quatre distinctions :

- **`unavailable` n'est pas `unknown`.** La première dit que l'intégration ne
  répond pas ; la seconde qu'une entité existe sans avoir encore de valeur.
- **Une intégration entièrement muette est UN incident.** Seuil de trois
  entités, pour ne pas confondre avec un appareil éteint.
- **Une passerelle tombée explique ce qu'elle porte.** La nouvelle utile est la
  passerelle, pas ses trente capteurs.
- **La simultanéité plutôt que la durée.** `last_changed` est remis à zéro au
  démarrage de Home Assistant : « indisponible depuis deux heures » peut vouloir
  dire « n'a jamais répondu ». On ne date donc pas une panne — mais l'heure
  commune, elle, ne ment pas.
- **Un démarrage n'est pas une panne.** Au démarrage, *tout* bascule à la même
  seconde — 2040 entités sur 2442 sur l'installation d'essai. `bootMinute()`
  reconnaît la minute qui concentre la majorité des changements, et ce qui a
  basculé à ce moment-là n'est plus présenté comme une chute. Sans cette règle,
  chaque redémarrage annonçait une catastrophe.
- **Un résidu n'est pas une entité en panne.** Une automatisation, un script,
  une case à cocher ne dépendent d'aucun réseau : ils sont créés au démarrage à
  partir de la configuration. Muets *depuis* le démarrage, ils n'ont plus de
  définition — seule leur entrée de registre a survécu à une suppression ou à un
  renommage. 112 entités de l'installation d'essai sont dans ce cas. La preuve
  est arithmétique : le nombre d'entités vivantes égale exactement le nombre
  déclaré dans les YAML (40 `input_boolean` vivants pour 40 déclarés, 32
  `input_number` pour 32, 13 `input_select` pour 13, 3 `timer` pour 3).

> Ces deux règles ont été écrites après une erreur de diagnostic : le moteur
> annonçait « 859 entités tombées ensemble, donc Home Assistant lui-même », et
> j'en ai conclu deux fois à un plantage. Le fichier `home-assistant.log.fault`
> que j'avais pris pour la trace d'un crash est créé et vidé par le
> `faulthandler` de Python **à chaque démarrage** ; sa taille de zéro octet le
> disait déjà, et la machine tournait depuis vingt-deux jours.

**`core` et `local`.** Une chute qui ne touche *que* des entités de
configuration est `local`. Mais il suffit qu'**une seule** entité locale soit
tombée pour mettre Home Assistant lui-même en cause (`core`) : une intégration
qui tombe ne peut pas faire taire les automatisations d'une autre.

---

## Ce que les tests garantissent

`tests/generique.test.mjs` lit les fichiers source et vérifie ce qui n'y est
**pas** : aucun identifiant d'entité dans une chaîne littérale, aucun nom de
personne, aucune adresse ni jeton, aucune marque dans les moteurs, aucune
dépendance à React ou au navigateur dans les moteurs.

`tests/bout_en_bout.test.mjs` enchaîne les moteurs sur trois installations
inventées — vide, une seule lampe, une maison à ventilateur, portail, serrure et
chauffe-eau. Aucune ne contient d'entité de l'installation de développement.

```bash
npm test
```

---

## Diagnostic sur une installation réelle

Depuis la console du navigateur, dans le cadre du dashboard :

```js
loggiaDiscovery.report()      // zones, capacités, appareils, vues proposées
loggiaDiscovery.healthText()  // les incidents, regroupés par cause
loggiaDiscovery.devices       // Map device_id → appareil
loggiaDiscovery.abilities     // qui sait faire quoi, et combien
loggiaDiscovery.knowledge     // quels profils s'appliquent
loggiaDiscovery.planAction(id, 'set_brightness', 60, loggiaDiscovery.ctx)
```

`planAction` ne fait qu'établir un plan : rien n'est envoyé tant que
`runAction` n'est pas appelé.
