import { adminPageMetadata } from '../../lib/seo';
import { ContentManager } from '../../components/admin/ContentManager';

export default function AdminReelyxScreen() {
  return (
    <ContentManager
      kind="reelyx"
      title="Reelyx Management"
      subtitle="Moderate Reelyx videos from the same posts table that powers the mobile player."
      viewPermission="reelyx.view"
      managePermission="reelyx.manage"
    />
  );
}

export function generateMetadata() {
  return adminPageMetadata("Reelyx Management", "/admin/reelyx");
}
