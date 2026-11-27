import { chromium } from 'playwright-core';

const bundle = await Bun.build({
  entrypoints: [import.meta.dir + '/annotation-touch.tsx'],
  target: 'browser',
});
if (!bundle.success) throw new Error(bundle.logs.map((log) => log.message).join('\n'));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: await bundle.outputs[0].text() });
  await page.locator('html[data-result], html[data-error]').waitFor();
  const error = await page.locator('html').getAttribute('data-error');
  if (error !== null) throw new Error(error);
  console.log('Mouse drag passed after touchend and touchcancel.');
} finally {
  await browser.close();
}
