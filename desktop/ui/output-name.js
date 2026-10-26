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
    const header = String(contentDisposition || '');
    const extended = header.match(/filename\\*\\s*=\\s*(?:UTF-8''|UTF-8'[^']*')?([^;]+)/i);
    const basic = header.match(/filename\\s*=\\s*"([^"]*)"|filename\\s*=\\s*([^;\\s]+)/i);
    let candidate = '';
    if (extended) {
      candidate = extended[1].trim().replace(/^"|"$/g, '');
      try { candidate = decodeURIComponent(candidate); } catch (_) {}
    } else if (basic) {
      candidate = (basic[1] || basic[2] || '').trim();
    }
    const leaf = candidate.split(/[\\\\/]/).pop() || '';
    const stem = leaf.replace(/\\.[^.]*$/, '').trim();
    if (!stem || /^(?:solyan(?:-converted)?|converted|output|document(?:-output)?)$/i.test(stem)) {
      return outputFilename(sourceName, suffix, extension);
    }
    return outputFilename(leaf, '', extension);
  }
  window.SOLYAN_OUTPUT_NAME = outputFilename;
  window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION = outputFilenameFromDisposition;
})();
