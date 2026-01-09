import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StatCard from '@/components/dashboard/StatCard'

describe('StatCard', () => {
  it('renders label correctly', () => {
    render(<StatCard label="Games" value={150} />)
    expect(screen.getByText('Games')).toBeInTheDocument()
  })

  it('renders value correctly', () => {
    render(<StatCard label="Games" value={150} />)
    expect(screen.getByText('150')).toBeInTheDocument()
  })

  it('renders formatted number value', () => {
    render(<StatCard label="LP" value={12500} />)
    // French locale formatting
    expect(screen.getByText(/12.*500/)).toBeInTheDocument()
  })

  it('renders string value correctly', () => {
    render(<StatCard label="Winrate" value="58.5%" />)
    expect(screen.getByText('58.5%')).toBeInTheDocument()
  })

  it('renders positive change with green color', () => {
    render(<StatCard label="Games" value={150} change={12} changeUnit="" />)
    const changeElement = screen.getByText(/↑.*12/)
    expect(changeElement).toHaveClass('text-[var(--positive)]')
  })

  it('renders negative change with red color', () => {
    render(<StatCard label="Winrate" value="55%" change={-2.5} changeUnit="%" />)
    const changeElement = screen.getByText(/↓.*2.*5/)
    expect(changeElement).toHaveClass('text-[var(--negative)]')
  })

  it('hides change indicator when change is undefined', () => {
    render(<StatCard label="Games" value={150} />)
    expect(screen.queryByText('↑')).not.toBeInTheDocument()
    expect(screen.queryByText('↓')).not.toBeInTheDocument()
  })

  it('renders comparison mode with two teams', () => {
    const teams = [
      { value: 150, change: 12 },
      { value: 120, change: -5 },
    ]
    render(<StatCard label="Games" teams={teams} changeUnit="" />)
    
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  it('renders team color indicators in comparison mode', () => {
    const teams = [
      { value: 150, change: 12 },
      { value: 120, change: -5 },
    ]
    render(<StatCard label="Games" teams={teams} changeUnit="" />)
    
    const colorDots = document.querySelectorAll('.rounded-full')
    expect(colorDots.length).toBe(2)
  })
})
