import { error, json } from '../lib/http.js';
import { deleteRows, insertRows, rpc, selectRows } from '../lib/supabase.js';
import { loadProfile } from '../lib/context.js';
import { listFilesByOwner } from './files.js';

const FEED_PAGE_SIZE = 20;
const BOARD_PAGE_SIZE = 15;
const FEED_PREF_LIMIT = 80;

export const DASHBOARD_DEFAULT_PREFERENCES = {
  defaultScope: 'all',
  defaultSort: 'recent',
  defaultView: 'summary',
  defaultCategory: 'all',
  lastDeptId: '',
  lastSearchQ: '',
};

export function emptyWidgets() {
  return {
    notices: [],
    sharedSchedules: [],
    mySchedules: [],
    quickLinks: [
      { itemType: 'link', title: '게시판', route: '/board' },
      { itemType: 'link', title: '캘린더', route: '/calendar' },
      { itemType: 'link', title: '메신저', route: '/messenger' },
    ],
    favoriteUsers: [],
    todoItems: [],
  };
}

function emptyFeed(page) {
  return {
    items: [],
    counts: {},
    departments: [],
    page,
    totalPages: 1,
  };
}

function escapeLike(value = '') {
  return String(value).replace(/[,%()]/g, ' ').trim();
}

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExcerpt(value = '') {
  return stripHtml(value).slice(0, 180);
}

function boardSelect() {
  return [
    'id',
    'workspace_id',
    'author_user_id',
    'category_code',
    'board_kind',
    'title',
    'body',
    'excerpt',
    'is_pinned',
    'allow_comments',
    'published_at',
    'created_at',
    'updated_at',
    'author:profiles!boards_author_user_id_fkey(id,display_name,dept_name,job_title,email)',
  ].join(',');
}

function boardListSelect() {
  return [
    'id',
    'workspace_id',
    'author_user_id',
    'category_code',
    'board_kind',
    'title',
    'excerpt',
    'is_pinned',
    'allow_comments',
    'published_at',
    'created_at',
    'updated_at',
    'author:profiles!boards_author_user_id_fkey(id,display_name,dept_name,job_title,email)',
  ].join(',');
}

function commentSelect() {
  return [
    'id',
    'board_id',
    'workspace_id',
    'author_user_id',
    'parent_comment_id',
    'body',
    'created_at',
    'updated_at',
    'author:profiles!board_comments_author_user_id_fkey(id,display_name,dept_name,job_title,email)',
  ].join(',');
}

async function loadBoardCategories(runtimeEnv, token) {
  const rows = await selectRows(runtimeEnv, 'board_categories', {
    token,
    params: {
      select: 'code,label,sort_order',
      order: 'sort_order.asc',
    },
  });
  return Array.isArray(rows) ? rows : [];
}

function normalizeComment(row = {}) {
  return {
    cmntSqn: row.id,
    pstId: row.board_id,
    upCmntSqn: row.parent_comment_id || '',
    contents: row.body,
    crtUserId: row.author_user_id,
    userNm: row.author?.display_name || row.author?.email || '사용자',
    deptNm: row.author?.dept_name || '',
    jbgdNm: row.author?.job_title || '',
    frstCrtDt: row.created_at,
    lastChgDt: row.updated_at,
    delYn: 'N',
  };
}

function normalizeBoardDetail(board = {}, attachments = []) {
  return {
    pstId: board.id,
    bbsCtgrCd: board.category_code,
    pstTtl: board.title,
    contents: board.body,
    fixedYn: board.is_pinned ? 'Y' : 'N',
    crtUserId: board.author_user_id,
    userNm: board.author?.display_name || board.author?.email || '사용자',
    deptNm: board.author?.dept_name || '',
    jbgdNm: board.author?.job_title || '',
    frstCrtDt: board.created_at,
    lastChgDt: board.updated_at,
    viewCnt: 0,
    files: attachments,
  };
}

function normalizeNoticeItem(board = {}) {
  return {
    itemType: 'notice',
    feedId: board.id,
    title: board.title,
    subtitle: board.author?.display_name || '공지',
    description: buildExcerpt(board.excerpt || board.body),
    badge: board.is_pinned ? '고정' : '공지',
    createdAt: board.published_at || board.created_at,
    route: '/board',
  };
}

function normalizeFeedItem(board, currentUserId, commentCountMap, readIds, savedIds, commentedIds, categoryMap) {
  const categoryCode = board.category_code;
  return {
    feedId: board.id,
    itemType: 'board',
    categoryCode,
    categoryLabel: categoryMap.get(categoryCode) || categoryCode || '게시글',
    createdAt: board.published_at || board.created_at,
    actorUserId: board.author_user_id,
    actorName: board.author?.display_name || board.author?.email || '사용자',
    actorDeptId: '',
    actorDeptName: board.author?.dept_name || '',
    actorJobGradeName: board.author?.job_title || '',
    title: board.title,
    bodyPreview: buildExcerpt(board.excerpt || board.body),
    commentCount: commentCountMap.get(board.id) || 0,
    viewCount: 0,
    reactionScore: 0,
    route: '/board',
    badge: categoryMap.get(categoryCode) || categoryCode || '게시글',
    visibility: categoryCode === 'F101' ? 'company' : 'community',
    read: readIds.has(board.id),
    saved: savedIds.has(board.id),
    mine: board.author_user_id === currentUserId,
    commented: commentedIds.has(board.id),
    fixedYn: board.is_pinned ? 'Y' : 'N',
  };
}

function normalizeWorkspaceItem(board, currentUserId, categoryMap, commentCountMap, fileCountMap, readIds, savedIds) {
  return {
    pstId: board.id,
    bbsCtgrCd: board.category_code,
    categoryLabel: categoryMap.get(board.category_code) || board.category_code || '게시글',
    pstTtl: board.title,
    summary: buildExcerpt(board.excerpt || board.body),
    crtUserId: board.author_user_id,
    userNm: board.author?.display_name || board.author?.email || '사용자',
    deptNm: board.author?.dept_name || '',
    jbgdNm: board.author?.job_title || '',
    frstCrtDt: board.created_at,
    lastChgDt: board.updated_at,
    fixedYn: board.is_pinned ? 'Y' : 'N',
    commentCount: commentCountMap.get(board.id) || 0,
    fileCount: fileCountMap.get(board.id) || 0,
    readYn: readIds.has(board.id) ? 'Y' : 'N',
    savedYn: savedIds.has(board.id) ? 'Y' : 'N',
    myPostYn: board.author_user_id === currentUserId ? 'Y' : 'N',
  };
}

async function loadNotices(runtimeEnv, token, workspaceId, limit = 5, select = boardSelect()) {
  const rows = await selectRows(runtimeEnv, 'boards', {
    token,
    params: {
      select,
      workspace_id: `eq.${workspaceId}`,
      deleted_at: 'is.null',
      board_kind: 'eq.NOTICE',
      order: 'is_pinned.desc,published_at.desc',
      limit,
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function loadBoardById(runtimeEnv, token, boardId) {
  const rows = await selectRows(runtimeEnv, 'boards', {
    token,
    params: {
      select: boardSelect(),
      id: `eq.${boardId}`,
      deleted_at: 'is.null',
      limit: 1,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function loadCommentRows(runtimeEnv, token, boardId) {
  const rows = await selectRows(runtimeEnv, 'board_comments', {
    token,
    params: {
      select: commentSelect(),
      board_id: `eq.${boardId}`,
      deleted_at: 'is.null',
      order: 'created_at.asc',
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function loadBoardAux(runtimeEnv, token, workspaceId, boardIds = []) {
  const targetBoardIds = [...new Set((boardIds || []).filter(Boolean))];
  if (targetBoardIds.length === 0) {
    return {
      commentCountMap: new Map(),
      fileCountMap: new Map(),
      readIds: new Set(),
      savedIds: new Set(),
      commentedIds: new Set(),
    };
  }

  const rows = await rpc(runtimeEnv, 'load_board_metrics', {
    token,
    body: {
      target_workspace_id: workspaceId,
      board_ids: targetBoardIds,
    },
  });

  const commentCountMap = new Map();
  const fileCountMap = new Map();
  const readIds = new Set();
  const savedIds = new Set();
  const commentedIds = new Set();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.board_id) {
      return;
    }

    commentCountMap.set(row.board_id, Number(row.comment_count || 0));
    fileCountMap.set(row.board_id, Number(row.file_count || 0));

    if (row.read_yn) {
      readIds.add(row.board_id);
    }
    if (row.saved_yn) {
      savedIds.add(row.board_id);
    }
    if (row.commented_yn) {
      commentedIds.add(row.board_id);
    }
  });

  return {
    commentCountMap,
    fileCountMap,
    readIds,
    savedIds,
    commentedIds,
  };
}

export async function handleDashboardBootstrap(context, runtimeEnv) {
  const categories = await loadBoardCategories(runtimeEnv, context.auth.token);
  const notices = await loadNotices(runtimeEnv, context.auth.token, context.workspaceId, 5, boardListSelect());
  const widgets = emptyWidgets();
  widgets.notices = notices.map(normalizeNoticeItem);

  return json({
    preferences: DASHBOARD_DEFAULT_PREFERENCES,
    categories: categories.filter((item) => item.code !== 'F101').map((item) => item.code),
    widgets,
    todos: [],
    recommendations: { items: [] },
  }, { origin: context.auth.origin });
}

export async function handleDashboardFeed(context, runtimeEnv, request) {
  const url = new URL(request.url);
  const scope = String(url.searchParams.get('scope') || 'all');
  const category = String(url.searchParams.get('category') || 'all');
  const q = escapeLike(url.searchParams.get('q') || '');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));

  const categoryRows = await loadBoardCategories(runtimeEnv, context.auth.token);
  const categoryMap = new Map(categoryRows.map((item) => [item.code, item.label]));
  const params = {
    select: boardListSelect(),
    workspace_id: `eq.${context.workspaceId}`,
    deleted_at: 'is.null',
    order: 'is_pinned.desc,published_at.desc',
    limit: FEED_PREF_LIMIT,
  };

  if (category && category !== 'all') {
    params.category_code = `eq.${category}`;
  }
  if (scope === 'my-posts') {
    params.author_user_id = `eq.${context.auth.user.id}`;
  }
  if (q) {
    params.or = `(title.ilike.*${q}*,body.ilike.*${q}*)`;
  }
  if (scope === 'activity') {
    return json(emptyFeed(page), { origin: context.auth.origin });
  }

  const rows = await selectRows(runtimeEnv, 'boards', {
    token: context.auth.token,
    params,
  });
  const boards = Array.isArray(rows) ? rows : [];
  if (boards.length === 0) {
    return json({
      ...emptyFeed(page),
      counts: Object.fromEntries(categoryRows.map((item) => [item.code, 0])),
    }, { origin: context.auth.origin });
  }

  const aux = await loadBoardAux(runtimeEnv, context.auth.token, context.workspaceId, boards.map((item) => item.id));
  const filtered = boards.filter((board) => {
    if (scope === 'saved') return aux.savedIds.has(board.id);
    if (scope === 'unread') return !aux.readIds.has(board.id);
    if (scope === 'commented') return aux.commentedIds.has(board.id);
    return true;
  });

  const counts = {};
  categoryRows.forEach((item) => {
    counts[item.code] = filtered.filter((board) => board.category_code === item.code).length;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / FEED_PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * FEED_PAGE_SIZE, page * FEED_PAGE_SIZE);

  return json({
    items: pageItems.map((board) => normalizeFeedItem(board, context.auth.user.id, aux.commentCountMap, aux.readIds, aux.savedIds, aux.commentedIds, categoryMap)),
    counts,
    departments: [],
    page,
    totalPages,
  }, { origin: context.auth.origin });
}

export async function handleBoardNotice(context, runtimeEnv) {
  const notices = await loadNotices(runtimeEnv, context.auth.token, context.workspaceId, 10);
  const items = await Promise.all(notices.map(async (notice) => normalizeBoardDetail(notice, await listFilesByOwner(runtimeEnv, context.auth.token, 'BOARD', notice.id))));
  return json(items, { origin: context.auth.origin });
}

export async function handleCreateBoard(context, runtimeEnv, request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body?.pstTtl || '').trim();
  const contents = String(body?.contents || '').trim();
  const categoryCode = String(body?.bbsCtgrCd || 'F104');
  const providedId = String(body?.pstId || '').trim();

  if (!title || !contents) {
    return error('제목과 내용을 입력해 주세요.', { status: 400, origin: context.auth.origin });
  }

  const rows = await insertRows(runtimeEnv, 'boards', {
    token: context.auth.token,
    body: {
      id: providedId || undefined,
      workspace_id: context.workspaceId,
      author_user_id: context.auth.user.id,
      category_code: categoryCode,
      board_kind: categoryCode === 'F101' ? 'NOTICE' : 'POST',
      title,
      body: contents,
      excerpt: buildExcerpt(contents),
      is_pinned: String(body?.fixedYn || 'N') === 'Y',
      allow_comments: true,
    },
  });

  const inserted = Array.isArray(rows) ? rows[0] : rows;
  const detail = normalizeBoardDetail({
    ...inserted,
    author: {
      display_name: context.profile?.display_name || context.auth.user.email,
      dept_name: context.profile?.dept_name || '',
      job_title: context.profile?.job_title || '',
      email: context.profile?.email || context.auth.user.email || '',
    },
  }, []);

  return json({ board: detail }, { status: 201, origin: context.auth.origin });
}

export async function handleBoardWorkspace(context, runtimeEnv, request) {
  const url = new URL(request.url);
  const category = String(url.searchParams.get('category') || 'all');
  const q = escapeLike(url.searchParams.get('q') || '');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));

  const categoryRows = await loadBoardCategories(runtimeEnv, context.auth.token);
  const categoryMap = new Map(categoryRows.map((item) => [item.code, item.label]));
  const params = {
    select: boardListSelect(),
    workspace_id: `eq.${context.workspaceId}`,
    deleted_at: 'is.null',
    order: 'is_pinned.desc,published_at.desc',
    limit: 120,
  };
  if (category && category !== 'all') {
    params.category_code = `eq.${category}`;
  }
  if (q) {
    params.or = `(title.ilike.*${q}*,body.ilike.*${q}*)`;
  }

  const rows = await selectRows(runtimeEnv, 'boards', {
    token: context.auth.token,
    params,
  });
  const boards = Array.isArray(rows) ? rows : [];
  const aux = await loadBoardAux(runtimeEnv, context.auth.token, context.workspaceId, boards.map((item) => item.id));
  const totalPages = Math.max(1, Math.ceil(boards.length / BOARD_PAGE_SIZE));
  const pageItems = boards.slice((page - 1) * BOARD_PAGE_SIZE, page * BOARD_PAGE_SIZE);

  const summary = {};
  categoryRows.forEach((item) => {
    summary[item.code] = boards.filter((board) => board.category_code === item.code).length;
  });

  return json({
    items: pageItems.map((board) => normalizeWorkspaceItem(board, context.auth.user.id, categoryMap, aux.commentCountMap, aux.fileCountMap, aux.readIds, aux.savedIds)),
    summary,
    pinnedItems: boards.filter((board) => board.is_pinned).slice(0, 5).map((board) => normalizeWorkspaceItem(board, context.auth.user.id, categoryMap, aux.commentCountMap, aux.fileCountMap, aux.readIds, aux.savedIds)),
    closingPolls: [],
    todoItems: [],
    page,
    totalPages,
  }, { origin: context.auth.origin });
}

export async function handleBoardWorkspaceDetail(context, runtimeEnv, boardId) {
  const board = await loadBoardById(runtimeEnv, context.auth.token, boardId);
  if (!board) {
    return error('게시글을 찾을 수 없습니다.', { status: 404, origin: context.auth.origin });
  }

  const [attachments, comments] = await Promise.all([
    listFilesByOwner(runtimeEnv, context.auth.token, 'BOARD', boardId),
    loadCommentRows(runtimeEnv, context.auth.token, boardId),
  ]);

  return json({
    board: normalizeBoardDetail(board, attachments),
    attachments,
    comments: comments.map(normalizeComment),
  }, { origin: context.auth.origin });
}

export async function handleBoardDetail(context, runtimeEnv, boardId) {
  const board = await loadBoardById(runtimeEnv, context.auth.token, boardId);
  if (!board) {
    return error('게시글을 찾을 수 없습니다.', { status: 404, origin: context.auth.origin });
  }
  return json(normalizeBoardDetail(board, await listFilesByOwner(runtimeEnv, context.auth.token, 'BOARD', boardId)), { origin: context.auth.origin });
}

export async function handleBoardComments(context, runtimeEnv, boardId) {
  const rows = await loadCommentRows(runtimeEnv, context.auth.token, boardId);
  return json(rows.map(normalizeComment), { origin: context.auth.origin });
}

export async function handleCreateBoardComment(context, runtimeEnv, boardId, request) {
  const body = await request.json().catch(() => ({}));
  const contents = String(body?.contents || body?.body || '').trim();
  const parentCommentId = String(body?.upCmntSqn || '').trim() || null;
  if (!contents) {
    return error('댓글 내용을 입력해 주세요.', { status: 400, origin: context.auth.origin });
  }

  const rows = await insertRows(runtimeEnv, 'board_comments', {
    token: context.auth.token,
    body: {
      board_id: boardId,
      workspace_id: context.workspaceId,
      author_user_id: context.auth.user.id,
      parent_comment_id: parentCommentId,
      body: contents,
    },
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  const author = await loadProfile(runtimeEnv, context.auth.token, context.auth.user.id);
  return json(normalizeComment({
    ...row,
    author: {
      display_name: author?.display_name || context.auth.user.email,
      dept_name: author?.dept_name || '',
      job_title: author?.job_title || '',
      email: author?.email || context.auth.user.email || '',
    },
  }), { status: 201, origin: context.auth.origin });
}

export async function handleBoardRead(context, runtimeEnv, boardId) {
  await insertRows(runtimeEnv, 'board_reads', {
    token: context.auth.token,
    upsert: true,
    body: {
      board_id: boardId,
      user_id: context.auth.user.id,
      first_read_at: new Date().toISOString(),
      last_read_at: new Date().toISOString(),
    },
  });

  return json({ ok: true }, { origin: context.auth.origin });
}

export async function handleSaveBoard(context, runtimeEnv, boardId) {
  await insertRows(runtimeEnv, 'board_saves', {
    token: context.auth.token,
    upsert: true,
    body: {
      board_id: boardId,
      user_id: context.auth.user.id,
    },
  });
  return json({ ok: true }, { origin: context.auth.origin });
}

export async function handleUnsaveBoard(context, runtimeEnv, boardId) {
  await deleteRows(runtimeEnv, 'board_saves', {
    token: context.auth.token,
    params: {
      board_id: `eq.${boardId}`,
      user_id: `eq.${context.auth.user.id}`,
    },
  });
  return json({ ok: true }, { origin: context.auth.origin });
}

export async function handleDashboardProfile(context, runtimeEnv, userId) {
  const profile = await loadProfile(runtimeEnv, context.auth.token, userId);
  if (!profile) {
    return error('사용자 정보를 찾을 수 없습니다.', { status: 404, origin: context.auth.origin });
  }

  const boards = await selectRows(runtimeEnv, 'boards', {
    token: context.auth.token,
    params: {
      select: boardSelect(),
      workspace_id: `eq.${context.workspaceId}`,
      author_user_id: `eq.${userId}`,
      deleted_at: 'is.null',
      order: 'published_at.desc',
      limit: 5,
    },
  });

  return json({
    user: {
      userId: profile.id,
      userNm: profile.display_name || profile.email,
      deptNm: profile.dept_name || '',
      jbgdNm: profile.job_title || '',
      userEmail: profile.email || '',
      userTelno: profile.phone || '',
      extTel: '',
    },
    favorite: false,
    recentBoards: (Array.isArray(boards) ? boards : []).map((board) => normalizeBoardDetail(board, [])),
    recentActivities: [],
    histories: [],
  }, { origin: context.auth.origin });
}
