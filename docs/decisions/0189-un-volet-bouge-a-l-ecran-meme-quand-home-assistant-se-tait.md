# 0189 — Un volet bouge à l'écran même quand Home Assistant se tait

*12 octobre 2026 — accepté, à l'essai (plan 2 du chantier Volets, rien de publié)*

## Le problème

Chez lui, les volets sont des Netatmo, et Home Assistant n'y voit jamais
`opening` ni `closing`. L'état bascule d'abord, avec la position d'avant : pour
une fermeture, `closed` alors que la position vaut encore 100 ; pour une
ouverture, `open` alors qu'elle vaut encore 0. La vraie position n'arrive
qu'une à trois minutes plus tard (le 12/10 : `open 0` à 08:30:34, puis
`open 100` à 08:33:05). Touché, un volet semblait ne rien faire — ou s'éteindre
d'un coup, puis se rallumer.

Sa chambre ajoute un piège : elle s'arrête à 1 %, et Home Assistant la publie
alors `open`, position 1, comme si elle s'ouvrait. Le 09/10, `closed 100` à
19:29:08, puis `open 1` à 19:30:01 : c'était la fin d'une fermeture, pas le
début d'une ouverture.

## La décision

**L'écran JOUE la course quand personne ne la publie (V8).** 20 s la course
complète (`COURSE_COMPLETE_S`), au prorata de l'écart — une demi-course, 10 s —,
puis la position visée TIENT, 180 s au plus (`TENUE_S`), en attendant que Home
Assistant la confirme. Passé 180 s, Home Assistant fait foi : un volet bloqué se
voit. Le chiffre d'une course est une estimation, et une réponse de Home
Assistant le remplace aussitôt — le principe de `useOptimiste` (ADR 0105) : un
affichage anticipé expire toujours.

**Quatre sources, de la plus sûre à la moins sûre** — un geste dans l'écran ;
un ordre du serveur (`manoeuvre`) ; `opening` / `closing` ; la bascule Netatmo
(l'état change SANS que la position change, il y a moins de 180 s). Une source
moins sûre ne remplace jamais la course d'une plus sûre. Un ordre plus récent du
serveur — une reprise — remplace celui d'avant ; seul un geste lui résiste.

**La bascule ne vaut pas dans les deux sens.** Vers le BAS, elle se déduit de
toute position : `open` devient `closed`, la position ne bouge pas. Vers le
HAUT, seulement d'un `closed` à 0 % : `closed 0` devient `open 0`, comme le
12/10. Le piège est sa chambre, qui bute à 1 % : quand le planning du soir lui
renvoie la fermeture alors qu'elle y est déjà, l'état passe à `closed` sans que
la position change (1), puis la position arrive et Home Assistant redit
`open 1`. C'est arrivé : le 08/10, un ordre de fermeture donné depuis Home
Assistant à la chambre déjà fermée l'a publiée `closed 1` à 21:19:04, puis
`open 1` à 21:19:38 (lu dans son historique le 12/10). Y lire une ouverture
montrerait « En ouverture », puis « Ouvert 100 % »
pendant plus de trois minutes sur un volet fermé. Un volet bloqué à mi-course
fait pareil (`closed 60`, puis `open 60`). Ni l'un ni l'autre ne bouge à
l'écran.

**Une position qui ARRIVE n'est pas une bascule.** Le 09/10, `closed 100` puis
`open 1` était la FIN d'une fermeture. Pendant une course, une position qui
arrive la confirme si elle est à 5 près de la cible et que le volet est arrêté
(`CONFIRMATION`), la recale si le moteur court encore — le dessin suit le vrai
moteur, sans saut —, ou la termine : Home Assistant dit autre chose, il fait
foi. Au chargement de la page, on ne sait rien de l'état d'avant : rien ne se
déduit. Une coupure (`unavailable`, fréquente chez lui) non plus : la dernière
lecture reste.

**L'ordre du serveur** reste publié tant que la vérification attend — six
minutes au plus par ordre (ADR 0192) —, et le serveur le retire dès qu'une main,
ou une autre règle qui tient le volet, l'a repris : ce n'est plus la course que
fait le volet. Une reprise remet son `depuis` et se joue comme un ordre nouveau.
L'écran ne joue qu'un ordre de moins de 180 s, et une seule fois ; un volet déjà
à sa cible ne bouge pas. Pour un `opening` / `closing`, la cible de cet ordre ne
sert que s'il a moins de 180 s et va dans le sens du mouvement ; sinon la course
va au bout (100 ou 0).

**Le mouvement réduit** (`prefers-reduced-motion`) ne change que le DESSIN. La
course garde sa durée : « En fermeture », Stop allumé, la tenue de 180 s, la
confirmation et la phrase ne bougent pas ; le petit volet, la fenêtre et le
chiffre sautent à la cible dès le départ. Stop, un nouveau geste et un nouvel
ordre repartent de là où le moteur EN EST, d'après la course, non de la cible
dessinée. Avec une durée nulle — le premier jet —, la course n'existait jamais :
« En fermeture » ne s'affichait pas, Stop ne s'allumait jamais et n'arrêtait
rien.

**Un seul magasin par volet**, partagé par la carte, la compacte, l'en-tête et
la fiche : ils dessinent la MÊME course. Dix images par seconde tant qu'une
course court, un seul réveil à la fin de la tenue, plus rien ensuite. Une course
dont l'heure de départ est dans le futur — l'horloge du poste a reculé — est
abandonnée : elle ne fige pas l'écran à dix images par seconde.

## Ce qu'on n'a pas fait

- **Apprendre la vraie durée de course** d'un volet (§ 13) : 20 s pour tous.
- **Deviner une course au chargement** : sans l'état d'avant, on ne joue rien.
- **Jouer un ordre périmé** : passé 180 s, la course serait finie.

## Ce que les tests tiennent

`tests/voletcourse.test.mjs` : les sources et leur ordre, l'arrivée, la tenue,
la confirmation, Stop, une position réelle pendant la course, la bascule et ce
qui n'en est pas une (`closed 100` puis `open 1`, `closed 1` puis `open 1`,
`closed 60` puis `open 60`, le chargement de la page), un ordre du serveur plus
récent, la cible d'un `opening` / `closing` (fraîche, dans son sens), le
mouvement réduit (la durée gardée, le dessin à la cible, Stop depuis la
position du moteur), l'horloge qui recule, le rythme des images ; et
`tests/carte_volet.test.mjs`, une course rendue sur la carte.
