# 0153 — Plus de vue pour un appareil

Date : 04/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant.

**La question 11 de l'audit du 03/10** : la vue Croquettes n'avait plus
d'entrée dans l'interface — du code mort, joignable seulement par son
adresse. L'utilisateur : « pas de vue croquette, aucun intérêt, il n'y a plus
de vue spéciale pour un appareil, c'est la carte plus sa popup, c'est tout »
(comme le robot, ADR 0042 puis v3.45.0).

**La décision.**
- La vue part : son composant, sa route, ses entrées dans les listes de vues,
  ses styles et onze textes devenus orphelins dans les sept langues. Un onglet
  qui l'avait mémorisée, ou `?vue=croquettes`, retombe sur l'Accueil.
- Ce qu'elle seule savait faire passe dans la popup du distributeur (choix de
  l'utilisateur) : sous « Repas par jour », une ligne par repas — heure,
  nom, grammes quand il y en a — et un interrupteur qui l'active ou le coupe
  (`homeassistant.turn_on/off`, automatisation ou `input_boolean`). L'état
  suit l'appui aussitôt et revient au réel s'il est refusé
  (`useDemandes`, ADR 0149), un repas à la fois.
- « Distribuer » garde une portion ; les boutons 2 et 3 portions de la vue
  partent avec elle.
- La carte du distributeur et le reste de sa popup ne changent pas.

Un texte nouveau : « Repas de {h} », le nom lu de l'interrupteur (le polonais
« Posiłek o {h} » est à faire relire par Seba882, ADR 0141).

## Relecture

- « Environ N jours de réserve », juste au-dessus des repas, comptait encore
  un repas coupé : il ne compte que les repas actifs.
- Sept autres textes ne servaient qu'à la vue (« passé », « distribué »,
  « désactivé », « programmé », « hors programme », « Ration », « Baisser ») :
  ils sortent des sept langues, et un test refuse qu'un texte de la vue
  revienne.
