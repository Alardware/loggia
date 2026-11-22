# 0382 — Six gestes du quotidien : l'alarme refusée et son auteur, le réveil de l'Echo, la télécommande maintenue, la relance, la sauvegarde

*21 novembre 2026 — appliqué (v3.100.0) (chantier du 20/11, lot 2 : P1, P2, P4, P5, P11, P13)*

## Le problème

Le 20/11, une revue de Loggia a cherché ce qui manquait pour des maisons
équipées autrement que la sienne. L'utilisateur a validé
le 21/11 six gestes de tous les jours qui manquaient ou se taisaient
(« Je valide : … P1, P2, P4, P5, P11, P13 … »).

- **P1.** Il touche « Absent », et Alarmo refuse parce qu'une fenêtre est
  ouverte : rien ne bouge à l'écran, et rien ne le dit.
- **P2.** Qui a désarmé l'alarme ? Le 17/10, un faux retour de la tablette
  la désarmait, et il avait fallu fouiller la base de Home Assistant pour le
  comprendre. Loggia ne lisait ni `changed_by` ni son propre journal.
- **P4.** Loggia lisait déjà les capteurs du prochain réveil, minuteur et
  rappel d'une Echo, mais seulement pour la reconnaître (`CLES_ECHO`) : il
  ne les montrait pas.
- **P5.** Sur la télécommande à l'écran, un appui égale une touche : pour
  monter le volume de dix crans, il fallait taper dix fois.
- **P11.** Loggia disait « X ne répond plus » et quoi vérifier, sans offrir
  de quoi relancer l'intégration.
- **P13.** Une mise à jour partait sans filet, même quand Home Assistant
  sait faire une sauvegarde avant de l'installer.

## La décision

**P1, l'armement refusé** (`alarmegeste.js`, carte `CvAlarm`).
- Ce qu'on sait d'Alarmo, lu dans sa source : quand il refuse, l'état
  reste `disarmed` et il publie `open_sensors`. Loggia ne dépend pas de son
  événement, qui est réservé aux administrateurs.
- Trois secondes après un geste d'armement de la carte, un panneau resté
  désarmé qui publie ses ouvrants a refusé. L'encadré ambre de la carte le
  dit : « Pas armée, encore ouvert : Fenêtre chambre ». Il se tait au bout de
  soixante secondes.
- « Armer quand même » appelle `alarmo.arm` avec `force`, le même mode et
  le code tapé. Le code reste en mémoire le temps du refus, jamais stocké.
- Ce bouton n'existe que pour Alarmo (`plateformeDe`), et ne part que d'un
  toucher : l'armement automatique du départ ne force jamais rien.

**P2, l'auteur.**
- D'abord Loggia : le journal de la présence (`loggia/presence/etat`, lu
  toutes les 60 s). Une ligne qui vise ce panneau à moins de 15 s du dernier
  changement d'état donne « par Loggia, au retour » ou « au départ ». Une
  ligne simulée ne compte pas.
- Sinon, `changed_by` : Alarmo y met le nom de la personne dont il a
  reconnu le code.
- La carte l'écrit sous son nom (« par Camille · il y a 12 min »), désarmée
  ou armée, jamais pendant l'armement ni l'alerte.
- Le journal de la vue Sécurité (le logbook de Home Assistant) n'est pas
  touché.

**P4, le réveil de l'Echo** (`echoprochain.js`).
- Les capteurs se reconnaissent sur l'appareil de l'enceinte, par leur clé
  de traduction : `next_alarm` ou `alarm`, `next_timer` ou `timer`,
  `next_reminder` ou `reminder`. Jamais par leur nom.
- La fiche écrit, sous le volume, le plus proche à venir de chaque sorte :
  « Réveil demain 06:45 · Minuteur 5 min · Rappel jeu. 18:00 ».
- Sans rien à venir, rien n'est écrit.
- La démo en porte un.

**P5, l'appui maintenu** (`maintien.js`, le pavé de la fiche média).
- Concerne les quatre flèches et Volume − / + : la touche part au
  `pointerdown`, puis se répète après 450 ms, toutes les 180 ms, 40 fois au
  plus.
- Tout s'arrête au relâchement, à la sortie du doigt, quand la page se
  cache, que la fenêtre perd la main ou que la fiche se ferme, y compris
  pendant l'envoi d'une touche.
- OK, Retour, Accueil, Lecture et Veille restent une touche par appui. Le
  clavier (Entrée) envoie une touche.

**P11, la relance.**
- Dans l'aide de panne d'une fiche, quand l'intégration se tait ENTIÈRE et
  que le compte est administrateur : « Relancer l'intégration ».
- Le bouton marche en deux temps (« Confirmer ? » pendant 4 s), comme
  « Redémarrer HA ».
- Il appelle `homeassistant.reload_config_entry` sur l'entité : le service
  accepte une entité pour cible, lu dans la source de Home Assistant.
- C'est dit fait à la réponse. Rien ne se relance tout seul, car une relance
  automatique tournerait en boucle.

**P13, la sauvegarde.**
- Dans « Mises à jour », la bascule « Sauvegarder avant d'installer » est
  mise par défaut. Elle n'apparaît que si une mise à jour offerte sait
  sauvegarder (bit 8 de `supported_features`).
- `backup: true` ne part qu'à celles-là, pour « Installer » comme pour
  « Tout installer ».
- `update.install` déclare `backup` parmi ses champs admis (`actions.js`).

## Les conséquences

Écran seul : aucun fichier Python, pas de redémarrage de Home Assistant.
Dix-huit textes nouveaux dans les six catalogues ; pl.js n'a que des ajouts.

Les tests : `tests/chantier_2011_lot2.test.mjs`. Aucun test existant n'a
été modifié : deux tests épinglent le texte du code (le message de la carte
Alarme, `admin: !compteOrdinaire(h)`), et ces textes sont restés tels quels.

Pas fait :
- la fiche d'un appareil (`appareils/fiches.jsx`) et le bouton rapide
  d'une carte arment sans dire le refus : seule la carte Alarme le dit ;
- les armements ne sont pas ajoutés au journal de la Sécurité ;
- la relance ne se propose que si l'intégration entière se tait, pas pour
  un appareil seul.
