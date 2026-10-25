# 0195 — Le coût d'une prise se compte heure par heure

*13 octobre 2026 — accepté, à l'essai (chantier Prises, plan 2, rien de publié). Applique l'ADR 0173 heure par heure.*

## Le problème

La fiche d'une prise dit ce qu'elle a coûté aujourd'hui et ce mois-ci, et ce
qu'a coûté un cycle. Un seul prix ne suffit pas chez qui a des heures creuses :
un lave-vaisselle lancé la nuit ne coûte pas ce qu'il coûte l'après-midi (P7).

## La décision

**Les kWh de chaque heure se paient au prix du tarif qui tournait cette
heure-là** — celui dont le compteur a avancé : la règle de l'ADR 0173, heure
par heure (`prixParHeure`, `coutHoraire`, `src/tarif.js`). Un seul tarif : son
prix. Deux qui ont bougé dans la même heure : au prorata de ce qu'ils ont
compté. Aucun n'a bougé : le prix de l'heure d'avant, avant la première celui de
la suivante ; de toute la période, aucun : pas d'euros. Aucun prix déclaré : pas
d'euros — jamais un chiffre inventé.

**Les tarifs** sont ceux de la maison : les deux prix que nomme la fiche
Énergie de Loggia avec ses deux compteurs, sinon ceux que déclare le tableau de
bord Énergie de Home Assistant, sinon le seul prix nommé.

**Les lectures** (P8) :

- **Le jour.** UNE lecture des mesures du jour pour toutes les prises de
  l'écran — les moyennes de puissance sur 5 minutes, et ce que le compteur a
  compté —, groupée quand plusieurs cartes se montent ensemble, relue toutes les
  5 minutes. Elle donne la courbe de la carte et de la fiche, dont le dernier
  point est la puissance du moment quand la prise est allumée, et les kWh
  d'« Aujourd'hui » : ceux du compteur s'il porte une somme (un `change`
  numérique), sinon la courbe intégrée ; une prise sans compteur d'énergie le
  dit « estimés d'après la puissance ». Une lecture dont le début n'est pas le
  minuit d'aujourd'hui — minuit est passé, la relecture n'est pas encore
  revenue — ne dit rien d'aujourd'hui : « — », pas le chiffre de la veille.
- **Le mois**, fiche ouverte seulement. Les statistiques à l'heure, du 1er à 0 h
  à maintenant, relues toutes les 5 minutes : le compteur de la prise ET sa
  puissance, et les compteurs des tarifs. Les kWh d'une heure sont ceux du
  compteur s'il porte une somme, sinon la puissance moyenne de l'heure — la
  règle du jour. Le mois est celui des heures FINIES avant minuit, plus le jour.
  Une lecture horaire qui échoue — pas d'enregistreur, pas de droit, une
  coupure — dit « — », sans euros : un échec n'est pas une lecture vide, et le
  mois ne se déduit pas du jour.
- **Le même chiffre** sur la carte et sur la fiche pour le jour. Pour le payer,
  la fiche le répartit : les heures finies que disent les statistiques à
  l'heure, plus ce qui manque à l'heure en cours.

**Un cycle se paie par l'ÉNERGIE de chaque heure qu'il traverse.** Ses kWh sont
ceux que dit le serveur (ADR 0194). La forme vient de la courbe du jour : les
moyennes sur 5 minutes, rognées aux bornes du cycle, donnent la part de chaque
heure, et leur somme est mise à l'échelle des kWh du cycle. À énergie égale,
l'euro du cycle égale donc celui de la tuile « Aujourd'hui » : quand le cycle
est toute la consommation du jour, les deux sont le même chiffre — dans la démo,
à 15:10, « Cycle de 12:16 à 14:50 · 1,08 kWh · 0,21 € » et, sur la tuile,
« 1,08 kWh » et « 0,21 € » (sa maquette dit « 0,27 € » pour un cycle de 13:40 à
16:14). Quand les points ne disent pas le cycle — ils n'en couvrent pas 90 % :
un cycle commencé avant minuit, qui n'a plus, aujourd'hui, que sa fin ; une
prise sans statistiques ; un trou —, les kWh se répartissent au prorata du temps
passé dans chaque heure.

**La devise** est celle de la maison (`hass.config.currency`, l'euro à défaut),
écrite par `Intl` : « 0,21 € ». **Le compteur total** de la prise, en kWh, se
lit en petit sous les tuiles, avec le tarif.

## Ce que cela coûte

Le mois se compte sur les heures FINIES avant minuit plus le jour : une prise
sans aucune statistique (ni compteur ni puissance : un capteur sans
`state_class`) n'a ni courbe — « Pas de courbe pour cette prise » — ni mois.
Quand son compteur n'a pas de statistiques de somme, le mois se tire de la
puissance moyenne de chaque heure.

Un cycle passé minuit se paie au prorata du temps : son euro n'égale pas celui
de la tuile, qui ne compte que l'après-minuit (à 00:30, « Cycle de 21:36 à
00:10 · 1,08 kWh · 0,23 € » et, sur la tuile, « 0,00 € »). Quand il s'applique,
le prorata du temps ne voit pas la puissance de chaque minute : un cycle à
cheval sur deux tarifs se paie comme s'il avait tourné à puissance constante.

## Ce que les tests tiennent

`tests/prix_heures.test.mjs` (un tarif, deux tarifs, aucun),
`tests/prisesetat.test.mjs` (la lecture des mesures, partagée ; le compteur sans
somme ; la lecture de la veille après minuit),
`tests/prisesfiche.test.mjs` (les heures, le coût d'un cycle — par l'énergie,
puis par le temps —, les tarifs, la devise, la ligne sous les tuiles, le
compteur qui ne fait foi qu'avec une somme), `tests/fiche_prise.test.mjs`,
`tests/fiche_prise_gestes.test.mjs` (le mois qui dit « — » quand la lecture
échoue, la puissance demandée avec le compteur, l'euro du cycle égal à celui de
la tuile sur la démo).
