'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface GamesFilterProps {
  value: number
  onChange: (value: number) => void
  max?: number
}

const PRESETS = [0, 5, 10, 20, 50]

export default function GamesFilter({ value, onChange, max = 100 }: GamesFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  // Sync local value when prop changes
  useEffect(() => {
    if (!isDragging.current) {
      setLocalValue(value)
    }
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10)
    setLocalValue(newValue)
  }, [])

  const handleSliderEnd = useCallback(() => {
    isDragging.current = false
    onChange(localValue)
  }, [localValue, onChange])

  const handleSliderStart = useCallback(() => {
    isDragging.current = true
  }, [])

  const handlePresetClick = useCallback((preset: number) => {
    setLocalValue(preset)
    onChange(preset)
  }, [onChange])

  const getLabel = () => {
    if (value === 0) return 'Games: tous'
    return `Games: ${value}+`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`h-full flex items-center justify-between gap-2 px-3 py-[8px] bg-(--bg-card) border rounded-md text-[11px] font-medium hover:border-(--text-muted) transition-colors min-w-[110px] ${
          value > 0 ? 'border-(--accent) text-(--accent)' : 'border-(--border)'
        }`}
      >
        <span>{getLabel()}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-(--bg-card) border border-(--border) rounded-lg shadow-lg z-50 p-3 min-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-(--text-muted)">Minimum de games</span>
            <span className="text-xs font-mono font-semibold text-(--accent)">
              {localValue === 0 ? 'Tous' : localValue}
            </span>
          </div>

          {/* Slider */}
          <div className="relative mb-3">
            <input
              type="range"
              min="0"
              max={max}
              value={localValue}
              onChange={handleSliderChange}
              onMouseDown={handleSliderStart}
              onMouseUp={handleSliderEnd}
              onTouchStart={handleSliderStart}
              onTouchEnd={handleSliderEnd}
              className="w-full h-1.5 bg-(--bg-secondary) rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-(--accent)
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:border-2
                [&::-webkit-slider-thumb]:border-(--bg-card)
                [&::-webkit-slider-thumb]:shadow-md
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-(--accent)
                [&::-moz-range-thumb]:cursor-pointer
                [&::-moz-range-thumb]:border-2
                [&::-moz-range-thumb]:border-(--bg-card)
              "
              style={{
                background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(localValue / max) * 100}%, var(--bg-secondary) ${(localValue / max) * 100}%, var(--bg-secondary) 100%)`,
              }}
            />
          </div>

          {/* Quick presets */}
          <div className="flex gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                  localValue === preset
                    ? 'bg-(--accent) text-white'
                    : 'bg-(--bg-secondary) text-(--text-muted) hover:bg-(--bg-hover)'
                }`}
              >
                {preset === 0 ? 'Tous' : preset}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
