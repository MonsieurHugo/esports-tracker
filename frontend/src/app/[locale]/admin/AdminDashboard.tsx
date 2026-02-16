'use client'

import { useState, useEffect } from 'react'
import PasswordGate from './PasswordGate'
import PlayersTab from './tabs/PlayersTab'
import AccountsTab from './tabs/AccountsTab'
import TeamsTab from './tabs/TeamsTab'
import OrganizationsTab from './tabs/OrganizationsTab'

const TABS = [
  { id: 'players', label: 'Joueurs' },
  { id: 'accounts', label: 'Comptes' },
  { id: 'teams', label: 'Equipes' },
  { id: 'organizations', label: 'Organisations' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function AdminDashboard() {
  const [password, setPassword] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('players')

  useEffect(() => {
    const saved = sessionStorage.getItem('soloqAdminPassword')
    const unlocked = localStorage.getItem('soloqAdminUnlocked')
    if (saved && unlocked === 'true') {
      setPassword(saved)
    }
  }, [])

  if (!password) {
    return <PasswordGate onSuccess={(pw) => setPassword(pw)} />
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Admin SoloQ</h1>
          <button
            onClick={() => {
              sessionStorage.removeItem('soloqAdminPassword')
              localStorage.removeItem('soloqAdminUnlocked')
              setPassword(null)
            }}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Deconnexion
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[var(--bg-secondary)] rounded-lg p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'players' && <PlayersTab password={password} />}
        {activeTab === 'accounts' && <AccountsTab password={password} />}
        {activeTab === 'teams' && <TeamsTab password={password} />}
        {activeTab === 'organizations' && <OrganizationsTab password={password} />}
      </div>
    </div>
  )
}
