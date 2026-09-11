import type { SeedAccount } from "./plan";

/**
 * The accounts `npm run db:seed` creates on the local stack, one per flow worth looking at without
 * setting it up by hand. What each must show is pinned by `tests/seed/accounts.test.ts`; the words
 * themselves are free to change.
 *
 * Document `lines` are drawn into a real PDF, so they are plain ASCII and at most 90 characters.
 */

const SAM_RESUME = [
  "Sam Rivera - Senior Product Designer",
  "Austin, TX | sam.rivera@example.com | samrivera.example.com",
  "SUMMARY",
  "Eight years designing analytics, onboarding, and marketplace products for B2B teams.",
  "Leads research through launch; comfortable owning a surface end to end.",
  "EXPERIENCE",
  "Lumen Analytics - Senior Product Designer - 2022 to present",
  "- Redesigned the reporting surface; weekly active use of dashboards up 18 percent.",
  "- Built the component library now used by four product teams.",
  "- Ran 40+ customer interviews to reshape onboarding; time to first chart halved.",
  "Parcelwise - Product Designer - 2019 to 2022",
  "- Designed the merchant onboarding flow and the pricing experiments behind it.",
  "- Partnered with engineering on a design-token pipeline shipped to web and iOS.",
  "Studio Oak - Interaction Designer - 2017 to 2019",
  "- Prototyped booking and scheduling tools for healthcare and hospitality clients.",
  "SKILLS",
  "Interaction design, design systems, research synthesis, prototyping (Figma, code).",
  "EDUCATION",
  "BFA, Interaction Design - California College of the Arts",
];

const SAM_FERNWOOD_LETTER = [
  "Sam Rivera | sam.rivera@example.com",
  "Dear Fernwood Growth team,",
  "I'm applying for the Product Designer, Growth role. At Parcelwise I designed the",
  "merchant onboarding flow and ran the pricing experiments behind it, and at Lumen",
  "Analytics I halved time to first chart by reshaping onboarding around interviews.",
  "Fernwood's referral loop and pricing pages are exactly the kind of surface I like",
  "to own: measurable, close to customers, and full of small decisions that compound.",
  "I'd love to talk about how I'd approach your first-week experience.",
  "Thank you for your time,",
  "Sam Rivera",
];

const MORGAN_RESUME = [
  "Morgan Hale - Product Designer",
  "Seattle, WA | morgan.hale@example.com",
  "Six years designing consumer and B2B products, from research to shipped UI.",
  "EXPERIENCE",
  "Harborline - Product Designer - 2021 to present",
  "- Owned the trip-planning flow; completed bookings up 12 percent after the redesign.",
  "- Introduced weekly usability sessions with customers and support.",
  "Pinecrest Health - UX Designer - 2018 to 2021",
  "- Designed patient intake forms used by 300 clinics.",
  "SKILLS",
  "Interaction design, usability testing, accessibility, Figma, prototyping.",
];

const MORGAN_SYSTEMS_RESUME = [
  "Morgan Hale - Product Designer, Design Systems",
  "Seattle, WA | morgan.hale@example.com",
  "Six years designing products, the last three building and running a design system.",
  "EXPERIENCE",
  "Harborline - Product Designer, Design Systems - 2021 to present",
  "- Built and maintain the component library used by nine product teams.",
  "- Led the move to design tokens across web, iOS, and Android.",
  "- Wrote the accessibility guidelines every component now ships against.",
  "Pinecrest Health - UX Designer - 2018 to 2021",
  "- Consolidated 14 form patterns into one accessible form system.",
  "SKILLS",
  "Design systems, design tokens, accessibility (WCAG 2.1 AA), documentation, Figma.",
];

const MORGAN_LETTER = [
  "Morgan Hale | morgan.hale@example.com",
  "Hello,",
  "I'm a product designer with six years of experience, the last three spent building",
  "a design system used across nine teams. I care about the details that make an",
  "interface feel dependable: consistent patterns, clear states, and accessible defaults.",
  "I'd welcome the chance to bring that to your team.",
  "Best,",
  "Morgan Hale",
];

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  {
    key: "new",
    name: "Riley Park",
    verified: true,
    about: "First run: the empty board, contacts, and documents; add a first job and upload a first file.",
  },
  {
    key: "searching",
    name: "Sam Rivera",
    verified: true,
    about:
      "Mid-search: eight jobs across all five stages, a recruiter on three of them, two documents in kits, " +
      "and cover letters ready to write (Harvest & Co), short on description (Cobalt), and missing a resume (Meridian).",
    documents: [
      {
        key: "resume",
        kind: "resume",
        fileName: "sam-rivera-resume.pdf",
        lines: SAM_RESUME,
        uploadedDaysAgo: 40,
      },
      {
        key: "fernwood-letter",
        kind: "cover_letter",
        fileName: "fernwood-cover-letter.pdf",
        lines: SAM_FERNWOOD_LETTER,
        uploadedDaysAgo: 22,
      },
    ],
    contacts: [
      {
        key: "dana",
        name: "Dana Whitfield",
        kind: "recruiter",
        title: "Senior Design Recruiter",
        agency: "Northstar Talent",
        email: "dana@northstar-talent.example.com",
        phone: "+1 (512) 555-0142",
        linkedinUrl: "https://www.linkedin.com/in/dana-whitfield-example",
        notes: "Places product designers at Series B-D startups. Put me forward for Fernwood, Cobalt, and Northbeam.",
        lastSpokenDaysAgo: 3,
      },
      {
        key: "tom",
        name: "Tom Okafor",
        kind: "hiring_manager",
        title: "Design Manager",
        email: "t.okafor@harvest.example.com",
        lastSpokenDaysAgo: 5,
      },
      {
        key: "priya",
        name: "Priya Nair",
        kind: "referrer",
        title: "Staff Designer",
        notes: "Former teammate at Lumen. Offered to refer me once the resume is tailored.",
        lastSpokenDaysAgo: 12,
      },
      {
        key: "alex",
        name: "Alex Chen",
        kind: "hiring_manager",
        title: "Design Director",
        email: "alex@bramble.example.com",
        lastSpokenDaysAgo: 4,
      },
      {
        key: "jess",
        name: "Jess Liu",
        kind: "other",
        title: "Design Lead",
        notes: "Met at Config. Worth a coffee when a design systems role comes up.",
        lastSpokenDaysAgo: 30,
      },
    ],
    jobs: [
      {
        company: "Bramble",
        role: "Senior UX Designer",
        location: "Hybrid · Denver",
        salaryMin: 145,
        salaryMax: 160,
        postingUrl: "https://bramble.example.com/careers/senior-ux-designer",
        description:
          "Bramble is a family scheduling app. The Senior UX role owns the shared-calendar experience across web " +
          "and mobile: invites, recurring events, and the conflicts that come with three kids and two jobs. You'll " +
          "work with a small, senior team and talk to families every week.",
        notes: "Verbal offer on the call. Written offer expected this week — compare against Harvest before answering.",
        addedDaysAgo: 45,
        moves: [
          { stage: "applied", daysAgo: 41 },
          { stage: "interviewing", daysAgo: 28 },
          { stage: "offer", daysAgo: 4 },
        ],
        contacts: ["alex"],
        resume: "resume",
      },
      {
        company: "Quill Health",
        role: "Product Designer",
        location: "Remote (US)",
        salaryMin: 130,
        salaryMax: 150,
        postingUrl: "https://quillhealth.example.com/jobs/product-designer",
        description:
          "Quill Health builds intake software for small clinics. The role covers patient-facing forms and " +
          "scheduling, with a strong focus on accessibility and plain language.",
        notes: "Passed after the screen — they wanted more healthcare domain depth.",
        addedDaysAgo: 38,
        moves: [
          { stage: "applied", daysAgo: 36 },
          { stage: "rejected", daysAgo: 22 },
        ],
        resume: "resume",
      },
      {
        company: "Harvest & Co",
        role: "Lead Product Designer",
        location: "Onsite · Chicago",
        salaryMin: 140,
        salaryMax: 165,
        postingUrl: "https://harvest.example.com/careers/lead-product-designer",
        description:
          "Harvest & Co is a food-tech company connecting independent farms with restaurants. We're hiring a Lead " +
          "Product Designer to build out the merchant experience: ordering, invoicing, and delivery tracking for " +
          "4,000 restaurant partners. You'll lead two designers, partner with the head of product on strategy, and " +
          "run research with merchants in the field. We're looking for 7+ years of experience, a portfolio with " +
          "marketplace or B2B work, and a track record of mentoring designers.",
        notes: "Panel is three rounds: portfolio, cross-functional, exec. Prep the marketplace case study.",
        addedDaysAgo: 35,
        moves: [
          { stage: "applied", daysAgo: 32 },
          { stage: "interviewing", daysAgo: 14 },
        ],
        contacts: ["tom"],
        resume: "resume",
      },
      {
        company: "Northbeam",
        role: "Product Designer II",
        location: "Remote (US)",
        postingUrl: "https://northbeam.example.com/jobs/product-designer-ii",
        description:
          "Northbeam builds route planning for regional freight. This role sits on the dispatcher tools team, " +
          "designing the live map, load assignment, and exception handling that dispatchers use all day. You'll " +
          "shadow dispatchers, prototype quickly, and work with an engineering team that ships weekly. Experience " +
          "with complex operational tools or real-time data is a plus.",
        notes: "No band posted. Ask Dana before the second round.",
        addedDaysAgo: 30,
        moves: [
          { stage: "applied", daysAgo: 27 },
          { stage: "interviewing", daysAgo: 9 },
        ],
        contacts: ["dana"],
        resume: "resume",
      },
      {
        company: "Fernwood",
        role: "Product Designer, Growth",
        location: "Hybrid · Austin",
        salaryMin: 125,
        salaryMax: 145,
        postingUrl: "https://fernwood.example.com/jobs/product-designer-growth",
        description:
          "Fernwood is a subscription plant company. The Growth design team owns onboarding, pricing, and the " +
          "referral loop. As Product Designer, Growth, you'll run experiments with a dedicated engineer and " +
          "analyst, turn results into shipped improvements, and help us understand why customers stay. We'd love " +
          "someone who is fluent in experimentation, writes clearly, and enjoys the details of conversion flows.",
        notes: "Dana says they move fast — expect a screen within a week.",
        addedDaysAgo: 24,
        moves: [{ stage: "applied", daysAgo: 20 }],
        contacts: ["dana"],
        resume: "resume",
        coverLetter: "fernwood-letter",
      },
      {
        company: "Cobalt Systems",
        role: "Staff UX Designer",
        location: "Remote (US)",
        salaryMax: 200,
        postingUrl: "https://cobaltsystems.example.com/careers/staff-ux-designer",
        description:
          "Cobalt Systems sells infrastructure monitoring to platform teams. The Staff UX Designer leads design " +
          "for incident response.",
        notes: "Only the summary so far — paste the full posting before writing a letter.",
        addedDaysAgo: 18,
        moves: [{ stage: "applied", daysAgo: 15 }],
        contacts: ["dana"],
        resume: "resume",
      },
      {
        company: "Meridian Labs",
        role: "Senior Product Designer",
        location: "Remote (US)",
        salaryMin: 150,
        salaryMax: 180,
        postingUrl: "https://meridianlabs.example.com/careers/senior-product-designer",
        description:
          "Meridian Labs builds measurement tooling for climate teams. We're hiring a Senior Product Designer to own " +
          "the analytics surface end to end: how teams explore emissions data, build reports, and share them with " +
          "auditors. You'll work with two engineering squads and our research lead, shape the roadmap with " +
          "product, and set the bar for interaction quality across the app. 6+ years of product design " +
          "experience, strong systems thinking, and comfort with dense data interfaces.",
        notes: "Priya can refer me once the resume is tailored for analytics work.",
        addedDaysAgo: 3,
        contacts: ["priya"],
      },
      {
        company: "Loft & Ledger",
        role: "Product Designer, Payments",
        location: "Hybrid · New York",
        salaryMin: 135,
        description:
          "Loft & Ledger makes bookkeeping software for independent shops. The Payments team is looking for a " +
          "Product Designer to design invoicing and payouts, working closely with risk and support.",
        addedDaysAgo: 1,
      },
    ],
    lettersUsed: 2,
  },
  {
    key: "at-limits",
    name: "Morgan Hale",
    verified: true,
    about:
      "At every limit: all three document slots used, so upload refuses, and this week's cover letters used, " +
      "so Tidewater's card shows when the next ones arrive.",
    documents: [
      {
        key: "resume",
        kind: "resume",
        fileName: "morgan-hale-resume.pdf",
        lines: MORGAN_RESUME,
        uploadedDaysAgo: 20,
      },
      {
        key: "letter",
        kind: "cover_letter",
        fileName: "morgan-hale-cover-letter.pdf",
        lines: MORGAN_LETTER,
        uploadedDaysAgo: 15,
      },
      {
        key: "systems-resume",
        kind: "resume",
        fileName: "morgan-hale-resume-design-systems.pdf",
        lines: MORGAN_SYSTEMS_RESUME,
        uploadedDaysAgo: 9,
      },
    ],
    jobs: [
      {
        company: "Tidewater",
        role: "Senior Product Designer, Design Systems",
        location: "Remote (US)",
        salaryMin: 160,
        salaryMax: 185,
        postingUrl: "https://tidewater.example.com/careers/senior-product-designer-design-systems",
        description:
          "Tidewater makes fleet-management software for ports and shipping terminals. We're hiring a Senior " +
          "Product Designer to lead our design system: the components, tokens, and guidelines behind six products. " +
          "You'll partner with a front-end platform team, run the system's roadmap, and help product designers use " +
          "it well. Experience building and maintaining a design system at scale, and a strong grasp of " +
          "accessibility, are required.",
        addedDaysAgo: 12,
        moves: [{ stage: "applied", daysAgo: 9 }],
        resume: "systems-resume",
      },
      {
        company: "Kestrel Maps",
        role: "Product Designer",
        location: "Hybrid · Seattle",
        salaryMin: 120,
        salaryMax: 140,
        postingUrl: "https://kestrelmaps.example.com/jobs/product-designer",
        description:
          "Kestrel Maps builds offline-first maps for hikers and search-and-rescue teams. The Product Designer will " +
          "work across the route planner and the field app, with research trips to see how teams navigate without " +
          "signal. Experience designing for mobile in demanding conditions is a plus.",
        addedDaysAgo: 5,
        resume: "resume",
        coverLetter: "letter",
      },
    ],
    lettersUsed: 5,
  },
  {
    key: "unverified",
    name: "Casey Quinn",
    verified: false,
    about: "Signed up, never verified: signing in asks to verify, and the resent link arrives in Mailpit.",
  },
];
