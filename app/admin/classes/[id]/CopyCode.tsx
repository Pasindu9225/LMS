'use client';
import { useState } from 'react';

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button" className="rounded border px-2 py-1 text-sm"
      onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true), () => {})}
    >{copied ? 'Copied' : 'Copy'}</button>
  );
}
