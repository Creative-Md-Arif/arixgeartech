import AdminShell from '../components/AdminShell.jsx';
import { OverlayProvider } from '../components/Overlays.jsx';
import { useLang } from '../lib/i18n.jsx';
import { SpecSchemaCard } from './catalog.jsx';

export default function Page() {
  useLang();
  return (
    <OverlayProvider>
      <AdminShell active="spec-schema" title="Spec Schema">
        <SpecSchemaCard />
      </AdminShell>
    </OverlayProvider>
  );
}
