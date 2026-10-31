# 0291 — Un registre des commandes, et l'hygiène du serveur

*30 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 8 : M12, B3, B5, B10)*

## Le problème

- **M12.** `async_register` (`websocket_api.py`) faisait 1 262 lignes : chaque
  commande y était déclarée par ses décorateurs, son module résolu à la main,
  son « indisponible » recopié, et dix-sept paramètres `acces_*` amenaient les
  modules. Cinq commandes `config` étaient identiques à l'octet près.
  `_async_setup_common` (`__init__.py`) répétait dix-neuf fois le même
  `try/except`. La conversion en nombre fini était réécrite dans huit modules,
  la regex d'entité en quatre variantes.
- **B3.** L'affectation d'un bouton sans fil gardait `gestes` tels que le
  message les donnait, et une liste noire de trois services ne faisait pas une
  barrière : le « Service libre » de l'écran acceptait `shell_command.*`,
  `hassio.*`, `homeassistant.restart`…
- **B5.** Le plan 3D d'un étage et la photo de fond d'un compte s'écrivaient
  par un temporaire au nom fixe : deux envois simultanés se marchaient dessus.
- **B10.** Les ADR n'avaient pas de gabarit ; une ADR remplacée ne le disait
  pas ; les numéros sans fichier n'étaient notés nulle part.

## La décision

C'est un rangement : mêmes commandes, mêmes noms, mêmes refus, mêmes droits,
mêmes réponses.

- **Un registre déclaratif.** Chaque commande est une ligne de la table
  `COMMANDES` : son type, son gestionnaire, son schéma, son niveau d'accès
  (`OUVERTE`, `ADMIN`, `CODE_OU_ADMIN`), son module. Une seule boucle l'inscrit,
  avec les mêmes décorateurs dans le même ordre : `require_admin`, puis le
  module (`not_available`), puis la garde du code de la maison. Les modules
  arrivent par un seul `acces(nom)`. L'état et la configuration d'un module
  passent par deux gestionnaires communs, `_etat` et `_config`.
- **Une table des modules.** `_async_setup_common` parcourt `MODULES` : la clé,
  la classe, ce qu'elle requiert, ce qu'elle reçoit, ce que dit le journal si
  elle ne naît pas. L'ordre de naissance est celui d'avant. La classe se
  charge par `__import__(…, level=1)`, ce que fait `from .x import Y` :
  `importlib.import_module` dans la boucle ferait signaler un appel bloquant
  par Home Assistant.
- **Deux petits modules communs.** `nombres.py` : `fini(x)` (déjà un nombre)
  et `lu(x)` (se lit comme un nombre). `entites.py` : `motif()` et
  `motif_de(domaines)`, qui rendent chaque regex d'entité à l'identique.
- **Les boutons sans fil.** Une liste blanche de domaines (`DOMAINES_PERMIS`) :
  les gestes de l'écran, ceux de la maison — `light.turn_on`,
  `homeassistant.turn_on`, `homeassistant.turn_off` au 30/10 — et les gestes
  courants (scènes, scripts, volets, lecteurs, ventilateurs, textes, voix…).
  De `homeassistant`, seuls `turn_on`, `turn_off`, `toggle` et
  `update_entity`. La casse ne compte pas, comme pour Home Assistant. Restent
  refusés : les services propres à une intégration (`mqtt.publish`,
  `sonos.*`, `alarmo.*`…), à rouvrir un par un s'il en veut. Les trois gestes
  qui ouvrent la maison restent refusés. Chaque geste est vérifié à
  l'écriture : `interrupteur_geste_illisible`, `interrupteur_service_refuse`
  (qui nomme le service), traduits dans les sept langues ; rien ne s'écrit.
  Un geste hors liste déjà écrit ne part plus à l'appui, et le journal le dit.
- **Un temporaire par envoi.** `fichiers.py` : `tempfile.mkstemp` dans le
  dossier de la cible, puis `os.replace`. Un échec ne laisse ni temporaire ni
  fichier à moitié écrit.
- **Les ADR.** Un gabarit (`gabarit.md`), la ligne inverse dans l'ADR
  remplacée, les numéros sans fichier notés dans l'index, les cases Statut
  vides de l'index remplies depuis les fichiers. Les statuts « à l'essai »
  ne sont pas tranchés ici.

Écarté : découper `volets.py` (une classe de 1 774 lignes) — pas dans ce lot.

## Les conséquences

- Redémarrage de Home Assistant pour le composant.
- `tests/python/test_websocket_registre.py` épingle, pour chacune des 57
  commandes, son nom, son niveau d'accès constaté en l'exécutant et ses champs,
  relevés sur l'ancien code. Les tests qui relisaient les décorateurs relisent
  la table : leurs assertions portent « ASSERTION MODIFIEE (lot 8) ».
- Deux bords changent, d'une exception à un refus : un entier de quatre cents
  chiffres rend `None` au lieu de lever `OverflowError` (`nombres.py`), et un
  seuil de vent de cette taille est refusé par son code.
- Une affectation de bouton hors liste, écrite à la main dans le fichier,
  cesse de partir ; l'écran la montre encore comme affectée, le journal de
  Home Assistant dit pourquoi elle se tait. `lock.unlock` et voisins se
  refusent désormais dès l'écriture, plus seulement à l'appui.
- Un temporaire laissé par un arrêt brutal garde un nom aléatoire
  (`rdc.glb.XXXX.tmp`) au lieu d'être réécrit au prochain envoi ; rien ne le
  sert ni ne le liste.
- Sous Windows, deux renommages simultanés vers la même cible peuvent être
  refusés par le système ; Home Assistant tourne sous Linux.
