import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { AppNav } from "@/components/app-nav";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";
import { ContactsShell } from "@/components/contacts/contacts-shell";
import { JobDetail } from "@/components/job/job-detail";
import { ActionError } from "@/components/jobs-actions-client";
import type { Job } from "@/lib/jobs";
import { SEED_JOBS } from "../fixtures/jobs";
import { createFakeContactsClient } from "../fakes/contacts-client";
import { freezeClock, renderWithJobs, screen, waitFor, within } from "../test-utils";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/board",
  segment: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSelectedLayoutSegment: () => navigation.segment,
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } } as const;

const HARVEST = "harvest-lead-product-designer";
const FERNWOOD = "fernwood-product-designer-growth";
const harvest = SEED_JOBS.find((job) => job.id === HARVEST)!;
const fernwood = SEED_JOBS.find((job) => job.id === FERNWOOD)!;

beforeEach(() => {
  freezeClock();
  navigation.push.mockReset();
  navigation.pathname = "/board";
  navigation.segment = null;
});

afterEach(() => {
  vi.useRealTimers();
});

const contactsRegion = () => screen.getByRole("region", { name: "Contacts" });

describe("the job page's Contacts card (ticket 14)", () => {
  it("CON-J1: says how many other jobs a contact is on, and links to the contact", () => {
    const jobs: Job[] = [
      {
        ...harvest,
        contacts: [{ ...harvest.contacts[1], agency: "Northstar Talent", otherJobCount: 2 }],
      },
    ];
    renderWithJobs(<JobDetail jobId={HARVEST} />, { initialJobs: jobs });

    expect(within(contactsRegion()).getByText("Recruiter · Northstar Talent")).toBeInTheDocument();
    expect(
      within(contactsRegion()).getByRole("link", { name: /Also on 2 other jobs/ }),
    ).toHaveAttribute("href", "/contacts/c2");
  });

  it("CON-J2: linking is search-first, and an existing contact is linked rather than re-created", async () => {
    const contactsClient = createFakeContactsClient({
      jobs: SEED_JOBS,
      contacts: [{ id: "priya", name: "Priya Raman", kind: "referrer", agency: "" }],
    });
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { contactsClient });

    await user.click(within(contactsRegion()).getByRole("button", { name: "Add contact" }));
    const dialog = screen.getByRole("dialog", { name: "Add a contact" });
    await user.type(within(dialog).getByLabelText("Search your contacts"), "pri");

    await user.click(await within(dialog).findByRole("button", { name: /Priya Raman/ }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(contactsClient.link).toHaveBeenCalledWith(HARVEST, "priya");
    expect(contactsClient.createForJob).not.toHaveBeenCalled();
    expect(within(contactsRegion()).getByRole("link", { name: "Priya Raman" })).toBeInTheDocument();
  });

  it("CON-J3: offers no Create option for a name that is already saved", async () => {
    const contactsClient = createFakeContactsClient({
      jobs: SEED_JOBS,
      contacts: [{ id: "priya", name: "Priya Raman", kind: "referrer" }],
    });
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { contactsClient });

    await user.click(within(contactsRegion()).getByRole("button", { name: "Add contact" }));
    const dialog = screen.getByRole("dialog", { name: "Add a contact" });
    await user.type(within(dialog).getByLabelText("Search your contacts"), "priya raman");

    expect(await within(dialog).findByRole("button", { name: /Priya Raman/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Create/ })).toBeNull();
  });

  it("CON-J4: creating from a job asks only for name and kind, defaulting to Recruiter, then links", async () => {
    const contactsClient = createFakeContactsClient({ jobs: SEED_JOBS });
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { contactsClient });

    await user.click(within(contactsRegion()).getByRole("button", { name: "Add contact" }));
    await user.type(screen.getByLabelText("Search your contacts"), "Morgan Lee");
    await user.click(await screen.findByRole("button", { name: "Create “Morgan Lee”" }));

    const dialog = screen.getByRole("dialog", { name: "Create a contact" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Morgan Lee");
    expect(within(dialog).getByRole("combobox", { name: "Kind" })).toHaveTextContent("Recruiter");
    expect(within(dialog).queryByLabelText("Email")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Create and add" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(contactsClient.createForJob).toHaveBeenCalledWith(HARVEST, {
      name: "Morgan Lee",
      kind: "recruiter",
    });
    expect(within(contactsRegion()).getByRole("link", { name: "Morgan Lee" })).toBeInTheDocument();
  });

  it("CON-J5: removing a contact from a job unlinks it and leaves the contact alone", async () => {
    const contactsClient = createFakeContactsClient({ jobs: SEED_JOBS });
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { contactsClient });

    await user.click(
      within(contactsRegion()).getByRole("button", { name: "Remove Tom Okafor from this job" }),
    );

    await waitFor(() =>
      expect(within(contactsRegion()).queryByRole("link", { name: "Tom Okafor" })).toBeNull(),
    );
    expect(contactsClient.unlink).toHaveBeenCalledWith(HARVEST, "c1");
    expect(contactsClient.remove).not.toHaveBeenCalled();
  });

  it("CON-J6: a refused link shows the reason where the user is looking, and changes nothing", async () => {
    const contactsClient = createFakeContactsClient({
      jobs: SEED_JOBS,
      contacts: [{ id: "priya", name: "Priya Raman", kind: "referrer" }],
    });
    contactsClient.link.mockRejectedValueOnce(
      new ActionError("failed", "Something went wrong on our side."),
    );
    const { user } = renderWithJobs(<JobDetail jobId={HARVEST} />, { contactsClient });

    await user.click(within(contactsRegion()).getByRole("button", { name: "Add contact" }));
    const dialog = screen.getByRole("dialog", { name: "Add a contact" });
    await user.click(await within(dialog).findByRole("button", { name: /Priya Raman/ }));

    // The card is behind a modal, so the failure is announced inside the dialog.
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side.",
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(within(contactsRegion()).queryByRole("alert")).toBeNull();
    expect(within(contactsRegion()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("CON-J7: the card and its dialog have no structural axe violations", async () => {
    const { user, container } = renderWithJobs(<JobDetail jobId={HARVEST} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();

    await user.click(within(contactsRegion()).getByRole("button", { name: "Add contact" }));
    await screen.findByRole("dialog", { name: "Add a contact" });
    expect(await axe(document.body, AXE_OPTIONS)).toHaveNoViolations();
  });
});

const dana = {
  id: "dana",
  name: "Dana Whitfield",
  kind: "recruiter" as const,
  agency: "Northstar Talent",
  email: "dana@northstar.example",
};

/** Dana linked to Harvest (interviewing) and Fernwood (applied). */
function danaClient() {
  const jobs: Job[] = [
    { ...harvest, contacts: [] },
    { ...fernwood, contacts: [] },
  ];
  const client = createFakeContactsClient({ jobs, contacts: [dana] });
  void client.link(HARVEST, "dana");
  void client.link(FERNWOOD, "dana");
  client.link.mockClear();
  return { jobs, client };
}

describe("a Contact's own page (ticket 14)", () => {
  it("CON-D1: groups the roles with this contact by stage, in pipeline order", async () => {
    const { jobs, client } = danaClient();
    renderWithJobs(<ContactDetailView contactId="dana" />, { initialJobs: jobs, contactsClient: client });

    const roles = await screen.findByRole("region", { name: "Roles with Dana Whitfield" });
    const headings = within(roles).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Applied1 role", "Interviewing1 role"]);
    expect(within(roles).getByRole("link", { name: harvest.role })).toHaveAttribute(
      "href",
      `/board/${HARVEST}`,
    );
  });

  it("CON-D2: saves edits, including a change of kind, to the same record", async () => {
    const { jobs, client } = danaClient();
    const { user } = renderWithJobs(<ContactDetailView contactId="dana" />, {
      initialJobs: jobs,
      contactsClient: client,
    });

    const agency = await screen.findByLabelText("Agency");
    await user.clear(agency);
    await user.type(agency, "Harbor Search");
    await user.click(screen.getByRole("combobox", { name: "Kind" }));
    await user.click(await screen.findByRole("option", { name: "Hiring manager" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(client.update).toHaveBeenCalledWith(
      "dana",
      expect.objectContaining({ agency: "Harbor Search", kind: "hiring_manager" }),
    );
    expect(client.create).not.toHaveBeenCalled();
  });

  it("CON-D3: shows the server's message beside the field it is about", async () => {
    const { jobs, client } = danaClient();
    client.update.mockRejectedValueOnce(
      new ActionError("invalid", "Check the highlighted fields.", {
        email: "Enter an email address like name@example.com",
      }),
    );
    const { user } = renderWithJobs(<ContactDetailView contactId="dana" />, {
      initialJobs: jobs,
      contactsClient: client,
    });

    const email = await screen.findByLabelText("Email");
    await user.clear(email);
    await user.type(email, "dana");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter an email address like name@example.com")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter an email address like name@example.com");
  });

  it("CON-D4: 'Spoke today' records today's date in one click", async () => {
    const { jobs, client } = danaClient();
    const { user } = renderWithJobs(<ContactDetailView contactId="dana" />, {
      initialJobs: jobs,
      contactsClient: client,
    });

    await user.click(await screen.findByRole("button", { name: "Spoke today" }));

    expect(client.update).toHaveBeenCalledWith("dana", { lastSpokenOn: "2026-07-25" });
    expect(await screen.findByText("Recorded that you spoke today.")).toBeInTheDocument();
    expect(screen.getByLabelText("Last spoke")).toHaveValue("2026-07-25");
    expect(screen.getByLabelText("Last spoke")).toHaveAttribute("max", "2026-07-25");
  });

  it("CON-D5: deleting asks first, names the jobs it touches, then returns to the list", async () => {
    const { jobs, client } = danaClient();
    const { user } = renderWithJobs(<ContactDetailView contactId="dana" />, {
      initialJobs: jobs,
      contactsClient: client,
    });

    await user.click(await screen.findByRole("button", { name: "Delete contact" }));
    const confirm = screen.getByRole("dialog", { name: "Delete Dana Whitfield?" });
    expect(confirm).toHaveTextContent("removed from 2 jobs");
    expect(client.remove).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Delete contact" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/contacts"));
    expect(client.remove).toHaveBeenCalledWith("dana");
  });

  it("CON-D6: an unknown or foreign contact id explains itself", async () => {
    renderWithJobs(<ContactDetailView contactId="someone-elses" />);

    expect(
      await screen.findByRole("heading", { name: "This contact isn’t in your contacts" }),
    ).toBeInTheDocument();
  });

  it("CON-D7: the page has no structural axe violations", async () => {
    const { jobs, client } = danaClient();
    const { container } = renderWithJobs(<ContactDetailView contactId="dana" />, {
      initialJobs: jobs,
      contactsClient: client,
    });
    await screen.findByRole("heading", { level: 1, name: "Dana Whitfield" });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("the contacts list (ticket 14)", () => {
  it("CON-L1: lists contacts with kind, agency, and how many roles each is on", async () => {
    const { jobs, client } = danaClient();
    navigation.segment = "dana";
    renderWithJobs(<ContactsShell>detail</ContactsShell>, { initialJobs: jobs, contactsClient: client });

    const link = await screen.findByRole("link", { name: /Dana Whitfield/ });
    expect(link).toHaveAttribute("href", "/contacts/dana");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveTextContent("Recruiter · Northstar Talent");
    expect(link).toHaveTextContent("On 2 roles");
  });

  it("CON-L2: adding a contact asks for name and kind, then opens their page", async () => {
    const client = createFakeContactsClient({ jobs: SEED_JOBS });
    const { user } = renderWithJobs(<ContactsShell>detail</ContactsShell>, { contactsClient: client });

    await user.click(screen.getAllByRole("button", { name: "Add contact" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add a contact" });
    await user.type(within(dialog).getByLabelText("Name"), "Sam Ortiz");
    await user.click(within(dialog).getByRole("button", { name: "Save contact" }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/contacts/contact-1"));
    expect(client.create).toHaveBeenCalledWith({ name: "Sam Ortiz", kind: "recruiter" });
  });

  it("CON-L3: an empty list says what contacts are for", async () => {
    const client = createFakeContactsClient({ jobs: [] });
    renderWithJobs(<ContactsShell>detail</ContactsShell>, { initialJobs: [], contactsClient: client });

    expect(await screen.findByRole("heading", { name: "No contacts yet" })).toBeInTheDocument();
  });

  it("CON-L4: the list has no structural axe violations", async () => {
    const { jobs, client } = danaClient();
    const { container } = renderWithJobs(<ContactsShell>detail</ContactsShell>, {
      initialJobs: jobs,
      contactsClient: client,
    });
    await screen.findByRole("link", { name: /Dana Whitfield/ });

    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe("header navigation (ticket 14)", () => {
  it("NAV-1: links Board and Contacts, marking the current section", () => {
    navigation.pathname = "/contacts/dana";
    renderWithJobs(<AppNav />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Board" })).toHaveAttribute("href", "/board");
    expect(within(nav).getByRole("link", { name: "Board" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Contacts" })).toHaveAttribute("aria-current", "page");
    // Hidden below md; the user menu is the route on phones.
    expect(nav).toHaveClass("hidden", "md:flex");
  });
});
