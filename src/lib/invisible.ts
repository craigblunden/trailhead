/**
 * Invisible characters in typed text (feedback issue 02). Pure; shared by both sides of the boundary.
 *
 * Two jobs, kept apart on purpose:
 *
 * - **Strip** removes what a paste from elsewhere can carry without anyone meaning it to: zero-width
 *   characters (ZWSP, ZWNJ, ZWJ, the word joiner, a BOM), the other Unicode format characters, and
 *   the bidi controls. It never refuses and never flags. An emoji sequence held together by a ZWJ
 *   becomes its parts, which is acceptable in a cover letter.
 * - **Detect** finds Unicode tag characters (`U+E0000`–`U+E007F`), the block used to hide text from
 *   a human reader. Typed text never contains them, so a hit is refused rather than cleaned.
 *
 * The tag block is itself in general category `Cf`, so strip leaves it alone: what is detected must
 * still be there to detect.
 */

const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u;

/** Every format character (`Cf`) and bidi control except the tag block, which `hasTagCharacters` owns. */
const STRIPPED = /(?![\u{E0000}-\u{E007F}])[\p{Cf}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

export function stripInvisible(text: string): string {
  return text.replace(STRIPPED, "");
}

export function hasTagCharacters(text: string): boolean {
  return TAG_CHARACTER.test(text);
}
