# 0386 — La serrure bloquée, à code ou qui s'ouvre ; la voiture, la litière et la fontaine reconnues sans réglage

*21 novembre 2026 — appliqué (v3.100.0) (chantier du 20/11, lot 6 : A4, A11, A12)*

## Le problème

Le 20/11, une revue de Loggia a cherché ce qui manquait pour des maisons équipées autrement que la sienne. Le 21/11, trois points
ont été retenus pour les maisons qui ont ces appareils :

- **A4, la serrure.** Une serrure coincée (`jammed`) ne se disait que sur sa carte. « Je pars » verrouille, mais ni une serrure
  bloquée, ni une serrure à code (Home Assistant refuse `lock.lock` sans le code : `add_default_code` lève une erreur de
  validation), ni aucune serrure quand le scénario a été modifié. Le code d'une serrure n'était demandé nulle part : la carte
  envoyait l'ordre, Home Assistant le refusait, la porte ne bougeait pas. Et « Ouvrir » (tirer le pêne, `lock.open`, le bit 1
  de `supported_features`), connu de la couche d'actions, n'était offert par aucun écran.
- **A11, la voiture connectée.** Rien dans Loggia : ni carte, ni fiche, ni alerte. La voiture n'existait que dans le schéma
  d'énergie.
- **A12, la litière et la fontaine.** Le distributeur de croquettes avait sa famille ; la litière et la fontaine non. Une
  litière Litter-Robot publie même un `vacuum` : elle passait pour un robot aspirateur dans « En ce moment ».

## La décision

**A4, la serrure.**
- Un point « Serrure bloquée », ambre, vers Sécurité (règle 12 de `pointsAttention`). Ni une entité masquée, ni un groupe.
- « Avant de partir » et « Avant de dormir » disent la serrure qui restera ouverte : déverrouillée quand le scénario ne
  verrouille pas toute la maison sans condition d'heure (`verrouillePar`), à code (le scénario n'a pas le code), ou bloquée.
  Une ligne « Verrouiller » ; à code, le pavé de l'alarme prend la ligne (`SaisieCodeAlarme`) ; bloquée, le mot seul.
- La fiche serrure se charge à la demande (`ficheserrure.jsx`). À code, elle demande le code AVANT d'envoyer l'ordre, avec le
  même pavé ; le code n'est jamais gardé. « Ouvrir » n'existe que si la serrure le déclare, en deux appuis (`BoutonConfirme`,
  « Confirmer ? » 4 s), puis le code s'il en faut un. Bloquée, la fiche le dit.
- La carte d'une serrure à code ouvre sa fiche au lieu d'envoyer un ordre voué au refus.
- Écarté : le code enregistré dans la configuration (en clair) ; « qui a déverrouillé » (`changed_by`) et le décompte de
  reverrouillage, non retenus ce lot ; l'alerte « Serrure bloquée » au téléphone (elle demanderait le serveur).

**A11 et A12, les appareils composés.**
- La découverte (`composes.js`) reconnaît trois genres d'APPAREIL, chacun avec sa carte et sa popup (`obj:app:<appareil>`),
  sous IoT dans Objets, posables comme les autres :
  - **la voiture, par FAMILLE**, comme la borne : un appareil qui porte une distance — une autonomie (une mesure, pas un
    cumul) ou une clé de voiture — et un indice fort : sa position, un verrou, une prise ou une charge, une batterie de
    traction ou un carburant nommés par leur clé. Ni un robot (une tondeuse a un compteur et une position), ni un téléphone
    (son podomètre), ni une station météo (la distance de la foudre). Les clés de traduction, lues dans le code de Tesla Fleet,
    Teslemetry, Tessie, Renault, Volvo, Škoda, Subaru, Kia et Hyundai, Mercedes, ne servent qu'à TRIER les rôles : la
    batterie de traction contre celle de 12 V, le compteur contre l'autonomie, le verrou des portes contre la trappe de charge ;
  - **la litière et la fontaine**, par plateforme et clé de traduction (Litter-Robot du cœur de Home Assistant, les deux
    intégrations PetKit, Petlibro) : bac plein, sable, état, passages du jour ; eau, filtre, pompe, « filtre remplacé ».
- La carte de la voiture : batterie ou carburant, autonomie, « En charge », « Branchée », « Verrouillée », « Ouverte ». Sa
  fiche : les rangées que la voiture publie, et « Verrouiller » quand elle est déverrouillée — jamais « Déverrouiller », ni
  klaxon, ni climatisation, ni charge.
- La carte de la litière : les passages du jour, l'état en mots ; celle de la fontaine : le filtre, l'eau, la pompe. La fiche
  de la fontaine offre la pompe et « Filtre remplacé » en deux appuis ; celle de la litière, aucune commande.
- Des points d'attention, rares et actionnables : « Voiture ouverte la nuit », « Voiture déverrouillée la nuit » (la nuit
  seulement : le jour, on la charge, on la vide), « Pneu sous-gonflé » (quand le binaire de la voiture le dit, jamais sous une
  pression choisie par Loggia) ; « Bac de la litière plein », « Fontaine à remplir » (des alertes) ; « Litière à remettre »,
  « Filtre de la fontaine à changer » (des infos, au binaire ou à 0 %, jamais à un seuil deviné). `attention.js` les reçoit
  faits (`autres`) et garde `i18n.js` pour seul import.
- Les entités d'un appareil composé ne sont pas la maison (`appareilCompose`) : ni la portière d'une voiture parmi les portes
  (rangée sûreté, « Avant de partir », « Ouvert, alarme armée », groupes, ouvrants), ni l'alerte d'une litière en « Défaut
  signalé », ni une litière en robot dans « En ce moment ».
- Écarté : le carnet de trajets, la photo et le logo de la voiture, la plaque dessinée, les boutons de la voiture ; Catlink et
  PetSafe, sans clé de traduction ; Nissan Leaf, dont l'autonomie n'a pas de classe ; les alertes au téléphone (serveur).

**Le démarrage.** Le lot y coûte 589 octets. La découverte (7 Ko) ne s'y trouve pas : un relais (`composesboot.js`) la charge
à la demande, et seulement dans une maison qui a une distance ou une plateforme d'animaux dans son index ; ailleurs, rien ne
se télécharge. Les coquilles des cartes, les cartes, les popups et la fiche serrure se chargent à la demande, elles aussi. La
feuille « Avant de partir » aussi (`departfeuille.jsx`), qui ne s'ouvre que sur un geste : sa coquille et la règle partagée
restent dans `app/depart.jsx`.

## Les conséquences

- Écran seul : aucun fichier Python, pas de redémarrage de Home Assistant.
- Chez l'utilisateur, ni serrure à code, ni voiture, ni litière : rien ne change. La démo porte les cas : un portillon à code
  qui sait s'ouvrir et accroche une fois sur deux en se verrouillant, une voiture aux clés de Tesla Fleet, une litière et une
  fontaine aux clés de PetKit.
- Avant l'arrivée de la découverte (le premier relevé), une voiture et ses portières se lisent comme avant ; puis elles ont
  leur carte.
- Tests : `tests/chantier_2011_lot6.test.mjs`, `tests/chantier_2011_lot6_voiture.test.mjs`,
  `tests/chantier_2011_lot6_animaux.test.mjs`. Assertions modifiées : `avant_depart`, `objets`, `lot16_fiches_panne`.
- Restent hors champ : la « Pile faible » qu'enverrait la veille des piles du serveur pour la batterie d'une voiture (l'écran
  l'écarte déjà, `rechargeable`, mais le serveur juge à part) ; le défaut « laser sale » d'une Litter-Robot, qui ne se dit
  plus qu'à la fiche universelle de l'appareil.
