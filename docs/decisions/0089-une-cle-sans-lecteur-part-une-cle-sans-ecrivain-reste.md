# ADR 0089 — Une clé sans lecteur part, une clé sans écrivain reste

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point S5 du plan du 22/09 : « Clés de configuration lues par personne, écrites
par personne ». Le titre met les deux griefs sur le même plan. **Ils n'ont pas
du tout le même poids**, et c'est tout le sujet de cette décision.

## Une clé que rien ne lit : elle part

Elle voyage à chaque écriture, sort dans chaque export, occupe une ligne dans
le magasin du serveur — et ne fait rien. Pire : elle laisse croire que Loggia
sait quelque chose qu'il ne sait pas.

**Quatre étaient dans ce cas**, et elles ont quitté `LOGGIA_SYNC_KEYS` :

- `loggia_lightlayout`, `loggia_climlayout`, `loggia_medlayout` — les vues
  Lumières, Climat et Médias **n'ont pas d'éditeur d'agencement**. Les cinq qui
  en ont un le nomment en clair (`loggia_roomlayout`, `loggia_objlayout`,
  `loggia_coverlayout`, `loggia_enlayout`, `loggia_seclayout`) ; ces trois-là
  étaient synchronisées pour personne. L'ADR 0023 l'avait noté sans conclure.
- `loggia-ciel` — le ciel étoilé a été **retiré** (« un ciel étoilé de 284
  lignes qu'aucun import n'atteignait ») ; son réglage lui a survécu. La
  migration `orion-skyorion → loggia-ciel` était un cas particulier qui
  recopiait un réglage vers une clé morte : il est parti, et la règle de
  migration redevient UNE.

Retirer une clé de ces listes **n'efface aucune donnée** : une valeur déjà
posée reste où elle est, elle cesse seulement d'être portée et exportée.

`LOGGIA_SYNC_KEYS` passe de **34 à 30** entrées, `LOGGIA_CONFIG_KEYS` de **25 à
22**.

## Une clé que plus rien n'écrit : elle reste

C'est un **chemin de reprise**, pas un mort.

`loggia_system`, `loggia_plants`, `loggia_covers`, `loggia_vacuum`,
`loggia_lights`, `loggia_vacuum_entity`, `loggia_weather_entity` : l'écran
Entités ne les écrit plus — il en écrit dix, nommées une par une dans
`saveEnt`. Mais une installation venue d'une version antérieure les porte, et
**le lecteur est ce qui lui garde son réglage**.

Les retirer aurait effacé sa configuration en silence, sans message, sans
trace. C'est ce que l'ADR 0079 refuse dans l'autre sens : un repli ne doit ni
élargir, ni amputer.

**Elles restent toutes.** Un test nomme chacune et son lecteur : si l'une doit
partir un jour, ce sera une décision, pas un ménage.

## Où le plan se trompait

**`MIGRATABLE_KEYS`**, que le plan accusait de porter « douze entrées sans
lecteur ni écrivain ». Une liste de migration **doit** contenir des clés que
plus rien n'écrit : c'est sa définition. Elle sert à lever les anciennes clés
du `localStorage` vers le serveur, une fois, au premier chargement. Ces douze
entrées font leur travail. **Non touchées**, sauf `loggia-ciel`, dont la cible
n'a plus de lecteur.

## Un mensonge de commentaire, corrigé

`CLES_DOMAINE` (views.js) affirmait : « Miroir de `ENT_ALIAS` dans state.js —
les deux doivent dire la même chose. »

**Elles ne le disaient pas** : treize domaines d'un côté, sept de l'autre. Et
c'est **normal** — `ENT_ALIAS` nomme ce que l'écran Entités écrit,
`CLES_DOMAINE` nomme ce que le moteur lit, reprises comprises. La phrase
invitait à « réparer » la divergence, c'est-à-dire à supprimer six lectures de
reprise.

Le commentaire dit maintenant pourquoi les deux tables diffèrent, et un test
refuse le retour de la phrase.

## Ce qui n'a pas été tranché

`loggia_roomhidden` : le code dit « n'est plus écrit », et le bouton « tout
réafficher » ne fait qu'un `localStorage.removeItem`. Le plan le donne « sans
effet » ; je ne l'ai pas vérifié à l'écran, et une affirmation non vérifiée n'a
pas sa place ici. **Laissé tel quel**, à regarder avec le sujet des pièces
masquées.

## Conséquences

- **Rien côté serveur, aucun redémarrage de Home Assistant.**
- Quatre clés de moins à chaque écriture de configuration et dans chaque export.
- Une clé qui retrouve un lecteur doit RETOURNER dans la liste : le test le dit
  dans son message d'échec.

Tests : `tests/cles_dormantes.test.mjs` (+4) — les quatre mortes sont dehors et
le restent, aucune clé synchronisée n'est sans lecteur, les sept clés de
reprise gardent le leur, et la phrase du miroir ne revient pas. 969 au vert
côté JS, 573 côté Python, lint propre, audit propre.
