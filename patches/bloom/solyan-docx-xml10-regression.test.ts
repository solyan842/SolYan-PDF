import { describe, expect, it } from 'vitest';

import { esc, runText } from '../engines/exporter/docx/ooxml/xml.js';

describe('SolYan DOCX XML 1.0 escaping regression', () => {
  it('drops XML 1.0-forbidden control characters while preserving valid text', () => {
    const input = 'A\u0000B\u0008C\u000bD\u000cE\u000eF\u001fG\tH\nI\rJ😀&<>"';

    expect(esc(input)).toBe('ABCDEFG\tH\nI\rJ😀&amp;&lt;&gt;&quot;');
  });

  it('drops isolated surrogates and forbidden BMP noncharacters without harming astral Unicode', () => {
    expect(esc('x\ud800y\udc00z\ufffe\uffff😀')).toBe('xyz😀');
  });

  it('prevents forbidden controls from entering generated Word text runs', () => {
    const xml = runText('before\u000cafter\u000eend');

    expect(xml).toContain('<w:t>beforeafterend</w:t>');
    expect(xml).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  });
});
