import type { Result } from '../utils/result.js';

export const templateService = {
  /**
   * Compile a template string by replacing {{variable.path}} placeholders with values from data
   */
  compileTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
      const value = getNestedValue(data, path);
      return value !== undefined ? escapeHtml(String(value)) : match;
    });
  },

  /**
   * Validate a template string for syntax errors
   */
  validateTemplate(template: string): Result<boolean> {
    // Check for unclosed braces
    const openCount = (template.match(/\{\{/g) || []).length;
    const closeCount = (template.match(/\}\}/g) || []).length;

    if (openCount !== closeCount) {
      return {
        success: false,
        code: 'INVALID_TEMPLATE',
        error: 'Template has mismatched braces',
      };
    }

    // Check for empty variable names
    const emptyVarMatch = template.match(/\{\{\s*\}\}/);
    if (emptyVarMatch) {
      return {
        success: false,
        code: 'INVALID_TEMPLATE',
        error: 'Template has empty variable placeholder',
      };
    }

    return { success: true, value: true };
  },

  /**
   * Extract all variable names used in a template
   */
  extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g);
    const variables = new Set<string>();
    for (const match of matches) {
      variables.add(match[1]);
    }
    return Array.from(variables);
  },
};

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue({ a: { b: 1 } }, 'a.b') => 1
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
