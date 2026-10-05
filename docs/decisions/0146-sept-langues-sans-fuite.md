# 0146 — Sept langues, sans fuite

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant
requis** (décision 0126) : les refus du composant portent désormais un code.

Le lot 12 de l'audit du 03/10. La barre du bas et le hub des Paramètres
avaient déjà été réglés au lot 7 (ADR 0140), et le badge de la démo traduit.
Restaient onze constats.

**Ce qui restait en français.** Le filet `rien_en_francais` ne lisait qu'un
nœud JSX sans accolade. Passaient donc sans être vus :
- un texte mêlé d'expressions (« actuel {x}° ») ;
- les littéraux d'un ternaire ;
- les attributs `title`, `aria-label`, `placeholder` et `alt` ;
- les `alert()`.

Plus de quatre-vingts textes visibles restaient en français dans les sept
langues : la recherche, la vue vide et ses douze motifs, la vue Croquettes,
les blancs d'une lampe, les boutons de cartes, une dizaine de pages des
Paramètres, le plan du robot… Ils passent tous par `tr()` / `trN()`. Le filet
est élargi à ces formes ; il a été écrit en DERNIER, une fois connus les
correctifs, pour naître vert.

**Les pluriels.** `trN(n, tr(a), tr(b))` recevait des chaînes déjà
traduites : un objet de formes polonais ne se départageait plus (« 3 ikon »
au lieu de « 3 ikony »). `trN` reçoit désormais les gabarits nus, et un test
refuse `trN(…, tr(`.

**Les mots assemblés.** « Aucun » + « mouvement » donnait « Brak ruch » :
c'est la clé entière « Aucun mouvement ». « Dernier indice : … » passe par
un gabarit `{a} : {b}`, sans espace avant les deux-points hors du français.

**Un mot, deux sens.** « Froid » et « Sec » servaient à la sensation, aux
modes de climatisation et aux blancs d'une lampe. En allemand, la jauge
d'humidité affichait « Trocknen » (sécher). Désormais :
- la sensation a ses clés « · ressenti » (`trSens`) ;
- les modes de climatisation passent par le mot de Home Assistant (`trHA`) ;
- les blancs ont les leurs : « Blanc chaud », « Blanc neutre », « Blanc
  froid ».

**Les nombres.** Vingt-trois `replace('.', ',')` faisaient lire « 21,5 °C » en
anglais, et la bannière (`toFixed`) affichait « 21.3 » au-dessus de cartes en
« 21,4 ». Une seule fonction, `nombre()` (`format.js`), formate selon la
langue de l'écran. Un test refuse `replace('.', ',')`. Mesuré dans la démo :
« 21.3 » partout en anglais, « 21,3 » partout en français et en polonais.

**Les refus du serveur** s'affichaient en français sans accents (« trop de
scenarios (24 au plus) »). Chaque refus prévisible porte maintenant un code
(`refus.py`), traduit à l'écran dans les sept langues (`refus.js`). Le
message reste en dernier recours, et le refus nomme toujours la clé ou la
limite.

**Le reste :**
- les noms et les rappels de la démo se disent dans sa langue ;
- les tris passent par `comparerTextes` (la langue de l'écran, plus `'fr'` en
  dur) ;
- l'horloge d'une carte suit la langue de l'écran, plus celle du navigateur ;
- le site annonce les sept langues (« textes de vitrine vrais ») ;
- quatre textes renvoyaient vers « Paramètres → Entités », une section
  supprimée : ils disent maintenant le vrai chemin, en mode édition, le
  bouton « Entités de la vue ».

**Le polonais (ADR 0141).** Les clés nouvelles suivent le vocabulaire de
Seba882. Six clés dont le français a disparu sont retirées des sept
catalogues ; les phrases qui les remplacent reprennent ses mots, seul le
chemin change. Trois retouches de SES valeurs ont été proposées et
**refusées par l'utilisateur**. Elles restent à lui soumettre :
- « {n} non lues » en formes plurielles ;
- « Froid » → « Chłodzenie » et « Sec » → « Osuszanie », pour les seuls modes
  de climatisation.

**Comment c'est vérifié.** Une douzaine de fichiers de tests, nouveaux ou
étendus : le filet élargi, les pluriels nus, les décimaux, les codes de
refus (JS et Python), les noms de la démo, les tris, les deux-points, le
site, le chemin des entités. Les mesures dans la démo, en anglais, en
français et en polonais, sont citées plus haut.

## Relecture

Une relecture contradictoire en cinq angles a confirmé huit défauts et en a
écarté quatre. Chaque correctif a été préparé puis contesté, et ses tests
échouent sur le code d'avant.

1. **Le robot reprenait des clés d'un autre écran.** « Moyen » est le niveau
   de CO₂ (« Fair » en anglais, « Regular » en espagnol), « Serpillière »
   l'accessoire (« Panno »). Les options du robot ont leurs clés à sens
   (« Moyen · réglage »…), lues par `trSens`. Un mot sans sens y suit `tr`,
   pour que « Arrêt » garde le mot de Home Assistant.
2. **`nombre()` pré-arrondissait** (`Math.round(n * k) / k`) : « -2,2 » pour
   -2,25, « 1,00 » pour 1,005. Il formate désormais directement, et le signe
   d'un zéro arrondi est réglé sans `signDisplay: 'negative'`, qui plante sur
   les navigateurs que la cible du build garde.
3. **L'ordre des scénarios** répondait `invalid_format` à un plafond du
   magasin : il relaie le code (`payload_too_large`), que l'écran dit.
4. **Le journal des règles de la démo**, et celui des volets et de la
   présence côté serveur, recomposaient des motifs sans parties `g` : ils
   restaient en français. Cinq gabarits nouveaux.
5. **La bibliothèque de cartes** montrait des noms fictifs français et
   « 0,6 kWh » en anglais.
6. **L'assistant de la démo** répondait en français ; ses phrases ont une
   table par langue. La teinte de l'orbe lit maintenant les sept langues ;
   ses motifs sont resserrés (« gefahren » ne passe pas au rouge, « non
   acquittée » garde son rouge) et épinglés.
7. **Le journal d'erreurs de la démo** est en anglais, comme celui de Home
   Assistant.
8. **La table de confort** était traduite une fois, au chargement : elle
   devient une fonction (`FICHE_CONFORT()`), et un filet refuse un `tr()`
   exécuté à l'import.

Deux défauts de même famille trouvés en vérifiant dans la démo :
- les pièces du robot et la zone de son planning restaient « Salon ·
  Cuisine » dans une démo anglaise : elles passent par `lieu()` ;
- trente-sept comptes tranchaient leur clé par la règle française,
  `n > 1 ? tr(pluriel) : tr(singulier)`. Zéro tombait au singulier : « 5
  stref · 0 wybrana » sur la fiche du robot, au lieu de « 0 wybranych ». Ils
  passent par `trN`, et `pluriels_nus` refuse la forme. En français, zéro se
  dit désormais au pluriel (« 0 sélectionnées »), comme partout où `trN`
  servait déjà (sa règle, « une forme pour 1, une pour le reste », est
  épinglée par `langues_socle`).

**Textes polonais NOUVEAUX à soumettre à Seba882** (aucune de ses valeurs
n'est touchée) : les quatre options du robot (Średni, Normalny,
Standardowy, Mopowanie), cinq gabarits du journal, vingt noms de la
bibliothèque, sept phrases de l'assistant de la démo.

**Restent, hors de ces constats :**
- `degres` (`meteo.js`) garde le même pré-arrondi que `nombre()` ;
- `HUE_SCENES` (le libellé de catégorie seulement, la bibliothèque reste)
  et deux `VIEW_TITLES` sont traduits à l'import ; le filet les nomme dans
  `RESTES` ;
- `handle_min_poser` et `handle_sir_tester` répondent encore
  `invalid_format` en dur ;
- la table `PIECES` d'`App.jsx` (l'écran d'avant la connexion) porte des
  noms et des valeurs en clair.
