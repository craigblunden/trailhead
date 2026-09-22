# 02: Answers are spoken only

**What to build:** Remove typing an Answer everywhere: from the run screen, the Attempt set-up and the
Practice round set-up. A browser that cannot transcribe speech cannot start or resume a run.

See `spec.md` → 2. Speaking only.

**Blocked by:** None

**Status:** ready-for-review

- [ ] The run screen has no typed notepad, no "Type instead", no "Speak instead", and no
      `mode`/`onModeChange` props. `InputMode`/`INPUT_MODES` and `TypedNotepad` are deleted if nothing
      else uses them. The spoken answer is the transcript plus the interim phrase (no `typed` prefix).
- [ ] `AnswerModeChoice` is removed from both set-ups. In its place, a line says answers are spoken
      and transcribed in the browser, and no audio is kept.
- [ ] Where `useSpeechSupported()` is false: the Attempt set-up, the Practice round set-up and both
      Resume offers show a note that this needs a browser that can hear you (Chrome, Edge or Safari)
      instead of Go / Resume. `SPEAK_UNSUPPORTED` is rewritten to match, with no mention of typing.
- [ ] Speech error messages in `use-speech.ts` no longer say "or type your answer instead". Ticket 05
      reworks what happens next; here, only the copy changes.
- [ ] Saved Answers (including ones typed before this change) read back unchanged on the Scorecard and
      the Practice round read-back.
- [ ] Code comments that describe "spoken or typed" (run screen, `use-speech.ts`, ADR-0006's
      description is history and stays) are updated.
- [ ] e2e: install a fake `webkitSpeechRecognition` via `addInitScript` (alongside the existing fake
      `speechSynthesis`) that lets a test emit final results. Rewrite `answerOne` and the time-up test to
      speak instead of fill a textbox. Remove the "Speaking is pressed" assertions. Add a test that a
      browser without recognition sees the note and no Go.
- [ ] Component tests in `tests/components/interview.test.tsx` updated to match.
