import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useDraft } from "@/components/job/use-draft";

/**
 * The job page's text fields type into a local draft and save after a pause or on blur. Performance
 * ticket 05: when the saved value changes, the field follows it in the same render — not in a
 * second render after an effect — and the draft behaviour itself is unchanged.
 */

let probeRenders = 0;

/** Stands in for everything the job page renders beneath its fields. */
function Probe() {
  probeRenders += 1;
  return null;
}

function Field({ committed, onCommit = () => {} }: { committed: string; onCommit?: (value: string) => void }) {
  const [draft, setDraft, flush] = useDraft(committed, onCommit);
  return (
    <>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={flush} />
      <Probe />
    </>
  );
}

const field = () => screen.getByLabelText("Draft");

describe("useDraft (performance ticket 05)", () => {
  it("follows the saved value while idle, rendering what is beneath it once per change", () => {
    probeRenders = 0;
    const { rerender } = render(<Field committed="first" />);
    expect(probeRenders).toBe(1);

    rerender(<Field committed="saved by the server" />);

    expect(field()).toHaveValue("saved by the server");
    expect(probeRenders).toBe(2);
  });

  it("keeps what the user is typing when a saved value arrives mid-edit", () => {
    const { rerender } = render(<Field committed="first" />);
    fireEvent.change(field(), { target: { value: "still typing" } });

    rerender(<Field committed="changed elsewhere" />);

    expect(field()).toHaveValue("still typing");
  });

  it("commits on blur, and a rolled-back value wins once the user has stopped", () => {
    const commits: string[] = [];
    const onCommit = (value: string) => commits.push(value);
    const { rerender } = render(<Field committed="old" onCommit={onCommit} />);

    fireEvent.change(field(), { target: { value: "new" } });
    fireEvent.blur(field());
    expect(commits).toEqual(["new"]);

    rerender(<Field committed="new" onCommit={onCommit} />);
    rerender(<Field committed="old" onCommit={onCommit} />);

    expect(field()).toHaveValue("old");
  });
});
