export const STAGES = [
  "interested",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { label: string; dot: string }> = {
  interested: { label: "Interested", dot: "var(--stage-interested)" },
  applied: { label: "Applied", dot: "var(--stage-applied)" },
  interviewing: { label: "Interviewing", dot: "var(--stage-interviewing)" },
  offer: { label: "Offer", dot: "var(--stage-offer)" },
  rejected: { label: "Rejected", dot: "var(--stage-rejected)" },
};

/** A stage is "active" while the outcome is still open. */
export const ACTIVE_STAGES: Stage[] = [
  "interested",
  "applied",
  "interviewing",
  "offer",
];

export const ACCENTS = {
  moss: "#5c6b43",
  forest: "#4f6b3f",
  teal: "#3d6b6b",
  wheat: "#6b7340",
  olive: "#4a5c3a",
  slate: "#46688f",
} as const;

export type Accent = keyof typeof ACCENTS;

export type Contact = {
  id: string;
  name: string;
  title: string;
  email: string;
};

export type ActivityEntry = {
  id: string;
  label: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
};

export type Job = {
  id: string;
  company: string;
  role: string;
  /** Free text as it reads on the card, e.g. "Hybrid · Austin". */
  location: string;
  /** Thousands per year. `null` on either end means the range is unknown. */
  salaryMin: number | null;
  salaryMax: number | null;
  stage: Stage;
  postingUrl: string;
  /** ISO `YYYY-MM-DD`. */
  addedOn: string;
  /** ISO `YYYY-MM-DD`, or `null` while the role is only a lead. */
  appliedOn: string | null;
  resumeFile: string | null;
  description: string;
  notes: string;
  contacts: Contact[];
  activity: ActivityEntry[];
  accent: Accent;
};

export const SEED_JOBS: Job[] = [
  {
    id: "meridian-senior-product-designer",
    company: "Meridian Labs",
    role: "Senior Product Designer",
    location: "Remote (US)",
    salaryMin: 150,
    salaryMax: 180,
    stage: "interested",
    postingUrl: "https://meridianlabs.example.com/careers/senior-product-designer",
    addedOn: "2026-07-22",
    appliedOn: null,
    resumeFile: null,
    description:
      "Meridian Labs is building measurement tooling for climate teams. We're looking for a Senior Product Designer to own the analytics surface end to end.",
    notes:
      "Referral from Priya — she can intro to the hiring manager once I've tailored the resume.",
    contacts: [],
    activity: [{ id: "a1", label: "Added to board — Interested", date: "2026-07-22" }],
    accent: "moss",
  },
  {
    id: "fernwood-product-designer-growth",
    company: "Fernwood",
    role: "Product Designer, Growth",
    location: "Hybrid · Austin",
    salaryMin: 125,
    salaryMax: 145,
    stage: "applied",
    postingUrl: "https://fernwood.example.com/jobs/product-designer-growth",
    addedOn: "2026-07-11",
    appliedOn: "2026-07-15",
    resumeFile: "resume_growth_v2.pdf",
    description:
      "Fernwood is a subscription plant company. The Growth design team owns onboarding, pricing, and the referral loop.",
    notes: "Recruiter said they move fast — expect a screen within a week.",
    contacts: [
      {
        id: "c1",
        name: "Dana Whitfield",
        title: "Recruiter",
        email: "dana@fernwood.co",
      },
    ],
    activity: [
      {
        id: "a1",
        label: "Applied with resume_growth_v2.pdf",
        date: "2026-07-15",
      },
      { id: "a2", label: "Added to board — Interested", date: "2026-07-11" },
    ],
    accent: "forest",
  },
  {
    id: "cobalt-staff-ux-designer",
    company: "Cobalt Systems",
    role: "Staff UX Designer",
    location: "Remote (US)",
    salaryMin: 170,
    salaryMax: 200,
    stage: "applied",
    postingUrl: "https://cobaltsystems.example.com/careers/staff-ux-designer",
    addedOn: "2026-07-02",
    appliedOn: "2026-07-09",
    resumeFile: "resume_staff_v1.pdf",
    description:
      "Cobalt Systems sells infrastructure monitoring to platform teams. The Staff UX role leads design for the incident response product.",
    notes:
      "Heavy systems work — pull the design-system case study to the front of the portfolio.",
    contacts: [],
    activity: [
      { id: "a1", label: "Applied with resume_staff_v1.pdf", date: "2026-07-09" },
      { id: "a2", label: "Added to board — Interested", date: "2026-07-02" },
    ],
    accent: "teal",
  },
  {
    id: "harvest-lead-product-designer",
    company: "Harvest & Co",
    role: "Lead Product Designer",
    location: "Onsite · Chicago",
    salaryMin: 140,
    salaryMax: 165,
    stage: "interviewing",
    postingUrl: "https://harvest.example.com/careers/lead-product-designer",
    addedOn: "2026-06-26",
    appliedOn: "2026-06-30",
    resumeFile: "resume_lead_v1.pdf",
    description:
      "Harvest & Co is a food-tech company hiring a Lead Product Designer to build out our merchant experience.",
    notes:
      "Panel is 3 rounds: portfolio, cross-functional, exec. Prep case study on marketplace redesign.",
    contacts: [
      {
        id: "c1",
        name: "Tom Okafor",
        title: "Design Manager",
        email: "t.okafor@harvest.co",
      },
      { id: "c2", name: "Jess Liu", title: "Recruiter", email: "jess@harvest.co" },
    ],
    activity: [
      { id: "a1", label: "Portfolio review scheduled", date: "2026-07-20" },
      { id: "a2", label: "Moved to Interviewing", date: "2026-07-14" },
      { id: "a3", label: "Applied with resume_lead_v1.pdf", date: "2026-06-30" },
      { id: "a4", label: "Added to board — Interested", date: "2026-06-26" },
    ],
    accent: "wheat",
  },
  {
    id: "northbeam-product-designer-ii",
    company: "Northbeam",
    role: "Product Designer II",
    location: "Remote (US)",
    salaryMin: null,
    salaryMax: null,
    stage: "interviewing",
    postingUrl: "https://northbeam.example.com/jobs/product-designer-ii",
    addedOn: "2026-06-28",
    appliedOn: "2026-07-04",
    resumeFile: "resume_generalist_v3.pdf",
    description:
      "Northbeam builds route planning for regional freight. This role sits on the dispatcher tools team.",
    notes: "No band posted. Ask the recruiter before the second round.",
    contacts: [
      {
        id: "c1",
        name: "Ravi Menon",
        title: "Head of Design",
        email: "ravi@northbeam.io",
      },
    ],
    activity: [
      { id: "a1", label: "Moved to Interviewing", date: "2026-07-18" },
      {
        id: "a2",
        label: "Applied with resume_generalist_v3.pdf",
        date: "2026-07-04",
      },
      { id: "a3", label: "Added to board — Interested", date: "2026-06-28" },
    ],
    accent: "olive",
  },
  {
    id: "bramble-senior-ux-designer",
    company: "Bramble",
    role: "Senior UX Designer",
    location: "Hybrid · Denver",
    salaryMin: 145,
    salaryMax: 160,
    stage: "offer",
    postingUrl: "https://bramble.example.com/careers/senior-ux-designer",
    addedOn: "2026-06-08",
    appliedOn: "2026-06-14",
    resumeFile: "resume_senior_v4.pdf",
    description:
      "Bramble is a family scheduling app. The Senior UX role owns the shared-calendar experience across web and mobile.",
    notes: "Offer verbal on Jul 21. Written offer expected this week — compare against Harvest.",
    contacts: [
      {
        id: "c1",
        name: "Alex Chen",
        title: "Design Director",
        email: "alex@bramble.app",
      },
    ],
    activity: [
      { id: "a1", label: "Verbal offer received", date: "2026-07-21" },
      { id: "a2", label: "Final round complete", date: "2026-07-16" },
      { id: "a3", label: "Applied with resume_senior_v4.pdf", date: "2026-06-14" },
      { id: "a4", label: "Added to board — Interested", date: "2026-06-08" },
    ],
    accent: "slate",
  },
  {
    id: "quill-product-designer",
    company: "Quill Health",
    role: "Product Designer",
    location: "Remote (US)",
    salaryMin: 130,
    salaryMax: 150,
    stage: "rejected",
    postingUrl: "https://quillhealth.example.com/jobs/product-designer",
    addedOn: "2026-06-19",
    appliedOn: "2026-06-24",
    resumeFile: "resume_generalist_v3.pdf",
    description:
      "Quill Health builds intake software for small clinics. The role covers patient-facing forms and scheduling.",
    notes: "Passed after the screen — they wanted more healthcare domain depth.",
    contacts: [],
    activity: [
      { id: "a1", label: "Moved to Rejected", date: "2026-07-06" },
      {
        id: "a2",
        label: "Applied with resume_generalist_v3.pdf",
        date: "2026-06-24",
      },
      { id: "a3", label: "Added to board — Interested", date: "2026-06-19" },
    ],
    accent: "slate",
  },
];

/**
 * Dates are rendered from plain `YYYY-MM-DD` strings, which `Date` parses as
 * UTC. Formatting in UTC too keeps server and client output identical.
 */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatSalary(job: Pick<Job, "salaryMin" | "salaryMax">): string {
  const { salaryMin, salaryMax } = job;
  if (salaryMin === null && salaryMax === null) return "Salary TBD";
  if (salaryMin === null) return `Up to $${salaryMax}k`;
  if (salaryMax === null) return `From $${salaryMin}k`;
  return `$${salaryMin}k–$${salaryMax}k`;
}

/** The line under the card date: when it entered the pipeline, or when applied. */
export function timelineLabel(job: Job): string {
  return job.appliedOn
    ? `Applied ${formatShortDate(job.appliedOn)}`
    : `Added ${formatShortDate(job.addedOn)}`;
}

export function initials(company: string): string {
  return company.trim().charAt(0).toUpperCase();
}

/** "1 application" / "3 applications". */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Postings are user-supplied, and `<input type="url">` happily accepts
 * `javascript:` and `data:` schemes. Anything that is not an ordinary web link
 * yields `null`, and callers render no link at all.
 */
export function webLink(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
