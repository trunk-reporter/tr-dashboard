import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CopyableIdProps {
  value: string
  label?: string
  className?: string
}

export function CopyableId({ value, label, className }: CopyableIdProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
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
