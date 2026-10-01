# 0124 — Le titre d'une pièce tombe où tombe la salutation

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

« Le titre de la pièce n'est pas aligné avec Bonjour, bonsoir de l'accueil. »
Dit deux fois : la première correction visait une mesure fausse.

**Le calcul.** Sur l'Accueil, la salutation tombe à **+40 px** du haut du
contenu — 26 px de marge, plus les 14 px que la bannière s'ajoute en dedans.
Le titre d'une pièce tombait à +26, puis à +30 après une première correction
bâtie sur un relevé erroné de +30.

**Pourquoi un padding ne pouvait pas marcher.** Sous 820 px, `.loggia-content`
est repassé à `16px 14px 96px !important`. Un padding écrit à la main sur la
vue d'une pièce est donc écrasé sur téléphone, et les deux écrans cessent
d'être d'accord dès qu'on le change.

**Décidé :** une **marge de 14 px** sur le bloc du titre, exactement ce que la
bannière de l'Accueil s'ajoute. Elle suit le padding du contenu au lieu de le
remplacer, donc l'alignement tient aux deux largeurs : +40 en grand écran, +30
sous 820 px, des deux côtés. La marge ne vaut que si le titre arrive en
premier : en édition, le bandeau passe devant et tient le haut à sa place.

Un test épingle les 14 px **des deux côtés** — ceux de la bannière et ceux du
titre — et refuse qu'un composant se glisse entre le contenu et le titre. C'est
exactement ce qui est arrivé ensuite : une illustration de pièce, construite
puis retirée le jour même, repoussait le titre de cent pixels.

---

**Un garde-fou en passant.** Pendant ce travail, un bloc de commentaire de
`index.css` a reçu une seconde marque de fermeture. Tout ce qui suivait a cessé
d'être du CSS — la mise en page d'une vue entière est tombée, **en silence** :
Vite ne dit rien, le navigateur non plus, il saute ce qu'il ne comprend pas. Le
symptôme ressemblait à une erreur de conception, et on cherche au mauvais
endroit.

`tests/styles.test.mjs` compte désormais les ouvertures et les fermetures, et
refuse un commentaire ouvert dans un autre — en CSS, la première fermeture
rencontrée ferme, quoi qu'on ait voulu écrire.
