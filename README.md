# Loggia Dashboard

Un tableau de bord Home Assistant qui se remplit tout seul.

Loggia lit les registres de votre installation — zones, appareils, entités — et
en déduit ce qu'il peut afficher. Aucun identifiant d'entité n'est écrit dans le
code : ce qui n'existe pas chez vous n'apparaît pas, et ce que vous ajoutez plus
tard apparaît sans rien toucher.

## Installation

### Par HACS

1. HACS → Intégrations → menu ⋮ → **Dépôts personnalisés**
2. Coller `https://github.com/Alardware/loggia`, catégorie **Integration**
3. Installer **Loggia Dashboard**, puis redémarrer Home Assistant
4. Paramètres → Appareils et services → **Ajouter une intégration** → Loggia

Loggia apparaît dans le menu latéral. Il n'y a rien à configurer : ni copie dans
`www/`, ni tableau de bord YAML, ni carte iframe.

### À la main

Copier `custom_components/loggia/` dans votre dossier `config/custom_components/`,
redémarrer, puis ajouter l'intégration depuis l'interface. Le mode historique
(`loggia:` dans `configuration.yaml`) reste accepté.

**Requiert Home Assistant 2024.7 ou plus récent.**

## Ce qui est trouvé tout seul

| Vue | Source |
|---|---|
| Pièces | zones Home Assistant contenant un équipement d'ambiance |
| Lumières | domaine `light`, regroupées par zone |
| Climat | domaine `climate`, avec le capteur de température de l'appareil ou de la zone |
| Volets | domaine `cover` |
| Aspirateur | domaine `vacuum` et les entités du même appareil (batterie, carte, surface, durée) |
| Médias | domaine `media_player` |
| Sécurité | `alarm_control_panel`, `camera` (flux dédoublonnés), `person` ; détecteurs pris parmi les `binary_sensor` de la même caméra |
| Énergie | **préférences du tableau de bord Énergie natif** — compteur, injection, production solaire, appareils suivis |
| Système | capteurs de charge processeur en `%`, puis mémoire, disque, température et disponibilité du même appareil |
| Scènes | domaines `scene` et `script` |

**Une vue sans rien à montrer disparaît du menu.** Elle réapparaît d'elle-même
le jour où l'appareil correspondant existe. Paramètres → Vues liste celles qui
sont masquées, avec le motif.

## Ce qui demande une configuration

Tout n'a pas d'équivalent standard dans Home Assistant. Ces éléments se
désignent dans **Paramètres → Entités** :

- les radiateurs **fil pilote** — un `switch` entouré d'aides (consigne, mode,
  automatique) qu'aucune convention ne permet de deviner ;
- le **planning des volets** (mode d'automatisme, jours) ;
- un **distributeur de croquettes** piloté par automations ;
- les capteurs d'énergie d'un package maison, si vous préférez les vôtres à ceux
  que le tableau de bord Énergie expose.

## Où sont vos réglages

Dans `.storage/loggia_dashboard_config`, **par utilisateur Home Assistant** :
chacun garde ses pièces, son thème et ses vues, sur tous ses appareils. C'est
l'intégration qui écrit ce fichier, via des commandes WebSocket authentifiées —
l'identité vient de la connexion, jamais du navigateur.

Sans l'intégration, le dashboard retombe sur le `localStorage` du navigateur :
les réglages restent, mais ne suivent plus d'un appareil à l'autre.

## Sécurité

- Les appels de service passent par `/api/loggia/call`, protégé par une
  **liste blanche fermée par défaut** : un domaine absent de la liste est
  refusé. `shell_command`, `python_script`, `hassio`, `recorder`, `backup` et
  `homeassistant.restart` n'y figurent pas.
- Le code **ne lit jamais** votre jeton d'accès Home Assistant et ne demande
  aucun identifiant.
- Le code PIN administrateur reste sur l'appareil : il n'est jamais envoyé au
  serveur (`FORBIDDEN_KEYS`, dans `store.py`, le refuse à l'écriture).
- Aucune ressource externe : ni CDN, ni police distante, ni télémétrie.

## Développement

```bash
npm install
npm test           # disponibilité des vues, sur installations synthétiques
npm run lint       # variables non définies, règles des hooks React
npm run build      # construit dans dist/

pip install pytest
python -m pytest tests/python -q   # stockage de la configuration
```

Les tests Python posent leurs propres doublures de Home Assistant : ils tournent
sans l'installer, et la suite ne se fige pas sur une version.

Le frontend est du React + Vite, compilé avec `base: './'` — le dossier
`custom_components/loggia/frontend/` est donc servable sous n'importe quel
préfixe d'URL.

## Licence

MIT — voir [LICENSE](LICENSE).
