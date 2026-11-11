# 0340 — Mesurer les montées en température

*9 novembre 2026 — à l'essai (bêta v3.100.0-beta.1) (étude sur 8 matins réels)*

## Le problème

Un préchauffage appris ferait démarrer un chauffage en avance. Mais pour un même
réglage, un créneau gagne de 0,2 à 1,5 °C selon les jours, et Home Assistant ne
garde ici qu'environ 9 jours de détail : on ne peut pas régler une avance sans
plus de données.

## La décision

Mesurer et montrer, sans rien changer au chauffage. Après un ordre accepté du
planning vers un mode plus chaud, à cinq minutes près de l'heure du changement,
le moteur note une montée. À la fin du créneau, il relit la sonde et n'en garde
qu'un résumé, 90 par chauffage, dans `.storage/loggia_chauffage_montees`. Tout ce
qui dérange la mesure l'écarte sans trace : fenêtre, reprise en main, mode de la
maison, appareil muet ou ordre défait, planning coupé, observation.

La lecture passe par `get_significant_states` avec tous les changements :
`state_changes_during_period` ne rend pas une mesure portée par un attribut
(`current_temperature` d'un thermostat). Une sonde de la zone portée par
l'appareil ne compte pas : les fumées d'un poêle ne mesurent pas la pièce.

## Les conséquences

Un panneau dans l'onglet Historique, une commande en lecture sous les droits du
compte, sonde comprise. Aucun appel de service, aucun réveil de plus. L'avance
automatique reste à décider, avec ces chiffres. Redémarrage de Home Assistant
nécessaire une fois. Tests `test_chauffage_montees`, `test_chauffage`,
`fichechauffage`, `demo_chauffage`.
