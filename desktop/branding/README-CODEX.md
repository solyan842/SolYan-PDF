# SolYan PDF — approved icon pack (Windows)

Source: `APPROVED-original-pair.png`, the exact pair approved in conversation. **Do not regenerate, redesign or substitute.**

Directories: `sReader_PDF/` and `sTool_PDF/`. Each contains app.ico and transparent PNGs in 16, 24, 32, 48, 64, 128, 256, 512 and 1024px.

The icon artwork is CROPPED FROM THE APPROVED RASTER IMAGE, not redrawn. A rounded-square clipping mask removes outside white page background; internal original pixels are preserved. These are raster-derived, **not native editable vector SVG**. For high-resolution production assets, request original vector source from designer if available.

## Codex integration instructions
- Keep existing application behavior unchanged.
- Reader: use sReader_PDF/app.ico + accompanying PNGs for EXE/taskbar/Desktop/installer; set Windows app identity and shortcuts correctly.
- Toolbox: use sTool_PDF/app.ico + accompanying PNGs consistently.
- Do not apply sTool logo to Reader or vice versa.
- Preserve independent app icons and distinguishable Windows AppUserModelID and shortcuts.
- If app packaging or launch UI is not yet split, stage the assets only and do not overwrite a working release.
- Verify visually at 16/24/32px and test dark/light taskbar. Small-size images are downsampled from approved raster and are NOT manually pixel-hinted.
- Batch integration into one commit/CI run after tests, following AGENTS.md.
