import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { adminAPI } from '../../services/api';

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatPresence(member) {
    if (member.presence === 'online') return 'Online';
    if (member.presence === 'away') return 'Away';
    return member.lastSeenAt ? `Last seen ${formatDateTime(member.lastSeenAt)}` : 'No activity';
}

function badgeToneRole(role) {
    if (role === 'OWNER') return 'badge-blue';
    if (role === 'ADMIN') return 'badge-green';
    return 'badge-gray';
}

function badgeToneStatus(status) {
    return status === 'ACTIVE' ? 'badge-green' : 'badge-gray';
}

export default function AdminDashboardPage() {
    const navigate = useNavigate();
    const { currentTenant, user } = useAuth();
    const isAdmin = ['OWNER', 'ADMIN'].includes(String(currentTenant?.tenantRoleCd || '').toUpperCase());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [payload, setPayload] = useState({ workspace: null, summary: {}, members: [] });
    const [search, setSearch] = useState('');

    useEffect(() => {
        let active = true;

        async function loadDashboard() {
            if (!isAdmin) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError('');
            try {
                const response = await adminAPI.dashboard();
                if (!active) {
                    return;
                }
                setPayload(response.data || { workspace: null, summary: {}, members: [] });
            } catch (requestError) {
                if (!active) {
                    return;
                }
                setError(requestError.response?.data?.message || 'Failed to load admin dashboard.');
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        loadDashboard();
        return () => {
            active = false;
        };
    }, [isAdmin, currentTenant?.tenantId]);

    const filteredMembers = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) {
            return payload.members || [];
        }

        return (payload.members || []).filter((member) => (
            [member.name, member.email, member.department, member.jobTitle, member.role]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(keyword))
        ));
    }, [payload.members, search]);

    const summaryCards = [
        { label: 'Total members', value: payload.summary?.totalMembers || 0 },
        { label: 'Active members', value: payload.summary?.activeMembers || 0 },
        { label: 'Admins', value: payload.summary?.adminMembers || 0 },
        { label: 'Joined this week', value: payload.summary?.joinedThisWeek || 0 },
        { label: 'Pending invites', value: payload.summary?.pendingInviteCount || 0 },
        { label: 'Online now', value: payload.summary?.onlineMembers || 0 },
    ];

    if (!isAdmin) {
        return (
            <div className="page-shell" style={{ display: 'grid', gap: '20px' }}>
                <section className="card" style={{ padding: '28px', display: 'grid', gap: '12px' }}>
                    <span className="badge badge-gray">ADMIN</span>
                    <h2>Admin access required.</h2>
                    <p style={{ margin: 0, color: 'var(--gray-600)' }}>Only workspace OWNER or ADMIN members can open this page.</p>
                    <div><button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Back to dashboard</button></div>
                </section>
            </div>
        );
    }

    return (
        <div className="page-shell" style={{ display: 'grid', gap: '20px' }}>
            <section className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                        <span className="badge badge-blue">ADMIN</span>
                        <h2 style={{ marginTop: '12px' }}>Admin dashboard</h2>
                        <p style={{ marginTop: '8px', color: 'var(--gray-600)' }}>
                            Review workspace members, join dates, roles, and recent activity in one place.
                        </p>
                    </div>
                    <div style={{ minWidth: '220px', textAlign: 'right' }}>
                        <strong>{user?.userNm || 'Admin'}</strong>
                        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '8px' }}>
                            Current role: {currentTenant?.tenantRoleCd || 'ADMIN'}
                        </div>
                    </div>
                </div>
                {error && <div className="alert alert-error" style={{ marginTop: '16px' }}>{error}</div>}
            </section>

            <section className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    {summaryCards.map((item) => (
                        <div key={item.label} className="feed-card board-feed-card" style={{ minHeight: '120px' }}>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <span style={{ color: 'var(--gray-500)', fontSize: '13px' }}>{item.label}</span>
                                <strong style={{ fontSize: '28px' }}>{item.value}</strong>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="card" style={{ padding: '24px', display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ marginBottom: '8px' }}>Member directory</h3>
                        <p style={{ margin: 0, color: 'var(--gray-600)' }}>Search members by name, email, department, or role.</p>
                    </div>
                    <input
                        className="form-input"
                        style={{ minWidth: '260px' }}
                        type="text"
                        placeholder="Search members"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="feed-empty">Loading admin data...</div>
                ) : filteredMembers.length === 0 ? (
                    <div className="feed-empty">No matching members.</div>
                ) : (
                    <div style={{ display: 'grid', gap: '12px' }}>
                        {filteredMembers.map((member) => (
                            <article key={member.membershipId} className="feed-card board-feed-card" style={{ cursor: 'default' }}>
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <strong style={{ fontSize: '18px' }}>{member.name}</strong>
                                                {member.isCurrentUser && <span className="badge badge-blue">Me</span>}
                                                <span className={`badge ${badgeToneRole(member.role)}`}>{member.role}</span>
                                                <span className={`badge ${badgeToneStatus(member.membershipStatus)}`}>{member.membershipStatus}</span>
                                            </div>
                                            <span style={{ color: 'var(--gray-600)' }}>{member.email || '-'}</span>
                                        </div>
                                        <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--gray-500)' }}>
                                            <div>{formatPresence(member)}</div>
                                            <div style={{ marginTop: '6px' }}>Signed up {formatDateTime(member.signedUpAt)}</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                                        <div>
                                            <small style={{ color: 'var(--gray-500)' }}>Department</small>
                                            <div>{member.department || '-'}</div>
                                        </div>
                                        <div>
                                            <small style={{ color: 'var(--gray-500)' }}>Job title</small>
                                            <div>{member.jobTitle || '-'}</div>
                                        </div>
                                        <div>
                                            <small style={{ color: 'var(--gray-500)' }}>Phone</small>
                                            <div>{member.phone || '-'}</div>
                                        </div>
                                        <div>
                                            <small style={{ color: 'var(--gray-500)' }}>Joined workspace</small>
                                            <div>{formatDateTime(member.joinedAt)}</div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}