import type { WidgetCatalog } from '../catalog.js';

const de: WidgetCatalog = {
  'tooltip.launcher': 'Bug gefunden?',

  'aria.launcher': 'Bug melden',
  'aria.close': 'Schließen',

  'dialog.title': 'Bug melden',
  'dialog.tabs.details': 'Details',
  'dialog.tabs.media': 'Screenshots',
  'dialog.tabs.mediaWithCount': 'Screenshots ({count})',
  'dialog.tabs.recording': 'Aufnahmen',
  'dialog.tabs.recordingWithCount': 'Aufnahmen ({count})',

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
  'screenCapture.confirmRecording': 'Recorder öffnen',
  'screenCapture.recording.body':
    'Dein Browser fragt, was geteilt werden soll. Alles Sichtbare wird aufgezeichnet.',
  'screenCapture.recording.windowHint':
    'Wähle das Fenster mit dieser Seite. Andere Apps können sichtbar sein.',

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
  'screenshot.helperText': 'Unterstützt: PNG, JPG, GIF, WebP (max. {imageSize} MB)',
  'recording.quality.low': 'Niedrig',
  'recording.quality.standard': 'Standard',
  'recording.quality.high': 'Hoch',
  'recording.helperText': 'Unterstützt: MP4, WebM, MOV (max. {videoSize} MB)',

  'screenshot.error.unsupportedImage': 'Nicht unterstütztes Bildformat: {type}',
  'screenshot.error.imageTooLarge': 'Bild zu groß. Maximale Größe: {size} MB.',
  'screenshot.error.unsupportedVideo': 'Nicht unterstütztes Videoformat: {type}',
  'screenshot.error.videoTooLarge': 'Video zu groß. Maximale Größe: {size} MB.',
  'screenshot.error.unsupportedFile': 'Nicht unterstützter Dateityp: {type}',
  'screenshot.error.captureTooLarge': 'Screenshot ist {size} MB (max. {limit} MB).',
  'screenshot.error.captureTooLargeHint':
    'Aktiviere „Aufnahmequalität reduzieren" oder verkleinere das Browserfenster.',

  'recording.record': 'Aufnahme starten',
  'recording.startShort': 'Starten',
  'recording.start': 'Recorder öffnen',
  'recording.microphone': 'Mikrofon einbeziehen',
  'recording.privacyTip': 'Alles Sichtbare wird aufgezeichnet.',
  'recording.countdown': 'Aufnahme startet in {seconds}',
  'recording.stop': 'Stoppen',
  'recording.discard': 'Verwerfen',
  'recording.pause': 'Pausieren',
  'recording.play': 'Abspielen',
  'recording.expand': 'Video vergrößern',
  'recording.resume': 'Fortsetzen',
  'recording.tool.cursor': 'Mauszeiger',
  'recording.tool.pen': 'Stift',
  'recording.tool.laser': 'Laserpointer',
  'recording.tool.clickEffects': 'Klickeffekte',
  'recording.tool.undo': 'Rückgängig',
  'recording.tool.clear': 'Zeichnung löschen',
  'recording.color.red': 'Rot',
  'recording.color.amber': 'Bernstein',
  'recording.color.green': 'Grün',
  'recording.color.blue': 'Blau',
  'recording.color.white': 'Weiß',
  'recording.warning.wholeScreen': 'Du teilst deinen gesamten Bildschirm.',
  'recording.notice.noMicrophone': 'Aufnahme ohne Mikrofon.',
  'recording.stopped.duration': 'Aufnahme nach {duration} gestoppt.',
  'recording.stopped.size': 'Aufnahme beim Limit von {size} MB gestoppt.',
  'recording.recovered': 'Aufnahme gespeichert. Öffne BugPin, um fortzufahren.',
  'recording.error.unavailable': 'Bildschirmaufnahme ist nicht verfügbar.',
  'recording.error.failed': 'Aufnahme fehlgeschlagen. Bitte versuche es erneut.',
  'recording.error.empty': 'Die Aufnahme war leer. Bitte versuche es erneut.',
  'recording.oversized': 'Die Aufnahme ist {size} MB groß (max. {limit} MB).',
  'recording.oversizedHint': 'Lade sie herunter oder nimm einen kürzeren Clip auf.',
  'recording.previewUnavailable': 'Vorschau nicht verfügbar.',

  'submit.uploading': 'Wird hochgeladen: {percent} %',
  'submit.cancelUpload': 'Hochladen abbrechen',
  'submit.error.tooLarge':
    'Der Upload ist zu groß für den Server. Entferne einige Medien und versuche es erneut.',
  'submit.error.videoQuota':
    'Video-Uploads sind für dieses Projekt pausiert. Entferne das Video, um den Bericht zu senden.',
  'submit.error.rejected':
    'Der Upload wurde abgelehnt. Möglicherweise sind deine Anhänge zu groß. Entferne oder verkleinere sie und versuche es erneut.',
  'submit.queued':
    'Bericht gespeichert. Er wird automatisch gesendet, sobald die Verbindung wieder steht.',

  'toast.success.submit': 'Fehlerbericht erfolgreich gesendet!',
  'toast.error.submit': 'Bericht konnte nicht gesendet werden',
  'toast.error.capture': 'Screenshot konnte nicht aufgenommen werden',
  'toast.error.draftSave':
    'Der Entwurf konnte nicht gespeichert werden. Lass das Widget geöffnet und versuche es erneut.',

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
