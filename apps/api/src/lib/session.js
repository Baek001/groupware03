import { corsHeaders } from './http.js';
import { fetchAuthUser } from './supabase.js';

function emptyMembership(user) {
  return {
    tenantId: '',
    tenantNm: '',
    tenantSlug: '',
    tenantRoleCd: 'MEMBER',
    userId: user.id,
    userEmail: user.email || '',
    deptNm: '',
  };
}

export function buildSessionFromDatabase(authUser, profile, memberships, workspaces, tenantId = '') {
  const workspaceMap = new Map((workspaces || []).map((workspace) => [workspace.id, workspace]));
  const normalizedMemberships = (memberships || []).map((membership) => {
    const workspace = workspaceMap.get(membership.workspace_id) || {};
    return {
      tenantId: membership.workspace_id,
      tenantNm: workspace.name || '',
      tenantSlug: workspace.slug || '',
      tenantRoleCd: membership.role || 'MEMBER',
      userId: authUser.id,
      userEmail: authUser.email || profile?.email || '',
      deptNm: profile?.dept_name || '',
    };
  });

  const targetTenantId = tenantId || profile?.current_workspace_id || '';
  const currentTenant = normalizedMemberships.find((item) => item.tenantId === targetTenantId)
    || normalizedMemberships[0]
    || emptyMembership(authUser);

  return {
    user: {
      userId: authUser.id,
      userNm: profile?.display_name || authUser?.user_metadata?.userNm || authUser.email || 'Workspace user',
      deptNm: profile?.dept_name || '',
      jbgdNm: profile?.job_title || '',
      userEmail: profile?.email || authUser.email || '',
      hireYmd: authUser?.user_metadata?.hireYmd || '',
      userRole: currentTenant.tenantRoleCd || 'MEMBER',
      workSttsCd: profile?.status === 'ACTIVE' ? 'W101' : 'W999',
      extTel: authUser?.user_metadata?.extTel || '',
      tenantId: currentTenant.tenantId,
      tenantNm: currentTenant.tenantNm,
      tenantSlug: currentTenant.tenantSlug,
      tenantRoleCd: currentTenant.tenantRoleCd,
    },
    currentTenant,
    memberships: normalizedMemberships,
  };
}

export async function requireUser(request, env) {
  const origin = request.headers.get('Origin') || env.appBaseUrl;
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return {
      error: new Response(JSON.stringify({ message: '인증 토큰이 없습니다.' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders(origin),
        },
      }),
    };
  }

  try {
    const user = await fetchAuthUser(env, match[1]);
    return { user, token: match[1], origin };
  } catch {
    return {
      error: new Response(JSON.stringify({ message: '세션이 만료되었습니다.' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders(origin),
        },
      }),
    };
  }
}
