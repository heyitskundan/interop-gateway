import { useCallback, useState } from "react";
import { Changelog } from "./Changelog.js";
import { Connector } from "./Connector.js";
import { Core } from "./Core.js";
import { Engine } from "./Engine.js";
import { GettingStarted } from "./GettingStarted.js";
import { Mcp } from "./Mcp.js";
import { Protocol } from "./Protocol.js";
import { Secrets } from "./Secrets.js";
import {
  changelogRail,
  connectorRail,
  coreRail,
  engineRail,
  gettingStartedRail,
  mcpRail,
  protocolRail,
  secretsRail,
  type RailItem,
} from "./rails.js";

type PageId =
  | "getting-started"
  | "core"
  | "protocol"
  | "secrets"
  | "connector"
  | "engine"
  | "mcp"
  | "changelog";

const NAV: { group: string; items: { id: PageId; label: string }[] }[] = [
  {
    group: "Docs",
    items: [{ id: "getting-started", label: "Getting Started" }],
  },
  {
    group: "Packages",
    items: [
      { id: "core", label: "Core" },
      { id: "protocol", label: "Protocol" },
      { id: "secrets", label: "Secrets" },
      { id: "connector", label: "Connector" },
      { id: "engine", label: "Engine" },
      { id: "mcp", label: "MCP" },
    ],
  },
  { group: "Project", items: [{ id: "changelog", label: "Changelog" }] },
];

const RAILS: Record<PageId, RailItem[]> = {
  "getting-started": gettingStartedRail,
  core: coreRail,
  protocol: protocolRail,
  secrets: secretsRail,
  connector: connectorRail,
  engine: engineRail,
  mcp: mcpRail,
  changelog: changelogRail,
};

/**
 * The whole docs experience, hand-authored per page rather than parsed from markdown at
 * runtime — a curated sidebar switches between them, with a per-page "on this page" anchor
 * rail on the right. Each installable package (core/protocol/secrets/connector/engine/mcp)
 * gets its own tab, with install-through-usage steps for that package only. Anchor clicks
 * scroll within the page rather than setting window.location.hash, since App.tsx's own
 * hash-based view router would otherwise mistake an in-page jump for a navigation away from
 * the Docs view. The live translator itself lives in the Translator tab, not here.
 */
export function Docs() {
  const [page, setPage] = useState<PageId>("getting-started");

  const goTo = useCallback((id: PageId) => {
    setPage(id);
    window.scrollTo(0, 0);
  }, []);

  const scrollToSection = useCallback((href: string) => {
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const rail = RAILS[page];

  return (
    <div
      className="mx-auto grid gap-6 px-4 py-8 sm:px-6 lg:px-8"
      style={{
        maxWidth: 1280,
        gridTemplateColumns: "minmax(160px,220px) minmax(0,1fr) minmax(140px,200px)",
      }}
    >
      <aside className="sticky flex flex-col gap-6 self-start" style={{ top: "5rem" }}>
        {NAV.map((section) => (
          <div key={section.group}>
            <div className="text-muted mb-2 text-[11px] tracking-wide uppercase">
              {section.group}
            </div>
            <div className="flex flex-col gap-2.5 text-[17px]">
              {section.items.map((item) => (
                <a
                  key={item.id}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(item.id);
                  }}
                  aria-current={page === item.id ? "page" : undefined}
                  style={
                    page === item.id ? { color: "var(--color-accent)", fontWeight: 600 } : undefined
                  }
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </aside>

      <main className="docs-content min-w-0">
        {page === "getting-started" && <GettingStarted goPackages={() => goTo("core")} />}
        {page === "core" && <Core />}
        {page === "protocol" && <Protocol />}
        {page === "secrets" && <Secrets />}
        {page === "connector" && <Connector />}
        {page === "engine" && <Engine />}
        {page === "mcp" && <Mcp />}
        {page === "changelog" && <Changelog />}
      </main>

      {rail.length > 0 && (
        <aside className="sticky self-start" style={{ top: "5rem" }}>
          <div className="text-muted mb-2 text-[11px] tracking-wide uppercase">On this page</div>
          <div className="flex flex-col gap-1 text-sm">
            {rail.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.href);
                }}
                style={item.indent ? { paddingLeft: "var(--space-3)", fontSize: 12 } : undefined}
              >
                {item.label}
              </a>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
