import { getT } from '@/lib/prefs';
import { ButtonLink } from '@/app/ui/ui';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-6xl font-semibold tracking-tight text-subtle">404</p>
      <p className="text-muted">{t.common.notFound}</p>
      <ButtonLink href="/" variant="secondary">{t.common.home}</ButtonLink>
    </main>
  );
}
