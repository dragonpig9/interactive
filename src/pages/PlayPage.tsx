import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useL } from '../i18n';
import Player from '../components/Player';

/** Standalone practice of one activity (outside a lesson). */
export default function PlayPage({ activityId }: { activityId: string }) {
  const L = useL();
  const a = useLiveQuery(() => db.activities.get(activityId), [activityId]);
  const s = useLiveQuery(() => (a ? db.students.get(a.studentId) : undefined), [a?.studentId]);
  if (a === undefined || (a && !s)) return <div className="loading">…</div>;
  if (!a) return <p>{L('Activity not found.', '找不到活動。')}</p>;
  return (
    <div className={`teach-shell style-${s!.style}`}>
      <div className="teach-top">
        <button className="btn ghost" onClick={() => history.back()}>
          ✕ {L('Close', '關閉')}
        </button>
        <strong className="grow center-text">{a.title}</strong>
        <span>{s!.avatar} {s!.name}</span>
      </div>
      <div className="teach-main single">
        <Player activity={a} student={s!} onExit={() => history.back()} />
      </div>
    </div>
  );
}
