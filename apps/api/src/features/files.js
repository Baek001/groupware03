import { error, json } from '../lib/http.js';
import { insertRows, selectRows } from '../lib/supabase.js';

function normalizeFile(row = {}) {
  return {
    fileId: row.id,
    ownerType: row.owner_type || '',
    ownerId: row.owner_id || '',
    bucketName: row.bucket_name || '',
    objectPath: row.object_path || '',
    originalName: row.original_name || '',
    mimeType: row.mime_type || '',
    sizeBytes: Number(row.size_bytes || 0),
    createdAt: row.created_at || null,
  };
}

export async function listFilesByOwner(runtimeEnv, token, ownerType, ownerId) {
  if (!ownerType || !ownerId) {
    return [];
  }

  const rows = await selectRows(runtimeEnv, 'files', {
    token,
    params: {
      select: 'id,owner_type,owner_id,bucket_name,object_path,original_name,mime_type,size_bytes,created_at',
      owner_type: `eq.${ownerType}`,
      owner_id: `eq.${ownerId}`,
      order: 'created_at.asc',
    },
  });

  return (Array.isArray(rows) ? rows : []).map(normalizeFile);
}

export async function handleRegisterFiles(context, runtimeEnv, request) {
  const body = await request.json().catch(() => ({}));
  const files = Array.isArray(body?.files) ? body.files : [];

  const payload = files
    .map((item) => ({
      workspace_id: context.workspaceId,
      uploader_user_id: context.auth.user.id,
      owner_type: String(item?.ownerType || '').trim(),
      owner_id: item?.ownerId || null,
      bucket_name: String(item?.bucketName || '').trim(),
      object_path: String(item?.objectPath || '').trim(),
      original_name: String(item?.originalName || '').trim(),
      mime_type: String(item?.mimeType || '').trim() || null,
      size_bytes: Number(item?.sizeBytes || 0),
    }))
    .filter((item) => item.owner_type && item.bucket_name && item.object_path && item.original_name);

  if (payload.length === 0) {
    return error('등록할 파일 정보가 없습니다.', { status: 400, origin: context.auth.origin });
  }

  const rows = await insertRows(runtimeEnv, 'files', {
    token: context.auth.token,
    body: payload,
  });

  return json((Array.isArray(rows) ? rows : []).map(normalizeFile), {
    status: 201,
    origin: context.auth.origin,
  });
}

export async function handleListFiles(context, runtimeEnv, request) {
  const url = new URL(request.url);
  const ownerType = String(url.searchParams.get('ownerType') || '');
  const ownerId = String(url.searchParams.get('ownerId') || '');
  const items = await listFilesByOwner(runtimeEnv, context.auth.token, ownerType, ownerId);
  return json(items, { origin: context.auth.origin });
}
