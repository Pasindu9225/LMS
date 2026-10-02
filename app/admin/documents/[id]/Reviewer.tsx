'use client';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { docStatus, fmt } from '@/lib/i18n';
import { savePage, retryOcr, setUnitRange, setDocumentStatus, deleteDocument } from '@/app/admin/actions';
import { useT } from '@/app/ui/prefs';
import { Badge, Button, Card, Icon, Input, Notice, PageHeader, Select, Textarea, statusTone } from '@/app/ui/ui';

type Doc = { id: string; title: string; status: string; error: string | null; subject: string; page_count: number; pages_done: number };
type Page = { page_no: number; text: string; unit_id: string | null; ocr_failed: boolean; reviewed: boolean };
type Unit = { id: string; name_en: string; name_si: string };

export default function Reviewer({ doc, pages, units }: { doc: Doc; pages: Page[]; units: Unit[] }) {
  const router = useRouter();
  const { lang, t } = useT();
  const S = t.staff;
  const [n, setN] = useState(pages.find((p) => p.ocr_failed)?.page_no ?? pages[0]?.page_no ?? 1);
  const [msg, setMsg] = useState<{ tone: 'neutral' | 'ok' | 'danger'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const page = pages.find((p) => p.page_no === n);
  const unitName = (id: string | null) => {
    const u = units.find((x) => x.id === id);
    return u ? (lang === 'si' ? u.name_si : u.name_en) : '—';
  };

  // Progress text is set outside the transition so it shows immediately; the server actions
  // call revalidatePath, which already refreshes this page's data.
  const run = (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setMsg({ tone: 'neutral', text: `${label}…` });
    start(async () => {
      try {
        await fn();
        setMsg({ tone: 'ok', text: `${label}: ${S.done}` });
        after?.();
      } catch (e) {
        setMsg({ tone: 'danger', text: `${label} ${fmt(S.failed, { msg: (e as Error).message })}` });
      }
    });
  };

  function unitRange(fd: FormData) {
    const unit = String(fd.get('unit'));
    run(S.assignPages, () => setUnitRange(doc.id, Number(fd.get('from')), Number(fd.get('to')), unit || null));
  }

  return (
    <div className="space-y-5">
      <Link href="/admin/documents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Icon name="arrowLeft" /> {S.documents}
      </Link>
      <PageHeader
        eyebrow={doc.subject}
        title={doc.title}
        actions={<>
          <Badge tone={statusTone(doc.status)}>{docStatus(t, doc.status)}</Badge>
          {(doc.status === 'review' || doc.status === 'archived') && (
            <Button size="sm" disabled={pending} onClick={() => run(S.publish, () => setDocumentStatus(doc.id, 'live'))}>{S.publish}</Button>
          )}
          {(doc.status === 'live' || doc.status === 'review') && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(S.archive, () => setDocumentStatus(doc.id, 'archived'))}>{S.archive}</Button>
          )}
          {doc.status === 'failed' && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(S.retryProcessing, () => setDocumentStatus(doc.id, 'queued'))}>
              <Icon name="refresh" /> {S.retryProcessing}
            </Button>
          )}
          <Button
            size="sm" variant="danger" disabled={pending}
            onClick={() => confirm(S.confirmDeleteDoc) && run(t.common.delete, () => deleteDocument(doc.id), () => router.push('/admin/documents'))}
          ><Icon name="trash" /> {t.common.delete}</Button>
        </>}
      />
      {doc.error && <Notice tone="danger">{doc.error}</Notice>}
      {(doc.status === 'queued' || doc.status === 'processing') && (
        <Notice>{fmt(S.processing, { done: doc.pages_done, total: doc.page_count || '?' })}</Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {pages.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={n <= 1} onClick={() => setN(n - 1)} aria-label={S.prevPage}><Icon name="arrowLeft" /></Button>
            <Select value={n} onChange={(e) => setN(Number(e.target.value))} className="min-h-9 py-1" aria-label={t.common.page}>
              {pages.map((p) => (
                <option key={p.page_no} value={p.page_no}>
                  {fmt(S.pageN, { n: p.page_no })}{p.ocr_failed ? ` ⚠ ${S.ocrFailed}` : p.reviewed ? ' ✓' : ''}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" disabled={n >= pages.length} onClick={() => setN(n + 1)} aria-label={S.nextPage}><Icon name="arrowRight" /></Button>
            <span className="text-sm text-muted">{fmt(S.unitOf, { name: unitName(page?.unit_id ?? null) })}</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <iframe key={n} src={`/api/pdf/${doc.id}?page=${n}`} title={fmt(S.pageN, { n })} className="h-[70vh] w-full rounded-xl border border-border bg-surface-2" />
              <a href={`/api/pdf/${doc.id}?page=${n}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
                {S.openPage} <Icon name="external" className="size-3" />
              </a>
            </div>
            <div className="flex flex-col gap-2">
              {page?.ocr_failed && <Notice tone="danger">{S.ocrFailedPage}</Notice>}
              <Textarea key={`${n}:${page?.text}`} ref={textRef} defaultValue={page?.text ?? ''} aria-label={fmt(S.pageN, { n })} className="h-[65vh] font-mono text-[13px]" />
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => run(S.savePage, () => savePage(doc.id, n, textRef.current?.value ?? ''))}>{S.savePage}</Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(S.retryOcr, () => retryOcr(doc.id, n))}>
                  <Icon name="refresh" /> {S.retryOcr}
                </Button>
              </div>
            </div>
          </div>

          <Card>
            <form action={unitRange} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="caps text-subtle">{S.assignPages}</span>
              <Input name="from" type="number" min={1} max={pages.length} required defaultValue={n} className="min-h-9 w-20 py-1" aria-label={S.fromPage} />
              <span className="text-muted">{S.to}</span>
              <Input name="to" type="number" min={1} max={pages.length} required defaultValue={n} className="min-h-9 w-20 py-1" aria-label={S.toPage} />
              <Icon name="arrowRight" className="size-3.5 text-subtle" />
              <Select name="unit" className="min-h-9 py-1" aria-label={S.unit}>
                <option value="">{S.noUnit}</option>
                {units.map((u) => <option key={u.id} value={u.id}>{lang === 'si' ? u.name_si : u.name_en}</option>)}
              </Select>
              <Button size="sm" variant="secondary" disabled={pending}>{S.apply}</Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
