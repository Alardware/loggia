"""Constantes partagees."""

import json
from pathlib import Path

DOMAIN = "loggia"

# La version vit dans `manifest.json` : c'est ce fichier que HACS et hassfest
# lisent, et le seul qu'une release doit modifier. La recopier ici la ferait
# diverger au premier oubli.
try:
    with (Path(__file__).parent / "manifest.json").open(encoding="utf-8") as _f:
        VERSION = json.load(_f).get("version", "0.0.0")
except (OSError, ValueError):  # manifeste absent ou illisible : on n'empeche pas le demarrage
    VERSION = "0.0.0"
