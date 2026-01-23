'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  BarChart,
  Bar,
} from 'recharts'

// Sample data for charts
const chartData = [
  { label: 'Lun', games: 12, lp: 450 },
  { label: 'Mar', games: 8, lp: 520 },
  { label: 'Mer', games: 15, lp: 480 },
  { label: 'Jeu', games: 6, lp: 610 },
  { label: 'Ven', games: 18, lp: 590 },
  { label: 'Sam', games: 22, lp: 720 },
  { label: 'Dim', games: 14, lp: 680 },
]

const winrateData = [
  { name: 'Rekkles', winrate: 67, games: 45 },
  { name: 'Caps', winrate: 58, games: 62 },
  { name: 'Jankos', winrate: 52, games: 38 },
  { name: 'Mikyx', winrate: 61, games: 41 },
]

// Theme definitions
const themes = {
  terminal: {
    name: 'Terminal',
    description: 'Noir profond, vert terminal vif. Raw & hacker aesthetic.',
    vars: {
      '--bg-primary': '#07070a',
      '--bg-secondary': '#0c0c0f',
      '--bg-card': '#101014',
      '--bg-hover': '#16161c',
      '--border': '#1e1e24',
      '--text-primary': '#f0f0f0',
      '--text-secondary': '#888892',
      '--text-muted': '#4a4a52',
      '--accent': '#00dc82',
      '--accent-hover': '#00c974',
      '--positive': '#00dc82',
      '--negative': '#ff4757',
    },
  },
  emerald: {
    name: 'Emerald',
    description: 'Vert émeraude élégant, tons chauds. Premium feel.',
    vars: {
      '--bg-primary': '#0a0a0b',
      '--bg-secondary': '#0f0f10',
      '--bg-card': '#141415',
      '--bg-hover': '#1a1a1c',
      '--border': '#252528',
      '--text-primary': '#fafafa',
      '--text-secondary': '#a0a0a5',
      '--text-muted': '#5a5a60',
      '--accent': '#10b981',
      '--accent-hover': '#059669',
      '--positive': '#10b981',
      '--negative': '#f43f5e',
    },
  },
  mint: {
    name: 'Mint',
    description: 'Vert menthe frais, moderne et clean. Subtle & refined.',
    vars: {
      '--bg-primary': '#08090a',
      '--bg-secondary': '#0d0e10',
      '--bg-card': '#121316',
      '--bg-hover': '#181a1e',
      '--border': '#23262b',
      '--text-primary': '#f4f4f5',
      '--text-secondary': '#94949c',
      '--text-muted': '#4e4e56',
      '--accent': '#2dd4bf',
      '--accent-hover': '#14b8a6',
      '--positive': '#2dd4bf',
      '--negative': '#fb7185',
    },
  },
  obsidian: {
    name: 'Obsidian',
    description: 'Noir obsidienne, accent vert jade discret. Luxe & minimal.',
    vars: {
      '--bg-primary': '#09090b',
      '--bg-secondary': '#0e0e11',
      '--bg-card': '#131316',
      '--bg-hover': '#19191d',
      '--border': '#222226',
      '--text-primary': '#ededef',
      '--text-secondary': '#8c8c94',
      '--text-muted': '#505058',
      '--accent': '#3ecf8e',
      '--accent-hover': '#2eb67d',
      '--positive': '#3ecf8e',
      '--negative': '#e5484d',
    },
  },
  arctic: {
    name: 'Arctic',
    description: 'Tons froids cyan-vert, feeling glacial. Modern & sharp.',
    vars: {
      '--bg-primary': '#06080a',
      '--bg-secondary': '#0a0d10',
      '--bg-card': '#0f1318',
      '--bg-hover': '#151a20',
      '--border': '#1e252d',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#8b97a5',
      '--text-muted': '#4b5563',
      '--accent': '#06d6a0',
      '--accent-hover': '#05b88a',
      '--positive': '#06d6a0',
      '--negative': '#ff6b6b',
    },
  },
}

type ThemeKey = keyof typeof themes

function ThemePreview({ themeKey, isSelected, onSelect }: {
  themeKey: ThemeKey
  isSelected: boolean
  onSelect: () => void
}) {
  const theme = themes[themeKey]
  const vars = theme.vars

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer transition-all duration-200"
      style={{
        backgroundColor: vars['--bg-card'],
        border: `2px solid ${isSelected ? vars['--accent'] : vars['--border']}`,
        borderRadius: '8px',
        padding: '16px',
        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span style={{ color: vars['--text-primary'], fontWeight: 600, fontSize: '14px' }}>
          {theme.name}
        </span>
        {isSelected && (
          <span
            style={{
              backgroundColor: vars['--accent'],
              color: vars['--bg-primary'],
              fontSize: '9px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            SELECTED
          </span>
        )}
      </div>

      {/* Description */}
      <p style={{ color: vars['--text-muted'], fontSize: '11px', marginBottom: '12px' }}>
        {theme.description}
      </p>

      {/* Color swatches */}
      <div className="flex gap-1 mb-3">
        {['--bg-primary', '--bg-card', '--border', '--text-primary', '--accent'].map((v) => (
          <div
            key={v}
            style={{
              backgroundColor: vars[v as keyof typeof vars],
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              border: `1px solid ${vars['--border']}`,
            }}
            title={v}
          />
        ))}
      </div>

      {/* Mini preview */}
      <div
        style={{
          backgroundColor: vars['--bg-secondary'],
          borderRadius: '6px',
          padding: '10px',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: vars['--accent'],
            }}
          />
          <span style={{ color: vars['--text-secondary'], fontSize: '10px' }}>Live Status</span>
        </div>
        <div className="flex gap-2">
          <button
            style={{
              backgroundColor: vars['--accent'],
              color: vars['--bg-primary'],
              fontSize: '9px',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: '4px',
              border: 'none',
            }}
          >
            Action
          </button>
          <button
            style={{
              backgroundColor: vars['--bg-hover'],
              color: vars['--text-secondary'],
              fontSize: '9px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: `1px solid ${vars['--border']}`,
            }}
          >
            Secondary
          </button>
        </div>
      </div>
    </div>
  )
}

function FullPreview({ themeKey }: { themeKey: ThemeKey }) {
  const theme = themes[themeKey]
  const vars = theme.vars

  return (
    <div
      style={
        {
          '--bg-primary': vars['--bg-primary'],
          '--bg-secondary': vars['--bg-secondary'],
          '--bg-card': vars['--bg-card'],
          '--bg-hover': vars['--bg-hover'],
          '--border': vars['--border'],
          '--text-primary': vars['--text-primary'],
          '--text-secondary': vars['--text-secondary'],
          '--text-muted': vars['--text-muted'],
          '--accent': vars['--accent'],
          '--accent-hover': vars['--accent-hover'],
          '--positive': vars['--positive'],
          '--negative': vars['--negative'],
          backgroundColor: vars['--bg-primary'],
          borderRadius: '12px',
          padding: '24px',
          border: `1px solid ${vars['--border']}`,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ color: vars['--text-primary'], fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
            {theme.name}
          </h2>
          <p style={{ color: vars['--text-muted'], fontSize: '12px' }}>{theme.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            style={{
              backgroundColor: vars['--bg-hover'],
              color: vars['--text-secondary'],
              fontSize: '12px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: `1px solid ${vars['--border']}`,
            }}
          >
            Settings
          </button>
          <button
            style={{
              backgroundColor: vars['--accent'],
              color: vars['--bg-primary'],
              fontSize: '12px',
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
            }}
          >
            Export
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Games', value: '1,247', change: '+12%' },
          { label: 'Avg Winrate', value: '58.4%', change: '+2.1%' },
          { label: 'Active Players', value: '24', change: '' },
          { label: 'Avg LP', value: '847', change: '-23' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              backgroundColor: vars['--bg-card'],
              border: `1px solid ${vars['--border']}`,
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ color: vars['--text-muted'], fontSize: '11px', marginBottom: '4px' }}>
              {stat.label}
            </div>
            <div className="flex items-baseline gap-2">
              <span style={{ color: vars['--text-primary'], fontSize: '24px', fontWeight: 700 }}>
                {stat.value}
              </span>
              {stat.change && (
                <span
                  style={{
                    color: stat.change.startsWith('+') ? vars['--positive'] : vars['--negative'],
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {stat.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Area Chart - LP Evolution */}
        <div
          style={{
            backgroundColor: vars['--bg-card'],
            border: `1px solid ${vars['--border']}`,
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${vars['--border']}`,
              color: vars['--text-secondary'],
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            LP Evolution
          </div>
          <div style={{ padding: '16px', height: '180px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: vars['--text-muted'], fontSize: 9 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: vars['--text-muted'], fontSize: 9 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: vars['--bg-hover'],
                    border: `1px solid ${vars['--border']}`,
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: vars['--text-primary'] }}
                />
                <Area
                  type="monotone"
                  dataKey="lp"
                  stroke={vars['--accent']}
                  fill={vars['--accent']}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart - Games per day */}
        <div
          style={{
            backgroundColor: vars['--bg-card'],
            border: `1px solid ${vars['--border']}`,
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${vars['--border']}`,
              color: vars['--text-secondary'],
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Games par jour
          </div>
          <div style={{ padding: '16px', height: '180px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: vars['--text-muted'], fontSize: 9 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: vars['--text-muted'], fontSize: 9 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: vars['--bg-hover'],
                    border: `1px solid ${vars['--border']}`,
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: vars['--text-primary'] }}
                />
                <Bar dataKey="games" fill={vars['--accent']} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: vars['--bg-card'],
          border: `1px solid ${vars['--border']}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${vars['--border']}`,
            color: vars['--text-secondary'],
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          Player Leaderboard
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${vars['--border']}` }}>
              {['Player', 'Winrate', 'Games', 'Status'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '10px 16px',
                    textAlign: 'left',
                    color: vars['--text-muted'],
                    fontSize: '10px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {winrateData.map((player, i) => (
              <tr
                key={player.name}
                style={{
                  borderBottom: i < winrateData.length - 1 ? `1px solid ${vars['--border']}` : 'none',
                }}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        backgroundColor: vars['--bg-hover'],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: vars['--text-muted'],
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {player.name.charAt(0)}
                    </div>
                    <span style={{ color: vars['--text-primary'], fontSize: '13px', fontWeight: 500 }}>
                      {player.name}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span
                    style={{
                      color: player.winrate >= 55 ? vars['--positive'] : vars['--text-secondary'],
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    {player.winrate}%
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: vars['--text-secondary'], fontSize: '13px' }}>
                  {player.games}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: `${vars['--positive']}15`,
                      color: vars['--positive'],
                      fontSize: '10px',
                      fontWeight: 500,
                      padding: '4px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: vars['--positive'],
                      }}
                    />
                    Online
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Buttons & inputs row */}
      <div className="mt-6 flex items-center gap-4">
        <button
          style={{
            backgroundColor: vars['--accent'],
            color: vars['--bg-primary'],
            fontSize: '12px',
            fontWeight: 600,
            padding: '10px 20px',
            borderRadius: '6px',
            border: 'none',
          }}
        >
          Primary Action
        </button>
        <button
          style={{
            backgroundColor: 'transparent',
            color: vars['--accent'],
            fontSize: '12px',
            fontWeight: 500,
            padding: '10px 20px',
            borderRadius: '6px',
            border: `1px solid ${vars['--accent']}`,
          }}
        >
          Secondary
        </button>
        <button
          style={{
            backgroundColor: vars['--bg-hover'],
            color: vars['--text-secondary'],
            fontSize: '12px',
            padding: '10px 20px',
            borderRadius: '6px',
            border: `1px solid ${vars['--border']}`,
          }}
        >
          Tertiary
        </button>
        <button
          style={{
            backgroundColor: `${vars['--negative']}20`,
            color: vars['--negative'],
            fontSize: '12px',
            fontWeight: 500,
            padding: '10px 20px',
            borderRadius: '6px',
            border: 'none',
          }}
        >
          Danger
        </button>
      </div>

      {/* Toast notifications preview */}
      <div className="mt-6 flex gap-4">
        <div
          style={{
            backgroundColor: vars['--bg-card'],
            border: `1px solid ${vars['--positive']}40`,
            borderLeft: `3px solid ${vars['--positive']}`,
            borderRadius: '6px',
            padding: '12px 16px',
            flex: 1,
          }}
        >
          <div style={{ color: vars['--positive'], fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>
            Success
          </div>
          <div style={{ color: vars['--text-secondary'], fontSize: '11px' }}>
            Data exported successfully
          </div>
        </div>
        <div
          style={{
            backgroundColor: vars['--bg-card'],
            border: `1px solid ${vars['--negative']}40`,
            borderLeft: `3px solid ${vars['--negative']}`,
            borderRadius: '6px',
            padding: '12px 16px',
            flex: 1,
          }}
        >
          <div style={{ color: vars['--negative'], fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>
            Error
          </div>
          <div style={{ color: vars['--text-secondary'], fontSize: '11px' }}>
            Failed to fetch player data
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DesignPage() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>('terminal')

  return (
    <div className="min-h-screen bg-[#050508] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Design System Preview</h1>
          <p className="text-gray-500 text-sm">
            Sélectionne un thème pour voir le preview complet. Tous basés sur des tons verts, bruts et épurés.
          </p>
        </div>

        {/* Theme selector grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {(Object.keys(themes) as ThemeKey[]).map((key) => (
            <ThemePreview
              key={key}
              themeKey={key}
              isSelected={selectedTheme === key}
              onSelect={() => setSelectedTheme(key)}
            />
          ))}
        </div>

        {/* Full preview */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Preview complet</h2>
          <FullPreview themeKey={selectedTheme} />
        </div>

        {/* CSS Export */}
        <div className="bg-[#0a0a0c] border border-[#1a1a1f] rounded-lg p-6">
          <h3 className="text-white font-semibold mb-4">CSS Variables</h3>
          <pre className="text-xs text-gray-400 overflow-x-auto">
            <code>
{`:root {
${Object.entries(themes[selectedTheme].vars)
  .map(([key, value]) => `  ${key}: ${value};`)
  .join('\n')}
}`}
            </code>
          </pre>
        </div>
      </div>
    </div>
  )
}
