import { Link } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '../ui/sidebar';
import { NavMain } from './NavMain';
import { NavUser } from './NavUser';
import { useBranding } from '../../contexts/BrandingContext';
import { useTheme } from '../../contexts/ThemeContext';

export function AppSidebar() {
  const { config } = useBranding();
  const { resolvedTheme } = useTheme();

  // Get the appropriate URLs based on current theme
  const logoUrl = resolvedTheme === 'dark' ? config?.logoDarkUrl : config?.logoLightUrl;
  const iconUrl = resolvedTheme === 'dark' ? config?.iconDarkUrl : config?.iconLightUrl;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Home"
              size="lg"
              className="overflow-hidden hover:bg-transparent active:bg-transparent"
            >
              <Link to="/">
                {/* Icon - visible when collapsed */}
                <img
                  src={
                    iconUrl ||
                    (resolvedTheme === 'dark'
                      ? '/branding/dark/icon-dark.svg'
                      : '/branding/light/icon-light.svg')
                  }
                  alt="Icon"
                  className="!size-8 shrink-0 hidden group-data-[collapsible=icon]:block"
                />
                {/* Logo - visible when expanded */}
                <img
                  src={
                    logoUrl ||
                    (resolvedTheme === 'dark'
                      ? '/branding/dark/logo-dark.svg'
                      : '/branding/light/logo-light.svg')
                  }
                  alt="Logo"
                  className="h-8 w-auto shrink-0 object-contain object-left group-data-[collapsible=icon]:hidden"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
