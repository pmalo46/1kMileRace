import { runQuote } from '@1k/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { LogResult } from '@/lib/activities';
import { Space } from '@/theme/tokens';

import { Button } from './button';
import { Quote } from './quote';
import { Screen } from './screen';
import { Text } from './text';

/** The "you just added miles" screen shown after a run saves. */
export function Logged({ result, miles }: { result: LogResult; miles: string }) {
  const races = result.countedIn.map((c) => c.race).join(', ');
  // Chosen once, so it doesn't change under the reader if the screen re-renders.
  const [quote] = useState(() => runQuote('after', Date.now()));
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: Space.md }}>
        <Text variant="display" size={64}>
          +{miles}
        </Text>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {miles === '1' ? 'mile' : 'miles'} closer.
        </Text>
        <Quote quote={quote} align="center" style={{ marginVertical: Space.sm }} />
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {races
            ? `Counted toward ${races}.`
            : 'Saved, but it isn’t inside any of your races’ dates, so it doesn’t count toward one yet.'}
          {result.evaluation.status === 'flagged' ? ' An organizer may take a look; it counts in the meantime.' : ''}
        </Text>
      </View>
      <Button title="Done" onPress={() => router.back()} />
    </Screen>
  );
}
