import type {
  GlobalWidgetLauncherButtonSettings,
  WidgetLauncherButtonSettings,
} from '@shared/types';

export type LauncherGlobals =
  | {
      widgetLauncherButton: GlobalWidgetLauncherButtonSettings;
    }
  | undefined;

export type ResolvedLauncherSettings = ReturnType<typeof resolveLauncherSettings>;

export function resolveLauncherSettings(
  value: WidgetLauncherButtonSettings,
  globalSettings: LauncherGlobals
) {
  const global = globalSettings?.widgetLauncherButton;
  return {
    position: value.position ?? global?.position ?? 'bottom-right',
    buttonShape: value.buttonShape ?? global?.buttonShape ?? 'rectangle',
    buttonIcon: value.buttonIcon !== undefined ? value.buttonIcon : (global?.buttonIcon ?? null),
    buttonIconSize: value.buttonIconSize ?? global?.buttonIconSize ?? 18,
    buttonIconStroke: value.buttonIconStroke ?? global?.buttonIconStroke ?? 2,
    buttonOffsetX: value.buttonOffsetX ?? global?.buttonOffsetX ?? 20,
    buttonOffsetY: value.buttonOffsetY ?? global?.buttonOffsetY ?? 20,
    buttonSizeUnit: value.buttonSizeUnit ?? global?.buttonSizeUnit ?? 'px',
    theme: value.theme ?? global?.theme ?? 'auto',
    enableHoverScaleEffect: value.enableHoverScaleEffect ?? global?.enableHoverScaleEffect ?? true,
    tooltipEnabled: value.tooltipEnabled ?? global?.tooltipEnabled ?? false,
    lightButtonColor: value.lightButtonColor ?? global?.lightButtonColor ?? '#02658D',
    lightTextColor: value.lightTextColor ?? global?.lightTextColor ?? '#ffffff',
    lightButtonHoverColor:
      value.lightButtonHoverColor ?? global?.lightButtonHoverColor ?? '#024F6F',
    lightTextHoverColor: value.lightTextHoverColor ?? global?.lightTextHoverColor ?? '#ffffff',
    darkButtonColor: value.darkButtonColor ?? global?.darkButtonColor ?? '#02658D',
    darkTextColor: value.darkTextColor ?? global?.darkTextColor ?? '#ffffff',
    darkButtonHoverColor: value.darkButtonHoverColor ?? global?.darkButtonHoverColor ?? '#036F9B',
    darkTextHoverColor: value.darkTextHoverColor ?? global?.darkTextHoverColor ?? '#ffffff',
  };
}
