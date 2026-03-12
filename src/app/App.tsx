import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";

type StatePayload = {
  success?: boolean;
  state?: {
    date?: string;
    totalCalories?: number;
    goals?: { calories?: number };
    meals?: Array<{ id: string; name: string; calories: number }>;
  };
  error?: string;
};

const TOKEN_STORAGE_KEY = "calgpt_auth_token";

function App() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<StatePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
    setToken(existing);
    void refresh(existing);
  }, []);

  async function refresh(activeToken = token) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/state", {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
      });
      const payload = (await response.json()) as StatePayload;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error ?? "Failed to fetch state");
      }
      setState(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function saveToken() {
    const trimmed = token.trim();
    if (trimmed) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    void refresh(trimmed);
  }

  const meals = state?.state?.meals ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card className="border-slate-800 bg-slate-900/80 p-5">
          <h1 className="text-2xl font-semibold">CalGPT V2 Widget-First Dev Harness</h1>
          <p className="text-sm text-slate-400 mt-2">
            ChatGPT uses the vanilla widget at <code>/public/component.html</code>. This React page is only for lightweight local checks.
          </p>
        </Card>

        <Card className="border-slate-800 bg-slate-900/80 p-5 space-y-3">
          <h2 className="text-lg font-medium">Optional auth token</h2>
          <p className="text-sm text-slate-400">
            Paste a Supabase access token for authenticated user-scoped reads. Leave blank for demo fallback.
          </p>
          <div className="flex gap-2">
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Supabase access token"
            />
            <Button onClick={saveToken}>Save</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh state"}
            </Button>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </Card>

        <Card className="border-slate-800 bg-slate-900/80 p-5">
          <h2 className="text-lg font-medium mb-3">State snapshot</h2>
          <div className="text-sm text-slate-300 space-y-1">
            <p>Date: {state?.state?.date ?? "-"}</p>
            <p>
              Calories: {Math.round(state?.state?.totalCalories ?? 0)} / {Math.round(state?.state?.goals?.calories ?? 0)}
            </p>
            <p>Meals: {meals.length}</p>
          </div>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 max-h-56 overflow-auto text-xs text-slate-300">
            <pre>{JSON.stringify(state, null, 2)}</pre>
          </div>
        </Card>

        <Card className="border-slate-800 bg-slate-900/80 p-3">
          <h2 className="text-lg font-medium mb-2 px-2">Widget preview</h2>
          <iframe
            title="CalGPT V2 widget preview"
            src="/component.html"
            className="w-full h-[620px] rounded-xl border border-slate-800 bg-black"
          />
        </Card>
      </div>
    </div>
  );
}

export default App;
