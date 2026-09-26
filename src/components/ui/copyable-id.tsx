import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'

interface CopyableIdProps {
  value: string
  label?: string
  className?: string
}

export function CopyableId({ value, label, className }: CopyableIdProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    // navigator.clipboard is missing over plain HTTP; copyText falls back
    void copyText(value).then((result) => {
      if (result !== 'copied') return
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])

  return (
    <Badge
      variant="outline"
      className={cn('font-mono cursor-pointer select-none transition-colors', className)}
      onClick={handleCopy}
      title={`Click to copy: ${value}`}
    >
      {copied ? 'Copied!' : label ? `${label}: ${value}` : value}
    </Badge>
  )
}
