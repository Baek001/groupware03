import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { workspaceAPI } from '../services/api';

export default function WorkspaceSetupPage() {
    const navigate = useNavigate();
    const { memberships, currentTenant, replaceSession, user } = useAuth();
    const [items, setItems] = useState([]);
    const [workspaceName, setWorkspaceName] = useState('');
    const [workspaceSlug, setWorkspaceSlug] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const hasWorkspace = useMemo(
        () => Array.isArray(memberships) && memberships.length > 0 && Boolean(currentTenant?.tenantId || memberships[0]?.tenantId),
        [currentTenant?.tenantId, memberships]
    );

    useEffect(() => {
        if (hasWorkspace) {
            navigate('/', { replace: true });
            return;
        }

        let active = true;
        async function load() {
            setLoading(true);
            try {
                const response = await workspaceAPI.list();
                if (!active) {
                    return;
                }
                setItems(Array.isArray(response.data?.items) ? response.data.items : []);
                setError('');
            } catch (requestError) {
                if (!active) {
                    return;
                }
                setError(requestError.response?.data?.message || '워크스페이스 목록을 불러오지 못했습니다.');
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        load();
        return () => {
            active = false;
        };
    }, [hasWorkspace, navigate]);

    async function handleCreateWorkspace(event) {
        event.preventDefault();
        if (!workspaceName.trim()) {
            setError('워크스페이스 이름을 입력해 주세요.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const response = await workspaceAPI.create({
                name: workspaceName,
                slug: workspaceSlug,
            });
            if (response.data?.session) {
                replaceSession(response.data.session, user?.userId || '');
            }
            navigate('/', { replace: true });
        } catch (requestError) {
            setError(requestError.response?.data?.message || '워크스페이스를 만들지 못했습니다.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="page-shell" style={{ maxWidth: '920px', margin: '0 auto', display: 'grid', gap: '20px' }}>
            <section className="card" style={{ padding: '24px' }}>
                <span className="badge badge-blue">STEP 1</span>
                <h2 style={{ marginTop: '12px' }}>첫 워크스페이스를 만들어 주세요</h2>
                <p style={{ marginTop: '8px', color: 'var(--gray-600)' }}>
                    계정 생성과 워크스페이스 생성을 분리했습니다. 먼저 워크스페이스를 하나 만들면 대시보드와 게시판, 메신저를 바로 사용할 수 있습니다.
                </p>
            </section>

            <section className="card" style={{ padding: '24px' }}>
                <h3>워크스페이스 만들기</h3>
                <form onSubmit={handleCreateWorkspace} style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                    <input className="form-input" type="text" placeholder="예: 모두의 러닝" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
                    <input className="form-input" type="text" placeholder="슬러그(선택) 예: modulearning" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} />
                    {error && <div className="alert alert-error">{error}</div>}
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '생성 중...' : '워크스페이스 만들기'}</button>
                        <button type="button" className="btn btn-outline" onClick={() => navigate('/login')}>다시 로그인</button>
                    </div>
                </form>
            </section>

            <section className="card" style={{ padding: '24px' }}>
                <h3>내가 이미 속한 워크스페이스</h3>
                {loading ? (
                    <p style={{ marginTop: '12px' }}>불러오는 중...</p>
                ) : items.length === 0 ? (
                    <p style={{ marginTop: '12px', color: 'var(--gray-600)' }}>아직 속한 워크스페이스가 없습니다.</p>
                ) : (
                    <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
                        {items.map((item) => (
                            <div key={item.workspaceId} className="feed-inline-item">
                                <div>
                                    <strong>{item.workspaceName}</strong>
                                    <small>{item.workspaceSlug ? `${item.workspaceSlug} · ` : ''}{item.role}</small>
                                </div>
                                {item.current && <span className="badge badge-green">현재 선택</span>}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
