import { useExamples } from "@repo/api-client-react";

export default function App() {
  const { data, isLoading } = useExamples();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Monorepo Template</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {data?.map((item) => (
            <li key={item.id} className="bg-white rounded shadow px-4 py-2 text-gray-700">
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
