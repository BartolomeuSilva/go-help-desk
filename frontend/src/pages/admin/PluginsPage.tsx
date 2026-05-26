import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlugins, installPlugin, updatePlugin, uninstallPlugin } from '@/api/admin'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PuzzleIcon, UploadCloudIcon, Trash2Icon } from 'lucide-react'
import type { Plugin } from '@/api/types'
import { cn } from '@/lib/utils'

export function PluginsPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [pendingUninstall, setPendingUninstall] = useState<Plugin | null>(null)

  const { data: plugins = [], isLoading } = useQuery({
    queryKey: ['admin', 'plugins'],
    queryFn: listPlugins,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updatePlugin(id, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plugins'] })
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => uninstallPlugin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plugins'] })
      setPendingUninstall(null)
    },
  })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError('')
    try {
      await installPlugin(file)
      qc.invalidateQueries({ queryKey: ['admin', 'plugins'] })
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadError(extractError(err))
    } finally {
      setIsUploading(false)
    }
  }

  const triggerUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plugins</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Extend the functionality of Go Help Desk. Native plugins are built-in, while custom WASM plugins can be uploaded as ZIP packages containing <code>manifest.json</code> and <code>plugin.wasm</code>.
            </p>
          </div>
        </div>

        {/* Upload box */}
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-[#3a3a3a] bg-white dark:bg-[#1a1a1a] p-6 text-center">
          <UploadCloudIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <div className="mt-4 flex justify-center text-sm leading-6 text-gray-600 dark:text-gray-300">
            <button
              type="button"
              onClick={triggerUpload}
              disabled={isUploading}
              className="relative cursor-pointer rounded-md font-semibold text-blue-600 dark:text-[#faff69] focus-within:outline-none hover:text-blue-500 dark:hover:text-[#e6eb52]"
            >
              <span>{isUploading ? 'Uploading & compiling...' : 'Upload a plugin package'}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".zip"
              className="sr-only"
            />
          </div>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">ZIP file up to 25MB containing manifest.json and plugin.wasm</p>
          {uploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
        </div>

        {/* List of plugins */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#121212] text-xs text-gray-500 dark:text-gray-400 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Plugin info</th>
                  <th className="px-4 py-3 text-left">Runtime</th>
                  <th className="px-4 py-3 text-left">Hooks</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                {plugins.map((p) => (
                  <tr key={p.manifest.id} className={cn(!p.enabled && 'opacity-60', 'hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 transition-colors')}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <PuzzleIcon className="mt-1 h-5 w-5 text-gray-400 dark:text-gray-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            {p.manifest.name}
                            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">v{p.manifest.version}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{p.manifest.id}</div>
                          {p.manifest.description && (
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{p.manifest.description}</p>
                          )}
                          {p.manifest.author && (
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">By {p.manifest.author}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.manifest.runtime === 'native' ? 'secondary' : 'outline'}>
                        {p.manifest.runtime}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {p.manifest.hooks.map((h) => (
                          <Badge key={h} variant="outline" className="text-[10px] font-mono px-1 py-0 bg-gray-50 dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 border-gray-200 dark:border-[#2a2a2a]">
                            {h}
                          </Badge>
                        ))}
                        {p.manifest.hooks.length === 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.enabled ? 'default' : 'secondary'}>
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleMutation.mutate({ id: p.manifest.id, enabled: !p.enabled })}
                          disabled={toggleMutation.isPending}
                        >
                          {p.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        {p.manifest.runtime === 'wasm' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-950/50 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300"
                            onClick={() => setPendingUninstall(p)}
                            disabled={uninstallMutation.isPending}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {plugins.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No plugins loaded or installed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingUninstall !== null}
        onOpenChange={(open) => { if (!open) setPendingUninstall(null) }}
        title={`Uninstall plugin "${pendingUninstall?.manifest.name ?? ''}"?`}
        description="This will permanently delete the plugin binary and configurations from the database and disk."
        confirmLabel="Uninstall"
        isPending={uninstallMutation.isPending}
        onConfirm={() => { if (pendingUninstall) uninstallMutation.mutate(pendingUninstall.manifest.id) }}
      />
    </Layout>
  )
}
