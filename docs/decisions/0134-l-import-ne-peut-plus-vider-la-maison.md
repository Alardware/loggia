# 0134 — L'import ne peut plus vider la maison

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(décision 0126) : le composant gagne `rechargement.py`, voir plus bas.

L'audit du 03/10 a trouvé un seul défaut **critique**, et il était là : importer
une configuration pouvait laisser la maison **vide**. Pas un réglage perdu —
plus de pièces, plus de profils, plus d'agencements, plus de caméras, sur tous
les écrans à la fois.

**Le chemin du défaut.** L'import faisait deux envois au composant : d'abord la
**purge** (chaque clé existante à `null`), puis le **contenu** du fichier. La
purge passait toujours — des valeurs nulles ne pèsent rien. Le contenu, lui,
pouvait être refusé, ou perdu avec la connexion. Il ne restait alors rien.

Et il était refusé dans un cas tout à fait ordinaire. L'export balaie le
stockage local par motif (`loggia_`, `loggia-`, décision du 24/09) : la
**photo de fond** — « jamais envoyée au serveur », dit `ui.jsx` — partait donc
dans le fichier. Compressée, elle pèse de 87 à 331 Ko ; le composant refuse
toute valeur de plus de 256 Kio. Deux fonds d'écran Windows sur dix-huit
suffisaient. Même la sauvegarde automatique faite **avant une remise à zéro**
(décision 0050) ne se restaurait plus.

Troisième défaut, dans la même fonction : n'importe quel objet JSON passait pour
une configuration. Un `package.json` choisi par erreur dans les téléchargements
remplaçait la maison par ses `dependencies`, sans confirmation ni sauvegarde.

---

**Décidé : un seul envoi.** La purge et le contenu partent ENSEMBLE, dans le
même `loggia/config/set`. Le composant savait déjà accepter tout ou rien :
`_set_locked` construit la nouvelle configuration en mémoire, vérifie droits,
nombre de clés et tailles, puis l'écrit d'un bloc — refusée, rien n'a bougé.
Aucune commande serveur nouvelle, donc ; c'est le client qui coupait en deux un
geste que le serveur savait faire d'un coup. Trois tests Python épinglent
maintenant ce contrat, puisque l'import en dépend.

**Ce que l'appareil sait de lui-même reste sur l'appareil.** Une liste nommée
(`config.js`, `estCleAppareil`) : la photo de fond, le journal des
notifications lues, l'identifiant de l'assistant, la dernière langue servie,
les traductions de Home Assistant en cache, la date de la dernière vérification
de mise à jour, les favoris de lecture, les dernières applications et icônes,
et l'écran de veille **de cet appareil**. Ni exportées, ni importées, ni
effacées par un import. Les clés que le serveur calcule ou garde pour lui
(`loggia_admin_pin_defini`, le code administrateur) non plus.

C'est une liste d'**exclusion**, et c'est voulu : le balayage par motif reste,
pour qu'une clé de configuration ajoutée demain soit sauvegardée sans qu'on y
pense. Une clé d'appareil oubliée dans la liste partirait dans l'export — moins
grave, et le commentaire dit où l'ajouter. Le filtre vaut aussi pour ce que
renvoie le serveur : un ancien import a pu y ranger la photo d'un appareil dans
la partie commune ; elle n'en ressort plus, et le prochain import l'efface.

**Lire avant d'écrire.** `lireConfigImport` lit le fichier sans rien envoyer :
seules les clés Loggia passent, et un fichier qui n'en a aucune est refusé avec
un motif traduit — « ce fichier n'est pas une configuration Loggia. Rien n'a été
modifié. » L'ancien format plat reste accepté.

**Le même geste que la remise à zéro.** Choisir un fichier ne fait plus que le lire.
Son résumé s'affiche — date, pièces, profils — et le bouton passe au rouge,
« Remplacer la configuration ? ». Un second appui confirme ; sinon tout retombe
au bout de 15 secondes. La configuration actuelle est alors **téléchargée
d'abord**, et sans elle l'import n'a pas lieu. Un refus de Home Assistant le dit
(« la configuration de la maison n'a pas été touchée ») ; une connexion perdue
aussi, sans promettre ce qu'on ne sait pas.

**En passant.** Sans composant, l'import n'écrivait que les valeurs texte :
pièces et profils, qui sont des tableaux, disparaissaient. Ils s'écrivent
maintenant en JSON — **sans composant seulement** : avec lui, une copie de la
maison laissée sur l'appareil remonterait plus tard au serveur par
`completerDepuisLocal`, et déferait une remise à zéro faite ailleurs. Le carnet
des réglages en attente est vidé par l'import —
il rejouerait sinon, au démarrage suivant, des réglages d'avant. Le bouton
« Exporter » dit son échec au lieu de ne rien faire, et une sauvegarde qui n'a
pas pu être proposée au téléchargement n'en est plus une, pour l'import comme
pour la remise à zéro.

---

**Comment c'est vérifié.** `tests/import_export.test.mjs` **exécute** l'export,
l'import et la remise à zéro contre un faux composant aussi strict que
`store.py`. Ses dix-sept premiers cas d'exécution, rejoués sur le code de la
v3.84.0, échouent treize fois : ce sont les défauts de l'audit ; les quatre
autres gardent ce qui marchait déjà (la remise à zéro, le carnet vidé). Un cas
fige l'ordre des gestes à l'écran, et la relecture en a ajouté trois (voir
plus bas) — vingt et un en tout. À l'écran, dans la démonstration (qui n'a
pas de composant, donc pas de sauvegarde possible) : résumé, bouton rouge,
retour à « Importer » au bout de 15 s, import annulé faute de sauvegarde,
fichier étranger et JSON illisible refusés, export qui dit son échec — sur
ordinateur et à 390 px.

---

**Ce que la relecture adverse a changé.** Quatre relecteurs indépendants, puis
deux contradicteurs par remarque ; douze remarques ont tenu.

- **Les modules reprennent la configuration importée tout de suite.** Nuit,
  Volets, Présence, Fenêtres, Veilles et Robots la gardent en mémoire : le
  fichier changeait, pas le module — la vue Nuit montrait l'ancienne heure du
  coucher, et la maison s'éteignait à cette heure-là jusqu'au redémarrage
  suivant. `rechargement.py` écoute le signal que le magasin émet déjà, clé
  par clé (décision 0067), et recharge le module touché par sa propre
  méthode d'enregistrement, à vide. Pas de boucle : les modules écrivent par
  `async_set_shared`, qui ne signale rien. La remise à zéro en profite aussi.
- **L'état d'exécution du serveur n'est pas un réglage.** Les minuteurs qui
  tournent (`loggia_minuteurs`) et le test de sirène (`loggia_sirene_test`) ne
  partent plus dans l'export, et l'import ne les purge ni ne les réécrit :
  réimporté une semaine plus tard, un minuteur échu éteignait une lampe au
  redémarrage suivant.
- **Les marges d'écran et la trace du dernier passage** rejoignent les clés de
  l'appareil : celles d'un téléphone s'imposaient à la tablette murale.
- **Aucun texte interne ne s'affiche.** « Exporter » montrait, dans la
  démonstration anglaise, « Export failed: démonstration : pas de composant
  serveur ». Un échec se dit maintenant par une phrase traduite, sauf le
  message propre d'un refus de Home Assistant.
- **Le bouton dit ce qui se passe** : « Sauvegarde… », puis « Import… » ou
  « Remise à zéro… », au lieu de « Sauvegarde… » pendant toute l'opération.
- En allemand, une phrase complète après un deux-points prend la majuscule.
- Les tests couvrent ce qu'ils laissaient passer : la garde entière du
  téléchargement, une lecture seule qui échoue avant une remise à zéro, un
  fichier aux valeurs toutes nulles, un import refusé qui doit laisser intact le
  carnet des réglages en attente, et toutes les clés de l'appareil. Trois tests
  Python de plus rechargent un vrai module Nuit sur un vrai magasin.

**Pas fait ici.** Le constat de l'audit sur `pack_frontend.py`, qui ne garde
qu'une génération d'anciens fichiers au lieu de deux, appartient au lot 11.
Aucune mesure sur la vraie maison : l'import n'a été rejoué que contre le faux
composant et dans la démonstration.
