import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/** What anyone, signed in or not, can see about a race from its invite code. */
export interface InvitePreview {
  name: string;
  organizer_name: string;
  member_count: number;
  starts_at: string;
}

/** The race behind an invite code; null while loading or when the code doesn't match a race. */
export function useInvitePreview(code: string | null | undefined) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!code || code.length < 4) return;
    let live = true;
    supabase
      .rpc('invite_preview', { p_invite_code: code })
      .then(({ data }) => {
        const row = (Array.isArray(data) ? data[0] : data) as InvitePreview | undefined;
        if (live) setPreview(row ?? null);
      });
    return () => {
      live = false;
    };
  }, [code]);
  return preview;
}

/** "Ann saved you a spot in Neighborhood 1K." */
export const savedASpot = (p: InvitePreview) => `${p.organizer_name} saved you a spot in ${p.name}.`;
