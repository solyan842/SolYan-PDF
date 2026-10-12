import { describe, expect, it } from 'vitest';
import { TableCandidateDetector } from '../engines/table/candidates.js';

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

    const detector = new TableCandidateDetector();
    const candidates = detector.detect({
      semantic: {
        readingOrder,
        nodes,
      } as any,
      layout: null,
      raw: {
        pages: [{ index: 0, vectors: [] }],
      } as any,
      typography: {} as any,
    });

    expect(candidates).toHaveLength(1);
    expect(new Set(candidates[0]!.nodeIds)).toEqual(new Set(readingOrder));
    expect(candidates[0]!.nodeIds).toHaveLength(8);
  });
});
