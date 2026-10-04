import { useEffect, useRef, useState } from 'react';
import { useL } from '../i18n';

/** Free drawing area for working out, writing characters or showing steps. Not handwriting-recognised. */
export default function Scratchpad({ height = 320, onClose }: { height?: number; onClose?: () => void }) {
  const L = useL();
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#1f2937');
  const [eraser, setEraser] = useState(false);
  const strokes = useRef<ImageData[]>([]);
  const last = useRef<[number, number] | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    c.width = r.width * devicePixelRatio;
    c.height = r.height * devicePixelRatio;
    const ctx = c.getContext('2d')!;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    drawGrid(ctx, r.width, r.height);
  }, []);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const ctx = () => ref.current!.getContext('2d')!;

  return (
    <div className="scratchpad">
      <div className="row gap-s">
        <strong className="grow">✏️ {L('Scratchpad', '草稿區')}</strong>
        {['#1f2937', '#d62828', '#1d4ed8', '#15803d'].map((c) => (
          <button key={c} className={`swatch ${color === c && !eraser ? 'on' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setEraser(false); }} aria-label={c} />
        ))}
        <button className={`btn small ${eraser ? 'on' : ''}`} onClick={() => setEraser(!eraser)}>
          🧽
        </button>
        <button
          className="btn small"
          onClick={() => {
            const s = strokes.current.pop();
            if (s) ctx().putImageData(s, 0, 0);
          }}
        >
          ↶
        </button>
        <button
          className="btn small"
          onClick={() => {
            const c = ref.current!;
            const r = c.getBoundingClientRect();
            ctx().clearRect(0, 0, c.width, c.height);
            drawGrid(ctx(), r.width, r.height);
          }}
        >
          {L('Clear', '清除')}
        </button>
        {onClose && (
          <button className="btn small ghost" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <canvas
        ref={ref}
        style={{ height, width: '100%', touchAction: 'none' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const c = ref.current!;
          strokes.current.push(ctx().getImageData(0, 0, c.width, c.height));
          if (strokes.current.length > 30) strokes.current.shift();
          last.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = pos(e);
          const g = ctx();
          g.strokeStyle = eraser ? '#ffffff' : color;
          g.lineWidth = eraser ? 22 : 4;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(...last.current);
          g.lineTo(...p);
          g.stroke();
          last.current = p;
        }}
        onPointerUp={() => (last.current = null)}
      />
    </div>
  );
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#eef0f3';
  ctx.lineWidth = 1;
  for (let x = 40; x < w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 40; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}
