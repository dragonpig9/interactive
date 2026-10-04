import { db, uid } from '../db';
import type { Activity, ActivityItem } from '../types';
import { difficultItems, itemKey } from './progress';

/**
 * Build "Practise difficult items" activities from progress records. Items are copied from the
 * activities they came from (keeping their progress key), grouped by template.
 */
export async function buildDifficultPractice(studentId: string, subjectId?: string, limit = 12): Promise<Activity[]> {
  const hard = await difficultItems(studentId, subjectId, 50);
  if (!hard.length) return [];
  const keys = new Set(hard.map((h) => h.itemKey));
  const acts = await db.activities.where('studentId').equals(studentId).toArray();
  const byTemplate = new Map<string, { source: Activity; items: ActivityItem[] }>();
  const seen = new Set<string>();
  for (const a of acts) {
    if (a.generated && !a.reviewed) continue;
    for (const it of a.items) {
      const k = itemKey(a, it);
      if (!keys.has(k) || seen.has(k) || seen.size >= limit) continue;
      seen.add(k);
      const g = byTemplate.get(a.template) ?? { source: a, items: [] };
      g.items.push({ ...it, id: uid('i_'), key: k });
      byTemplate.set(a.template, g);
    }
  }
  const out: Activity[] = [];
  for (const [template, g] of byTemplate) {
    const now = Date.now();
    const act: Activity = {
      ...g.source,
      id: uid('a_'),
      title: `🔁 Practise difficult items · 難點練習 (${g.items.length})`,
      template: template as Activity['template'],
      mode: 'revision',
      items: g.items,
      sourceMaterialId: undefined,
      generated: false,
      reviewed: true,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.activities.add(act);
    out.push(act);
  }
  return out;
}
