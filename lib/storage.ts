import { createClient } from '@supabase/supabase-js';

/** Service-key Storage client for the private `documents` bucket. Server/worker only. */
export const storage = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  }).storage.from('documents');

export const pagePath = (documentId: string, pageNo: number) => `pages/${documentId}/${pageNo}.pdf`;
