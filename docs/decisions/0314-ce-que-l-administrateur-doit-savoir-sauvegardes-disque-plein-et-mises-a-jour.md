# 0314 — Ce que l'administrateur doit savoir : les sauvegardes, le disque plein et les mises à jour

*1er novembre 2026 — à l'essai (rien de publié) (lot 10 du rapport « Gladys comparé au catalogue », 31/10 : D17, D18, K2, K3, K4)*

*Complète l'ADR [0037](0037-la-vue-systeme-d-une-machine-haos.md) : ce que la vue Système dit des sauvegardes, et ce qui en sort vers l'Accueil.*

## Le problème

- **D17 / K2.** La dernière sauvegarde de la vue Système était toujours verte (`views/systeme.jsx`, l'icône `cloud-check` en
  `--o-ok`). Vieille de neuf jours, elle restait verte. Un échec ne se voyait nulle part : les entités de l'intégration `backup`
  n'étaient lues par personne, et la vue ne lisait que le Superviseur, qui ne répond qu'à un administrateur sous Home Assistant OS.
- **K3.** Les seuils du disque existaient (`SEUILS.disque`, `systeme.js`), mais ne sortaient pas de la vue Système. Une machine
  injoignable n'était dite nulle part hors de cette vue.
- **D18 / K4.** La cloche montrait une ligne par entité `update.*` allumée, à TOUT LE MONDE (`app/derive.jsx`). Chez
  l'utilisateur : 119 entités `update`, micrologiciels Zigbee compris. Le profil d'un enfant les voyait, alors que seul un
  administrateur peut les installer.

Son registre (lecture seule, 01/11) : `sensor.backup_last_successful_automatic_backup`, `…_last_attempted_automatic_backup`,
`…_next_scheduled_automatic_backup` et `…_backup_manager_state`, plateforme `backup`, dont la clé de traduction est la fin de
l'identifiant. Dans le carnet de l'intégration, la tentative de la nuit est notée à 04:55:09 et la réussite à 04:56:41 :
Home Assistant note la tentative AU DÉPART. Les disques : System Monitor, clé `disk_use_percent`, six points de montage du même
disque. La machine du rapport est un binaire de connectivité de l'intégration `ping`, porté par un appareil nommé d'après son
adresse IP.

## La décision

**Tout ce qui est neuf est réservé aux administrateurs** : `hass.user.is_admin` doit valoir `true`. Un compte inconnu ne voit
rien. C'est plus strict que `compteOrdinaire` (ADR 0144), qui ne masque que sur un `false` explicite : ici on montre, on ne
retire pas un geste.

**Les sauvegardes automatiques** se lisent dans les entités `backup`, reconnues à leur plateforme et à leur clé, jamais à leur
nom (`entitesAdmin`, `etatSauvegarde`, `systeme.js`). Sans le Superviseur : elles disent la même chose hors Home Assistant OS.

- **Échec** : la dernière tentative est plus récente que la dernière réussite (ou rien n'a jamais réussi). « La sauvegarde de
  cette nuit a échoué » quand la tentative a moins de 24 h et est partie avant 8 h ; sinon « La dernière sauvegarde a échoué ».
- **Retard** : la prochaine programmée est passée depuis plus d'une heure. « Dernière sauvegarde il y a 4 jours », ou « Aucune
  sauvegarde automatique réussie ». Une réussite de moins d'un jour n'est jamais ancienne. Sans programme, rien.
- **Une sauvegarde en cours** (l'état du gestionnaire n'est pas `idle`) ne dit rien : sa tentative est déjà notée, sa réussite
  pas encore.
- L'échec passe avant le retard.

**Le disque plein** : le plus plein des capteurs d'occupation de System Monitor, Glances ou Synology DSM (clés
`disk_use_percent`, `disk_usage`, `volume_percentage_used`), à partir du seuil CRITIQUE existant de la vue, 92 %
(`SEUILS.disque[1]`). Le rapport disait « au-dessus de 90 % » : aucun seuil neuf n'est créé. Une seule ligne pour tous les points
de montage. « Disque plein à 95 % », sous le nom du capteur.

**Dans le rail de l'Accueil** (« En ce moment »), pour un administrateur : une ligne ambre par constat, après la sonnette, qui
mène à la vue Système. Pas de point d'attention, rien au téléphone, aucune commande.

- La règle vit dans `systeme.js`, que le rail charge à la demande, pour un administrateur seulement (`import()` dans
  `useMomentAccueil`). Le compte d'une session Home Assistant ne change pas sans recharger la page.
- La ligne compte dans « N EN COURS », comme la vigilance orange.

**Dans la vue Système** : l'échec ou le retard devient une alerte. La pastille passe à l'ambre (« 1 à surveiller ») et l'icône
de la dernière sauvegarde aussi (`cloud-disabled`). Sans Superviseur, la ligne « Dernière sauvegarde » prend la dernière
réussite de l'intégration.

**Les mises à jour, dans la cloche** : pour un administrateur seulement, en UNE ligne, « 12 mises à jour ». Sa clé suit la plus
récente (`last_changed`) : une mise à jour neuve rentre au journal, en installer une n'y remet rien. Une ligne par entité en
faisait cent dix-neuf.

**La démo** : la sauvegarde automatique de cette nuit, à 3 h, a échoué ; la dernière réussie est celle de la veille. Le
Superviseur de la démo dit la même chose. Son disque reste à 46 %.

Écarté :

- **La machine injoignable (K3)**, reportée puis refusée. La seule machine de son registre est un binaire `ping`, et rien ne dit qu'il vise
  un serveur : on « pingue » aussi un téléphone ou une télévision, qui s'éteignent. Une règle par plateforme `ping` dirait
  « injoignable » chaque soir. Les intégrations de serveur (Unraid, Proxmox, TrueNAS) n'ont pas chez lui de binaire de
  connectivité à reconnaître par sa classe et sa clé. Sans règle sûre, rien n'est livré.
  **Refusé par lui le 01/11** : on n'y touche pas.
- Un seuil de 90 % neuf : la vue en a déjà deux.
- Une ligne par mise à jour pour l'administrateur : la section des mises à jour de Paramètres les liste déjà.

## Les conséquences

- Pas de redémarrage de Home Assistant : rien ne change au serveur. L'index porte déjà la plateforme et la clé.
- Le démarrage passe de 1 062 837 à 1 063 121 octets (+284). La règle vit dans `systeme.js`, chargé à la demande.
- Les anciennes lignes « Mise à jour » d'un écran ordinaire restent dans son journal jusqu'à leur expiration (7 jours) : le
  journal est propre à chaque navigateur.
- Tests : `tests/admin_doit_savoir.test.mjs` ; `lot13_accueil_tuiles_moment.test.mjs` compte une poussée de plus.
- Vérifié dans les tests seulement : rien n'a été vu en démo ni chez lui.
