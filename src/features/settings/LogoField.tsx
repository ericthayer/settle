import { useId, useRef, type ChangeEvent, type ReactNode } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LOGO_TYPES, removeLogo, useLogoUrl, useUploadLogo, validateLogo } from '@/data/logo'
import { useSaveBusinessSettings, type BusinessSettings } from '@/data/settings'

interface LogoFieldProps {
  readonly ownerId: string
  /** Null on first run: the logo needs a settings row to hang off. */
  readonly settings: BusinessSettings | null
}

/** Uploads and saves immediately, independent of the main form's Save. */
export function LogoField({ ownerId, settings }: LogoFieldProps): ReactNode {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const path = settings?.logo_path ?? null
  const logoUrl = useLogoUrl(path)
  const upload = useUploadLogo()
  const save = useSaveBusinessSettings()
  const busy = upload.isPending || save.isPending
  const disabled = settings === null || busy

  async function onFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !settings) return
    const problem = validateLogo(file)
    if (problem) {
      toast.error(problem)
      return
    }
    try {
      const newPath = await upload.mutateAsync({ file, ownerId })
      try {
        await save.mutateAsync({ business_name: settings.business_name, logo_path: newPath })
      } catch (error) {
        await removeLogo(newPath).catch(() => undefined)
        throw error
      }
      // Old file goes only after the row points at the new one; a failed cleanup just leaves an orphan.
      if (path) await removeLogo(path).catch(() => undefined)
      toast.success('Logo updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  async function onRemove(): Promise<void> {
    if (!settings || !path) return
    try {
      await save.mutateAsync({ business_name: settings.business_name, logo_path: null })
      await removeLogo(path).catch(() => undefined)
      toast.success('Logo removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t remove the logo')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={id}>Logo</Label>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-40 place-items-center rounded-md border border-dashed border-line bg-paper p-2">
          {path && logoUrl.data ? (
            <img src={logoUrl.data} alt="Current logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-ink-muted">{path ? 'Loading…' : 'No logo'}</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="sr-only"
            disabled={disabled}
            aria-describedby={`${id}-hint`}
            onChange={(e) => void onFile(e)}
          />
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
            <ImageUp aria-hidden="true" />
            {busy ? 'Uploading…' : path ? 'Replace' : 'Upload'}
          </Button>
          {path ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void onRemove()}>
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p id={`${id}-hint`} className="text-xs text-ink-muted">
        {settings === null
          ? 'Save your business details first, then add a logo.'
          : 'PNG, JPEG or WebP, up to 1 MB. Shown top-left on invoices.'}
      </p>
    </div>
  )
}
