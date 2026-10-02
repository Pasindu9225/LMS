'use client';
import { useActionState, useState } from 'react';
import Markdown from '@/app/Markdown';
import { parseYouTubeId } from '@/lib/youtube';
import type { PageRef, SubjectDoc } from '@/lib/lessons';
import { useT } from '@/app/ui/prefs';
import { Button, Card, Field, Icon, Input, Label, Notice, Select, Textarea, btn } from '@/app/ui/ui';
import { saveLessonAction } from '../lesson-actions';

type Lesson = { id: string; unit_id: string; title: string; body: string; youtube_id: string | null; sort_order: number; published: boolean };
type Props = { units: { id: string; name_en: string }[]; docs: SubjectDoc[]; lesson: Lesson | null; pages: PageRef[]; unitId: string };

const small = 'min-h-9 py-1';

/** Controlled fields, so nothing typed is lost when the server returns an error. */
export default function LessonEditor({ units, docs, lesson, pages: initialPages, unitId }: Props) {
  const { t } = useT();
  const S = t.staff;
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
    <form action={run} className="space-y-5">
      {lesson && <input type="hidden" name="id" value={lesson.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_7rem]">
        <Field label={S.lessonTitle}><Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></Field>
        <Field label={S.unit}>
          <Select name="unitId" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full">
            {units.map((u) => <option key={u.id} value={u.id}>{u.name_en}</option>)}
          </Select>
        </Field>
        <Field label={S.position}><Input name="sortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="font-mono" /></Field>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Field label={S.notes}>
          <Textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={50000} rows={20} className="font-mono text-[13px] leading-relaxed" />
        </Field>
        <div className="space-y-1.5">
          <Label>{S.preview}</Label>
          <div className="h-[31.5rem] overflow-y-auto rounded-lg border border-border bg-surface px-4 py-3 text-[15px]">
            {body ? <Markdown>{body}</Markdown> : <p className="text-subtle">{S.nothingYet}</p>}
          </div>
        </div>
      </div>

      <Field label={S.video} error={video.trim() && !videoId ? S.notYoutube : undefined}>
        <Input name="video" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtu.be/…" className="font-mono text-[13px]" />
      </Field>
      {videoId && (
        <div className="max-w-md overflow-hidden rounded-xl border border-border">
          <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}`} title={S.preview} className="aspect-video w-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}

      <Card>
        <fieldset className="space-y-2">
          <legend className="caps mb-2 text-subtle">{S.textbookPages}</legend>
          {pages.map((p, i) => {
            const doc = docs.find((d) => d.id === p.documentId);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select name="pageDoc" value={p.documentId} onChange={(e) => setPage(i, { documentId: e.target.value })} className={small} aria-label={S.documents}>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.status !== 'live' ? ` ${S.notLive}` : ''}</option>)}
                </Select>
                <Input
                  name="pageFrom" type="number" min={1} max={doc?.page_count || undefined} value={p.from}
                  onChange={(e) => setPage(i, { from: Number(e.target.value) })} className={`${small} w-20 font-mono`} aria-label="from"
                />
                <span className="text-subtle">–</span>
                <Input
                  name="pageTo" type="number" min={1} max={doc?.page_count || undefined} value={p.to}
                  onChange={(e) => setPage(i, { to: Number(e.target.value) })} className={`${small} w-20 font-mono`} aria-label="to"
                />
                <button type="button" onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))} className={btn('ghost', 'sm', 'hover:text-danger')} aria-label={S.remove}>
                  <Icon name="x" />
                </button>
              </div>
            );
          })}
          {docs.length ? (
            <button type="button" onClick={() => setPages((ps) => [...ps, { documentId: docs[0].id, from: 1, to: 1 }])} className={btn('secondary', 'sm')}>
              <Icon name="plus" /> {S.addPages}
            </button>
          ) : <p className="text-sm text-subtle">{S.uploadTextbookFirst}</p>}
        </fieldset>
      </Card>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-bg/90 px-1 py-3 backdrop-blur">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="published" checked={published} onChange={(e) => setPublished(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {S.publishedHint}
        </label>
        <Button disabled={pending} className="ml-auto">{t.common.save}</Button>
        {error && <div className="w-full"><Notice tone="danger">{error}</Notice></div>}
      </div>
    </form>
  );
}
