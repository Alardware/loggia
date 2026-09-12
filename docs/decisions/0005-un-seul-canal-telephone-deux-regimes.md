# ADR 0005 — Un seul canal pour le téléphone, deux régimes

**Statut** : appliqué (v3.10.0).

## Contexte

Chaque règle qui prévenait appelait `notify` à sa façon. Rien ne savait se
taire la nuit, et rien ne savait passer par-dessus le mode silencieux du
téléphone quand il le fallait. Une règle qui réveille pour une pile à plat
se fait débrancher dans la semaine ; une fumée qui n'a pas sonné ne se
pardonne pas.

## Décision

Tout passe par `regles.prevenir(critique=…)`. Deux régimes, rien entre les
deux :

- **critique** — fumée, gaz, monoxyde, fuite, alarme (`alertes.DANGER`) :
  passe toujours, avec les données qui contournent le mode silencieux
  (Android `channel: alarm_stream`, iOS `push.sound.critical: 1`). C'est le
  seul canal qui contourne les heures calmes ;
- **ordinaire** — pendant les heures calmes (`loggia_alertes.calme`, une
  plage qui peut traverser minuit), la notification part **silencieuse**
  (`importance: low`, `push.sound: none`). Elle n'est pas différée : on la
  lit au réveil, et une notification qui arrive à sept heures pour une pile
  à plat de trois heures n'apporte rien de plus.

Chaque envoi laisse une ligne au journal avec son régime. Sans téléphone
choisi, la ligne dit « personne à qui parler ».

## Conséquences

- Les heures calmes se règlent à côté du téléphone, dans Paramètres ›
  Alertes — un seul endroit pour tout ce qui concerne le téléphone.
- « Ni ne parle à voix haute » : aucun module ne parle encore sur une
  enceinte ; `calme()` est là pour ce jour-là.
- Les données spécifiques aux apps compagnon sont ignorées par un service
  `notify` d'un autre type ; le canal est fait pour l'app compagnon.
