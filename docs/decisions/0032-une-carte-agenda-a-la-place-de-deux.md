# 0032 — Une carte agenda à la place de deux

Date : 16/09/2026 (v3.33.0). Statut : acceptée. Cinquième et dernière étape
de la refonte de l'Accueil (plan dans l'ADR 0028 ; la sixième a été pliée
dans la troisième).

## Contexte

Le rail de l'Accueil finissait par deux cartes qui parlaient de la même chose
: le mini-mois (la semaine courante, un point par rendez-vous) disait QUAND,
la liste « Agenda » disait QUOI — cinq lignes sur sept jours. Deux cartes,
deux hauteurs, et la question « qu'est-ce qui vient ? » obligeait à lire les
deux. Le plan validé par l'utilisateur disait : « agenda d'abord — une carte
à la place de deux ».

## Décision

- **Une seule carte, « Agenda »**, dans l'ordre de lecture : la date du jour
  (qui ouvre le calendrier, comme le mini-mois le faisait), la bande des sept
  prochains jours — aujourd'hui d'abord, la pastille et les points du
  mini-mois, un jour se choisit —, puis ce qui vient : cinq lignes, ou le jour
  choisi en entier. Le badge dit combien il reste aujourd'hui, ou « rien ».
- **Toute la semaine est lue**, d'aujourd'hui minuit à sept jours, sans coupe
  : la bande compte chaque événement ; seule la liste se limite. Un rendez-vous
  commencé et pas fini est encore « à venir » ; une journée entière touche
  chaque jour de son début inclus à sa fin exclue.
- **Rien sans donnée.** Sans entité `calendar`, pas de carte ; sans événement,
  elle le dit (« Rien de prévu ces 7 jours »). La carte catalogue
  « calendrier » des vues personnalisées reste telle quelle.

## Conséquences

Le rail compte quatre sections : À surveiller, En ce moment, Rappels, Agenda.
Un agencement enregistré qui citait « calendrier » l'ignore simplement — un
masquage aussi. Le module pur `src/agenda.js` porte les règles de dates ; la
carte se dessine dans le rail avec les mêmes lignes que les autres panneaux.
Non fait : fusionner les Rappels (repas, ramassage) dans l'agenda — ce sont
des lignes d'état, pas des rendez-vous, et l'utilisateur les a nommés à part.
