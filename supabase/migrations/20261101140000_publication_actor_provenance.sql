-- Separate the publishing actor (Page) from the destination community and editor.
alter table public.post_publications add column if not exists publisher_page_id text references public.pages(id) on delete set null;
alter table public.post_publications add column if not exists publisher_page_name text;
alter table public.post_publications add column if not exists editor_user_id uuid references auth.users(id) on delete set null;
alter table public.post_publications add column if not exists published_as text not null default 'page'
  check (published_as in ('page','profile','unknown'));

update public.post_publications
set publisher_page_id = page_id,
    published_as = case when page_id is null then 'unknown' else 'page' end
where publisher_page_id is null;

create index if not exists post_publications_publisher_idx on public.post_publications(publisher_page_id, published_at desc);
create index if not exists post_publications_editor_idx on public.post_publications(editor_user_id, created_at desc);
