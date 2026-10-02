import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { supabase } from '@/lib/supabase';

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'race';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Parses YYYY-MM-DD as local midnight, the start of the race day where the organizer lives. */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function CreateRace() {
  const [name, setName] = useState('');
  const [start, setStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const startsAt = parseLocalDate(start);
    if (!startsAt) return Alert.alert('Start date', 'Use the format YYYY-MM-DD.');
    setBusy(true);
    const { error } = await supabase.rpc('create_race', {
      p_name: name.trim(),
      p_slug: slugify(name),
      p_starts_at: startsAt.toISOString(),
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    if (error) return Alert.alert('Couldn’t create race', error.message);
    router.back();
  };

  return (
    <Screen>
      <Text variant="heading" size={28}>
        Start a race
      </Text>
      <Text variant="muted">
        Everyone gets 365 days from the start date to reach 1,000 miles. You’ll get an invite code to share.
      </Text>
      <Field label="Race name" value={name} onChangeText={setName} placeholder="Neighborhood 1K" maxLength={80} />
      <Field label="Start date" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" />
      <Button title="Create race" onPress={create} loading={busy} disabled={!name.trim()} />
    </Screen>
  );
}
