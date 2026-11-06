type StyleTarget = Document | ShadowRoot;

function createAdoptedSheet(target: StyleTarget, css: string): CSSStyleSheet | null {
  if (!('adoptedStyleSheets' in target) || typeof CSSStyleSheet === 'undefined') return null;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    return null;
  }
}

/**
 * Applies `css` to a document or shadow root and returns a function that removes it again.
 * Uses a constructable stylesheet where supported and a `<style>` element otherwise.
 */
export function adoptStylesheet(target: StyleTarget, css: string): () => void {
  const sheet = createAdoptedSheet(target, css);
  if (sheet) {
    target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
    return () => {
      target.adoptedStyleSheets = target.adoptedStyleSheets.filter((item) => item !== sheet);
    };
  }

  const style = document.createElement('style');
  style.textContent = css;
  ('head' in target ? target.head : target).appendChild(style);
  return () => style.remove();
}
