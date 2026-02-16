'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface Proposal {
  id: number
  entityType: string
  sourceEntityId: number
  targetEntityId: number
  sourceName: string | null
  targetName: string | null
  confidence: number
  matchReason: string | null
  status: string
  notes: string | null
  createdAt: string
}

interface Mapping {
  id: number
  entityType: string
  entityId: number
  entityName: string | null
  source: string
  sourceId: string
  createdAt: string
}

interface SearchResult {
  id: number
  name: string
  externalId: string | null
}

const ENTITY_TYPES = ['team', 'tournament', 'league'] as const
type EntityType = (typeof ENTITY_TYPES)[number]

const STATUS_FILTERS = ['pending', 'approved', 'rejected', 'applied'] as const

export default function MappingManager() {
  // Proposals state
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [proposalStatus, setProposalStatus] = useState<string>('pending')
  const [proposalEntityType, setProposalEntityType] = useState<string>('')
  const [isLoadingProposals, setIsLoadingProposals] = useState(true)

  // Mappings state
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [mappingEntityType, setMappingEntityType] = useState<string>('')
  const [isLoadingMappings, setIsLoadingMappings] = useState(true)

  // Manual mapping form
  const [manualEntityType, setManualEntityType] = useState<EntityType>('team')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedEntity, setSelectedEntity] = useState<SearchResult | null>(null)
  const [manualSourceId, setManualSourceId] = useState('')
  const [manualSource, setManualSource] = useState('manual')
  const [isSearching, setIsSearching] = useState(false)

  // Active section
  const [activeSection, setActiveSection] = useState<'proposals' | 'mappings'>('proposals')

  const fetchProposals = useCallback(async () => {
    setIsLoadingProposals(true)
    try {
      const params: Record<string, string> = { status: proposalStatus }
      if (proposalEntityType) params.entityType = proposalEntityType
      const data = await api.get<{ data: Proposal[] }>('/pro/monitoring/proposals', { params })
      setProposals(data.data)
    } catch (error) {
      logError('Failed to fetch proposals', error)
    } finally {
      setIsLoadingProposals(false)
    }
  }, [proposalStatus, proposalEntityType])

  const fetchMappings = useCallback(async () => {
    setIsLoadingMappings(true)
    try {
      const params: Record<string, string> = {}
      if (mappingEntityType) params.entityType = mappingEntityType
      const data = await api.get<{ data: Mapping[] }>('/pro/monitoring/mappings', { params })
      setMappings(data.data)
    } catch (error) {
      logError('Failed to fetch mappings', error)
    } finally {
      setIsLoadingMappings(false)
    }
  }, [mappingEntityType])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  // Search entities for manual mapping
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await api.get<{ data: SearchResult[] }>('/pro/monitoring/entities/search', {
          params: { entityType: manualEntityType, q: searchQuery },
        })
        setSearchResults(data.data)
      } catch (error) {
        logError('Search failed', error)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, manualEntityType])

  const handleApprove = async (id: number) => {
    try {
      await api.patch(`/pro/monitoring/proposals/${id}`, { status: 'approved' })
      fetchProposals()
    } catch (error) {
      logError('Failed to approve proposal', error)
    }
  }

  const handleReject = async (id: number) => {
    try {
      await api.patch(`/pro/monitoring/proposals/${id}`, { status: 'rejected' })
      fetchProposals()
    } catch (error) {
      logError('Failed to reject proposal', error)
    }
  }

  const handleBatchAction = async (status: 'approved' | 'rejected') => {
    const pendingIds = proposals.filter((p) => p.status === 'pending').map((p) => p.id)
    if (pendingIds.length === 0) return

    try {
      await api.post('/pro/monitoring/proposals/batch', { ids: pendingIds, status })
      fetchProposals()
    } catch (error) {
      logError(`Failed to batch ${status}`, error)
    }
  }

  const handleCreateMapping = async () => {
    if (!selectedEntity || !manualSourceId.trim()) return

    try {
      await api.post('/pro/monitoring/mappings', {
        entityType: manualEntityType,
        entityId: selectedEntity.id,
        source: manualSource,
        sourceId: manualSourceId.trim(),
      })
      setSelectedEntity(null)
      setManualSourceId('')
      setSearchQuery('')
      setSearchResults([])
      fetchMappings()
    } catch (error) {
      logError('Failed to create mapping', error)
    }
  }

  const handleDeleteMapping = async (id: number) => {
    if (!confirm('Delete this mapping?')) return

    try {
      await api.delete(`/pro/monitoring/mappings/${id}`)
      fetchMappings()
    } catch (error) {
      logError('Failed to delete mapping', error)
    }
  }

  const confidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-[var(--positive)]/20 text-[var(--positive)]'
    if (confidence >= 0.7) return 'bg-[var(--warning)]/20 text-[var(--warning)]'
    return 'bg-[var(--negative)]/20 text-[var(--negative)]'
  }

  const sourceBadge = (source: string) => {
    switch (source) {
      case 'grid':
        return 'bg-blue-500/20 text-blue-400'
      case 'leaguepedia':
        return 'bg-purple-500/20 text-purple-400'
      default:
        return 'bg-[var(--bg-secondary)] text-(--text-muted)'
    }
  }

  const pendingCount = proposals.filter((p) => p.status === 'pending').length

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('proposals')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'proposals'
              ? 'bg-[var(--accent)] text-black'
              : 'bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
          }`}
        >
          Proposals {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setActiveSection('mappings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'mappings'
              ? 'bg-[var(--accent)] text-black'
              : 'bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
          }`}
        >
          Mappings ({mappings.length})
        </button>
      </div>

      {activeSection === 'proposals' && (
        <div className="space-y-4">
          {/* Proposals Section */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
            <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-medium text-(--text-primary)">Mapping Proposals</h3>
              <div className="flex items-center gap-2">
                <select
                  value={proposalEntityType}
                  onChange={(e) => setProposalEntityType(e.target.value)}
                  className="px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
                >
                  <option value="">All types</option>
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={proposalStatus}
                  onChange={(e) => setProposalStatus(e.target.value)}
                  className="px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
                >
                  {STATUS_FILTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {proposalStatus === 'pending' && pendingCount > 0 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleBatchAction('approved')}
                      className="px-2 py-1 text-xs font-medium rounded bg-[var(--positive)]/20 text-[var(--positive)] hover:bg-[var(--positive)]/30"
                    >
                      Approve all
                    </button>
                    <button
                      onClick={() => handleBatchAction('rejected')}
                      className="px-2 py-1 text-xs font-medium rounded bg-[var(--negative)]/20 text-[var(--negative)] hover:bg-[var(--negative)]/30"
                    >
                      Reject all
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {isLoadingProposals ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="py-3 px-3">
                    <Skeleton className="h-5 w-full" />
                  </div>
                ))
              ) : proposals.length === 0 ? (
                <div className="py-8 text-center text-(--text-muted) text-sm">
                  No {proposalStatus} proposals
                </div>
              ) : (
                proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="py-2.5 px-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-hover)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-(--text-muted)">
                          {proposal.entityType}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceBadge(proposal.confidence)}`}>
                          {Math.round(proposal.confidence * 100)}%
                        </span>
                        {proposal.matchReason && (
                          <span className="text-xs text-(--text-muted)">{proposal.matchReason}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm">
                        <span className="text-[var(--negative)] truncate">
                          {proposal.sourceName || `#${proposal.sourceEntityId}`}
                        </span>
                        <span className="text-(--text-muted) shrink-0">&rarr;</span>
                        <span className="text-[var(--positive)] truncate">
                          {proposal.targetName || `#${proposal.targetEntityId}`}
                        </span>
                      </div>
                      {proposal.notes && (
                        <div className="mt-0.5 text-xs text-(--text-muted) truncate">{proposal.notes}</div>
                      )}
                    </div>
                    {proposal.status === 'pending' && (
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApprove(proposal.id)}
                          className="px-2 py-1 text-xs font-medium rounded bg-[var(--positive)]/20 text-[var(--positive)] hover:bg-[var(--positive)]/30"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(proposal.id)}
                          className="px-2 py-1 text-xs font-medium rounded bg-[var(--negative)]/20 text-[var(--negative)] hover:bg-[var(--negative)]/30"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {proposal.status !== 'pending' && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          proposal.status === 'approved'
                            ? 'bg-[var(--positive)]/20 text-[var(--positive)]'
                            : proposal.status === 'applied'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-[var(--negative)]/20 text-[var(--negative)]'
                        }`}
                      >
                        {proposal.status}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeSection === 'mappings' && (
        <div className="space-y-4">
          {/* Manual Mapping Form */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
            <div className="py-2 px-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-medium text-(--text-primary)">Create Manual Mapping</h3>
            </div>
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={manualEntityType}
                  onChange={(e) => {
                    setManualEntityType(e.target.value as EntityType)
                    setSelectedEntity(null)
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={manualSource}
                  onChange={(e) => setManualSource(e.target.value)}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
                >
                  <option value="manual">manual</option>
                  <option value="grid">grid</option>
                  <option value="leaguepedia">leaguepedia</option>
                </select>
                <input
                  type="text"
                  placeholder="Source ID"
                  value={manualSourceId}
                  onChange={(e) => setManualSourceId(e.target.value)}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted)"
                />
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Search ${manualEntityType} by name...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedEntity(null)
                  }}
                  className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted)"
                />
                {isSearching && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="w-3 h-3 border border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {searchResults.length > 0 && !selectedEntity && (
                  <div className="absolute z-10 mt-1 w-full bg-[var(--bg-card)] border border-[var(--border)] rounded shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => {
                          setSelectedEntity(result)
                          setSearchQuery(result.name)
                          setSearchResults([])
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)] text-(--text-primary) flex items-center justify-between"
                      >
                        <span className="truncate">{result.name}</span>
                        <span className="text-(--text-muted) ml-2 shrink-0">#{result.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedEntity && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-(--text-muted)">Selected:</span>
                  <span className="text-xs text-[var(--positive)]">
                    {selectedEntity.name} (#{selectedEntity.id})
                  </span>
                  <button
                    onClick={handleCreateMapping}
                    disabled={!manualSourceId.trim()}
                    className="ml-auto px-2 py-1 text-xs font-medium rounded bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    Create Mapping
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Mappings */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
            <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-medium text-(--text-primary)">Active Mappings</h3>
              <select
                value={mappingEntityType}
                onChange={(e) => setMappingEntityType(e.target.value)}
                className="px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
              >
                <option value="">All types</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
              {isLoadingMappings ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="py-2.5 px-3">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))
              ) : mappings.length === 0 ? (
                <div className="py-8 text-center text-(--text-muted) text-sm">No mappings found</div>
              ) : (
                mappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className="py-2 px-3 flex items-center justify-between gap-2 hover:bg-[var(--bg-hover)]"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-(--text-muted) shrink-0">
                        {mapping.entityType}
                      </span>
                      <span className="text-sm text-(--text-primary) truncate">
                        {mapping.entityName || `#${mapping.entityId}`}
                      </span>
                      <span className="text-(--text-muted) shrink-0">&larr;</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${sourceBadge(mapping.source)}`}>
                        {mapping.source}
                      </span>
                      <span className="text-xs font-mono text-(--text-secondary) truncate">{mapping.sourceId}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteMapping(mapping.id)}
                      className="px-1.5 py-0.5 text-xs rounded bg-[var(--bg-secondary)] text-[var(--negative)] hover:bg-[var(--bg-hover)] shrink-0"
                    >
                      Del
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
