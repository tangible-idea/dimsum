import { useState } from 'react';
import { PixelThumb } from './PixelView';
import { IconPencil, IconTrash } from './icons';

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

export default function TabComms({ friends, received, me, onPick, onOpen, onRemove, onPrivacy }) {
  // 삭제는 되돌릴 수 없다(다시 친구를 맺어야 한다). 브라우저 confirm 대신
  // 그 행을 그 자리에서 확인 상태로 바꿔 오조작을 막는다.
  const [confirmId, setConfirmId] = useState(null);

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
          {friends.map((f) =>
            confirmId === f.id ? (
              <div key={f.id} className="cm-row confirming">
                <span className="cm-ask">{f.name}님과 친구를 끊을까요?</span>
                <button className="cm-ask-btn" onClick={() => setConfirmId(null)}>취소</button>
                <button
                  className="cm-ask-btn danger"
                  onClick={() => { setConfirmId(null); onRemove(f); }}
                >
                  삭제
                </button>
              </div>
            ) : (
              <div key={f.id} className="cm-row">
                <button className="cm-row-main" onClick={() => onPick(f)}>
                  <span className="cm-av">{initial(f.name)}</span>
                  <span className="cm-name">{f.name}</span>
                  <span className="cm-go" aria-label="그림 보내기" title="그림 보내기"><IconPencil size={20} /></span>
                </button>
                <button
                  className="cm-del"
                  onClick={() => setConfirmId(f.id)}
                  aria-label={`${f.name} 친구 삭제`}
                  title="친구 삭제"
                >
                  <IconTrash size={17} />
                </button>
              </div>
            ),
          )}

          {friends.length === 0 && me && (
            <p className="tb-empty">
              아직 친구가 없어요.<br />
              먼저 내 기기로 보내서 어떻게 뜨는지 볼까요?
            </p>
          )}

          {/* 친구가 있든 없든 내 기기로 보내는 길은 항상 열어둔다. 내 기기도
              clicker/msg/<내id>를 구독하므로 실제 왕복이 그대로 도는 유일한 자가 점검 수단이다. */}
          {me && (
            <div className="cm-row self">
              <button className="cm-row-main" onClick={() => onPick(me)}>
                <span className="cm-av self">나</span>
                <span className="cm-name">내 기기<i>테스트로 보내보기</i></span>
                <span className="cm-go" aria-label="그림 보내기" title="그림 보내기"><IconPencil size={20} /></span>
              </button>
            </div>
          )}
        </div>
      </section>

      <div style={{ textAlign: 'center', marginTop: 20, paddingBottom: 16 }}>
        <button
          type="button"
          className="gate-link"
          onClick={onPrivacy || (() => { window.location.href = '/privacy'; })}
        >
          개인정보처리방침 (Privacy Policy)
        </button>
      </div>
    </div>
  );
}
