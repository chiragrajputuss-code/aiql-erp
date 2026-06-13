/**
 * Shared types and metadata for the close-period creation flow.
 *
 * These exist in one place so wizard, detail page, and API routes don't drift.
 * Server-side route handlers should also import these where the response
 * shape needs to be locked in.
 */

import type { LucideIcon } from "lucide-react";

// ─── Core enums (re-exported / mirrored) ────────────────────────────────────

export type CloseProfile = "STANDARD" | "QUICK" | "YEAR_END" | "ADAPTIVE";

// ─── Parsed user intent (close-engine output, serialised over the wire) ─────

export interface CloseIntent {
  focusAreas:    string[];
  watchAccounts: string[];
  exclusions:    string[];
  riskFlags:     string[];
  oneOffEvents:  string[];
  ambiguities:   string[];
  confidence:    number;
  rationale:     string;
  source:        string;
}

// ─── Server response shapes ────────────────────────────────────────────────

export interface ContextHintsResponse {
  accountCounts: { bank: number; ar: number; ap: number; tax: number; inventory: number; other: number };
  topIssues:     string[];
  scanError:     string | null;
  yearEndLikely: boolean;
  recurringWatchItems: string[];
  recurringPatterns?:  Array<{ pattern: string; count: number }>;
  suggestions:   Array<{ kind: string; label: string; hint: string }>;
}

export interface PreferencesResponse {
  hasPrevious:           boolean;
  lastProfile:           CloseProfile | null;
  lastIntent:            string | null;
  lastIntentSummary:     CloseIntent | null;
  lastCustomWatchItems:  string[];
  lastClosedAt:          string | null;
  usageCount:            Record<string, number>;
  recurringPatterns:     unknown;
}

export interface PreviewTaskSummary {
  key: string;
  title: string;
  description: string;
  category: string;
  autoComplete: boolean;
  dependsOnKeys: string[];
  sortOrder: number;
  hasReconciliation: boolean;
}

export interface PreviewDiff {
  added:          Array<{ key: string; title: string; category: string }>;
  removed:        Array<{ key: string; title: string; category: string }>;
  addedCount:     number;
  removedCount:   number;
  unchangedCount: number;
  baselineCount:  number;
  chosenCount:    number;
}

export interface PreviewResponse {
  profile:  CloseProfile;
  intent:   CloseIntent | null;
  template: {
    name: string;
    periodType: string;
    tasks: PreviewTaskSummary[];
  };
  scanSummary: { criticalCount: number; reviewCount: number; infoCount: number };
  reasoning:   string[];
  diff:        PreviewDiff | null;
}

// ─── Profile metadata — single source of truth ──────────────────────────────
//
// The wizard's profile picker and the detail page's profile chip read from
// the same record so there's no drift in label / tagline / colour.

export interface ProfileMeta {
  /** Short title shown on cards / chips */
  label:     string;
  /** One-line description shown under the title */
  tagline:   string;
  /** Longer body text (only the wizard shows this) */
  description: string;
  /** Lucide icon component */
  icon:      LucideIcon;
  /** Approximate task count range — wizard only */
  estTasks:  string;
  /** Optional small badge (e.g. "Recommended") */
  badge?:    string;
  /** Tailwind classes for the pill on the detail page */
  pillClass: string;
  /** Tailwind classes for the panel background tint on the detail page */
  bgClass:   string;
}

// Defer icon imports here so consumers control bundle size.
import { Building2, Zap, Calendar, Wand2 } from "lucide-react";

export const PROFILE_META: Record<CloseProfile, ProfileMeta> = {
  STANDARD: {
    label:       "Standard",
    tagline:     "Recommended for monthly close",
    description: "Full template — opening balances, all account recons that apply, P&L + BS review, flux, sign-off.",
    icon:        Building2,
    estTasks:    "8–14 tasks",
    badge:       "Recommended",
    pillClass:   "bg-slate-50 text-slate-700 border-slate-200",
    bgClass:     "bg-slate-50/40",
  },
  QUICK: {
    label:       "Quick",
    tagline:     "Critical-path only",
    description: "Bank recon + critical anomalies + P&L review + sign-off. Skips BS review, flux, GST/AR/AP recons.",
    icon:        Zap,
    estTasks:    "3–6 tasks",
    pillClass:   "bg-amber-50 text-amber-700 border-amber-200",
    bgClass:     "bg-amber-50/30",
  },
  YEAR_END: {
    label:       "Year-end",
    tagline:     "March 31 / financial-year close",
    description: "Standard plus year-end accruals, depreciation, 26AS reconciliation, physical stock count, year-on-year flux.",
    icon:        Calendar,
    estTasks:    "12–18 tasks",
    pillClass:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    bgClass:     "bg-emerald-50/30",
  },
  ADAPTIVE: {
    label:       "Adaptive",
    tagline:     "Tell AI what to focus on",
    description: "Standard plus tasks driven by your free-text instructions. Watch specific accounts, flag risks, skip irrelevant work.",
    icon:        Wand2,
    estTasks:    "varies",
    pillClass:   "bg-indigo-50 text-indigo-700 border-indigo-200",
    bgClass:     "bg-indigo-50/30",
  },
};

/** Iteration order for the profile picker — keep STANDARD first as the default. */
export const PROFILE_ORDER: CloseProfile[] = ["STANDARD", "QUICK", "YEAR_END", "ADAPTIVE"];
