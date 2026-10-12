import { describe, expect, it } from 'vitest';
import { TableCandidateDetector } from '../engines/table/candidates.js';
import { esc, runText } from '../engines/exporter/docx/ooxml/xml.js';

function detect(nodes: Record<string, any>, readingOrder: string[], vectors: any[] = []) {
  const detector = new TableCandidateDetector();
  return detector.detect({
    semantic: {
      readingOrder,
      nodes,
    } as any,
    layout: null,
    raw: {
      pages: [{ index: 0, vectors }],
    } as any,
    typography: {} as any,
  });
}

describe('SolYan regression — table candidate clustering', () => {
  it('does not split a lattice when one earlier cell extends below the last short cell', () => {
    const nodes: Record<string, any> = {};
    const readingOrder: string[] = [];

    const add = (id: string, x: number, y: number, width: number, height: number) => {
      nodes[id] = {
        id,
        type: 'paragraph',
        pageIndex: 0,
        bbox: { x, y, width, height },
        text: id,
      };
      readingOrder.push(id);
    };

    // Four cells in the upper logical row. The first cell is tall and reaches
    // down to y=400; the remaining cells are short and end at y=500.
    // The next row starts at y=420 and ends at y=440.
    //
    // Old logic used the last short cell's bottom (500), yielding 500-440=60
    // and falsely splitting the lattice. The true group bottom is 400, so the
    // rows overlap vertically and must remain one candidate.
    add('top-tall', 40, 400, 60, 160);
    add('top-b', 140, 500, 60, 20);
    add('top-c', 240, 500, 60, 20);
    add('top-d', 340, 500, 60, 20);

    add('bottom-a', 40, 420, 60, 20);
    add('bottom-b', 140, 420, 60, 20);
    add('bottom-c', 240, 420, 60, 20);
    add('bottom-d', 340, 420, 60, 20);

    const candidates = detect(nodes, readingOrder);

    expect(candidates).toHaveLength(1);
    expect(new Set(candidates[0]!.nodeIds)).toEqual(new Set(readingOrder));
    expect(candidates[0]!.nodeIds).toHaveLength(8);
  });

  it('rejects sparse borderless invoice headings that only imitate a lattice', () => {
    const nodes: Record<string, any> = {};
    const readingOrder: string[] = [];

    const add = (id: string, text: string, x: number, y: number, width: number, height: number) => {
      nodes[id] = {
        id,
        type: 'paragraph',
        pageIndex: 0,
        bbox: { x, y, width, height },
        text,
      };
      readingOrder.push(id);
    };

    // This reproduces the shape isolated by the xlsx-invoice diagnostics:
    // title/subtitle metadata above a left/right invoice heading pair. It has
    // >=4 text nodes and >=2 snapped rows/columns, but only one row has multiple
    // aligned nodes, so it is not a real two-dimensional table lattice.
    add('case-title', 'Invoice table', 48, 760, 110, 20);
    add('case-subtitle', 'Synthetic controlled corpus', 48, 738, 190, 10);
    add('invoice-title', 'INVOICE', 48, 680, 120, 30);
    add('invoice-ref', 'INV-2026-1012', 430, 690, 110, 10);

    const candidates = detect(nodes, readingOrder);

    expect(candidates).toHaveLength(0);
  });
});

describe('SolYan regression — DOCX XML 1.0 escaping', () => {
  it('drops XML 1.0-forbidden controls while preserving valid whitespace and Unicode', () => {
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
