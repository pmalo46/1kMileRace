import type { Gif } from '@1k/core';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedStory } from '@/components/feed-story';
import { GifPicker } from '@/components/gif-picker';
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
  const [draft, setDraft] = useState('');
  const [gif, setGif] = useState<Gif | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const userId = session?.user.id;
  const body = draft.trim();
  const canPost = (!!body || !!gif) && !sending;

  const send = async () => {
    if (!userId || (!body && !gif)) return;
    setSending(true);
    try {
      await add(body, userId, gif);
      setDraft('');
      setGif(null);
    } catch (e) {
      Alert.alert('Couldn’t post', e instanceof Error ? e.message : 'Try again.');
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
        {gif && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm, paddingHorizontal: Space.md }}>
            <Image
              source={{ uri: gif.url }}
              accessibilityLabel={gif.title || 'GIF'}
              style={{ width: 96, aspectRatio: gif.width / gif.height, borderRadius: Radius.sm }}
            />
            <Pressable onPress={() => setGif(null)} accessibilityRole="button" hitSlop={12}>
              <Text variant="muted" style={{ fontWeight: '800' }}>
                Remove
              </Text>
            </Pressable>
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: Space.sm,
            padding: Space.md,
            borderTopWidth: gif ? 0 : 1,
            borderTopColor: colors.border,
          }}>
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a GIF"
            style={{
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: Space.sm,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
            <Text style={{ fontWeight: '800', fontSize: 15 }}>GIF</Text>
          </Pressable>
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
            disabled={!canPost}
            accessibilityRole="button"
            style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: Space.sm, opacity: canPost ? 1 : 0.4 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 17 }}>Post</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      <GifPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          setGif(picked);
          setPicking(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}
