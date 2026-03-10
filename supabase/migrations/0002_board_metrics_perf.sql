create index if not exists idx_board_comments_workspace_author_board
  on public.board_comments (workspace_id, author_user_id, board_id)
  where deleted_at is null;

create index if not exists idx_board_reads_user_board
  on public.board_reads (user_id, board_id);

create index if not exists idx_board_saves_user_board
  on public.board_saves (user_id, board_id);

create index if not exists idx_files_owner_created
  on public.files (owner_type, owner_id, created_at desc);

create or replace function app.load_board_metrics(target_workspace_id uuid, board_ids uuid[])
returns table (
  board_id uuid,
  comment_count bigint,
  file_count bigint,
  read_yn boolean,
  saved_yn boolean,
  commented_yn boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select app.is_workspace_member(target_workspace_id) as ok
  ),
  target_boards as (
    select b.id as board_id
    from public.boards b
    join allowed a on a.ok
    where b.workspace_id = target_workspace_id
      and b.deleted_at is null
      and b.id = any(coalesce(board_ids, array[]::uuid[]))
  ),
  comment_counts as (
    select c.board_id, count(*)::bigint as comment_count
    from public.board_comments c
    join target_boards tb on tb.board_id = c.board_id
    where c.deleted_at is null
    group by c.board_id
  ),
  file_counts as (
    select f.owner_id as board_id, count(*)::bigint as file_count
    from public.files f
    join target_boards tb on tb.board_id = f.owner_id
    where f.workspace_id = target_workspace_id
      and f.owner_type = 'BOARD'
    group by f.owner_id
  ),
  read_flags as (
    select r.board_id, true as read_yn
    from public.board_reads r
    join target_boards tb on tb.board_id = r.board_id
    where r.user_id = auth.uid()
  ),
  save_flags as (
    select s.board_id, true as saved_yn
    from public.board_saves s
    join target_boards tb on tb.board_id = s.board_id
    where s.user_id = auth.uid()
  ),
  comment_flags as (
    select c.board_id, true as commented_yn
    from public.board_comments c
    join target_boards tb on tb.board_id = c.board_id
    where c.workspace_id = target_workspace_id
      and c.author_user_id = auth.uid()
      and c.deleted_at is null
    group by c.board_id
  )
  select
    tb.board_id,
    coalesce(cc.comment_count, 0) as comment_count,
    coalesce(fc.file_count, 0) as file_count,
    coalesce(rf.read_yn, false) as read_yn,
    coalesce(sf.saved_yn, false) as saved_yn,
    coalesce(cf.commented_yn, false) as commented_yn
  from target_boards tb
  left join comment_counts cc on cc.board_id = tb.board_id
  left join file_counts fc on fc.board_id = tb.board_id
  left join read_flags rf on rf.board_id = tb.board_id
  left join save_flags sf on sf.board_id = tb.board_id
  left join comment_flags cf on cf.board_id = tb.board_id;
$$;
