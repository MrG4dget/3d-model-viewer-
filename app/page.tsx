import ThreeViewer from "@/components/ThreeViewer";

export default function Home() {
  return (
    <div className="min-h-screen font-sans bg-zinc-950 text-white flex flex-col">
      <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
        <h1 className="text-xl font-medium tracking-tight">3D Model Review</h1>
        <div className="text-sm font-mono text-zinc-400">Viewer v0.1</div>
      </header>
      <main className="flex-1 relative">
        <ThreeViewer />
      </main>
    </div>
  );
}
