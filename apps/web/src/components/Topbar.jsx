import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { alarmAPI, messengerAPI } from '../services/api';

export default function Topbar() {
    const navigate = useNavigate();
    const { user, currentTenant, logout } = useAuth();
    const [alarmCount, setAlarmCount] = useState(0);
    const [messageCount, setMessageCount] = useState(0);
    const isAdmin = ['OWNER', 'ADMIN'].includes(String(currentTenant?.tenantRoleCd || '').toUpperCase());

    useEffect(() => {
        let active = true;

        async function loadSummary() {
            try {
                const [alarmResponse, panelResponse] = await Promise.all([
                    alarmAPI.top10().catch(() => ({ data: [] })),
                    messengerAPI.panel().catch(() => ({ data: { unreadMessageCount: 0 } })),
                ]);

                if (!active) {
                    return;
                }

                const alarms = Array.isArray(alarmResponse.data) ? alarmResponse.data : [];
                setAlarmCount(alarms.filter((item) => item?.readYn !== 'Y').length);
                setMessageCount(Number(panelResponse.data?.unreadMessageCount || 0));
            } catch {
                if (!active) {
                    return;
                }
                setAlarmCount(0);
                setMessageCount(0);
            }
        }

        if (user?.userId) {
            loadSummary();
        }

        return () => {
            active = false;
        };
    }, [user?.userId]);

    async function handleLogout() {
        await logout();
        navigate('/login', { replace: true });
    }

    return (
        <header className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
                <strong>{currentTenant?.tenantNm || 'Edge Workspace'}</strong>
                <div style={{ fontSize: '12px', opacity: 0.75 }}>
                    {user?.userNm || 'Guest'}
                    {currentTenant?.tenantRoleCd ? ` | ${currentTenant.tenantRoleCd}` : ''}
                </div>
            </div>
            <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={() => navigate('/')}>Dashboard</button>
                {isAdmin && <button type="button" className="btn btn-outline" onClick={() => navigate('/admin')}>Admin</button>}
                <button type="button" className="btn btn-outline" onClick={() => navigate('/messenger')}>Messenger {messageCount > 0 ? `(${messageCount})` : ''}</button>
                <button type="button" className="btn btn-outline" onClick={() => navigate('/mypage')}>Profile</button>
                <span className="badge badge-gray">Alerts {alarmCount}</span>
                <button type="button" className="btn btn-primary" onClick={handleLogout}>Logout</button>
            </div>
        </header>
    );
}