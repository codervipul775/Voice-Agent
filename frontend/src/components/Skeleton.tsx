'use client'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
  animate?: boolean
}

export default function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animate = true
}: SkeletonProps) {
  const baseClasses = 'bg-white/5 rounded'
  const animateClass = animate ? 'animate-pulse' : ''
  
  const variantClasses = {
    text: 'h-4 rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-lg'
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animateClass} ${className}`}
      style={style}
      role="status"
      aria-label="Loading..."
    />
  )
}

// Preset skeleton patterns
export function TextSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
          className="h-3"
        />
      ))}
    </div>
  )
}

export function AvatarSkeleton({ size = 48 }: { size?: number }) {
  return <Skeleton variant="circular" width={size} height={size} />
}

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 rounded-xl bg-white/5 border border-white/10 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <AvatarSkeleton size={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" className="h-3" />
          <Skeleton variant="text" width="60%" className="h-2" />
        </div>
      </div>
      <TextSkeleton lines={2} />
    </div>
  )
}

export function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg bg-white/5">
          <Skeleton variant="text" width="50%" className="h-2 mb-2" />
          <Skeleton variant="text" width="70%" className="h-5" />
        </div>
      ))}
    </div>
  )
}
