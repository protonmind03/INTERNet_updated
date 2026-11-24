import { useEffect, useState } from "react";
import { Button, Card, ConfirmDialog, FormError, FormField } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { readSystemNotice, rememberSystemNotice } from "../../lib/systemNotice";
import { errorText, toast } from "../../lib/toast";
import { adminRequest } from "./request";

/*
| The maintenance notice (Phase 1.7): one line shown at the top of every
| portal, signed in or not, until it is taken down. Each change shows the
| notice as it is and as it will be before it is saved.
*/

const MAX = 300;

export default function AdminNotice() {
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"publish" | "remove" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    readSystemNotice()
      .then((notice) => {
        if (!live) return;
        setCurrent(notice?.message ?? null);
        setText(notice?.message ?? "");
      })
      .catch(() => live && setCurrent(null));
    return () => {
      live = false;
    };
  }, []);

  const next = text.trim().replace(/\s+/g, " ");
  const ask = () => {
    if (next.length < 3) {
      setError("Write at least a few words, or take the notice down.");
      return;
    }
    setError("");
    setConfirm("publish");
  };

  const save = async (message: string | null) => {
    setSaving(true);
    try {
      const data = await adminRequest<{ message: string; notice: { message: string | null; updated_at: string } }>("/api/admin/notice", {
        method: "PUT",
        body: { message },
      });
      setCurrent(data.notice.message);
      setText(data.notice.message ?? "");
      rememberSystemNotice(data.notice.message ? { message: data.notice.message, updated_at: data.notice.updated_at } : null);
      toast.success(data.message);
      setConfirm(null);
    } catch (saveError) {
      setError(errorText(saveError, "The notice could not be saved."));
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Notice">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-slate-700">
          {current === undefined ? "Reading the notice…" : current ? "This notice shows at the top of every portal now." : "No notice is showing."}
        </p>
        <Card>
          <form
            className="space-y-4 p-4 sm:p-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <FormField label="Maintenance notice" htmlFor="notice-text" hint={`For example: INTERNet is down for upkeep on Saturday, 8 to 10 PM. Up to ${MAX} characters.`}>
              <textarea id="notice-text" className="field min-h-24" maxLength={MAX} value={text} onChange={(event) => setText(event.target.value)} />
            </FormField>
            <FormError message={error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={next === (current ?? "")}>
                Show the notice
              </Button>
              {current && (
                <Button type="button" variant="secondary" onClick={() => setConfirm("remove")}>
                  Take the notice down
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm === "publish"}
        title="Show the notice?"
        message="Every portal shows it at the top, to everyone, until you take it down."
        confirmLabel="Show the notice"
        busy={saving}
        onConfirm={() => void save(next)}
        onCancel={() => setConfirm(null)}
      >
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Now</dt>
            <dd className="text-slate-600">{current || "No notice"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">After</dt>
            <dd className="text-slate-900">{next}</dd>
          </div>
        </dl>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "remove"}
        title="Take the notice down?"
        message={current ? `"${current}" stops showing in every portal.` : undefined}
        confirmLabel="Take the notice down"
        tone="danger"
        busy={saving}
        onConfirm={() => void save(null)}
        onCancel={() => setConfirm(null)}
      />
    </AdminLayout>
  );
}
