import { describe, expect, it } from "vitest";

import { hasTagCharacters, stripInvisible } from "@/lib/invisible";

describe("invisible characters (feedback issue 02)", () => {
  it("INV-1: strips zero-width characters, format characters, and bidi controls, and nothing else", () => {
    const zeroWidth = "sho\u200Brter, \u200Cand \u200Dlead \u2060with \uFEFFthe project";
    expect(stripInvisible(zeroWidth)).toBe("shorter, and lead with the project");

    const bidi = "\u200Eshorter\u200F \u202Aand\u202B \u202Clead\u202D \u202Ewith\u2066 \u2067the\u2068 \u2069project";
    expect(stripInvisible(bidi)).toBe("shorter and lead with the project");

    const softHyphen = "co\u00ADoperate";
    expect(stripInvisible(softHyphen)).toBe("cooperate");

    const plain = "Shorter; lead with the Fernwood project. Café, naïve, 日本語, emoji 🙂 and \"quotes\".";
    expect(stripInvisible(plain)).toBe(plain);
  });

  it("INV-2: an emoji sequence held together by a joiner survives as its parts", () => {
    expect(stripInvisible("👩\u200D💻")).toBe("👩💻");
  });

  it("INV-3: a string of only invisible characters strips to empty", () => {
    expect(stripInvisible("\u200B\u200C\u200D\u2060\uFEFF\u200E\u202E")).toBe("");
  });

  it("INV-4: detects a tag character, and leaves it in place for detection rather than stripping it", () => {
    const tagged = "shorter\u{E0001}\u{E0020}please";
    expect(hasTagCharacters(tagged)).toBe(true);
    expect(hasTagCharacters("shorter please")).toBe(false);
    expect(hasTagCharacters("👩\u200D💻 \u200B")).toBe(false);
    expect(stripInvisible(tagged)).toBe(tagged);
  });
});
