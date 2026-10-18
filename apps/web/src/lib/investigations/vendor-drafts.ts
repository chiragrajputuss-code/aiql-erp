// ─── Vendor follow-up drafts ──────────────────────────────────────────────────
//
// Turns a finding's recommendation into the message itself: when a finding says
// "follow up with these vendors", the CA shouldn't then have to compose three
// WhatsApp messages by hand — the evidence already contains every invoice
// number and amount needed. One draft per vendor, ready to copy or share.
//
// Deliberately template-based and deterministic (NO LLM): these texts go to a
// third party under the client's name, so they must be exact, reproducible,
// and contain nothing the evidence doesn't contain. Same finding in, same
// drafts out — the same rule the engine itself follows.
//
// Only findings whose recommended action IS vendor contact get drafts:
//   GST-ITC-002          → "please file your GSTR-1" reminder
//   DUP-PAY-001 / -002   → "confirm / refund the duplicate payment" request
// GST-ITC-006 is deliberately excluded — its whole point is "do not chase".

export interface DraftEvidence {
  description: string;
  amountRs:    number | null;
  references:  string[];
  rows:        Record<string, unknown>[];
}

export interface DraftableFinding {
  code:     string;
  evidence: DraftEvidence[];
}

export interface VendorDraft {
  vendor:   string;                                   // display name, or "" when unknown
  kind:     "gstr1_reminder" | "duplicate_payment";
  amountRs: number;                                   // total this draft covers
  message:  string;                                   // WhatsApp/email-ready text
}

export interface DraftContext {
  clientName?:  string;   // the client business the books belong to
  firmName?:    string;   // the CA firm sending the message (optional)
  periodLabel?: string;   // "May 2026"
}

const DRAFTABLE = new Set(["GST-ITC-002", "DUP-PAY-001", "DUP-PAY-002"]);

export function isDraftable(code: string): boolean {
  return DRAFTABLE.has(code);
}

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function signoff(ctx: DraftContext): string {
  if (ctx.firmName && ctx.clientName) return `Regards,\n${ctx.firmName}\n(for ${ctx.clientName})`;
  if (ctx.firmName)                   return `Regards,\n${ctx.firmName}`;
  if (ctx.clientName)                 return `Regards,\nAccounts — ${ctx.clientName}`;
  return "Regards,\nAccounts team";
}

// GST-ITC-002 evidence is one block per missing invoice, built by
// evidenceFromGap() as references = [invoiceRef, partyName].filter(Boolean)
// and a description that always embeds the invoice ref when one exists
// ("… against invoice INV-123 …"). That lets us tell, deterministically,
// which single reference is the ref and which is the party:
//   two refs  → [invoice, party]
//   one ref   → the invoice if the description mentions it, else the party
function splitRefs(e: DraftEvidence): { invoiceRef: string | null; party: string | null } {
  const refs = e.references.filter(Boolean);
  if (refs.length >= 2) return { invoiceRef: refs[0], party: refs[refs.length - 1] };
  if (refs.length === 1) {
    return e.description.includes(refs[0])
      ? { invoiceRef: refs[0], party: null }
      : { invoiceRef: null, party: refs[0] };
  }
  return { invoiceRef: null, party: null };
}

function gstr1ReminderDrafts(f: DraftableFinding, ctx: DraftContext): VendorDraft[] {
  // Group the per-invoice evidence blocks by vendor.
  const byVendor = new Map<string, { invoiceRef: string | null; amountRs: number }[]>();
  for (const e of f.evidence) {
    const { invoiceRef, party } = splitRefs(e);
    const key = party ?? "";
    const list = byVendor.get(key) ?? [];
    list.push({ invoiceRef, amountRs: e.amountRs ?? 0 });
    byVendor.set(key, list);
  }

  const period = ctx.periodLabel ?? "the period";
  const ofClient = ctx.clientName ? ` of ${ctx.clientName}` : "";

  return [...byVendor.entries()].map(([vendor, invoices]) => {
    const total = invoices.reduce((s, i) => s + i.amountRs, 0);
    const lines = invoices.map((i) =>
      `• ${i.invoiceRef ? `Invoice ${i.invoiceRef}` : "Invoice (ref not available)"}${i.amountRs > 0 ? ` — ${inr(i.amountRs)}` : ""}`,
    );
    const message =
      `Dear ${vendor || "Supplier"} team,\n\n` +
      `The following invoice${invoices.length > 1 ? "s" : ""} booked in the purchase records${ofClient} ` +
      `ha${invoices.length > 1 ? "ve" : "s"} not yet appeared in GSTR-2B for ${period}:\n\n` +
      `${lines.join("\n")}\n\n` +
      `This usually means the GSTR-1 for the period is still pending. Request you to kindly file it at the earliest ` +
      `so the input tax credit on ${invoices.length > 1 ? "these invoices" : "this invoice"} is not blocked. ` +
      `Until ${invoices.length > 1 ? "they reflect" : "it reflects"} in GSTR-2B, further payments may need to be kept on hold.\n\n` +
      `If the return has already been filed in the last few days, please ignore this message.\n\n` +
      signoff(ctx);
    return { vendor, kind: "gstr1_reminder" as const, amountRs: total, message };
  });
}

// Duplicate-payment evidence is one block per payment cluster, built by
// evidenceFor() as references = [payeeName, ...paymentRefs]; rows.length is
// the number of payments in the cluster, amountRs the per-payment amount.
function duplicatePaymentDrafts(f: DraftableFinding, ctx: DraftContext): VendorDraft[] {
  return f.evidence.map((e) => {
    const vendor = e.references[0] ?? "";
    const payRefs = e.references.slice(1).filter(Boolean);
    const count = Math.max(e.rows.length, 2);
    const amount = e.amountRs ?? 0;
    const ofClient = ctx.clientName ? `${ctx.clientName}'s` : "our";

    const message =
      `Dear ${vendor || "Supplier"} team,\n\n` +
      `While reviewing ${ofClient} ledger we found ${count} payments${amount > 0 ? ` of ${inr(amount)} each` : ""} ` +
      `that appear to relate to the same invoice` +
      `${payRefs.length > 0 ? ` (ref: ${payRefs.join(", ")})` : ""}.\n\n` +
      `Request you to kindly confirm whether these were against separate invoices. If one is a duplicate, ` +
      `please arrange a refund or adjust it against the next invoice.\n\n` +
      signoff(ctx);
    return { vendor, kind: "duplicate_payment" as const, amountRs: amount, message };
  });
}

export function buildVendorDrafts(f: DraftableFinding, ctx: DraftContext = {}): VendorDraft[] {
  if (f.code === "GST-ITC-002") return gstr1ReminderDrafts(f, ctx);
  if (f.code === "DUP-PAY-001" || f.code === "DUP-PAY-002") return duplicatePaymentDrafts(f, ctx);
  return [];
}
