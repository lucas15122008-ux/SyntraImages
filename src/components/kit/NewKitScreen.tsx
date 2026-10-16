'use client';

import { useRouter } from 'next/navigation';
import { createKitAction } from '@/lib/kit/actions';
import { saveTemplate } from '@/lib/kit/templates';
import { BuildKit, type TemplateOption } from './BuildKit';

export function NewKitScreen({ templates, storeReady }: { templates: TemplateOption[]; storeReady: boolean }) {
  const router = useRouter();
  return (
    <BuildKit
      templates={templates}
      storeReady={storeReady}
      onCreate={createKitAction}
      onCreated={(kitId) => router.push(`/kits/${kitId}`)}
      onSaveTemplate={async (name, config) => {
        const id = await saveTemplate(name, config);
        router.refresh();
        return id;
      }}
    />
  );
}
