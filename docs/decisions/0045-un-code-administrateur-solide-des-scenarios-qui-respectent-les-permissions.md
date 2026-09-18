# 0045 — Un code administrateur solide, des scénarios qui respectent les permissions

Date : 18/09/2026 (v3.47.0). Statut : acceptée. Demande : « je voudrais aussi
une sécurité en béton digne d'un vrai site sécurisé » et « mon PIN doit être le
même configuré partout, sur PC, mobile, tablette, peu importe avec quoi je me
connecte ». Revue de sécurité du composant et du front (audit du 18/09).

## Contexte

Le panneau vit DANS Home Assistant : l'authentification est la sienne, et
l'écriture de la maison est déjà réservée aux administrateurs (`require_admin`
sur chaque commande d'écriture, magasin qui refuse une clé de maison à un
compte ordinaire — ADR antérieures, tests du magasin). L'audit a trouvé deux
vraies faiblesses, pas dix : le code administrateur de Loggia était une clé de
la configuration commune, en clair, renvoyée à tout compte connecté et comparée
dans le navigateur — un décor ; et lancer un scénario faisait appeler les
services par le composant lui-même, sans la vérification des permissions
d'entité que Home Assistant applique à un appel direct — un compte restreint à
certaines entités pilotait les autres par un scénario.

## Décision

- **Le code administrateur est haché par le composant et vérifié par lui**
  (`custom_components/loggia/code_admin.py`) : PBKDF2-HMAC-SHA256, sel
  aléatoire, cent mille itérations, comparaison à temps constant. Il vit dans la
  partie commune du magasin sous `loggia_admin_pin_hache` : c'est LE code de la
  maison, le même sur chaque appareil et par chaque accès. L'ancienne clé en
  clair est hachée puis effacée au chargement, y compris ses ombres dans les
  sections de compte ; un enregistrement abîmé est jeté.
- **Le code ne sort jamais du serveur.** `loggia/config/get` retire les deux
  clés et dit seulement `loggia_admin_pin_defini` ; la configuration refuse de
  les écrire (`FORBIDDEN_KEYS`) ; le navigateur efface sa vieille copie locale.
- **Deux commandes** : `loggia/pin/verifier` (tout compte connecté — c'est
  l'usage d'une tablette de famille — avec **limitation d'essais** par compte :
  cinq ratés puis une minute, doublée à chaque palier, quinze minutes au plus ;
  la réponse dit combien attendre, jamais pourquoi) et `loggia/pin/definir`
  (administrateurs, quatre à huit chiffres). Le hachage tourne hors de la
  boucle d'événements.
- **Ce qu'il protège, dit sans détour** : le basculement vers un profil Admin
  de Loggia sur un écran partagé. Les droits Home Assistant, eux, ne dépendent
  pas de lui — ils n'en ont jamais dépendu.
- **Lancer un scénario respecte les permissions d'entité du compte** :
  `controle_de(user)` (miroir de la lecture déjà filtrée par la découverte)
  écarte les cibles que Home Assistant refuserait au compte, la scène liée
  comprise ; le journal dit combien ont été refusées. Une automatisation
  (sans utilisateur) garde les droits de la maison.
- **Garde-fous** : un test relit `websocket_api.py` et verrouille la liste des
  commandes réservées aux administrateurs, la forme des réponses du code, et
  l'absence de tout `user_id` accepté du client ; l'audit anti-données
  personnelles couvre désormais `docs/` et les fichiers de la racine.
- **Outillage** : Vite 7 et le greffon React 5 (zéro faille connue, y compris
  côté développement) avec la cible de compilation d'avant, pour ne perdre
  aucune tablette.

## Conséquences

Migration silencieuse pour l'utilisateur : son code d'avant continue de
marcher, haché ; la page Paramètres ne l'affiche plus (« Code défini » ou
« Code par défaut (0000) — à changer »). Redémarrer Home Assistant : les
commandes WebSocket ne s'enregistrent qu'au démarrage. Tests :
tests/python/test_code_admin.py, test_websocket_api.py, test_store.py et
test_scenarios.py enrichis ; front : synchro et droits réalignés. Vérifié en
démo (modale : bon code, cinq mauvais → blocage annoncé).
