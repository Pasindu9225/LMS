import { getUser } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { storage, pagePath } from '@/lib/storage';

/** Redirects to a short-lived signed URL of one page's PDF. Students: live docs only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const page = Number(new URL(req.url).searchParams.get('page'));
  if (!isUuid(id) || !Number.isInteger(page) || page < 1) return new Response('Not found', { status: 404 });
  const [doc] = await sql<{ status: string }[]>`select status from documents where id = ${id}`;
  if (!doc || (doc.status !== 'live' && user.role !== 'admin')) return new Response('Not found', { status: 404 });
  const { data, error } = await storage().createSignedUrl(pagePath(id, page), 3600);
  if (error) return new Response('Not found', { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
