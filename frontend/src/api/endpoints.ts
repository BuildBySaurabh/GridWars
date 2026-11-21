import { http } from './client'
import type { Cell, GridSnapshot, JoinResponse, MeResponse } from './types'

export async function join(username: string, color: string): Promise<JoinResponse> {
  const { data } = await http.post<JoinResponse>('/players/join/', { username, color })
  return data
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await http.get<MeResponse>('/players/me/')
  return data
}

export async function getGrid(): Promise<GridSnapshot> {
  const { data } = await http.get<GridSnapshot>('/grid/')
  return data
}

/** Resolves with the cell as the server committed it; rejects with ApiError (409 if taken). */
export async function capture(cellId: number): Promise<Cell> {
  const { data } = await http.post<Cell>(`/grid/cells/${cellId}/capture/`)
  return data
}
