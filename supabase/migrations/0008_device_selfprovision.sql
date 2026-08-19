-- ============================================================
-- 기기 셀프 프로비저닝
--   기기마다 코드를 만들어 펌웨어에 넣고 빌드하던 방식을 없앤다.
--   모든 보드에 동일한 이미지를 굽고, 첫 부팅 때 기기가 자기 MAC(hw_id)으로
--   clicker_device_provision 을 호출해 device_code / device_secret 을 발급받는다.
--
--   hw_id  : ESP32 MAC (하이픈 없는 12자리 hex). 보드마다 고유하고 변하지 않으므로
--            NVS가 지워져도 같은 기기임을 서버가 알아볼 수 있다.
-- ============================================================
alter table public.clicker_devices
  add column if not exists hw_id text unique;

comment on column public.clicker_devices.hw_id is
  'ESP32 MAC(12 hex). 셀프 프로비저닝 시 기기 식별자. NULL이면 수동 발급된 구형 행.';

-- 프로비저닝은 hw_id 로 조회한다 (unique 제약이 인덱스를 겸함).
-- RLS: clicker_devices 는 이미 활성화돼 있고, 이 컬럼도 클라이언트에서 직접 읽을 수 없다.
-- 발급/조회는 service_role Edge Function(clicker_device_provision)이 독점한다.
