'use client';
import { useState } from 'react';
import { useT } from '@/app/ui/prefs';
import { Icon, btn } from '@/app/ui/ui';

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useT();
  return (
    <button
      type="button" className={btn('secondary', 'sm')}
      onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true), () => {})}
    >
      <Icon name={copied ? 'check' : 'copy'} className="size-3.5" /> {copied ? t.staff.copied : t.staff.copy}
    </button>
  );
}
