import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { Sidebar } from "@/components/Sidebar";
import { ClientManagement } from "@/components/ClientManagement";
import { NoteEditor } from "@/components/NoteEditor";

const Index = () => {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState<'clients' | 'notes'>('clients');

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        {activeView === 'clients' ? (
          <ClientManagement />
        ) : (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-6">Note Editor</h1>
            <NoteEditor />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
