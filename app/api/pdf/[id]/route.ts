import { getUser, subjectScope } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { storage, pagePath } from '@/lib/storage';

/** Redirects to a short-lived signed URL of one page's PDF. Live docs for everyone; others for staff in scope. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const page = Number(new URL(req.url).searchParams.get('page'));
  if (!isUuid(id) || !Number.isInteger(page) || page < 1) return new Response('Not found', { status: 404 });
  const [doc] = await sql<{ status: string; subject_id: string }[]>`select status, subject_id from documents where id = ${id}`;
  if (!doc) return new Response('Not found', { status: 404 });
  if (doc.status !== 'live') {
    const scope = await subjectScope(user); // students get [] and so never see unpublished pages
    if (scope !== null && !scope.includes(doc.subject_id)) return new Response('Not found', { status: 404 });
  }
  const { data, error } = await storage().createSignedUrl(pagePath(id, page), 3600);
  if (error) return new Response('Not found', { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
