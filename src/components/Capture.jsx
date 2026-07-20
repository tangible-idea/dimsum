import { useRef, useState } from 'react';
import { loadSource, cutout } from '../lib/capture';

// 실물 클리커 등록 — 사진 촬영/선택 → 배경 제거 미리보기 → 이름 짓고 저장
export default function Capture({ count, toast, onSaved, onCancel }) {
  const [hasSrc, setHasSrc] = useState(false);
  const [tol, setTol] = useState(26);
  const [result, setResult] = useState(null);   // { img, w, h } | null(피사체 못 찾음)
  const [name, setName] = useState('');
  const srcRef = useRef(null);                  // 작업용 캔버스(슬라이더 재계산용)

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const cv = await loadSource(f);
      srcRef.current = cv;
      setHasSrc(true);
      setResult(cutout(cv, tol));
    } catch {
      toast('사진을 읽지 못했어요');
    }
  };

  const onTol = (v) => {
    setTol(v);
    if (srcRef.current) setResult(cutout(srcRef.current, v));
  };

  const save = () => {
    if (!result) return;
    onSaved({
      id: 'cap_' + Date.now().toString(36),
      name: name.trim() || `클리커 ${count + 1}`,
      ...result,
      ts: Date.now(),
    });
  };

  const fileInput = (
    <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
  );

  return (
    <div className="col" onClick={onCancel}>
      <div className="col-card" onClick={(e) => e.stopPropagation()}>
        <div className="col-head">
          <span className="t">실물 클리커 등록</span>
        </div>

        {!hasSrc ? (
          <>
            <p className="cp-guide">
              가지고 있는 <b>실물 클리커 캐릭터</b>를 사진으로 찍어보세요.<br />
              배경이 지워지고 게임 캐릭터로 변신해요.<br />
              <span className="dim">밝은 단색 배경에서 찍으면 가장 잘 잘려요.</span>
            </p>
            <label className="gbtn">사진 찍기 / 불러오기{fileInput}</label>
            <button className="gbtn ghost" onClick={onCancel}>취소</button>
          </>
        ) : (
          <>
            <div className="cp-preview">
              {result ? (
                <img
                  src={result.img}
                  alt="캡처 미리보기"
                  style={{ width: result.w * Math.max(2, Math.floor(140 / Math.max(result.w, result.h))) }}
                />
              ) : (
                <span className="cp-none">캐릭터를 못 찾았어요.<br />세기를 낮추거나 다른 사진으로 시도해보세요.</span>
              )}
            </div>
            <div className="cp-tol">
              <span>배경 지우개 세기</span>
              <input
                type="range" min="8" max="60" value={tol}
                onChange={(e) => onTol(parseInt(e.target.value, 10))}
              />
            </div>
            <input
              className="cp-name"
              value={name}
              placeholder={`이름 (기본: 클리커 ${count + 1})`}
              maxLength={12}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="gbtn" onClick={save} disabled={!result}>콜렉션에 저장</button>
            <label className="gbtn ghost">다른 사진으로{fileInput}</label>
            <button className="gbtn ghost" onClick={onCancel}>취소</button>
          </>
        )}
      </div>
    </div>
  );
}
