import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '../../lib/imageUtils';

export function cropImageToPng(imageSrc: string, area: Area): Promise<Blob> {
  return getCroppedImg(imageSrc, area, 'image/png');
}
