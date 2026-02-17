import { Bug, MessageSquare, AlertCircle, type LucideIcon } from 'lucide-preact';

interface IconProps {
  name: string;
  class?: string;
  size?: number;
  strokeWidth?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
  bug: Bug,
  'message-square': MessageSquare,
  'alert-circle': AlertCircle,
};

export const Icon = ({ name, class: className, size = 18, strokeWidth = 2 }: IconProps) => {
  const IconComponent = ICON_MAP[name];

  if (!IconComponent) {
    return null;
  }

  return <IconComponent class={className} size={size} strokeWidth={strokeWidth} />;
};
