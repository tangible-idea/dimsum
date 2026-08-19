// /admin — 기기 관리자 페이지
//
// 기기 코드는 여기서 만들지 않는다. 모든 보드에 같은 펌웨어를 굽고, 기기가 첫 부팅 때
// clicker_device_provision 으로 스스로 코드를 발급받는다. 이 화면은 그렇게 올라온
// 기기들을 보고 관리(라벨/시크릿 확인/잠금 해제/재발급)하는 곳이다.
import { useCallback, useEffect, useState } from 'react';
import { adminDevices, googleLogin, supabase } from '../lib/supabase';
import '../admin.css';

const fmtDate = (s) => (s ? new Date(s).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function Copy({ text, children }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      setDone(false);
    }
  };
  return <button className="adm-copy" onClick={copy}>{done ? '복사됨' : (children ?? '복사')}</button>;
}

// 라벨 인라인 편집 — 코드가 자동 생성이라 어느 보드인지 메모해두지 않으면 구분이 안 된다.
function LabelCell({ device, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(device.label ?? '');

  if (!editing) {
    return (
      <button className="adm-label" onClick={() => { setValue(device.label ?? ''); setEditing(true); }}>
        {device.label || <span className="adm-dim">+ 라벨</span>}
      </button>
    );
  }
  const commit = async () => { setEditing(false); await onSave(device.device_code, value); };
  return (
    <input
      className="adm-labelinput"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

export default function Admin() {
  const [session, setSession] = useState(undefined);   // undefined = 확인 중
  const [devices, setDevices] = useState([]);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [shown, setShown] = useState([]);              // 시크릿을 펼쳐본 기기

  // 게임 화면용 body 스타일(스크롤 잠금/드래그 금지)을 관리자 페이지에선 해제
  useEffect(() => {
    const { overflow, userSelect } = document.body.style;
    document.body.style.overflow = 'auto';
    document.body.style.userSelect = 'auto';
    return () => { document.body.style.overflow = overflow; document.body.style.userSelect = userSelect; };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const call = useCallback(async (body) => {
    const { data, error } = await adminDevices(body);
    // Edge Function이 4xx로 응답하면 error에 담기고 본문 메시지는 data에 없다 → 둘 다 확인
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    setErr('');
    try {
      const data = await call({ action: 'list' });
      setDevices(data.devices ?? []);
    } catch (e) {
      setErr(e.message);
    }
  }, [call]);

  useEffect(() => { if (session) refresh(); }, [session, refresh]);

  // 새 기기는 전원을 켜면 알아서 목록에 올라온다 → 대기 중엔 주기적으로 새로고침
  useEffect(() => {
    if (!session) return;
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [session, refresh]);

  const act = async (body, after) => {
    setErr(''); setNotice('');
    try {
      const data = await call(body);
      await after?.(data);
    } catch (e) { setErr(e.message); }
  };

  const reveal = (device_code) =>
    act({ action: 'reveal', device_code }, (d) =>
      setShown((prev) => [...prev.filter((x) => x.device_code !== device_code), d.device]));

  const hide = (device_code) =>
    setShown((prev) => prev.filter((x) => x.device_code !== device_code));

  const saveLabel = (device_code, label) =>
    act({ action: 'label', device_code, label }, refresh);

  const unlock = (device_code) => {
    if (!window.confirm(
      `${device_code} 의 잠금을 해제할까요?\n\n` +
      `기기가 저장소를 잃었을 때(전체 플래시 지우기 등)만 사용하세요.\n` +
      `기기를 재부팅하면 같은 코드를 다시 받아갑니다. ` +
      `그 뒤 주인이 등록 URL을 한 번 더 열어야 원래 계정에 다시 붙습니다.`
    )) return;
    return act({ action: 'unlock', device_code }, async () => {
      setNotice(`${device_code} 잠금 해제됨 — 기기를 재부팅하세요.`);
      await refresh();
    });
  };

  const rotate = (device_code) => {
    if (!window.confirm(
      `${device_code} 의 시크릿을 재발급할까요?\n\n` +
      `기기에 저장된 시크릿은 즉시 무효가 되어 통신이 끊깁니다. ` +
      `기기를 살리려면 잠금 해제 + 재부팅이 따로 필요합니다.`
    )) return;
    return act({ action: 'rotate', device_code }, async (d) => {
      setShown((prev) => [...prev.filter((x) => x.device_code !== device_code), d.device]);
      await refresh();
    });
  };

  if (session === undefined) return <div className="adm adm-center">확인 중...</div>;

  if (!session) {
    return (
      <div className="adm adm-center">
        <div className="adm-card adm-login">
          <h1>기기 관리자</h1>
          <p className="adm-dim">관리자 계정으로 로그인하세요.</p>
          <button className="adm-btn" onClick={googleLogin}>구글로 로그인</button>
        </div>
      </div>
    );
  }

  const waiting = devices.filter((d) => !d.registered);

  return (
    <div className="adm">
      <header className="adm-head">
        <div>
          <h1>기기 관리자</h1>
          <p className="adm-dim">{session.user.email}</p>
        </div>
        <button className="adm-ghost" onClick={() => supabase.auth.signOut()}>로그아웃</button>
      </header>

      {err && <div className="adm-err">{err}</div>}
      {notice && <div className="adm-ok">{notice}</div>}

      <section className="adm-card adm-guide">
        <h2>새 기기 찍는 법</h2>
        <ol>
          <li>보드에 펌웨어를 굽는다 — <code>pio run -t upload</code>. <b>모든 보드가 같은 이미지</b>라 기기마다 다시 빌드하지 않는다.</li>
          <li>전원을 켜고 <code>Clicker-XXXX</code> AP에 접속해 집 WiFi를 잡아준다.</li>
          <li>기기가 스스로 코드를 발급받아 <b>화면에 띄운다</b>. 아래 목록에도 바로 올라온다.</li>
          <li>주인이 <code>{location.origin}/화면에뜬코드</code> 로 접속해 로그인하면 등록 끝.</li>
        </ol>
        {waiting.length > 0 && (
          <p className="adm-waiting">
            등록 대기 중인 기기 {waiting.length}대: {waiting.map((d) => d.device_code).join(', ')}
          </p>
        )}
      </section>

      <section className="adm-card">
        <div className="adm-head2">
          <h2>기기 목록 <span className="adm-dim">({devices.length})</span></h2>
          <button className="adm-ghost" onClick={refresh}>새로고침</button>
        </div>
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>코드</th><th>라벨</th><th>MAC</th><th>소유자</th><th>상태</th><th>마지막 접속</th><th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const secret = shown.find((x) => x.device_code === d.device_code);
                return [
                  <tr key={d.device_code}>
                    <td><code>{d.device_code}</code></td>
                    <td><LabelCell device={d} onSave={saveLabel} /></td>
                    <td className="adm-dim"><code>{d.hw_id || '—'}</code></td>
                    <td>{d.owner_name || <span className="adm-dim">미등록</span>}</td>
                    <td>
                      <span className={d.registered ? 'adm-tag adm-on' : 'adm-tag'}>
                        {d.registered ? '등록됨' : '대기'}
                      </span>
                    </td>
                    <td className="adm-dim">{fmtDate(d.last_seen_at)}</td>
                    <td className="adm-actions">
                      {secret
                        ? <button className="adm-ghost" onClick={() => hide(d.device_code)}>숨기기</button>
                        : <button className="adm-ghost" onClick={() => reveal(d.device_code)}>시크릿</button>}
                      <button className="adm-ghost" onClick={() => unlock(d.device_code)}>잠금 해제</button>
                      <button className="adm-ghost adm-danger" onClick={() => rotate(d.device_code)}>재발급</button>
                    </td>
                  </tr>,
                  secret && (
                    <tr key={`${d.device_code}-secret`} className="adm-detail">
                      <td colSpan="7">
                        <div className="adm-row">
                          <span className="adm-key">등록 URL</span>
                          <code className="adm-val">{location.origin}/{d.device_code}</code>
                          <Copy text={`${location.origin}/${d.device_code}`} />
                        </div>
                        <div className="adm-row">
                          <span className="adm-key">device_secret</span>
                          <code className="adm-val adm-secret">{secret.device_secret}</code>
                          <Copy text={secret.device_secret} />
                        </div>
                        <p className="adm-dim adm-step">
                          기기가 첫 부팅 때 스스로 받아간 값이다. 펌웨어에 넣을 필요는 없고,
                          통신 문제를 디버깅할 때만 쓴다.
                        </p>
                      </td>
                    </tr>
                  ),
                ];
              })}
              {!devices.length && (
                <tr><td colSpan="7" className="adm-dim adm-empty">
                  아직 올라온 기기가 없습니다. 보드에 전원을 넣고 WiFi를 잡아주면 여기에 나타납니다.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
