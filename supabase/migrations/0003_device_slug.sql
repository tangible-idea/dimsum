-- clicker_devices 소유자가 자신의 기기 정보 갱신 가능 (label 등)
create policy "clicker_devices: owner update"
on public.clicker_devices for update to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
