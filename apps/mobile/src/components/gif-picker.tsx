import type { Gif } from '@1k/core';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGifSearch } from '@/lib/gifs';
import { Radius, Space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

import { Text } from './text';

const COLUMNS = 2;

/** A sheet for finding a GIF on GIPHY: trending first, then whatever you search for. */
export function GifPicker({ visible, onPick, onClose }: { visible: boolean; onPick: (gif: Gif) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { gifs, error } = useGifSearch(query, visible);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: insets.bottom }}>
        <View style={{ padding: Space.md, gap: Space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">GIFs</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
              <Text style={{ color: colors.accent, fontWeight: '800' }}>Cancel</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search GIPHY"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            returnKeyType="search"
            maxLength={50}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: Radius.md,
              paddingHorizontal: Space.md,
              minHeight: 48,
              fontSize: 17,
              color: colors.text,
            }}
          />
        </View>
        <FlatList
          data={gifs ?? []}
          keyExtractor={(g) => g.id}
          numColumns={COLUMNS}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.sm }}
          columnWrapperStyle={{ gap: Space.sm }}
          renderItem={({ item: gif }) => (
            <Pressable
              onPress={() => onPick(gif)}
              accessibilityRole="button"
              accessibilityLabel={gif.title || 'GIF'}
              style={{ flex: 1 / COLUMNS }}>
              <Image
                source={{ uri: gif.url }}
                recyclingKey={gif.id}
                contentFit="cover"
                style={{ width: '100%', aspectRatio: gif.width / gif.height, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt }}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            gifs == null ? (
              <ActivityIndicator style={{ marginTop: Space.xl }} />
            ) : (
              <Text variant="muted" style={{ textAlign: 'center', marginTop: Space.xl }}>
                {error ?? 'No GIFs found'}
              </Text>
            )
          }
        />
        {/* GIPHY's terms ask for this wherever its search is offered. */}
        <Text variant="muted" size={12} style={{ textAlign: 'center', padding: Space.sm }}>
          Powered by GIPHY
        </Text>
      </View>
    </Modal>
  );
}
