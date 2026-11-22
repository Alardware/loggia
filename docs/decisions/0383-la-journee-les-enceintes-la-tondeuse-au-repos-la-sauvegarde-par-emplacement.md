# 0383 — La journée de chacun, grouper les enceintes, la tondeuse au repos, la sauvegarde par emplacement

*21 novembre 2026 — appliqué (v3.100.0) (chantier du 20/11, lot 3 : P3, P6, P7, P10)*

## Le problème

Le 20/11, une revue de Loggia a cherché ce qui manquait pour des maisons
équipées autrement que la sienne. L'utilisateur a validé
ces quatre points le 21/11. Deux d'entre eux ont été vérifiés chez lui, en
lecture seule, avant d'écrire une ligne.

- **P3.** La feuille Présence disait où est chacun et depuis quand, pas sa
  journée. Elle ne disait pas non plus la pile de son téléphone, alors qu'un
  téléphone qui s'éteint ne dit plus « il est rentré », ce qui fausse
  l'armement et le désarmement.
- **P6.** Loggia savait qu'un lecteur peut se grouper (le bit GROUPING), mais
  n'offrait aucun moyen de grouper ni de dégrouper les enceintes.
- **P7.** Il fait beau et la tondeuse ne sort pas. La fiche ne disait pas
  pourquoi. Chez lui, la Mammotion publie ses heures de repos
  (`non_work_hours`, « 09:00pm - 10:00am »).
- **P10.** Le cas silencieux : la sauvegarde « réussit », mais sa copie chez
  Nabu Casa n'est pas partie. Chez lui, Home Assistant garde pour chaque
  sauvegarde les emplacements où la copie a échoué (`failed_agent_ids`).

## La décision

**P3, la journée de chacun** (`journeepresence.js`, feuille Présence).
- Sous « zone · depuis », une ligne : « Départ 08:12 · Travail 08:40 ·
  Retour 18:30 · téléphone 18 % ».
- La journée vient de l'historique des `person` depuis minuit
  (`history/period`), lu une fois à l'ouverture de la feuille. Elle donne les
  quatre derniers mouvements réels. Un état muet n'en est pas un. Le nom d'une
  zone reste celui de la maison.
- Le téléphone est le `device_tracker` de l'application compagnon
  (`mobile_app`) que la personne porte (`device_trackers`). Sa pile est le
  capteur `battery` de SON appareil.
- La pile ne change rien au compte « à la maison » : c'est une règle de
  sûreté.

**P6, grouper les enceintes** (`groupelecteurs.js`, la fiche d'un lecteur, après le minuteur).
- « Jouer aussi dans » : une puce par enceinte qui sait se grouper, de la
  MÊME intégration. Elle est bleue quand l'enceinte est dans le groupe
  (`group_members`). « Tout dégrouper » s'ajoute quand le groupe a des
  membres.
- Les ordres sont `media_player.join` et `media_player.unjoin`. Grouper ne
  lance aucune lecture.
- Rien n'apparaît sur un lecteur qui ne sait pas se grouper, ni sur un écran
  tenu par le mode enfant.

**P7, la tondeuse au repos** (`robotsfiche.js`, `lignesEtat`).
- Garée ou au repos, à l'intérieur de la plage du capteur de clé
  `non_work_hours`, la fiche écrit « Heures de repos jusqu'à 10:00 ».
- La plage se lit en 12 h comme en 24 h, et peut passer minuit. Hors de la
  plage, en tonte, ou sans le capteur, la fiche ne dit rien.
- L'autotest (`self_check`) n'est pas lu : il ne publie pas la liste de ses
  valeurs.
- La démo porte le capteur.

**P10, la sauvegarde par emplacement** (`sauvegardelieux.js`, vue Système).
- Sous « Dernière sauvegarde », la vue écrit « Cette machine : copiée · Nabu
  Casa : copie ratée », et « · 1 élément manqué » s'il manque un module ou un
  dossier.
- L'échec passe l'icône à l'ambre. Une seule copie réussie ne dit rien de
  plus.
- Les données viennent de `backup/info`, réservé aux administrateurs (un
  compte ordinaire ne voit rien), et les noms de `backup/agents/info`.
  L'emplacement local et Nabu Casa ont leur propre nom.

## Les conséquences

Écran seul : aucun fichier Python, pas de redémarrage de Home Assistant.
Treize textes nouveaux dans les six catalogues ; pl.js n'a que des ajouts,
avec la forme `{few, many, other}` pour un pluriel.

Les tests : `tests/chantier_2011_lot3.test.mjs`. Aucun test existant n'a
été modifié. La vue Système garde `enDefaut={!!defautSauvegarde}`, que son
test épingle : c'est le panneau qui ajoute l'échec d'un emplacement.

Pas fait :
- la journée ne se relit pas pendant que la feuille est ouverte ;
- la démo n'a ni téléphone d'application compagnon, ni enceinte qui se
  groupe, ni `backup/info` : les aperçus sont injectés en mémoire ;
- grouper chez l'utilisateur (Music Assistant) n'a pas été essayé, car on
  ne lance jamais rien chez lui.
