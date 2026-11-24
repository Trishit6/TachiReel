import { adminPageMetadata } from '../../lib/seo';
import { ContentManager } from '../../components/admin/ContentManager';

export default function AdminCommentsScreen() {
  return (
    <ContentManager
      kind="comment"
      title="Comments Management"
      subtitle="Read comments across posts and Reelyx, then mark them for review or remove them."
      viewPermission="comments.view"
      managePermission="comments.manage"
    />
  );
}

export function generateMetadata() {
  return adminPageMetadata("Comments Management", "/admin/comments");
}
