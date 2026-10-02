'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireStaff, requireSubject, requireDocument, requireLog } from '@/lib/auth';
import { sql, isUuid, asUser } from '@/lib/db';
import { storage, pagePath } from '@/lib/storage';
import { ocrPage } from '@/lib/gemini';
import { indexPages } from '@/lib/indexing';
import { replyFlag, dismissFlag } from '@/lib/flags';
import { cleanReply } from '@/lib/text';
import { ROLES, type Role } from '@/lib/roles';
import { setUserRole } from '@/lib/users';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function need(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

// ── Subjects & units ─────────────────────────────────────────────
export async function saveSubject(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, 'id'), si = str(fd, 'name_si'), en = str(fd, 'name_en');
  need(si && en, 'Both names are required');
  if (id) need(isUuid(id), 'Bad id');
  await asUser(admin.id, (tx) => id
    ? tx`update subjects set name_si = ${si}, name_en = ${en} where id = ${id}`
    : tx`insert into subjects (name_si, name_en) values (${si}, ${en})`);
  revalidatePath('/admin/subjects');
}

export async function deleteSubject(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  need(isUuid(id), 'Bad id');
  // The UI only offers delete for subjects without documents; the FK blocks it otherwise.
  await sql`delete from subjects where id = ${id}`;
  revalidatePath('/admin/subjects');
}

export async function saveUnit(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, 'id'), subjectId = str(fd, 'subject_id');
  const si = str(fd, 'name_si'), en = str(fd, 'name_en'), order = Number(str(fd, 'sort_order') || 0);
  need(si && en, 'Both names are required');
  need(Number.isInteger(order), 'Order must be a whole number');
  if (id) need(isUuid(id), 'Bad id');
  else need(isUuid(subjectId), 'Bad subject');
  await asUser(admin.id, (tx) => id
    ? tx`update units set name_si = ${si}, name_en = ${en}, sort_order = ${order} where id = ${id}`
    : tx`insert into units (subject_id, name_si, name_en, sort_order) values (${subjectId}, ${si}, ${en}, ${order})`);
  revalidatePath('/admin/subjects');
}

export async function deleteUnit(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  need(isUuid(id), 'Bad id');
  await sql`delete from units where id = ${id}`;
  revalidatePath('/admin/subjects');
}

// ── Documents ────────────────────────────────────────────────────
const DOC_TYPES = ['textbook', 'past_paper', 'marking_scheme', 'syllabus', 'other'];

export async function createUploadUrl() {
  await requireStaff();
  const path = `uploads/${crypto.randomUUID()}.pdf`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token };
}

export async function createDocument(input: {
  subjectId: string; title: string; docType: string; year: string; path: string;
}) {
  const user = await requireStaff();
  const title = input.title.trim();
  const year = input.year ? Number(input.year) : null;
  need(isUuid(input.subjectId), 'Pick a subject');
  await requireSubject(user, input.subjectId);
  need(title, 'Title is required');
  need(DOC_TYPES.includes(input.docType), 'Bad document type');
  need(year === null || (Number.isInteger(year) && year >= 1990 && year <= 2100), 'Bad year');
  need(/^uploads\/[0-9a-f-]{36}\.pdf$/.test(input.path), 'Bad upload path');
  await asUser(user.id, (tx) => tx`
    insert into documents (subject_id, title, doc_type, year, storage_path)
    values (${input.subjectId}, ${title}, ${input.docType}, ${year}, ${input.path})`);
  revalidatePath('/admin/documents');
}

// Which statuses each target status may be set from.
const TRANSITIONS = { live: ['review', 'archived'], archived: ['live', 'review'], queued: ['failed'] };

export async function setDocumentStatus(id: string, status: keyof typeof TRANSITIONS) {
  const user = await requireStaff();
  need(isUuid(id), 'Bad id');
  await requireDocument(user, id);
  need(status in TRANSITIONS, 'Bad status');
  const r = await asUser(user.id, (tx) => tx`
    update documents set status = ${status}, error = null
    where id = ${id} and status = any(${sql.array(TRANSITIONS[status])})`);
  need(r.count === 1, `Cannot change status to ${status} from the current status`);
  revalidatePath('/admin/documents');
  revalidatePath(`/admin/documents/${id}`);
}

export async function deleteDocument(id: string) {
  const user = await requireStaff();
  need(isUuid(id), 'Bad id');
  await requireDocument(user, id);
  const [d] = await sql<{ storage_path: string; page_count: number }[]>`
    delete from documents where id = ${id} returning storage_path, page_count`;
  if (!d) return;
  const paths = [d.storage_path, ...Array.from({ length: d.page_count }, (_, i) => pagePath(id, i + 1))];
  for (let i = 0; i < paths.length; i += 100) await storage().remove(paths.slice(i, i + 100));
  revalidatePath('/admin/documents');
}

// ── Pages (review) ───────────────────────────────────────────────
const pageArgs = (documentId: string, pageNo: number) =>
  need(isUuid(documentId) && Number.isInteger(pageNo) && pageNo >= 1, 'Bad page');

export async function savePage(documentId: string, pageNo: number, text: string) {
  const user = await requireStaff();
  pageArgs(documentId, pageNo);
  await requireDocument(user, documentId);
  const r = await asUser(user.id, (tx) => tx`
    update pages set text = ${text}, reviewed = true, ocr_failed = false
    where document_id = ${documentId} and page_no = ${pageNo}`);
  need(r.count === 1, 'Page not found');
  await indexPages(documentId, [pageNo]);
  revalidatePath(`/admin/documents/${documentId}`);
}

export async function retryOcr(documentId: string, pageNo: number) {
  const user = await requireStaff();
  pageArgs(documentId, pageNo);
  await requireDocument(user, documentId);
  const { data, error } = await storage().download(pagePath(documentId, pageNo));
  if (error) throw error;
  const text = await ocrPage(new Uint8Array(await data.arrayBuffer()));
  await asUser(user.id, (tx) => tx`
    update pages set text = ${text}, ocr_failed = false, reviewed = false
    where document_id = ${documentId} and page_no = ${pageNo}`);
  await indexPages(documentId, [pageNo]);
  revalidatePath(`/admin/documents/${documentId}`);
}

export async function setUnitRange(documentId: string, from: number, to: number, unitId: string | null) {
  const user = await requireStaff();
  need(isUuid(documentId) && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && from <= to, 'Bad page range');
  await requireDocument(user, documentId);
  need(unitId === null || isUuid(unitId), 'Bad unit');
  if (unitId) {
    const [ok] = await sql`
      select 1 from units u join documents d on d.subject_id = u.subject_id
      where u.id = ${unitId} and d.id = ${documentId}`;
    need(ok, 'Unit does not belong to this subject');
  }
  const rows = await asUser(user.id, (tx) => tx<{ page_no: number }[]>`
    update pages set unit_id = ${unitId}
    where document_id = ${documentId} and page_no between ${from} and ${to} returning page_no`);
  await indexPages(documentId, rows.map((r) => r.page_no));
  revalidatePath(`/admin/documents/${documentId}`);
}

// ── Flags ────────────────────────────────────────────────────────
export async function replyToFlag(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'id'), reply = cleanReply(fd.get('reply'));
  need(isUuid(id), 'Bad id');
  await requireLog(user, id);
  need(reply, 'Write a reply (up to 4000 characters)');
  need(await replyFlag(user.id, id, reply), 'Flag is not open');
  revalidatePath('/admin/flags');
}

export async function dismissFlagAction(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'id');
  need(isUuid(id), 'Bad id');
  await requireLog(user, id);
  need(await dismissFlag(user.id, id), 'Flag is not open');
  revalidatePath('/admin/flags');
}

// ── Users ────────────────────────────────────────────────────────
/** Returns '' on success or a message to show (thrown messages are hidden in production). */
export async function saveUserRole(_prev: string, fd: FormData): Promise<string> {
  const admin = await requireAdmin();
  const id = str(fd, 'id'), role = str(fd, 'role') as Role;
  const subjects = fd.getAll('subjects').map(String);
  if (!isUuid(id) || !ROLES.includes(role) || !subjects.every(isUuid)) return 'Invalid input.';
  const error = await setUserRole(admin.id, id, role, subjects);
  if (!error) revalidatePath('/admin/users');
  return error;
}
