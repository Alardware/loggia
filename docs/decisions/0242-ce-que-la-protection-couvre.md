# 0242 — Ce que la protection couvre, et ce que l'Accueil lit

*19 octobre 2026 — accepté, à l'essai (audit des prises, rien de publié). Complète les ADR 0193, 0194 et 0196.*

## Le problème

L'audit du 19/10 de l'écran des prises n'a trouvé aucun chemin qui coupe d'un
appui une prise protégée, mais des trous plus petits, et deux questions que
l'utilisateur a tranchées (« je suis tes recommandations ») :

- une prise `unknown` (au retour d'un redémarrage) restait commandable par la
  recherche, le gros interrupteur et la ligne d'une épingle ;
- le bouton lumières d'une pièce coupait sans demander une prise protégée
  désignée dans « Lampes du bouton » ;
- l'Accueil avait sa propre idée du lave-vaisselle en marche (plus de 100 W),
  contraire au cycle du serveur ;
- « Observer sans agir » doit-il bloquer les minuteurs et les télécommandes ?
  L'Assistant doit-il respecter la protection ?

## La décision

- **Une prise muette ne se commande par aucun chemin** : la recherche ne la
  propose plus, le gros interrupteur et la ligne épinglée sont inertes
  (`enPanne`, comme la carte et la fiche).
- **Le bouton lumières d'une pièce ne coupe pas une prise gardée** : elle reste
  allumée, les autres lampes s'éteignent, et le sens du bouton se décide sur
  les autres lampes.
- **La recherche ouvre la fiche** d'une prise gardée, qui demande, au lieu de
  mener à Objets › Prises.
- **L'Accueil lit le cycle du serveur** pour l'électroménager reconnu ; son
  ancien chemin (plus de 100 W) ne sert plus que de repli quand le module des
  prises ne répond pas.
- **« Observer sans agir » ne simule que les règles automatiques** (ADR 0004) :
  minuteurs et boutons sont des gestes de l'utilisateur, ils agissent toujours.
  Sa phrase le dit.
- **La protection est une garde de l'écran** (P5) : l'Assistant passe par Home
  Assistant, Loggia ne peut pas l'arrêter. La rangée « Protéger » le dit.
- Une protection qui n'a pas pu être lue se dit (« Protection inconnue : Loggia
  demande par prudence. »). « Protéger » et « Prévenir » se présentent
  désactivés d'avance à un compte ordinaire, comme « Ce qu'elle alimente ».
  Échap défait la question « Couper la prise ? » sans fermer la fiche, et la
  question s'annonce (`aria-live`).
- Un échec passager de lecture garde la dernière lecture réussie (le mois, le
  journal) ; le magasin des prises ne republie que ce qui change ; un minuteur
  échu ne dit plus « dans 0 min ».
- La feuille d'un switch ordinaire et son minuteur se chargent à la demande
  (`ficheswitch.jsx`) : la borne du démarrage ne se relève pas.

## Les conséquences

- La fiche d'une lumière garde son propre « dans 0 min » et ne traduit pas
  encore `minuteur_deja_eteint` : hors du chantier des prises.
- Onze textes polonais nouveaux sont à faire relire par Seba882.
