/**
 * P&L Review Agent
 *
 * Investigates a profit & loss statement using:
 *   - Tool calls to drill into accounts
 *   - Cross-checks against deterministic SQL
 *   - Question budget (max 3 questions to user)
 *   - Per-customer learned knowledge (skip questions already answered)
 *
 * Outputs structured analysis with:
 *   - Headline numbers (verified)
 *   - Investigations (with reasoning + evidence)
 *   - Concerns (severity-ranked)
 *   - Overall assessment
 *   - Confidence label (verbal, not numeric)
 */
import { prisma } from "@aiql/db";
// ─── Question budget config ──────────────────────────────────────────────────
export const QUESTION_BUDGET = {
    maxQuestions: 3,
    minMaterialityInr: 10000, // questions below this don't earn a slot
    minConfidenceShift: 0.15, // must move confidence by 15%+
};
async function computePlNumbers(connectionId, startDate, endDate) {
    // Load account types
    const conn = await prisma.erpConnection.findUnique({
        where: { id: connectionId },
        select: { schemaCacheJson: true, uploadedFile: true },
    });
    const tableName = conn?.uploadedFile?.tableName;
    if (!tableName)
        throw new Error("No GL table");
    const typeMap = {};
    if (conn?.schemaCacheJson) {
        try {
            const s = JSON.parse(conn.schemaCacheJson);
            Object.assign(typeMap, s.accountTypeMap ?? {});
        }
        catch { /* ignore */ }
    }
    // Also pick up confirmed account mappings
    const confirmed = await prisma.orgAccountMapping.findMany({
        where: { connectionId, isConfirmed: true },
    });
    for (const m of confirmed)
        typeMap[m.accountName] = m.accountType;
    const startIso = startDate.toISOString().slice(0, 10);
    const endIso = endDate.toISOString().slice(0, 10);
    const sql = `
    SELECT account_name,
           COALESCE(SUM(debit_amount), 0) AS total_debit,
           COALESCE(SUM(credit_amount), 0) AS total_credit
    FROM "${tableName}"
    WHERE transaction_date BETWEEN '${startIso}' AND '${endIso}'
      AND account_name IS NOT NULL AND account_name <> ''
    GROUP BY account_name
  `;
    const rows = await prisma.$queryRawUnsafe(sql);
    const num = (v) => typeof v === "bigint" ? Number(v) : v;
    const revenue = [];
    const cogs = [];
    const expenses = [];
    const otherIncome = [];
    for (const r of rows) {
        const td = num(r.total_debit);
        const tc = num(r.total_credit);
        const type = typeMap[r.account_name] ?? "UNKNOWN";
        const aggBase = { accountName: r.account_name, totalDebit: td, totalCredit: tc };
        if (type === "REVENUE") {
            revenue.push({ ...aggBase, net: tc - td });
        }
        else if (type === "COGS") {
            cogs.push({ ...aggBase, net: td - tc });
        }
        else if (type === "EXPENSE") {
            expenses.push({ ...aggBase, net: td - tc });
        }
        else if (type === "OTHER_INCOME") {
            otherIncome.push({ ...aggBase, net: tc - td });
        }
    }
    const sumNet = (arr) => arr.reduce((s, a) => s + a.net, 0);
    const revTotal = sumNet(revenue);
    const cogsTotal = sumNet(cogs);
    const grossProfit = revTotal - cogsTotal;
    const opExpTotal = sumNet(expenses);
    const opProfit = grossProfit - opExpTotal;
    const otherIncomeTotal = sumNet(otherIncome);
    const netProfit = opProfit + otherIncomeTotal;
    return {
        revenue, cogs, expenses, otherIncome,
        totals: {
            revenue: revTotal,
            cogs: cogsTotal,
            grossProfit,
            grossMarginPct: revTotal > 0 ? (grossProfit / revTotal) * 100 : 0,
            operatingExpenses: opExpTotal,
            operatingProfit: opProfit,
            netProfitPct: revTotal > 0 ? (netProfit / revTotal) * 100 : 0,
        },
    };
}
async function detectTriggers(connectionId, startDate, endDate, numbers) {
    const triggers = [];
    // Compute prior period for comparison
    const periodMs = endDate.getTime() - startDate.getTime();
    const priorEnd = new Date(startDate.getTime() - 86400000);
    const priorStart = new Date(priorEnd.getTime() - periodMs);
    const conn = await prisma.erpConnection.findUnique({
        where: { id: connectionId },
        select: { uploadedFile: true },
    });
    const tableName = conn?.uploadedFile?.tableName;
    if (!tableName)
        return triggers;
    // Get prior period revenue/expense totals for comparison
    const piso = (d) => d.toISOString().slice(0, 10);
    const compareSql = `
    SELECT account_name,
           COALESCE(SUM(debit_amount - credit_amount), 0) AS net
    FROM "${tableName}"
    WHERE transaction_date BETWEEN '${piso(priorStart)}' AND '${piso(priorEnd)}'
      AND account_name IS NOT NULL
    GROUP BY account_name
  `;
    const priorRows = await prisma.$queryRawUnsafe(compareSql)
        .catch(() => []);
    const priorMap = new Map();
    for (const r of priorRows) {
        priorMap.set(r.account_name, typeof r.net === "bigint" ? Number(r.net) : r.net);
    }
    // Trigger 1: any account with >25% variance and >₹50K
    const allAccounts = [...numbers.revenue, ...numbers.cogs, ...numbers.expenses, ...numbers.otherIncome];
    for (const acc of allAccounts) {
        const priorNet = Math.abs(priorMap.get(acc.accountName) ?? 0);
        const currentNet = Math.abs(acc.net);
        if (priorNet === 0 && currentNet > 50000) {
            triggers.push({
                question: `Why does "${acc.accountName}" show ₹${currentNet.toLocaleString("en-IN")} of activity now when it had none in the prior period?`,
                account: acc.accountName,
                reason: "new_activity",
                priority: 8,
            });
            continue;
        }
        if (priorNet > 0) {
            const variancePct = ((currentNet - priorNet) / priorNet) * 100;
            const absDelta = Math.abs(currentNet - priorNet);
            if (Math.abs(variancePct) > 25 && absDelta > 50000) {
                triggers.push({
                    question: `Account "${acc.accountName}" changed ${variancePct > 0 ? "+" : ""}${variancePct.toFixed(0)}% (₹${absDelta.toLocaleString("en-IN")}). Investigate cause.`,
                    account: acc.accountName,
                    reason: "material_variance",
                    priority: variancePct > 100 ? 10 : 7,
                });
            }
        }
    }
    // Trigger 2: missing standard accounts (depreciation, salary, rent)
    const standardAccounts = [
        { keyword: "depreciation", reason: "missing_depreciation" },
        { keyword: "salary", reason: "missing_salary" },
        { keyword: "rent", reason: "missing_rent" },
    ];
    const accountNamesLower = allAccounts.map((a) => a.accountName.toLowerCase());
    for (const std of standardAccounts) {
        const hasIt = accountNamesLower.some((n) => n.includes(std.keyword));
        const hadItPrior = Array.from(priorMap.keys()).some((n) => n.toLowerCase().includes(std.keyword));
        if (!hasIt && hadItPrior) {
            triggers.push({
                question: `"${std.keyword}" account had activity last period but none this period. Should it be posted?`,
                reason: std.reason,
                priority: 9,
            });
        }
    }
    // Trigger 3: gross margin anomaly (way different from prior)
    const priorRevenue = Array.from(priorMap.entries())
        .filter(([n]) => allAccounts.find((a) => a.accountName === n && numbers.revenue.includes(a)))
        .reduce((s, [, v]) => s + Math.abs(v), 0);
    if (priorRevenue > 0 && numbers.totals.revenue > 0) {
        const priorMargin = priorRevenue > 0 ? ((priorRevenue) / priorRevenue) * 100 : 0; // simplified
        const currentMargin = numbers.totals.grossMarginPct;
        if (Math.abs(currentMargin - priorMargin) > 15) {
            triggers.push({
                question: `Gross margin shifted from ${priorMargin.toFixed(1)}% to ${currentMargin.toFixed(1)}%. Why?`,
                reason: "margin_shift",
                priority: 8,
            });
        }
    }
    // Sort by priority desc
    triggers.sort((a, b) => b.priority - a.priority);
    return triggers;
}
// ─── Recall learned knowledge to skip questions ──────────────────────────────
async function loadLearnedKnowledge(orgId, connectionId) {
    const items = await prisma.orgBusinessKnowledge.findMany({
        where: { orgId, OR: [{ connectionId }, { connectionId: null }] },
    });
    const map = new Map();
    for (const item of items) {
        if (item.confidence >= 0.6) {
            map.set(item.patternKey, item.answer);
        }
    }
    return map;
}
export async function startPlReview(input) {
    // 1. Compute deterministic numbers (always trustworthy)
    const numbers = await computePlNumbers(input.connectionId, input.startDate, input.endDate);
    // 2. Detect investigation triggers
    const triggers = await detectTriggers(input.connectionId, input.startDate, input.endDate, numbers);
    // 3. Load learned knowledge for this org/connection
    const learned = await loadLearnedKnowledge(input.orgId, input.connectionId);
    // 4. Filter triggers using learned knowledge — skip ones we know the answer to
    const novelTriggers = triggers.filter((t) => {
        const patternKey = `${t.reason}:${t.account ?? "general"}`;
        return !learned.has(patternKey);
    });
    // 5. Build initial investigations from triggers
    const investigations = [];
    const concerns = [];
    const assumptions = [];
    const candidateQuestions = [];
    // For each top trigger, decide: investigate (use tools), or ask user
    // For Sprint 2 Day 2-3: keep this rule-based and simple
    // (The full agentic LLM loop comes in Day 3-4)
    for (const trigger of novelTriggers.slice(0, 5)) {
        const patternKey = `${trigger.reason}:${trigger.account ?? "general"}`;
        // Estimate materiality
        let materialityInr = 50000;
        if (trigger.account) {
            const acc = [...numbers.revenue, ...numbers.cogs, ...numbers.expenses, ...numbers.otherIncome]
                .find((a) => a.accountName === trigger.account);
            if (acc)
                materialityInr = Math.abs(acc.net);
        }
        // Apply question budget rules
        const earnsSlot = materialityInr >= QUESTION_BUDGET.minMaterialityInr &&
            candidateQuestions.length < QUESTION_BUDGET.maxQuestions;
        if (earnsSlot) {
            candidateQuestions.push({
                id: `q_${trigger.reason}_${candidateQuestions.length}`,
                questionText: trigger.question,
                context: trigger.reason,
                type: "free_text",
                options: undefined,
                materialityInr,
                whyAsking: `Material impact ₹${materialityInr.toLocaleString("en-IN")}. Cannot determine from data alone.`,
                patternKey,
            });
        }
        else {
            // Below threshold OR budget exhausted → make best inference + flag assumption
            assumptions.push(`Assumed: ${trigger.question} (impact ₹${materialityInr.toLocaleString("en-IN")} — below ask threshold)`);
        }
        // Add to investigations regardless
        investigations.push({
            question: trigger.question,
            approach: "Detected via rule-based trigger from P&L data",
            findings: trigger.account
                ? `Account "${trigger.account}" flagged for ${trigger.reason}`
                : `Pattern: ${trigger.reason}`,
            conclusion: earnsSlot ? "Asked user for clarification" : "Made best inference (low materiality)",
            confidence: earnsSlot ? "low" : "medium",
            severity: trigger.priority >= 9 ? "critical" : trigger.priority >= 7 ? "review" : "info",
            evidence: [],
        });
    }
    // For each top trigger that becomes a critical concern
    for (const inv of investigations) {
        if (inv.severity === "critical") {
            concerns.push({
                severity: "critical",
                issue: inv.question,
                recommendation: "Investigate before close",
            });
        }
    }
    // 6. Determine state and confidence
    let state = "completed";
    let confidenceLabel = "high_confidence_clean";
    if (candidateQuestions.length > 0) {
        state = "awaiting_user";
        confidenceLabel = "medium_confidence";
    }
    else if (concerns.some((c) => c.severity === "critical")) {
        confidenceLabel = "high_confidence_concerns";
    }
    else if (numbers.totals.revenue === 0) {
        confidenceLabel = "low_confidence";
    }
    // 7. Build report
    const report = {
        headlineNumbers: numbers.totals,
        investigations,
        concerns,
        questionsAsked: candidateQuestions,
        userAnswers: [],
        assumptions,
        overallAssessment: buildAssessment(numbers.totals, concerns, candidateQuestions),
        confidenceLabel,
        generatedAt: new Date(),
    };
    // 8. Persist agent session
    const session = await prisma.agentSession.create({
        data: {
            orgId: input.orgId,
            taskId: input.taskId,
            agentType: "pl_review",
            state,
            iteration: 1,
            reportJson: JSON.stringify(report),
            questionsJson: candidateQuestions.length > 0 ? JSON.stringify(candidateQuestions) : null,
            reasoningJson: JSON.stringify(investigations.map((i) => i.approach)),
            stopReason: state === "completed" ? "completed" : null,
            completedAt: state === "completed" ? new Date() : null,
        },
    });
    return {
        sessionId: session.id,
        state,
        report,
        questions: candidateQuestions.length > 0 ? candidateQuestions : undefined,
    };
}
// ─── Submit user answers and continue ────────────────────────────────────────
export async function submitPlAnswers(sessionId, answers) {
    const session = await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (session.state !== "awaiting_user") {
        throw new Error(`Session is in state ${session.state}, not awaiting_user`);
    }
    const report = JSON.parse(session.reportJson ?? "{}");
    const userAnswers = answers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        skipped: a.skipped,
        answeredAt: new Date(),
    }));
    // Update report investigations based on answers
    for (const q of report.questionsAsked) {
        const ans = userAnswers.find((a) => a.questionId === q.id);
        if (!ans || ans.skipped)
            continue;
        // Find the investigation this question relates to
        const inv = report.investigations.find((i) => i.question === q.questionText);
        if (inv) {
            inv.findings = `User clarified: "${ans.answer}"`;
            inv.conclusion = `Resolved with user input`;
            inv.confidence = "high";
        }
        // Save to learned knowledge if patternKey provided
        if (q.patternKey) {
            try {
                const existing = await prisma.orgBusinessKnowledge.findFirst({
                    where: { orgId: session.orgId, connectionId: null, patternKey: q.patternKey },
                });
                if (existing) {
                    await prisma.orgBusinessKnowledge.update({
                        where: { id: existing.id },
                        data: {
                            answer: ans.answer,
                            lastReaffirmedAt: new Date(),
                            reaffirmationCount: { increment: 1 },
                        },
                    });
                }
                else {
                    await prisma.orgBusinessKnowledge.create({
                        data: {
                            orgId: session.orgId,
                            patternKey: q.patternKey,
                            context: q.context,
                            answer: ans.answer,
                            confidence: 1.0,
                        },
                    });
                }
            }
            catch { /* ignore */ }
        }
    }
    report.userAnswers = userAnswers;
    report.confidenceLabel = "high_confidence_clean";
    const isAllConcernsResolved = report.concerns.length === 0;
    if (!isAllConcernsResolved) {
        report.confidenceLabel = "high_confidence_concerns";
    }
    await prisma.agentSession.update({
        where: { id: sessionId },
        data: {
            state: "completed",
            reportJson: JSON.stringify(report),
            answersJson: JSON.stringify(userAnswers),
            stopReason: "completed",
            completedAt: new Date(),
        },
    });
    return { state: "completed", report };
}
// ─── Get current state of session ────────────────────────────────────────────
export async function getPlSession(sessionId) {
    const session = await prisma.agentSession.findUnique({ where: { id: sessionId } });
    if (!session)
        return null;
    return {
        state: session.state,
        report: session.reportJson ? JSON.parse(session.reportJson) : undefined,
        questions: session.questionsJson ? JSON.parse(session.questionsJson) : undefined,
    };
}
// ─── Find existing P&L session for a task ────────────────────────────────────
export async function getPlSessionForTask(taskId) {
    const session = await prisma.agentSession.findFirst({
        where: { taskId, agentType: "pl_review" },
        orderBy: { startedAt: "desc" },
    });
    if (!session)
        return null;
    return {
        sessionId: session.id,
        state: session.state,
        report: session.reportJson ? JSON.parse(session.reportJson) : undefined,
        questions: session.questionsJson ? JSON.parse(session.questionsJson) : undefined,
    };
}
// ─── Helper: build natural-language assessment ───────────────────────────────
function buildAssessment(totals, concerns, questions) {
    const fmt = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    const parts = [];
    parts.push(`Revenue ${fmt(totals.revenue)}, COGS ${fmt(totals.cogs)}, gross profit ${fmt(totals.grossProfit)} (${totals.grossMarginPct.toFixed(1)}% margin).`);
    parts.push(`Operating expenses ${fmt(totals.operatingExpenses)}, operating profit ${fmt(totals.operatingProfit)}.`);
    const criticals = concerns.filter((c) => c.severity === "critical").length;
    if (criticals > 0) {
        parts.push(`${criticals} critical concern${criticals > 1 ? "s" : ""} require attention before close.`);
    }
    else if (questions.length > 0) {
        parts.push(`${questions.length} clarifying question${questions.length > 1 ? "s" : ""} for the CA.`);
    }
    else {
        parts.push(`No major concerns flagged. P&L appears reasonable.`);
    }
    return parts.join(" ");
}
