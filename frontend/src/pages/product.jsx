/* ArixGear page — Product Details (Phase 2: the PDP is a real route).
   The heavy lifting lives in components/PDP.jsx (gallery, variants, reviews,
   Q&A, related, JSON-LD via usePdpSEO); this shell just mounts it under
   /product/:slug so every product has a shareable, crawlable URL. */
import PDP from '../components/PDP.jsx';

export default function Page() {
  return <PDP />;
}
