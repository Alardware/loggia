# 0353 — Une intégration ne tombe qu'après cinq minutes de silence

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Sur une vraie installation, « À surveiller » a affiché « Alexa Devices ne
répond plus · 4 appareils », puis l'a retiré quatre minutes plus tard. Une
intégration en nuage qui se reconnecte passe par `unavailable` le temps d'un
hoquet : le point clignotait, et on ne savait plus s'il fallait s'en occuper.

## La décision

Une intégration n'est dite tombée (`integrationsTombees`, `health.js`) que si
toutes ses entités se taisent depuis cinq minutes au moins
(`MUETTE_DEPUIS_MS`) : la plus récente de leurs dates (`last_changed`, sinon
`last_updated`), lue à une horloge passée en paramètre. Une entité sans date
ne retient rien.

Les plateformes calculées (`template`, `group` : `PLATEFORMES_CALCULEES`,
`attention.js`) sont écartées : elles se taisent parce que ce qu'elles lisent
se tait, et c'est cette panne-là qu'il faut dire.

## Les conséquences

Un point « … ne répond plus » paraît cinq minutes plus tard qu'avant, et ne
clignote plus. L'aide de panne d'une fiche (`plateformeMuette`, `state.js`)
garde l'ancienne règle, sans délai : non traité ici. Tests :
`tests/audit_1211_lot1b.test.mjs`, `tests/health.test.mjs`.
