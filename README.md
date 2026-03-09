# Edge Rewrite

기존 서비스와 충돌하지 않도록 별도 폴더에서 진행하는 `Cloudflare + Supabase` 전용 리라이트 작업공간입니다.

## 원칙

- 기존 `frontend`, `backend`, `cloudflare` 폴더는 수정하지 않습니다.
- 이 폴더는 병행 개발용입니다.
- 시작점은 기존 React UI를 복사해서 재사용하되, 느렸던 Spring/Container 결합부는 새 API 계층으로 교체합니다.

## 현재 구성

- `apps/web`
  - 기존 프론트를 복사한 새 웹 앱
  - API/웹소켓 주소를 환경변수로 분리
  - 인증은 Supabase 토큰 기반으로 전환 시작
- `apps/api`
  - Cloudflare Worker 기반 API 골격
  - 세션/대시보드/공지/메신저의 최소 응답 shape 제공

## 1차 목표

1. 로그인과 세션 복구를 Supabase Auth 기반으로 전환
2. 대시보드가 빈 상태라도 빠르게 렌더링되도록 최소 응답 제공
3. 메신저/알림의 초기 진입을 비동기 빈 상태로 열 수 있게 정리
4. 이후 기능별로 Supabase 테이블과 Worker 라우트를 채워 넣기
