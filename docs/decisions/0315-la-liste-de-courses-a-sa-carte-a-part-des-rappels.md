# 0315 — La liste de courses a sa carte, à part des rappels

*1er novembre 2026 — à l'essai (rien de publié) (lot 11 du rapport « Gladys comparé au catalogue », 31/10 : D20, K1)*

*Complète l'ADR [0133](0133-les-rappels-sont-les-listes-de-taches-de-la-maison.md) : une liste d'achats n'est pas une liste de rappels.*

## Le problème

- **D20.** La carte « Rappels » de l'Accueil rangeait les tâches de TOUTES les listes `todo.*` dans trois onglets de dates
  (Aujourd'hui · Demain · Plus tard). Une tâche sans date tombe dans « Plus tard » (`rangerTodos`, `todos.js`). Une liste
  d'achats n'a jamais de date : tous ses articles finissaient dans « Plus tard », mêlés aux rappels qui attendent leur jour.
- Chez l'utilisateur (registre lu le 01/11, lecture seule), la liste d'achats est celle de la plateforme `shopping_list`, la
  liste de courses de Home Assistant. Une liste Alexa du même genre existe, désactivée.
- **K1.** Le rapport propose : une liste sans dates de la plateforme `shopping_list` a sa section, pour ajouter et cocher,
  sans les onglets de dates.

## La décision

- **Quelle liste.** Celle de la plateforme `shopping_list`, reconnue à sa plateforme dans l'index (`estCourses`, `todos.js`,
  par `plateformeDe`), jamais à son nom ni à son identifiant (ADR 0164). `listesTodo` le note (`courses`).
  - Une liste `todo` ordinaire reste une liste de rappels, même si aucune de ses tâches n'a de date. Juger « sans dates » sur
    son contenu ferait changer une liste de carte au premier rappel daté : écarté.
  - Sans index (avant la première réponse du serveur), rien n'est une liste d'achats : la carte reste celle d'avant.
- **Les rappels.** Les articles d'une liste d'achats ne sont plus rangés dans les onglets (`rangerTodos`), ni comptés dans
  « N à faire aujourd'hui ». Le « + » des rappels ne propose plus cette liste.
- **La carte des courses** (`courses.jsx`), posée sous celle des rappels, avec l'écart du rail :
  - le nom que Home Assistant donne à la liste, puis « 2 articles à acheter » ou « Rien à acheter » ;
  - un champ « Ajouter un article » et son bouton, si la liste accepte la création (`supported_features`) ;
  - une ligne par article qui reste, la même que celle d'un rappel (`LigneRappel`), sans répéter le nom de la liste ; la
    pastille coche l'article si la liste l'accepte ;
  - pas d'onglets, pas de date, pas d'heure.
  - Une maison qui n'a QUE la liste d'achats n'a que cette carte. Une maison sans elle n'a que celle des rappels.
- **Aucune commande d'elle-même.** Ajouter (`todo.add_item`, sans `due_date` ni `due_datetime`) et cocher (`todo.update_item`,
  `status: completed`) partent d'un geste, par les fonctions des rappels (`ajouterTache`, `marquerFait`). L'Accueil relit les
  listes après le geste, comme pour un rappel.
- **Le démarrage.** La carte des courses se charge à la demande (`lazyRecharge`, ADR 0145), et seulement s'il y a une liste
  d'achats. Pour la place, le formulaire « Nouveau rappel », qui ne s'ouvre que sur le « + », sort aussi du démarrage
  (`nouveaurappel.jsx`). Le démarrage passe de 1 063 121 à 1 061 012 octets.
- **La démo** : la liste « Courses » devient la liste d'achats (`shopping_list`, sans les droits de date). Ses deux articles
  n'ont pas de date. Un rappel « Rappeler le garage », pour demain, garde de quoi montrer l'onglet « Demain ».

## Les conséquences

- Sans redémarrage de Home Assistant : l'index porte déjà la plateforme.
- Quatre textes neufs, en sept langues. Rien au téléphone.
- Tests : `tests/courses_a_part.test.mjs` (13 tests). Deux assertions modifiées, parce que le formulaire a changé de fichier :
  `tests/feuilles.test.mjs` (la croix) et `tests/rappels.test.mjs` (la taille des boutons, relue dans les trois fichiers).
- Pas fait :
  - les articles cochés ne se montrent pas, et rien ne les efface (« Vider les articles cochés ») ;
  - l'ordre des articles ne se change pas à l'écran ;
  - la liste d'achats d'Alexa (`alexa_devices`) n'est pas reconnue : la règle ne lit que la plateforme `shopping_list`, et
    cette liste est désactivée chez l'utilisateur. La reconnaître demanderait une règle de plus, à sa clé.
- Vérifié dans les tests seulement : rien n'a été essayé chez l'utilisateur.
