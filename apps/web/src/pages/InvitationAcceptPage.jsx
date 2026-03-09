import { Link, useParams } from 'react-router-dom';

export default function InvitationAcceptPage() {
    const { token } = useParams();

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <div className="logo-mark">ER</div>
                    <h2>초대 링크 준비 중</h2>
                    <p>이 화면은 Supabase 멤버십 초대 흐름으로 다시 연결할 예정입니다.</p>
                </div>
                <div className="feed-widget-card">
                    <p>현재 받은 토큰: <code>{token || '없음'}</code></p>
                    <Link className="btn btn-primary" to="/login">로그인으로 이동</Link>
                </div>
            </div>
        </div>
    );
}
