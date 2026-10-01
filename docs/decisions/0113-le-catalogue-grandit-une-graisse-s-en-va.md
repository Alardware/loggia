# 0113 — Le catalogue grandit, une graisse s'en va

Date : 30/09/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

## Le catalogue passe à 212 dessins

Un nouveau catalogue a été fourni. Trois dessins disparaissent
(`smart-speaker`, `voice-assistant`, `smart-display`), quarante et un arrivent,
dont une famille entière : **Streaming**, trente-deux services.

**Une erreur à retenir.** Le script d'extraction lisait encore l'ANCIEN
catalogue. Le chemin se construit par concaténation (`BAC + 'handoff/…'`), et la
substitution censée le repointer ne correspondait à rien — sans message, sans
échec. Tous les comptes annoncés comme « nouveaux » venaient de l'ancien
fichier. Un script qui ne trouve rien doit le DIRE ; celui-ci se taisait.

## Les tuiles de streaming : le trait qui rapetissait tout

« Apple TV est trop petit par rapport aux autres », quatre fois. Mesuré dans le
navigateur plutôt que raisonné :

| dessin | largeur | hauteur |
|---|---|---|
| `apple-tv` | 21,3 | **8,1** |
| `arte-tv` | 21,0 | 5,1 |
| `washer` (référence) | 16,0 | **19,5** |

La fonction du catalogue rend la marque **plus un trait animé dessous**. Ce
trait occupe le bas du repère, et la marque se retrouve ajustée dans 20 × 16 au
lieu de 24 × 24, poussée vers le haut.

Deuxième cause, sous la première : ces logos sont des **mots**, larges et plats
— Apple TV+ mesure 23,6 sur 9,1, soit un rapport de 2,6. Les ajuster dans un
CARRÉ, c'est les brider sur leur largeur avant qu'ils aient la moindre présence.

**Décidé :** le trait part, et le cadre devient **plus large que haut** (28 × 22,5
avant l'agrandissement commun, soit 33 × 26,6 à l'écran pour un repère de 24).
Une icône a ses voisines à gauche et à droite, son texte dessous : elle peut
mordre sur les côtés, jamais vers le bas. Un logo carré reste borné par la
hauteur et ne bouge pas.

**Ce qui a été refusé en chemin :** leur donner un fond coloré aux couleurs de
la marque. C'était efficace, et ce n'était pas la demande — « je t'ai demandé de
retirer les traits et d'agrandir l'icône, pas de la changer ». Revenu en entier.

## Une seule graisse

« Retire solid, juste regular. » La police pleine coûtait 147 Ko de feuille et
188 Ko de police pour une variante de glyphe. Elle avait déjà été retirée le
23/09, était revenue le 29/09 pour le style « Plein », et repart.

Puis le sélecteur **Trait / Plein** lui-même : « tu as laissé le bouton,
enlève-le ». Avec lui partent `src/plein.js`, `iconePleine`,
`declarerStyleIcone`, le paramètre `plein` d'`Ico` et de `ChoixIcone`, et trois
clés dans sept langues.

Les icônes déjà enregistrées au format objet `{ n, s }` restent **lisibles** :
on n'écrit plus que la chaîne, mais on continue de relire l'objet. Aucune icône
choisie n'est perdue.
