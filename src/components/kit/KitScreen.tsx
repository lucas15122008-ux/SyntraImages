'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { setPhotoWarning } from '@/lib/kit/actions';
import { ReviewKit, type ReviewPhoto } from './ReviewKit';

export function KitScreen({ kitId, title, originalUrl, photos }: { kitId: string; title: string; originalUrl: string; photos: ReviewPhoto[] }) {
  const router = useRouter();
  const generate = useCallback(
    async (position: number) => {
      const res = await fetch(`/api/kits/${kitId}/photos/${position}/generate`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string | null };
      if (!res.ok) return { status: 'failed', error: body.error ?? 'Não foi possível gerar esta foto.' };
      return { status: body.status ?? 'failed', error: body.error ?? null };
    },
    [kitId],
  );
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <ReviewKit
      title={title}
      originalUrl={originalUrl}
      photos={photos}
      generate={generate}
      setWarning={(position, on) => setPhotoWarning(kitId, position, on)}
      refresh={refresh}
      downloadHref={`/api/kits/${kitId}/download`}
    />
  );
}
