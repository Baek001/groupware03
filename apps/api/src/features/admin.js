import { json } from '../lib/http.js';
import { isAdminRole } from '../lib/context.js';
import { selectRows } from '../lib/supabase.js';

function createInFilter(values = []) {
  const cleaned = [...new Set((values || []).filter(Boolean))];
  if (cleaned.length === 0) {
    return '';
  }
  return `in.(${cleaned.join(',')})`;
}

function roleRank(role = '') {
  if (role === 'OWNER') return 3;
  if (role === 'ADMIN') return 2;
  return 1;
}

function profileSelect() {
  return 'id,email,display_name,avatar_url,phone,job_title,dept_name,status,current_workspace_id,created_at,updated_at';
}

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeMember(membership = {}, profile = {}, presence = {}, currentUserId = '') {
  return {
    membershipId: membership.id,
    userId: membership.user_id,
    name: profile.display_name || profile.email || '???',
    email: profile.email || '',
    phone: profile.phone || '',
    department: profile.dept_name || '',
    jobTitle: profile.job_title || '',
    role: membership.role || 'MEMBER',
    membershipStatus: membership.status || 'ACTIVE',
    profileStatus: profile.status || 'ACTIVE',
    joinedAt: toIsoOrNull(membership.joined_at || membership.created_at),
    signedUpAt: toIsoOrNull(profile.created_at),
    lastSeenAt: toIsoOrNull(presence.last_seen_at),
    presence: presence.presence || 'offline',
    currentWorkspaceId: profile.current_workspace_id || '',
    isCurrentUser: membership.user_id === currentUserId,
  };
}

function summarizeMembers(members = [], pendingInviteCount = 0) {
  const activeMembers = members.filter((member) => member.membershipStatus === 'ACTIVE');
  const adminMembers = activeMembers.filter((member) => isAdminRole(member.role));
  const ownerMembers = activeMembers.filter((member) => member.role === 'OWNER');
  const onlineMembers = activeMembers.filter((member) => member.presence === 'online');
  const recentThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const joinedThisWeek = activeMembers.filter((member) => member.joinedAt && new Date(member.joinedAt).getTime() >= recentThreshold).length;

  return {
    totalMembers: members.length,
    activeMembers: activeMembers.length,
    adminMembers: adminMembers.length,
    ownerMembers: ownerMembers.length,
    onlineMembers: onlineMembers.length,
    joinedThisWeek,
    pendingInviteCount,
  };
}

export async function handleAdminDashboard(context, runtimeEnv) {
  const membershipRowsRaw = await selectRows(runtimeEnv, 'memberships', {
    token: context.auth.token,
    params: {
      select: 'id,workspace_id,user_id,role,status,joined_at,created_at,updated_at',
      workspace_id: `eq.${context.workspaceId}`,
      order: 'joined_at.asc',
    },
  });

  const membershipRows = Array.isArray(membershipRowsRaw) ? membershipRowsRaw : [];
  const userFilter = createInFilter(membershipRows.map((membership) => membership.user_id));

  const [profilesRaw, presencesRaw, invitationsRaw] = await Promise.all([
    userFilter
      ? selectRows(runtimeEnv, 'profiles', {
          token: context.auth.token,
          params: {
            select: profileSelect(),
            id: userFilter,
          },
        })
      : Promise.resolve([]),
    userFilter
      ? selectRows(runtimeEnv, 'user_presence', {
          token: context.auth.token,
          params: {
            select: 'user_id,presence,last_seen_at',
            workspace_id: `eq.${context.workspaceId}`,
            user_id: userFilter,
          },
        })
      : Promise.resolve([]),
    selectRows(runtimeEnv, 'workspace_invitations', {
      token: context.auth.token,
      params: {
        select: 'id,status',
        workspace_id: `eq.${context.workspaceId}`,
        status: 'eq.PENDING',
      },
    }).catch(() => []),
  ]);

  const profileMap = new Map((Array.isArray(profilesRaw) ? profilesRaw : []).map((profile) => [profile.id, profile]));
  const presenceMap = new Map((Array.isArray(presencesRaw) ? presencesRaw : []).map((presence) => [presence.user_id, presence]));

  const members = membershipRows
    .map((membership) => normalizeMember(
      membership,
      profileMap.get(membership.user_id) || {},
      presenceMap.get(membership.user_id) || {},
      context.auth.user.id,
    ))
    .sort((left, right) => {
      const roleDiff = roleRank(right.role) - roleRank(left.role);
      if (roleDiff !== 0) {
        return roleDiff;
      }
      return new Date(right.joinedAt || 0).getTime() - new Date(left.joinedAt || 0).getTime();
    });

  const currentWorkspace = (context.workspaces || []).find((workspace) => workspace.id === context.workspaceId) || null;
  const pendingInviteCount = Array.isArray(invitationsRaw) ? invitationsRaw.length : 0;

  return json({
    workspace: currentWorkspace
      ? {
          workspaceId: currentWorkspace.id,
          workspaceName: currentWorkspace.name,
          workspaceSlug: currentWorkspace.slug,
          visibility: currentWorkspace.visibility,
          status: currentWorkspace.status,
        }
      : {
          workspaceId: context.workspaceId,
          workspaceName: context.session?.currentTenant?.tenantNm || 'Workspace',
          workspaceSlug: context.session?.currentTenant?.tenantSlug || '',
          visibility: 'OPEN',
          status: 'ACTIVE',
        },
    me: {
      userId: context.auth.user.id,
      role: context.session?.currentTenant?.tenantRoleCd || 'MEMBER',
    },
    summary: summarizeMembers(members, pendingInviteCount),
    members,
  }, { origin: context.auth.origin });
}
