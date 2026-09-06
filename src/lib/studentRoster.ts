export function uniqueStudentNames(rows: string[][], activeOnly = false): string[] {
  const names = new Map<string, string>();
  rows.slice(1).forEach(row => {
    const name = row[0]?.trim() ?? '';
    const status = (row[8] ?? 'Active').trim().toLowerCase();
    if (!name || (activeOnly && status !== '' && status !== 'active')) return;
    const key = name.toLocaleLowerCase();
    if (!names.has(key)) names.set(key, name);
  });
  return [...names.values()];
}