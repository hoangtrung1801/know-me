import { FileText, Plus, Menu } from "lucide-react";
import { Button } from "../../components/ui/button";

interface DocsEmptyStateProps {
  currentFolder: string | null;
  onCreateDoc: () => void;
  onOpenMobileSidebar: () => void;
}

export function DocsEmptyState({ currentFolder, onCreateDoc, onOpenMobileSidebar }: DocsEmptyStateProps) {
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-6 sm:p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] bg-muted/50 text-muted-foreground">
          <FileText className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Browse your docs</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Pick a document from the left sidebar or create a new one in
          {" "}<span className="font-medium text-foreground">{currentFolder || "root"}</span>.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={onCreateDoc}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Doc
          </Button>
          <Button variant="outline" onClick={onOpenMobileSidebar} className="lg:hidden">
            <Menu className="w-4 h-4 mr-1.5" />
            Browse
          </Button>
        </div>
      </div>
    </div>
  );
}
