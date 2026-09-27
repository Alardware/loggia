# 0103 — Ce qui part, et ce qui reste

Date : 27/09/2026. Statut : appliqué (local). Aucun redémarrage de Home
Assistant ; `src/` change — **le paquet est rebâti**. Huitième point de l'audit
du 27/09.

## La bibliothèque Hue RESTE — et l'audit avait tort

L'audit proposait de retirer `HUE_SCENES` (71 lignes, 55 ambiances, 6
collections) et `ScenesContent` (144 lignes). L'argument d'un des agents :
« chez un tiers, ce bloc affiche 40 tuiles grises inertes ».

**C'est faux, sur trois points.** Vérifié avant de toucher à quoi que ce soit :

- 55 ambiances, pas 40 ;
- les tuiles ne sont pas grises : `sceneBackground` pose un **dégradé** tiré
  des cinq couleurs de l'ambiance, et l'image de Philips par-dessus quand elle
  est là ;
- elles ne sont pas inertes : sans script configuré, `applyScene` applique la
  **luminosité** de l'ambiance aux lampes variables, et « Blanc chaud » comme
  « Éteindre » éteignent. Cinquante-cinq préréglages de luminosité nommés, donc.

L'utilisateur a tranché pendant l'audit, capture à l'appui : « moi ça je veux le
garder ». Rien n'a été touché — je n'avais fait que lire. **La ligne est rayée
de la liste**, et ce paragraphe est là pour qu'on ne la repropose pas.

Reste vrai, et noté pour plus tard : `hueScripts()` lit une clé
(`loggia_ent.hueScripts`) qu'**aucun écran n'écrit**. Le désigner dans les
Paramètres débloquerait les couleurs et le sélecteur de pièce, au lieu de la
seule luminosité.

## Le lave-vaisselle : la barre et le temps restant partent

La phase (Lavage / Rinçage / Séchage) vient d'une mesure de puissance, la durée
écoulée d'une heure de départ : du mesuré. Mais la **barre de progression** et
le « ~X min restant » se calculaient sur une durée de cycle de **quatre-vingts
minutes écrite en dur** — un chiffre qu'aucune entité ne donne.

« Il reste 12 min » sur une machine qui en a encore pour une heure est pire que
rien. Trois chemins étaient possibles ; l'utilisateur a choisi de retirer les
deux affichages plutôt que d'ajouter un réglage de durée.

Ce qui reste : la phase, la durée écoulée, les watts. La borne de plausibilité
du départ passe de « deux fois la durée du cycle » à **une journée** —
l'horodatage compte les secondes depuis minuit, et un cycle commencé la veille
donnerait n'importe quoi. Une vraie journée, plus une durée supposée.

## Quatre tests qui ne vérifiaient rien

`choix`, `presence_invite`, `veilles_consommables`, `volets_non_abouti`
portaient chacun un test nommé « les mots ont leur traduction » (ou « les mots
de la liste existent en anglais ») dont le corps lisait `src/langues/en.js` et
n'en concluait **rien**. Ils passaient toujours, et comptaient dans le total.

Un test vert qui ne vérifie rien est pire qu'un test absent : il donne
l'impression que la question est gardée. Les traductions sont déjà tenues par
`rien_en_francais`, `langues_socle` et `langues_catalogues`.

Un test **méta** ferme la porte : chaque `test()` du dossier doit citer
`assert`, ou appeler une aide qui asserte pour lui. Les aides sont nommées dans
le motif — une nouvelle aide fera échouer ce test, qui la réclamera. C'est
voulu. Huit tests de `views.test.mjs` passent ainsi par `ok()` et `ko()`, et
c'est légitime : ces aides assertent.

## Une dépendance de production qu'aucun fichier n'importait

`@bybas/weather-icons` figurait dans les `dependencies`. Ses dix-sept dessins
ont été recopiés dans `src/assets/wx/` (voir l'en-tête de `wxutil.jsx`) : plus
rien ne l'importe, et HACS la téléchargeait pour rien. Retirée par
`npm uninstall`, lot de dépendances à jour.

**L'attribution reste due**, et c'était le piège : les dessins sont toujours
livrés, sous licence MIT, et `site/legal/mentions-legales.html` crédite
Meteocons de Bas Milius en nommant le paquet. Retirer le crédit avec la
dépendance aurait été une faute. Le test le vérifie dans les deux sens : la
dépendance absente, le crédit présent, les dix-sept dessins en place.

## `stag`, une fonction qui ne rendait rien

`const stag = () => undefined;` — et son commentaire disait la garder « pour les
~200 appels existants ». Il en restait **un**, qui étalait `undefined` dans un
objet de style. La cascade d'entrée est partie le 21/08 ; sa dernière trace
part maintenant.

La classe CSS `.o-stag` n'a rien à voir et reste : c'est par elle
qu'`onPaintReady` relance les animations mises en pause avant la première
peinture.

## Ce que je n'ai PAS fait

- **`machines.wallE` et `machines.luba`** — des clés internes nommées d'après
  l'aspirateur et la tondeuse de l'auteur. Les libellés, eux, viennent déjà de
  Home Assistant (`friendly_name`). Renommer casserait
  `tests/etats.test.mjs:95` pour un gain invisible à l'écran ; ces blocs
  déménagent au découpage d'`App.jsx`, c'est là que ça se fera.
- **`backups/` et son `.zip`** — 8,1 Mo qui doublent un instantané déjà
  décompressé à côté. Ce sont des fichiers de l'utilisateur, hors de git : à
  lui de les retirer.

## Vérifications

1 000 tests JS (les quatre muets en moins, deux garde-fous en plus), 579 pytest,
lint propre (45 avertissements, inchangé), audit propre. Paquet rebâti, second
passage sans effet.

Vérifié à l'écran après coup, console vide : la bibliothèque Hue affiche
toujours « Bibliothèque Hue · 7 collections · 55 scènes », ses puces de pièce,
son sélecteur de collection et sa luminosité.
