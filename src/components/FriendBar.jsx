import { useEffect, useState } from 'react';

// signal: { id, type:'click'|'poke', ts } — 새 객체가 올 때마다 해당 칩을 잠깐 반짝
export default function FriendBar({ friends, signal, onFindFriends }) {
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!signal) return undefined;
    setFlash(signal);
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [signal]);

  return (
    <div className="friendbar">
      {friends.length === 0 && (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>아직 친구가 없어요 🥲</span>
      )}
      {friends.map((f) => {
        const on = flash && flash.id === f.id;
        const cls = 'fchip' + (on ? ' flash' : '') + (on && flash.type === 'poke' ? ' poke' : '');
        return (
          <span key={f.id} className={cls}>
            <span className="dot" />{f.nickname || '친구'}
          </span>
        );
      })}
      <button className="ff-btn" onClick={onFindFriends} title="친구 찾기">＋</button>
    </div>
  );
}
