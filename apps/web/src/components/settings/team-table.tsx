"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";

type Member = { id: string; name: string | null; email: string; role: string };

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700",
  MEMBER: "bg-blue-100 text-blue-700",
  VIEWER: "bg-slate-100 text-slate-700",
};

export default function TeamTable({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [rows, setRows] = useState(members);
  const [updating, setUpdating] = useState<string | null>(null);

  async function handleRoleChange(userId: string, role: string) {
    setUpdating(userId);
    const res = await fetch("/api/internal/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      setRows((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
    }
    setUpdating(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} member{rows.length !== 1 ? "s" : ""}</p>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 gap-2">
              <UserPlus className="h-4 w-4" />
              Invite member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                Email invitations will be available once email is configured in Sprint 9.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="colleague@company.com" disabled />
              <Button className="w-full" disabled>Send invite (coming soon)</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.name ?? "—"}
                  {member.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <Badge className={`${ROLE_COLORS[member.role] ?? ""} border-0`}>
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {member.id !== currentUserId && (
                    <select
                      value={member.role}
                      disabled={updating === member.id}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-white text-slate-700 cursor-pointer"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
