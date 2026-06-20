import { useEffect, useState } from 'react';
import { friendAdd, googleLogin, slugLookup } from '../lib/supabase';

// invite: null | { slug, myId, session, onDone }
export default function InviteModal({ invite, onClose }) {
  const [state, setState] = useState('loading'); // loading | found | adding | done | error | noauth
  const [target, setTarget] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!invite) return;
    if (!invite.session) { setState('noauth'); return; }
    setState('loading');
    slugLookup(invite.slug).then(({ data, error }) => {
      if (error || !data || data.error) {
        setState('error');
        setMsg(data?.error === 'not_found' ? '존재하지 않는 슬러그예요.' : '유저를 찾지 못했어요.');
        return;
      }
      if (data.id === invite.myId) { setState('error'); setMsg('자기 자신이에요 😅'); return; }
      setTarget(data);
      setState('found');
    });
  }, [invite]);

  if (!invite) return null;

  const add = async () => {
    setState('adding');
    const { data, error } = await friendAdd(target.id);
    if (error || !data?.ok) {
      setState('error');
      setMsg(data?.error || '친구 추가에 실패했어요.');
      return;
    }
    setState('done');
    invite.onDone?.(target);
  };

  const loginAndReturn = () => googleLogin();

  return (
    <div className="gate invite-modal">
      <div className="card">
        {state === 'loading' && <>
          <div className="logo">🔍</div>
          <p>유저를 찾는 중...</p>
          <div className="spinner" />
        </>}

        {state === 'noauth' && <>
          <div className="logo">🥟</div>
          <h1>로그인이 필요해요</h1>
          <p><b>{invite.slug}</b> 님의 초대를 받았어요!<br />친구 추가하려면 먼저 로그인하세요.</p>
          <button className="gbtn" onClick={loginAndReturn}>🔐 구글로 로그인</button>
          <button className="gbtn ghost" onClick={onClose}>닫기</button>
        </>}

        {state === 'found' && target && <>
          <div className="logo">🥟</div>
          <h1>친구 초대</h1>
          <p><b>{target.nickname}</b> 님이 친구 초대를 보냈어요!</p>
          <button className="gbtn" onClick={add}>👋 친구 추가하기</button>
          <button className="gbtn ghost" onClick={onClose}>다음에</button>
        </>}

        {state === 'adding' && <>
          <div className="logo">⏳</div>
          <p>친구 추가 중...</p>
          <div className="spinner" />
        </>}

        {state === 'done' && <>
          <div className="logo">🎉</div>
          <h1>친구 추가 완료!</h1>
          <p><b>{target?.nickname}</b> 님과 친구가 됐어요.</p>
          <button className="gbtn" onClick={onClose}>게임 계속하기</button>
        </>}

        {state === 'error' && <>
          <div className="logo">⚠️</div>
          <h1>문제가 생겼어요</h1>
          <p>{msg}</p>
          <button className="gbtn ghost" onClick={onClose}>닫기</button>
        </>}
      </div>
    </div>
  );
}
