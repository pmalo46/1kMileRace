import type { Gif } from '@1k/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/** Waits this long after the last keystroke before searching. */
const DEBOUNCE_MS = 350;

/** GIPHY results for a search, or what's trending when it's empty. Searches only while `enabled`. */
export function useGifSearch(query: string, enabled: boolean) {
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const q = query.trim();
    const timer = setTimeout(
      async () => {
        const { data, error: failed } = await supabase.functions.invoke<{ gifs: Gif[] }>('gifs', {
          body: q ? { q } : {},
        });
        if (!current) return;
        if (failed || !data) {
          const response = failed instanceof FunctionsHttpError ? (failed.context as Response) : null;
          const body = response ? await response.json().catch(() => null) : null;
          if (!current) return;
          setError(body?.error ?? 'Couldn’t load GIFs.');
          setGifs([]);
          return;
        }
        setError(null);
        setGifs(data.gifs);
      },
      q ? DEBOUNCE_MS : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);

  return { gifs, error };
}
