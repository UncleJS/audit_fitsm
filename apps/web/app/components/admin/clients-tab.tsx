// @ts-nocheck
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { decodeHtmlEntities } from "../../lib/text-format";

export default function ClientsTab({ createClient, newClientName, setNewClientName, isCreatingClient, clients, selectedClientId, setSelectedClientId }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Create client</p>
            <p className="mt-1 text-sm text-foreground">Add a new organization before assigning audits and roles.</p>
          </div>
          <form onSubmit={createClient} className="grid gap-3">
            <input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="New client name" required />
            <Button type="submit" disabled={isCreatingClient}>{isCreatingClient ? "Creating…" : "Create client"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="p-6 text-sm text-foreground">No clients available yet.</div>
          ) : (
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>ID</th>
                  <th>Selection</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td className="font-medium text-foreground">{decodeHtmlEntities(client.name)}</td>
                    <td className="font-mono text-foreground">#{client.id}</td>
                    <td>
                      <Button size="sm" variant={selectedClientId === client.id ? "primary" : "secondary"} onClick={() => setSelectedClientId(client.id)}>
                        {selectedClientId === client.id ? "Selected" : "Select"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
