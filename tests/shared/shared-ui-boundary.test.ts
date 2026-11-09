import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';

it('bundles shared presentation for browsers without staff or drag-and-drop modules', async () => {
  const directory = fileURLToPath(new URL('../../src/shared-ui/', import.meta.url));
  const primitives = [...new Bun.Glob('components/ui/*.tsx').scanSync(directory)];
  const result = await Bun.build({
    entrypoints: [
      ...primitives,
      'components/report-board/ReportBoard.tsx',
      'components/report-board/ReportViewSwitcher.tsx',
      'lib/status.tsx',
    ].map((file) => `${directory}${file}`),
    tsconfig: `${directory}tsconfig.json`,
    target: 'browser',
    metafile: true,
  });

  expect(result.success).toBe(true);
  expect(result.logs).toEqual([]);
  const graph = (
    typeof result.metafile === 'string' ? JSON.parse(result.metafile) : result.metafile
  ) as { inputs: Record<string, unknown> };
  const forbidden = Object.keys(graph.inputs).filter((file) =>
    /(?:src\/(?:admin|server)\/|@dnd-kit\/)/.test(file)
  );
  expect(forbidden).toEqual([]);
});
