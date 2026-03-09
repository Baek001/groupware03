import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SignupPage() {
    const { signup } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(event) {
        event.preventDefault();

        if (!email.trim() || !password.trim()) {
            setError('이메일과 비밀번호를 입력해 주세요.');
            return;
        }
        if (password.length < 8) {
            setError('비밀번호는 8자 이상으로 입력해 주세요.');
            return;
        }
        if (password !== passwordConfirm) {
            setError('비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            await signup(email, password, {
                display_name: displayName.trim() || email.split('@')[0],
            });
            navigate('/setup', { replace: true });
        } catch (requestError) {
            setError(requestError.response?.data?.message || '가입에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <div className="logo-mark">ER</div>
                    <h2>이메일로 바로 가입</h2>
                    <p>지금은 이메일 인증 없이 계정을 만들고, 바로 워크스페이스 생성 단계로 넘어갑니다.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}
                    <div className="form-group">
                        <label className="form-label" htmlFor="displayName">이름(선택)</label>
                        <input id="displayName" className="form-input" type="text" placeholder="표시 이름" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="email">이메일</label>
                        <input id="email" className="form-input" type="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="password">비밀번호</label>
                        <input id="password" className="form-input" type="password" placeholder="8자 이상" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="passwordConfirm">비밀번호 확인</label>
                        <input id="passwordConfirm" className="form-input" type="password" placeholder="비밀번호를 다시 입력해 주세요." value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? '가입 중...' : '가입하고 시작하기'}</button>
                </form>
                <div style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
                    이미 계정이 있으면 <Link to="/login">로그인</Link>
                </div>
            </div>
        </div>
    );
}
