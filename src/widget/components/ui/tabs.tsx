import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon?: JSX.Element;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const Tabs: FunctionComponent<TabsProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div
      class="inline-flex p-1 bg-muted rounded gap-1"
      role="tablist"
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            class={cn(
              'flex items-center gap-2 px-3 py-1.5 border-none rounded-md bg-transparent text-muted-foreground text-sm font-medium font-sans cursor-pointer transition-colors',
              'hover:text-foreground',
              isActive && 'bg-background text-foreground shadow-sm',
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon && (
              <span class="flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4">
                {tab.icon}
              </span>
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
