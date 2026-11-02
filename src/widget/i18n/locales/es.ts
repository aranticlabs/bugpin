import type { WidgetCatalog } from '../catalog.js';

const es: WidgetCatalog = {
  'tooltip.launcher': '¿Has encontrado un error?',

  'aria.launcher': 'Informar de un error',
  'aria.close': 'Cerrar',

  'dialog.title': 'Informar de un error',
  'dialog.tabs.details': 'Detalles',
  'dialog.tabs.media': 'Capturas',
  'dialog.tabs.mediaWithCount': 'Capturas ({count})',

  'dialog.fields.title.label': 'Título',
  'dialog.fields.title.placeholder': 'Breve descripción del problema',
  'dialog.fields.description.label': 'Descripción',
  'dialog.fields.description.placeholder': 'Pasos para reproducirlo, comportamiento esperado, etc.',
  'dialog.fields.priority.label': 'Prioridad',
  'dialog.fields.name.label': 'Nombre (opcional)',
  'dialog.fields.name.placeholder': 'Tu nombre',
  'dialog.fields.email.label': 'Correo electrónico (opcional)',
  'dialog.fields.email.placeholder': 'you@example.com',

  'dialog.priority.highest': 'Máxima',
  'dialog.priority.high': 'Alta',
  'dialog.priority.medium': 'Media',
  'dialog.priority.low': 'Baja',
  'dialog.priority.lowest': 'Mínima',

  'dialog.buttons.cancel': 'Cancelar',
  'dialog.buttons.submit': 'Enviar informe',

  'dialog.branding.poweredBy': 'Powered by',

  'validation.title.required': 'El título es obligatorio',
  'validation.title.minLength': 'El título debe tener al menos 4 caracteres',
  'validation.email.invalid': 'Dirección de correo no válida',

  'closeConfirm.title': '¿Guardar borrador?',
  'closeConfirm.body':
    'Tienes cambios sin guardar. ¿Quieres guardarlos como borrador para más tarde?',
  'closeConfirm.discardButton': 'Descartar',
  'closeConfirm.saveDraftButton': 'Guardar borrador',

  'screenCapture.title': 'Se requiere permiso del navegador',
  'screenCapture.body':
    'Tu navegador te pedirá permiso para compartir la pantalla. Sigue los pasos indicados.',
  'screenCapture.browser.firefox': 'Firefox',
  'screenCapture.browser.chromeEdge': 'Chrome · Edge',
  'screenCapture.dontShowAgain': 'No volver a mostrar',
  'screenCapture.back': 'Atrás',
  'screenCapture.confirm': 'Tomar captura',

  'screenshot.privacyTip':
    'Consejo: usa la herramienta de anotación para ocultar datos sensibles antes de enviar.',
  'screenshot.capturing': 'Capturando...',
  'screenshot.capture': 'Capturar pantalla',
  'screenshot.quality.label': 'Reducir calidad de captura',
  'screenshot.quality.activeIndicator': 'Calidad de captura reducida',
  'screenshot.quality.tooltip':
    'Capturar con densidad de píxeles 1x. Usa esto si tu captura de pantalla es demasiado grande para enviar.',
  'screenshot.dropzone.title': 'Arrastra y suelta archivos aquí',
  'screenshot.dropzone.subtitle': 'o haz clic para examinar',
  'screenshot.addMore': 'Añadir más',
  'screenshot.alt': 'Captura de pantalla',
  'screenshot.badge.annotated': 'Anotado',
  'screenshot.badge.video': 'Vídeo',
  'screenshot.action.annotate': 'Anotar',
  'screenshot.action.download': 'Descargar',
  'screenshot.action.remove': 'Quitar',
  'screenshot.helperText':
    'Compatibles: PNG, JPG, GIF, WebP (máx. {imageSize} MB) - MP4, WebM, MOV (máx. {videoSize} MB)',

  'screenshot.error.unsupportedImage': 'Formato de imagen no compatible: {type}',
  'screenshot.error.imageTooLarge': 'La imagen es demasiado grande. El tamaño máximo es {size} MB.',
  'screenshot.error.unsupportedVideo': 'Formato de vídeo no compatible: {type}',
  'screenshot.error.videoTooLarge': 'El vídeo es demasiado grande. El tamaño máximo es {size} MB.',
  'screenshot.error.unsupportedFile': 'Tipo de archivo no compatible: {type}',
  'screenshot.error.captureTooLarge': 'La captura ocupa {size} MB (máx. {limit} MB).',
  'screenshot.error.captureTooLargeHint':
    'Activa «Reducir calidad de captura» o cambia el tamaño de la ventana del navegador.',

  'toast.success.submit': '¡Informe enviado correctamente!',
  'toast.error.submit': 'No se ha podido enviar el informe',
  'toast.error.capture': 'No se ha podido capturar la pantalla',

  'annotation.toolbar.select': 'Seleccionar',
  'annotation.toolbar.pan': 'Desplazar (o mantén pulsado Espacio)',
  'annotation.toolbar.pen': 'Lápiz',
  'annotation.toolbar.line': 'Línea',
  'annotation.toolbar.arrow': 'Flecha',
  'annotation.toolbar.rectangle': 'Rectángulo',
  'annotation.toolbar.circle': 'Círculo',
  'annotation.toolbar.text': 'Texto',
  'annotation.toolbar.pixelate': 'Pixelar',
  'annotation.toolbar.undo': 'Deshacer (Ctrl+Z)',
  'annotation.toolbar.redo': 'Rehacer (Ctrl+Shift+Z)',
  'annotation.toolbar.delete': 'Eliminar selección (Del)',
  'annotation.toolbar.zoomIn': 'Acercar - Mantén pulsado Espacio para desplazar al ampliar',
  'annotation.toolbar.zoomOut': 'Alejar - Mantén pulsado Espacio para desplazar al ampliar',
  'annotation.toolbar.zoomReset':
    'Restablecer zoom ({percent}%) - Mantén pulsado Espacio para desplazar',
  'annotation.toolbar.strokeWidth': '{width}px',
  'annotation.defaultText': 'Texto',
  'annotation.buttons.cancel': 'Cancelar',
  'annotation.buttons.done': 'Hecho',
};

export default es;
