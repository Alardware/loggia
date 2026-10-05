# 0139 — Une reconnexion à Home Assistant ne rejoue rien

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(décision 0126) ; seul le paquet change.

La bibliothèque WebSocket de Home Assistant **réabonne** tout ce qui est ouvert
quand la liaison revient — un redémarrage pour une mise à jour, une coupure
Wi-Fi, une tablette qui sort de veille. Trois défauts en découlaient, mesurés
avec la vraie bibliothèque (home-assistant-js-websocket 9.5) sur un serveur
simulé :

- **L'assistant renvoyait sa dernière question**, et rejouait l'action
  domotique (« ferme les volets du salon ») sans que personne ne parle : son
  flux restait ouvert après la réponse. Il se ferme à `done` et à `error`, et
  la question part avec `{ resubscribe: false }` — une question se pose une fois.
- **Le journal d'activité s'affichait en double** : l'abonnement est rejoué avec
  le même point de départ, et Home Assistant renvoie tout depuis ce point. Les
  lignes se dédoublonnent sur `entity_id|when|state`.
- **Une notification retirée pendant la coupure restait affichée** : la réponse
  `current`, état complet du serveur, s'ajoutait à la table au lieu de la
  remplacer.

Les autres commandes ponctuelles prennent aussi `{ resubscribe: false }` : une
offre WebRTC de caméra vaut pour une seule connexion, et une écoute ou une
lecture vocale ne se rejoue pas.

**Comment c'est vérifié.** La mesure de l'audit, rejouée avec le nouveau code et
la vraie bibliothèque : une question au lieu de deux, la notification partie,
deux lignes au lieu de quatre. La bibliothèque n'étant pas une dépendance du
dépôt, `tests/reconnexion.test.mjs` épingle les corrections.

**En passant.** Les scripts de remplacement de cette série écrivaient en CRLF
sous Windows, alors que `.gitattributes` veut du LF partout — les tests lisent
les sources en texte. Vingt fichiers ont été remis en LF avant de continuer.
