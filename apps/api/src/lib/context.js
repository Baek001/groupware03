import { buildSessionFromDatabase, requireUser } from './session.js';
import { getCachedSessionBundle, invalidateCachedSessionBundle, setCachedSessionBundle } from './cache.js';
import { error, json } from './http.js';
import { patchRows, rpc, selectRows } from './supabase.js';

export function profileSelect() {
  return 'id,email,display_name,avatar_url,phone,job_title,dept_name,status,current_workspace_id';
}

function createInFilter(values = []) {
  const cleaned = [...new Set((values || []).filter(Boolean))];
  if (cleaned.length === 0) {
    return '';
  }
  return `in.(${cleaned.join(',')})`;
}

export async function loadProfile(runtimeEnv, token, userId) {
  const rows = await selectRows(runtimeEnv, 'profiles', {
    token,
    params: {
      select: profileSelect(),
      id: `eq.${userId}`,
      limit: 1,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function loadMemberships(runtimeEnv, token, userId) {
  const rows = await selectRows(runtimeEnv, 'memberships', {
    token,
    params: {
      select: 'id,workspace_id,role,status,joined_at',
      user_id: `eq.${userId}`,
      status: 'eq.ACTIVE',
      order: 'joined_at.asc',
    },
  });
  return Array.isArray(rows) ? rows : [];
}

export async function loadWorkspaces(runtimeEnv, token, workspaceIds) {
  const query = createInFilter(workspaceIds);
  if (!query) {
    return [];
  }

  const rows = await selectRows(runtimeEnv, 'workspaces', {
    token,
    params: {
      select: 'id,slug,name,description,status,visibility,owner_user_id',
      id: query,
      order: 'created_at.asc',
    },
  });
  return Array.isArray(rows) ? rows : [];
}

export async function loadSessionBundle(runtimeEnv, auth, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cachedBundle = getCachedSessionBundle(auth.token);
    if (cachedBundle) {
      return cachedBundle;
    }
  }

  const profile = await loadProfile(runtimeEnv, auth.token, auth.user.id);
  const memberships = await loadMemberships(runtimeEnv, auth.token, auth.user.id);
  const workspaces = await loadWorkspaces(runtimeEnv, auth.token, memberships.map((item) => item.workspace_id));
  const bundle = { profile, memberships, workspaces };
  setCachedSessionBundle(auth.token, bundle);
  return bundle;
}

export function resolveCurrentWorkspaceId(session, profile, memberships) {
  return session?.currentTenant?.tenantId || profile?.current_workspace_id || memberships?.[0]?.workspace_id || '';
}

export function isAdminRole(role = '') {
  return ['OWNER', 'ADMIN'].includes(String(role || '').toUpperCase());
}

export function resolveCurrentMembership(session, workspaceId = '') {
  if (!session) {
    return null;
  }

  return session.memberships?.find((item) => item.tenantId === workspaceId)
    || session.currentTenant
    || null;
}

export async function requireWorkspaceContext(request, runtimeEnv) {
  const auth = await requireUser(request, runtimeEnv);
  if (auth.error) {
    return auth;
  }

  const bundle = await loadSessionBundle(runtimeEnv, auth);
  const session = buildSessionFromDatabase(auth.user, bundle.profile, bundle.memberships, bundle.workspaces);
  const workspaceId = resolveCurrentWorkspaceId(session, bundle.profile, bundle.memberships);

  if (!workspaceId) {
    return {
      error: error('Create a workspace first.', { status: 400, origin: auth.origin }),
    };
  }

  return {
    ...bundle,
    auth,
    session,
    workspaceId,
  };
}

export async function requireAdminWorkspaceContext(request, runtimeEnv) {
  const context = await requireWorkspaceContext(request, runtimeEnv);
  if (context.error) {
    return context;
  }

  const membership = resolveCurrentMembership(context.session, context.workspaceId);
  if (!isAdminRole(membership?.tenantRoleCd)) {
    return {
      error: error('Admin access required.', { status: 403, origin: context.auth.origin }),
    };
  }

  return context;
}

export async function handleSession(request, runtimeEnv) {
  const auth = await requireUser(request, runtimeEnv);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const { profile, memberships, workspaces } = await loadSessionBundle(runtimeEnv, auth);
  const session = buildSessionFromDatabase(auth.user, profile, memberships, workspaces, url.searchParams.get('tenantId') || '');
  return json(session, { origin: auth.origin });
}

export async function handleListWorkspaces(request, runtimeEnv) {
  const auth = await requireUser(request, runtimeEnv);
  if (auth.error) {
    return auth.error;
  }

  const { profile, memberships, workspaces } = await loadSessionBundle(runtimeEnv, auth);
  const currentWorkspaceId = profile?.current_workspace_id || memberships[0]?.workspace_id || '';
  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const items = memberships.map((membership) => {
    const workspace = workspaceMap.get(membership.workspace_id) || {};
    return {
      workspaceId: membership.workspace_id,
      workspaceName: workspace.name || '',
      workspaceSlug: workspace.slug || '',
      role: membership.role || 'MEMBER',
      current: membership.workspace_id === currentWorkspaceId,
    };
  });

  return json({ items }, { origin: auth.origin });
}

export async function handleCreateWorkspace(request, runtimeEnv) {
  const auth = await requireUser(request, runtimeEnv);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || body?.workspaceName || '').trim();
  const slug = String(body?.slug || body?.workspaceSlug || '').trim();

  if (!name) {
    return error('?????? ??? ??? ???.', { status: 400, origin: auth.origin });
  }

  const workspace = await rpc(runtimeEnv, 'create_workspace', {
    token: auth.token,
    body: {
      workspace_name: name,
      workspace_slug: slug || null,
    },
  });

  invalidateCachedSessionBundle(auth.token);
  const { profile, memberships, workspaces } = await loadSessionBundle(runtimeEnv, auth, { forceRefresh: true });
  const session = buildSessionFromDatabase(auth.user, profile, memberships, workspaces, workspace?.id || '');

  return json({ workspace, session }, { status: 201, origin: auth.origin });
}

export async function handleSwitchTenant(request, runtimeEnv) {
  const auth = await requireUser(request, runtimeEnv);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const tenantId = String(body?.tenantId || '');
  if (!tenantId) {
    return error('??????? ??? ???.', { status: 400, origin: auth.origin });
  }

  const { memberships } = await loadSessionBundle(runtimeEnv, auth);
  const canAccess = memberships.some((item) => item.workspace_id === tenantId);
  if (!canAccess) {
    return error('?????? ??? ????.', { status: 403, origin: auth.origin });
  }

  await patchRows(runtimeEnv, 'profiles', {
    token: auth.token,
    params: {
      id: `eq.${auth.user.id}`,
      select: profileSelect(),
    },
    body: {
      current_workspace_id: tenantId,
    },
  });

  invalidateCachedSessionBundle(auth.token);
  const { profile, memberships: nextMemberships, workspaces } = await loadSessionBundle(runtimeEnv, auth, { forceRefresh: true });
  const session = buildSessionFromDatabase(auth.user, profile, nextMemberships, workspaces, tenantId);
  return json(session, { origin: auth.origin });
}
