import type { AdminButtonColors } from '@shared/types';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function declarations(colors: Record<string, string>): string {
  return Object.entries(colors)
    .filter(([, value]) => HEX_COLOR.test(value))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}

/**
 * Builds light and dark overrides for the primary tokens. The doubled selectors outrank the
 * default tokens regardless of stylesheet order, and the cascade handles theme switches.
 */
export function buildButtonColorsCss(colors: AdminButtonColors): string {
  const light = declarations({
    '--primary': colors.lightButtonColor,
    '--primary-foreground': colors.lightTextColor,
    '--primary-hover': colors.lightButtonHoverColor,
    '--primary-hover-foreground': colors.lightTextHoverColor,
  });
  const dark = declarations({
    '--primary': colors.darkButtonColor,
    '--primary-foreground': colors.darkTextColor,
    '--primary-hover': colors.darkButtonHoverColor,
    '--primary-hover-foreground': colors.darkTextHoverColor,
  });
  return `:root:root { ${light} } :root.dark { ${dark} }`;
}

/** Writes the overrides into one style element, so each call replaces the previous colors */
export function applyButtonColors(styleId: string, colors: AdminButtonColors): void {
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.append(style);
  }
  style.textContent = buildButtonColorsCss(colors);
}
