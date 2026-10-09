import { useCallback, useEffect, useRef, useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useSaveDraft } from '@/data/invoices'
import { formToDraft, invoiceSchema, type InvoiceFormValues } from './invoice-form'

export type SaveState = 'saved' | 'pending' | 'saving' | 'invalid' | 'error'

const DELAY_MS = 800

/**
 * Debounced autosave of a draft. Saves only when the form is valid and the payload
 * actually changed; saves never overlap. `flush` saves now and reports success.
 */
export function useDraftAutosave(invoiceId: string, form: UseFormReturn<InvoiceFormValues>): { state: SaveState; error: string | null; flush: () => Promise<boolean> } {
  const save = useSaveDraft()
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState<string | null>(null)
  const values = useWatch({ control: form.control })
  const lastSaved = useRef<string>(JSON.stringify(formToDraft(form.getValues())))
  // Raw form snapshot: catches edits that don't change the payload yet (e.g. a half-typed row).
  const lastSeen = useRef<string>(JSON.stringify(form.getValues()))
  const timer = useRef<number | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const { mutateAsync } = save

  const run = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current
    const current = form.getValues()
    if (!invoiceSchema.safeParse(current).success) {
      void form.trigger()
      setState('invalid')
      return false
    }
    const payload = formToDraft(current)
    const json = JSON.stringify(payload)
    if (json === lastSaved.current) {
      setState('saved')
      return true
    }
    setState('saving')
    const attempt = mutateAsync({ id: invoiceId, ...payload })
      .then(() => {
        lastSaved.current = json
        setError(null)
        setState(JSON.stringify(formToDraft(form.getValues())) === json ? 'saved' : 'pending')
        return true
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Couldn’t save')
        setState('error')
        return false
      })
    inFlight.current = attempt
    const ok = await attempt
    inFlight.current = null
    return ok
  }, [form, invoiceId, mutateAsync])

  useEffect(() => {
    const raw = JSON.stringify(form.getValues())
    if (raw === lastSeen.current) return
    lastSeen.current = raw
    setState('pending')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void run()
    }, DELAY_MS)
  }, [values, form, run])

  // Leaving the page mid-debounce still saves; closing the tab warns instead.
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        void runRef.current()
      }
    },
    [],
  )
  useEffect(() => {
    if (state !== 'pending' && state !== 'saving') return
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    return run()
  }, [run])

  return { state, error, flush }
}
