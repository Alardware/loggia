# ADR 0010 — Volet bloqué : un capteur muet n'est pas un ouvrant ouvert

**Statut** : décidé le 2026-09-12, à faire (§1).

## Contexte

La règle « Volet bloqué si l'ouverture est ouverte » (§1) reporte la
fermeture d'un volet tant que la baie devant lui est ouverte. Quand le
capteur d'ouverture est indisponible — pile à plat, liaison muette —, on ne
sait pas si la baie est ouverte.

## Décision

**Fermer quand même, et le dire.** Un capteur muet ne vaut ni ouvert ni
fermé ; dans le doute, la règle laisse faire la fermeture, et le journal
note « capteur indisponible ». Pas de notification à chaque fois : la
veille des appareils injoignables (§19) finira par signaler le capteur.

## Conséquences

- Le principe vaut pour toutes les règles : une entité muette se dit au
  journal, elle ne bloque pas silencieusement (critère 2, glossaire).
- Le report ne s'applique qu'à un capteur qui dit *ouvert* ; le rattrapage
  ferme dès qu'il dit *fermé*.
