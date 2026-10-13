# Bookmark / Outline editor design

V1.2 target: browser-local PDF outline editing with no new runtime dependency.

- Engine: locked `pdf-lib` 1.17.1 low-level object model.
- Read: direct `/Dest` arrays and `/A` `/GoTo` destinations; unresolved/named destinations fall back to page 1 in the initial UI rather than crashing.
- Write: replace the document outline with a deterministic linked outline tree using Unicode titles and `/Fit` page destinations.
- Safety bounds: 1,000 bookmark nodes, depth 16, title length 512.
- Page numbers are clamped into the current document range.
- Empty bookmark list removes `/Outlines` from the catalog.
- Regression gate must round-trip Unicode, hierarchy, sibling links, page clamping, replacement and outline removal, and must pass `qpdf --check`.

This feature is informed by maintained open-source parity references (notably Stirling-PDF's bookmark/table-of-contents editor), while keeping SolYan PDF browser-local and dependency-neutral.
