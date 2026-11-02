import type { WidgetCatalog } from '../catalog.js';

const nl: WidgetCatalog = {
  'tooltip.launcher': 'Bug gevonden?',

  'aria.launcher': 'Bug melden',
  'aria.close': 'Sluiten',

  'dialog.title': 'Een bug melden',
  'dialog.tabs.details': 'Details',
  'dialog.tabs.media': 'Schermafbeeldingen',
  'dialog.tabs.mediaWithCount': 'Schermafbeeldingen ({count})',
  'dialog.tabs.recording': 'Opnames',
  'dialog.tabs.recordingWithCount': 'Opnames ({count})',

  'dialog.fields.title.label': 'Titel',
  'dialog.fields.title.placeholder': 'Korte beschrijving van het probleem',
  'dialog.fields.description.label': 'Beschrijving',
  'dialog.fields.description.placeholder':
    'Stappen om dit probleem te herhalen, verwacht gedrag, etc.',
  'dialog.fields.priority.label': 'Prioriteit',
  'dialog.fields.name.label': 'Naam (optioneel)',
  'dialog.fields.name.placeholder': 'Uw naam',
  'dialog.fields.email.label': 'E-mail (optioneel)',
  'dialog.fields.email.placeholder': 'you@example.com',

  'dialog.priority.highest': 'Hoogste',
  'dialog.priority.high': 'Hoog',
  'dialog.priority.medium': 'Gemiddeld',
  'dialog.priority.low': 'Laag',
  'dialog.priority.lowest': 'Laagste',

  'dialog.buttons.cancel': 'Annuleren',
  'dialog.buttons.submit': 'Rapport verzenden',

  'dialog.branding.poweredBy': 'Powered by',

  'validation.title.required': 'Titel is verplicht',
  'validation.title.minLength': 'Titel moet minstens 4 tekens bevatten',
  'validation.email.invalid': 'Ongeldig e-mailadres',

  'closeConfirm.title': 'Concept opslaan?',
  'closeConfirm.body':
    'U heeft niet-opgeslagen wijzigingen. Wilt u deze als concept bewaren voor later?',
  'closeConfirm.discardButton': 'Verwerpen',
  'closeConfirm.saveDraftButton': 'Concept opslaan',

  'screenCapture.title': 'Browsertoestemming vereist',
  'screenCapture.body':
    'Uw browser zal toestemming vragen om uw scherm te delen. Volg de getoonde stappen.',
  'screenCapture.browser.firefox': 'Firefox',
  'screenCapture.browser.chromeEdge': 'Chrome · Edge',
  'screenCapture.dontShowAgain': 'Dit niet meer tonen',
  'screenCapture.back': 'Terug',
  'screenCapture.confirm': 'Schermafbeelding maken',
  'screenCapture.confirmRecording': 'Opname starten',
  'screenCapture.recording.body':
    'Uw browser vraagt wat u wilt delen. Alles wat zichtbaar is, wordt opgenomen.',
  'screenCapture.recording.windowHint':
    'Kies het venster met deze pagina. Andere apps kunnen zichtbaar zijn.',

  'screenshot.privacyTip':
    'Tip: gebruik het annotatiegereedschap om gevoelige gegevens te verbergen voordat u verzendt.',
  'screenshot.capturing': 'Bezig met vastleggen...',
  'screenshot.capture': 'Schermafbeelding maken',
  'screenshot.quality.label': 'Opnamekwaliteit verlagen',
  'screenshot.quality.activeIndicator': 'Opnamekwaliteit verlaagd',
  'screenshot.quality.tooltip':
    'Vastleggen met 1x pixeldichtheid. Gebruik dit als je schermafbeelding te groot is om te versturen.',
  'screenshot.dropzone.title': 'Sleep bestanden hierheen',
  'screenshot.dropzone.subtitle': 'of klik om te bladeren',
  'screenshot.addMore': 'Meer toevoegen',
  'screenshot.alt': 'Schermafbeelding',
  'screenshot.badge.annotated': 'Geannoteerd',
  'screenshot.badge.video': 'Video',
  'screenshot.action.annotate': 'Annoteren',
  'screenshot.action.download': 'Downloaden',
  'screenshot.action.remove': 'Verwijderen',
  'screenshot.helperText': 'Ondersteund: PNG, JPG, GIF, WebP (max {imageSize}MB)',
  'recording.helperText': 'Ondersteund: MP4, WebM, MOV (max {videoSize}MB)',

  'screenshot.error.unsupportedImage': 'Niet-ondersteund afbeeldingsformaat: {type}',
  'screenshot.error.imageTooLarge': 'Afbeelding te groot. Maximale grootte is {size}MB.',
  'screenshot.error.unsupportedVideo': 'Niet-ondersteund videoformaat: {type}',
  'screenshot.error.videoTooLarge': 'Video te groot. Maximale grootte is {size}MB.',
  'screenshot.error.unsupportedFile': 'Niet-ondersteund bestandstype: {type}',
  'screenshot.error.captureTooLarge': 'Schermafbeelding is {size}MB (max. {limit}MB).',
  'screenshot.error.captureTooLargeHint':
    'Schakel "Opnamekwaliteit verlagen" in of pas de grootte van het browservenster aan.',

  'recording.start': 'Scherm opnemen',
  'recording.microphone': 'Microfoon opnemen',
  'recording.privacyTip': 'Alles wat zichtbaar is, wordt opgenomen.',
  'recording.countdown': 'Opname start over {seconds}',
  'recording.stop': 'Stoppen',
  'recording.discard': 'Verwijderen',
  'recording.pause': 'Pauzeren',
  'recording.play': 'Afspelen',
  'recording.expand': 'Video vergroten',
  'recording.resume': 'Hervatten',
  'recording.status.recording': 'REC',
  'recording.status.paused': 'GEPAUZEERD',
  'recording.tool.cursor': 'Cursor',
  'recording.tool.pen': 'Pen',
  'recording.tool.laser': 'Laseraanwijzer',
  'recording.tool.clickEffects': 'Klikeffecten',
  'recording.tool.undo': 'Ongedaan maken',
  'recording.tool.clear': 'Tekening wissen',
  'recording.color.red': 'Rood',
  'recording.color.amber': 'Amber',
  'recording.color.green': 'Groen',
  'recording.color.blue': 'Blauw',
  'recording.color.white': 'Wit',
  'recording.warning.wholeScreen': 'U deelt uw volledige scherm.',
  'recording.notice.noMicrophone': 'Opname zonder microfoon.',
  'recording.stopped.duration': 'Opname gestopt na {duration}.',
  'recording.stopped.size': 'Opname gestopt bij de limiet van {size}MB.',
  'recording.recovered': 'Opname opgeslagen. Open BugPin om door te gaan.',
  'recording.error.unavailable': 'Schermopname is niet beschikbaar.',
  'recording.error.failed': 'Opname mislukt. Probeer het opnieuw.',
  'recording.error.empty': 'De opname was leeg. Probeer het opnieuw.',
  'recording.oversized': 'De opname is {size}MB (max. {limit}MB).',
  'recording.oversizedHint': 'Download de opname of maak een kortere clip.',
  'recording.previewUnavailable': 'Videovoorbeeld niet beschikbaar.',

  'submit.uploading': 'Uploaden: {percent}%',
  'submit.cancelUpload': 'Upload annuleren',
  'submit.error.tooLarge':
    'De upload is te groot voor de server. Verwijder media en probeer het opnieuw.',
  'submit.error.videoQuota':
    'Video-uploads zijn gepauzeerd voor dit project. Verwijder de video om het rapport te verzenden.',

  'toast.success.submit': 'Bugrapport succesvol verzonden!',
  'toast.error.submit': 'Verzenden van rapport mislukt',
  'toast.error.capture': 'Maken van schermafbeelding mislukt',

  'annotation.toolbar.select': 'Selecteren',
  'annotation.toolbar.pan': 'Verschuiven (of houd Spatie ingedrukt)',
  'annotation.toolbar.pen': 'Pen',
  'annotation.toolbar.line': 'Lijn',
  'annotation.toolbar.arrow': 'Pijl',
  'annotation.toolbar.rectangle': 'Rechthoek',
  'annotation.toolbar.circle': 'Cirkel',
  'annotation.toolbar.text': 'Tekst',
  'annotation.toolbar.pixelate': 'Pixeleren',
  'annotation.toolbar.undo': 'Ongedaan maken (Ctrl+Z)',
  'annotation.toolbar.redo': 'Opnieuw uitvoeren (Ctrl+Shift+Z)',
  'annotation.toolbar.delete': 'Selectie verwijderen (Del)',
  'annotation.toolbar.zoomIn': 'Inzoomen - houd Spatie ingedrukt om te verschuiven bij ingezoomd',
  'annotation.toolbar.zoomOut': 'Uitzoomen - houd Spatie ingedrukt om te verschuiven bij ingezoomd',
  'annotation.toolbar.zoomReset':
    'Zoom resetten ({percent}%) - houd Spatie ingedrukt om te verschuiven',
  'annotation.toolbar.strokeWidth': '{width}px',
  'annotation.defaultText': 'Tekst',
  'annotation.buttons.cancel': 'Annuleren',
  'annotation.buttons.done': 'Klaar',
};

export default nl;
