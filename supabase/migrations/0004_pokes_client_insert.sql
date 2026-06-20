-- 브라우저가 직접 poke 큐에 쓸 수 있도록 허용
-- (from_user = 자신, to_user = 수락된 친구만)
create policy "clicker_pokes: insert for friends"
on public.clicker_pokes for insert to authenticated
with check (
  from_user = auth.uid()
  and exists (
    select 1 from public.clicker_friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = to_user)
        or
        (f.addressee_id = auth.uid() and f.requester_id = to_user)
      )
  )
);
