import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  type LucideIcon,
  LayoutDashboard,
  ClipboardList,
  FolderKanban,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '../ui/sidebar';

interface NavSubItem {
  title: string;
  url: string;
}

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles?: Array<'admin' | 'editor' | 'viewer'>;
  items?: NavSubItem[];
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    url: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Reports',
    url: '/reports',
    icon: ClipboardList,
  },
  {
    title: 'Projects',
    url: '/projects',
    icon: FolderKanban,
    roles: ['admin'],
  },
  {
    title: 'Settings',
    url: '/globalsettings',
    icon: Settings,
    roles: ['admin'],
    items: [
      { title: 'System', url: '#system' },
      { title: 'Design', url: '#widgetLauncherButton' },
      { title: 'Notifications', url: '#notifications' },
      { title: 'Security', url: '#security' },
      { title: 'Users', url: '#users' },
      { title: 'License', url: '#license' },
    ],
  },
];

export function NavMain() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role);
  });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {filteredItems.map((item) => {
          const isActive =
            item.url === '/' ? location.pathname === '/' : location.pathname.startsWith(item.url);

          // If item has sub-items, render with collapsible
          if (item.items?.length) {
            return (
              <Collapsible key={item.url} asChild defaultOpen={isActive}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRight />
                      <span className="sr-only">Toggle</span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => {
                        const subIsActive =
                          location.hash === subItem.url ||
                          (subItem.url === '#system' &&
                            !location.hash &&
                            location.pathname === item.url);

                        const handleSubItemClick = (e: React.MouseEvent) => {
                          e.preventDefault();
                          // If already on the parent page, just update hash
                          if (
                            location.pathname === item.url ||
                            location.pathname.startsWith(item.url + '/')
                          ) {
                            window.location.hash = subItem.url;
                          } else {
                            // Navigate to parent URL, then set hash
                            navigate(item.url);
                            // Set hash after navigation
                            setTimeout(() => {
                              window.location.hash = subItem.url;
                            }, 0);
                          }
                        };

                        return (
                          <SidebarMenuSubItem key={subItem.url}>
                            <SidebarMenuSubButton asChild isActive={subIsActive}>
                              <a href={item.url + subItem.url} onClick={handleSubItemClick}>
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          }

          // Regular item without sub-items
          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
