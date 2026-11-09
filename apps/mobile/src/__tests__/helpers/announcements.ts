/** Wire fixtures for the Announcements screen tests. */
export const listItem = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  audience: "COMMUNITY",
  seasonId: null,
  seasonTitle: null,
  excerpt: `Excerpt ${id}`,
  authorName: "Sam Author",
  createdAt: "2026-11-03T12:00:00.000Z",
  editedAt: null,
  isRead: true,
  hasPoll: false,
  pollClosed: null,
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
    poll: null,
    ...over,
  };
};

export const ok = (data: unknown) => Promise.resolve({ data: { data } });

/** An open one-answer poll the reader may vote on and hasn't; counts hidden until they do. */
export const pollItem = (over: Record<string, unknown> = {}) => ({
  version: 1,
  allowsMultiple: false,
  closed: false,
  canVote: true,
  canManage: false,
  myOptionIds: [] as number[],
  voterCount: null as number | null,
  multiPickVoters: null as number | null,
  options: [
    { id: 1, label: "Saturday", votes: null as number | null },
    { id: 2, label: "Sunday", votes: null as number | null },
  ],
  ...over,
});
