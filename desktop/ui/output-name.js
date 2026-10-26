(() => {
  function outputFilename(sourceName, suffix = '', extension = '.pdf') {
    const leaf = String(sourceName || '').split(/[\\/]/).pop() || 'document.pdf';
    const base = leaf.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '') || 'document';
    const safeSuffix = String(suffix || '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
    let safeExtension = String(extension || '.pdf').replace(/[^.a-z0-9]/gi, '');
    if (!safeExtension) safeExtension = '.pdf';
    if (!safeExtension.startsWith('.')) safeExtension = '.' + safeExtension;
    return base + (safeSuffix ? '-' + safeSuffix : '') + safeExtension;
  }
  window.SOLYAN_OUTPUT_NAME = outputFilename;
})();
