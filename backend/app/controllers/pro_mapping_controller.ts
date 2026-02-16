import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class ProMappingController {
  // ==========================================
  // Read-only endpoints (public)
  // ==========================================

  /**
   * GET /api/v1/pro/monitoring/proposals
   * List mapping proposals with optional filters
   */
  async proposals(ctx: HttpContext) {
    const { entityType, status = 'pending' } = ctx.request.qs()

    let query = db
      .from('pro_mapping_proposals')
      .select('pro_mapping_proposals.*')
      .orderBy('pro_mapping_proposals.created_at', 'desc')

    if (entityType) {
      query = query.where('entity_type', entityType)
    }
    if (status) {
      query = query.where('status', status)
    }

    const proposals = await query.limit(200)

    // Enrich with entity names
    const enriched = await Promise.all(
      proposals.map(async (p: Record<string, unknown>) => {
        const names = await this.getEntityNames(
          p.entity_type as string,
          p.source_entity_id as number,
          p.target_entity_id as number
        )
        return {
          id: p.id,
          entityType: p.entity_type,
          sourceEntityId: p.source_entity_id,
          targetEntityId: p.target_entity_id,
          sourceName: names.sourceName,
          targetName: names.targetName,
          confidence: p.confidence,
          matchReason: p.match_reason,
          status: p.status,
          notes: p.notes,
          reviewedAt: p.reviewed_at,
          appliedAt: p.applied_at,
          createdAt: p.created_at,
        }
      })
    )

    return ctx.response.ok({ data: enriched })
  }

  /**
   * GET /api/v1/pro/monitoring/mappings
   * List active entity mappings
   */
  async mappings(ctx: HttpContext) {
    const { entityType } = ctx.request.qs()

    let query = db
      .from('pro_entity_mappings')
      .orderBy('entity_type', 'asc')
      .orderBy('entity_id', 'asc')

    if (entityType) {
      query = query.where('entity_type', entityType)
    }

    const mappings = await query.limit(500)

    // Group by entity for better readability
    const enriched = await Promise.all(
      mappings.map(async (m: Record<string, unknown>) => {
        const entityName = await this.getEntityName(
          m.entity_type as string,
          m.entity_id as number
        )
        return {
          id: m.id,
          entityType: m.entity_type,
          entityId: m.entity_id,
          entityName,
          source: m.source,
          sourceId: m.source_id,
          createdAt: m.created_at,
        }
      })
    )

    return ctx.response.ok({ data: enriched })
  }

  /**
   * GET /api/v1/pro/monitoring/entities/search
   * Search entities for manual mapping
   */
  async searchEntities(ctx: HttpContext) {
    const { entityType, q } = ctx.request.qs()

    if (!entityType || !q || q.trim().length < 2) {
      return ctx.response.badRequest({ error: 'entityType and q (min 2 chars) are required' })
    }

    const escapedQ = q.replace(/[%_\\]/g, '\\$&')
    const searchTerm = `%${escapedQ}%`
    let results: Array<{ id: number; name: string; externalId: string | null }> = []

    if (entityType === 'team') {
      const rows = await db
        .from('pro_teams')
        .select('team_id as id', 'name', 'external_id')
        .whereILike('name', searchTerm)
        .orWhereILike('short_name', searchTerm)
        .orderBy('name')
        .limit(20)
      results = rows.map((r: Record<string, unknown>) => ({
        id: r.id as number,
        name: r.name as string,
        externalId: r.external_id as string | null,
      }))
    } else if (entityType === 'tournament') {
      const rows = await db
        .from('pro_tournaments')
        .select('tournament_id as id', 'name', 'external_id')
        .whereILike('name', searchTerm)
        .orderBy('name')
        .limit(20)
      results = rows.map((r: Record<string, unknown>) => ({
        id: r.id as number,
        name: r.name as string,
        externalId: r.external_id as string | null,
      }))
    } else if (entityType === 'league') {
      const rows = await db
        .from('pro_leagues')
        .select('league_id as id', 'name', 'external_id')
        .whereILike('name', searchTerm)
        .orderBy('name')
        .limit(20)
      results = rows.map((r: Record<string, unknown>) => ({
        id: r.id as number,
        name: r.name as string,
        externalId: r.external_id as string | null,
      }))
    } else {
      return ctx.response.badRequest({ error: 'entityType must be team, tournament, or league' })
    }

    return ctx.response.ok({ data: results })
  }

  // ==========================================
  // Write endpoints (requires proAdminAuth)
  // ==========================================

  /**
   * PATCH /api/v1/pro/monitoring/proposals/:id
   * Approve or reject a proposal
   */
  async updateProposal(ctx: HttpContext) {
    const proposalId = ctx.params.id
    const { status, notes } = ctx.request.body()

    if (!['approved', 'rejected'].includes(status)) {
      return ctx.response.badRequest({ error: 'status must be "approved" or "rejected"' })
    }

    const existing = await db.from('pro_mapping_proposals').where('id', proposalId).first()
    if (!existing) {
      return ctx.response.notFound({ error: 'Proposal not found' })
    }
    if (existing.status !== 'pending') {
      return ctx.response.badRequest({ error: `Proposal already ${existing.status}` })
    }

    const updateData: Record<string, unknown> = {
      status,
      reviewed_at: new Date(),
    }
    if (notes !== undefined) {
      updateData.notes = notes
    }

    await db.from('pro_mapping_proposals').where('id', proposalId).update(updateData)

    return ctx.response.ok({ message: `Proposal ${status}` })
  }

  /**
   * POST /api/v1/pro/monitoring/proposals/batch
   * Batch approve/reject proposals
   */
  async batchUpdateProposals(ctx: HttpContext) {
    const { ids, status } = ctx.request.body()

    if (!Array.isArray(ids) || ids.length === 0) {
      return ctx.response.badRequest({ error: 'ids must be a non-empty array' })
    }
    if (!['approved', 'rejected'].includes(status)) {
      return ctx.response.badRequest({ error: 'status must be "approved" or "rejected"' })
    }

    const result = await db
      .from('pro_mapping_proposals')
      .whereIn('id', ids)
      .where('status', 'pending')
      .update({
        status,
        reviewed_at: new Date(),
      })

    return ctx.response.ok({
      message: `${result[0]} proposals ${status}`,
      count: result[0],
    })
  }

  /**
   * POST /api/v1/pro/monitoring/mappings
   * Create a manual entity mapping
   */
  async createMapping(ctx: HttpContext) {
    const { entityType, entityId, source, sourceId } = ctx.request.body()

    if (!entityType || !entityId || !source || !sourceId) {
      return ctx.response.badRequest({
        error: 'entityType, entityId, source, and sourceId are required',
      })
    }

    if (!['team', 'tournament', 'league'].includes(entityType)) {
      return ctx.response.badRequest({ error: 'entityType must be team, tournament, or league' })
    }

    try {
      const [result] = await db
        .table('pro_entity_mappings')
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          source: source || 'manual',
          source_id: sourceId,
          created_at: new Date(),
        })
        .returning('*')

      return ctx.response.created({
        data: {
          id: result.id,
          entityType: result.entity_type,
          entityId: result.entity_id,
          source: result.source,
          sourceId: result.source_id,
        },
      })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('unique constraint')
      ) {
        return ctx.response.conflict({ error: 'This mapping already exists' })
      }
      throw error
    }
  }

  /**
   * DELETE /api/v1/pro/monitoring/mappings/:id
   * Delete a mapping
   */
  async deleteMapping(ctx: HttpContext) {
    const mappingId = ctx.params.id

    const existing = await db.from('pro_entity_mappings').where('id', mappingId).first()
    if (!existing) {
      return ctx.response.notFound({ error: 'Mapping not found' })
    }

    await db.from('pro_entity_mappings').where('id', mappingId).delete()

    return ctx.response.ok({ message: 'Mapping deleted' })
  }

  // ==========================================
  // Helpers
  // ==========================================

  private async getEntityName(entityType: string, entityId: number): Promise<string | null> {
    let row: Record<string, unknown> | null = null
    if (entityType === 'team') {
      row = await db.from('pro_teams').select('name').where('team_id', entityId).first()
    } else if (entityType === 'tournament') {
      row = await db.from('pro_tournaments').select('name').where('tournament_id', entityId).first()
    } else if (entityType === 'league') {
      row = await db.from('pro_leagues').select('name').where('league_id', entityId).first()
    }
    return row ? (row.name as string) : null
  }

  private async getEntityNames(
    entityType: string,
    sourceId: number,
    targetId: number
  ): Promise<{ sourceName: string | null; targetName: string | null }> {
    const [sourceName, targetName] = await Promise.all([
      this.getEntityName(entityType, sourceId),
      this.getEntityName(entityType, targetId),
    ])
    return { sourceName, targetName }
  }
}
