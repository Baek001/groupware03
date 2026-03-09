create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    avatar_url
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), 'user'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text not null,
  avatar_url text,
  phone text,
  job_title text,
  dept_name text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  current_workspace_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  visibility text not null default 'OPEN' check (visibility in ('OPEN', 'INVITE_ONLY', 'PRIVATE')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  add constraint profiles_current_workspace_fk
  foreign key (current_workspace_id)
  references public.workspaces(id)
  on delete set null;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PENDING', 'INVITED', 'LEFT')),
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, user_id)
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  email citext not null,
  role text not null default 'MEMBER' check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  token text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED')),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.board_categories (
  code text primary key,
  label text not null,
  sort_order integer not null default 100
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  category_code text not null references public.board_categories(code),
  board_kind text not null default 'POST' check (board_kind in ('POST', 'NOTICE')),
  title text not null,
  body text not null,
  excerpt text,
  is_pinned boolean not null default false,
  allow_comments boolean not null default true,
  published_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  parent_comment_id uuid references public.board_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.board_reads (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_read_at timestamptz not null default timezone('utc', now()),
  last_read_at timestamptz not null default timezone('utc', now()),
  primary key (board_id, user_id)
);

create table if not exists public.board_saves (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (board_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  target_type text,
  target_id uuid,
  route text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploader_user_id uuid not null references public.profiles(id) on delete restrict,
  owner_type text not null,
  owner_id uuid,
  bucket_name text not null,
  object_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_type text not null default 'group' check (room_type in ('private', 'group', 'self', 'community')),
  name text,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER', 'MEMBER')),
  notify_enabled boolean not null default true,
  joined_at timestamptz not null default timezone('utc', now()),
  last_read_message_id uuid,
  last_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (room_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  message_type text not null default 'text' check (message_type in ('text', 'system', 'file')),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

alter table public.chat_members
  add constraint chat_members_last_read_message_fk
  foreign key (last_read_message_id)
  references public.chat_messages(id)
  on delete set null;

create table if not exists public.chat_message_files (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (message_id, file_id)
);

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  presence text not null default 'offline' check (presence in ('online', 'away', 'offline')),
  last_seen_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_memberships_user_active
  on public.memberships (user_id, status, workspace_id);

create index if not exists idx_memberships_workspace_active
  on public.memberships (workspace_id, status, user_id);

create index if not exists idx_boards_workspace_published
  on public.boards (workspace_id, published_at desc)
  where deleted_at is null;

create index if not exists idx_boards_workspace_kind_published
  on public.boards (workspace_id, board_kind, published_at desc)
  where deleted_at is null;

create index if not exists idx_board_comments_board_created
  on public.board_comments (board_id, created_at asc)
  where deleted_at is null;

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists idx_chat_rooms_workspace_last_message
  on public.chat_rooms (workspace_id, last_message_at desc nulls last, created_at desc);

create index if not exists idx_chat_members_user_workspace
  on public.chat_members (user_id, workspace_id, room_id);

create index if not exists idx_chat_messages_room_created
  on public.chat_messages (room_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_files_workspace_owner
  on public.files (workspace_id, owner_type, owner_id, created_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_memberships_updated_at on public.memberships;
create trigger trg_memberships_updated_at
before update on public.memberships
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_workspace_invitations_updated_at on public.workspace_invitations;
create trigger trg_workspace_invitations_updated_at
before update on public.workspace_invitations
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_boards_updated_at on public.boards;
create trigger trg_boards_updated_at
before update on public.boards
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_board_comments_updated_at on public.board_comments;
create trigger trg_board_comments_updated_at
before update on public.board_comments
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_chat_rooms_updated_at on public.chat_rooms;
create trigger trg_chat_rooms_updated_at
before update on public.chat_rooms
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_chat_members_updated_at on public.chat_members;
create trigger trg_chat_members_updated_at
before update on public.chat_members
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_user_presence_updated_at on public.user_presence;
create trigger trg_user_presence_updated_at
before update on public.user_presence
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

create or replace function app.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.workspace_id = target_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  );
$$;

create or replace function app.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.workspace_id = target_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
      and m.role in ('OWNER', 'ADMIN')
  );
$$;

create or replace function app.extract_workspace_uuid(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  raw_value text;
begin
  raw_value := nullif(split_part(coalesce(object_name, ''), '/', 1), '');
  if raw_value is null then
    return null;
  end if;

  begin
    return raw_value::uuid;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function app.is_chat_room_owner(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members cm
    where cm.room_id = target_room_id
      and cm.user_id = auth.uid()
      and cm.role = 'OWNER'
  );
$$;

create or replace function app.create_workspace(workspace_name text, workspace_slug text default null)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace public.workspaces;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.workspaces (
    slug,
    name,
    owner_user_id
  ) values (
    coalesce(
      workspace_slug,
      lower(regexp_replace(workspace_name, '[^a-zA-Z0-9]+', '-', 'g'))
    ) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
    workspace_name,
    auth.uid()
  )
  returning * into new_workspace;

  insert into public.memberships (
    workspace_id,
    user_id,
    role,
    status
  ) values (
    new_workspace.id,
    auth.uid(),
    'OWNER',
    'ACTIVE'
  )
  on conflict (workspace_id, user_id) do nothing;

  update public.profiles
  set current_workspace_id = new_workspace.id
  where id = auth.uid();

  return new_workspace;
end;
$$;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.boards enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_reads enable row level security;
alter table public.board_saves enable row level security;
alter table public.notifications enable row level security;
alter table public.files enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_files enable row level security;
alter table public.user_presence enable row level security;

create policy "profiles select self or coworker"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.memberships self_m
    join public.memberships other_m
      on other_m.workspace_id = self_m.workspace_id
    where self_m.user_id = auth.uid()
      and self_m.status = 'ACTIVE'
      and other_m.user_id = public.profiles.id
      and other_m.status = 'ACTIVE'
  )
);

create policy "profiles update self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "workspaces select member"
on public.workspaces
for select
to authenticated
using (app.is_workspace_member(id));

create policy "workspaces insert self owner"
on public.workspaces
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "workspaces update admin"
on public.workspaces
for update
to authenticated
using (app.is_workspace_admin(id))
with check (app.is_workspace_admin(id));

create policy "memberships select member"
on public.memberships
for select
to authenticated
using (app.is_workspace_member(workspace_id));

create policy "memberships insert admin"
on public.memberships
for insert
to authenticated
with check (app.is_workspace_admin(workspace_id));

create policy "memberships update admin or self leave"
on public.memberships
for update
to authenticated
using (
  app.is_workspace_admin(workspace_id)
  or user_id = auth.uid()
)
with check (
  app.is_workspace_admin(workspace_id)
  or user_id = auth.uid()
);

create policy "invitations select admin"
on public.workspace_invitations
for select
to authenticated
using (app.is_workspace_admin(workspace_id));

create policy "invitations insert admin"
on public.workspace_invitations
for insert
to authenticated
with check (app.is_workspace_admin(workspace_id));

create policy "invitations update admin"
on public.workspace_invitations
for update
to authenticated
using (app.is_workspace_admin(workspace_id))
with check (app.is_workspace_admin(workspace_id));

create policy "boards select member"
on public.boards
for select
to authenticated
using (deleted_at is null and app.is_workspace_member(workspace_id));

create policy "boards insert member"
on public.boards
for insert
to authenticated
with check (
  app.is_workspace_member(workspace_id)
  and author_user_id = auth.uid()
);

create policy "boards update author or admin"
on public.boards
for update
to authenticated
using (
  app.is_workspace_member(workspace_id)
  and (author_user_id = auth.uid() or app.is_workspace_admin(workspace_id))
)
with check (
  app.is_workspace_member(workspace_id)
  and (author_user_id = auth.uid() or app.is_workspace_admin(workspace_id))
);

create policy "board_comments select member"
on public.board_comments
for select
to authenticated
using (deleted_at is null and app.is_workspace_member(workspace_id));

create policy "board_comments insert member"
on public.board_comments
for insert
to authenticated
with check (
  app.is_workspace_member(workspace_id)
  and author_user_id = auth.uid()
);

create policy "board_comments update author or admin"
on public.board_comments
for update
to authenticated
using (
  app.is_workspace_member(workspace_id)
  and (author_user_id = auth.uid() or app.is_workspace_admin(workspace_id))
)
with check (
  app.is_workspace_member(workspace_id)
  and (author_user_id = auth.uid() or app.is_workspace_admin(workspace_id))
);

create policy "board_reads manage self"
on public.board_reads
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "board_saves manage self"
on public.board_saves
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "notifications select self"
on public.notifications
for select
to authenticated
using (recipient_user_id = auth.uid());

create policy "notifications update self"
on public.notifications
for update
to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

create policy "files select member"
on public.files
for select
to authenticated
using (app.is_workspace_member(workspace_id));

create policy "files insert member"
on public.files
for insert
to authenticated
with check (
  app.is_workspace_member(workspace_id)
  and uploader_user_id = auth.uid()
);

create policy "chat_rooms select member"
on public.chat_rooms
for select
to authenticated
using (app.is_workspace_member(workspace_id));

create policy "chat_rooms insert member"
on public.chat_rooms
for insert
to authenticated
with check (
  app.is_workspace_member(workspace_id)
  and created_by_user_id = auth.uid()
);

create policy "chat_rooms update owner or admin"
on public.chat_rooms
for update
to authenticated
using (app.is_chat_room_owner(id) or app.is_workspace_admin(workspace_id))
with check (app.is_chat_room_owner(id) or app.is_workspace_admin(workspace_id));

create policy "chat_members select room member"
on public.chat_members
for select
to authenticated
using (app.is_workspace_member(workspace_id));

create policy "chat_members insert owner or admin"
on public.chat_members
for insert
to authenticated
with check (
  app.is_chat_room_owner(room_id)
  or app.is_workspace_admin(workspace_id)
  or exists (
    select 1
    from public.chat_rooms r
    where r.id = room_id
      and r.created_by_user_id = auth.uid()
  )
);

create policy "chat_members update self owner or admin"
on public.chat_members
for update
to authenticated
using (
  user_id = auth.uid()
  or app.is_chat_room_owner(room_id)
  or app.is_workspace_admin(workspace_id)
)
with check (
  user_id = auth.uid()
  or app.is_chat_room_owner(room_id)
  or app.is_workspace_admin(workspace_id)
);

create policy "chat_messages select room member"
on public.chat_messages
for select
to authenticated
using (deleted_at is null and app.is_workspace_member(workspace_id));

create policy "chat_messages insert room member"
on public.chat_messages
for insert
to authenticated
with check (
  app.is_workspace_member(workspace_id)
  and sender_user_id = auth.uid()
);

create policy "chat_messages update sender"
on public.chat_messages
for update
to authenticated
using (
  app.is_workspace_member(workspace_id)
  and sender_user_id = auth.uid()
)
with check (
  app.is_workspace_member(workspace_id)
  and sender_user_id = auth.uid()
);

create policy "chat_message_files select member"
on public.chat_message_files
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_messages m
    where m.id = message_id
      and app.is_workspace_member(m.workspace_id)
  )
);

create policy "chat_message_files insert member"
on public.chat_message_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.chat_messages m
    where m.id = message_id
      and app.is_workspace_member(m.workspace_id)
  )
);

create policy "presence select coworker"
on public.user_presence
for select
to authenticated
using (
  workspace_id is not null
  and app.is_workspace_member(workspace_id)
);

create policy "presence upsert self"
on public.user_presence
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values
  ('workspace-files', 'workspace-files', false),
  ('chat-files', 'chat-files', false),
  ('contract-files', 'contract-files', false)
on conflict (id) do nothing;

create policy "workspace bucket read"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('workspace-files', 'chat-files', 'contract-files')
  and app.is_workspace_member(app.extract_workspace_uuid(name))
);

create policy "workspace bucket write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('workspace-files', 'chat-files', 'contract-files')
  and app.is_workspace_member(app.extract_workspace_uuid(name))
);

create policy "workspace bucket update"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('workspace-files', 'chat-files', 'contract-files')
  and app.is_workspace_member(app.extract_workspace_uuid(name))
)
with check (
  bucket_id in ('workspace-files', 'chat-files', 'contract-files')
  and app.is_workspace_member(app.extract_workspace_uuid(name))
);

create policy "workspace bucket delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('workspace-files', 'chat-files', 'contract-files')
  and app.is_workspace_member(app.extract_workspace_uuid(name))
);






