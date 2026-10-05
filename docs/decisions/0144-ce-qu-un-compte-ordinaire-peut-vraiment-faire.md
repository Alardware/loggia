# 0144 — Ce qu'un compte ordinaire peut vraiment faire

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant
requis** (décision 0126) : `store.py`, `scenarios.py` et `websocket_api.py`
changent.

Le lot 10 de l'audit du 03/10 : le carnet des réglages en attente, et ce
qu'un compte Home Assistant ordinaire (non administrateur) peut vraiment
faire. Douze constats. Quatre décisions de l'utilisateur, prises le 03/10 :
- le carnet n'a qu'une empreinte, sans durée de vie ;
- les gestes qu'un compte ordinaire ne pourra jamais enregistrer sont
  **masqués** ;
- l'icône d'une carte et l'orientation du plan du robot s'ouvrent à tous ;
- le choix des agendas reste réservé aux administrateurs.

**Le carnet des réglages en attente** (`enattente.js`, ADR 0109, complément
du 03/10) :
- **par compte** : ce qu'un compte ordinaire laisse sur une tablette ne
  repart plus jamais sous les droits d'un administrateur. `saveCfg` raye un
  refus, et ne recopie plus sur l'appareil une valeur refusée faute de droits ;
- **l'empreinte** de ce que le serveur tenait, et de nos propres envois sans
  réponse : un réglage en attente n'écrase plus un rangement fait depuis sur un
  autre écran, et un redémarrage en plein rangement ne perd plus la dernière
  carte ;
- **clé par clé** : un refus n'emporte plus que sa clé, plus l'agencement qui
  attendait à côté.

Ces trois corrections ont été préparées séparément. Elles se chevauchaient, et
ont été intégrées à la main dans un seul module, avec ses tests réécrits.

**L'ordre des scénarios** relève de l'agencement (ADR 0125), mais il passait
par une commande réservée, et le refus était avalé. Une commande
`loggia/scenarios/ordre`, sans `require_admin`, n'accepte QUE des identifiants
de scénarios connus, sans doublon. Un refus se dit et nomme ses identifiants.

**Les écritures qui abîmaient le commun.** Renommer ou retirer une pièce
depuis un compte ordinaire faisait refuser `loggia_rooms`, alors que la
grille commune avait déjà reçu le nouveau nom. La pièce et sa grille partent
désormais en UN lot, et un lot refusé ne laisse rien à l'écran ni au carnet.

**Les refus se disent.** La barre « Mode » des volets revenait en silence en
15 s ; le refus se dit maintenant, nomme la clé, et l'ancien choix revient
tout de suite. Dans les Paramètres, les droits « Règles », « Interrupteurs »
et « Alertes » s'accordaient à un profil sans pouvoir rien enregistrer sous un
compte ordinaire. L'éditeur de profil le dit au moment d'accorder, et un refus
ne se lit plus comme une panne : `refus.js` distingue `not_admin` d'une
coupure.

**Les gestes masqués** à un compte Home Assistant ordinaire
(`compteOrdinaire`, `hass.user.is_admin === false`) :
- la bascule « lumière » d'une prise ;
- le choix de l'assistant ;
- Modifier, Supprimer et Ajouter une pièce en mode édition ;
- les entités d'une vue ;
- le premier lancement ;
- le choix des agendas ;
- les pièces nommées sur le plan du robot.

Pour un administrateur, rien ne change. Ranger ses cartes, leur ordre, leur
taille et l'apparence restent ouverts à tous : ce qu'une erreur coûte trace
toujours la frontière.

**Ouvertes à tous** : `loggia_icones` (le dessin d'une carte) et
`loggia_vacrot` (le quart de tour du plan d'un robot) rejoignent APPARENCE.
Elles ne commandent rien. `loggia_switchlights`, `loggia_assistant`,
`loggia_agendas` et `loggia_vacplan` restent de la configuration.

**Comment c'est vérifié.** Les tests ont été rejoués sur le code d'avant le
lot :
- carnet : rejeux A, B et C, contre un faux composant aussi strict que
  `store.py` ;
- commande d'ordre : tests Python des droits et des identifiants inconnus ;
- refus nommés ;
- grille ;
- gestes masqués ;
- clés d'apparence (`test_store.py`).

Chaque fichier de tests du lot échoue au moins une fois sur ce code d'avant ;
le test des agendas réservés, voulu pour éviter une régression, passait déjà.
Dans la démo, Scénarios, Volets et Paramètres s'affichent sans erreur.

**Polonais.** Les textes nouveaux suivent le vocabulaire de Seba882
(« odmówił lub nie odpowiedział »), et aucune de ses valeurs n'est touchée.
