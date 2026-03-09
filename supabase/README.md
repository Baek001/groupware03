# Supabase Setup

`edge-rewrite`는 기존 기능을 `Cloudflare + Supabase` 구조로 옮기기 위한 별도 작업공간입니다.

## 1차 범위

- 이메일/비밀번호 가입
- 워크스페이스 생성 및 멀티 워크스페이스 소속
- 대시보드
- 게시판 / 공지
- 메신저
- 파일 메타데이터

## 먼저 해야 할 설정

### Auth

- `Authentication > Providers > Email`
- 이메일 회원가입 활성화
- 이메일 확인은 일단 비활성화

즉, 가입 후 바로 로그인 가능한 상태로 시작합니다.

### SQL 적용

순서:

1. `migrations/0001_initial_core.sql`
2. `seed/0001_reference_data.sql`

## 현재 설계 원칙

- 사용자 원본은 `auth.users`
- 앱용 사용자 정보는 `public.profiles`
- 회사/조직 단위는 `public.workspaces`
- 사용자-워크스페이스 연결은 `public.memberships`
- 회사 간 분리는 RLS로 강제
- 한 사용자는 여러 워크스페이스에 속할 수 있음
- 공지는 일반 게시글과 같은 `boards` 테이블에서 `board_kind = 'NOTICE'`로 구분
- 채팅 읽음 상태는 `chat_members.last_read_message_id`, `last_read_at`로 관리

## 다음 구현 순서

1. Worker에서 `profiles / workspaces / memberships` 실제 조회
2. 가입 후 `워크스페이스 만들기 / 초대 참여` 플로우 연결
3. 게시판 / 공지 API 연결
4. 메신저 실시간 연결
