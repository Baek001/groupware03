import { fileAPI } from './api';
import { getAccessToken } from './supabaseAuth';

function getConfig() {
    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
    return { supabaseUrl, anonKey };
}

function sanitizeFileName(name = '') {
    return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function encodeObjectPath(path = '') {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
}

async function uploadSingleFile({ workspaceId, ownerType, ownerId, bucketName, file }) {
    const { supabaseUrl, anonKey } = getConfig();
    const accessToken = getAccessToken();

    if (!supabaseUrl || !anonKey || !accessToken) {
        throw new Error('Supabase 업로드 설정이 없습니다.');
    }

    const objectPath = `${workspaceId}/${ownerType.toLowerCase()}/${ownerId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${encodeObjectPath(objectPath)}`, {
        method: 'POST',
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            'x-upsert': 'false',
            'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || `${file.name} 업로드에 실패했습니다.`);
    }

    return {
        ownerType,
        ownerId,
        bucketName,
        objectPath,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size || 0,
    };
}

export async function uploadWorkspaceFiles({ workspaceId, ownerType, ownerId, files = [] }) {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!workspaceId || !ownerType || !ownerId || selectedFiles.length === 0) {
        return [];
    }

    const bucketName = ownerType === 'CHAT_MESSAGE' ? 'chat-files' : 'workspace-files';
    const uploaded = [];
    for (const file of selectedFiles) {
        uploaded.push(await uploadSingleFile({ workspaceId, ownerType, ownerId, bucketName, file }));
    }

    const response = await fileAPI.register(uploaded);
    return Array.isArray(response.data) ? response.data : [];
}

export async function downloadWorkspaceFile(file) {
    const { supabaseUrl, anonKey } = getConfig();
    const accessToken = getAccessToken();
    if (!supabaseUrl || !anonKey || !accessToken || !file?.bucketName || !file?.objectPath) {
        throw new Error('다운로드 설정이 올바르지 않습니다.');
    }

    const response = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${file.bucketName}/${encodeObjectPath(file.objectPath)}`, {
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || '파일을 다운로드하지 못했습니다.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.originalName || 'download';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
