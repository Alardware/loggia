# ADR 0015 — Un appui sur un interrupteur sans fil est une main

**Statut** : décidé le 2026-09-12, à faire (migration d'`interrupteurs`).

## Contexte

Un interrupteur sans fil (Zigbee2MQTT, ZHA, deCONZ) passe par Loggia, qui
appelle le service affecté sans contexte humain : pour le socle, c'est une
automatisation. Une lampe allumée au bouton pouvait donc être éteinte par
une règle dans la minute — l'inverse exact du respect du geste manuel.

## Décision

**L'appui est une main.** Le socle gèle trente minutes ce que le bouton a
commandé, reprend la tenue en cours, et note « bouton » au journal. Le
module ne peut pas fabriquer un contexte d'utilisateur : il déclare le geste
au socle lui-même, entité par entité.

## Conséquences

- Le socle gagne un point d'entrée pour déclarer une main sans contexte
  Home Assistant.
- Un bouton affecté à une scène ou à un script gèle ce que la scène a
  touché, dans la mesure où Loggia le connaît ; ce qu'il ignore reste
  pilotable par les règles.
