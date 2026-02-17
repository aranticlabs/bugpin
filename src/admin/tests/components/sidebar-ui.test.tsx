import { describe, it, expect } from 'vitest';
import { render, screen, userEvent, waitFor } from '../utils';
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

function SidebarDemo() {
  return (
    <SidebarProvider defaultOpen={true}>
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
      'useSidebar must be used within a SidebarProvider.',
    );
  });
});
