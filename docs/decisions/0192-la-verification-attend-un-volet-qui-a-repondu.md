# 0192 — La vérification attend un volet qui a répondu

*12 octobre 2026 — accepté, à l'essai (plan 1 du chantier Volets, rien de publié). Nuance l'ADR 0007.*

## Le problème

L'ADR 0007 veut que, deux minutes après un ordre, un volet joignable ait bougé ;
sinon on redemande, puis le journal le dit en rouge. Chez lui, les volets sont
des Netatmo, et ils ne répondent pas à ce rythme : Home Assistant bascule
l'état tout de suite après l'ordre — `open`, la position encore à 0, à 08:30:34
le 12/10 — et ne publie la position qu'une à trois minutes plus tard (`open 100`
à 08:33:05). À 120 s, la vérification voit une position qui n'est pas encore la
cible, et redonne l'ordre à un volet qui obéissait.

Son journal réel (`.storage/loggia_journal`), du 22/09 au 12/10 : **119 ordres**
de volets, dont **83 redonnés** — les lignes « … · immobile, essai 1/2 », deux
minutes après l'ordre — et **5 lignes rouges** « non abouti ». Il a demandé le
correctif le soir du 12/10.

## La décision

**À l'ordre, la signature.** La vérification note la « signature » du volet — son
état et sa position — et un compteur de tours d'attente, à zéro. La signature
est lue juste après l'envoi, qui n'attend pas la réponse du volet : c'est celle
d'AVANT l'ordre.

**À l'échéance, un tour de plus pour qui a répondu.** Les règles de l'ADR 0007 ne
changent pas : un volet injoignable rejoint l'attente, une position atteinte à
5 près ne demande rien. Mais un volet qui n'est pas arrivé et qui a RÉPONDU
obtient un tour de plus — encore 120 s —, sans essai compté, sans ordre redonné
et sans ligne de journal. Au plus DEUX tours par ordre ; ensuite, l'ADR 0007 tel
quel : redemander, `tentatives` fois (deux par défaut), puis la ligne rouge.

**Répondre**, c'est être `opening` ou `closing`, ou avoir une signature qui
n'est plus celle de l'ordre. Exception : un volet `unavailable`, `unknown` ou
absent à l'ordre n'avait rien publié qui se compare, et son retour change sa
signature sans qu'il ait bougé — le vent n'écarte pas un volet injoignable. Seul
le mouvement compte alors comme une réponse.

**Le premier tour s'accorde sans condition** à un ordre qui ne fait rien
basculer : une position (`set_cover_position` — la protection solaire demande
30 % à un volet à 100, il reste `open`), ou un ordre dont l'état publié est déjà
celui qu'il vise (ouvrir un volet publié `open` mais arrêté à 1 %, comme sa
chambre une fois fermée, ou fermer un volet `closed`). Rien ne montre alors
qu'il obéit avant que sa position n'arrive. Le second tour, lui, exige une
réponse. Et ce droit n'est donné qu'à l'ordre d'ORIGINE, pas à ses reprises :
après les tours de l'ordre, l'ADR 0007 tel quel.

**Une position inconnue** à l'échéance — un volet sans position qui bouge —
garde son traitement d'avant : on ne conclut rien.

Dans `volets.py` : `_signature` et `_a_repondu`, `_armer_verif` (le rendez-vous,
qui sert à l'ordre et aux tours d'attente), `sans_bascule` (pur) et
`ATTENTES_MAX`. Le composant serveur change : au déploiement, Home Assistant
devra redémarrer. Cela se dit, cela ne se fait pas.

## Pourquoi l'état et la position, et non `last_updated`

La conception comptait aussi `last_updated` parmi les signes d'une réponse. Il
n'est pas retenu : un attribut sans rapport qui change — certaines intégrations
en publient — le ferait bouger sans que le volet ait bougé, et l'on croirait à
une réponse. L'état et la position sont ce que l'ordre doit changer.

## Ce que cela coûte

La règle de l'ADR 0007 ne bouge pas pour un volet vraiment immobile. Seul est
attendu plus longtemps un volet qui a répondu, ou dont l'ordre ne peut pas
basculer l'état. Avec les deux tentatives par défaut, sa ligne rouge vient :

| Le volet… | …après |
|---|---|
| n'a rien publié depuis un ordre qui devait faire basculer son état | 6 min, comme avant |
| n'a rien publié depuis une position, ou depuis un ordre que son état a déjà atteint | 8 min |
| a basculé son état (ou bouge), puis n'arrive jamais | 10 min |

## Ce que l'écran y gagne

`manoeuvre` — l'ordre que la vérification attend encore, publié dans
`loggia/volets/etat` — reste publiée pendant les tours d'attente, avec l'heure
de l'ordre inchangée : six minutes au plus par ordre (120 s, puis deux tours),
au lieu de deux minutes. Une reprise est un ordre nouveau : son `depuis` repart.
C'est ce qui laisse à l'écran la course jouée (ADR 0189) pendant la latence de
Netatmo.
Les manœuvres de l'Historique, elles, ne montrent plus de « immobile, essai 1/2 »
pour un volet qui obéissait.

## Ce qu'on n'a pas fait

- **Toucher à la règle d'un volet qui n'a rien publié** : 120 s, on redemande,
  puis la ligne rouge — comme avant.
- **Réparer ici un défaut voisin**, vu à la relecture et laissé tel quel : un
  ordre gardé pour un volet injoignable n'est pas rejoué tant que dure la mise à
  l'abri (`_async_rattraper`), et il est abandonné si le planning est coupé ou
  en Manuel. Chez lui, le vent est coupé.

## Ce que les tests tiennent

`tests/python/test_volets.py`, section « La verification attend un volet qui a
repondu » :
- `test_le_cas_netatmo_n_est_pas_redemande` : la bascule aussitôt, la position à
  150 s, un seul ordre et aucune ligne « immobile » ;
- `test_un_volet_vraiment_immobile_est_redemande_a_deux_minutes_comme_avant` ;
- `test_un_volet_en_mouvement_a_deux_minutes_merite_un_tour` ;
- `test_un_volet_injoignable_a_l_ordre_ne_repond_pas_en_revenant` (sauf s'il
  revient en mouvement) ;
- `test_une_position_demandee_merite_un_premier_tour_sans_bascule` et
  `test_ouvrir_un_volet_deja_ouvert_merite_un_premier_tour` ;
- `test_un_volet_qui_bascule_sans_jamais_arriver_finit_en_rouge`, après ses dix
  minutes ;
- `test_la_manoeuvre_reste_publiee_pendant_les_tours_d_attente`, avec la même
  heure d'ordre.

Les tests de la section « Ordre non abouti » ne changent pas, sauf
`test_la_reprise_d_une_protection_garde_sa_facade` : elle gagne un tour, la
reprise d'une protection (une position) vient à 240 s.
