import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useL } from '../i18n';
import { openPdf } from '../lib/extract';
import { useFileUrl } from '../ui';
import type { Stroke } from '../types';

type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

/**
 * Shows an original upload: PDF pages (zoom + page controls), images, text and DOCX fallback.
 * Optional drawing layer saves annotations per file page. Optional crop tool saves a region as a picture.
 */
export default function FileViewer({
  fileId,
  annotate = true,
  onCrop,
  initialPage = 1,
  onPageChange,
  tall,
}: {
  fileId: string;
  annotate?: boolean;
  onCrop?: (blob: Blob, page: number) => void;
  initialPage?: number;
  onPageChange?: (p: number) => void;
  tall?: boolean;
}) {
  const L = useL();
  const { url, file } = useFileUrl(fileId);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [doc, setDoc] = useState<PdfDoc>();
  const [err, setErr] = useState('');
  const [tool, setTool] = useState<'none' | 'pen' | 'crop'>('none');
  const [color, setColor] = useState('#d62828');
  const [text, setText] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const isPdf = file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  const isImage = file?.type.startsWith('image/');
  const isText = file && (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt'));
  const isAudio = file?.type.startsWith('audio/');

  useEffect(() => setPage(initialPage), [fileId, initialPage]);
  useEffect(() => onPageChange?.(page), [page]); // eslint-disable-line

  useEffect(() => {
    setErr('');
    setDoc(undefined);
    if (!file) return;
    if (isPdf) {
      openPdf(file.blob)
        .then((d) => {
          setDoc(d);
          setPages(d.numPages);
        })
        .catch((e) => setErr(L('This PDF could not be displayed: ', '無法顯示此 PDF：') + e.message));
    } else if (isText) file.blob.text().then(setText);
    else setPages(1);
  }, [file?.id]); // eslint-disable-line

  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | undefined;
    (async () => {
      const p = await doc.getPage(Math.min(page, doc.numPages));
      if (cancelled) return;
      const boxW = boxRef.current?.clientWidth || 800;
      const base = p.getViewport({ scale: 1 });
      const fit = (boxW - 8) / base.width;
      const vp = p.getViewport({ scale: fit * zoom * (window.devicePixelRatio || 1) });
      const c = canvasRef.current!;
      c.width = vp.width;
      c.height = vp.height;
      const cssW = vp.width / (window.devicePixelRatio || 1);
      const cssH = vp.height / (window.devicePixelRatio || 1);
      c.style.width = cssW + 'px';
      c.style.height = cssH + 'px';
      setSize({ w: cssW, h: cssH });
      task = p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  if (!file) return <div className="viewer-missing">{L('File not found in storage.', '儲存空間中找不到檔案。')}</div>;

  const toolbar = (
    <div className="viewer-bar">
      {(isPdf || pages > 1) && (
        <>
          <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={L('Previous page', '上一頁')}>
            ◀
          </button>
          <span className="pg">
            {page} / {pages}
          </span>
          <button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={L('Next page', '下一頁')}>
            ▶
          </button>
        </>
      )}
      {(isPdf || isImage) && (
        <>
          <button className="btn small" onClick={() => setZoom(Math.max(0.4, zoom - 0.2))} aria-label="zoom out">
            −
          </button>
          <span className="pg">{Math.round(zoom * 100)}%</span>
          <button className="btn small" onClick={() => setZoom(Math.min(4, zoom + 0.2))} aria-label="zoom in">
            +
          </button>
          <button className="btn small ghost" onClick={() => setZoom(1)}>
            {L('Fit', '適合')}
          </button>
          {annotate && (
            <>
              <button className={`btn small ${tool === 'pen' ? 'on' : ''}`} onClick={() => setTool(tool === 'pen' ? 'none' : 'pen')}>
                ✏️ {L('Draw', '畫')}
              </button>
              {tool === 'pen' && (
                <>
                  {['#d62828', '#1d4ed8', '#15803d', '#111111'].map((c) => (
                    <button key={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
                  ))}
                  <ClearAnnotations fileId={fileId} page={page} />
                </>
              )}
            </>
          )}
          {onCrop && (
            <button className={`btn small ${tool === 'crop' ? 'on' : ''}`} onClick={() => setTool(tool === 'crop' ? 'none' : 'crop')} title={L('Drag a box to save part of the page as a picture', '拖出方框，把部分頁面存為圖片')}>
              ✂️ {L('Save picture', '存為圖片')}
            </button>
          )}
        </>
      )}
      <a className="btn small ghost" href={url} download={file.name} target="_blank" rel="noreferrer">
        ⬇ {L('Original', '原檔')}
      </a>
    </div>
  );

  return (
    <div className={`viewer ${tall ? 'tall' : ''}`}>
      {toolbar}
      <div className="viewer-body" ref={boxRef}>
        {err && <div className="alert error">{err}</div>}
        {isPdf && (
          <div className="page-wrap" style={{ width: size.w, height: size.h }}>
            <canvas ref={canvasRef} />
            <Overlay fileId={fileId} page={page} w={size.w} h={size.h} tool={tool} color={color} source={canvasRef} onCrop={onCrop && ((b) => { onCrop(b, page); setTool('none'); })} />
          </div>
        )}
        {isImage && url && <ImageWithOverlay url={url} zoom={zoom} fileId={fileId} tool={tool} color={color} onCrop={onCrop && ((b) => { onCrop(b, 1); setTool('none'); })} />}
        {isText && <pre className="text-view">{text}</pre>}
        {isAudio && url && <audio controls src={url} />}
        {!isPdf && !isImage && !isText && !isAudio && (
          <div className="alert">
            {L('This file type cannot be shown inside the app. Use "Original" to open it.', '此檔案類型無法在程式內顯示，請按「原檔」開啟。')} ({file.name})
          </div>
        )}
      </div>
    </div>
  );
}

function ClearAnnotations({ fileId, page }: { fileId: string; page: number }) {
  const L = useL();
  return (
    <>
      <button
        className="btn small ghost"
        onClick={async () => {
          const a = await db.annotations.get(`${fileId}|${page}`);
          if (a?.strokes.length) await db.annotations.put({ ...a, strokes: a.strokes.slice(0, -1), updatedAt: Date.now() });
        }}
      >
        ↶ {L('Undo', '復原')}
      </button>
      <button className="btn small ghost" onClick={() => confirm(L('Clear drawings on this page?', '清除此頁的筆跡？')) && db.annotations.delete(`${fileId}|${page}`)}>
        🧽 {L('Clear', '清除')}
      </button>
    </>
  );
}

function ImageWithOverlay({ url, zoom, fileId, tool, color, onCrop }: { url: string; zoom: number; fileId: string; tool: 'none' | 'pen' | 'crop'; color: string; onCrop?: (b: Blob) => void }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const measure = () => {
    const i = imgRef.current;
    if (i) setSize({ w: i.clientWidth, h: i.clientHeight });
  };
  useEffect(measure, [zoom]);
  return (
    <div className="page-wrap" style={{ width: `${zoom * 100}%` }}>
      <img ref={imgRef} src={url} onLoad={measure} alt="" style={{ width: '100%', display: 'block' }} />
      <Overlay fileId={fileId} page={1} w={size.w} h={size.h} tool={tool} color={color} source={imgRef} onCrop={onCrop} />
    </div>
  );
}

function Overlay({
  fileId,
  page,
  w,
  h,
  tool,
  color,
  source,
  onCrop,
}: {
  fileId: string;
  page: number;
  w: number;
  h: number;
  tool: 'none' | 'pen' | 'crop';
  color: string;
  source: React.RefObject<HTMLCanvasElement | HTMLImageElement | null>;
  onCrop?: (b: Blob) => void;
}) {
  const id = `${fileId}|${page}`;
  const ann = useLiveQuery(() => db.annotations.get(id), [id]);
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const [crop, setCrop] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const redraw = () => {
    const c = ref.current;
    if (!c) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const all = [...(ann?.strokes || []), ...(drawing.current ? [drawing.current] : [])];
    for (const s of all) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.stroke();
    }
  };
  useEffect(redraw, [ann, w, h]); // eslint-disable-line

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as [number, number];
  };

  const doCrop = async (c: { x0: number; y0: number; x1: number; y1: number }) => {
    const src = source.current;
    if (!src || !onCrop) return;
    const sw = src instanceof HTMLCanvasElement ? src.width : src.naturalWidth;
    const sh = src instanceof HTMLCanvasElement ? src.height : src.naturalHeight;
    const x = Math.min(c.x0, c.x1) * sw;
    const y = Math.min(c.y0, c.y1) * sh;
    const cw = Math.abs(c.x1 - c.x0) * sw;
    const ch = Math.abs(c.y1 - c.y0) * sh;
    if (cw < 10 || ch < 10) return;
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d')!.drawImage(src, x, y, cw, ch, 0, 0, cw, ch);
    out.toBlob((b) => b && onCrop(b), 'image/png');
  };

  return (
    <>
      <canvas
        ref={ref}
        className={`overlay ${tool !== 'none' ? 'active' : ''}`}
        style={{ width: w, height: h }}
        onPointerDown={(e) => {
          if (tool === 'none') return;
          (e.target as Element).setPointerCapture(e.pointerId);
          const p = pos(e);
          if (tool === 'pen') drawing.current = { color, width: 3, points: [p] };
          else setCrop({ x0: p[0], y0: p[1], x1: p[0], y1: p[1] });
        }}
        onPointerMove={(e) => {
          if (tool === 'pen' && drawing.current) {
            drawing.current.points.push(pos(e));
            redraw();
          } else if (tool === 'crop' && crop && e.buttons) {
            const p = pos(e);
            setCrop({ ...crop, x1: p[0], y1: p[1] });
          }
        }}
        onPointerUp={async () => {
          if (tool === 'pen' && drawing.current) {
            const s = drawing.current;
            drawing.current = null;
            const prev = await db.annotations.get(id);
            await db.annotations.put({ id, fileId, page, strokes: [...(prev?.strokes || []), s], updatedAt: Date.now() });
          } else if (tool === 'crop' && crop) {
            await doCrop(crop);
            setCrop(null);
          }
        }}
      />
      {crop && (
        <div
          className="crop-box"
          style={{
            left: Math.min(crop.x0, crop.x1) * w,
            top: Math.min(crop.y0, crop.y1) * h,
            width: Math.abs(crop.x1 - crop.x0) * w,
            height: Math.abs(crop.y1 - crop.y0) * h,
          }}
        />
      )}
    </>
  );
}
