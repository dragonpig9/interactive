import { createContext, useContext, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting } from './db';
import { UiLangContext, useL } from './i18n';
import { ToastHost, go, useRoute } from './ui';
import type { Student, Subject, UiLang } from './types';
import { seedSamples } from './samples';
import { loadVoices, setVoicePrefs } from './lib/speech';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Lessons from './pages/Lessons';
import LessonEditor from './pages/LessonEditor';
import Teach from './pages/Teach';
import Materials from './pages/Materials';
import MaterialReview from './pages/MaterialReview';
import Practice from './pages/Practice';
import ActivityEditor from './pages/ActivityEditor';
import PlayPage from './pages/PlayPage';
import Progress from './pages/Progress';
import Settings from './pages/Settings';
import PrintPage from './pages/PrintPage';

interface StudentCtx {
  student?: Student;
  students: Student[];
  subjects: Subject[]; // visible subjects of active student
  allSubjects: Subject[];
  setActive: (id: string) => void;
}
const Ctx = createContext<StudentCtx>({ students: [], subjects: [], allSubjects: [], setActive: () => {} });
export const useStudent = () => useContext(Ctx);

export default function App() {
  const [lang, setLangState] = useState<UiLang>('zh');
  const [activeId, setActiveId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [dbError, setDbError] = useState<string>();

  useEffect(() => {
    (async () => {
      try {
        setLangState(await getSetting<UiLang>('uiLang', navigator.language.startsWith('zh') ? 'zh' : 'en'));
        if (!(await getSetting('seeded', false))) {
          await seedSamples();
          await setSetting('seeded', true);
        }
        setActiveId(await getSetting<string | undefined>('activeStudent', undefined));
        setVoicePrefs(await getSetting('voicePrefs', { rate: 0.85 }));
        loadVoices();
        setReady(true);
      } catch (e) {
        setDbError(String((e as Error)?.message || e));
      }
    })();
  }, []);

  const students = useLiveQuery(() => db.students.toArray(), []) ?? [];
  const student = students.find((s) => s.id === activeId) ?? students[0];
  const allSubjects = useLiveQuery(() => (student ? db.subjects.where('studentId').equals(student.id).sortBy('order') : []), [student?.id]) ?? [];

  const setLang = (l: UiLang) => {
    setLangState(l);
    setSetting('uiLang', l);
    document.documentElement.lang = l === 'zh' ? 'zh-HK' : 'en';
  };
  const setActive = (id: string) => {
    setActiveId(id);
    setSetting('activeStudent', id);
  };

  if (dbError)
    return (
      <div className="fatal">
        <h1>Storage unavailable / 無法使用儲存空間</h1>
        <p>{dbError}</p>
        <p>
          Private/incognito windows and some browser settings block local storage. Open the app in a normal window of Chrome, Edge or Safari.
          <br />
          無痕模式或部分瀏覽器設定會阻止本機儲存。請在一般視窗開啟。
        </p>
      </div>
    );
  if (!ready) return <div className="loading">…</div>;

  return (
    <UiLangContext.Provider value={{ lang, setLang }}>
      <Ctx.Provider value={{ student, students, allSubjects, subjects: allSubjects.filter((s) => !s.hidden), setActive }}>
        <ToastHost>
          <Shell />
        </ToastHost>
      </Ctx.Provider>
    </UiLangContext.Provider>
  );
}

function Shell() {
  const route = useRoute();
  const L = useL();
  const { lang, setLang } = useContext(UiLangContext);
  const { student, students, setActive } = useStudent();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  const top = route[0] || '';
  // Full-screen views without the tutor navigation.
  if (top === 'teach') return <Teach lessonId={route[1]} />;
  if (top === 'play') return <PlayPage activityId={route[1]} />;
  if (top === 'print') return <PrintPage activityId={route[1]} />;

  const nav: [string, string, string, string][] = [
    ['', '🏠', 'Dashboard', '主頁'],
    ['students', '👧', 'Students', '學生'],
    ['lessons', '📅', 'Lessons', '課堂'],
    ['materials', '📚', 'Materials', '教材'],
    ['practice', '🎯', 'Practice', '練習'],
    ['progress', '📈', 'Progress', '進度'],
  ];
  const active = (k: string) => (k === '' ? top === '' : top === k || (k === 'lessons' && top === 'lesson') || (k === 'materials' && top === 'material') || (k === 'practice' && top === 'activity'));

  let page;
  switch (top) {
    case '':
      page = <Dashboard />;
      break;
    case 'students':
      page = <Students id={route[1]} />;
      break;
    case 'lessons':
      page = <Lessons />;
      break;
    case 'lesson':
      page = <LessonEditor id={route[1]} />;
      break;
    case 'materials':
      page = <Materials />;
      break;
    case 'material':
      page = <MaterialReview id={route[1]} />;
      break;
    case 'practice':
      page = <Practice />;
      break;
    case 'activity':
      page = <ActivityEditor id={route[1]} />;
      break;
    case 'progress':
      page = <Progress />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    default:
      page = <p>{L('Page not found.', '找不到頁面。')}</p>;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark">📘</span> <span className="brand-name">Tutor Studio 導師教室</span>
        </a>
        <nav className="mainnav" aria-label="main">
          {nav.map(([k, icon, en, zh]) => (
            <a key={k} href={`#/${k}`} className={active(k) ? 'active' : ''}>
              <span aria-hidden>{icon}</span> {L(en, zh)}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          {students.length > 0 && (
            <select
              aria-label={L('Current student', '目前學生')}
              className="student-picker"
              value={student?.id}
              onChange={(e) => setActive(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.avatar} {s.name} ({s.grade})
                </option>
              ))}
            </select>
          )}
          <button className="btn small ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} title="Interface language / 介面語言">
            {lang === 'zh' ? 'EN' : '中'}
          </button>
          <a href="#/settings" className={`btn small ghost ${top === 'settings' ? 'active' : ''}`} title={L('Settings, storage & backup', '設定、儲存及備份')}>
            ⚙️
          </a>
          <span className={`net ${online ? 'on' : 'off'}`} title={online ? L('Online', '已連線') : L('Offline — saved materials still work', '離線：已儲存的教材仍可使用')}>
            {online ? '●' : L('Offline', '離線')}
          </span>
        </div>
      </header>
      <main className="page">{page}</main>
    </div>
  );
}

export function NeedStudent() {
  const L = useL();
  return (
    <div className="empty">
      <div className="empty-icon">👧</div>
      <p>{L('Add a student first.', '請先新增學生。')}</p>
      <button className="btn primary" onClick={() => go('/students/new')}>
        {L('Add student', '新增學生')}
      </button>
    </div>
  );
}
