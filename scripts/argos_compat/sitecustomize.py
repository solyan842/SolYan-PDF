"""Runtime-only compatibility alias for PDFMathTranslate's Argos import typo.

The pinned upstream currently imports ``argotranslate.translate`` in
``ArgosTranslator.translate`` even though the installed package and the rest of
the same class use ``argostranslate``.  This module is loaded through Python's
standard ``sitecustomize`` hook by the external diagnostic/service process.
It does not modify or vendor PDFMathTranslate source code.
"""

from __future__ import annotations

import sys

try:
    import argostranslate
    import argostranslate.translate as _argos_translate
except ImportError:
    # Keep the hook inert for Python processes that do not have Argos installed.
    pass
else:
    sys.modules.setdefault("argotranslate", argostranslate)
    sys.modules.setdefault("argotranslate.translate", _argos_translate)
