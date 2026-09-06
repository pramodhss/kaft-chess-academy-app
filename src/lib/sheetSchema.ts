export interface SheetSchemaIssue {
  tabName: string;
  missingHeaders: string[];
  duplicateHeaders: string[];
}

export function validateSheetHeaders(
  tabName: string,
  actualHeaders: readonly unknown[],
  requiredHeaders: readonly string[],
): SheetSchemaIssue | null {
  const normalized = actualHeaders.map(header => String(header ?? '').trim().toLowerCase());
  const missingHeaders = requiredHeaders.filter(header => !normalized.includes(header.trim().toLowerCase()));
  const seen = new Set<string>();
  const duplicateHeaders = normalized.filter(header => {
    if (!header || !seen.has(header)) {
      if (header) seen.add(header);
      return false;
    }
    return true;
  });
  return missingHeaders.length || duplicateHeaders.length
    ? { tabName, missingHeaders, duplicateHeaders: [...new Set(duplicateHeaders)] }
    : null;
}

export function formatSchemaIssue(issue: SheetSchemaIssue): string {
  const problems: string[] = [];
  if (issue.missingHeaders.length) problems.push(`missing columns: ${issue.missingHeaders.join(', ')}`);
  if (issue.duplicateHeaders.length) problems.push(`duplicate columns: ${issue.duplicateHeaders.join(', ')}`);
  return `The "${issue.tabName}" tab has an invalid structure (${problems.join('; ')}).`;
}