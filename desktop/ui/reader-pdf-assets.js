// PDF.js worker fetches decoders relative to its own module unless given an
// absolute URL. Resolve packaged assets beside Reader, never beside the worker.
export const pdfAssetOptions=Object.freeze({
  cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,
  cMapPacked:true,
  standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,
  wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,
});
