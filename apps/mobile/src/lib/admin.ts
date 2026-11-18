import { useCallback, useEffect, useState } from 'react';

import { notify } from './feed';
import { supabase } from './supabase';
import type { MemberRole, Race } from './types';

/** Organizers run the race; marshals help review runs. */
export const canReview = (race: Race | null | undefined) => race?.myRole === 'organizer' || race?.myRole === 'marshal';
export const isOrganizer = (race: Race | null | undefined) => race?.myRole === 'organizer';

export interface PendingRun {
  activity_id: string;
  user_id: string;
  display_name: string;
  source: string;
  type: 'run' | 'walk';
  environment: 'outdoor' | 'treadmill';
  started_at: string;
  distance_m: number;
  moving_time_s: number;
  time_recorded: boolean;
  flags: { code: string; severity: string; message: string }[];
  evidence_paths: string[];
  /** The runner's pace over their last 10 other timed runs, s/mi; null when there are none. */
  usual_pace_s: number | null;
}

/** Runs in the race waiting on a reviewer, oldest first. Empty for anyone who can't review. */
export function usePendingReviews(race: Race | null | undefined) {
  const [runs, setRuns] = useState<PendingRun[] | null>(null);
  const raceId = race?.id;
  const allowed = canReview(race);

  const refresh = useCallback(async () => {
    if (!raceId || !allowed) return setRuns([]);
    const { data, error } = await supabase.rpc('pending_reviews', { p_race: raceId });
    if (!error) setRuns((data as PendingRun[] | null) ?? []);
  }, [raceId, allowed]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runs, refresh };
}

/** Count it or don't. The runner hears either way; a rejection takes its miles back off. */
export async function reviewRun(raceId: string, activityId: string, decision: 'approve' | 'reject', note?: string) {
  const { error } = await supabase.rpc('review_activity', {
    p_race: raceId,
    p_activity: activityId,
    p_decision: decision,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  notify({ kind: 'review', activityId });
}

/** Approves every waiting run that was only flagged for being typed in by hand. Returns how many. */
export async function approveHandEntered(raceId: string): Promise<number> {
  const { data, error } = await supabase.rpc('approve_hand_entered', { p_race: raceId });
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/** A short-lived link to a treadmill photo. Only the runner and the race's reviewers can open it. */
export async function evidenceUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('evidence').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export interface Member {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile: { display_name: string } | null;
}

/** Everyone active in the race, organizers first. */
export function useMembers(raceId: string | undefined) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const refresh = useCallback(async () => {
    if (!raceId) return;
    const { data } = await supabase
      .from('race_members')
      .select('user_id, role, joined_at, profile:profiles(display_name)')
      .eq('race_id', raceId)
      .eq('status', 'active');
    const order: Record<MemberRole, number> = { organizer: 0, marshal: 1, participant: 2, supporter: 3 };
    setMembers(
      ((data as unknown as Member[] | null) ?? []).sort(
        (a, b) =>
          order[a.role] - order[b.role] || (a.profile?.display_name ?? '').localeCompare(b.profile?.display_name ?? ''),
      ),
    );
  }, [raceId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { members, refresh };
}

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as unknown;
}

export const setMemberRole = (raceId: string, userId: string, role: 'participant' | 'marshal') =>
  call('set_member_role', { p_race: raceId, p_user: userId, p_role: role });

export const removeMember = (raceId: string, userId: string) =>
  call('remove_member', { p_race: raceId, p_user: userId });

export const updateRaceDetails = (raceId: string, name: string, description: string) =>
  call('update_race_details', { p_race: raceId, p_name: name, p_description: description });

export const replaceInviteCode = async (raceId: string) =>
  (await call('replace_invite_code', { p_race: raceId })) as string;

/** Pinned to the top of Feed and Chat, and sent to everyone in the race. */
export async function postAnnouncement(raceId: string, body: string) {
  const message = (await call('post_announcement', { p_race: raceId, p_body: body })) as { id: string };
  notify({ kind: 'message', messageId: message.id });
}

export interface TurnedDown {
  id: string;
  type: 'run' | 'walk';
  started_at: string;
  distance_m: number;
  note: string | null;
}

/** The signed-in runner's runs an organizer didn't count, newest first, with why. */
export function useTurnedDown(userId: string | undefined) {
  const [runs, setRuns] = useState<TurnedDown[]>([]);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('activities')
      .select('id, type, started_at, distance_m, reviews:activity_reviews(decision, note, created_at)')
      .eq('user_id', userId)
      .eq('verification', 'rejected')
      .order('started_at', { ascending: false })
      .limit(10);
    type Row = Omit<TurnedDown, 'note'> & { reviews: { decision: string; note: string | null; created_at: string }[] };
    setRuns(
      ((data as unknown as Row[] | null) ?? []).map(({ reviews, ...a }) => ({
        ...a,
        note:
          [...reviews]
            .filter((r) => r.decision === 'reject')
            .sort((x, y) => y.created_at.localeCompare(x.created_at))[0]?.note ?? null,
      })),
    );
  }, [userId]);
  return { runs, refresh };
}
