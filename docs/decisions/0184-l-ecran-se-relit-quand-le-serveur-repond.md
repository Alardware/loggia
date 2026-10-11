# 0184 — L'écran se relit quand le serveur répond

*11 octobre 2026 — accepté*

## Le problème

> « Si je modifie en interne une disposition ou bien les vues et que je bascule
> sur le lien externe, je n'ai pas la même chose. »

Même maison, même profil, même appareil parfois — mais deux adresses : l'accès
local et l'accès distant.

Et son raisonnement, qui est le bon :

> « HAOS est le serveur qui héberge Loggia, donc les données sont enregistrées
> dans HAOS normalement ? Du coup peu importe quel lien on utilise, je devrais
> avoir la même chose. »

**Elles y sont.** Le défaut n'était pas dans le rangement : il était dans la
lecture.

## La cause

Huit réglages se lisent **au montage** :

```
loggia_accueil      la grille de l'Accueil
loggia_active_user  le profil
loggia_agendas      loggia_histo        loggia_scnordre
loggia_camdispo     loggia_vuepieces
                    + le menu (readViewsCfg)
```

À cet instant, le composant n'a pas encore répondu. `cfgVal` retombe alors sur
le stockage du navigateur — et **ce stockage appartient à UNE origine**. Le lien
interne et le lien externe en sont deux : chacune gardait sa copie.

Quand la configuration commune arrivait, **rien ne les relisait**. Un `useState`
ne se réévalue pas parce qu'une donnée extérieure a changé.

## La correction

Un drapeau qui bascule **une seule fois**, du local vers le serveur, et une clé
sur la racine du rendu :

```jsx
const [servi, setServi] = useState(false);
useEffect(() => { if (serverOk) setServi(true); }, [serverOk]);
…
<div key={servi ? 'srv' : 'local'} …>
```

Une clé qui change remonte le sous-arbre : tous les `useState` se réévaluent,
cette fois depuis la configuration. Le remontage tombe dans la première seconde
du chargement, là où rien n'est encore à perdre.

**Une seule bascule, jamais le retour.** Une coupure réseau remettrait
`serverOk` à faux ; rejeter l'écran à ce moment-là serait pire que le mal.

## Ce que ça ne corrige pas, et c'est voulu

Les réglages déclarés **personnels** (`PERSONNELLES` / `PERSONAL_KEYS`) restent
rangés par compte côté serveur, et lus localement en repli. C'est leur rôle :
les marges d'un écran et ses panneaux repliés décrivent un appareil.

## Conséquences

- `tests/vues_suivent_le_compte.test.mjs` tient les trois bouts : le drapeau
  existe, il ne redescend pas, et la racine porte la clé.
- Voir l'ADR 0182, qui range les réglages par profil — sans cette relecture, le
  profil lui-même pouvait différer d'une adresse à l'autre au premier rendu.
