import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedStory } from '@/components/feed-story';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { timeAgo, useComments } from '@/lib/feed';
import type { Comment } from '@/lib/types';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** The comments on one feed item, with a box to add your own. */
export default function Comments() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { item: itemId } = useLocalSearchParams<{ item: string }>();
  const { item, comments, error, add, remove } = useComments(itemId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const userId = session?.user.id;
  const body = draft.trim();

  const send = async () => {
    if (!userId || !body) return;
    setSending(true);
    try {
      await add(body, userId);
      setDraft('');
    } catch (e) {
      Alert.alert('Couldn’t post your comment', e instanceof Error ? e.message : 'Try again.');
    }
    setSending(false);
  };

  const confirmRemove = (comment: Comment) =>
    Alert.alert('Delete your comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(comment.id) },
    ]);

  return (
    // Android draws edge to edge, so the window no longer shrinks for the keyboard; pad on both platforms.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: Space.md, gap: Space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">Comments</Text>
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
              <Text style={{ color: colors.accent, fontWeight: '800' }}>Done</Text>
            </Pressable>
          </View>
          {item && <FeedStory item={item} isMe={item.actor_id === userId} />}
        </View>
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: Space.md, gap: Space.md }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: comment }) => {
            const mine = comment.user_id === userId;
            return (
              <Pressable
                onLongPress={mine ? () => confirmRemove(comment) : undefined}
                accessibilityHint={mine ? 'Long press to delete' : undefined}
                style={{ gap: 2 }}>
                <Text size={13} variant="muted">
                  <Text size={13} style={{ fontWeight: '800' }}>
                    {mine ? 'You' : (comment.author?.display_name ?? 'Runner')}
                  </Text>
                  {'  '}
                  {timeAgo(comment.created_at)}
                </Text>
                <Text>{comment.body}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.lg }}>
              {error ? `Couldn’t load comments: ${error}` : comments ? 'No comments yet. Say something kind.' : ' '}
            </Text>
          }
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: Space.sm,
            padding: Space.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: Radius.md,
              paddingHorizontal: Space.md,
              paddingVertical: 12,
              minHeight: 48,
              maxHeight: 120,
              fontSize: 17,
              color: colors.text,
            }}
          />
          <Pressable
            onPress={send}
            disabled={!body || sending}
            accessibilityRole="button"
            style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: Space.sm, opacity: !body || sending ? 0.4 : 1 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 17 }}>Post</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
