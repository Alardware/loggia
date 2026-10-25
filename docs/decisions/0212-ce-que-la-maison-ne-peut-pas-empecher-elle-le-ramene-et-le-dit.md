# 0212 — Ce que la maison ne peut pas empêcher, elle le ramène et le dit

*17 octobre 2026 — accepté, à l'essai (chantier Mode enfant ; rien de publié). La conception : `docs/chantier-mode-enfant.md`, E3 C et E4 B + C tranchés par lui le 17/10, E22, E24 ; § 4 (ce que la maquette montre et qui ne se construit pas) ; § 9 (les limites honnêtes) ; § 10 (la démo).*

## Le problème

Home Assistant ne peut pas EMPÊCHER « Alexa, monte le son », le bouton de l'Echo, l'appli
Alexa, la télécommande de l'Apple TV ni une appli lancée depuis l'écran du téléviseur. Il voit
après coup — en quelques secondes par la jumelle HACS quand son flux tient, jusqu'à une
demi-minute par l'officielle seule, qui sonde — et il sait baisser, éteindre, mettre en pause,
parler. Sa maquette, elle, montre des cadenas sur les applications, un sélecteur « Situation »,
des appels aux parents. Une serrure qui ne ferme pas est pire que pas de serrure (ADR 0045).

## La décision

**La maison agit, et ne prévient que si ça insiste (E3 C).** Un volume ramené, c'est une
ligne au journal — « volume ramené · de 70 à 40 % · à la voix ou sur l'appareil » —, pas une
notification. Trois ramenés en dix minutes sur le même appareil : UNE notification (« Volume
ramené trois fois en dix minutes sur {appareil} »), puis une heure de silence ; de même pour un
écran rallumé trois fois après l'heure (« {appareil} se rallume après l'heure »). Le journal
dit tout ; le téléphone ne dit que ce qui mérite un parent (sa règle : un point à regarder est
actionnable et rare).

**L'Echo prévient cinq minutes avant la coupure (E4 B)** — « {nom}, l'écran s'éteint dans
cinq minutes » —, par sa sœur « Parler » (`notify.send_message`, l'intégration officielle),
dans la langue de la maison, une fois, au volume du moment (donc sous le plafond) ; rien n'est
lancé, rien ne monte. La bascule du profil n'apparaît que si une Echo du profil sait parler.
**L'enfant peut demander (E4 C)**, et le parent répondre depuis la feuille ou depuis son
téléphone : l'ADR 0211.

**Les textes qui partent au téléphone (E22)** sont des constantes d'`enfant.py` (`MSG_DEMANDE`,
`MSG_VOLUME`, `MSG_RALLUMAGE`, la voix, les deux boutons, le titre « Loggia — mode enfant »),
recopiées dans les sept catalogues par `scripts/textes_serveur.mjs` ; le polonais nouveau est
marqué pour Seba882. Le journal parle par ses clés (`regle`, `quoi`, `motif`, `detail`), que
l'écran traduit.

**Les limites, dites dans la popup et ici (§ 9).** « Loggia ramène le volume à ce niveau s'il
est monté depuis l'appareil, à la voix ou dans l'appli Alexa » — ramène, pas empêche : le son
fort dure le temps du sondage. La télécommande rallume l'écran : la maison le rééteint vingt
secondes plus tard, une fois par minute, et prévient à la troisième fois. Un son lancé à la
voix au coucher est mis en pause vingt secondes après, parce que la maison ne distingue pas une
berceuse d'autre chose : les sons pour dormir passent par les puces de Loggia (« Bruit blanc »,
« Musique pour dormir »), ou le parent lève les limites — c'est dit sous les puces. Un volume
monté par un parent depuis Home Assistant est ramené aussi, tant que les limites ne sont pas
levées : la règle ne lit pas QUI a monté. Une appli lancée depuis l'écran : rien — « Les
applications se verrouillent dans les Réglages de l'Apple TV (Restrictions), pas ici. » Amazon
Kids, le temps d'écran de l'Apple TV, les comptes enfants d'Apple : Loggia ne les remplace pas
et ne les connaît pas. Home Assistant arrêté : rien n'agit ; au redémarrage, une coupure due
s'exécute si l'écran est allumé et toujours bloqué, les compteurs reprennent, le temps de
l'arrêt n'est pas compté.

*17/10, passe bis (point 2).* Ces limites sont maintenant ÉCRITES dans la popup, et pas seulement
ici : sous les deux puces des sons pour dormir, la ligne « Un son lancé à la voix est mis en pause
20 secondes après : la maison ne distingue pas une berceuse d'autre chose. Les sons pour dormir
passent par ces puces, ou le parent lève les limites. » — le paragraphe ci-dessus disait « c'est
dit sous les puces » alors que rien ne l'était. Et l'écran bloqué, éteint, fait dans sa popup
comme sur la carte étroite (E16) : ni « Allumer » ni « lancez une appli » — des boutons que la
maison déferait vingt secondes plus tard —, mais « Revient à 08:30 », inerte, et la raison
(« Rallumé, l'écran s'éteindrait 20 secondes plus tard : le mode enfant le tient jusqu'à
08:30. ») ; ses applications ne se dessinent pas non plus (lancer une appli allume la TV, une
touche la réveille) : « Les applications reviennent à 08:30 : le mode enfant tient l'écran. »,
puis la phrase des Restrictions. `tests/fiche_media.test.mjs` le tient.

*17/10, passe bis 2 (points 2 et 5).* L'interrupteur d'un écran bloqué part aussi : la bascule de la
carte large et celle de l'en-tête de la popup ne s'offrent plus tant que le mode enfant tient l'écran
(temps écoulé, coucher), éteint ou allumé. La conception disait « la bascule reste : un parent peut
allumer, la maison éteindra à nouveau » — c'était un bouton tendu que la maison défait vingt secondes
plus tard, et l'enfant qui l'appuie y voit une panne. La carte étroite et le corps de la popup disaient
déjà « Revient à 08:30 », inerte ; le parent qui veut l'écran lève les limites, et la bascule revient
avec elles. Et un état muet n'est pas un rallumage : seul « off » ou « standby » → allumé arme la grâce
de vingt secondes et compte pour l'insistance ; une intégration qui se reconnecte (`unavailable`,
`unknown`) ou une entité recréée (aucun état avant) ne prévient plus le téléphone à tort — trois
reconnexions en dix minutes sur un écran bloqué en faisaient trois « rallumages ». Le tic de la minute
éteint de toute façon l'écran bloqué et allumé, au motif « temps écoulé » ou « coucher ».
`tests/carte_media.test.mjs`, `tests/fiche_media.test.mjs` et `tests/python/test_enfant.py` le tiennent.

*17/10, passe bis 3 (point 2).* La bibliothèque d'un écran bloqué part à son tour : ses favoris et
« Parcourir la bibliothèque » mènent à `play_media`, qui réveille l'Apple TV — la maison la rééteint
vingt secondes plus tard. Bloqué, le panneau n'est pas dessiné, comme les applis et la télécommande ;
la phrase de « Rien en lecture » ne montre plus du doigt ni applis ni bibliothèque ; un navigateur
ouvert au moment du blocage se ferme, et ne se rouvre pas seul quand les limites sont levées.
`tests/fiche_media.test.mjs` le tient.

**Ce que la maquette montre et qui ne se construit pas (§ 4).** « Appeler les parents »,
« Appeler les autres contacts », « Autres contacts · Masqués » : Home Assistant ne sait pas
appeler (ADR 0209) ; la section ne garde que « Recevoir les annonces » (la sœur « Annonces »
de l'officielle, E23). « Applications autorisées » et les applis cadenassées : rien ne bloque
une appli sur une Apple TV, Loggia ne pourrait que les masquer dans SA popup ; elles partent,
et la popup le dit. Le sélecteur « Situation » et « Dernier geste » : des commandes de
maquette ; la démo prend les trois situations au fil de l'heure (`?demo&heure=18:20`,
`?demo&heure=21:30`). Les couleurs par application : inventées (ADR 0207). « Au lit, les
enfants » existe déjà (ADR 0209).

**La démo joue tout (E24, § 10)** : le profil « Lino » sur la chambre, les trois situations
selon l'heure, le faux serveur qui répond aux six commandes avec les droits du vrai, et qui
RAMÈNE — un volume au-dessus du plafond une seconde après, un écran bloqué rallumé vingt
secondes après —, le journal avec les mots du serveur, la notification notée au journal (la
démo ne sonne pas et ne parle pas) ; hors des heures, l'Echo de la démo est déjà à 20 %.

## Ce que cela coûte

Entre le premier et le troisième volume monté, le journal seul. La voix ne parle que si une
Echo du profil a sa sœur « Parler » et que la bascule est allumée. Un parent qui monte le son
depuis Home Assistant est ramené comme l'enfant, tant qu'il ne lève pas les limites (un geste,
trente minutes). La reconnaissance du plafond dépend de ce que l'intégration publie : une
jumelle HACS dont la session a expiré ne pousse plus, et le plafond ne tient plus que par le
sondage de l'officielle.

## Ce qu'on n'a pas fait

Prévenir à chaque fois (E3 B) ; compter sans couper (E3 D) ; couper sans prévenir (E4 A) ; les
appels et l'interphone ; le masquage des applications (si un jour il le veut quand même : une
liste de noms dans le profil et un filtre dans `PanneauTv` — une tâche, pas un module) ; le
« Ne pas déranger » au coucher ; piloter Amazon Kids ou les Restrictions de tvOS.

## Ce que les tests tiennent

`tests/python/test_enfant_calcul.py` (l'insistance prévient une fois puis se tait une heure ;
l'échéance dit dans combien de temps l'écran se coupe ; le titre gardé au coucher),
`test_enfant.py` (l'insistance prévient le téléphone une fois puis le journal seul ; rallumée,
la TV attend vingt secondes, se rééteint, et la troisième fois prévient ; cinq minutes avant la
fin l'Echo le dit une fois ; la voix parle la langue de la maison ; au coucher l'Echo se met en
pause sauf le son pour dormir ; sons coupés, tout se met en pause et une officielle seule
s'arrête ; « Observer sans agir » note sans rien envoyer ; le module ne connaît ni `turn_on` ni
`media_play` ni `volume_up`), `test_lot16_alertes_traduites.py` et `test_regles.py` (les textes
du téléphone dans les sept langues ; `prevenir` porte ses boutons), `tests/fiche_media.test.mjs`
(« C'est fini pour aujourd'hui », « C'est l'heure de dormir », la phrase des Restrictions),
`tests/fiche_enfant.test.mjs` (la phrase sous le volume maximum, les sons pour dormir, la voix),
`tests/demo_enfant.test.mjs` (la maison ramène dans la démo ; chaque mot du journal a sa clé).
