# 0118 — Des mots entiers, et des prises polonaises

Date : 01/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Contribution de **Seba882** ([PR #14](https://github.com/Alardware/loggia/pull/14)).

## Comparer des mots, pas des morceaux de mots

`typeDePrise` cherchait ses indices par `indexOf`, sur le nom aplati. Un mot
court se cache alors dans un plus long, et la prise change de tête sans qu'on
comprenne pourquoi :

| le mot cherché | se cache dans |
|---|---|
| `box` | « boxe » |
| `tele` | « telephone » |
| `pc` | « pcb » |

Le contournement existait déjà, écrit à la main : ` lv `, ` ll `, ` sl ` étaient
entourés d'espaces dans la table. Trois cas traités, la règle jamais tirée.

**Décidé :** le nom est réduit à ses MOTS — on découpe sur tout ce qui n'est ni
lettre ni chiffre, et on borne la chaîne aux deux bouts. Les sigles n'ont plus
besoin qu'on les entoure de quoi que ce soit, et les mots composés continuent
de fonctionner : « lave vaisselle » se retrouve tel quel dans « prise lave
vaisselle cuisine », séparateurs normalisés des deux côtés.

## Le polonais, et un caractère qui ne se décompose pas

La table reconnaissait le français et l'anglais. Elle reconnaît maintenant le
polonais : `zmywarka`, `pralka`, `lodowka`, `telewizor`, `grzejnik`, `ekspres`…

Deux mots demandent la même prudence d'ordre que « sèche-linge » avant
« linge » : `suszarka` désigne aussi bien un sèche-linge qu'un sèche-cheveux et
passe donc **avant** `pralka`, et `ekspres` est le mot courant pour la machine
à café.

**Le piège, et il est réel :** le « l barré » polonais n'a **pas** de
décomposition NFD. Là où `ó` devient `o` après `normalize('NFD')`, `ł` reste
`ł` — et « chłodziarka » se serait coupée en deux au découpage en mots, puisque
`ł` n'est ni lettre ASCII ni chiffre. Il est donc remplacé explicitement, avant
l'abaissement de casse.

## Ce qui a été ajouté par le mainteneur

La branche ne portait que `src/` et ses tests : un contributeur extérieur n'a
aucune raison de lancer `npm run build` ni `scripts/pack_frontend.py`. Le
contrôle « Paquet embarqué = build du commit » tombait donc, sans que son code
soit en cause. Le paquet a été rebâti, et la version portée à 3.79.0 — la
3.78.0 venait d'être publiée.
