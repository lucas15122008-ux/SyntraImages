'use client';

import { useRouter } from 'next/navigation';
import { createKitAction } from '@/lib/kit/actions';
import { deleteCustomType, saveCustomType, type SavedCustomType } from '@/lib/kit/custom-types';
import { saveTemplate } from '@/lib/kit/templates';
import { BuildKit, type TemplateOption } from './BuildKit';

type Props = { templates: TemplateOption[]; storeReady: boolean; savedCustom: SavedCustomType[] };

export function NewKitScreen({ templates, storeReady, savedCustom }: Props) {
  const router = useRouter();
  return (
    <BuildKit
      templates={templates}
      storeReady={storeReady}
      savedCustom={savedCustom}
      onSaveCustom={saveCustomType}
      onDeleteCustom={deleteCustomType}
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
