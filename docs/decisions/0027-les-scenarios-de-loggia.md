# 0027 — Les scénarios : composés par Loggia, lancés par le serveur

Date : 16/09/2026 (v3.28.0). Statut : acceptée.

## Contexte

Les « scènes rapides » de l'Accueil n'avaient pas d'éditeur : sans choix
explicite, la rangée montrait les six premières entités `scene.*` de Home
Assistant — jamais un script, jamais rien que Loggia aurait composé. Or les
gestes d'une maison sont les mêmes partout, et tous les écosystèmes grand
public les livrent d'avance : bonne nuit, je pars, je rentre, réveil, cinéma,
musique, invités, tout éteindre. Demande de l'utilisateur : « Loggia devrait
proposer les siens, avec la possibilité d'ajouter les siens ; on pourrait
revoir les cartes également ». Trois options présentées (front seul, serveur,
serveur + entités `button`) ; l'utilisateur a choisi le serveur.

## Décision

- **Huit scénarios intégrés**, composés d'après ce que la maison possède, par
  familles et portées — « toutes les lumières », « les volets du séjour »,
  « les pièces de vie » —, avec une condition de moment (nuit / jour) et
  l'épargne des veilleuses du module nuit. Ils se modifient, se masquent, se
  remettent d'origine ; les siens s'ajoutent depuis la même fiche.
- **Résolus au lancement**, jamais figés : les cibles se calculent contre les
  registres et les états au moment où l'on appuie, et seulement sur ce qui a
  quelque chose à faire. Le journal dit alors le vrai.
- **Composé, ou lié** : un scénario lié lance une scène ou un script de Home
  Assistant, et rien d'autre. Les anciennes scènes rapides sont reprises une
  fois : celle qui ressemble à un scénario de Loggia lui donne son lien
  (mots-clés ; « home » seul n'est le mot de personne), les autres deviennent
  des scénarios personnels liés.
- **Un scénario est une main, pas une règle.** Il part par `hass.services`
  avec le contexte de la personne qui l'a lancé : les règles y voient une
  main (ADR 0002) et gèlent derrière lui ; aucun gel ne le retient. Il ne
  passe donc pas par `Regles.agir()`, mais se note lui-même au journal.
- **Jamais de désarmement ni de déverrouillage** : aucun geste ne le permet,
  ni par défaut ni sur demande — le même principe que le module présence.
- **Un service, `loggia.scenario`** : automatisations, assistant vocal,
  interrupteurs sans fil lancent un scénario comme la carte le fait.
- **Les cartes suivent le gabarit** : icône en disque teinté en haut à
  gauche, dernier lancement en haut à droite, titre sous l'icône ; compacte
  sur l'Accueil, standard dans la vue avec le résumé et des puces à l'arrondi
  9 ; la teinte s'applique en entier, sans bordure. La vue « Scènes » devient
  « Scénarios » ; la bibliothèque Hue reste dessous, en « Ambiances
  lumineuses ».

## Conséquences

L'identifiant de vue `scenes` ne change pas : agencements et droits
enregistrés restent valides. La vue existe dès qu'il y a de quoi composer,
plus seulement quand Home Assistant a une scène. Non fait : les entités
`button.*` par scénario (widgets de l'application compagnon), les zones fil
pilote pilotées par `switch` dans la famille chauffage, la portée « ces
entités précises » — la fiche parle en familles et en pièces.
