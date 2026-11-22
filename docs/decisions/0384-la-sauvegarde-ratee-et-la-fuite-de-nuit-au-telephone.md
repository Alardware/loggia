# 0384 — La sauvegarde ratée part aux administrateurs, et une fuite de nuit aux personnes à la maison

*21 novembre 2026 — appliqué (v3.100.0) (chantier du 20/11, lot 4 : P9, A1)*

*Amende l'ADR [0314](0314-ce-que-l-administrateur-doit-savoir-sauvegardes-disque-plein-et-mises-a-jour.md) : « rien au téléphone » devient « une fois, aux administrateurs », pour l'échec d'une sauvegarde automatique.*

## Le problème

Le 20/11, une revue de Loggia a cherché ce qui manquait pour des maisons
équipées autrement que la sienne. L'utilisateur
a validé ces deux points le 21/11.

- **P9.** L'ADR 0314 dit l'échec d'une sauvegarde automatique dans la vue
  Système et dans le rail, mais « rien au téléphone ». Une sauvegarde ratée
  la nuit reste donc ignorée tant que personne n'ouvre cette vue. Chez lui, la
  tentative de la nuit est notée à 04:55 et la réussite à 04:56 : un échec
  se voit à l'écran, pas au réveil.
- **A1.** Une fuite lente (une chasse d'eau qui coule, un joint, un tuyau
  enterré) ne déclenche aucun détecteur d'inondation : il n'y a pas d'eau au sol.
  Le seul témoin est le compteur d'eau, que le tableau Énergie de Home Assistant
  connaît déjà. Un compteur qui avance toute la nuit, quand personne ne
  s'en sert, dit « une fuite ? ».

## La décision

Les deux veilles sont dans `veilles.py`, qui parle déjà au téléphone (un test
garde la liste de ces modules). Deux sections de réglage,
`sauvegarde: {actif}` et `fuite_nuit: {actif}`, allumées par défaut,
lues comme des booléens stricts. Le passage horaire existant les porte : il
tourne dès que l'une est allumée.

**P9, la sauvegarde ratée.**
- Les trois capteurs de la plateforme `backup` se lisent au REGISTRE, par leur
  clé de traduction (`last_attempted_automatic_backup`,
  `last_successful_automatic_backup`, `backup_manager_state`), jamais à leur
  nom. Les états sont des horodatages ISO.
- La règle est le MIROIR de l'écran (`etatSauvegarde`, `systemecalc.js`), pour
  l'échec seulement : le gestionnaire est au repos (`idle`) ET la tentative est
  plus récente que la réussite, ou rien n'a jamais réussi. Pas de « retard » :
  l'écran le dit, le téléphone se tait. Une fonction pure, `sauvegarde_ratee`.
- UNE fois, aux administrateurs (`pour="admins"`). Le texte est celui de l'écran :
  « La sauvegarde de cette nuit a échoué » pour une tentative de moins de 24 h
  partie avant 8 h, « La dernière sauvegarde a échoué » sinon. Il ne dit pas
  « cette nuit » d'un échec de lundi.
- La clé `sauvegarde:<la tentative>` rejoint ce qui a été signalé SEULEMENT
  si l'envoi est parti. Elle se réarme quand l'échec n'est plus vrai (une
  réussite plus récente). Un état muet (`unavailable`, `unknown`) ne
  réarme rien, et une sauvegarde en cours ne change rien.
- « Observer sans agir » le simule.

**A1, la fuite lente de nuit.**
- Le compteur est une source `water` du tableau Énergie
  (`stat_energy_from` ; l'identifiant de la statistique est, dans le cas
  courant, l'entity_id du capteur cumulatif).
- Au passage horaire dont l'heure locale est 5, ou au démarrage de Home
  Assistant s'il tombe entre 05:00 et 08:00, la veille relit l'historique du
  compteur de 01:00 à 05:00 de la nuit (heure de la maison, valeur de départ
  comprise), comme les prises lisent le leur.
- La règle, fonction pure `fuite_nocturne` : FUITE seulement si le compteur a
  avancé, strictement, dans CHACUNE des quatre heures 1-2, 2-3, 3-4 et 4-5. La
  valeur à un instant est la dernière connue. Une baisse (un compteur remis à
  zéro) n'est pas une fuite. Moins de cinq valeurs, ou aucune au départ :
  pas de verdict. Un compteur qui ne se met à jour qu'une fois par jour ne
  déclenche donc jamais. Une nuit de changement d'heure trop courte n'est pas jugée.
- UNE fois par nuit, aux personnes à la maison (`pour="presents"`), « {nom} :
  de l'eau a coulé toute la nuit, une fuite ? ». La clé `fuite:<compteur>` ne se
  pose que si l'envoi est parti, et s'en va après une nuit sans fuite.
- **Rien ne se ferme tout seul** : aucune vanne n'est commandée.
- Dans le rail de l'Accueil (règle 7 de `attention.js`) : une alerte « De l'eau a
  coulé toute la nuit », sous le nom du compteur, qui mène à l'Énergie. La clé
  `sauvegarde:` n'y figure pas : la vue Système la dit déjà.

Écarté :
- Un module neuf pour parler au téléphone : la garde des modules qui parlent au
  téléphone en refuserait un troisième.
- Une alerte « critique » pour la fuite : elle ne réveille personne, elle attend
  les heures calmes comme les autres veilles.
- Le « retard » d'une sauvegarde au téléphone : seul l'échec se dit.
- Fermer l'arrivée d'eau : une vanne qui se ferme chez quelqu'un qui dort est
  pire qu'une fuite lente.

## Les conséquences

- **Redémarrage de Home Assistant nécessaire** : fichiers Python et fichier de
  textes du serveur (`textes_catalogue.py`) changés. C'est à l'utilisateur de le
  faire ; rien n'a été installé ni lancé chez lui.
- Trois textes partent au téléphone (`CLES_TELEPHONE`) et un titre
  s'affiche au rail : quatre clés dans les six catalogues, dont deux déjà
  traduites côté écran. pl.js n'a que des ajouts.
- Tests : `tests/python/test_chantier_2011_lot4.py` et
  `tests/chantier_2011_lot4.test.mjs`. Assertions existantes modifiées :
  `ATTENDU["veilles"]` de `tests/python/test_destinataires.py` compte désormais
  `admins`, et trois tests du passage horaire éteignent les deux veilles neuves
  (allumées par défaut, elles posent ce passage à elles seules).
- Les deux veilles s'éteignent dans la configuration du serveur, mais aucun
  écran de Paramètres ne le propose encore.

Pas fait :
- rien n'a été essayé contre un vrai historique de compteur ni un vrai échec
  de sauvegarde : tout est vérifié par des doublures ;
- un compteur d'eau dont l'identifiant de statistique n'est pas un
  `entity_id` (une statistique externe) n'est pas lu ;
- le seuil d'« une heure sans avancer » est strict (aucune tolérance) : un
  compteur à grosse résolution (un litre par impulsion) peut manquer une fuite
  très lente.
