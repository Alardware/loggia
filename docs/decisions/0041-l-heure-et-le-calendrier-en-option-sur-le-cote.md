# 0041 — L'heure et le calendrier, en option sur le côté de l'Accueil

Date : 17/09/2026 (v3.42.0). Statut : acceptée. Trois captures fournies par
l'utilisateur — des aiguilles sur de grands chiffres et trois tuiles heures ·
minutes · secondes ; une semaine sous deux tuiles (agenda, coucher du soleil) ;
un mois à côté de l'heure d'ici et d'ailleurs — avec une consigne : « sur le
côté à l'accueil voici d'autres widgets que l'on pourrait mettre, pour l'heure
2 styles, calendrier également ».

## Contexte

Le rail de l'Accueil porte ce qui demande un regard : À surveiller, la météo,
En ce moment, Rappels, Agenda. La veille (ADR 0032), deux cartes de dates y
avaient été fondues en une seule à la demande de l'utilisateur : le mini-mois
disait QUAND, la liste disait QUOI. L'heure, elle, vit dans l'en-tête.

## Décision

- **Deux sections EN OPTION, `heure` et `calendrier`, qui ferment le rail.**
  « Que l'on pourrait mettre » : elles ne s'imposent à personne. Absentes par
  défaut — le rail reste celui de l'ADR 0032, une seule carte de dates —, elles
  apparaissent en mode édition comme une ligne grisée « Heure · en option »
  avec un bouton « Ajouter ». La croix les retire. Un vieux masquage de
  l'ancienne section « calendrier » ne les concerne pas : un widget en option
  se lit dans `ajoutees`, pas dans `caches`.
- **Deux styles chacun, choisis en mode édition** par deux puces posées sous
  le nom de la section (à côté du nom, elles le tronquaient dans un rail de
  276 px ; le contenu d'une section étant inerte en édition, le choix ne peut
  pas se faire dans le widget).
  - Heure · *Aiguilles* : la date, l'heure en grands chiffres très pâles, les
    trois aiguilles par-dessus (la trotteuse à l'accent du thème), et le temps
    qu'il fait dessous quand une entité météo répond.
  - Heure · *Tuiles* : heures · minutes · secondes, trois tuiles.
  - Calendrier · *Semaine* : une tuile Agenda (le prochain rendez-vous
    d'aujourd'hui et combien d'autres, ou « Aucun événement aujourd'hui » ; un
    tap ouvre le calendrier), une tuile soleil (le PROCHAIN rendez-vous :
    coucher, ou lever la nuit), puis la semaine, aujourd'hui cerclé.
  - Calendrier · *Mois* : l'heure d'ici et jusqu'à quatre villes, à côté de la
    grille du mois — quatre à six rangées, les jours voisins estompés.
- **La disposition des captures, les teintes de Loggia.** Surface, filet et
  ombre des autres cartes du rail ; le panneau violet de la capture devient un
  lavis de l'accent du thème. Aucune couleur en dur (leçon de l'ADR 0038).
- **Rien sans source.** Pas d'entité `calendar` : pas de tuile Agenda. Pas de
  `sun.sun`, ou pas de date à venir : pas de tuile soleil. Pas de météo : pas
  de ligne sous les aiguilles. Un fuseau que `Intl` ne sait pas lire ne donne
  pas d'heure — la ligne disparaît plutôt que de mentir.
- **Les villes se règlent** (le globe de la section, style Mois) : un nom, un
  fuseau « Europe/Paris », la liste des fuseaux du moteur en suggestion. Jamais
  réglées : les quatre de la capture. Une liste VIDE reste vide — le panneau
  montre alors la date.
- **La semaine commence le jour que la langue dit** (`Intl.Locale`), lundi
  quand le moteur ne sait pas.
- **L'agencement est par format** (ordinateur, tablette, téléphone), comme le
  reste de l'Accueil : ajouts, styles et villes suivent la grille du format en
  cours, et un format sans grille propre suit celle de l'ordinateur.
- **Un widget absent ne tourne pas** : il n'est pas monté. Présent, il bat à
  la seconde (heure) ou à la minute (calendrier), calé sur la frontière ronde.

## Conséquences

Ce qui se calcule vit dans `src/horloge.js`, pur et testé à sec
(tests/accueil_widgets_temps.test.mjs, 40 mutations tuées) ; `src/widgetsrail.jsx`
ne garde que le dessin et la feuille des villes. `loggia_accueil` gagne trois
clés, relues au chargement : `ajoutees`, `styles`, `villes`. Les chiffres
suivent la largeur du widget (requêtes de conteneur) : 276, 330 et 362 px
vérifiés, rien de tronqué. La carte « Horloge » du catalogue des vues
personnalisées reste telle quelle. Non fait : un point sous les jours qui
portent un rendez-vous (seuls sept jours d'agenda sont lus), choisir un jour
dans la semaine, d'autres widgets en option — le mécanisme (`WIDGETS_OPTION`)
les accueillerait.
