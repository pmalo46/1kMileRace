import type { Gif } from '@1k/core';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { GifPicker } from '@/components/gif-picker';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

/** A box for writing a comment, with a GIF button, for the comments screen and the feed. */
export function CommentComposer({
  onPost,
  autoFocus,
  header,
}: {
  /** Throws to keep the draft and say why it didn't post. */
  onPost: (body: string, gif: Gif | null) => Promise<void>;
  autoFocus?: boolean;
  /** Shown above the box, e.g. who the reply is to. */
  header?: ReactNode;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const [gif, setGif] = useState<Gif | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const body = draft.trim();
  const canPost = (!!body || !!gif) && !sending;

  const send = async () => {
    if (!body && !gif) return;
    setSending(true);
    try {
      await onPost(body, gif);
      setDraft('');
      setGif(null);
    } catch (e) {
      Alert.alert('Couldn’t post', e instanceof Error ? e.message : 'Try again.');
    }
    setSending(false);
  };

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
      {header}
      {gif && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: Space.sm,
            paddingHorizontal: Space.md,
            paddingTop: Space.sm,
          }}>
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm, padding: Space.md }}>
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
          autoFocus={autoFocus}
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
      <GifPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          setGif(picked);
          setPicking(false);
        }}
      />
    </View>
  );
}
