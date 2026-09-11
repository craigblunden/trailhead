/**
 * The typed domain errors the data layer throws. Actions translate these into results; nothing
 * else — no Prisma error, no constraint name, no column name — is allowed to reach a client.
 */

/**
 * The row is not on this user's trail. Deliberately the same for a nonexistent id and for
 * another user's id: a distinguishable error would confirm that the row exists, which is the
 * whole IDOR surface reopened by a friendlier message.
 */
export class NotFoundError extends Error {
  constructor(what = "job") {
    super(`This ${what} isn't on your trail`);
    this.name = "NotFoundError";
  }

  /** The sentence a client is shown for it: by every action, the cover-letter route, and the test store. */
  get shown(): string {
    return `${this.message}.`;
  }
}

/**
 * A domain rule said no — the document cap, a quota, a document of the wrong kind. The message is
 * written for the user and names what to do; the code lets the UI render the designed state.
 */
export class RuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RuleError";
  }
}
