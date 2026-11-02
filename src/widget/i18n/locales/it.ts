import type { WidgetCatalog } from '../catalog.js';

const it: WidgetCatalog = {
  'tooltip.launcher': 'Hai trovato un bug?',

  'aria.launcher': 'Segnala bug',
  'aria.close': 'Chiudi',

  'dialog.title': 'Segnala un bug',
  'dialog.tabs.details': 'Dettagli',
  'dialog.tabs.media': 'Screenshot',
  'dialog.tabs.mediaWithCount': 'Screenshot ({count})',

  'dialog.fields.title.label': 'Titolo',
  'dialog.fields.title.placeholder': 'Breve descrizione del problema',
  'dialog.fields.description.label': 'Descrizione',
  'dialog.fields.description.placeholder': 'Passaggi per riprodurre, comportamento atteso, ecc.',
  'dialog.fields.priority.label': 'Priorità',
  'dialog.fields.name.label': 'Nome (facoltativo)',
  'dialog.fields.name.placeholder': 'Il tuo nome',
  'dialog.fields.email.label': 'Email (facoltativa)',
  'dialog.fields.email.placeholder': 'you@example.com',

  'dialog.priority.highest': 'Massima',
  'dialog.priority.high': 'Alta',
  'dialog.priority.medium': 'Media',
  'dialog.priority.low': 'Bassa',
  'dialog.priority.lowest': 'Minima',

  'dialog.buttons.cancel': 'Annulla',
  'dialog.buttons.submit': 'Invia segnalazione',

  'dialog.branding.poweredBy': 'Powered by',

  'validation.title.required': 'Il titolo è obbligatorio',
  'validation.title.minLength': 'Il titolo deve contenere almeno 4 caratteri',
  'validation.email.invalid': 'Indirizzo email non valido',

  'closeConfirm.title': 'Salvare la bozza?',
  'closeConfirm.body': 'Hai modifiche non salvate. Vuoi salvarle come bozza per dopo?',
  'closeConfirm.discardButton': 'Scarta',
  'closeConfirm.saveDraftButton': 'Salva bozza',

  'screenCapture.title': 'Autorizzazione del browser richiesta',
  'screenCapture.body':
    "Il browser chiederà l'autorizzazione per condividere lo schermo. Segui i passaggi indicati.",
  'screenCapture.browser.firefox': 'Firefox',
  'screenCapture.browser.chromeEdge': 'Chrome · Edge',
  'screenCapture.dontShowAgain': 'Non mostrare più',
  'screenCapture.back': 'Indietro',
  'screenCapture.confirm': 'Acquisisci screenshot',

  'screenshot.privacyTip':
    'Suggerimento: usa lo strumento di annotazione per nascondere i dati sensibili prima di inviare.',
  'screenshot.capturing': 'Acquisizione in corso...',
  'screenshot.capture': 'Cattura screenshot',
  'screenshot.quality.label': 'Riduci qualità di acquisizione',
  'screenshot.quality.activeIndicator': 'Qualità di acquisizione ridotta',
  'screenshot.quality.tooltip':
    "Acquisisci con densità di pixel 1x. Usa questa opzione se lo screenshot è troppo grande per l'invio.",
  'screenshot.dropzone.title': 'Trascina i file qui',
  'screenshot.dropzone.subtitle': 'o clicca per sfogliare',
  'screenshot.addMore': 'Aggiungi altri',
  'screenshot.alt': 'Screenshot',
  'screenshot.badge.annotated': 'Annotato',
  'screenshot.badge.video': 'Video',
  'screenshot.action.annotate': 'Annota',
  'screenshot.action.download': 'Scarica',
  'screenshot.action.remove': 'Rimuovi',
  'screenshot.helperText':
    'Supportati: PNG, JPG, GIF, WebP (max {imageSize}MB) - MP4, WebM, MOV (max {videoSize}MB)',

  'screenshot.error.unsupportedImage': 'Formato immagine non supportato: {type}',
  'screenshot.error.imageTooLarge': 'Immagine troppo grande. La dimensione massima è {size}MB.',
  'screenshot.error.unsupportedVideo': 'Formato video non supportato: {type}',
  'screenshot.error.videoTooLarge': 'Video troppo grande. La dimensione massima è {size}MB.',
  'screenshot.error.unsupportedFile': 'Tipo di file non supportato: {type}',
  'screenshot.error.captureTooLarge': 'Lo screenshot è di {size}MB (max. {limit}MB).',
  'screenshot.error.captureTooLargeHint':
    'Attiva "Riduci qualità di acquisizione" o ridimensiona la finestra del browser.',

  'toast.success.submit': 'Segnalazione inviata con successo!',
  'toast.error.submit': 'Invio della segnalazione non riuscito',
  'toast.error.capture': 'Cattura dello screenshot non riuscita',

  'annotation.toolbar.select': 'Seleziona',
  'annotation.toolbar.pan': 'Sposta (o tieni premuto Spazio)',
  'annotation.toolbar.pen': 'Penna',
  'annotation.toolbar.line': 'Linea',
  'annotation.toolbar.arrow': 'Freccia',
  'annotation.toolbar.rectangle': 'Rettangolo',
  'annotation.toolbar.circle': 'Cerchio',
  'annotation.toolbar.text': 'Testo',
  'annotation.toolbar.pixelate': 'Pixela',
  'annotation.toolbar.undo': 'Annulla (Ctrl+Z)',
  'annotation.toolbar.redo': 'Ripeti (Ctrl+Shift+Z)',
  'annotation.toolbar.delete': 'Elimina selezione (Del)',
  'annotation.toolbar.zoomIn': 'Ingrandisci - Tieni premuto Spazio per spostarti quando ingrandito',
  'annotation.toolbar.zoomOut':
    'Rimpicciolisci - Tieni premuto Spazio per spostarti quando ingrandito',
  'annotation.toolbar.zoomReset':
    'Reimposta zoom ({percent}%) - Tieni premuto Spazio per spostarti',
  'annotation.toolbar.strokeWidth': '{width}px',
  'annotation.defaultText': 'Testo',
  'annotation.buttons.cancel': 'Annulla',
  'annotation.buttons.done': 'Fatto',
};

export default it;
