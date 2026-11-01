"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Ghost, Menu, Moon, Search, Sun, X } from "lucide-react";
import { tools, type Tool } from "@/lib/tools";
import { toolPath } from "@/lib/tool-routes";

export function SiteHeader({ onSearch }: { onSearch?: () => void }) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const selectTool = useCallback((tool: Tool) => router.push(toolPath(tool)), [router]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("ghost-pdf-theme");
        const next = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light";
      } catch {}
    });
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); if (onSearch) onSearch(); else router.push("/?search=1#tools");
      }
      if (event.key === "Escape") setMobileMenu(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", shortcut); };
  }, [onSearch, router]);
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: { toolId?: string }) => Promise<object> }, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(modelContext.registerTool({
        name: "choose_ghost_pdf_tool",
        title: "Choose a GHOST PDF tool",
        description: "Open one of GHOST PDF's visible local document tools so the user can add files.",
        inputSchema: { type: "object", properties: { toolId: { type: "string", enum: tools.map((tool) => tool.id) } }, required: ["toolId"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const selected = tools.find((tool) => tool.id === input.toolId);
          if (!selected) throw new Error("Unknown PDF tool.");
          selectTool(selected);
          return { selectedTool: selected.id, status: "ready_for_local_files" };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* WebMCP is optional. */ }
    return () => lifecycle.abort();
  }, [selectTool]);

  const toggleTheme = () => { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light"; try { localStorage.setItem("ghost-pdf-theme", next ? "dark" : "light"); } catch {} };
  return <header className="site-header">
    <Link prefetch={false} className="brand" href="/" aria-label="GHOST PDF home"><span className="brand-mark"><Ghost size={22}/></span><span>GHOST <b>PDF</b></span></Link>
    <nav className={mobileMenu ? "nav-links open" : "nav-links"} aria-label="Main navigation"><Link prefetch={false} href="/#tools" onClick={() => setMobileMenu(false)}>All tools</Link><Link prefetch={false} href="/#how-it-works" onClick={() => setMobileMenu(false)}>How it works</Link><Link prefetch={false} href="/#privacy" onClick={() => setMobileMenu(false)}>Privacy</Link></nav>
    <div className="header-actions">{onSearch ? <button type="button" className="header-search" aria-label="Search tools" onClick={onSearch}><Search/><kbd>⌘ K</kbd></button> : <Link prefetch={false} href="/?search=1#tools" className="header-search" aria-label="Search tools"><Search/><kbd>⌘ K</kbd></Link>}<button type="button" className="icon-button theme-button" onClick={toggleTheme} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <Sun/> : <Moon/>}</button><Link prefetch={false} className="header-cta" href="/#tools">All tools <ArrowUpRight/></Link><button type="button" className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="Toggle navigation" aria-expanded={mobileMenu}>{mobileMenu ? <X/> : <Menu/>}</button></div>
  </header>;
}
export function SiteFooter() {
  return <footer><div className="footer-top"><Link prefetch={false} className="brand" href="/"><span className="brand-mark"><Ghost/></span><span>GHOST <b>PDF</b></span></Link><p>A clearer way to work with documents.</p><div><Link prefetch={false} href="/#tools">All tools</Link><Link prefetch={false} href="/#how-it-works">How it works</Link><Link prefetch={false} href="/#privacy">Privacy</Link></div></div><div className="footer-bottom"><small>© {new Date().getFullYear()} GHOST PDF</small><span><span className="status-dot"/> Thoughtfully made. Privately processed.</span><a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/third-party-notices.txt`}>Acknowledgements</a></div></footer>;
}
