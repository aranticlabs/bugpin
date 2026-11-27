import { ImageLightbox as SharedImageLightbox } from '@shared-ui/components/ImageLightbox';

const labels = {
  close: 'Close',
  download: 'Download',
  openInNewTab: 'Open in new tab',
  alt: 'Full size screenshot',
};

export function ImageLightbox({
  image,
  onClose,
}: {
  image: { url: string; filename: string } | null;
  onClose: () => void;
}) {
  return <SharedImageLightbox image={image} onClose={onClose} labels={labels} />;
}
