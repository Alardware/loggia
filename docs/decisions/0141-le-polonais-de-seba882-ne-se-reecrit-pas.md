# 0141 — Le polonais de Seba882 ne se réécrit pas

Date : 03/10/2026. Statut : appliqué. Pas de redémarrage de Home Assistant.

La traduction polonaise de Loggia est l'œuvre d'un Polonais, le contributeur
GitHub **Seba882**. Sa PR #3 (22/09) a été reprise telle quelle, complétée et
relue, dans c153b83 (ADR 0071) : « ses 2 371 clés reprises telles quelles ».
L'utilisateur, le 03/10 : « c'est un vrai polonais qui a fait la traduction,
je ne veux pas modifier cette partie ».

**Ce qui l'a déclenché.** Pour la barre du bas (ADR 0140), le polonais avait
reçu des libellés courts écrits par un non-natif : « Ochrona » pour
« Bezpieczeństwo », « Sprzęt » pour « Urządzenia ». Ils sont retirés. Le
polonais garde ses mots entiers, et c'est la mise en page qui s'adapte.

**Le contrôle.** La PR #3 a été close sans fusion, et sa branche réécrite le
30/09 : son commit d'origine n'existe plus nulle part. La référence est donc
`pl.js` tel qu'il est entré dans c153b83. Comparé clé par clé à `main` et à cet
arbre :
- **Cet arbre** ne réécrit aucune de ses valeurs. Une seule phrase change,
  parce que sa source française a changé (le vent, ADR 0137) : sa seconde
  moitié est reprise mot pour mot, « opuszczona roleta w porywie wiatru to
  roleta pogięta ».
- **`main`** n'a réécrit aucune de ses valeurs sous la même clé. En revanche,
  24 de ses phrases ont été retraduites depuis le 23/09, quand leur français a
  changé. La plupart gardent ses mots (seul le repère d'unité change, °C
  devenu °{u}), mais **deux s'en écartaient sans nécessité**. Elles sont
  restaurées avec l'accord de l'utilisateur :
  - « Wymagany do przełączenia na profil administratora i sprawdzany przez
    komponent. Haszowany, nigdy nie pokazywany — … » : sa phrase, plus le seul
    ajout du nouveau français ;
  - « +{n} autres » : ses trois formes de pluriel `{ few: '+{n} inne', many:
    '+{n} innych', other: '+{n} innych' }`, remplacées par « +{n} więcej » alors
    que le français n'avait perdu qu'une espace.
- **Les textes NOUVEAUX** (lots 1 à 7 de l'audit, badge de la démo, messages
  d'erreur du serveur dans `translations/pl.json`), écrits par un non-natif,
  ont été relus contre son vocabulaire par deux relecteurs indépendants.
  Treize sont corrigés pour reprendre ses mots :
  - « Loggii » au génitif ;
  - « w Home Assistancie » ;
  - « przeładuj stronę » ;
  - « kopia zapasowa » ;
  - « Konfiguracja domu pozostaje bez zmian » ;
  - « fikcyjne dane ».

  Il y avait aussi une vraie faute de sens : « Otwory » veut dire « trous ».
  Ces textes restent à faire relire par Seba882.

**Décidé.** Une valeur polonaise de Seba882 ne se retouche plus sans son
accord. `tests/polonais_seba882.test.mjs` fige l'empreinte (SHA-256 tronqué,
pas le texte) de chacune de ses 2 203 valeurs encore en usage, dans
`tests/polonais_seba882.json`. Une valeur retouchée fait échouer le test en
nommant la clé ; contre-test fait, « DOM » changé en « DOMEK » est attrapé.
Une clé qui disparaît reste permise, parce que son français a changé ; la
nouvelle traduction reprend alors ses mots là où le sens n'a pas bougé. Les
formes courtes « · court » sont facultatives : le test de parité des
catalogues les exempte.
