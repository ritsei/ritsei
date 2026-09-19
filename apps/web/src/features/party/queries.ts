import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  AssignPartyRoleInput,
  AttachPartyIdentifierInput,
  Branch,
  CreateBranchInput,
  CreatePartyInput,
  CreatePartyRelationshipInput,
  CreatePartyRepresentationInput,
  ExternalIdentifier,
  LegalEntity,
  ListPartiesInput,
  ListRelatedPartyPathsInput,
  Party,
  PartyDetail,
  PartyDirectoryEntry,
  PartyRelationship,
  PartyRepresentation,
  RelatedPartyPath,
  SetPartyRepresentationActiveInput,
} from "../../shared/contracts/generated/party.ts"
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery, serverQueryKey } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  assignPartyRole,
  attachPartyIdentifier,
  createBranch,
  createLegalEntity,
  createParty,
  createPartyRelationship,
  createPartyRepresentation,
  findRelatedPartyPaths,
  getPartyDetail,
  listParties,
  setPartyRepresentationActive,
} from "./service.ts"

const partyCollectionKey = ["party", "collection"] as const
const partyCollectionQueryKey = (input: ListPartiesInput) => [...partyCollectionKey, input] as const
const partyDetailsKey = ["party", "detail"] as const
const partyDetailKey = (id: string) => [...partyDetailsKey, id] as const
const relatedPartyPathsKey = (id: string, input: ListRelatedPartyPathsInput) =>
  ["party", "related-paths", id, input] as const

const invalidatePartyCollection = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, partyCollectionKey) })

const invalidatePartyDetails = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
  partyId?: string,
) =>
  client.invalidateQueries({
    queryKey: serverQueryKey(
      tenantId,
      partyId === undefined ? partyDetailsKey : partyDetailKey(partyId),
    ),
  })

export function createPartiesQuery(scope: ApiScope, input: ListPartiesInput = {}) {
  return createServerQuery<readonly PartyDirectoryEntry[], RequestFailure>({
    tenantId: scope.tenantId,
    key: partyCollectionQueryKey(input),
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listParties(input), signal),
  })
}

export function createPartyDetailQuery(scope: ApiScope, id: string) {
  return createServerQuery<PartyDetail, RequestFailure>({
    tenantId: scope.tenantId,
    key: partyDetailKey(id),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getPartyDetail(id), signal),
  })
}

export function createRelatedPartyPathsQuery(
  scope: ApiScope,
  id: string,
  input: ListRelatedPartyPathsInput = {},
) {
  return createServerQuery<readonly RelatedPartyPath[], RequestFailure>({
    tenantId: scope.tenantId,
    key: relatedPartyPathsKey(id, input),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, findRelatedPartyPaths(id, input), signal),
  })
}

export function createPartyMutation(
  scope: ApiScope,
  afterSuccess?: (party: Party) => void,
) {
  const client = useQueryClient()
  return useMutation<Party, RequestFailure, CreatePartyInput>(() => ({
    mutationFn: (input) => runRequest(scope, createParty(input)),
    onSuccess: (party) => {
      afterSuccess?.(party)
      return invalidatePartyCollection(client, scope.tenantId)
    },
  }))
}

export function createLegalEntityMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<LegalEntity, RequestFailure, { partyId: string }>(() => ({
    mutationFn: ({ partyId }) => runRequest(scope, createLegalEntity(partyId)),
    onSuccess: (_, { partyId }) =>
      Promise.all([
        invalidatePartyCollection(client, scope.tenantId),
        invalidatePartyDetails(client, scope.tenantId, partyId),
      ]),
  }))
}

export function createBranchMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<
    Branch,
    RequestFailure,
    CreateBranchInput & { legalEntityId: string }
  >(() => ({
    mutationFn: ({ legalEntityId, ...input }) =>
      runRequest(scope, createBranch(legalEntityId, input)),
    onSuccess: () => invalidatePartyDetails(client, scope.tenantId),
  }))
}

export function assignPartyRoleMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<void, RequestFailure, AssignPartyRoleInput & { partyId: string }>(() => ({
    mutationFn: ({ partyId, ...input }) => runRequest(scope, assignPartyRole(partyId, input)),
    onSuccess: (_, { partyId }) => invalidatePartyDetails(client, scope.tenantId, partyId),
  }))
}

export function attachPartyIdentifierMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<
    ExternalIdentifier,
    RequestFailure,
    AttachPartyIdentifierInput & { partyId: string }
  >(() => ({
    mutationFn: ({ partyId, ...input }) => runRequest(scope, attachPartyIdentifier(partyId, input)),
    onSuccess: (_, { partyId }) => invalidatePartyDetails(client, scope.tenantId, partyId),
  }))
}

export function createPartyRelationshipMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<
    PartyRelationship,
    RequestFailure,
    CreatePartyRelationshipInput & { partyId: string }
  >(() => ({
    mutationFn: ({ partyId, ...input }) =>
      runRequest(scope, createPartyRelationship(partyId, input)),
    onSuccess: (_, { partyId }) =>
      Promise.all([
        invalidatePartyDetails(client, scope.tenantId, partyId),
        client.invalidateQueries({
          queryKey: serverQueryKey(scope.tenantId, ["party", "related-paths"]),
        }),
      ]),
  }))
}

export function createPartyRepresentationMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<
    PartyRepresentation,
    RequestFailure,
    CreatePartyRepresentationInput & { partyId: string }
  >(() => ({
    mutationFn: ({ partyId, ...input }) =>
      runRequest(scope, createPartyRepresentation(partyId, input)),
    onSuccess: (_, { partyId }) => invalidatePartyDetails(client, scope.tenantId, partyId),
  }))
}

export function setPartyRepresentationActiveMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<
    PartyRepresentation,
    RequestFailure,
    SetPartyRepresentationActiveInput & { representationId: string }
  >(() => ({
    mutationFn: ({ representationId, ...input }) =>
      runRequest(scope, setPartyRepresentationActive(representationId, input)),
    onSuccess: () => invalidatePartyDetails(client, scope.tenantId),
  }))
}
