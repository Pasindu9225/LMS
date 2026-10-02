'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { fmt } from '@/lib/i18n';
import { createUploadUrl, createDocument } from '@/app/admin/actions';
import { useT } from '@/app/ui/prefs';
import { Button, Field, Icon, Input, Notice, Select } from '@/app/ui/ui';

const MAX_BYTES = 200 * 1024 * 1024;

export default function UploadForm({ subjects }: { subjects: { id: string; name_en: string }[] }) {
  const router = useRouter();
  const { t } = useT();
  const S = t.staff;
  const [status, setStatus] = useState<{ tone: 'ok' | 'danger' | 'neutral'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(fd: FormData) {
    const file = fd.get('file') as File;
    if (file.type !== 'application/pdf') return setStatus({ tone: 'danger', text: S.pdfOnly });
    if (file.size > MAX_BYTES) return setStatus({ tone: 'danger', text: S.tooBig });
    setPending(true);
    try {
      setStatus({ tone: 'neutral', text: S.uploading });
      const { path, token } = await createUploadUrl();
      const { error } = await supabaseBrowser().storage.from('documents')
        .uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' });
      if (error) throw error;
      await createDocument({
        subjectId: String(fd.get('subjectId')), title: String(fd.get('title')),
        docType: String(fd.get('docType')), year: String(fd.get('year') ?? ''), path,
      });
      setStatus({ tone: 'ok', text: S.uploaded });
      router.refresh();
    } catch (e) {
      setStatus({ tone: 'danger', text: fmt(S.uploadFailed, { msg: (e as Error).message }) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1.2fr_6rem_auto] lg:items-end">
      <Field label={S.title}><Input name="title" required /></Field>
      <Field label={S.subject}>
        <Select name="subjectId" required className="w-full">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select>
      </Field>
      <Field label={S.type}>
        <Select name="docType" className="w-full">
          <option value="textbook">{S.typeTextbook}</option>
          <option value="past_paper">{S.typePastPaper}</option>
          <option value="marking_scheme">{S.typeScheme}</option>
          <option value="syllabus">{S.typeSyllabus}</option>
          <option value="other">{S.typeOther}</option>
        </Select>
      </Field>
      <Field label={S.year}><Input name="year" type="number" min={1990} max={2100} /></Field>
      <Field label={S.file} className="sm:col-span-2 lg:col-span-4">
        <Input name="file" type="file" accept="application/pdf" required className="file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm file:text-fg" />
      </Field>
      <Button disabled={pending}><Icon name="upload" /> {S.upload}</Button>
      {status && <div className="sm:col-span-2 lg:col-span-5"><Notice tone={status.tone}>{status.text}</Notice></div>}
    </form>
  );
}
