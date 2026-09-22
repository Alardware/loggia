# ADR 0006 — Les consommables se désignent, ils ne se devinent pas au nom

**Statut** : décidé le 2026-09-12 ; appliqué le 2026-09-22 (v3.68.0).

## Contexte

La règle « Consommables » (filtres d'aspirateur, de purificateur, brosses)
proposait de reconnaître les capteurs à leur nom — filter, brush, lifespan.
C'est contraire au premier critère : une règle se nourrit d'une
`device_class` ou d'un domaine, jamais d'un nom. Home Assistant n'a pas de
classe pour un filtre.

## Décision

**Désignation manuelle**, comme pour les radiateurs fil pilote et les
prises des heures creuses : l'utilisateur pointe une fois ses capteurs de
consommable. La règle n'inspecte aucun nom.

## Conséquences

- Le critère 1 gagne une seconde voie explicite : quand Home Assistant ne
  sait pas dire ce qu'est un capteur, l'utilisateur le désigne. Notée au
  glossaire.
- Sans désignation, la carte est grisée et dit quoi désigner (critère 2).

## Mise en œuvre (22/09/2026, v3.68.0)

- Une **quatrième veille** dans `veilles.py`, sur le modèle exact de celle des
  piles : `consommables = {actif, seuil, capteurs}`. Elle ne lit que les
  capteurs désignés, une fois par heure, et prévient une seule fois quand la
  valeur passe sous le seuil — dans l'unité du capteur (le plus souvent un
  pourcentage restant) — puis de nouveau après remplacement (retour franc
  au-dessus, même hystérésis que les piles). Un capteur muet ou disparu ne
  dit rien. Le message nomme le capteur et ce qu'il reste.
- **Désignation** dans Règles › Veilles › Consommables : un sélecteur
  d'entités, une puce par capteur désigné ; sans désignation, la règle dit
  quoi pointer (le capteur d'usure d'un filtre, d'une brosse, ou le niveau
  d'un réservoir).
- Ce que la fiche d'un robot montrait déjà par clé de traduction (ADR 0042)
  reste un affichage ; la veille, elle, prévient — y compris pour un réservoir
  de distributeur désigné, ce qui rend le « rappel de remplissage » resté en
  attente depuis la v3.22.0.

Tests : tests/python/test_veilles.py (section « Les consommables »),
tests/veilles_consommables.test.mjs.
