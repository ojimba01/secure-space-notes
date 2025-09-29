import { Sidebar } from "@/components/Sidebar";
import { NoteEditor } from "@/components/NoteEditor";

const Index = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <NoteEditor />
      </main>
    </div>
  );
};

export default Index;
