import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { reporterSuppressionService } from '../../services/reporter-suppression.service.js';
import { templateService } from '../../services/template.service.js';
import { normalizeLocale } from '../../utils/locale.js';
import { reporterCopy } from '../../i18n/reporter-copy.js';

export const unsubscribeRoutes = new Hono();

unsubscribeRoutes.use('*', bodyLimit({ maxSize: 1024 }));

unsubscribeRoutes.get('/', (c) => {
  const token = c.req.query('t') ?? '';
  const verified = reporterSuppressionService.verify(token);
  if (!verified.success) return c.text(verified.error, 400);
  const locale = normalizeLocale(c.req.query('locale')) ?? 'en';
  const copy = reporterCopy[locale];
  return c.html(
    templateService.compileTemplate(
      '<!DOCTYPE html><html lang="{{locale}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{title}}</title></head><body><main><h1>{{title}}</h1><p>{{intro}}</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">{{title}}</button></form></main></body></html>',
      { locale, title: copy.unsubscribe, intro: copy.unsubscribeIntro }
    )
  );
});

unsubscribeRoutes.post('/', async (c) => {
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))
    return c.text('Invalid unsubscribe request', 400);
  const body = new URLSearchParams(await c.req.text());
  if (body.get('List-Unsubscribe') !== 'One-Click')
    return c.text('Invalid unsubscribe request', 400);
  const result = reporterSuppressionService.unsubscribe(c.req.query('t') ?? '');
  if (!result.success) return c.text(result.error, 400);
  const locale = normalizeLocale(c.req.query('locale')) ?? 'en';
  return c.text(reporterCopy[locale].unsubscribed);
});
