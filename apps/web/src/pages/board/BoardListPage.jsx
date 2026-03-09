import { useCallback, useEffect, useMemo, useState } from 'react';
import { boardAPI } from '../../services/api';
import { uploadWorkspaceFiles, downloadWorkspaceFile } from '../../services/supabaseStorage';
import { useAuth } from '../../contexts/AuthContext';

const CATEGORY_OPTIONS = [
    { value: 'all', label: '전체' },
    { value: 'F101', label: '공지' },
    { value: 'F104', label: '사내소식' },
    { value: 'F102', label: '동호회' },
    { value: 'F103', label: '경조사' },
    { value: 'F105', label: '건의사항' },
    { value: 'F106', label: '기타' },
];

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function BoardListPage() {
    const { currentTenant } = useAuth();
    const [filters, setFilters] = useState({ category: 'all', q: '', page: 1 });
    const [searchInput, setSearchInput] = useState('');
    const [workspace, setWorkspace] = useState({ items: [], summary: {}, pinnedItems: [], page: 1, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [composerOpen, setComposerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [form, setForm] = useState({ bbsCtgrCd: 'F104', pstTtl: '', contents: '', fixedYn: 'N' });
    const [selectedFiles, setSelectedFiles] = useState([]);

    const summaryItems = useMemo(
        () => CATEGORY_OPTIONS.filter((item) => item.value !== 'all').map((item) => ({ ...item, count: Number(workspace.summary?.[item.value] || 0) })),
        [workspace.summary]
    );

    const loadBoards = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await boardAPI.workspace(filters);
            setWorkspace(response.data || { items: [], summary: {}, pinnedItems: [], page: 1, totalPages: 1 });
        } catch (requestError) {
            setError(requestError.response?.data?.message || '게시판 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadBoards();
    }, [loadBoards]);

    async function openDetail(pstId) {
        setDetailLoading(true);
        try {
            const response = await boardAPI.workspaceDetail(pstId);
            setDetail(response.data);
            setCommentDraft('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || '게시글 상세를 불러오지 못했습니다.');
        } finally {
            setDetailLoading(false);
        }
    }

    async function handleCreatePost(event) {
        event.preventDefault();
        if (!form.pstTtl.trim() || !form.contents.trim()) {
            setError('제목과 내용을 입력해 주세요.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const response = await boardAPI.create(form);
            const board = response.data?.board;
            if (board?.pstId && selectedFiles.length > 0 && currentTenant?.tenantId) {
                await uploadWorkspaceFiles({
                    workspaceId: currentTenant.tenantId,
                    ownerType: 'BOARD',
                    ownerId: board.pstId,
                    files: selectedFiles,
                });
            }
            setForm({ bbsCtgrCd: form.bbsCtgrCd, pstTtl: '', contents: '', fixedYn: 'N' });
            setSelectedFiles([]);
            setComposerOpen(false);
            await loadBoards();
        } catch (requestError) {
            setError(requestError.response?.data?.message || requestError.message || '게시글 등록에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateComment(event) {
        event.preventDefault();
        if (!detail?.board?.pstId || !commentDraft.trim()) {
            return;
        }
        try {
            await boardAPI.createComment(detail.board.pstId, { contents: commentDraft });
            const response = await boardAPI.workspaceDetail(detail.board.pstId);
            setDetail(response.data);
            setCommentDraft('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || '댓글을 저장하지 못했습니다.');
        }
    }

    return (
        <div className="page-shell" style={{ display: 'grid', gap: '20px' }}>
            <section className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                        <span className="badge badge-blue">BOARD</span>
                        <h2 style={{ marginTop: '12px' }}>워크스페이스 게시판</h2>
                        <p style={{ marginTop: '8px', color: 'var(--gray-600)' }}>공지, 사내소식, 일반 글을 빠르게 올리고 첨부파일까지 함께 관리합니다.</p>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => setComposerOpen((value) => !value)}>
                        {composerOpen ? '작성 닫기' : '새 글 작성'}
                    </button>
                </div>
                {error && <div className="alert alert-error" style={{ marginTop: '16px' }}>{error}</div>}
            </section>

            {composerOpen && (
                <section className="card" style={{ padding: '24px' }}>
                    <h3>게시글 작성</h3>
                    <form onSubmit={handleCreatePost} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                            <select className="form-input" value={form.bbsCtgrCd} onChange={(event) => setForm((current) => ({ ...current, bbsCtgrCd: event.target.value }))}>
                                {CATEGORY_OPTIONS.filter((item) => item.value !== 'all').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                            <label className="feed-checkbox feed-checkbox-card" style={{ alignItems: 'center' }}>
                                <input type="checkbox" checked={form.fixedYn === 'Y'} onChange={(event) => setForm((current) => ({ ...current, fixedYn: event.target.checked ? 'Y' : 'N' }))} />
                                상단 고정
                            </label>
                        </div>
                        <input className="form-input" type="text" placeholder="제목" value={form.pstTtl} onChange={(event) => setForm((current) => ({ ...current, pstTtl: event.target.value }))} />
                        <textarea className="form-input" rows="6" placeholder="내용" value={form.contents} onChange={(event) => setForm((current) => ({ ...current, contents: event.target.value }))} />
                        <input className="form-input" type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                        {selectedFiles.length > 0 && <small>{selectedFiles.map((file) => file.name).join(', ')}</small>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '저장 중...' : '게시하기'}</button>
                        </div>
                    </form>
                </section>
            )}

            <section className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    {summaryItems.map((item) => (
                        <button key={item.value} type="button" className={`feed-chip ${filters.category === item.value ? 'active' : ''}`} onClick={() => setFilters((current) => ({ ...current, category: item.value, page: 1 }))}>
                            {item.label} {item.count}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <input className="form-input" style={{ flex: 1, minWidth: '220px' }} type="text" placeholder="제목이나 내용을 검색" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
                    <button type="button" className="btn btn-outline" onClick={() => setFilters((current) => ({ ...current, q: searchInput.trim(), page: 1 }))}>검색</button>
                    <button type="button" className="btn btn-outline" onClick={() => { setSearchInput(''); setFilters({ category: 'all', q: '', page: 1 }); }}>초기화</button>
                </div>
            </section>

            <section className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gap: '12px' }}>
                    {(workspace.pinnedItems || []).length > 0 && (
                        <div>
                            <h3 style={{ marginBottom: '12px' }}>상단 고정</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {workspace.pinnedItems.map((item) => (
                                    <button key={`pin-${item.pstId}`} type="button" className="feed-widget-item" onClick={() => openDetail(item.pstId)}>
                                        <div className="feed-widget-item-main">
                                            <strong>[고정] {item.pstTtl}</strong>
                                            <span>{item.categoryLabel} · {item.userNm}</span>
                                        </div>
                                        <div className="feed-widget-item-meta"><small>{formatDateTime(item.frstCrtDt)}</small></div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <h3 style={{ marginTop: '8px' }}>전체 글</h3>
                    {loading ? (
                        <div className="feed-empty">불러오는 중...</div>
                    ) : workspace.items.length === 0 ? (
                        <div className="feed-empty">아직 등록된 게시글이 없습니다.</div>
                    ) : (
                        workspace.items.map((item) => (
                            <button key={item.pstId} type="button" className="feed-card board-feed-card" onClick={() => openDetail(item.pstId)}>
                                <div style={{ display: 'grid', gap: '8px', textAlign: 'left' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className="badge badge-gray">{item.categoryLabel}</span>
                                        {item.fixedYn === 'Y' && <span className="badge badge-blue">고정</span>}
                                        {item.readYn === 'N' && <span className="badge badge-green">새 글</span>}
                                    </div>
                                    <strong style={{ fontSize: '16px' }}>{item.pstTtl}</strong>
                                    <p style={{ margin: 0, color: 'var(--gray-600)' }}>{item.summary}</p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--gray-500)' }}>
                                        <span>{item.userNm} · {item.deptNm || '소속 없음'}</span>
                                        <span>댓글 {item.commentCount} · 첨부 {item.fileCount} · {formatDateTime(item.frstCrtDt)}</span>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </section>

            {detail && (
                <div className="modal-overlay" onClick={() => setDetail(null)}>
                    <div className="modal" style={{ maxWidth: '880px' }} onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{detail.board?.pstTtl}</h3>
                            <button type="button" className="btn btn-outline" onClick={() => setDetail(null)}>닫기</button>
                        </div>
                        <div className="modal-body" style={{ display: 'grid', gap: '20px' }}>
                            {detailLoading ? (
                                <div className="feed-empty">상세를 불러오는 중...</div>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        <div style={{ color: 'var(--gray-500)', fontSize: '13px' }}>{detail.board?.userNm} · {formatDateTime(detail.board?.frstCrtDt)}</div>
                                        <div className="newsfeed-detail-content" dangerouslySetInnerHTML={{ __html: detail.board?.contents || '' }} />
                                    </div>
                                    <section>
                                        <h4>첨부파일</h4>
                                        {(detail.attachments || []).length === 0 ? (
                                            <div className="feed-widget-empty">첨부파일이 없습니다.</div>
                                        ) : (
                                            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                                                {detail.attachments.map((file) => (
                                                    <button key={file.fileId} type="button" className="feed-inline-item" onClick={() => downloadWorkspaceFile(file)}>
                                                        <div>
                                                            <strong>{file.originalName}</strong>
                                                            <small>{Math.round((file.sizeBytes || 0) / 1024)} KB</small>
                                                        </div>
                                                        <span className="badge badge-gray">다운로드</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                    <section>
                                        <h4>댓글</h4>
                                        <form onSubmit={handleCreateComment} style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                                            <textarea className="form-input" rows="3" placeholder="댓글을 입력해 주세요." value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} />
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <button type="submit" className="btn btn-primary">댓글 등록</button>
                                            </div>
                                        </form>
                                        <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                                            {(detail.comments || []).length === 0 ? (
                                                <div className="feed-widget-empty">댓글이 없습니다.</div>
                                            ) : (
                                                detail.comments.map((comment) => (
                                                    <div key={comment.cmntSqn} className="newsfeed-comment">
                                                        <div className="newsfeed-comment-meta">
                                                            <strong>{comment.userNm}</strong>
                                                            <span>{formatDateTime(comment.frstCrtDt)}</span>
                                                        </div>
                                                        <p>{comment.contents}</p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </section>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
