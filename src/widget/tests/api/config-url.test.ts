import { describe, expect, it } from 'bun:test';
import widgetPackage from '../../package.json';
import { buildWidgetConfigUrl, WIDGET_PACKAGE_VERSION } from '../../api/config-url';

describe('buildWidgetConfigUrl', () => {
  it('uses the package manifest version for programmatic initialization', () => {
    const url = new URL(buildWidgetConfigUrl('proj_key', 'https://bugpin.example.com', 'npm'));

    expect(WIDGET_PACKAGE_VERSION).toBe(widgetPackage.version);
    expect(url.pathname).toBe('/api/widget/config/proj_key');
    expect(url.searchParams.get('integration')).toBe('npm');
    expect(url.searchParams.get('widgetVersion')).toBe(widgetPackage.version);
  });

  it('leaves hosted widget requests without package metadata', () => {
    const url = new URL(buildWidgetConfigUrl('proj_key', 'https://bugpin.example.com'));

    expect(url.search).toBe('');
  });
});
