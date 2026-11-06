import type { WidgetCatalog } from '../catalog.js';

const fr: WidgetCatalog = {
  'tooltip.launcher': 'Vous avez trouvé un bug ?',

  'aria.launcher': 'Signaler un bug',
  'aria.close': 'Fermer',

  'dialog.title': 'Signaler un bug',
  'dialog.tabs.details': 'Détails',
  'dialog.tabs.media': "Captures d'écran",
  'dialog.tabs.mediaWithCount': "Captures d'écran ({count})",
  'dialog.tabs.recording': 'Enregistrements',
  'dialog.tabs.recordingWithCount': 'Enregistrements ({count})',

  'dialog.fields.title.label': 'Titre',
  'dialog.fields.title.placeholder': 'Brève description du problème',
  'dialog.fields.description.label': 'Description',
  'dialog.fields.description.placeholder': 'Étapes de reproduction, comportement attendu, etc.',
  'dialog.fields.priority.label': 'Priorité',
  'dialog.fields.name.label': 'Nom (facultatif)',
  'dialog.fields.name.placeholder': 'Votre nom',
  'dialog.fields.email.label': 'E-mail (facultatif)',
  'dialog.fields.email.placeholder': 'you@example.com',

  'dialog.priority.highest': 'Très haute',
  'dialog.priority.high': 'Haute',
  'dialog.priority.medium': 'Moyenne',
  'dialog.priority.low': 'Basse',
  'dialog.priority.lowest': 'Très basse',

  'dialog.buttons.cancel': 'Annuler',
  'dialog.buttons.submit': 'Envoyer le rapport',

  'dialog.branding.poweredBy': 'Powered by',

  'validation.title.required': 'Le titre est obligatoire',
  'validation.title.minLength': 'Le titre doit comporter au moins 4 caractères',
  'validation.email.invalid': 'Adresse e-mail invalide',

  'closeConfirm.title': 'Enregistrer le brouillon ?',
  'closeConfirm.body':
    'Vous avez des modifications non enregistrées. Voulez-vous les sauvegarder comme brouillon pour plus tard ?',
  'closeConfirm.discardButton': 'Abandonner',
  'closeConfirm.saveDraftButton': 'Enregistrer le brouillon',

  'screenCapture.title': 'Permission du navigateur requise',
  'screenCapture.body':
    "Votre navigateur va vous demander l'autorisation de partager votre écran. Suivez les étapes indiquées.",
  'screenCapture.browser.firefox': 'Firefox',
  'screenCapture.browser.chromeEdge': 'Chrome · Edge',
  'screenCapture.dontShowAgain': 'Ne plus afficher',
  'screenCapture.back': 'Retour',
  'screenCapture.confirm': 'Prendre la capture',
  'screenCapture.confirmRecording': 'Ouvrir l’enregistreur',
  'screenCapture.recording.body':
    'Votre navigateur vous demandera quoi partager. Tout ce qui est visible sera enregistré.',
  'screenCapture.recording.windowHint':
    "Choisissez la fenêtre contenant cette page. D'autres applications peuvent être visibles.",

  'screenshot.privacyTip':
    "Conseil : utilisez l'outil d'annotation pour masquer les données sensibles avant d'envoyer.",
  'screenshot.capturing': 'Capture en cours...',
  'screenshot.capture': "Capturer l'écran",
  'screenshot.quality.label': 'Réduire la qualité de capture',
  'screenshot.quality.activeIndicator': 'Qualité de capture réduite',
  'screenshot.quality.tooltip':
    "Capturer à une densité de pixels de 1x. Utilisez cette option si votre capture d'écran est trop volumineuse pour être envoyée.",
  'screenshot.dropzone.title': 'Faites glisser vos fichiers ici',
  'screenshot.dropzone.subtitle': 'ou cliquez pour parcourir',
  'screenshot.addMore': "Ajouter d'autres",
  'screenshot.alt': "Capture d'écran",
  'screenshot.badge.annotated': 'Annoté',
  'screenshot.badge.video': 'Vidéo',
  'screenshot.action.annotate': 'Annoter',
  'screenshot.action.download': 'Télécharger',
  'screenshot.action.remove': 'Supprimer',
  'screenshot.helperText': 'Formats acceptés : PNG, JPG, GIF, WebP (max. {imageSize} Mo)',
  'recording.helperText': 'Formats acceptés : MP4, WebM, MOV (max. {videoSize} Mo)',

  'screenshot.error.unsupportedImage': "Format d'image non pris en charge : {type}",
  'screenshot.error.imageTooLarge': 'Image trop volumineuse. Taille maximale : {size} Mo.',
  'screenshot.error.unsupportedVideo': 'Format de vidéo non pris en charge : {type}',
  'screenshot.error.videoTooLarge': 'Vidéo trop volumineuse. Taille maximale : {size} Mo.',
  'screenshot.error.unsupportedFile': 'Type de fichier non pris en charge : {type}',
  'screenshot.error.captureTooLarge': "La capture d'écran fait {size} Mo (max. {limit} Mo).",
  'screenshot.error.captureTooLargeHint':
    'Activez « Réduire la qualité de capture » ou redimensionnez la fenêtre du navigateur.',

  'recording.record': 'Démarrer l’enregistrement',
  'recording.startShort': 'Démarrer',
  'recording.start': 'Ouvrir l’enregistreur',
  'recording.microphone': 'Inclure le microphone',
  'recording.privacyTip': 'Tout ce qui est visible sera enregistré.',
  'recording.countdown': "L'enregistrement démarre dans {seconds}",
  'recording.stop': 'Arrêter',
  'recording.discard': 'Supprimer',
  'recording.pause': 'Pause',
  'recording.play': 'Lire',
  'recording.expand': 'Agrandir la vidéo',
  'recording.resume': 'Reprendre',
  'recording.tool.cursor': 'Curseur',
  'recording.tool.pen': 'Stylo',
  'recording.tool.laser': 'Pointeur laser',
  'recording.tool.clickEffects': 'Effets de clic',
  'recording.tool.undo': 'Annuler',
  'recording.tool.clear': 'Effacer le dessin',
  'recording.color.red': 'Rouge',
  'recording.color.amber': 'Ambre',
  'recording.color.green': 'Vert',
  'recording.color.blue': 'Bleu',
  'recording.color.white': 'Blanc',
  'recording.warning.wholeScreen': 'Vous partagez tout votre écran.',
  'recording.notice.noMicrophone': 'Enregistrement sans microphone.',
  'recording.stopped.duration': 'Enregistrement arrêté après {duration}.',
  'recording.stopped.size': 'Enregistrement arrêté à la limite de {size} Mo.',
  'recording.recovered': 'Enregistrement sauvegardé. Ouvrez BugPin pour continuer.',
  'recording.error.unavailable': "L'enregistrement d'écran n'est pas disponible.",
  'recording.error.failed': "L'enregistrement a échoué. Veuillez réessayer.",
  'recording.error.empty': "L'enregistrement était vide. Veuillez réessayer.",
  'recording.oversized': "L'enregistrement fait {size} Mo (max. {limit} Mo).",
  'recording.oversizedHint': 'Téléchargez-le ou enregistrez un clip plus court.',
  'recording.previewUnavailable': 'Aperçu indisponible.',

  'submit.uploading': 'Téléversement : {percent} %',
  'submit.cancelUpload': 'Annuler le téléversement',
  'submit.error.tooLarge':
    'Le téléversement est trop volumineux pour le serveur. Supprimez des médias et réessayez.',
  'submit.error.videoQuota':
    'Les téléversements vidéo sont suspendus pour ce projet. Supprimez la vidéo pour envoyer le rapport.',

  'toast.success.submit': 'Rapport de bug envoyé avec succès !',
  'toast.error.submit': "Échec de l'envoi du rapport",
  'toast.error.capture': "Échec de la capture d'écran",
  'toast.error.draftSave':
    "Impossible d'enregistrer le brouillon. Gardez le widget ouvert et réessayez.",

  'annotation.toolbar.select': 'Sélectionner',
  'annotation.toolbar.pan': 'Déplacer (ou maintenir Space)',
  'annotation.toolbar.pen': 'Stylo',
  'annotation.toolbar.line': 'Ligne',
  'annotation.toolbar.arrow': 'Flèche',
  'annotation.toolbar.rectangle': 'Rectangle',
  'annotation.toolbar.circle': 'Cercle',
  'annotation.toolbar.text': 'Texte',
  'annotation.toolbar.pixelate': 'Pixeliser',
  'annotation.toolbar.undo': 'Annuler (Ctrl+Z)',
  'annotation.toolbar.redo': 'Rétablir (Ctrl+Shift+Z)',
  'annotation.toolbar.delete': 'Supprimer la sélection (Del)',
  'annotation.toolbar.zoomIn': 'Zoom avant - Maintenir Space pour déplacer',
  'annotation.toolbar.zoomOut': 'Zoom arrière - Maintenir Space pour déplacer',
  'annotation.toolbar.zoomReset':
    'Réinitialiser le zoom ({percent}%) - Maintenir Space pour déplacer',
  'annotation.toolbar.strokeWidth': '{width}px',
  'annotation.defaultText': 'Texte',
  'annotation.buttons.cancel': 'Annuler',
  'annotation.buttons.done': 'Terminer',
};

export default fr;
