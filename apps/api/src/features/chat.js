import { error, json } from '../lib/http.js';
import { insertRows, patchRows, selectRows } from '../lib/supabase.js';
import { listFilesByOwner } from './files.js';

function createInFilter(values = []) {
  const cleaned = [...new Set((values || []).filter(Boolean))];
  if (cleaned.length === 0) {
    return '';
  }
  return `in.(${cleaned.join(',')})`;
}

function roomMemberSelect() {
  return 'room_id,user_id,role,notify_enabled,last_read_message_id,last_read_at,profile:profiles!chat_members_user_id_fkey(id,display_name,dept_name,job_title,email)';
}

function roomBaseSelect() {
  return 'room_id,role,notify_enabled,last_read_message_id,last_read_at,room:chat_rooms!inner(id,workspace_id,room_type,name,last_message_at,created_by_user_id,created_at,updated_at)';
}

function messageBaseSelect() {
  return 'id,room_id,workspace_id,sender_user_id,message_type,body,metadata,created_at,sender:profiles!chat_messages_sender_user_id_fkey(id,display_name,dept_name,job_title,email)';
}

function roomDisplayName(room = {}, members = [], currentUserId = '') {
  if (room.name) {
    return room.name;
  }
  const otherNames = members
    .filter((member) => member.user_id !== currentUserId)
    .map((member) => member.profile?.display_name || member.profile?.email || '사용자');
  if (otherNames.length === 0) {
    return '나와의 대화';
  }
  return otherNames.join(', ');
}

function normalizeParticipant(member = {}) {
  return {
    userId: member.user_id,
    userNm: member.profile?.display_name || member.profile?.email || '사용자',
    deptNm: member.profile?.dept_name || '',
    jbgdNm: member.profile?.job_title || '',
    userEmail: member.profile?.email || '',
    role: member.role || 'MEMBER',
    notifyEnabled: member.notify_enabled !== false,
    lastReadAt: member.last_read_at || null,
  };
}

function normalizeRoom(room = {}, members = [], currentUserId = '', unreadCount = 0, lastMessage = null) {
  const currentMember = members.find((member) => member.user_id === currentUserId);
  return {
    msgrId: room.id,
    msgrNm: roomDisplayName(room, members, currentUserId),
    roomType: room.room_type || 'group',
    createdAt: room.created_at,
    lastMessageAt: room.last_message_at || lastMessage?.created_at || room.created_at,
    lastMessagePreview: lastMessage?.body || (lastMessage?.message_type === 'file' ? '파일을 보냈습니다.' : ''),
    unreadCount,
    participantCount: members.length,
    participants: members.map(normalizeParticipant),
    notifyEnabled: currentMember?.notify_enabled !== false,
    currentUserRole: currentMember?.role || 'MEMBER',
  };
}

function normalizeMessage(message = {}, currentUserId = '', readCount = 0, files = []) {
  return {
    msgContId: message.id,
    msgrId: message.room_id,
    contents: message.body || '',
    msgType: message.message_type || 'text',
    sendDt: message.created_at,
    senderUserId: message.sender_user_id,
    senderUserNm: message.sender?.display_name || message.sender?.email || '사용자',
    mine: message.sender_user_id === currentUserId,
    readCount,
    files,
  };
}

async function loadRoomBaseRows(runtimeEnv, token, workspaceId, userId) {
  const rows = await selectRows(runtimeEnv, 'chat_members', {
    token,
    params: {
      select: roomBaseSelect(),
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function loadRoomMembers(runtimeEnv, token, roomIds = []) {
  const roomFilter = createInFilter(roomIds);
  if (!roomFilter) {
    return [];
  }

  const rows = await selectRows(runtimeEnv, 'chat_members', {
    token,
    params: {
      select: roomMemberSelect(),
      room_id: roomFilter,
      order: 'joined_at.asc',
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function loadRecentMessages(runtimeEnv, token, roomIds = [], limit = 200) {
  const roomFilter = createInFilter(roomIds);
  if (!roomFilter) {
    return [];
  }

  const rows = await selectRows(runtimeEnv, 'chat_messages', {
    token,
    params: {
      select: messageBaseSelect(),
      room_id: roomFilter,
      deleted_at: 'is.null',
      order: 'created_at.desc',
      limit,
    },
  });
  return Array.isArray(rows) ? rows : [];
}

function buildRoomBundle(baseRows = [], memberRows = [], messageRows = [], currentUserId = '') {
  const membersByRoom = new Map();
  memberRows.forEach((member) => {
    if (!membersByRoom.has(member.room_id)) {
      membersByRoom.set(member.room_id, []);
    }
    membersByRoom.get(member.room_id).push(member);
  });

  const messageByRoom = new Map();
  messageRows.forEach((message) => {
    if (!messageByRoom.has(message.room_id)) {
      messageByRoom.set(message.room_id, []);
    }
    messageByRoom.get(message.room_id).push(message);
  });

  return baseRows.map((base) => {
    const room = base.room || {};
    const members = membersByRoom.get(base.room_id) || [];
    const messages = messageByRoom.get(base.room_id) || [];
    const lastMessage = messages[0] || null;
    const unreadCount = messages.filter((message) => (
      message.sender_user_id !== currentUserId
      && (!base.last_read_at || new Date(message.created_at).getTime() > new Date(base.last_read_at).getTime())
    )).length;

    return normalizeRoom(room, members, currentUserId, unreadCount, lastMessage);
  }).sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
}

async function ensureRoomAccess(runtimeEnv, token, roomId, currentUserId) {
  const rows = await selectRows(runtimeEnv, 'chat_members', {
    token,
    params: {
      select: roomBaseSelect(),
      room_id: `eq.${roomId}`,
      user_id: `eq.${currentUserId}`,
      limit: 1,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function loadRoomParticipants(runtimeEnv, token, roomId) {
  const rows = await selectRows(runtimeEnv, 'chat_members', {
    token,
    params: {
      select: roomMemberSelect(),
      room_id: `eq.${roomId}`,
      order: 'joined_at.asc',
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function loadMessageFiles(runtimeEnv, token, messageIds = []) {
  const map = new Map();
  await Promise.all((messageIds || []).map(async (messageId) => {
    map.set(messageId, await listFilesByOwner(runtimeEnv, token, 'CHAT_MESSAGE', messageId));
  }));
  return map;
}

export async function handleChatUsers(context, runtimeEnv) {
  const rows = await selectRows(runtimeEnv, 'memberships', {
    token: context.auth.token,
    params: {
      select: 'user_id,role,profile:profiles!memberships_user_id_fkey(id,display_name,dept_name,job_title,email)',
      workspace_id: `eq.${context.workspaceId}`,
      status: 'eq.ACTIVE',
      order: 'joined_at.asc',
    },
  });

  const items = (Array.isArray(rows) ? rows : [])
    .filter((item) => item.user_id !== context.auth.user.id)
    .map((item) => ({
      userId: item.user_id,
      userNm: item.profile?.display_name || item.profile?.email || '사용자',
      deptNm: item.profile?.dept_name || '',
      jbgdNm: item.profile?.job_title || '',
      userEmail: item.profile?.email || '',
      tenantRoleCd: item.role || 'MEMBER',
    }));

  return json(items, { origin: context.auth.origin });
}

export async function handleChatPanel(context, runtimeEnv) {
  const baseRows = await loadRoomBaseRows(runtimeEnv, context.auth.token, context.workspaceId, context.auth.user.id);
  const roomIds = baseRows.map((row) => row.room_id);
  const [memberRows, messageRows] = await Promise.all([
    loadRoomMembers(runtimeEnv, context.auth.token, roomIds),
    loadRecentMessages(runtimeEnv, context.auth.token, roomIds),
  ]);
  const rooms = buildRoomBundle(baseRows, memberRows, messageRows, context.auth.user.id);
  return json({
    rooms: rooms.slice(0, 5),
    unreadRoomCount: rooms.filter((room) => room.unreadCount > 0).length,
    unreadMessageCount: rooms.reduce((sum, room) => sum + room.unreadCount, 0),
  }, { origin: context.auth.origin });
}

export async function handleChatRooms(context, runtimeEnv) {
  const baseRows = await loadRoomBaseRows(runtimeEnv, context.auth.token, context.workspaceId, context.auth.user.id);
  const roomIds = baseRows.map((row) => row.room_id);
  const [memberRows, messageRows] = await Promise.all([
    loadRoomMembers(runtimeEnv, context.auth.token, roomIds),
    loadRecentMessages(runtimeEnv, context.auth.token, roomIds),
  ]);
  return json(buildRoomBundle(baseRows, memberRows, messageRows, context.auth.user.id), { origin: context.auth.origin });
}

export async function handleFindOrCreateRoom(context, runtimeEnv, targetUserId) {
  if (!targetUserId || targetUserId === context.auth.user.id) {
    return error('대상 사용자를 선택해 주세요.', { status: 400, origin: context.auth.origin });
  }

  const baseRows = await loadRoomBaseRows(runtimeEnv, context.auth.token, context.workspaceId, context.auth.user.id);
  const candidateRows = baseRows.filter((row) => row.room?.room_type === 'private');
  const roomIds = candidateRows.map((row) => row.room_id);
  const memberRows = await loadRoomMembers(runtimeEnv, context.auth.token, roomIds);

  const membersByRoom = new Map();
  memberRows.forEach((member) => {
    if (!membersByRoom.has(member.room_id)) {
      membersByRoom.set(member.room_id, []);
    }
    membersByRoom.get(member.room_id).push(member.user_id);
  });

  const room = candidateRows.find((row) => {
    const members = [...new Set(membersByRoom.get(row.room_id) || [])].sort();
    return members.length === 2 && members[0] === [context.auth.user.id, targetUserId].sort()[0] && members[1] === [context.auth.user.id, targetUserId].sort()[1];
  });

  if (room?.room?.id) {
    return json({ msgrId: room.room.id }, { origin: context.auth.origin });
  }

  const createdRooms = await insertRows(runtimeEnv, 'chat_rooms', {
    token: context.auth.token,
    body: {
      workspace_id: context.workspaceId,
      room_type: 'private',
      name: null,
      created_by_user_id: context.auth.user.id,
      last_message_at: new Date().toISOString(),
    },
  });
  const createdRoom = Array.isArray(createdRooms) ? createdRooms[0] : createdRooms;

  await insertRows(runtimeEnv, 'chat_members', {
    token: context.auth.token,
    body: [
      {
        room_id: createdRoom.id,
        workspace_id: context.workspaceId,
        user_id: context.auth.user.id,
        role: 'OWNER',
      },
      {
        room_id: createdRoom.id,
        workspace_id: context.workspaceId,
        user_id: targetUserId,
        role: 'MEMBER',
      },
    ],
  });

  return json({ msgrId: createdRoom.id }, { status: 201, origin: context.auth.origin });
}

export async function handleCreateRoom(context, runtimeEnv, request) {
  const body = await request.json().catch(() => ({}));
  const userIds = [...new Set((Array.isArray(body?.userIds) ? body.userIds : []).filter(Boolean).concat(context.auth.user.id))];
  const roomName = String(body?.msgrNm || body?.name || '').trim() || null;

  if (userIds.length < 2) {
    return error('그룹 채팅은 최소 2명 이상이 필요합니다.', { status: 400, origin: context.auth.origin });
  }

  const createdRooms = await insertRows(runtimeEnv, 'chat_rooms', {
    token: context.auth.token,
    body: {
      workspace_id: context.workspaceId,
      room_type: userIds.length === 2 ? 'private' : 'group',
      name: roomName,
      created_by_user_id: context.auth.user.id,
      last_message_at: new Date().toISOString(),
    },
  });
  const room = Array.isArray(createdRooms) ? createdRooms[0] : createdRooms;

  await insertRows(runtimeEnv, 'chat_members', {
    token: context.auth.token,
    body: userIds.map((userId) => ({
      room_id: room.id,
      workspace_id: context.workspaceId,
      user_id: userId,
      role: userId === context.auth.user.id ? 'OWNER' : 'MEMBER',
    })),
  });

  return json({ msgrId: room.id }, { status: 201, origin: context.auth.origin });
}

export async function handleRoomDetail(context, runtimeEnv, roomId) {
  const membership = await ensureRoomAccess(runtimeEnv, context.auth.token, roomId, context.auth.user.id);
  if (!membership?.room?.id) {
    return error('채팅방 권한이 없습니다.', { status: 403, origin: context.auth.origin });
  }

  const participants = await loadRoomParticipants(runtimeEnv, context.auth.token, roomId);
  return json({
    room: normalizeRoom(membership.room, participants, context.auth.user.id, 0, null),
    participants: participants.map(normalizeParticipant),
    pinnedMessage: null,
    notifyEnabled: membership.notify_enabled !== false,
    currentUserRole: membership.role || 'MEMBER',
  }, { origin: context.auth.origin });
}

export async function handleRoomMessages(context, runtimeEnv, roomId, request) {
  const membership = await ensureRoomAccess(runtimeEnv, context.auth.token, roomId, context.auth.user.id);
  if (!membership?.room?.id) {
    return error('채팅방 권한이 없습니다.', { status: 403, origin: context.auth.origin });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit') || '50')));
  const beforeSendDt = String(url.searchParams.get('beforeSendDt') || '');

  const params = {
    select: messageBaseSelect(),
    room_id: `eq.${roomId}`,
    deleted_at: 'is.null',
    order: 'created_at.desc',
    limit,
  };
  if (beforeSendDt) {
    params.created_at = `lt.${beforeSendDt}`;
  }

  const rows = await selectRows(runtimeEnv, 'chat_messages', {
    token: context.auth.token,
    params,
  });
  const messages = (Array.isArray(rows) ? rows : []).reverse();
  const participants = await loadRoomParticipants(runtimeEnv, context.auth.token, roomId);
  const filesByMessage = await loadMessageFiles(runtimeEnv, context.auth.token, messages.map((message) => message.id));

  const items = messages.map((message) => {
    const readCount = participants.filter((member) => (
      member.user_id !== message.sender_user_id
      && member.last_read_at
      && new Date(member.last_read_at).getTime() >= new Date(message.created_at).getTime()
    )).length;

    return normalizeMessage(message, context.auth.user.id, readCount, filesByMessage.get(message.id) || []);
  });

  return json({
    items,
    hasMore: messages.length === limit,
    nextBeforeSendAt: items[0]?.sendDt || null,
    nextBeforeMsgContId: items[0]?.msgContId || null,
  }, { origin: context.auth.origin });
}

export async function handleSendMessage(context, runtimeEnv, roomId, request) {
  const membership = await ensureRoomAccess(runtimeEnv, context.auth.token, roomId, context.auth.user.id);
  if (!membership?.room?.id) {
    return error('채팅방 권한이 없습니다.', { status: 403, origin: context.auth.origin });
  }

  const body = await request.json().catch(() => ({}));
  const contents = String(body?.contents || body?.body || '').trim();
  const fileIds = Array.isArray(body?.fileIds) ? body.fileIds.filter(Boolean) : [];
  const messageId = String(body?.messageId || '').trim() || crypto.randomUUID();

  if (!contents && fileIds.length === 0) {
    return error('메시지 내용이나 첨부파일이 필요합니다.', { status: 400, origin: context.auth.origin });
  }

  const createdRows = await insertRows(runtimeEnv, 'chat_messages', {
    token: context.auth.token,
    body: {
      id: messageId,
      room_id: roomId,
      workspace_id: context.workspaceId,
      sender_user_id: context.auth.user.id,
      message_type: fileIds.length > 0 && !contents ? 'file' : 'text',
      body: contents || '',
      metadata: { fileCount: fileIds.length },
    },
  });
  const createdMessage = Array.isArray(createdRows) ? createdRows[0] : createdRows;

  if (fileIds.length > 0) {
    await insertRows(runtimeEnv, 'chat_message_files', {
      token: context.auth.token,
      body: fileIds.map((fileId) => ({ message_id: messageId, file_id: fileId })),
    });
  }

  await patchRows(runtimeEnv, 'chat_rooms', {
    token: context.auth.token,
    params: {
      id: `eq.${roomId}`,
      select: 'id,last_message_at',
    },
    body: {
      last_message_at: createdMessage.created_at || new Date().toISOString(),
    },
  });

  const files = await listFilesByOwner(runtimeEnv, context.auth.token, 'CHAT_MESSAGE', messageId);
  return json(normalizeMessage({
    ...createdMessage,
    sender: {
      display_name: context.profile?.display_name || context.auth.user.email,
      email: context.profile?.email || context.auth.user.email || '',
    },
  }, context.auth.user.id, 0, files), { status: 201, origin: context.auth.origin });
}

export async function handleMarkAsRead(context, runtimeEnv, roomId) {
  const membership = await ensureRoomAccess(runtimeEnv, context.auth.token, roomId, context.auth.user.id);
  if (!membership?.room?.id) {
    return error('채팅방 권한이 없습니다.', { status: 403, origin: context.auth.origin });
  }

  const latest = await selectRows(runtimeEnv, 'chat_messages', {
    token: context.auth.token,
    params: {
      select: 'id,created_at',
      room_id: `eq.${roomId}`,
      deleted_at: 'is.null',
      order: 'created_at.desc',
      limit: 1,
    },
  });
  const latestMessage = Array.isArray(latest) ? latest[0] || null : null;

  await patchRows(runtimeEnv, 'chat_members', {
    token: context.auth.token,
    params: {
      room_id: `eq.${roomId}`,
      user_id: `eq.${context.auth.user.id}`,
      select: 'room_id,user_id,last_read_at',
    },
    body: {
      last_read_message_id: latestMessage?.id || null,
      last_read_at: latestMessage?.created_at || new Date().toISOString(),
    },
  });

  return json({ ok: true }, { origin: context.auth.origin });
}
