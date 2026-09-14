// 빌드된 firmware.bin 에 기기 신원(코드/비밀키)을 심는다 — 브라우저 판.
//
// 펌웨어(src/DeviceIdentity.cpp)가 magic 으로 시작하는 112바이트 블록을 바이너리에
// 넣어 둔다. 여기서는 그 magic 을 찾아 뒤쪽 두 필드만 덮어쓰고, ESP32 이미지가 다시
// 유효해지도록 XOR 체크섬과 끝에 붙은 SHA256 을 다시 계산한다. 둘 중 하나라도
// 어긋나면 ROM 부트로더가 이미지를 거부해 기기가 부팅되지 않는다.
//
// 같은 규칙의 파이썬 구현이 tools/fwpatch.py 에 있다 — 한쪽을 고치면 반대쪽도.

const MAGIC = 'DIMSUM-IDENT-V1\0';
const CODE_OFF = 16;
const CODE_LEN = 32;
const SECRET_OFF = 48;
const SECRET_LEN = 64;

const CODE_RE = /^[A-Za-z0-9._-]+$/;

export class PatchError extends Error {}

const magicBytes = () => new TextEncoder().encode(MAGIC);

function findBlock(bytes) {
  const needle = magicBytes();
  const hits = [];
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    hits.push(i);
    if (hits.length > 1) break;
  }
  if (hits.length === 0) {
    throw new PatchError(
      '펌웨어에서 신원 블록을 찾지 못했어요. DeviceIdentity 가 없는 옛 빌드입니다 — ' +
        'pio run 으로 다시 빌드해 public/firmware/firmware.bin 을 갱신하세요.',
    );
  }
  if (hits.length > 1) throw new PatchError('신원 블록이 여러 개예요 — 어디를 고쳐야 할지 알 수 없습니다.');
  return hits[0];
}

function writeField(bytes, base, off, len, value, label) {
  const raw = new TextEncoder().encode(value);
  if (raw.length >= len) {
    // 마지막 한 바이트는 NUL 종단용으로 남긴다
    throw new PatchError(`${label}가 너무 길어요: ${raw.length}바이트 (최대 ${len - 1})`);
  }
  bytes.fill(0, base + off, base + off + len);
  bytes.set(raw, base + off);
}

// 세그먼트를 훑어 XOR 체크섬과 (붙어 있다면) SHA256 을 다시 쓴다.
async function refreshImage(bytes) {
  if (bytes[0] !== 0xe9) throw new PatchError(`ESP32 이미지가 아니에요 (magic 0x${bytes[0].toString(16)})`);
  const segCount = bytes[1];
  const hashAppended = bytes[23] === 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let pos = 24;
  let checksum = 0xef;
  for (let i = 0; i < segCount; i++) {
    if (pos + 8 > bytes.length) throw new PatchError(`세그먼트 ${i} 헤더가 잘렸어요`);
    const segLen = view.getUint32(pos + 4, true);
    pos += 8;
    const end = pos + segLen;
    if (end > bytes.length) throw new PatchError(`세그먼트 ${i} 데이터가 잘렸어요`);
    for (let k = pos; k < end; k++) checksum ^= bytes[k];
    pos = end;
  }

  // 체크섬은 16바이트 경계의 마지막 바이트에 놓인다(그 앞은 0 패딩).
  while ((pos + 1) % 16 !== 0) pos += 1;
  if (pos >= bytes.length) throw new PatchError('체크섬 위치가 파일 밖이에요');
  bytes[pos] = checksum;

  if (hashAppended) {
    const digestAt = pos + 1;
    if (bytes.length < digestAt + 32) throw new PatchError('SHA256 자리가 부족해요');
    const digest = await crypto.subtle.digest('SHA-256', bytes.subarray(0, digestAt));
    bytes.set(new Uint8Array(digest), digestAt);
  }
}

/** 기기 신원을 심은 새 firmware.bin 바이트를 돌려준다. 입력은 건드리지 않는다. */
export async function patchFirmware(firmware, deviceCode, deviceSecret) {
  const code = (deviceCode || '').trim();
  const secret = (deviceSecret || '').trim();
  if (!code) throw new PatchError('기기 코드가 비어 있어요');
  if (!CODE_RE.test(code)) throw new PatchError(`기기 코드에 쓸 수 없는 문자가 있어요: ${code}`);
  // 비밀키는 비어 있어도 된다 — 펌웨어가 읽지 않는다(tools/README.md 참고).
  // 자리는 그대로 두고 0 으로 채운다.

  const bytes = new Uint8Array(firmware.slice(0));
  const base = findBlock(bytes);
  writeField(bytes, base, CODE_OFF, CODE_LEN, code, '기기 코드');
  writeField(bytes, base, SECRET_OFF, SECRET_LEN, secret, '기기 비밀키');
  await refreshImage(bytes);
  return bytes;
}

/** 현재 심겨 있는 [코드, 비밀키]. 패치 전이면 빈 문자열. */
export function readIdentity(bytes) {
  const base = findBlock(bytes);
  const field = (off, len) => {
    const raw = bytes.subarray(base + off, base + off + len);
    const nul = raw.indexOf(0);
    return new TextDecoder().decode(nul === -1 ? raw : raw.subarray(0, nul));
  };
  return [field(CODE_OFF, CODE_LEN), field(SECRET_OFF, SECRET_LEN)];
}

// 모듈 로드 시점이 아니라 쓸 때 계산한다 — 테스트 하네스처럼 번들러 밖에서 import 해도 깨지지 않는다.
const fwBase = () => `${import.meta.env?.BASE_URL || '/'}firmware/`;

async function fetchBin(name) {
  const res = await fetch(`${fwBase()}${name}`, { cache: 'no-store' });
  if (!res.ok) throw new PatchError(`${name} 를 받지 못했어요 (HTTP ${res.status})`);
  return res.arrayBuffer();
}

/**
 * 이 기기 전용 펌웨어를 만들고 esp-web-tools 가 읽을 manifest 를 blob URL 로 돌려준다.
 * parts 경로를 blob URL 로 바꾸므로 서버에 기기별 파일을 만들 필요가 없다.
 * 반환된 revoke() 를 반드시 불러 URL 을 정리할 것.
 */
export async function buildDeviceManifest(deviceCode, deviceSecret) {
  const [manifestRes, bootloader, partitions, firmware] = await Promise.all([
    fetch(`${fwBase()}manifest.json`, { cache: 'no-store' }),
    fetchBin('bootloader.bin'),
    fetchBin('partitions.bin'),
    fetchBin('firmware.bin'),
  ]);
  if (!manifestRes.ok) throw new PatchError(`manifest.json 을 받지 못했어요 (HTTP ${manifestRes.status})`);
  const base = await manifestRes.json();

  const patched = await patchFirmware(firmware, deviceCode, deviceSecret);

  const urls = [];
  const blobUrl = (data, type = 'application/octet-stream') => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    urls.push(url);
    return url;
  };

  // 오프셋은 원본 manifest 를 그대로 따른다 — 파티션 테이블과 같이 움직여야 하므로
  // 여기서 값을 새로 적지 않는다.
  const byName = { 'bootloader.bin': bootloader, 'partitions.bin': partitions, 'firmware.bin': patched };
  const manifest = {
    ...base,
    name: `${base.name} · ${deviceCode}`,
    builds: base.builds.map((build) => ({
      ...build,
      parts: build.parts.map((part) => {
        const data = byName[part.path];
        if (!data) throw new PatchError(`manifest 에 모르는 파트가 있어요: ${part.path}`);
        return { ...part, path: blobUrl(data) };
      }),
    })),
  };

  const manifestUrl = blobUrl(JSON.stringify(manifest), 'application/json');
  return {
    manifestUrl,
    firmwareBlob: new Blob([patched], { type: 'application/octet-stream' }),
    version: base.version,
    revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}

export const webFlashSupported = () => 'serial' in navigator && window.isSecureContext;
