import type { Evaluation } from '@1k/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';

/** What the app sends for a hand-logged run; dates go over the wire as ISO strings. */
export interface ActivityDraft {
  source: 'manual' | 'treadmill_manual';
  type: 'run' | 'walk';
  environment: 'outdoor' | 'treadmill';
  startedAt: string;
  endedAt: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  evidenceCount: number;
  evidenceTakenAt?: string;
}

export interface LogResult {
  evaluation: Evaluation;
  countedIn: { race: string; countedMiles: number }[];
}

/**
 * Uploads the treadmill photo (if any) to the private evidence bucket, then hands the
 * activity to the ingest-activity edge function, which has the final say on whether it counts.
 */
export async function logActivity(userId: string, draft: ActivityDraft, photo?: ImagePickerAsset): Promise<LogResult> {
  let evidencePath: string | undefined;
  if (photo) {
    const contentType = photo.mimeType ?? 'image/jpeg';
    evidencePath = `${userId}/${Date.now()}.${contentType.split('/')[1] ?? 'jpg'}`;
    const bytes = await (await fetch(photo.uri)).arrayBuffer();
    const { error } = await supabase.storage.from('evidence').upload(evidencePath, bytes, { contentType });
    if (error) throw new Error(`Couldn’t upload the photo: ${error.message}`);
  }

  const { data, error } = await supabase.functions.invoke<LogResult>('ingest-activity', {
    body: { activity: draft, evidencePath },
  });
  if (error || !data) {
    if (evidencePath) await supabase.storage.from('evidence').remove([evidencePath]);
    const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error?.message ?? 'Something went wrong. Try again.');
  }
  return data;
}

/** When a photo was taken, from its EXIF data ("2026:10:02 18:30:12", camera-local time). */
export function photoTakenAt(photo: ImagePickerAsset): Date | undefined {
  const exif = photo.exif as Record<string, unknown> | null | undefined;
  const nested = exif?.['{Exif}'] as Record<string, unknown> | undefined;
  const raw = exif?.DateTimeOriginal ?? nested?.DateTimeOriginal ?? exif?.DateTime;
  const m = typeof raw === 'string' ? raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/) : null;
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  return new Date(y!, mo! - 1, d!, h!, mi!, s!);
}
