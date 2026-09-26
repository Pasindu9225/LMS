'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { createUploadUrl, createDocument } from '@/app/admin/actions';

const MAX_BYTES = 200 * 1024 * 1024;
const input = 'rounded border p-1 text-sm';

export default function UploadForm({ subjects }: { subjects: { id: string; name_en: string }[] }) {
  const router = useRouter();
  const [status, setStatus] = useState('');

  async function submit(fd: FormData) {
    const file = fd.get('file') as File;
    if (file.type !== 'application/pdf') return setStatus('Only PDF files are allowed.');
    if (file.size > MAX_BYTES) return setStatus('File is larger than 200 MB.');
    try {
      setStatus('Uploading…');
      const { path, token } = await createUploadUrl();
      const { error } = await supabaseBrowser().storage.from('documents')
        .uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' });
      if (error) throw error;
      await createDocument({
        subjectId: String(fd.get('subjectId')), title: String(fd.get('title')),
        docType: String(fd.get('docType')), year: String(fd.get('year') ?? ''), path,
      });
      setStatus('Uploaded. Processing starts within a few seconds.');
      router.refresh();
    } catch (e) {
      setStatus(`Upload failed: ${(e as Error).message}`);
    }
  }

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2 rounded border p-3">
      <input name="file" type="file" accept="application/pdf" required className="text-sm" />
      <select name="subjectId" required className={input}>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
      </select>
      <input name="title" required placeholder="Title" className={input} />
      <select name="docType" className={input}>
        <option value="textbook">Textbook</option>
        <option value="past_paper">Past paper</option>
        <option value="marking_scheme">Marking scheme</option>
        <option value="syllabus">Syllabus</option>
        <option value="other">Other</option>
      </select>
      <input name="year" type="number" min={1990} max={2100} placeholder="Year" className={`${input} w-24`} />
      <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white">Upload</button>
      {status && <p className="w-full text-sm text-gray-700">{status}</p>}
    </form>
  );
}
