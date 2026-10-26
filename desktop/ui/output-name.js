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
  function outputFilenameFromDisposition(contentDisposition, sourceName, suffix = '', extension = '.pdf') {
    const parts = String(contentDisposition || '').split(';').map(part => part.trim());
    const extended = parts.find(part => part.toLowerCase().startsWith('filename*='));
    const basic = parts.find(part => part.toLowerCase().startsWith('filename='));
    let candidate = '';
    if (extended) {
      candidate = extended.slice(10).trim();
      const languageEnd = candidate.indexOf("''");
      if (languageEnd >= 0) candidate = candidate.slice(languageEnd + 2);
      if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) candidate = candidate.slice(1, -1);
      try { candidate = decodeURIComponent(candidate); } catch (_) {}
    } else if (basic) {
      candidate = basic.slice(9).trim();
      if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) candidate = candidate.slice(1, -1);
    }
    const leaf = candidate.replaceAll(String.fromCharCode(92), '/').split('/').pop() || '';
    const dot = leaf.lastIndexOf('.');
    const stem = (dot > 0 ? leaf.slice(0, dot) : leaf).trim();
    if (!stem || /^(?:solyan(?:-[a-z0-9_-]+)?|converted|output|document(?:-output)?)$/i.test(stem)) {
      return outputFilename(sourceName, suffix, extension);
    }
    return outputFilename(leaf, '', extension);
  }
  window.SOLYAN_OUTPUT_NAME = outputFilename;
  window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION = outputFilenameFromDisposition;
})();
