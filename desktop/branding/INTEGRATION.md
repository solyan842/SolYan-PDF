# Approved branding integration

Source ZIP SHA256: `ddb83157ba1c52d73fb1497be595919c493d41ca12e7e7b6cb1d57350cc600d2`.
All 22 original ZIP files compared byte-for-byte against this directory. SHA256.json pins each app PNG/ICO; artwork has not been regenerated or recolored.

Visual local review at 16/24/32 px on white/dark backgrounds retained the original pair and wrench distinction. These are downsampled raster assets, not editable vector or pixel-hinted replacements. ICO frames are 16/24/32/48/64/128/256 px. Native Windows taskbar/shortcut appearance and upgrade QA remain release checks, not conclusions from browser previews.

Tauri build.rs stages the approved app.ico unchanged by reader-only feature; bundle.icon and UI PNGs select the matching product. IDs remain vn.solyan.pdf.reader and vn.solyan.pdf; executable names remain solyan-pdf-reader / solyan-pdf-desktop. Standalone applications have separate profiles and shortcuts. See docs/WINDOWS-DESKTOP-READER-R2.md for scope and CI evidence.
