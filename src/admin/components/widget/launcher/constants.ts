import { Bug, MessageSquare, AlertCircle } from 'lucide-react';

export const TOOLTIP_BUILTIN_PREVIEW = {
  en: 'Found a bug?',
  de: 'Bug gefunden?',
  fr: 'Vous avez trouvé un bug ?',
  nl: 'Bug gevonden?',
  es: '¿Has encontrado un error?',
  it: 'Hai trovato un bug?',
  ja: 'バグを見つけましたか？',
  zh: '发现 bug 了？',
} as const;

// Available icons for the button
export const AVAILABLE_ICONS = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'message-square', label: 'Message', icon: MessageSquare },
  { value: 'alert-circle', label: 'Alert', icon: AlertCircle },
] as const;
