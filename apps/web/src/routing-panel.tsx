import type { RoutingConfig, RoutingMode } from "./api"

export function RoutingPanel(props: {
  readonly routing: RoutingConfig
  readonly isBusy: boolean
  readonly onModeChange: (mode: RoutingMode) => void
}): React.ReactElement {
  return (
    <section className="panel routing-panel" aria-label="Account routing">
      <div className="panel-title">
        <h2>Routing</h2>
        <p>{props.routing.mode === "priority" ? "Priority first" : "Least recently used"}</p>
      </div>
      <fieldset className="segmented-control" aria-label="Routing mode">
        <button
          type="button"
          aria-pressed={props.routing.mode === "round_robin"}
          disabled={props.isBusy}
          onClick={() => props.onModeChange("round_robin")}
        >
          Round robin
        </button>
        <button
          type="button"
          aria-pressed={props.routing.mode === "priority"}
          disabled={props.isBusy}
          onClick={() => props.onModeChange("priority")}
        >
          Priority
        </button>
      </fieldset>
    </section>
  )
}
