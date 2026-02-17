import { describe, it, expect } from 'vitest';
import { render, screen, userEvent } from '../utils';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';

describe('DropdownMenu', () => {
  it('renders items, checkboxes, radios, and sub content', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>Primary action</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked>Checked item</DropdownMenuCheckboxItem>
              <DropdownMenuRadioGroup value="one">
                <DropdownMenuRadioItem value="one">Option one</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="two">Option two</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Sub item</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuShortcut>Ctrl+K</DropdownMenuShortcut>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Primary action')).toBeInTheDocument();
    expect(screen.getByText('Checked item')).toBeInTheDocument();

    await user.hover(screen.getByText('More'));
    expect(await screen.findByText('Sub item')).toBeInTheDocument();
  });
});
