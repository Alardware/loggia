# 0140 — Ce qui se coupait à l'écran

Date : 03/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant :
seul l'écran change.

Le lot 7 de l'audit du 03/10 : sept endroits où un texte se coupait, se
cachait ou débordait chez son voisin, surtout au téléphone et dans les langues
aux mots longs. Tous mesurés dans la démo — 390, 360 et 320 px, 1024 et
1440 px, dans les sept langues.

**1. La barre du bas.** Traduits, « Bezpieczeństwo » (pl), « Dispositivos »
(es), « Dispositivi » (it) débordaient de leur case et chevauchaient leurs
voisins. Deux causes. D'abord le `* { min-width: 0 }` global forçait six cases
égales quoi qu'elles portent. Ensuite, aucun libellé n'était prévu pour une
place aussi étroite. **Décidé avec l'utilisateur : des libellés courts, propres
à la barre** (plutôt que deux lignes). Cinq catalogues portent
« Accueil · court », « Scénarios · court », « Objets · court » et
« Sécurité · court », lus par `trCourt`. La clé s'écrit en entier à l'appel,
pour que le test des clés orphelines la trouve. Le français garde ses mots.

**Le polonais aussi.** Sa traduction est l'œuvre d'un vrai Polonais (le
contributeur GitHub Seba882) : l'utilisateur ne veut pas qu'on y touche. Ces
formes sont donc facultatives, et le test de parité des catalogues les exempte.
Sans elles, `trCourt` retombe sur le libellé ordinaire de la langue, jamais
sur l'anglais.

C'est donc la mise en page qui s'adapte aux mots. Une case ne rétrécit plus
sous son libellé (`minWidth: 'auto'`), donc la **somme** doit tenir. Le corps
du texte s'ajuste à la place, de 11 à 9,5 px : il est mesuré au montage, au
redimensionnement et à l'arrivée de la police. Résultats mesurés :

| Langue | 390 px | 360 px | 320 px |
|---|---|---|---|
| français | 11 px | 11 px | 10,4 px |
| polonais | 10,6 px, mots entiers | 9,6 px, mots entiers | 9,5 px, coupe « … » |
| cinq autres langues | 11 px | 11 px | 11 px |

À 320 px en polonais, le texte tomberait sous 9,5 px. Les mots courts (Start,
Energia, Menu) restent alors entiers, et les trois longs se partagent le reste,
coupés en « … ». Rien ne chevauche, dans aucune langue.

**2. La pastille compacte d'une pièce, sur l'Accueil.** À côté de l'icône, de
la température et de l'interrupteur, il restait au nom 59 px à 390 px et 24 px
à 320 px : « Cuis… », « Sall… ». **Maquette « 1b » choisie par
l'utilisateur.** L'icône et l'interrupteur tiennent la ligne du haut ; le nom
et « 22,1° · Tout éteint » ont toute la largeur en bas. La bascule de la
température par container query disparaît avec l'ancienne disposition. Ni les
tailles 88/184 ni la grille commune ne bougent.

**3. L'alerte d'une carte de pièce réduite à « ⚠ … ».** `FlipText` était un
bloc atomique (`inline-block`). Placé après l'icône, il débordait de 15 px, et
l'ellipse du parent le cachait **en entier**. Au repos, c'est désormais du
texte, qui se coupe comme du texte : « ⚠ Finestra aperta · CO… ». Le bloc ne
sert plus qu'aux 0,38 s de la bascule animée.

**4. La puce de pièce choisie, hors du cadre sur ordinateur.** La barre des
pièces centrait la puce d'après `offsetLeft`, mesuré depuis le corps de la
page : la barre latérale entrait dans le calcul, avec 312 px d'erreur. La
position se mesure maintenant dans la barre.

**5. La recherche de l'en-tête réduite à « R » à 1024 px.** Partagé à parts
égales avec l'espaceur, le champ laissait 11 px au texte. Il garde 200 px
(`index.css`), et l'en-tête se mesure **lui-même** par une requête de
conteneur, barre latérale ouverte ou fermée :
- sous 700 px, la date et son trait cèdent leur place ;
- sous 540 px, plus de minimum, et « Ctrl K » rend ses 55 px au texte.

Rien ne déborde de 1440 à 580 px. Au-dessus de 1280 px, rien ne change. Les
menus de l'en-tête restent au-dessus de la page : il portait déjà un
`transform`.

**6. Le hub Paramètres.** À 1440 px, six sous-titres sur dix finissaient en
« … ». Ils passent sur deux lignes à hauteur **réservée**, pour que la grande
valeur tombe au même endroit dans toutes les cartes d'une rangée. La valeur
elle-même ne se coupe plus (« notify » devenait « no… ») : c'est l'unité qui
cède. En italien, « Firmware e componenti aggiuntivi » faisait encore trois
lignes et devient « Firmware e add-on », comme les add-ons des autres langues.

**7. Le badge de la démo.** Peint au-dessus de tout, il couvrait le bas de
chaque feuille, et son lien « Mentions légales » prenait les clics destinés
aux boutons du pied. Il s'efface tant qu'une fenêtre (`role="dialog"`) est
ouverte.
Il parle aussi la langue de la démo, comme ses pièces : il restait en
français au milieu d'une maison polonaise (question 14 de l'audit, tranchée
par l'utilisateur : « traduis le badge »). Le lien « Mentions légales »
traduit son libellé, mais garde `hreflang="fr"` : les pages légales
n'existent qu'en français. Cela ne touche que la démo.

**Reste ouvert.** Entre 821 et 880 px avec la barre latérale ouverte,
l'en-tête reste serré : 40 à 60 px de texte dans la recherche, mais rien ne
déborde.

**Comment c'est vérifié.** La mise en page ne se calcule pas sous Node : deux
fichiers de tests épinglent ce qui la tient. `barre_mobile_courte.test.mjs`
vérifie chaque forme courte dans les six catalogues. `mise_en_page_lot7.test.mjs`
couvre les six autres points. Chaque défaut a d'abord été reproduit dans la
démo, puis mesuré corrigé :
- barre : position de chaque libellé par rapport à sa case, dans les sept
  langues, à 320, 360 et 390 px ;
- alerte : caractères visibles, sur l'ancien bloc puis sur le texte ;
- puce : `offsetParent` = `BODY`, l'ancien et le nouveau calcul comparés ;
- recherche : largeurs de 1440 à 580 px ;
- sous-titres : hauteur de défilement ;
- badge : `display` avant, pendant et après une feuille.
