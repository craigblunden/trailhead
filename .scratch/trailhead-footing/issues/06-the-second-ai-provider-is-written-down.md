# 06: The second AI provider is written down

**What to build:** Everything outside `src/` that currently says this product makes one outbound AI
call. It now makes two, to two companies.

See `spec.md` → The provider. **ADR-0007** → Consequences.

**Blocked by:** 01

**Status:** ready-for-review

- [ ] `README.md`: the stack line, the mermaid diagram (a TypeSafe node beside the Anthropic one), and
      the security-model sentence at line ~54 that presently describes one AI call. The env-var section
      gains `TYPESAFE_API_KEY` with the same "without it, the feature is unavailable" framing the
      `ANTHROPIC_API_KEY` paragraph uses.
- [ ] `docs/architecture.md`: the opening description, the component diagram, and the sequence diagram.
      Say which text goes to which provider — not just that a provider exists.
- [ ] `docs/provisioning.md`: a step for the TypeSafe key, matching the `ANTHROPIC_API_KEY` step's
      shape, including that it is a key created for this project alone so it can be revoked.
- [ ] `src/app/llms.txt` if it describes the outbound calls.
- [ ] The privacy page from `.scratch/trailhead-terms/` issue 02 is where the user-facing version of
      this lives. This ticket is the developer-facing half; the two must not disagree.
