import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Reloads the page once when a chunk fails to load, which happens in tabs left open across a
// deployment because the old chunk filenames no longer exist.
export function lazyWithRetry(
  factory: () => Promise<{ default: ComponentType }>
): LazyExoticComponent<ComponentType> {
  return lazy(() =>
    factory().catch((error: unknown) => {
      const isChunkError =
        error instanceof Error &&
        (error.message.includes('dynamically imported module') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('Loading chunk'));

      if (isChunkError && !sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {});
      }

      sessionStorage.removeItem('chunk_reload');
      throw error;
    })
  );
}
