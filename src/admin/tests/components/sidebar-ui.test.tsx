import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, userEvent, waitFor } from '../utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '../../components/ui/sidebar';

function SidebarDemo({
  width,
  onWidthChange,
}: {
  width?: number;
  onWidthChange?: (width: number) => void;
}) {
  return (
    <SidebarProvider
      defaultOpen={true}
      width={width}
      minWidth={208}
      maxWidth={480}
      onWidthChange={onWidthChange}
    >
      <Sidebar>
        <SidebarHeader>
          <SidebarInput placeholder="Search" />
          <SidebarSeparator />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupAction aria-label="Add">+</SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Home">
                    Home
                  </SidebarMenuButton>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuAction>⋯</SidebarMenuAction>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton isActive>Sub item</SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>Footer</SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger />
        <div>Content</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarConsumer() {
  useSidebar();
  return <div>Consumer</div>;
}

describe('sidebar ui', () => {
  it('renders sidebar components and toggles open state', async () => {
    const user = userEvent.setup();
    render(<SidebarDemo />);

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();

    const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    await user.click(trigger as HTMLButtonElement);
    expect(document.cookie).toContain('sidebar:state=false');

    await user.keyboard('{Meta>}b{/Meta}');
    expect(document.cookie).toContain('sidebar:state=true');
  });

  it('resizes the sidebar by dragging the rail and reports the new width', () => {
    const onWidthChange = vi.fn();
    render(<SidebarDemo width={300} onWidthChange={onWidthChange} />);

    const wrapper = document.querySelector('.group\\/sidebar-wrapper') as HTMLElement;
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('300px');

    const rail = document.querySelector('[data-sidebar="rail"]') as HTMLButtonElement;
    fireEvent.pointerDown(rail, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientX: 360, pointerId: 1 });
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('360px');
    fireEvent.pointerUp(rail, { clientX: 360, pointerId: 1 });
    fireEvent.click(rail);

    expect(onWidthChange).toHaveBeenCalledWith(360);
    expect(document.querySelector('[data-state="expanded"]')).not.toBeNull();

    fireEvent.pointerDown(rail, { button: 0, clientX: 360, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientX: 2000, pointerId: 1 });
    fireEvent.pointerUp(rail, { clientX: 2000, pointerId: 1 });
    expect(onWidthChange).toHaveBeenLastCalledWith(480);
  });

  it('keeps the dragged width when the stored width updates after release', async () => {
    function AsyncStore() {
      const [stored, setStored] = useState(256);
      return (
        <SidebarDemo
          width={stored}
          onWidthChange={(next) => setTimeout(() => setStored(next), 20)}
        />
      );
    }
    render(<AsyncStore />);

    const wrapper = document.querySelector('.group\\/sidebar-wrapper') as HTMLElement;
    const rail = document.querySelector('[data-sidebar="rail"]') as HTMLButtonElement;
    fireEvent.pointerDown(rail, { button: 0, clientX: 256, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientX: 340, pointerId: 1 });
    fireEvent.pointerUp(rail, { clientX: 340, pointerId: 1 });

    // Before the stored width catches up, the sidebar must not snap back to the old width.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('340px');

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('340px');
  });

  it('collapses the sidebar when the rail is clicked without dragging', () => {
    const onWidthChange = vi.fn();
    render(<SidebarDemo onWidthChange={onWidthChange} />);

    const rail = document.querySelector('[data-sidebar="rail"]') as HTMLButtonElement;
    fireEvent.pointerDown(rail, { button: 0, clientX: 256, pointerId: 1 });
    fireEvent.pointerUp(rail, { clientX: 257, pointerId: 1 });
    fireEvent.click(rail);

    expect(onWidthChange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-state="collapsed"]')).not.toBeNull();
  });

  it('renders mobile sidebar when viewport is narrow', async () => {
    const user = userEvent.setup();
    const originalWidth = window.innerWidth;
    window.innerWidth = 500;

    render(<SidebarDemo />);

    await waitFor(() => {
      expect(document.querySelector('[data-mobile=\"true\"]')).not.toBeNull();
    });

    const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    await user.click(trigger as HTMLButtonElement);
    const mobileSidebar = document.querySelector('[data-mobile=\"true\"]');
    expect(mobileSidebar?.className).toContain('translate-x-0');

    window.innerWidth = originalWidth;
  });

  it('throws when useSidebar is used outside provider', () => {
    expect(() => render(<SidebarConsumer />)).toThrow(
      'useSidebar must be used within a SidebarProvider.'
    );
  });
});
