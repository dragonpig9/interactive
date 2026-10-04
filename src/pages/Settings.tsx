import { useEffect, useState } from 'react';
import { db, getSetting, setSetting } from '../db';
import { useL, useUiLang } from '../i18n';
import { Field, useToast } from '../ui';
import { BACKUP_FORMAT, downloadBlob, exportBackup, fmtBytes, importBackup, requestPersist, storageInfo } from '../lib/backup';
import { cantoneseVoices, englishVoices, loadVoices, setVoicePrefs, speak, ttsSupported } from '../lib/speech';
import { seedSamples } from '../samples';
import { deleteStudent } from '../db';

export default function Settings() {
  const L = useL();
  const toast = useToast();
  const { lang, setLang } = useUiLang();
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean }>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState<{ zh?: string; en?: string; rate: number }>({ rate: 0.85 });
  const [busy, setBusy] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [lastBackup, setLastBackup] = useState<string>();
  const [swState, setSwState] = useState('');

  const refresh = async () => {
    setInfo(await storageInfo());
    setCounts({
      students: await db.students.count(),
      materials: await db.materials.count(),
      activities: await db.activities.count(),
      lessons: await db.lessons.count(),
      files: await db.files.count(),
      progress: await db.progress.count(),
    });
    setLastBackup(await getSetting<string | undefined>('lastBackup', undefined));
  };
  useEffect(() => {
    refresh();
    loadVoices().then(setVoices);
    getSetting('voicePrefs', { rate: 0.85 }).then(setPrefs);
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => setSwState(r?.active ? 'active' : 'none'));
    else setSwState('unsupported');
  }, []);

  const savePrefs = (p: typeof prefs) => {
    setPrefs(p);
    setVoicePrefs(p);
    setSetting('voicePrefs', p);
  };
  const zh = voices.length ? cantoneseVoices() : [];
  const en = voices.length ? englishVoices() : [];

  return (
    <div className="narrow-wide">
      <h1>⚙️ {L('Settings, storage & backup', '設定、儲存及備份')}</h1>

      <section className="card form">
        <h2>🌐 {L('Interface language', '介面語言')}</h2>
        <div className="row gap-s">
          <button className={`btn ${lang === 'zh' ? 'primary' : ''}`} onClick={() => setLang('zh')}>
            繁體中文
          </button>
          <button className={`btn ${lang === 'en' ? 'primary' : ''}`} onClick={() => setLang('en')}>
            English
          </button>
        </div>
        <p className="muted small">{L('Activity content keeps its own language: Chinese is read in Cantonese, English in English.', '活動內容保留原本語言：中文以粵語朗讀，英文以英語朗讀。')}</p>
      </section>

      <section className="card form">
        <h2>🔊 {L('Voices', '語音')}</h2>
        {!ttsSupported() && <div className="alert error">{L('This browser cannot speak text. Use tutor recordings (🎙) instead.', '此瀏覽器不能朗讀文字，請使用導師錄音（🎙）。')}</div>}
        <div className="grid2">
          <Field label={L('Cantonese voice', '粵語語音')}>
            <select value={prefs.zh || ''} onChange={(e) => savePrefs({ ...prefs, zh: e.target.value || undefined })}>
              <option value="">{zh.length ? L('Automatic', '自動') : L('None found on this device', '此裝置沒有')}</option>
              {zh.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) {v.localService ? '✈️' : '🌐'}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('English voice', '英語語音')}>
            <select value={prefs.en || ''} onChange={(e) => savePrefs({ ...prefs, en: e.target.value || undefined })}>
              <option value="">{L('Automatic', '自動')}</option>
              {en.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) {v.localService ? '✈️' : '🌐'}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Speaking speed', '語速')}>
            <input type="range" min={0.5} max={1.2} step={0.05} value={prefs.rate} onChange={(e) => savePrefs({ ...prefs, rate: +e.target.value })} />
          </Field>
          <div className="row gap-s">
            <button className="btn" onClick={() => speak('我的家有爸爸媽媽', 'zh')}>
              ▶ 粵語測試
            </button>
            <button className="btn" onClick={() => speak('The cat is on the mat.', 'en')}>
              ▶ English test
            </button>
          </div>
        </div>
        {!zh.length && (
          <div className="alert warn">
            {L(
              'No Cantonese (zh-HK) voice was found. On Windows: Settings → Time & language → Speech → add "Chinese (Traditional, Hong Kong SAR)". On Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Chinese (Hong Kong). Meanwhile, record your own voice with 🎙 next to any word — recordings are reused everywhere and work offline.',
              '找不到粵語（zh-HK）語音。Windows：設定 → 時間與語言 → 語音 → 新增「中文（繁體，香港特別行政區）」。Mac：系統設定 → 輔助使用 → 語音內容 → 系統語音 → 管理語音 → 中文（香港）。同時，你可以在詞語旁按 🎙 錄音，錄音會在各處重用，並可離線使用。',
            )}
          </div>
        )}
        <p className="small muted">✈️ {L('works offline', '可離線')} · 🌐 {L('online voice — needs internet', '網上語音，需要網絡')}</p>
      </section>

      <section className="card form">
        <h2>💾 {L('Where your data is saved', '資料儲存位置')}</h2>
        <p>
          {L(
            'Everything (students, lessons, uploads, recordings, annotations and progress) is saved in this browser on this computer (IndexedDB). Nothing is uploaded to a server. Clearing browser data or using another browser/computer will not show it — keep backups.',
            '所有資料（學生、課堂、上載檔案、錄音、筆跡及進度）都儲存在這部電腦的這個瀏覽器內（IndexedDB），不會上載到伺服器。清除瀏覽器資料或改用其他瀏覽器／電腦將看不到資料，請定期備份。',
          )}
        </p>
        {info && (
          <ul className="plain">
            <li>
              {L('Used', '已用')}: <strong>{fmtBytes(info.usage)}</strong> {info.quota ? `/ ${fmtBytes(info.quota)} ${L('available to this app', '可用')}` : ''}
            </li>
            <li>
              {info.persisted ? '🔒 ' + L('Protected storage: the browser will not clear it automatically.', '受保護儲存：瀏覽器不會自動清除。') : '⚠️ ' + L('Not yet protected: the browser may clear data if the disk is nearly full.', '尚未受保護：磁碟空間不足時瀏覽器可能會清除資料。')}{' '}
              {!info.persisted && (
                <button
                  className="btn small"
                  onClick={async () => {
                    const ok = await requestPersist();
                    toast({ kind: ok ? 'ok' : 'info', text: ok ? L('Storage is now protected.', '儲存已受保護。') : L('The browser declined. Installing the app (address bar → Install) or bookmarking it usually helps. Keep backups.', '瀏覽器拒絕了。安裝此程式（網址列 → 安裝）或加入書籤通常有幫助。請保持備份。') });
                    refresh();
                  }}
                >
                  {L('Protect my data', '保護我的資料')}
                </button>
              )}
            </li>
            <li className="small muted">
              {Object.entries(counts)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </li>
            <li>
              {L('Offline app files', '離線程式檔案')}: {swState === 'active' ? '✈️ ' + L('installed — the app opens without internet', '已安裝，無網絡亦可開啟') : swState === 'unsupported' ? L('not supported in this browser', '此瀏覽器不支援') : L('not installed yet (reload once while online)', '尚未安裝（請在有網絡時重新載入一次）')}
            </li>
          </ul>
        )}
      </section>

      <section className="card form">
        <h2>📦 {L('Backup & restore', '備份及還原')}</h2>
        <p className="muted">{L(`A backup is one .zip file with all records and every uploaded file and recording. Last backup: ${lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}.`, `備份是一個 .zip 檔案，包括所有記錄、上載檔案及錄音。上次備份：${lastBackup ? new Date(lastBackup).toLocaleString() : '從未'}。`)}</p>
        <div className="row gap-s wrap">
          <button
            className="btn primary"
            disabled={!!busy}
            onClick={async () => {
              try {
                setBusy(L('Preparing backup…', '準備備份…'));
                const blob = await exportBackup(setBusy);
                const d = new Date();
                downloadBlob(blob, `tutor-studio-backup-${d.toISOString().slice(0, 10)}.zip`);
                await setSetting('lastBackup', d.toISOString());
                toast({ kind: 'ok', text: L(`Backup downloaded (${fmtBytes(blob.size)}). Keep it in a safe place, e.g. cloud drive or USB.`, `已下載備份（${fmtBytes(blob.size)}）。請存放於安全位置，例如雲端或 USB。`) });
                refresh();
              } catch (e) {
                toast({ kind: 'error', text: L('Backup failed: ', '備份失敗：') + (e as Error).message });
              }
              setBusy('');
            }}
          >
            ⬇ {L('Export backup (.zip)', '匯出備份（.zip）')}
          </button>
          <select value={importMode} onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')} aria-label={L('Import mode', '匯入方式')}>
            <option value="merge">{L('Import: merge with current data', '匯入：與現有資料合併')}</option>
            <option value="replace">{L('Import: replace everything', '匯入：取代所有資料')}</option>
          </select>
          <label className="btn">
            ⬆ {L('Import backup', '匯入備份')}
            <input
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (importMode === 'replace' && !confirm(L('Replace ALL current data with this backup?', '用此備份取代所有現有資料？'))) return;
                try {
                  setBusy(L('Importing…', '匯入中…'));
                  const r = await importBackup(f, importMode);
                  toast({ kind: r.missingFiles.length ? 'error' : 'ok', text: L(`Imported ${r.records} records and ${r.files} files.`, `已匯入 ${r.records} 項記錄及 ${r.files} 個檔案。`) + (r.missingFiles.length ? L(` Missing files: ${r.missingFiles.join(', ')}`, ` 缺少檔案：${r.missingFiles.join('、')}`) : '') });
                  setTimeout(() => location.reload(), 1200);
                } catch (err) {
                  toast({ kind: 'error', text: L('Import failed: ', '匯入失敗：') + (err as Error).message + L(' Your current data was not changed.', ' 現有資料沒有改變。') });
                }
                setBusy('');
              }}
            />
          </label>
          {busy && <span className="muted">{busy}</span>}
        </div>
        <p className="small muted">{L(`Backup format: ${BACKUP_FORMAT} v1.`, `備份格式：${BACKUP_FORMAT} v1。`)}</p>
      </section>

      <section className="card form">
        <h2>🌐 {L('What needs internet', '需要網絡的功能')}</h2>
        <ul>
          <li>{L('OCR (reading text from photos/scans) — downloads the recognition engine.', '文字辨識（從相片／掃描讀取文字）：需要下載辨識引擎。')}</li>
          <li>{L('Online voices (marked 🌐) — record your own audio for offline use.', '網上語音（標示 🌐）：可自行錄音以便離線使用。')}</li>
          <li>{L('External exercise search — opens other websites.', '搜尋外部練習：會開啟其他網站。')}</li>
          <li>{L('Everything else (lessons, uploads, activities, marking, progress, backup) works offline once the app has loaded.', '其他功能（課堂、上載、活動、評分、進度、備份）在程式載入後都可離線使用。')}</li>
        </ul>
      </section>

      <section className="card form">
        <h2>🧪 {L('Sample content', '示例內容')}</h2>
        <div className="row gap-s">
          <button
            className="btn"
            onClick={async () => {
              await seedSamples();
              toast({ kind: 'ok', text: L('Sample students added.', '已加入示例學生。') });
            }}
          >
            {L('Add sample students again', '重新加入示例學生')}
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm(L('Remove all sample students and their content?', '移除所有示例學生及其內容？'))) return;
              const samples = await db.students.filter((s) => !!s.isSample).toArray();
              for (const s of samples) await deleteStudent(s.id);
              toast({ kind: 'ok', text: L('Sample content removed.', '已移除示例內容。') });
            }}
          >
            {L('Remove sample content', '移除示例內容')}
          </button>
        </div>
      </section>
    </div>
  );
}
