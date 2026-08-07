import { useCallback, useEffect, useRef, useState } from 'react';
import { MSG_W, MSG_H, PRESETS, encodeBitmap, plotLine, stamp } from '../lib/bitmap';

// 화면에 그릴 때 픽셀 하나의 크기(내부 캔버스 해상도용)
const PX = 8;
const UNDO_MAX = 15;

// 친구 기기(64×32 OLED)에 보낼 픽셀 그림 에디터.
// 실제 기기와 같은 해상도로 그리므로 여기 보이는 것이 그대로 상대 화면에 뜬다.
export default function PixelDraw({ targetName, sending, onSend, onClose }) {
  const canvasRef = useRef(null);
  const pxRef = useRef(new Uint8Array(MSG_W * MSG_H));
  const undoRef = useRef([]);
  const strokeRef = useRef(null); // { last: [x, y] } — 그리는 중일 때만
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState('pen');
  const [size, setSize] = useState(2);
  const [empty, setEmpty] = useState(true);

  const touch = useCallback(() => {
    setVersion((v) => v + 1);
    setEmpty(!pxRef.current.some((v) => v));
  }, []);

  const pushUndo = useCallback(() => {
    undoRef.current.push(Uint8Array.from(pxRef.current));
    if (undoRef.current.length > UNDO_MAX) undoRef.current.shift();
  }, []);

  // ---- 캔버스 렌더 --------------------------------------------------------
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const px = pxRef.current;

    ctx.fillStyle = '#12140f';               // 꺼진 픽셀 = OLED 배경
    ctx.fillRect(0, 0, cv.width, cv.height);

    ctx.fillStyle = '#cfe8ff';               // 켜진 픽셀 = OLED 발광
    for (let y = 0; y < MSG_H; y++) {
      for (let x = 0; x < MSG_W; x++) {
        if (px[y * MSG_W + x]) ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';  // 격자
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < MSG_W; x++) { ctx.moveTo(x * PX + 0.5, 0); ctx.lineTo(x * PX + 0.5, cv.height); }
    for (let y = 1; y < MSG_H; y++) { ctx.moveTo(0, y * PX + 0.5); ctx.lineTo(cv.width, y * PX + 0.5); }
    ctx.stroke();
  }, [version]);

  // ---- 포인터 → 셀 좌표 ---------------------------------------------------
  const cellAt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [
      Math.floor(((e.clientX - r.left) / r.width) * MSG_W),
      Math.floor(((e.clientY - r.top) / r.height) * MSG_H),
    ];
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pushUndo();
    const [x, y] = cellAt(e);
    strokeRef.current = { last: [x, y] };
    stamp(pxRef.current, MSG_W, MSG_H, x, y, size, tool === 'pen' ? 1 : 0);
    touch();
  };

  const onMove = (e) => {
    if (!strokeRef.current) return;
    const [x, y] = cellAt(e);
    const [lx, ly] = strokeRef.current.last;
    if (x === lx && y === ly) return;
    plotLine(pxRef.current, MSG_W, MSG_H, lx, ly, x, y, size, tool === 'pen' ? 1 : 0);
    strokeRef.current.last = [x, y];
    touch();
  };

  const onUp = () => { strokeRef.current = null; };

  // ---- 도구 ---------------------------------------------------------------
  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    pxRef.current = prev;
    touch();
  };

  const clear = () => {
    pushUndo();
    pxRef.current = new Uint8Array(MSG_W * MSG_H);
    touch();
  };

  const applyPreset = (p) => {
    pushUndo();
    p.apply(pxRef.current, MSG_W, MSG_H);
    touch();
  };

  const send = () => {
    if (empty || sending) return;
    onSend(encodeBitmap(pxRef.current, MSG_W, MSG_H));
  };

  return (
    <div className="pd" onClick={onClose}>
      <div className="pd-card" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <span className="t">{targetName}에게 보내기</span>
          <span className="n">{MSG_W}×{MSG_H}</span>
        </div>

        <canvas
          ref={canvasRef}
          className="pd-canvas"
          width={MSG_W * PX}
          height={MSG_H * PX}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        <div className="pd-presets">
          {PRESETS.map((p) => (
            <button key={p.id} className="pd-chip" onClick={() => applyPreset(p)}>{p.label}</button>
          ))}
        </div>

        <div className="pd-tools">
          <div className="pd-group">
            <button className={'pd-tool' + (tool === 'pen' ? ' on' : '')} onClick={() => setTool('pen')}>펜</button>
            <button className={'pd-tool' + (tool === 'eraser' ? ' on' : '')} onClick={() => setTool('eraser')}>지우개</button>
          </div>
          <div className="pd-group">
            {[1, 2, 3].map((s) => (
              <button key={s} className={'pd-tool' + (size === s ? ' on' : '')} onClick={() => setSize(s)}>{s}</button>
            ))}
          </div>
          <div className="pd-group">
            <button className="pd-tool" onClick={undo} disabled={!undoRef.current.length}>되돌리기</button>
            <button className="pd-tool" onClick={clear}>전체 지우기</button>
          </div>
        </div>

        <div className="pd-actions">
          <button className="gbtn ghost" onClick={onClose}>닫기</button>
          <button className="gbtn" onClick={send} disabled={empty || sending}>
            {sending ? '보내는 중…' : empty ? '그림을 그려주세요' : '기기로 보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
