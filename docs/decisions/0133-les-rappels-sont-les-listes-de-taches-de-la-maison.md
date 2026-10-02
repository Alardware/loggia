# 0133 — Les rappels sont les listes de tâches de la maison

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

La carte « Rappels » de l'Accueil portait deux lignes qui n'avaient rien à voir
l'une avec l'autre : le prochain repas du chat, et le prochain ramassage. Un
dessin fourni le 03/10 en fait une **vraie liste de choses à faire** — « Rappels
· 4 à faire aujourd'hui », un bouton « + », trois onglets (Aujourd'hui · Demain
· Plus tard), et des lignes avec leur pastille de couleur, leur catégorie et
leur heure, « En retard » en rouge.

## Pourquoi `todo`, et pas un calendrier

**Un rappel se coche ; un rendez-vous, non.** Un rappel dont l'heure est passée
est EN RETARD ; un rendez-vous passé est simplement passé. Le domaine `calendar`
de Home Assistant n'a ni « fait » ni « en retard » : il aurait fallu les
simuler. Le domaine **`todo`** les a — chaque liste y est une entité `todo.…`,
chaque tâche a une échéance, un statut, et les services `todo.add_item`,
`todo.update_item`, `todo.remove_item`.

Un deuxième avantage, décisif : les rappels existent alors **aussi** dans
l'application de Home Assistant, sur le téléphone, et une automatisation peut
s'en servir. Loggia les montre, elle ne les possède pas.

Rien à ajouter côté serveur : le contenu d'une liste se demande par service avec
réponse, exactement comme la météo demande ses prévisions (`hass.callWS` avec
`return_response`). L'entité, elle, ne porte que le NOMBRE de tâches à faire —
c'est lui qui signale un ajout ou une coche venus d'ailleurs, et qui déclenche
la relecture.

## Adapté à tous, pas à une seule maison

**« Il faut que ce soit adapté à tous, pas juste à moi. »** Trois conséquences,
et elles ont façonné le code :

- **Les catégories ne sont pas écrites dans Loggia.** « Maison », « Santé »,
  « Voiture » sont les listes de QUELQU'UN. Ce sont les entités `todo.*` que
  chacun possède, avec le nom que Home Assistant leur donne. Un test refuse que
  ces mots apparaissent dans `src/todos.js`.
- **Pas de liste chez vous : pas de carte.** Comme l'agenda. Zéro
  configuration, zéro bruit.
- **Une liste en lecture seule n'offre ni « + », ni case à cocher.** Les droits
  se lisent dans `supported_features` : un abonnement partagé refuserait le
  geste, et le refus serait silencieux.

La couleur d'une liste la distingue : à six listes ou moins, chacune a la
sienne ; au-delà, un hachage de l'identifiant reprend la main — il faut bien que
deux listes partagent, autant que ce soit stable d'une session à l'autre.

## Le retard, à l'heure près ou au jour près

Une tâche **avec heure** est en retard à la minute. Une tâche **sans heure** ne
l'est que son jour passé : « arroser les plantes » posé pour aujourd'hui ne doit
pas rougir dès minuit une.

Les tâches en retard rejoignent l'onglet « Aujourd'hui », **en tête** : elles
attendent qu'on s'en occupe maintenant, et un onglet « En retard » qui
n'existerait que les mauvais jours ferait danser la barre. Celles qui n'ont pas
de date vont dans « Plus tard », derrière celles qui portent un jour.

## La collecte : un bandeau, pas une carte

« J'aime beaucoup la carte collecte. » Une carte complète a d'abord été faite —
à tort, et deux fois : **sans avoir vu le dessin**, puis avec sa propre bande de
sept jours. « Ça fait dupliquer le calendrier » : la carte Agenda porte déjà
cette bande, et les collectes y figurent puisqu'elles viennent d'un calendrier.

Il ne reste donc que le **bandeau**, et sa place est juste **au-dessus de
l'Agenda** : le bac, quand le sortir, et un bouton « C'est sorti » qui passe au
**vert** une fois cliqué. Il se montre la veille au soir et le jour même, jamais
le reste du temps — un point d'attention doit être actionnable et rare.

« C'est sorti » se retient par DATE : le lendemain, le bandeau revient de
lui-même pour la collecte suivante, sans rien à effacer.

Les couleurs des bacs ne sont pas décidées pour une commune : les familles
répandues se reconnaissent à leur nom, dans les sept langues (ordures,
recyclables, verre, biodéchets), et tout nom inconnu prend la couleur suivante.
Chacun ses bacs, chacun ses mots.

`src/collecte.js` lit aussi un **capteur** quand il y en a un, sous les formes
rencontrées : des attributs écrits à la main (`jours_restants`,
`est_aujourd_hui`), ceux d'une intégration répandue (`daysTo`, `date`,
`types`), ou rien qu'un état portant une date ou un nombre de jours. Quand rien
ne se lit, il rend `null` : pas de carte vaut mieux qu'une carte qui invente.

## Les Rappels ne se cachent plus

La carte était masquée par défaut, parce que ses deux lignes ne concernaient pas
grand monde. Elle montre maintenant les listes de chacun, et **n'existe pas**
chez qui n'en a aucune : elle ne peut plus faire de bruit, donc elle n'a plus à
se cacher. Un agencement déjà enregistré garde le sien — on ne réécrit l'accueil
de personne.

## Deux dates parties en UTC

Trouvées en regardant l'écran, pas le code. La démonstration écrivait ses dates
avec `toISOString()`, qui rend de l'**UTC** : après 22 h en France, « demain »
redevenait aujourd'hui, et la collecte du lendemain s'affichait « à sortir ce
matin ». Une tâche de 9 h s'affichait à 7 h pour la même raison. Une journée
entière se dit en date LOCALE ; un rendez-vous à l'heure, lui, est un instant et
part bien en ISO.

Au passage, `echeanceDe` accepte les deux écritures que Home Assistant emploie —
`2026-10-03 19:30:00` et `2026-10-03T19:30:00`. Lue à la lettre, la forme à
espace passait pour une date SANS heure, et une tâche ajoutée pour le soir même
atterrissait dans « Plus tard ».

## Ce qu'on a appris

**Un dessin existe peut-être déjà : demander avant de dessiner.** La carte
Collecte a été inventée de toutes pièces sur une phrase de six mots, alors
qu'une maquette l'attendait. Deux versions jetées.

**Une bande de sept jours de plus est une bande de trop.** La deuxième carte
répétait ce que la première montrait déjà ; le besoin tenait dans trois lignes
et un bouton.

1103 tests JavaScript, 590 tests Python, lint et audit propres.
