import { describe, it, expect } from 'vitest';
import { render, screen, userEvent } from '../utils';
import { Textarea } from '../../components/ui/textarea';
import { Separator } from '../../components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';

describe('ui primitives', () => {
  it('renders textarea and separator variants', () => {
    render(
      <div>
        <Textarea placeholder="Write a note" />
        <Separator data-testid="separator" orientation="vertical" />
      </div>,
    );

    expect(screen.getByPlaceholderText('Write a note')).toBeInTheDocument();
    expect(screen.getByTestId('separator').className).toContain('w-[1px]');
  });

  it('toggles collapsible content', async () => {
    const user = userEvent.setup();
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Hidden content</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    await user.click(screen.getByText('Toggle'));
    expect(screen.getByText('Hidden content')).toBeVisible();
  });
});
