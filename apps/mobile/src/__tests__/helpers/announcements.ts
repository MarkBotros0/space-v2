/** Wire fixtures for the Announcements screen tests. */
export const listItem = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  audience: "COMMUNITY",
  seasonId: null,
  seasonTitle: null,
  title: `Post ${id}`,
  excerpt: `Excerpt ${id}`,
  authorName: "Sam Author",
  createdAt: "2026-11-03T12:00:00.000Z",
  editedAt: null,
  isRead: true,
  ...over,
});

export const detailItem = (id: number, over: Record<string, unknown> = {}) => {
  const { excerpt: _excerpt, ...rest } = listItem(id);
  return {
    ...rest,
    body: "Full body https://example.com/x.",
    canEdit: false,
    canDelete: false,
    seasonFinished: false,
    ...over,
  };
};

export const ok = (data: unknown) => Promise.resolve({ data: { data } });
