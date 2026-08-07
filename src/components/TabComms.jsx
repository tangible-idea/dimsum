import { PixelThumb } from './PixelView';

// 통신 탭 — 이 앱의 첫 화면.
// 기기가 있어야만 성립하는 유일한 기능이라 앱을 열자마자 보이게 둔다.
const initial = (name) => ([...(name || '?')][0] || '?').toUpperCase();

const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

export default function TabComms({ friends, received, me, onPick, onOpen }) {
  return (
    <div className="tb">
      {received.length > 0 && (
        <section className="tb-sec">
          <h2 className="tb-h">받은 그림</h2>
          <div className="cm-inbox">
            {received.map((m) => (
              <button key={m.id} className="cm-card" onClick={() => onOpen(m)}>
                <PixelThumb msg={m} />
                <span className="cm-card-meta">
                  <b>{m.n || '친구'}</b>
                  <i>{ago(m.ts)}</i>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="tb-sec">
        <h2 className="tb-h">누구에게 보낼까요?</h2>
        <div className="cm-list">
          {friends.map((f) => (
            <button key={f.id} className="cm-row" onClick={() => onPick(f)}>
              <span className="cm-av">{initial(f.name)}</span>
              <span className="cm-name">{f.name}</span>
              <span className="cm-go">그림 보내기</span>
            </button>
          ))}

          {/* 친구가 없어도 바로 해볼 수 있게 내 기기로 보내는 길을 열어둔다.
              내 기기도 clicker/msg/<내id>를 구독하므로 실제 왕복이 그대로 돈다. */}
          {friends.length === 0 && me && (
            <>
              <p className="tb-empty">
                아직 친구가 없어요.<br />
                먼저 내 기기로 보내서 어떻게 뜨는지 볼까요?
              </p>
              <button className="cm-row self" onClick={() => onPick(me)}>
                <span className="cm-av self">나</span>
                <span className="cm-name">내 기기<i>테스트로 보내보기</i></span>
                <span className="cm-go">그림 보내기</span>
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
