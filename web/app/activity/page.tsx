"use client"

import { Actions, Fills } from "@/components/feed"
import { useActions, useFills } from "@/lib/data"

export default function Activity() {
  const fills = useFills(undefined, 100)
  const actions = useActions(undefined, 100)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Market activity</h1>
        <p className="text-sm text-muted">
          Every trade and corporate action across RegX, read straight from Arkiv. The same data is available to any wallet, explorer or
          analytics app with one query, with no API key and no permission from us.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Fills fills={fills.data} loading={fills.isLoading} />
        <Actions actions={actions.data} loading={actions.isLoading} />
      </div>
    </div>
  )
}
