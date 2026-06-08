// @ts-nocheck
import { UserPlus } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { decodeHtmlEntities } from "../../lib/text-format";

export default function UsersTab({
  clientControls,
  createUserForm,
  userTable
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_1fr]">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Selected client</p>
              <p className="mt-1 text-sm text-foreground">Choose the client whose users and roles you want to manage.</p>
            </div>
            <select value={clientControls.selectedClientId ?? ""} onChange={(event) => clientControls.setSelectedClientId(Number(event.target.value))}>
              {clientControls.clients.map((client) => (
                <option key={client.id} value={client.id}>{decodeHtmlEntities(client.name)}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" active={clientControls.rbacDensity === "comfortable"} onClick={() => clientControls.updateRbacDensity("comfortable")}>Comfortable</Button>
              <Button size="sm" variant="secondary" active={clientControls.rbacDensity === "compact"} onClick={() => clientControls.updateRbacDensity("compact")}>Compact</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-sky-200"><UserPlus className="size-4" /></span>
              <div>
                <p className="text-sm font-semibold text-foreground">Create user in client</p>
                <p className="mt-1 text-sm text-foreground">Archive-only behavior is preserved: clearing all roles archives the user in that client.</p>
              </div>
            </div>

            <form onSubmit={createUserForm.onSubmit} className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <input type="email" placeholder="User email" value={createUserForm.email} onChange={(event) => createUserForm.setEmail(event.target.value)} required />
                <input placeholder="Display name" value={createUserForm.displayName} onChange={(event) => createUserForm.setDisplayName(event.target.value)} minLength={2} required />
                <input type="password" placeholder="Temporary password" value={createUserForm.password} onChange={(event) => createUserForm.setPassword(event.target.value)} minLength={8} required />
              </div>
              <div className={`grid gap-2 ${clientControls.roleGridCols} sm:grid-cols-3 xl:grid-cols-4`}>
                {createUserForm.rolesCatalog.map((role) => (
                  <label key={`new-role-${role.code}`} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2 text-sm text-foreground">
                    <input type="checkbox" className="size-4 w-4 accent-sky-400" checked={createUserForm.selectedRoles.includes(role.code)} onChange={() => createUserForm.setSelectedRoles((prev) => createUserForm.toggleRoleSelection(prev, role.code))} />
                    <span>{decodeHtmlEntities(role.code)}</span>
                  </label>
                ))}
              </div>
              <div>
                <Button type="submit" disabled={createUserForm.isCreating || !clientControls.selectedClientId}>{createUserForm.isCreating ? "Creating…" : "Create user"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {userTable.orgUsers.length > 0 ? <p className="text-xs uppercase tracking-[0.16em] text-foreground lg:hidden">Swipe horizontally to review role assignments and actions</p> : null}
        <Card>
          <CardContent className="p-0">
            {userTable.orgUsers.length === 0 ? (
              <div className="p-6 text-sm text-foreground">No users found for this client, or you do not have org admin access.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[1100px]">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>User active</th>
                      <th>Org access</th>
                      <th>Roles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTable.orgUsers.map((user) => {
                      const key = String(user.id);
                      const editRoles = userTable.roleEditsByUserId[key] ?? user.roles;
                      const saving = !!userTable.savingRolesByUserId[key];
                      return (
                        <tr key={`org-user-${user.id}`}>
                          <td><div className="font-medium text-foreground">{decodeHtmlEntities(user.display_name)}</div></td>
                          <td className="text-foreground">{decodeHtmlEntities(user.email)}</td>
                          <td>{user.is_active ? "Yes" : "No"}</td>
                          <td><Badge variant={user.has_active_org_roles ? "success" : "warning"}>{user.has_active_org_roles ? "Active" : "Archived"}</Badge></td>
                          <td>
                            <div className={`grid gap-2 ${clientControls.roleGridCols} xl:grid-cols-4`}>
                              {createUserForm.rolesCatalog.map((role) => (
                                <label key={`user-${user.id}-${role.code}`} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2 text-xs text-foreground">
                                  <input
                                    type="checkbox"
                                    className="size-4 w-4 accent-sky-400"
                                    checked={editRoles.includes(role.code)}
                                    onChange={() => userTable.setRoleEditsByUserId((prev) => ({ ...prev, [key]: createUserForm.toggleRoleSelection(prev[key] ?? user.roles, role.code) }))}
                                  />
                                  <span>{decodeHtmlEntities(role.code)}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-col gap-2">
                              <Button size="sm" variant="secondary" onClick={() => userTable.saveUserRoles(user.id)} disabled={saving || userTable.tokenMissing}>{saving ? "Saving…" : "Save roles"}</Button>
                              <Button size="sm" variant="danger" onClick={() => userTable.archiveUserInClient(user.id)} disabled={saving || userTable.tokenMissing || !user.has_active_org_roles}>Archive in client</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
