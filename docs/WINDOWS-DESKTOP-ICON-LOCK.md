# SolYan PDF Windows — PHOSPHOR DUOTONE SVG ICON LOCK

Status: **LOCKED / WINDOWS DESKTOP ONLY**.
Branch: `feat/windows-desktop-phosphor-icons`.
Base release gate: Windows Desktop CI #131 PASS on `c986b69`.

## Permanent icon selection

**Phosphor Icons — Duotone, SVG, MIT License** is the agreed Windows
tool-catalog and sidebar icon system. Do not switch to Lucide, emoji, a
remote icon CDN, colored PNG packs, icon-font downloads, or bespoke glyphs
without a new product decision.

- Upstream: https://github.com/phosphor-icons/core
- Exact upstream commit: `2b75f3ad12b420c9504ef05df8d2564a28f8500e`
- Source: `assets/duotone/*-duotone.svg`
- Vendor: `desktop/ui/icons/phosphor-duotone/`
- Provenance and original Git blob SHA1 hashes:
  `desktop/ui/icons/phosphor-duotone/SOURCE.json`
- Unmodified MIT license:
  `desktop/ui/icons/phosphor-duotone/LICENSE`
- Windows mapping: `desktop/ui/icons.js`
- Regression: `desktop/ui/tests/icon-contract.test.cjs`
- 86 vendored SVGs for 96 catalog tool IDs and the sidebar/search system.

## Visual contract

- Use Phosphor **duotone** layers rather than mixing emoji, fonts and SVG.
- **Tool card:** 25px white duotone pictogram centered in its existing
  42px restrained colored tile (blue, green, red, purple, etc.). Preserve
  the calm Windows 11 Fluent language and dark/light theme.
- **Navigation:** 20px icon, monochrome with theme-appropriate contrast.
- **Mini lists:** 15px SVG in 24px colored squares.
- **Text:** bold tool name and regular description MUST occupy separate
  rows; descriptions can wrap cleanly and never collide with action arrow.
- Do not require internet access to render *any* icon.
- Avoid executing or injecting upstream SVG markup dynamically; render
  only local static SVG images through `<img>` with empty alt
  (surrounding card/button already provides its accessible name).
- Preserve existing route click behavior and security CSP.
- Catalog tools not mapped to a desktop route are visibly marked
  `Chưa khả dụng` rather than represented as working. The marker does
  not mean the web product lacks that underlying engine.

## Verify

Windows CI validates:
1. every catalog tool and category ID has a mapping;
2. all 86 SVGs exactly match pinned upstream Git blob SHA1;
3. MIT license is present and all icons have a safe static SVG shape;
4. title and description are separate rows;
5. no remote icon CDN and no remaining emoji used for tool icons;
6. existing D6 installer, signed PDF and PDF/A gates are unchanged.

The full Windows UI still needs end-user visual acceptance.
No changes to `main` and no release until exact-head CI passes.
