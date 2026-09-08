import widgetPackage from '../package.json';

export const WIDGET_PACKAGE_VERSION = widgetPackage.version;

export function buildWidgetConfigUrl(
  apiKey: string,
  serverUrl: string,
  integration?: 'npm'
): string {
  const url = new URL(`/api/widget/config/${apiKey}`, serverUrl);
  if (integration === 'npm') {
    url.searchParams.set('widgetVersion', WIDGET_PACKAGE_VERSION);
    url.searchParams.set('integration', integration);
  }
  return url.toString();
}
