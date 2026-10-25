# 0177 — Une reprise en main dure jusqu'au prochain changement

*9 octobre 2026 — accepté, à l'essai (plan 1 du chantier Chauffage, rien de publié)*

## Le problème

> « Rien à penser, rien à oublier ; le choix reste à portée. » — décision D3.

Un planning qu'on ne peut pas contredire se fait débrancher. Mais une
contradiction qui dure toujours fait oublier le planning : le Confort posé à la
main un dimanche soir chauffe encore le mardi. Velair donne à chaque reprise en
main une politique et une fin ; Loggia n'avait que le gel de trente minutes du
socle (ADR 0002), trop court pour un geste qui veut dire « ce soir », trop long
quand le planning change juste après.

## La décision

- **Fin par défaut : le prochain changement du planning**, calculé à la
  création — le prochain qui change vraiment le mode. Un planning qui ne
  change jamais de mode n'en a pas : la reprise dure alors 24 h, rien ne reste
  sans fin par oubli. Sinon 1 h, 2 h, 4 h, ou « jusqu'à relance » (seul choix
  explicite sans fin). « Reprendre le planning » l'arrête avant l'heure.
- **Deux origines.** Une demande à Loggia (`loggia/chauffage/main` : un mode,
  ou une consigne en °C pour un thermostat), dont l'ordre part avec le
  contexte de la personne — comme un minuteur, c'est son geste, différé. Ou
  **un geste fait ailleurs** : un changement d'état qui n'est ni l'écho de
  notre dernier ordre (son contexte, ou l'état même qu'on a demandé — un
  module zigbee2mqtt répond sous un autre contexte), ni un état intermédiaire
  dans les 90 secondes qui suivent l'ordre, ni un attribut qui bouge (la pièce
  qui se réchauffe). Ces 90 secondes ne couvrent que l'attente de la
  confirmation : dès que l'appareil est dans l'état demandé, un changement fait
  ensuite — à la seconde 40 — est un geste, que le moteur ne défait pas. Les
  bascules d'un VTherm en `safety` (sa sonde se tait ; `security` dans ses
  anciennes versions) ou en `power` (délestage) ne sont pas des gestes, à
  l'aller comme au retour ; tant qu'il y est, le moteur ne lui envoie rien —
  sauf l'Arrêt : la fenêtre ouverte, ou l'Été, peut toujours l'éteindre —, et
  quand il en sort le planning s'applique. La
  reprise retient ce que la personne a posé — le mode, ou la consigne — et le
  moteur ne se bat pas : notre dernier ordre est alors périmé, revenir à la
  main à l'état qu'il demandait est un nouveau geste, et « Reprendre le
  planning » repart tout de suite.
- **Elle remplace le gel** pour un chauffage au planning allumé : le moteur
  ne passe pas par le socle (ADR 0176).
- **Elle survit au redémarrage**, dans un fichier à part de `.storage`
  (`loggia_chauffage_etat`), comme le journal : elle change à chaque geste, ne
  regarde personne d'autre, et ne doit ni voyager avec la configuration vers
  chaque écran ni revenir d'un import. Échue pendant la coupure, elle est
  abandonnée au démarrage et le planning s'applique.
- **La fenêtre passe devant** (§ 5.1 de la spécification). C'est une nuance
  de l'ADR 0019 pour les seuls chauffages au planning allumé : rallumé à la
  main fenêtre ouverte, le radiateur repart dans le réglage de sa fenêtre
  (Arrêt par défaut, ou Éco) — une fois par geste, pas en boucle. Planning
  éteint, la main l'emporte toujours, comme avant.

## Ce qu'on n'a pas fait

**Deviner l'intention d'un geste** (« 22 °C sur le poêle, c'est du
Confort ») : on garde ce que la personne a posé, tel quel.

## Ce que les tests tiennent

`tests/python/test_chauffage.py`, sections « La reprise en main » et « Un geste
fait ailleurs » ; `test_chauffage_config.py` pour ce qui se garde et ce qui
s'abandonne au démarrage.
