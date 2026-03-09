import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import MainLayout from './layouts/MainLayout';
import ComingSoonPage from './pages/ComingSoonPage';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const InvitationAcceptPage = lazy(() => import('./pages/InvitationAcceptPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WorkspaceSetupPage = lazy(() => import('./pages/WorkspaceSetupPage'));
const BoardListPage = lazy(() => import('./pages/board/BoardListPage'));
const MessengerPage = lazy(() => import('./pages/messenger/MessengerPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));

function RouteFallback() {
    return (
        <div className="app-loading">
            <div className="app-loading-spinner" />
            <p>화면을 불러오는 중입니다.</p>
        </div>
    );
}

function RoutedPage({ children }) {
    return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<RoutedPage><LoginPage /></RoutedPage>} />
                    <Route path="/signup" element={<RoutedPage><SignupPage /></RoutedPage>} />
                    <Route path="/invite/accept/:token" element={<RoutedPage><InvitationAcceptPage /></RoutedPage>} />
                    <Route element={<MainLayout />}>
                        <Route path="/" element={<RoutedPage><DashboardPage /></RoutedPage>} />
                        <Route path="/setup" element={<RoutedPage><WorkspaceSetupPage /></RoutedPage>} />
                        <Route path="/board" element={<RoutedPage><BoardListPage /></RoutedPage>} />
                        <Route path="/messenger" element={<RoutedPage><MessengerPage /></RoutedPage>} />
                        <Route path="/admin" element={<RoutedPage><AdminDashboardPage /></RoutedPage>} />
                        <Route path="/organization" element={<ComingSoonPage />} />
                        <Route path="/approval" element={<ComingSoonPage />} />
                        <Route path="/approval/contracts" element={<ComingSoonPage />} />
                        <Route path="/approval/contracts/templates/:templateId?" element={<ComingSoonPage />} />
                        <Route path="/attendance" element={<ComingSoonPage />} />
                        <Route path="/calendar" element={<ComingSoonPage />} />
                        <Route path="/community" element={<ComingSoonPage />} />
                        <Route path="/email" element={<ComingSoonPage />} />
                        <Route path="/project" element={<ComingSoonPage />} />
                        <Route path="/meeting" element={<ComingSoonPage />} />
                        <Route path="/mypage" element={<ComingSoonPage />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
