# 0145 — Une mise à jour HACS ne casse plus l'écran

Date : 03/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant ;
le paquet est rebâti au moment de la publication.

Le lot 11 de l'audit du 03/10 : ce qui arrive à une tablette restée ouverte
pendant que HACS remplace le paquet. La question 10 de l'audit (rendre le
filet N-1 réel, ou retirer la promesse) n'ayant pas eu de réponse, le
correctif du plan est appliqué : **le filet devient réel**.

**1. Le filet N-1 n'existait pas en pratique.** L'ADR 0072 promettait qu'une
page restée ouverte pendant une mise à jour garde ses fichiers une version de
plus. `pack_frontend.py` devinait « celui d'avant » par la date des fichiers.
Or un checkout égalise les dates : sur sept passages d'une release à la
suivante, six faisaient perdre à la page précédente 10 à 17 fichiers, son
boot compris. C'est vérifié sur les vrais tags : la page de v3.82.0 nomme des
fichiers absents de v3.84.0.

La page précédente est désormais **nommée**, puis protégée entière, avec tout
ce qu'elle atteint (scripts, imports à la demande, `__vite__mapDeps`, CSS,
images). `generation_precedente` cherche dans cet ordre :
- la page de la dernière release, restaurée depuis son tag si le dossier a été
  vidé ;
- l'`index.html` en place ;
- l'unique autre entrée que la page du jour n'atteint pas.

Une page trouée n'est pas protégée. Si la page en place n'est ni celle du
jour ni la N-1 retrouvée, le pack l'AVERTIT au lieu de la purger en silence.
La règle 5 retire ce qu'aucune des deux pages n'atteint. Le pack se lance
dans un clone qui a les tags (`git fetch --tags`) ;
`tests/generique.test.mjs` exige que le paquet livré porte une page d'avant
et aucun orphelin. **Ce test reste rouge jusqu'au repack de la publication**,
c'est voulu.

Prémisse non vérifiée : que HACS vide bien le dossier à la mise à jour. Dans
les deux cas, la page d'avant est là : restaurée depuis son tag s'il est vide,
gardée s'il ne l'est pas.

**2. Un module chargé à la demande qui manque** (un 404 après une mise à jour)
faisait tomber tout le tableau de bord : « Loggia n'a pas pu s'afficher » et
quatre boutons, dont « Réglages d'usine ». C'est « Recharger » qui réparait.
`lazyRecharge` (`src/recharge.js`) remplace `lazy` partout : sur un échec de
chargement, la page se recharge UNE fois. Un drapeau en `sessionStorage`,
limité à deux minutes, empêche toute boucle. Il en va de même pour
`vite:preloadError`. Un décor qui manque (fond météo, orbe) se rend vide au
lieu d'un écran d'erreur. La page légale des cookies cite ce drapeau.

**3. Une seule barrière d'erreur, à la racine.** Une exception levée au rendu
dans n'importe quelle carte remplaçait tout l'écran (l'ADR 0111 raconte une
vraie `RangeError`). Il y a maintenant une barrière **par vue** et une **par
feuille** (`Barriere`, `ui.jsx`). Elle dit « Cette vue n'a pas pu
s'afficher », avec le liseré panne et un bouton « Réessayer » qui la réarme.
Le reste de Loggia continue, et l'erreur part dans la console comme à la
racine. `parDebut` (`agenda.js`) trie en dernier une entrée illisible au lieu
de lever.

**Comment c'est vérifié.** `tests/recharge.test.mjs` simule les chargements,
le stockage de session et le rechargement, et refuse un `lazy(` nu dans
`src/`. `tests/barrieres.test.mjs` rend un enfant qui lève.
`tests/python/test_pack_frontend.py` rejoue cinq passages de pack sur un dépôt
simulé. Sur le code d'avant le lot, les tests du rechargement et de la
barrière échouent, ainsi que 4 des 5 tests du pack ; le cinquième est une
garde de non-régression. Dans la démo, Système, Paramètres et la fiche du
robot (son plan compris) se chargent à la demande sans erreur.

**Polonais.** Quatre textes nouveaux, alignés sur le vocabulaire de Seba882
(« Spróbuj ponownie », « Loggii »).
