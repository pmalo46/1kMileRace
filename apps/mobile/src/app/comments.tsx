import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentComposer } from '@/components/comment-composer';
import { FeedStory } from '@/components/feed-story';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { timeAgo, useComments } from '@/lib/feed';
import type { Comment } from '@/lib/types';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** How wide a GIF shows in the thread. */
const GIF_WIDTH = 200;

/** The comments on one feed item, with a box to add your own. */
export default function Comments() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { item: itemId } = useLocalSearchParams<{ item: string }>();
  const { item, comments, error, add, remove } = useComments(itemId);
  const userId = session?.user.id;

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
                {!!comment.body && <Text>{comment.body}</Text>}
                {comment.gif_url && comment.gif_width && comment.gif_height && (
                  <Image
                    source={{ uri: comment.gif_url }}
                    recyclingKey={comment.id}
                    accessibilityLabel="GIF"
                    style={{
                      width: GIF_WIDTH,
                      aspectRatio: comment.gif_width / comment.gif_height,
                      borderRadius: Radius.sm,
                      marginTop: Space.xs,
                      backgroundColor: colors.surfaceAlt,
                    }}
                  />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.lg }}>
              {error ? `Couldn’t load comments: ${error}` : comments ? 'No comments yet' : ' '}
            </Text>
          }
        />
        <CommentComposer
          onPost={async (body, gif) => {
            if (!userId) throw new Error('Sign in to comment.');
            await add(body, userId, gif);
          }}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
