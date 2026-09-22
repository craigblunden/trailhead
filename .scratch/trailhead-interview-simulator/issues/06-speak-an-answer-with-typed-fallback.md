# 06: Speak an answer, with typed fallback

**What to build:** The Answer-capture step (ticket 02) offers an explicit speak/type choice,
defaulting to speaking when the browser's speech-recognition API is supported, with a brief
explanation of why speaking is recommended. Unsupported browsers get typing automatically.

**Blocked by:** 02.

**Status:** ready-for-review

- [ ] On a browser with speech-recognition support, the default input mode is speaking, shown with
      copy explaining why it's recommended.
- [ ] The Tenant can switch to typing at any point, regardless of browser support.
- [ ] On a browser without support, only typing is offered, with a brief note explaining why.
- [ ] A spoken Answer's final transcript is written to the same field a typed Answer uses —
      scoring (ticket 03) is indifferent to which input mode produced it.
- [ ] No audio is recorded, uploaded, or stored at any point; only the browser-transcribed text
      ever reaches the server.
- [ ] The UI is tested with `fetch` mocked and the browser speech-recognition API stubbed,
      covering the feature-detection branch, the default-to-speaking path, and the typed-fallback
      path.
