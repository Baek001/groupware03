import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useAuth } from '../contexts/AuthContext';

export default function MainLayout() {
    const { user, loading, memberships } = useAuth();
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    if (location.pathname === '/messenger-popup') {
        return <div className="messenger-popup-shell"><Outlet /></div>;
    }

    if (loading && !user) {
        return (
            <div className="app-loading">
                <div className="app-loading-spinner" />
                <p>Loading...</p>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    if (location.pathname !== '/setup' && (!Array.isArray(memberships) || memberships.length === 0)) {
        return <Navigate to="/setup" replace />;
    }

    return (
        <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
            <Topbar />
            <main className="main-content">
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
