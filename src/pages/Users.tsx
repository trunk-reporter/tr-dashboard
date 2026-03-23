import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/useAuthStore'
import { getUsers, createUser, updateUser, deleteUser, type UserResponse } from '@/api/client'
import { Trash2 } from 'lucide-react'

export default function Users() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<UserResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create form
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const fetchUsers = async () => {
    try {
      const result = await getUsers()
      setUsers(result.users)
      setError('')
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers()
    } else {
      setLoading(false)
    }
  }, [currentUser?.role])

  if (currentUser?.role !== 'admin') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    )
  }

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword) return
    setCreating(true)
    setCreateError('')
    try {
      await createUser({ username: newUsername.trim(), password: newPassword, role: newRole })
      setNewUsername('')
      setNewPassword('')
      setNewRole('viewer')
      fetchUsers()
    } catch (err: any) {
      setCreateError(err?.data?.error || err?.message || 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (id: number) => {
    const data: { role?: string; password?: string; enabled?: boolean } = {}
    const original = users.find((u) => u.id === id)
    if (!original) return

    if (editRole !== original.role) data.role = editRole
    if (editPassword) data.password = editPassword
    if (editEnabled !== original.enabled) data.enabled = editEnabled

    if (Object.keys(data).length === 0) {
      setEditingId(null)
      return
    }

    try {
      await updateUser(id, data)
      setEditingId(null)
      setEditPassword('')
      fetchUsers()
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to update user')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id)
      setDeletingId(null)
      fetchUsers()
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to delete user')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground">Manage user accounts and roles</p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create user */}
      <Card>
        <CardHeader>
          <CardTitle>Create User</CardTitle>
          <CardDescription>Add a new user account</CardDescription>
        </CardHeader>
        <CardContent>
          {createError && (
            <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {createError}
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Username</label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                disabled={creating}
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password"
                disabled={creating}
              />
            </div>
            <div className="space-y-1 w-32">
              <label className="text-sm font-medium">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                disabled={creating}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || !newUsername.trim() || !newPassword}
            >
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User list */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground">No users found.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  {editingId === u.id ? (
                    // Edit mode
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-medium w-32">{u.username}</span>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="h-8 w-24 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <Input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="New password (leave empty to keep)"
                        className="w-48 h-8"
                      />
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={editEnabled}
                          onChange={(e) => setEditEnabled(e.target.checked)}
                        />
                        Enabled
                      </label>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleUpdate(u.id)}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(null)
                            setEditRole('')
                            setEditPassword('')
                            setEditEnabled(true)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{u.username}</span>
                        <Badge
                          variant={u.role === 'admin' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {u.role}
                        </Badge>
                        {!u.enabled && (
                          <Badge variant="destructive" className="text-xs">
                            Disabled
                          </Badge>
                        )}
                        {u.id === currentUser?.id && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(u.id)
                            setEditRole(u.role)
                            setEditEnabled(u.enabled)
                            setEditPassword('')
                          }}
                        >
                          Edit
                        </Button>
                        {deletingId === u.id ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(u.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDeletingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingId(u.id)}
                            disabled={u.id === currentUser?.id}
                            title={u.id === currentUser?.id ? 'Cannot delete your own account' : 'Delete user'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
