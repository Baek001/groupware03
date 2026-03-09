insert into public.board_categories (code, label, sort_order)
values
  ('F101', '공지', 10),
  ('F104', '사내소식', 20),
  ('F102', '동호회', 30),
  ('F103', '경조사', 40),
  ('F105', '건의사항', 50),
  ('F106', '기타', 60)
on conflict (code) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;
