# ADR 0014 — Une seule échelle de priorités pour toute la maison

**Statut** : appliqué (v3.11.0) — `regles.ECHELLE`, `niveau()`.

## Contexte

Les priorités (ADR 0003) ne valent qu'à l'intérieur d'un module. Quand deux
modules visent la même lampe — la nuit éteint les lampes oubliées,
l'éclairage nocturne en allume une, le départ éteint tout —, rien ne dit qui
gagne, et deux règles peuvent se battre.

## Décision

Une **échelle unique**, déclarée dans le socle, en quatre paliers :

1. **sûreté** — le danger (§18), le vent fort ;
2. **présence** — le départ, le retour, le mode invité ;
3. **nuit** — la fermeture du soir, l'extinction, la veilleuse ;
4. **confort** — la protection solaire, l'ouverture du matin, l'éclairage
   doux, le préchauffage.

Chaque module prend ses niveaux dans son palier ; à l'intérieur d'un palier,
l'ordre reste au module. Au-dessus de tous : une main (ADR 0002). Le journal
dit qui a cédé à qui, module compris.

## Conséquences

- `volets.PRIORITES` se recale sur l'échelle sans changer d'ordre relatif.
- Une règle qui ne sait pas où se placer se place en confort, jamais en
  sûreté : la sûreté se mérite.
- Une tenue simulée ne retient jamais une règle réelle d'un autre module
  (ADR 0004).
