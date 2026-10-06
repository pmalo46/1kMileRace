/** Row shapes for the tables the app reads. Mirrors supabase/migrations. */
export interface Race {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  goal_m: number;
  invite_code: string;
}

export interface Standing {
  race_id: string;
  user_id: string;
  total_distance_m: number;
  total_moving_time_s: number;
  counted_distance_m: number;
  counted_moving_time_s: number;
  activity_count: number;
  last_activity_at: string | null;
  finished_at: string | null;
  finish_moving_time_s: number | null;
  finish_rank: number | null;
  time_rank: number | null;
  profile: { display_name: string; avatar_url: string | null } | null;
}

export interface FeedItem {
  id: string;
  type: 'activity' | 'milestone' | 'finish' | 'joined';
  actor_id: string;
  payload: { miles?: number };
  created_at: string;
  actor: { display_name: string; avatar_url: string | null } | null;
  activity: { type: 'run' | 'walk'; environment: 'outdoor' | 'treadmill'; distance_m: number; moving_time_s: number } | null;
  cheers: { user_id: string; emoji: string }[];
  comments: { count: number }[];
}

export interface Comment {
  id: string;
  feed_item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: { display_name: string } | null;
}
