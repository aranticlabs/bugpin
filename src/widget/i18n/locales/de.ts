import type { WidgetCatalog } from '../catalog.js';

const de: WidgetCatalog = {
  'tooltip.launcher': 'Bug gefunden?',

  'aria.launcher': 'Bug melden',
  'aria.close': 'Schließen',

  'dialog.title': 'Bug melden',
  'dialog.tabs.details': 'Details',
  'dialog.tabs.media': 'Screenshots',
  'dialog.tabs.mediaWithCount': 'Screenshots ({count})',

  'dialog.fields.title.label': 'Titel',
  'dialog.fields.title.placeholder': 'Kurze Beschreibung des Problems',
  'dialog.fields.description.label': 'Beschreibung',
  'dialog.fields.description.placeholder': 'Schritte zur Reproduktion, erwartetes Verhalten usw.',
  'dialog.fields.priority.label': 'Priorität',
  'dialog.fields.name.label': 'Name (optional)',
  'dialog.fields.name.placeholder': 'Dein Name',
  'dialog.fields.email.label': 'E-Mail (optional)',
  'dialog.fields.email.placeholder': 'you@example.com',

  'dialog.priority.highest': 'Sehr hoch',
  'dialog.priority.high': 'Hoch',
  'dialog.priority.medium': 'Mittel',
  'dialog.priority.low': 'Niedrig',
  'dialog.priority.lowest': 'Sehr niedrig',

  'dialog.buttons.cancel': 'Abbrechen',
  'dialog.buttons.submit': 'Bericht senden',

  'dialog.branding.poweredBy': 'Powered by',

  'validation.title.required': 'Titel ist erforderlich',
  'validation.title.minLength': 'Der Titel muss mindestens 4 Zeichen lang sein',
  'validation.email.invalid': 'Ungültige E-Mail-Adresse',

  'closeConfirm.title': 'Entwurf speichern?',
  'closeConfirm.body':
    'Du hast ungespeicherte Änderungen. Möchtest du diese als Entwurf speichern?',
  'closeConfirm.discardButton': 'Verwerfen',
  'closeConfirm.saveDraftButton': 'Entwurf speichern',

  'screenCapture.title': 'Browser-Berechtigung erforderlich',
  'screenCapture.body':
    'Dein Browser wird dich um Erlaubnis bitten, den Bildschirm freizugeben. Folge den angezeigten Schritten.',
  'screenCapture.browser.firefox': 'Firefox',
  'screenCapture.browser.chromeEdge': 'Chrome · Edge',
  'screenCapture.dontShowAgain': 'Nicht mehr anzeigen',
  'screenCapture.back': 'Zurück',
  'screenCapture.confirm': 'Screenshot aufnehmen',

  'screenshot.privacyTip':
    'Tipp: Nutze das Anmerkungswerkzeug, um sensible Daten vor dem Senden zu verbergen.',
  'screenshot.capturing': 'Aufnahme läuft...',
  'screenshot.capture': 'Screenshot aufnehmen',
  'screenshot.quality.label': 'Aufnahmequalität reduzieren',
  'screenshot.quality.activeIndicator': 'Aufnahmequalität reduziert',
  'screenshot.quality.tooltip':
    'Mit einfacher Pixeldichte (1x) aufnehmen. Verwende dies, wenn dein Screenshot zu groß zum Senden ist.',
  'screenshot.dropzone.title': 'Dateien hier ablegen',
  'screenshot.dropzone.subtitle': 'oder klicken zum Durchsuchen',
  'screenshot.addMore': 'Weitere hinzufügen',
  'screenshot.alt': 'Screenshot',
  'screenshot.badge.annotated': 'Kommentiert',
  'screenshot.badge.video': 'Video',
  'screenshot.action.annotate': 'Kommentieren',
  'screenshot.action.download': 'Herunterladen',
  'screenshot.action.remove': 'Entfernen',
  'screenshot.helperText':
    'Unterstützt: PNG, JPG, GIF, WebP (max. {imageSize} MB) - MP4, WebM, MOV (max. {videoSize} MB)',

  'screenshot.error.unsupportedImage': 'Nicht unterstütztes Bildformat: {type}',
  'screenshot.error.imageTooLarge': 'Bild zu groß. Maximale Größe: {size} MB.',
  'screenshot.error.unsupportedVideo': 'Nicht unterstütztes Videoformat: {type}',
  'screenshot.error.videoTooLarge': 'Video zu groß. Maximale Größe: {size} MB.',
  'screenshot.error.unsupportedFile': 'Nicht unterstützter Dateityp: {type}',
  'screenshot.error.captureTooLarge': 'Screenshot ist {size} MB (max. {limit} MB).',
  'screenshot.error.captureTooLargeHint':
    'Aktiviere „Aufnahmequalität reduzieren" oder verkleinere das Browserfenster.',

  'toast.success.submit': 'Fehlerbericht erfolgreich gesendet!',
  'toast.error.submit': 'Bericht konnte nicht gesendet werden',
  'toast.error.capture': 'Screenshot konnte nicht aufgenommen werden',

  'annotation.toolbar.select': 'Auswählen',
  'annotation.toolbar.pan': 'Verschieben (oder Space gedrückt halten)',
  'annotation.toolbar.pen': 'Stift',
  'annotation.toolbar.line': 'Linie',
  'annotation.toolbar.arrow': 'Pfeil',
  'annotation.toolbar.rectangle': 'Rechteck',
  'annotation.toolbar.circle': 'Kreis',
  'annotation.toolbar.text': 'Text',
  'annotation.toolbar.pixelate': 'Pixeln',
  'annotation.toolbar.undo': 'Rückgängig (Ctrl+Z)',
  'annotation.toolbar.redo': 'Wiederholen (Ctrl+Shift+Z)',
  'annotation.toolbar.delete': 'Auswahl löschen (Del)',
  'annotation.toolbar.zoomIn': 'Vergrößern - Space gedrückt halten zum Verschieben',
  'annotation.toolbar.zoomOut': 'Verkleinern - Space gedrückt halten zum Verschieben',
  'annotation.toolbar.zoomReset':
    'Zoom zurücksetzen ({percent}%) - Space gedrückt halten zum Verschieben',
  'annotation.toolbar.strokeWidth': '{width}px',
  'annotation.defaultText': 'Text',
  'annotation.buttons.cancel': 'Abbrechen',
  'annotation.buttons.done': 'Fertig',
};

export default de;
