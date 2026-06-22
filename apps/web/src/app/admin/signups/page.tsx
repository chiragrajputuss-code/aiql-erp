"use client";

import { useEffect, useState } from "react";
import { Users, Activity, TrendingUp, Database } from "lucide-react";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  trialEndsAt: string | null;
  queriesUsed: number;
  lifetimeQueriesUsed: number;
  closeRunsUsed: number;
  subscriptionStatus: string | null;
  signupIp: string | null;
  users: { email: string; name: string }[];
};

type Data = {
  orgs: Org[];
  totalQueries: number;
  recentLogs: { question: string; status: string; createdAt: string; orgId: string }[];
};

export default function AdminSignupsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/signups")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load"));
  }, []);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-slate-500">Loading…</div>;

  const paidOrgs = data.orgs.filter((o) => o.subscriptionStatus === "active");
  const trialOrgs = data.orgs.filter((o) => !o.subscriptionStatus || o.subscriptionStatus === "");

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Admin — Signup Activity</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Users, label: "Total signups", value: data.orgs.length, color: "blue" },
          { icon: TrendingUp, label: "Paid orgs", value: paidOrgs.length, color: "green" },
          { icon: Activity, label: "Trial orgs", value: trialOrgs.length, color: "amber" },
          { icon: Database, label: "Total queries", value: data.totalQueries, color: "purple" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className={`w-9 h-9 rounded-lg bg-${color}-50 flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 text-${color}-600`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Orgs table */}
      <div className="bg-white rounded-xl border border-slate-200 mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Signed-up organisations ({data.orgs.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["Name / Email", "Plan", "Signed up", "Trial ends", "Queries (total)", "Closes used", "IP"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((org) => {
                const user = org.users[0];
                const trialExpired = org.trialEndsAt && new Date(org.trialEndsAt) < new Date();
                return (
                  <tr key={org.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{org.name}</p>
                      {user && <p className="text-slate-400 text-xs">{user.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        org.subscriptionStatus === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {org.plan}{org.subscriptionStatus === "active" ? " ✓" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(org.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      {org.trialEndsAt ? (
                        <span className={`text-xs ${trialExpired ? "text-red-600 font-medium" : "text-slate-500"}`}>
                          {new Date(org.trialEndsAt).toLocaleDateString("en-IN")}
                          {trialExpired ? " (expired)" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {org.lifetimeQueriesUsed}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{org.closeRunsUsed}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{org.signupIp ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent queries */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Recent queries (last 20)</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {data.recentLogs.map((log, i) => (
            <div key={i} className="px-6 py-3 flex items-center justify-between">
              <p className="text-sm text-slate-700 truncate max-w-[60%]">{log.question}</p>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  log.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                }`}>
                  {log.status}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(log.createdAt).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
