import { describe, it, expect } from 'bun:test';
import { renderToString } from 'preact-render-to-string';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Tabs } from '../../components/ui/tabs';
import { Toast } from '../../components/ui/toast';

describe('widget UI components', () => {
  it('renders a button with content', () => {
    const html = renderToString(<Button>Save</Button>);
    expect(html).toContain('Save');
    expect(html).toContain('type="button"');
  });

  it('marks input as invalid when error is true', () => {
    const html = renderToString(<Input error />);
    expect(html).toContain('aria-invalid="true"');
  });

  it('marks textarea as invalid when error is true', () => {
    const html = renderToString(<Textarea error />);
    expect(html).toContain('aria-invalid="true"');
  });

  it('renders select options', () => {
    const html = renderToString(
      <Select>
        <option value="one">One</option>
      </Select>,
    );
    expect(html).toContain('One');
  });

  it('renders required label marker', () => {
    const html = renderToString(<Label required>Name</Label>);
    expect(html).toContain('*');
  });

  it('renders tabs with active state', () => {
    const html = renderToString(
      <Tabs
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'media', label: 'Media' },
        ]}
        activeTab="details"
        onTabChange={() => undefined}
      />,
    );
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Details');
  });

  it('renders toast content', () => {
    const html = renderToString(<Toast message="Saved" type="success" onClose={() => undefined} />);
    expect(html).toContain('Saved');
    expect(html).toContain('role="alert"');
  });
});
