"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  connectionId: string;
  displayName:  string;
  /** Only ADMINs see the delete affordance. */
  canDelete:    boolean;
}

export function ConnectionCardActions({ connectionId, displayName, canDelete }: Props): JSX.Element {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/internal/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex gap-2 pt-1">
        <Button asChild variant="outline" size="sm" className="flex-1 text-xs">
          <Link href={`/connections/${connectionId}`}>View</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="flex-1 text-xs">
          <Link href={`/connections/${connectionId}/schema`}>Schema</Link>
        </Button>
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Delete ${displayName}`}
            onClick={() => setConfirming(true)}
            className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200 px-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={(open) => { if (!deleting) setConfirming(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete connection?</DialogTitle>
            <DialogDescription className="pt-2">
              This will permanently delete the connection{" "}
              <span className="font-medium text-slate-800">&ldquo;{displayName}&rdquo;</span>{" "}
              and drop its uploaded data table. Close periods, knowledge entries,
              and query history associated with this connection will also be removed.
              <span className="block mt-2 font-medium text-slate-700">This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5" /> Delete connection</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
