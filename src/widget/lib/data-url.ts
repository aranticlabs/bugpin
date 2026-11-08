export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binaryString = atob(parts[1]);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

export function getExtensionFromDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/webp')) {
    return 'webp';
  } else if (dataUrl.startsWith('data:image/jpeg')) {
    return 'jpg';
  } else if (dataUrl.startsWith('data:image/gif')) {
    return 'gif';
  }
  return 'png';
}
