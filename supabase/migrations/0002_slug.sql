-- clicker_profiles 에 slug 추가 (친구 초대 링크용)
alter table public.clicker_profiles
  add column if not exists slug text unique
  constraint clicker_profiles_slug_fmt
    check (slug ~ '^[a-z0-9][a-z0-9\-]{1,18}[a-z0-9]$');
