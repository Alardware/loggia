# ADR 0002 — Une main posée sur une entité la gèle

**Statut** : appliqué (v3.7.0), complété en v3.9.0.

## Contexte

Une lampe allumée par quelqu'un et une lampe allumée par le dashboard se
ressemblent trait pour trait, et la règle suivante éteignait les deux. On
remonte un volet, le dashboard le redescend, on le remonte encore — et l'on
finit par tout débrancher. C'est le premier motif d'abandon de ce genre de
système, et il ne se corrige pas règle par règle.

## Décision

Home Assistant attache un contexte à chaque changement d'état ; il porte un
`user_id` quand il vient d'une personne, aucun quand il vient d'une
automatisation. C'est la seule différence disponible, et elle suffit. Une
entité touchée à la main est **gelée trente minutes** : les règles cessent
de la piloter. Le socle n'écoute que les entités que les modules lui ont
**déclarées** (`suivre`), pas toute la maison.

Le piège : notre propre ordre revient sous forme de changement d'état. Le
socle attache son propre contexte à chaque commande et reconnaît les siens ;
sans cela, la première commande gelait l'entité pour toujours.

Depuis v3.9.0, une main **reprend aussi la tenue** en cours (voir ADR 0003) :
sans quoi la règle rendrait l'entité derrière elle à la fin du gel.

## Conséquences

- Une règle à minuterie (extinction dans trois minutes) est suspendue par un
  geste : la main l'emporte (voir ADR 0012).
- Une entité pilotée mais non déclarée au socle laisse passer la main
  inaperçue : chaque module doit appeler `suivre` à chaque changement de
  configuration. Un test le garde par module.
