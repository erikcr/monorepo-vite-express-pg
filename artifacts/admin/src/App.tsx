import { useExamples } from "@repo/api-client-react";

export default function App() {
  const { data, isLoading, error } = useExamples();

  return (
    <main className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-slate-400 mb-6">Internal use only</p>

      <section>
        <h2 className="text-lg font-semibold mb-3">Example Records</h2>
        {isLoading && <p className="text-slate-400">Loading…</p>}
        {error && <p className="text-red-400">Error: {String(error)}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 pr-4">ID</th>
              <th className="pb-2 pr-4">Org</th>
              <th className="pb-2">Name</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.id} className="border-b border-slate-800">
                <td className="py-2 pr-4 font-mono text-slate-400">{item.id}</td>
                <td className="py-2 pr-4">{item.orgId}</td>
                <td className="py-2">{item.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
