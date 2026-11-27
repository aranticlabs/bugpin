import { expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';

it('bundles shared presentation for browsers without staff or drag-and-drop modules', async () => {
  const directory = fileURLToPath(new URL('../../src/shared-ui/', import.meta.url));
  const modules = [...new Bun.Glob('**/*.{ts,tsx}').scanSync(directory)].filter(
    (file) => !/(?:^|\/)(?:tests|__tests__|dist|node_modules)\/|\.(?:test|spec)\.tsx?$/.test(file)
  );
  const result = await Bun.build({
    entrypoints: modules.map((file) => `${directory}${file}`),
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
