# 0029 — Les cartes pièces disent leur état

Date : 16/09/2026 (v3.30.0). Statut : acceptée. Deuxième étape de la refonte
de l'Accueil (ADR 0028 pour la première et le plan).

## Contexte

La carte d'une pièce montrait la température, l'humidité, un badge CO₂ et le
compte des lumières — « 4 lampes allumées » ou « Tout éteint ». Rien de faux,
mais rien qui dise ce qui se passe : une fenêtre ouverte dans une chambre qui
chauffe, une télévision en marche, un chauffage qui tourne se lisaient
ailleurs, ou pas du tout. La proposition retenue avec l'utilisateur : « la
carte doit changer d'apparence selon l'état — maison calme, pièce active,
problème ».

Deux retours reçus le même jour sur l'étape 1, pris ici : la carte
« À surveiller » va sur le côté, avec En ce moment et Rappels (sur téléphone,
la seconde page ; la bannière garde le compte des points en première page) ;
et les points « n appareils hors ligne » et « entités tombées ensemble » du
diagnostic disparaissent — « prend de la place pour rien » : un appareil à
piles ou une imprimante qui dort n'est pas une panne, et une pile faible, la
veille le dit déjà.

## Décision

- **Une ligne d'état à priorité**, calculée par le module pur `ambiance.js` :
  un **problème** d'abord (fenêtre ou porte ouverte, CO₂ au palier
  « chargé »), sinon l'**activité** (« 4 lumières · TV · Chauffe »), sinon le
  **calme** (« Tout est éteint »). Le problème est orange avec un petit
  triangle, l'activité ambre — la couleur qu'avait déjà le compte des
  lumières —, le calme en retrait.
- **Rangé par zone, jamais par nom** : une passe sur les états rassemble par
  zone Home Assistant les lecteurs en lecture (et s'ils sont une
  télévision), les thermostats qui chauffent ou rafraîchissent, les portes et
  fenêtres ouvertes ; les lumières viennent du compte que la carte avait déjà,
  le CO₂ de la pièce. Une entité sans zone n'appartient à personne.
- **Le gabarit ne bouge pas** : icône, nom, température, badge, interrupteur,
  minis volets et clim restent à leur place ; seule la ligne de texte change,
  et sa couleur — pas la carte.

## Conséquences

Les radiateurs fil pilote (`switch`) ne disent pas « chauffe » : un contact
fermé n'est pas une chauffe en cours ; seuls les thermostats (`hvac_action`)
comptent. Une pièce sans zone pour ses lecteurs ou ses ouvrants ne les voit
pas sur sa carte — c'est la règle de toute la maison. Le compteur de lampes
seul n'existe plus sur l'Accueil ; il vit dans la ligne d'activité.
