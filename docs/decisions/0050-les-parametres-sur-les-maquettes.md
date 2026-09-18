# 0050 — Les Paramètres sur les maquettes, sans rien promettre de faux

Date : 18/09/2026 (v3.51.0). Statut : acceptée. Demande : « petit ajustement
des paramètres » (vingt captures de maquettes pour les dix pages) ; « par
contre dans à propos, soutenir le projet ne change pas, il reste tel quel ».

## Contexte

Les dix pages des Paramètres parlaient chacune à sa façon : des bandeaux de
section (`SecBar`), des cartes bordées dans des cartes, des en-têtes, des puces
et des tailles qui dérivaient d'une page à l'autre. Les maquettes proposaient
une seule grammaire : un en-tête (titre en italique, une ligne qui compte, les
actions à droite), des panneaux au titre en italique, des lignes séparées par
un filet qui court d'un bord à l'autre.

Plusieurs phrases des maquettes, écrites pour l'image, ne disaient pas ce que
fait Loggia. Elles ont été relues contre le code, une par une.

## Décision

- **Des briques communes** : `src/views/parcommun.jsx` — `Panneau`, `Ligne`,
  `Intertitre`, `Pastille`, les boutons, `quandCourt` (l'heure d'une ligne de
  journal, dans la langue choisie). `SecBar`, `SecGroup` et `SecTgl` sont
  partis avec le dernier bandeau.
- **Chaque page selon sa maquette.**
  - *Profils* : les utilisateurs en lignes (rôle, identifiant, dernière
    activité), le code administrateur dans son panneau.
  - *Apparence* : Thème, Couleurs, Affichage, Effets, Matière & formes ; les
    marges de l'écran repliées sous « Avancé ».
  - *Vues* : les deux actions dans l'en-tête, les icônes aux couleurs du menu,
    les vues secondaires réordonnables comme les autres.
  - *Règles* : **un seul** « Observer sans agir », au-dessus des onglets — il
    pose le drapeau des quatre modules qui commandent (volets, chauffage,
    départ, nuit). Chaque onglet garde son bandeau de simulation.
  - *Automatisations* : une recherche, trois filtres, les familles dans un
    panneau ; « Ouvrir dans Home Assistant », absent de la démo.
  - *Interrupteurs* : « Apprendre un bouton », les derniers appuis — une ligne
    par télécommande, à son dernier appui —, puis un panneau par télécommande.
    Chaque bouton se lit en français à côté de son code (`src/gestes.js`) ; un
    code qu'on ne sait pas lire n'a pas de libellé plutôt qu'un libellé
    inventé.
  - *Alertes* : Livraison, Ce qui alerte, La maison réagit. Les détecteurs se
    comptent avec les classes du composant (`alertes.py`, `BINAIRES` — un test
    compare les deux tables) ; le téléphone et la vanne se choisissent dans une
    liste.
  - *Connexion* : un panneau, les adresses, la bascule, l'intervalle,
    l'assistant.
  - *Mises à jour* : rangées par intégration (la plateforme du registre),
    firmwares d'abord ; « vérifié il y a » après une vraie demande.
  - *À propos* : l'installation en cinq lignes, la configuration en pied de
    panneau, la zone rouge. **La pastille Ko-fi reste telle quelle** : la tuile
    « Soutenir le projet » de la maquette n'a pas été reprise.
- **Ce qui part** (ce qu'une maquette pleine page ne montre pas) : le
  sélecteur de mode en tête d'Apparence (doublon), le curseur de marge, les
  cartes « Observer sans agir » de chaque onglet, les listes « Dernières
  coupures / passages / extinctions » (le Journal les a toutes), les puces de
  filtre du Journal, « Bon à savoir » et « Tester la session » dans Connexion,
  « Tout déplier » dans les Automatisations, la barre « Configuration » d'À
  propos (ses boutons sont au pied du panneau Installation).
- **Les phrases corrigées pour dire vrai** :
  - « profils locaux à cet appareil » → « profils du foyer » : ils suivent la
    maison ;
  - la remise à zéro « de cet appareil » → « pour toute la maison, une
    sauvegarde part d'abord » : `resetLoggiaComplet` vide la partie commune du
    serveur ;
  - « les deux adresses sont testées à l'enregistrement » → « Enregistrer
    recharge Loggia avec ces réglages » : rien n'est testé en enregistrant ;
  - la bascule « quand le réseau local ne répond pas » → « quand Home
    Assistant ne répond pas sous 2 s » : c'est ce que regarde le code ;
  - l'assistant « interrogé depuis la recherche » → « qui répond à l'orbe » ;
  - alertes coupées : le bandeau ajoute « La maison réagit quand même aux
    dangers » — la réaction ne dépend pas du téléphone (`_reagir`) ;
  - heures calmes « la nuit » → « pendant ces heures » : la plage se règle ;
  - la vanne « la première vanne » → « la première vanne d'eau » : c'est la
    règle du composant ;
  - le sommaire « Réglages propres à cet appareil » → « Réglages de Loggia ».
  - Les piles suivent les niveaux d'état (ADR 0047 : rouge à 5 %, ambre à
    20 %), pas les couleurs de la maquette.
- **La démo** reçoit de quoi montrer ces pages : des automatisations, des
  mises à jour Zigbee2MQTT et HACS, des détecteurs, une vanne, un téléphone
  et ses réglages d'alerte. Sans composant, les alertes s'y règlent dans la
  configuration de la démo, et l'essai d'envoi dit que rien ne part.
- **Sur téléphone**, les onglets des Règles glissent seuls (`.o-onglets`) ;
  l'interrupteur d'observation passe dessous au lieu de partir hors champ.

## Conséquences

Pas de changement côté serveur. Les tests qui épinglaient l'ancien dessin ont
été réalignés sur la même promesse, dite là où elle vit maintenant ; les
nouvelles sont dans tests/parametres_maquettes.test.mjs (15). Deux omissions
de dépendance, voulues, rejoignent l'inventaire relu (`lireObserve`,
`onCompte`). 209 textes ont leur traduction anglaise.
