'use client';
import { useActionState, useState } from 'react';
import Markdown from '@/app/Markdown';
import { parseYouTubeId } from '@/lib/youtube';
import type { PageRef, SubjectDoc } from '@/lib/lessons';
import { saveLessonAction } from '../lesson-actions';

type Lesson = { id: string; unit_id: string; title: string; body: string; youtube_id: string | null; sort_order: number; published: boolean };
type Props = { units: { id: string; name_en: string }[]; docs: SubjectDoc[]; lesson: Lesson | null; pages: PageRef[]; unitId: string };

const input = 'rounded border p-1 text-sm';

/** Controlled fields, so nothing typed is lost when the server returns an error. */
export default function LessonEditor({ units, docs, lesson, pages: initialPages, unitId }: Props) {
  const [error, run, pending] = useActionState(saveLessonAction, '');
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [unit, setUnit] = useState(lesson?.unit_id ?? unitId);
  const [sortOrder, setSortOrder] = useState(String(lesson?.sort_order ?? 0));
  const [body, setBody] = useState(lesson?.body ?? '');
  const [video, setVideo] = useState(lesson?.youtube_id ? `https://youtu.be/${lesson.youtube_id}` : '');
  const [published, setPublished] = useState(lesson?.published ?? false);
  const [pages, setPages] = useState<PageRef[]>(initialPages);
  const videoId = video.trim() ? parseYouTubeId(video) : null;
  const setPage = (i: number, p: Partial<PageRef>) => setPages((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <form action={run} className="space-y-3">
      {lesson && <input type="hidden" name="id" value={lesson.id} />}
      <div className="flex flex-wrap gap-2">
        <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Lesson title" className={`${input} min-w-64 flex-1`} />
        <select name="unitId" value={unit} onChange={(e) => setUnit(e.target.value)} className={input} aria-label="Unit">
          {units.map((u) => <option key={u.id} value={u.id}>{u.name_en}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm">Position
          <input name="sortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={`${input} w-20`} />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Notes (Markdown, LaTeX with $…$)</span>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={50000} rows={18} className="w-full rounded border p-2 font-mono text-sm" />
        </label>
        <div className="space-y-1 text-sm">
          <span className="font-medium">Preview</span>
          <div className="h-[27rem] overflow-y-auto rounded border bg-white p-3">
            {body ? <Markdown>{body}</Markdown> : <p className="text-gray-400">Nothing yet.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-medium">YouTube video</span>
          <input name="video" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" className={`${input} min-w-72 flex-1`} />
        </label>
        {video.trim() && !videoId && <p className="text-red-600">Not a YouTube video link.</p>}
        {videoId && (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`} title="Video preview" className="aspect-video w-full max-w-md rounded"
            allow="encrypted-media; picture-in-picture" allowFullScreen
          />
        )}
      </div>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">Textbook pages</legend>
        {pages.map((p, i) => {
          const doc = docs.find((d) => d.id === p.documentId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select name="pageDoc" value={p.documentId} onChange={(e) => setPage(i, { documentId: e.target.value })} className={input} aria-label="Document">
                {docs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.status !== 'live' ? ' (not live yet)' : ''}</option>)}
              </select>
              <input
                name="pageFrom" type="number" min={1} max={doc?.page_count || undefined} value={p.from}
                onChange={(e) => setPage(i, { from: Number(e.target.value) })} className={`${input} w-20`} aria-label="From page"
              />
              <span>–</span>
              <input
                name="pageTo" type="number" min={1} max={doc?.page_count || undefined} value={p.to}
                onChange={(e) => setPage(i, { to: Number(e.target.value) })} className={`${input} w-20`} aria-label="To page"
              />
              <button type="button" onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))} className="text-gray-500 underline">Remove</button>
            </div>
          );
        })}
        {docs.length ? (
          <button type="button" onClick={() => setPages((ps) => [...ps, { documentId: docs[0].id, from: 1, to: 1 }])} className="text-blue-600 underline">+ Add pages</button>
        ) : <p className="text-gray-500">Upload this subject&apos;s textbook in Documents to link pages.</p>}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="published" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published (students can see it)
        </label>
        <button disabled={pending} className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50">Save</button>
        {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
