export type BrandMode = 'light' | 'dark';

export interface ImageFileRules {
  types: readonly string[];
  maxBytes: number;
  typeError: string;
  sizeError: string;
}

export function validateImageFile(file: File, rules: ImageFileRules): string | null {
  if (!rules.types.includes(file.type)) return rules.typeError;
  if (file.size > rules.maxBytes) return rules.sizeError;
  return null;
}

export function toPngFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.png`;
}
