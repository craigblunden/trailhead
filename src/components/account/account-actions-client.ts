import { unwrapping } from "@/components/action-client";
import { accountSummaryAction, deleteAccountAction } from "@/server/actions/account";
import { generationStatusAction } from "@/server/actions/generation";

/** How the account page reaches the server. Component tests replace this module. */
export const accountClient = {
  summary: unwrapping(accountSummaryAction),
  /** The cover-letter card's status read; the page uses its quota half. */
  letters: unwrapping(generationStatusAction),
  /** Answers only when deletion did not happen: on success the action redirects. */
  remove: (confirmEmail: string) => deleteAccountAction(confirmEmail),
};
