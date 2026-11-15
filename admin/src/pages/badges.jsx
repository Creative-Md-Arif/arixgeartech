import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider } from '../components/Overlays.jsx';
import { useLang } from '../lib/i18n.jsx';
import { BadgesCard } from './catalog.jsx';

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="badges" title="Badges">
        <BadgesCard />
      </AdminShell>
    </OverlayProvider>
  );
}
