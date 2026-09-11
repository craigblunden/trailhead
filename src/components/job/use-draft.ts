"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Local state for a text field that persists on a delay, so a page that saves to a server does
 * not fire a request per keystroke. The draft follows the committed value while the user is not
 * editing; while they are, it holds what they typed and commits after `delayMs` of quiet or on
 * `flush()` (blur). A committed value that comes back from the server different from the draft
 * (a rejected edit rolled back) wins once the user stops typing.
 *
 * The draft follows a new committed value during render rather than in an effect, so the page beneath
 * it renders once when a save comes back, not twice (performance ticket 05).
 */
export function useDraft(
  committed: string,
  onCommit: (value: string) => void,
  delayMs = 600,
): [draft: string, setDraft: (value: string) => void, flush: () => void] {
  const [draft, setDraftState] = useState(committed);
  // Whether the user has typed something not yet committed. State, not a ref, so render can read it.
  const [editing, setEditing] = useState(false);
  // The committed value the draft last saw.
  const [seen, setSeen] = useState(committed);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });

  if (committed !== seen) {
    setSeen(committed);
    if (!editing) setDraftState(committed);
  }

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    setEditing(false);
    commit.current(value);
  }, []);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      setEditing(true);
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => () => flush(), [flush]);

  return [draft, setDraft, flush];
}
