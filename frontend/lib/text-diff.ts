export type DiffLine = {
  type: 'same' | 'added' | 'removed';
  text: string;
};

export function diffLines(left: string, right: string): DiffLine[] {
  const a = left.replace(/\r\n/g, '\n').split('\n');
  const b = right.replace(/\r\n/g, '\n').split('\n');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint32Array(cols));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const output: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      output.push({ type: 'same', text: a[i] });
      i += 1; j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      output.push({ type: 'removed', text: a[i] });
      i += 1;
    } else {
      output.push({ type: 'added', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) output.push({ type: 'removed', text: a[i++] });
  while (j < b.length) output.push({ type: 'added', text: b[j++] });
  return output;
}
