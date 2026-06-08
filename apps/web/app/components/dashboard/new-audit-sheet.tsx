// @ts-nocheck
import { FilePlus2 } from "lucide-react";
import DateOnlyInput from "../../components/date-only-input";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";

export default function NewAuditSheet({
  sheet,
  form,
  triggerLabel = "New audit"
}) {
  return (
    <Sheet
      open={sheet.open}
      onOpenChange={sheet.onOpenChange}
      title="Register a new audit"
      description="Create the audit from the current dashboard context, then jump straight into the workspace."
      trigger={<Button><FilePlus2 className="size-4" /> {triggerLabel}</Button>}
    >
      <form onSubmit={form.onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="new-audit-name" className="text-sm font-medium text-foreground">Audit name</label>
          <input id="new-audit-name" value={form.name} onChange={(event) => form.setName(event.target.value)} placeholder="2026 FitSM maturity review" required />
        </div>
        <div className="grid gap-2">
          <label htmlFor="new-audit-goal" className="text-sm font-medium text-foreground">Certification goal</label>
          <select id="new-audit-goal" value={form.certGoalLevel} onChange={(event) => form.setCertGoalLevel(event.target.value)}>
            <option value="1">1 - Initial</option>
            <option value="2">2 - Repeatable / Partial</option>
            <option value="3">3 - Defined / Complete</option>
            <option value="4">4 - Managed / Quantitatively Controlled</option>
            <option value="5">5 - Optimizing</option>
          </select>
        </div>
        <div className="grid gap-2">
          <label htmlFor="new-audit-date" className="text-sm font-medium text-foreground">Audit date</label>
          <DateOnlyInput id="new-audit-date" name="auditDate" value={form.date} onChange={form.setDate} ariaLabel="Audit date" required />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" className="min-w-40">Create and open</Button>
          <Button type="button" variant="secondary" onClick={() => sheet.onOpenChange(false)}>Cancel</Button>
        </div>
      </form>
    </Sheet>
  );
}
