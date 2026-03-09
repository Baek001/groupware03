import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        if (!identifier.trim() || !password.trim()) {
            setError('이메일과 비밀번호를 입력해 주세요.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            await login(identifier, password);
            navigate('/', { replace: true });
        } catch (requestError) {
            setError(requestError.response?.data?.message || '로그인에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <div className="logo-mark">ER</div>
                    <h2>Edge Rewrite</h2>
                    <p>Supabase Auth와 Cloudflare Worker 기반으로 다시 구성하는 새 시작점입니다.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}
                    <div className="form-group">
                        <label className="form-label" htmlFor="identifier">이메일</label>
                        <input id="identifier" className="form-input" type="email" placeholder="name@company.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" autoFocus />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="password">비밀번호</label>
                        <input id="password" className="form-input" type="password" placeholder="비밀번호를 입력해 주세요." value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? '로그인 중...' : '로그인'}</button>
                </form>
                <div style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
                    계정 준비가 안 되어 있으면 <Link to="/signup">가입 안내</Link>
                </div>
            </div>
        </div>
    );
}
