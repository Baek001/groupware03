import { getEnv } from './lib/env.js';
import { empty, error, json } from './lib/http.js';
import {
  handleCreateWorkspace,
  handleListWorkspaces,
  handleSession,
  handleSwitchTenant,
  requireAdminWorkspaceContext,
  requireWorkspaceContext,
} from './lib/context.js';
import {
  DASHBOARD_DEFAULT_PREFERENCES,
  handleBoardComments,
  handleBoardDetail,
  handleBoardNotice,
  handleBoardRead,
  handleBoardWorkspace,
  handleBoardWorkspaceDetail,
  handleCreateBoard,
  handleCreateBoardComment,
  handleDashboardBootstrap,
  handleDashboardFeed,
  handleDashboardProfile,
  handleSaveBoard,
  handleUnsaveBoard,
} from './features/boards.js';
import { handleAdminDashboard } from './features/admin.js';
import {
  handleChatPanel,
  handleChatRooms,
  handleChatUsers,
  handleCreateRoom,
  handleFindOrCreateRoom,
  handleMarkAsRead,
  handleRoomDetail,
  handleRoomMessages,
  handleSendMessage,
} from './features/chat.js';
import { handleListFiles, handleRegisterFiles } from './features/files.js';
import { requireUser } from './lib/session.js';
import { selectRows } from './lib/supabase.js';

function currentOrigin(request, runtimeEnv) {
  return request.headers.get('Origin') || runtimeEnv.appBaseUrl;
}

function toMessage(errorLike, fallback = '요청을 처리하지 못했습니다.') {
  return errorLike?.payload?.message || errorLike?.message || fallback;
}

async function handleAlarmTop10(request, runtimeEnv) {
  const context = await requireWorkspaceContext(request, runtimeEnv);
  if (context.error) {
    return context.error;
  }

  const rows = await selectRows(runtimeEnv, 'notifications', {
    token: context.auth.token,
    params: {
      select: 'id,title,body,route,target_type,target_id,created_at,read_at',
      recipient_user_id: `eq.${context.auth.user.id}`,
      order: 'created_at.desc',
      limit: 10,
    },
  });

  return json(Array.isArray(rows) ? rows : [], { origin: context.auth.origin });
}

async function handleChatCurrentUser(request, runtimeEnv) {
  const context = await requireWorkspaceContext(request, runtimeEnv);
  if (context.error) {
    return context.error;
  }

  return json(context.session.user, { origin: context.auth.origin });
}

async function handleNotImplementedOk(request, runtimeEnv, payload = { ok: true }) {
  const auth = await requireUser(request, runtimeEnv);
  if (auth.error) {
    return auth.error;
  }
  return json(payload, { origin: auth.origin });
}

export default {
  async fetch(request, env) {
    const runtimeEnv = getEnv(env);
    const origin = currentOrigin(request, runtimeEnv);
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return empty(204, origin);
    }

    try {
      if (pathname === '/api/health' || pathname === '/actuator/health') {
        return json({
          status: 'UP',
          service: 'edge-rewrite-api',
          time: new Date().toISOString(),
        }, { origin });
      }

      if (pathname === '/common/auth/revoke' && request.method === 'POST') {
        return json({ ok: true }, { origin });
      }

      if (pathname === '/rest/mypage' && request.method === 'GET') {
        return handleSession(request, runtimeEnv);
      }

      if (pathname === '/rest/workspaces' && request.method === 'GET') {
        return handleListWorkspaces(request, runtimeEnv);
      }

      if (pathname === '/rest/workspaces' && request.method === 'POST') {
        return handleCreateWorkspace(request, runtimeEnv);
      }

      if (pathname === '/common/auth/switch-tenant' && request.method === 'POST') {
        return handleSwitchTenant(request, runtimeEnv);
      }

      if (pathname === '/rest/admin/dashboard' && request.method === 'GET') {
        const context = await requireAdminWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleAdminDashboard(context, runtimeEnv);
      }

      if (pathname === '/rest/dashboard' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleDashboardBootstrap(context, runtimeEnv);
      }

      if (pathname === '/rest/dashboard/bootstrap' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleDashboardBootstrap(context, runtimeEnv);
      }

      if (pathname === '/rest/dashboard/feed' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleDashboardFeed(context, runtimeEnv, request);
      }

      if (pathname === '/rest/dashboard/preferences' && request.method === 'GET') {
        return handleNotImplementedOk(request, runtimeEnv, DASHBOARD_DEFAULT_PREFERENCES);
      }

      if (pathname === '/rest/dashboard/preferences' && request.method === 'PUT') {
        const auth = await requireUser(request, runtimeEnv);
        if (auth.error) return auth.error;
        const body = await request.json().catch(() => ({}));
        return json({ ...DASHBOARD_DEFAULT_PREFERENCES, ...body }, { origin: auth.origin });
      }

      if (pathname === '/rest/dashboard/categories' && request.method === 'GET') {
        return handleNotImplementedOk(request, runtimeEnv, { categories: [] });
      }

      if (pathname === '/rest/dashboard/categories' && request.method === 'PUT') {
        const auth = await requireUser(request, runtimeEnv);
        if (auth.error) return auth.error;
        const body = await request.json().catch(() => ({}));
        return json({ categories: Array.isArray(body?.categories) ? body.categories : [] }, { origin: auth.origin });
      }

      if (pathname === '/rest/dashboard/todos' && request.method === 'GET') {
        return handleNotImplementedOk(request, runtimeEnv, []);
      }

      if (pathname === '/rest/dashboard/todos' && request.method === 'POST') {
        return handleNotImplementedOk(request, runtimeEnv, { todoId: crypto.randomUUID() });
      }

      if (/^\/rest\/dashboard\/todos\/[^/]+$/.test(pathname) && (request.method === 'PATCH' || request.method === 'DELETE')) {
        return handleNotImplementedOk(request, runtimeEnv);
      }

      if (pathname === '/rest/dashboard/category-recommendations' && request.method === 'GET') {
        return handleNotImplementedOk(request, runtimeEnv, { items: [] });
      }

      if (pathname === '/rest/dashboard/category-recommendations' && request.method === 'POST') {
        return handleNotImplementedOk(request, runtimeEnv, { recommendId: crypto.randomUUID() });
      }

      if (/^\/rest\/dashboard\/category-recommendations\/[^/]+$/.test(pathname) && request.method === 'PATCH') {
        return handleNotImplementedOk(request, runtimeEnv);
      }

      if (pathname === '/rest/dashboard/favorite-users' && request.method === 'GET') {
        return handleNotImplementedOk(request, runtimeEnv, []);
      }

      if (/^\/rest\/dashboard\/favorite-users\/[^/]+$/.test(pathname) && (request.method === 'POST' || request.method === 'DELETE')) {
        return handleNotImplementedOk(request, runtimeEnv);
      }

      const dashboardProfileMatch = pathname.match(/^\/rest\/dashboard\/profile\/([^/]+)$/);
      if (dashboardProfileMatch && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleDashboardProfile(context, runtimeEnv, dashboardProfileMatch[1]);
      }

      const boardReadMatch = pathname.match(/^\/rest\/dashboard\/board-read\/([^/]+)$/);
      if (boardReadMatch && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleBoardRead(context, runtimeEnv, boardReadMatch[1]);
      }

      const saveBoardMatch = pathname.match(/^\/rest\/dashboard\/saved-posts\/([^/]+)$/);
      if (saveBoardMatch && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleSaveBoard(context, runtimeEnv, saveBoardMatch[1]);
      }
      if (saveBoardMatch && request.method === 'DELETE') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleUnsaveBoard(context, runtimeEnv, saveBoardMatch[1]);
      }

      if (pathname === '/rest/alarm-log-top10' && request.method === 'GET') {
        return handleAlarmTop10(request, runtimeEnv);
      }

      if (pathname === '/rest/board-notice' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleBoardNotice(context, runtimeEnv);
      }

      if (pathname === '/rest/board' && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleCreateBoard(context, runtimeEnv, request);
      }

      if (pathname === '/rest/boards' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleBoardWorkspace(context, runtimeEnv, request);
      }

      const boardWorkspaceDetailMatch = pathname.match(/^\/rest\/boards\/([^/]+)$/);
      if (boardWorkspaceDetailMatch && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleBoardWorkspaceDetail(context, runtimeEnv, boardWorkspaceDetailMatch[1]);
      }

      const boardDetailMatch = pathname.match(/^\/rest\/board\/([^/]+)$/);
      if (boardDetailMatch && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleBoardDetail(context, runtimeEnv, boardDetailMatch[1]);
      }

      const boardCommentMatch = pathname.match(/^\/rest\/board-comment\/([^/]+)$/);
      if (boardCommentMatch && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleBoardComments(context, runtimeEnv, boardCommentMatch[1]);
      }
      if (boardCommentMatch && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleCreateBoardComment(context, runtimeEnv, boardCommentMatch[1], request);
      }

      const boardViewMatch = pathname.match(/^\/rest\/board-vct\/([^/]+)$/);
      if (boardViewMatch && request.method === 'PUT') {
        return handleNotImplementedOk(request, runtimeEnv);
      }

      if (pathname === '/rest/files' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleListFiles(context, runtimeEnv, request);
      }

      if (pathname === '/rest/files/register' && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleRegisterFiles(context, runtimeEnv, request);
      }

      if (pathname === '/chat/current-user' && request.method === 'GET') {
        return handleChatCurrentUser(request, runtimeEnv);
      }

      if (pathname === '/chat/users' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleChatUsers(context, runtimeEnv);
      }

      if (pathname === '/chat/panel' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleChatPanel(context, runtimeEnv);
      }

      if (pathname === '/chat/rooms' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleChatRooms(context, runtimeEnv);
      }

      if (pathname === '/chat/room/findOrCreate' && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleFindOrCreateRoom(context, runtimeEnv, String(url.searchParams.get('userId') || ''));
      }

      if (pathname === '/chat/room/create' && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleCreateRoom(context, runtimeEnv, request);
      }

      const markAsReadMatch = pathname.match(/^\/chat\/room\/markAsRead\/([^/]+)$/);
      if (markAsReadMatch && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleMarkAsRead(context, runtimeEnv, markAsReadMatch[1]);
      }

      const roomMessagesMatch = pathname.match(/^\/chat\/room\/([^/]+)\/messages$/);
      if (roomMessagesMatch && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleRoomMessages(context, runtimeEnv, roomMessagesMatch[1], request);
      }
      if (roomMessagesMatch && request.method === 'POST') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleSendMessage(context, runtimeEnv, roomMessagesMatch[1], request);
      }

      const roomDetailMatch = pathname.match(/^\/chat\/room\/([^/]+)$/);
      if (roomDetailMatch && request.method === 'GET') {
        const context = await requireWorkspaceContext(request, runtimeEnv);
        if (context.error) return context.error;
        return handleRoomDetail(context, runtimeEnv, roomDetailMatch[1]);
      }

      return error(`아직 구현되지 않은 경로입니다: ${pathname}`, { status: 501, origin });
    } catch (caughtError) {
      return error(toMessage(caughtError), {
        status: caughtError?.status || 500,
        origin,
      });
    }
  },
};
