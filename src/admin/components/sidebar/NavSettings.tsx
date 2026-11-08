import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Crown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { settingsNavigationFor } from '../../lib/settingsNavigation';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../ui/sidebar';

export function NavSettings() {
  const { user } = useAuth();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = settingsNavigationFor(user);

  const closeSidebarOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <SidebarGroup className="sticky top-0 z-10 bg-sidebar">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to Console">
              <Link to="/" onClick={closeSidebarOnMobile}>
                <ArrowLeft />
                <span>Back to Console</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  asChild
                  isActive={
                    location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                  }
                  tooltip={item.title}
                >
                  <Link to={item.path} onClick={closeSidebarOnMobile}>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.enterprise && (
                      <>
                        <Crown className="ml-auto text-muted-foreground" aria-hidden="true" />
                        <span className="sr-only">Enterprise feature</span>
                      </>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
