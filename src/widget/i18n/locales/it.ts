import type { WidgetCatalog } from '../catalog.js';

const it: WidgetCatalog = {
  'tooltip.launcher': 'Hai trovato un bug?',

  'aria.launcher': 'Segnala bug',
  'aria.close': 'Chiudi',

  'dialog.title': 'Segnala un bug',
  'dialog.tabs.details': 'Dettagli',
  'dialog.tabs.media': 'Screenshot',
  'dialog.tabs.mediaWithCount': 'Screenshot ({count})',
  'dialog.tabs.recording': 'Video',
  'dialog.tabs.recordingWithCount': 'Video ({count})',

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
  'screenCapture.confirmRecording': 'Avvia registrazione',
  'screenCapture.recording.body':
    'Il browser chiederà cosa condividere. Tutto ciò che è visibile verrà registrato.',
  'screenCapture.recording.windowHint':
    'Scegli la finestra con questa pagina. Altre app potrebbero essere visibili.',

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
  'screenshot.helperText': 'Supportati: PNG, JPG, GIF, WebP (max {imageSize}MB)',
  'recording.helperText': 'Supportati: MP4, WebM, MOV (max {videoSize}MB)',

  'screenshot.error.unsupportedImage': 'Formato immagine non supportato: {type}',
  'screenshot.error.imageTooLarge': 'Immagine troppo grande. La dimensione massima è {size}MB.',
  'screenshot.error.unsupportedVideo': 'Formato video non supportato: {type}',
  'screenshot.error.videoTooLarge': 'Video troppo grande. La dimensione massima è {size}MB.',
  'screenshot.error.unsupportedFile': 'Tipo di file non supportato: {type}',
  'screenshot.error.captureTooLarge': 'Lo screenshot è di {size}MB (max. {limit}MB).',
  'screenshot.error.captureTooLargeHint':
    'Attiva "Riduci qualità di acquisizione" o ridimensiona la finestra del browser.',

  'recording.start': 'Registra schermo',
  'recording.microphone': 'Includi microfono',
  'recording.privacyTip': 'Tutto ciò che è visibile verrà registrato.',
  'recording.countdown': 'La registrazione inizia tra {seconds}',
  'recording.stop': 'Interrompi',
  'recording.discard': 'Scarta',
  'recording.pause': 'Pausa',
  'recording.play': 'Riproduci',
  'recording.expand': 'Ingrandisci video',
  'recording.resume': 'Riprendi',
  'recording.status.recording': 'REC',
  'recording.status.paused': 'IN PAUSA',
  'recording.tool.cursor': 'Cursore',
  'recording.tool.pen': 'Penna',
  'recording.tool.laser': 'Puntatore laser',
  'recording.tool.clickEffects': 'Effetti clic',
  'recording.tool.undo': 'Annulla',
  'recording.tool.clear': 'Cancella disegno',
  'recording.color.red': 'Rosso',
  'recording.color.amber': 'Ambra',
  'recording.color.green': 'Verde',
  'recording.color.blue': 'Blu',
  'recording.color.white': 'Bianco',
  'recording.warning.wholeScreen': "Stai condividendo l'intero schermo.",
  'recording.notice.noMicrophone': 'Registrazione senza microfono.',
  'recording.stopped.duration': 'Registrazione interrotta dopo {duration}.',
  'recording.stopped.size': 'Registrazione interrotta al limite di {size}MB.',
  'recording.recovered': 'Registrazione salvata. Apri BugPin per continuare.',
  'recording.error.unavailable': 'La registrazione dello schermo non è disponibile.',
  'recording.error.failed': 'Registrazione non riuscita. Riprova.',
  'recording.error.empty': 'La registrazione era vuota. Riprova.',
  'recording.oversized': 'La registrazione è di {size}MB (max. {limit}MB).',
  'recording.oversizedHint': 'Scaricala o registra una clip più breve.',
  'recording.previewUnavailable': 'Anteprima non disponibile.',

  'submit.uploading': 'Caricamento: {percent}%',
  'submit.cancelUpload': 'Annulla caricamento',
  'submit.error.tooLarge':
    'Il caricamento è troppo grande per il server. Rimuovi alcuni file multimediali e riprova.',
  'submit.error.videoQuota':
    'I caricamenti video sono sospesi per questo progetto. Rimuovi il video per inviare la segnalazione.',

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
