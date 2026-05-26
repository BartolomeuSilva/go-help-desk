import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCannedResponses,
  createCannedResponse,
  updateCannedResponse,
  deleteCannedResponse,
} from '@/api/canned'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon, PencilIcon, Trash2Icon, FileTextIcon } from 'lucide-react'
import type { CannedResponse } from '@/api/types'

export function CannedResponsesPage() {
  const qc = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [formError, setFormError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CannedResponse | null>(null)

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ['admin', 'canned-responses'],
    queryFn: listCannedResponses,
  })

  const createMutation = useMutation({
    mutationFn: () => createCannedResponse({ name: name.trim(), content: content.trim() }),
    onSuccess: () => {
      resetForm()
      qc.invalidateQueries({ queryKey: ['admin', 'canned-responses'] })
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      updateCannedResponse(id, { name: name.trim(), content: content.trim() }),
    onSuccess: () => {
      resetForm()
      qc.invalidateQueries({ queryKey: ['admin', 'canned-responses'] })
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCannedResponse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'canned-responses'] })
      setPendingDelete(null)
    },
  })

  const handleEditClick = (res: CannedResponse) => {
    setIsEditing(true)
    setEditId(res.id)
    setName(res.name)
    setContent(res.content)
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNewClick = () => {
    setIsEditing(true)
    setEditId(null)
    setName('')
    setContent('')
    setFormError('')
  }

  const resetForm = () => {
    setIsEditing(false)
    setEditId(null)
    setName('')
    setContent('')
    setFormError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !content.trim()) {
      setFormError('Name and content are required')
      return
    }
    if (editId) {
      updateMutation.mutate(editId)
    } else {
      createMutation.mutate()
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Canned Responses</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create canned responses (templates) to quickly insert standardized text when replying to tickets.
            </p>
          </div>
          {!isEditing && (
            <Button onClick={handleNewClick} className="ml-6 shrink-0">
              <PlusIcon className="mr-2 h-4 w-4" />
              New Response
            </Button>
          )}
        </div>

        {/* Create/Edit Form */}
        {isEditing && (
          <Card className="border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm">
            <CardHeader className="bg-gray-50/50 dark:bg-[#121212]/50 border-b border-gray-200 dark:border-[#2a2a2a] py-4">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white">
                {editId ? 'Edit Canned Response' : 'New Canned Response'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="canned-name">Title / Name</Label>
                  <Input
                    id="canned-name"
                    placeholder="e.g. Password Reset Instructions"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setFormError('')
                    }}
                    autoFocus
                  />
                  <p className="text-xs text-gray-400">
                    A unique short name to identify this template in the dropdown list.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="canned-content">Response Text</Label>
                  <Textarea
                    id="canned-content"
                    placeholder="Write the canned response content here..."
                    rows={6}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value)
                      setFormError('')
                    }}
                  />
                </div>
                {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={
                      !name.trim() ||
                      !content.trim() ||
                      createMutation.isPending ||
                      updateMutation.isPending
                    }
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* List Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#121212] text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-[#2a2a2a]">
                <tr>
                  <th className="px-6 py-3.5 text-left font-semibold">Name</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Preview Content</th>
                  <th className="w-40 px-6 py-3.5 text-left font-semibold">Created At</th>
                  <th className="w-28 px-6 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                {responses.map((res) => (
                  <tr key={res.id} className="group hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                        <FileTextIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        {res.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-500 dark:text-gray-400 max-w-md truncate line-clamp-1">
                        {res.content}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(res.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                          onClick={() => handleEditClick(res)}
                          title="Edit Response"
                        >
                          <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300"
                          onClick={() => setPendingDelete(res)}
                          title="Delete Response"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {responses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileTextIcon className="h-8 w-8 text-gray-300" />
                        <p>No canned responses created yet.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={`Delete canned response "${pendingDelete?.name ?? ''}"?`}
        description="Are you sure you want to permanently delete this template? This action cannot be undone."
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
      />
    </Layout>
  )
}
