import { useCallback, useEffect, useState } from "react";
import SignaturePad from "../../components/SignaturePad";
import type { SignatureOutput } from "../../lib/signature";
import { Button, Card, ConfirmDialog } from "../../components/ui";
import { SignatureMark } from "../../components/DtrHeader";
import type { SignatureImage } from "../../lib/timeRecordHeader";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatLongDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";

/*
| Iteration 20: the trainee's signature, from Profile. Drawn once (or an
| image uploaded); printed on their Time Record above "Signature over
| printed name of the trainee". It is an image of their handwriting.
*/

type Saved = SignatureImage & { created_at: string };

export default function SignatureCard() {
  const [signature, setSignature] = useState<Saved | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/student/signature`, withStudentAuth());
      const data = await response.json().catch(() => ({}));
      if (response.ok) setSignature(data.signature ?? null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async (output: SignatureOutput) => {
    setSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/api/student/signature`,
        withStudentAuth({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(output) })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your signature could not be saved.");
      setSignature(data.signature);
      setDrawing(false);
      toast.success("Signature saved. It prints on your Time Record.");
    } catch (error) {
      toast.error(errorText(error, "Your signature could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const response = await fetch(`${API_URL}/api/student/signature`, withStudentAuth({ method: "DELETE" }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Your signature could not be removed.");
      setSignature(null);
      setConfirmRemove(false);
      toast.success("Signature removed.");
    } catch (error) {
      toast.error(errorText(error, "Your signature could not be removed."));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <section aria-labelledby="signature-heading" className="p-4 sm:p-5">
        <h2 id="signature-heading" className="text-sm font-semibold text-slate-900">
          Signature
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {signature ? `Saved ${formatLongDate(signature.created_at)}. It prints on your Time Record.` : loaded ? "Not set." : "Loading…"}
        </p>
        {signature && !drawing && (
          <div className="mt-3 max-w-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-900">
            <SignatureMark image={signature} />
          </div>
        )}
        {drawing ? (
          <div className="mt-3">
            <SignaturePad onSave={save} saving={saving} onCancel={() => setDrawing(false)} />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon="edit" onClick={() => setDrawing(true)} disabled={!loaded}>
              {signature ? "Sign again" : "Add signature"}
            </Button>
            {signature && (
              <Button variant="secondary" icon="trash" onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            )}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove your signature?"
        message="Your Time Record will print without it. Months your supervisor already certified keep the signature they were certified with."
        confirmLabel="Remove"
        busy={removing}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
