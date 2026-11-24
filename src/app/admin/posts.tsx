import { adminPageMetadata } from '../../lib/seo';
import { ContentManager } from '../../components/admin/ContentManager';

export default function AdminPostsScreen() {
  return (
    <ContentManager
      kind="post"
      title="Posts Management"
      subtitle="Review photo posts, change moderation status, and restore or remove content."
      viewPermission="posts.view"
      managePermission="posts.manage"
    />
  );
}

export function generateMetadata() {
  return adminPageMetadata("Posts Management", "/admin/posts");
}
