// ─── Product tours ───────────────────────────────────────────────────────────
//
// Guided walkthroughs that spotlight REAL elements on the page rather than
// screenshots of them. The trade-off that drove this choice: a screenshot
// silently goes wrong the moment the UI changes and nobody notices until a
// confused CA is looking at a picture that doesn't match their screen. A
// selector-driven tour fails loudly instead — a step whose target is missing
// is skipped at runtime (see product-tour.tsx), and the dev-only console
// warning says which selector went stale.
//
// Contract: every `target` is a [data-tour="..."] attribute on a real element.
// When you rename or remove one, grep this file. Steps are matched to a page
// by pathname via tourForPath().

export interface TourStep {
  /** data-tour attribute value on the element to spotlight. */
  target:    string;
  title:     string;
  body:      string;
  /** Where the tooltip sits relative to the target. Falls back if it would
   *  overflow the viewport. */
  placement?: "top" | "bottom" | "left" | "right";
}

export interface Tour {
  id:    string;
  title: string;
  steps: TourStep[];
}

// ─── Investigations page ─────────────────────────────────────────────────────

const INVESTIGATIONS_TOUR: Tour = {
  id:    "investigations",
  title: "Running an investigation",
  steps: [
    {
      target: "client-switcher",
      title:  "Pick the client book",
      body:   "Every file you upload becomes its own client book. If you handle several clients, switch between them here — findings, history and the PDF export all follow this selection.",
      placement: "bottom",
    },
    {
      target: "run-investigation",
      title:  "Run the checks",
      body:   "This reads the client's General Ledger against their GSTR-2B and looks for two things: purchase invoices missing from GSTR-2B (ITC at risk) and the same bill paid twice. It usually takes under a minute.",
      placement: "bottom",
    },
    {
      target: "period-selector",
      title:  "Look at an earlier month",
      body:   "Once you've run more than one period for a client, you can jump back to any past run here. Nothing is overwritten — an earlier month stays exactly as it was reported.",
      placement: "bottom",
    },
    {
      target: "findings-list",
      title:  "Read the findings",
      body:   "Worst first. Each finding carries the rupee amount involved, the evidence rows behind it, and a recommended action. Open 'Show evidence' on any finding to see the underlying vouchers before you act on it.",
      placement: "top",
    },
    {
      target: "download-pdf",
      title:  "Hand it to the client",
      body:   "Exports the same findings as a working-paper PDF with the evidence annexure — the document you'd forward to a client or keep on file.",
      placement: "bottom",
    },
  ],
};

// ─── Practice dashboard ──────────────────────────────────────────────────────

const PRACTICE_TOUR: Tour = {
  id:    "practice",
  title: "Your practice at a glance",
  steps: [
    {
      target: "practice-summary",
      title:  "The whole practice in three numbers",
      body:   "How many client books you have, how many have never been run, and the total rupees at risk across all of them.",
      placement: "bottom",
    },
    {
      target: "practice-table",
      title:  "One row per client",
      body:   "Sorted by what needs attention first — critical findings, then rupees at risk. Click any column heading to re-sort. A client marked 'stale' hasn't been run in over 45 days.",
      placement: "top",
    },
    {
      target: "practice-action",
      title:  "Jump straight into a client",
      body:   "Opens that client's investigation page directly. It says 'Run' if the client has never been checked or the last run has gone stale, and 'View' if there are current findings to read.",
      placement: "left",
    },
  ],
};

// ─── Connections list ────────────────────────────────────────────────────────

const CONNECTIONS_TOUR: Tour = {
  id:    "connections",
  title: "Adding a client's books",
  steps: [
    {
      target: "add-connection",
      title:  "Start here for a new client",
      body:   "Upload a General Ledger export — from Tally, Zoho, or any accounting system, as Excel or CSV. Column headings don't need to match anything exact; they get detected and mapped for you.",
      placement: "bottom",
    },
    {
      target: "connections-list",
      title:  "One entry per uploaded file",
      body:   "A client's GL and their GSTR-2B are separate uploads, so both appear here. Upload the GSTR-2B for the same period and the ITC checks light up automatically on the next run.",
      placement: "top",
    },
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const TOURS: Tour[] = [INVESTIGATIONS_TOUR, PRACTICE_TOUR, CONNECTIONS_TOUR];

/** Exact-match first, then longest prefix — so /connections/new does not
 *  accidentally inherit the /connections tour. */
const PATH_TO_TOUR: Record<string, string> = {
  "/investigations": "investigations",
  "/practice":       "practice",
  "/connections":    "connections",
};

export function tourForPath(pathname: string): Tour | null {
  const id = PATH_TO_TOUR[pathname];
  if (!id) return null;
  return TOURS.find((t) => t.id === id) ?? null;
}

export function getTour(id: string): Tour | null {
  return TOURS.find((t) => t.id === id) ?? null;
}

export { TOURS };
