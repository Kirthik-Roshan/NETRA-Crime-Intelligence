/** Sort raw records without changing values or rounding large Catalyst IDs. */
export function orderDatabaseRows(rows: Record<string, unknown>[], column: string, direction: 'asc' | 'desc') {
  const compare = (a: unknown, b: unknown) => {
    const left = String(a ?? '').trim(), right = String(b ?? '').trim();
    if (/^-?\d+$/.test(left) && /^-?\d+$/.test(right)) {
      const x = BigInt(left), y = BigInt(right);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
  };
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const x = a.row[column], y = b.row[column];
    const missingX = x == null || String(x).trim() === '', missingY = y == null || String(y).trim() === '';
    if (missingX !== missingY) return missingX ? 1 : -1;
    return compare(x, y) * (direction === 'asc' ? 1 : -1) || a.index - b.index;
  }).map(item => item.row);
}
