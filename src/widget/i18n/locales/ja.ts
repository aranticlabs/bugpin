import type { WidgetCatalog } from '../catalog.js';

const ja: WidgetCatalog = {
  'tooltip.launcher': 'バグを見つけましたか？',

  'aria.launcher': 'バグを報告',
  'aria.close': '閉じる',

  'dialog.title': 'バグを報告',
  'dialog.tabs.details': '詳細',
  'dialog.tabs.media': 'スクリーンショット',
  'dialog.tabs.mediaWithCount': 'スクリーンショット（{count}件）',
  'dialog.tabs.recording': '画面録画',
  'dialog.tabs.recordingWithCount': '画面録画 ({count})',

  'dialog.fields.title.label': 'タイトル',
  'dialog.fields.title.placeholder': '問題の概要を簡潔に',
  'dialog.fields.description.label': '説明',
  'dialog.fields.description.placeholder': '再現手順、期待される動作など',
  'dialog.fields.priority.label': '優先度',
  'dialog.fields.name.label': '名前（任意）',
  'dialog.fields.name.placeholder': 'お名前',
  'dialog.fields.email.label': 'メールアドレス（任意）',
  'dialog.fields.email.placeholder': 'you@example.com',

  'dialog.priority.highest': '最高',
  'dialog.priority.high': '高',
  'dialog.priority.medium': '中',
  'dialog.priority.low': '低',
  'dialog.priority.lowest': '最低',

  'dialog.buttons.cancel': 'キャンセル',
  'dialog.buttons.submit': 'レポートを送信',

  'dialog.branding.poweredBy': 'Powered by',

  'validation.title.required': 'タイトルは必須です',
  'validation.title.minLength': 'タイトルは4文字以上で入力してください',
  'validation.email.invalid': 'メールアドレスの形式が正しくありません',

  'closeConfirm.title': '下書きを保存しますか？',
  'closeConfirm.body': '未保存の変更があります。下書きとして保存しますか？',
  'closeConfirm.discardButton': '破棄',
  'closeConfirm.saveDraftButton': '下書きを保存',

  'screenCapture.title': 'ブラウザの許可が必要です',
  'screenCapture.body':
    'ブラウザから画面共有の許可を求められます。表示される手順に従ってください。',
  'screenCapture.browser.firefox': 'Firefox',
  'screenCapture.browser.chromeEdge': 'Chrome · Edge',
  'screenCapture.dontShowAgain': '次回から表示しない',
  'screenCapture.back': '戻る',
  'screenCapture.confirm': '撮影',
  'screenCapture.confirmRecording': '録画を開始',
  'screenCapture.recording.body':
    '共有する内容をブラウザが確認します。表示されているものはすべて録画されます。',
  'screenCapture.recording.windowHint':
    'このページのウィンドウを選択してください。他のアプリが映る場合があります。',

  'screenshot.privacyTip': 'ヒント：送信前に注釈ツールで機密情報を隠してください。',
  'screenshot.capturing': '撮影中...',
  'screenshot.capture': 'スクリーンショットを撮影',
  'screenshot.quality.label': 'キャプチャ品質を下げる',
  'screenshot.quality.activeIndicator': 'キャプチャ品質を低下中',
  'screenshot.quality.tooltip':
    '1倍のピクセル密度でキャプチャします。スクリーンショットが送信できないほど大きい場合に使用してください。',
  'screenshot.dropzone.title': 'ファイルをここにドラッグ＆ドロップ',
  'screenshot.dropzone.subtitle': 'またはクリックして選択',
  'screenshot.addMore': 'さらに追加',
  'screenshot.alt': 'スクリーンショット',
  'screenshot.badge.annotated': '注釈済み',
  'screenshot.badge.video': '動画',
  'screenshot.action.annotate': '注釈',
  'screenshot.action.download': 'ダウンロード',
  'screenshot.action.remove': '削除',
  'screenshot.helperText':
    '対応形式：PNG、JPG、GIF、WebP（最大{imageSize}MB）／MP4、WebM、MOV（最大{videoSize}MB）',

  'screenshot.error.unsupportedImage': '対応していない画像形式です：{type}',
  'screenshot.error.imageTooLarge': '画像サイズが大きすぎます。最大{size}MBまでです。',
  'screenshot.error.unsupportedVideo': '対応していない動画形式です：{type}',
  'screenshot.error.videoTooLarge': '動画サイズが大きすぎます。最大{size}MBまでです。',
  'screenshot.error.unsupportedFile': '対応していないファイル形式です：{type}',
  'screenshot.error.captureTooLarge': 'スクリーンショットは{size}MBです（上限: {limit}MB）。',
  'screenshot.error.captureTooLargeHint':
    '「キャプチャ品質を下げる」を有効にするか、ブラウザウィンドウのサイズを変更してください。',

  'recording.start': '画面を録画',
  'recording.microphone': 'マイクを含める',
  'recording.privacyTip': '表示されているものはすべて録画されます。',
  'recording.countdown': '{seconds} 秒後に録画を開始します',
  'recording.stop': '停止',
  'recording.discard': '破棄',
  'recording.pause': '一時停止',
  'recording.resume': '再開',
  'recording.warning.wholeScreen': '画面全体を共有しています。',
  'recording.notice.noMicrophone': 'マイクなしで録画しています。',
  'recording.stopped.duration': '{minutes} 分の上限に達したため録画を停止しました。',
  'recording.stopped.size': '{size}MBの上限に達したため録画を停止しました。',
  'recording.error.unavailable': '画面録画は利用できません。',
  'recording.error.failed': '録画に失敗しました。もう一度お試しください。',
  'recording.error.empty': '録画が空でした。もう一度お試しください。',
  'recording.oversized': '録画サイズは{size}MBです（最大{limit}MB）。',
  'recording.oversizedHint': 'ダウンロードするか、より短いクリップを録画してください。',

  'toast.success.submit': 'バグレポートを送信しました！',
  'toast.error.submit': 'レポートの送信に失敗しました',
  'toast.error.capture': 'スクリーンショットの撮影に失敗しました',

  'annotation.toolbar.select': '選択',
  'annotation.toolbar.pan': '移動（またはスペースキーを長押し）',
  'annotation.toolbar.pen': 'ペン',
  'annotation.toolbar.line': '線',
  'annotation.toolbar.arrow': '矢印',
  'annotation.toolbar.rectangle': '四角形',
  'annotation.toolbar.circle': '円',
  'annotation.toolbar.text': 'テキスト',
  'annotation.toolbar.pixelate': 'モザイク',
  'annotation.toolbar.undo': '元に戻す（Ctrl+Z）',
  'annotation.toolbar.redo': 'やり直し（Ctrl+Shift+Z）',
  'annotation.toolbar.delete': '選択項目を削除（Del）',
  'annotation.toolbar.zoomIn': '拡大：拡大中はスペースキーを長押しで移動',
  'annotation.toolbar.zoomOut': '縮小：拡大中はスペースキーを長押しで移動',
  'annotation.toolbar.zoomReset': 'ズームをリセット（{percent}%）：スペースキーを長押しで移動',
  'annotation.toolbar.strokeWidth': '{width}px',
  'annotation.defaultText': 'テキスト',
  'annotation.buttons.cancel': 'キャンセル',
  'annotation.buttons.done': '完了',
};

export default ja;
