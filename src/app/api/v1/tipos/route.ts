import { NextResponse } from 'next/server';
import { withApiKey } from '@/lib/api/http';
import { photoTypesHelp } from '@/lib/api/kits';

/** Tipos de foto aceitos e os padrões do kit. */
export async function GET(req: Request) {
  return withApiKey(req, async () => NextResponse.json(photoTypesHelp()));
}
