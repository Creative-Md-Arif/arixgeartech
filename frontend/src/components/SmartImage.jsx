/* Optimize Cloudinary images while preserving same-origin uploads and lazy loading. */
import { useEffect, useRef, useState } from 'react';

/* Cloudinary transformation injection: …/upload/something → …/upload/f_auto,q_auto/something */
export function optimizeSrc(src, { w } = {}) {
  const s = String(src || '');
  if (!/res\.cloudinary\.com/.test(s) || !/\/upload\//.test(s)) return s;
  const t = ['f_auto', 'q_auto', w ? 'w_' + w : null, 'c_limit'].filter(Boolean).join(',');
  return s.replace(/\/upload\/(?![^/]*f_auto)/, '/upload/' + t + '/');
}

export default function SmartImage({ src, alt = '', className = '', w, eager = false, ...rest }) {
  const url = optimizeSrc(src, { w });
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setLoaded(false); }, [url]); // src swap (color variant) re-runs the fade

  /* already-cached images (bfcache, repeat visit) load before onLoad attaches */
  useEffect(() => {
    if (ref.current && ref.current.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [url]);

  return (
    <img
      ref={ref}
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)} /* broken images must not stay invisible */
      className={className + ' transition-opacity duration-500 ' + (loaded ? 'opacity-100' : 'opacity-0')}
      {...rest}
    />
  );
}
