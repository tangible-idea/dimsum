// 로그인 / 등록 게이트 오버레이 — Tap Counter (off-white)
import PixelDimsum from './PixelDimsum';

const LogoTarget = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="7.2" strokeDasharray="1.6 2.6" />
  </svg>
);
const LogoWifi = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8 15.5a6 6 0 0 1 8 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const LogoCheck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const LogoBlock = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" strokeLinecap="round" />
  </svg>
);
const LogoAlert = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);

export default function Gate({ gate, deviceCode, onGoogle, onStart, onRegister, onRetry, onDemo, onLogout, onCopy }) {
  const { state, msg, secret } = gate;

  // 로딩: 오프화이트 배경에 딤섬이 춤추는 스플래시(라우팅이 끝날 때까지 표시)
  if (state === 'loading') {
    return (
      <div className="splash">
        <div className="splash-stage">
          <div className="splash-dance"><PixelDimsum stageIdx={0} px={8} /></div>
          <div className="splash-shadow" />
        </div>
        <div className="splash-brand">MY DIMSUM</div>
        <p className="splash-msg">{msg || '딤섬이를 깨우는 중...'}</p>
      </div>
    );
  }

  let body = null;
  if (state === 'register') {
    body = (<>
      <div className="logo"><LogoTarget /></div><h1>처음 오셨네요!</h1>
      <p>이 기기를 내 계정에 등록하려면 구글로 로그인하세요.<br />기기: <b>{deviceCode}</b></p>
      <button className="gbtn" onClick={onGoogle}>구글로 시작하기</button>
    </>);
  } else if (state === 'wifi') {
    body = (<>
      <div className="logo"><LogoWifi /></div><h1>기기 WiFi 연결</h1>
      <p>이 기기를 처음 쓰시는군요! 먼저 기기를 집 WiFi에 연결해주세요.</p>
      <ol className="steps">
        <li>기기 전원을 켜고, WiFi LED가 깜빡이면 설정 모드예요.<br />
          <span className="dim">(이미 켜져 있다면 탭 버튼을 <b>5초간 길게</b> 눌러 설정 모드로)</span></li>
        <li>폰의 WiFi 목록에서 <b className="ap">Clicker-XXXX</b> 를 선택해 접속하세요.</li>
        <li>자동으로 열리는 설정 페이지에서 <b>집 WiFi</b>를 고르고 비밀번호를 입력해요.</li>
        <li>기기 LED가 꺼지면(연결 완료) 폰을 원래 WiFi로 되돌린 뒤 아래 버튼을 눌러주세요.</li>
      </ol>
      <button className="gbtn" onClick={onRegister}>기기 등록하고 시작하기 →</button>
      <button className="gbtn ghost" onClick={onRetry}>처음부터 다시</button>
    </>);
  } else if (state === 'login') {
    body = (<>
      <div className="logo"><LogoTarget /></div><h1>로그인이 필요해요</h1>
      <p>이 기기는 등록돼 있어요. 구글로 로그인하면 카운터가 시작됩니다.</p>
      <button className="gbtn" onClick={onGoogle}>구글로 로그인</button>
    </>);
  } else if (state === 'secret') {
    body = (<>
      <div className="logo"><LogoCheck /></div><h1>등록 완료!</h1>
      <p>아래 <b>기기 키</b>를 ESP32 펌웨어에 입력하세요.<br />이 화면에서만 보여요.</p>
      <div className="secret">{secret}</div>
      <button className="gbtn" onClick={() => onCopy(secret)}>키 복사</button>
      <button className="gbtn ghost" onClick={onStart}>시작하기 →</button>
      <p className="warn">키는 안전하게 보관하세요. 분실 시 재발급이 필요합니다.</p>
    </>);
  } else if (state === 'owned') {
    body = (<>
      <div className="logo"><LogoBlock /></div><h1>다른 계정의 기기</h1>
      <p>이 기기는 이미 다른 구글 계정에 등록되어 있어요.</p>
      <button className="gbtn ghost" onClick={onLogout}>다른 계정으로 로그인</button>
    </>);
  } else if (state === 'notfound') {
    body = (<>
      <div className="logo"><LogoBlock /></div><h1>없는 기기예요</h1>
      <p>이 코드로 등록된 기기를 찾을 수 없어요.<br />기기: <b>{deviceCode}</b></p>
      <p className="warn">기기 링크/QR을 다시 확인하거나, 기기에 인쇄된 코드와 같은지 확인해주세요.</p>
      <button className="gbtn ghost" onClick={onRetry}>다시 시도</button>
    </>);
  } else if (state === 'nocode') {
    body = (<>
      <div className="logo"><LogoTarget /></div><h1>Tap Counter</h1>
      <p>클리커 기기의 링크로 접속하면 카운터가 연결돼요.<br />지금은 기기 코드가 없어요.</p>
      {onDemo && <button className="gbtn ghost" onClick={onDemo}>데모로 시작하기 →</button>}
    </>);
  } else if (state === 'error') {
    body = (<>
      <div className="logo"><LogoAlert /></div><h1>문제가 발생했어요</h1>
      <p>{msg || '잠시 후 다시 시도해주세요.'}</p>
      <button className="gbtn ghost" onClick={onRetry}>다시 시도</button>
    </>);
  }

  return <div className="gate"><div className="card">{body}</div></div>;
}
