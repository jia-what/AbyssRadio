import { coverUrl, isImageUrl } from '../../utils/img';

interface Props {
  cover?: string;
  className?: string;
}

/** Album cover — uses <img> so it survives liquid-glass overlays and 3D card transforms. */
export default function CoverThumb({ cover, className = '' }: Props) {
  const src = cover && isImageUrl(cover) ? coverUrl(cover) : '';

  if (!src) {
    return <div className={`bg-white/[0.05] ${className}`} />;
  }

  return (
    <img
      src={src}
      alt=""
      className={`object-cover ${className}`}
      style={{ transform: 'translateZ(1px)' }}
      loading="lazy"
      draggable={false}
    />
  );
}
