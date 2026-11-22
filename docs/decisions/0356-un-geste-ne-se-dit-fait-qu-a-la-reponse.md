# 0356 — Un geste ne se dit fait qu'à la réponse

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Trois gestes annonçaient leur réussite avant la réponse de Home Assistant, et
avalaient son refus :

- « Dire à Alexa » écrivait « Envoyé à Alexa » dès l'appui ;
- l'annonce écrivait « Annoncé sur… » sur la fiche et sur les cartes visées ;
- supprimer un rendez-vous de l'agenda partait d'un seul toucher, fermait la
  fiche aussitôt, et ne disait jamais un refus.

Quand l'appel était refusé, l'écran disait donc le contraire de ce qui s'était
passé, et rien ne signalait que rien n'était parti. L'agenda, lui, ne se
relisait qu'au sondage du quart d'heure : un rendez-vous créé ou supprimé
depuis l'Accueil semblait ne pas l'avoir été.

## La décision

La règle d'« Écrire sur la TV » (ADR 0316) vaut pour ces trois gestes :

- le message de réussite ne s'écrit qu'**à la réponse** ;
- un refus **se dit** (« Home Assistant a refusé. ») et le texte tapé **reste
  dans le champ** ;
- le champ ne se vide que s'il porte encore ce qui vient de partir : ce qu'on a
  tapé entre-temps n'est pas effacé.

Pour l'agenda de l'Accueil :

- **supprimer se confirme** : un premier toucher arme le bouton
  (« Confirmer ? »), le second supprime ; la fiche ne se ferme qu'à la réponse ;
- après une création ou une suppression, l'agenda **se relit aussitôt** (le
  compteur `tick` de `useAgenda`, déjà tenu par la carte Calendrier d'une vue).

## Ce qui ne change pas

- Une seule phrase, une seule annonce en vol à la fois.
- L'annonce d'un lecteur qui parle par synthèse vocale (`PanneauVoix`) garde
  son écriture : dite tout de suite, corrigée au refus.
- Au téléphone, la feuille de l'agenda n'a pas de bouton « Supprimer » : rien
  n'y change, sauf la relecture après une création.

## Les conséquences

Le message de réussite arrive une fraction de seconde plus tard qu'avant : le
temps de la réponse. Aucun texte nouveau : « Home Assistant a refusé. » et
« Confirmer ? » existaient dans les sept langues.

Pas de redémarrage de Home Assistant. Tests : `tests/medias_restants.test.mjs`
(B2), `tests/fiche_media.test.mjs` (assertions modifiées),
`tests/audit_1211_lot2a.test.mjs` (B4).
