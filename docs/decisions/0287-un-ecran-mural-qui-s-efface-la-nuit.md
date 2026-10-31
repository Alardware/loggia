# 0287 — Un écran mural qui s'efface la nuit

*29 octobre 2026 — à l'essai (idée validée : « un écran mural qui n'éclaire pas la pièce »)*

## Le problème

Une tablette murale reste allumée toute la nuit. Dans un couloir ou une
chambre, elle éclaire la pièce. L'écran de veille baisse déjà son propre
voile de 23 h à 6 h (ecranveille.jsx), mais seulement quand il s'affiche ; le
reste du temps, et tant qu'on touche l'écran, Loggia garde sa luminosité de
jour.

L'idée vient des cartes « Glass Cards » de Home Assistant : un écran qui
s'assombrit du coucher au lever du soleil.

## La décision

**Un réglage de l'appareil**, Paramètres › Effets, sous « Verre des cartes »
et avant « Écran de veille », sur le modèle du verre (ADR 0284) :

- « Nuit de l'écran » : `Non` / `Soleil`, dans le stockage local
  (`loggia-nuit`), jamais dans le profil ni la maison. **Défaut : Non** —
  rien ne change pour qui ne touche à rien.
- « Assombrir » : `Un peu` / `Moyen` / `Beaucoup` (`loggia-nuit-assombrir`,
  Moyen par défaut), grisée tant que la nuit est sur Non, sans être
  verrouillée : on peut la préparer avant.

Les deux lignes sont alignées sur les autres, sans retrait. La première dit
l'heure : « Du coucher au lever du soleil · ce soir dès 18:41 », ou « · cette
nuit jusqu'à 07:12 » s'il fait déjà nuit.

## Quand fait-il nuit

1. `sun.sun` (`below_horizon`) quand Home Assistant le donne — l'intégration
   Soleil fait partie de la configuration par défaut ;
2. sinon, la course du soleil calculée à la position de la maison
   (`hass.config`), le calcul de `sunInfo` (App.jsx) réduit à deux heures dans
   `soleilcalc.js`, **chargé à la demande** : en attendant son arrivée, les
   heures fixes ;
3. sinon, de 21 h à 7 h.

La nuit se relit chaque minute, hors de React (`nuitecran.js`, un minuteur
qui lit `getHass()`) : aucun rendu de plus. Le minuteur ne tourne que sur
Soleil, et s'arrête de lui-même quand on repasse à Non.

## Ce que fait la nuit

Les classes se posent sur `<html>` **à l'import de theme.js**, donc avant le
premier rendu : une tablette rechargée en pleine nuit ne s'allume pas
d'abord. `loggia-nuit-sol` dit que l'appareil suit le soleil et arme les
transitions ; `loggia-nuit` qu'il fait nuit ; `data-nuit` l'intensité.

- **Un voile noir** par-dessus tout (`body::after`, fixe, au plus haut
  z-index), qui laisse passer les clics (`pointer-events: none`) : 15, 30 ou
  45 %.
- **La photo de fond** baisse aussi : `brightness(.85 / .7 / .55)` sur son
  calque. En verre Léger, l'assombrissement s'ajoute au flou, il ne le
  remplace pas.
- **Le passage** dure 4 s, dans les deux sens.
- **L'écran de veille** garde son voile à lui : le nôtre s'en retire
  (`body:has(.o-sombre[style*="position: fixed"])`, la veille étant le seul
  îlot sombre fixe), sans fondu, et revient de même au réveil — pas d'écran
  clair qui s'éteint peu à peu sous le doigt.

Mesuré sur le thème par défaut (contraste WCAG, voile composé sur la carte) :
le texte principal garde au moins 5:1 à 45 % (5,09 en sombre, 5,46 en clair),
le texte secondaire (`--o-text2`) 3,8:1 à 30 %, 2,7 à 45 %. Le ratio WCAG
suppose une pièce éclairée ; dans le noir, l'œil s'adapte, et c'est le prix
d'un écran qui s'efface. Aucune couleur nouvelle : le noir du voile seulement.

## Ce qui n'est pas fait : le thème foncé forcé

Le clair / foncé se décide dans App.jsx (`themeMode`, `matchMedia`), qui en
garde l'état React (`lightMode`, le retour d'`applyTheme`) : le voile de la
photo de fond et le bouton de l'en-tête le lisent. Forcer le foncé depuis
theme.js changerait les couleurs sans que cet état suive — photo voilée de
blanc sur un thème sombre, bouton à l'envers — jusqu'au prochain réglage.
Et un changement de thème repeint tous les jetons d'un coup : pas de
transition douce possible. Le faire proprement demande de toucher App.jsx ;
le voile et la photo suffisent pour cette livraison.

## Plus tard

Rapprocher le voile de la veille (23 h–6 h, fixe) de celui-ci (le soleil,
réglable) : une seule notion de nuit pour l'appareil. Non fait ici.

Démarrage : +1 067 octets (`nuitecran.js` ; `soleilcalc.js`, 496 octets, à
part).
