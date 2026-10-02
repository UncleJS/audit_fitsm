import { Layers3, Save, Target } from "lucide-react";
import { Button } from "../ui/button";

export function SaveControls({
  compact = false,
  canManageScopeTargets,
  canEdit,
  canLeadEdit,
  onSaveScope,
  onSaveAssessments,
  onSaveDetails,
  onSaveConclusion,
  onSaveAll,
}: {
  compact?: boolean;
  canManageScopeTargets: boolean;
  canEdit: boolean;
  canLeadEdit: boolean;
  onSaveScope: () => void;
  onSaveAssessments: () => void;
  onSaveDetails: () => void;
  onSaveConclusion: () => void;
  onSaveAll: () => void;
}) {
  const size = compact ? "sm" : "md";
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} variant="secondary" onClick={onSaveScope} disabled={!canManageScopeTargets}>
        <Target className="size-4" /> {compact ? "Save scope" : "Save scope & targets"}
      </Button>
      <Button size={size} variant="secondary" onClick={onSaveAssessments} disabled={!canEdit}>
        <Layers3 className="size-4" /> Save assessments
      </Button>
      <Button size={size} variant="secondary" onClick={onSaveDetails} disabled={!canEdit}>
        <Save className="size-4" /> Save details
      </Button>
      <Button size={size} variant="secondary" onClick={onSaveConclusion} disabled={!canLeadEdit}>
        <Save className="size-4" /> Save conclusion
      </Button>
      <Button size={size} onClick={onSaveAll} disabled={!canLeadEdit}>
        <Save className="size-4" /> Save all
      </Button>
    </div>
  );
}
