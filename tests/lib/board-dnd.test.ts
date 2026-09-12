import { describe, expect, it } from "vitest";

import { carriesJob, readJobTransfer, writeJobTransfer } from "@/lib/board-dnd";
import { fakeTransfer } from "../fakes/data-transfer";

describe("DND-1: a drag carries the Job id under a private type", () => {
  it("round-trips the id and marks the drag as a move", () => {
    const transfer = fakeTransfer();
    writeJobTransfer(transfer, "fernwood-product-designer-growth");

    expect(transfer.effectAllowed).toBe("move");
    expect(carriesJob(transfer)).toBe(true);
    expect(readJobTransfer(transfer)).toBe("fernwood-product-designer-growth");
  });

  it("does not recognise text or files dragged in from outside", () => {
    const transfer = fakeTransfer();
    transfer.setData("text/plain", "fernwood-product-designer-growth");

    expect(carriesJob(transfer)).toBe(false);
    expect(readJobTransfer(transfer)).toBeNull();
  });

  it("treats an empty id as no Job", () => {
    const transfer = fakeTransfer();
    writeJobTransfer(transfer, "");

    expect(readJobTransfer(transfer)).toBeNull();
  });
});
