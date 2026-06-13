"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  connectionId:   string;
  displayName:    string;
}

export function DeleteConnectionDialog({ connectionId, displayName }: Props): JSX.Element {
  const router = useRouter();
  const [open,       setOpen]       = useState(false);
  const [typed,      setTyped]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const confirmed = typed.trim() === displayName.trim();

  async function handleDelete(): Promise<void> {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/internal/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
      router.push("/connections");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setOpen(true); setTyped(""); setError(null); }}
        className="gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300"
      >
        <Trash2 className="h-4 w-4" />
        Delete connection
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Delete connection
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-1">
              This will permanently delete <strong>{displayName}</strong> and all its uploaded data.
              GL tables, scan history, and pinned queries will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label htmlFor="confirm-name" className="text-sm text-slate-700 mb-1.5 block">
              Type <span className="font-semibold text-slate-900">{displayName}</span> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={displayName}
              className="text-sm"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 -mt-1">{error}</p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={!confirmed || loading}
              className="gap-2"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
