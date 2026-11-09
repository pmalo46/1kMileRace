import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useActiveRace } from '@/lib/active-race';
import { ruleSections } from '@/lib/race-rules-copy';
import { Space } from '@/theme/tokens';

/** The whole rulebook, short enough to read standing up. Uses the active race's own dates. */
export default function Rules() {
  const { race } = useActiveRace();
  const sections = ruleSections(race);
  return (
    <Screen>
      <View style={{ gap: Space.xs }}>
        {race && <Text variant="label">{race.name}</Text>}
        <Text variant="heading" size={28}>
          How the race works
        </Text>
      </View>
      {sections.map((section) => (
        <Card key={section.heading}>
          <Text variant="label">{section.heading}</Text>
          {section.lines.map((line) => (
            <Text key={line} style={{ lineHeight: 22 }}>
              {line}
            </Text>
          ))}
        </Card>
      ))}
      <Button title="Done" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
