# BUGS-V1 — Pre-launch bug tracker

## Fixed (2026-05-31)

| ID | Severity | File | Bug | Fix |
|----|----------|------|-----|-----|
| B-01 | Critical | `pulse-engine/src/types.ts` + `tds-calculator.ts` | `computeTdsAlerts` emitted category `"tds_deadline"` (same as TDS deadline reminders), so the Settings UI "Mute TDS Liability Alerts" had no effect | Added `"tds_calculator"` to `AlertCategory`; changed tds-calculator to use it |
| B-02 | Critical | `pulse-email/template.ts` | CTA and footer `<tr>` tags were direct children of a `<td>`, not inside a `<table>` — broken HTML in most email clients | Wrapped all body rows (greeting, alerts, snapshot, CTA, footer) in a single `<table width="100%">` |
| B-03 | High | `compliance-calendar.ts` | March advance tax instalment (month=2) always used the current calendar year. Running in May 2026 generated a March 2026 alert (already past) instead of March 2027 | Changed year to `month >= 3 ? year + 1 : year` for month 2 (March) |
| B-04 | High | `pulse-digest-view.tsx` | "Snooze" button called `PATCH /pulse-subscription` with `{snoozedCategories: [category]}` which **replaced** the entire snoozed list instead of appending | Changed to a UI-only "Hide" button (session-only); permanent muting is via Settings page. Server-side filtering (Prisma `notIn`) now handles subscription-level mutes |
| B-05 | Medium | `pulse/page.tsx` | Alert list was not filtered by `subscription.snoozedCategories` before rendering | Added `where: alertWhere` to Prisma `include.alerts` query using `notIn: sub.snoozedCategories` |

## Open

None. All bugs found in code review are fixed.

## Testing checklist (pre-ship)

- [ ] Upload Excel GL → document type detected → confirm → workspace active
- [ ] Chat: "Show me cash balance" → template match → correct result
- [ ] Chat: follow-up "what about last month?" → context preserved
- [ ] Chat: thumbs down → same question next time skips that learning
- [ ] Chat: rate limit (>20 queries/hr) → 429 returned
- [ ] Pulse: trigger cron manually with CRON_SECRET → digest created
- [ ] Pulse: email sent to admin → links in email work
- [ ] Pulse: mute a category in Settings → next digest excludes it
- [ ] Pulse: historical workspace → no deadline alerts generated
- [ ] Pulse: upload within 24h → welcome variant email
- [ ] Pulse: quiet day (no alerts + no snapshot) → email NOT sent, in-app shows "all clear"
- [ ] Advance tax: check March 15 alert generates with correct year (next calendar year when in Apr-Dec)
- [ ] TDS calculator: vendor paid >30K without TDS → alert appears in digest with category "tds_calculator"
- [ ] Settings: mute "TDS Liability Alerts" → tds_calculator alerts disappear from digest
