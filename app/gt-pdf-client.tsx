"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Bookmark, Check, Ghost, LockKeyhole, Search, ShieldCheck, Sparkles, Workflow, X, Zap } from "lucide-react";
import { tools, categories, popularTools, toolCategory, type Tool, type ToolId, type Category } from "@/lib/tools";
import { toolPath } from "@/lib/tool-routes";
import { SiteHeader, SiteFooter } from "@/components/pdf/site-shell";

function ToolGlyph({ tool }: { tool: Tool }) {
  const officeLetter = tool.id.includes("word") ? "W" : tool.id.includes("powerpoint") ? "P" : tool.id.includes("excel") ? "X" : null;
  if (!officeLetter) return <span className={`tool-icon ${tool.color}`}><tool.Icon /></span>;
  const pdfFirst = tool.id.startsWith("pdf-");
  return <span className={`tool-icon office ${tool.color} ${pdfFirst ? "pdf-first" : "office-first"}`} aria-hidden="true">
    <span className="office-letter">{officeLetter}</span><span className="office-arrow">↘</span>
  </span>;
}

export default function GTPdfClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [favorites, setFavorites] = useState<ToolId[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (new URLSearchParams(window.location.search).get("search") === "1") searchInput.current?.focus();
      try {
        const saved = JSON.parse(localStorage.getItem("ghost-pdf-favorites") || "[]");
        if (Array.isArray(saved)) setFavorites(saved.filter((id): id is ToolId => tools.some((tool) => tool.id === id)));
      } catch { /* Saved tools are optional. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const filteredTools = useMemo(() => tools.filter((tool) => (category === "all" || toolCategory(tool.id) === category) && (!favoritesOnly || favorites.includes(tool.id)) && `${tool.name} ${tool.short} ${tool.description}`.toLowerCase().includes(query.toLowerCase().trim())), [query, category, favoritesOnly, favorites]);
  const toggleFavorite = (id: ToolId) => setFavorites((current) => {
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    try { localStorage.setItem("ghost-pdf-favorites", JSON.stringify(next)); } catch {}
    return next;
  });
  const focusSearch = useCallback(() => { searchInput.current?.focus(); document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" }); }, []);
  return <main id="top">
    <a className="skip-link" href="#tools">Skip to tools</a>
    <div className="ambient-light ambient-one" aria-hidden="true"/><div className="ambient-light ambient-two" aria-hidden="true"/>
    <SiteHeader onSearch={focusSearch}/>
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="status-dot"/> A little more effortless.</span><h1>Everything PDF.<br/><em>Beautifully simple.</em></h1><p>Big ideas deserve less busywork. Convert, edit, and protect your documents in one thoughtful workspace.</p><div className="hero-actions"><a className="primary-button" href="#tools">Find your tool <ArrowRight/></a><a className="text-link" href="#privacy"><ShieldCheck/> Yours. And only yours.</a></div><div className="hero-proof"><span><Check/> No account</span><span><Check/> Files stay local</span><span><Check/> Free to use</span></div></div>
      <div className="hero-experience" aria-label="Sample document conversion preview"><div className="hero-glow"/>
        <div className="floating-label label-private"><span className="mini-icon"><LockKeyhole/></span><div><strong>Private by design</strong><small>On your device. Always.</small></div><ShieldCheck/></div>
        <div className="sample-document"><div className="document-top"><span className="pdf-file-badge">PDF</span><span>Sample document</span><span>•••</span></div><div className="document-content"><span className="document-kicker">A clearer picture.</span><h3>Good ideas.<br/>Ready to go.</h3><div className="sample-lines"><i/><i/><i/></div><div className="sample-chart"><i/><i/><i/><i/><i/><i/><i/></div><div className="sample-document-foot"><span>Quarterly overview</span><span>01</span></div></div></div>
        <Link prefetch={false} className="converted-card" href={toolPath(tools.find((tool) => tool.id === "pdf-word")!)}><span className="word-file-badge">W</span><span><strong>From PDF. To possibility.</strong><small>Try PDF to Word <ArrowUpRight/></small></span><span className="conversion-check"><Check/></span></Link>
        <div className="floating-label label-tools"><span className="orbital-icon"><Sparkles/></span><div><strong>{tools.length} thoughtful tools</strong><small>One beautifully simple place.</small></div></div>
      </div>
    </section>
    <section className="quick-tools" aria-label="Popular tools"><span>Your everyday essentials</span><div>{popularTools.map((id) => { const tool = tools.find((item) => item.id === id)!; return <Link prefetch={false} key={id} href={toolPath(tool)}><tool.Icon/><span>{tool.name}</span><ArrowUpRight/></Link>; })}</div></section>
    <section className="tools-section" id="tools">
      <div className="section-heading"><div><span className="kicker">THE TOOLKIT</span><h2>Find your flow.</h2><p>One task or a whole to-do list. There’s a tool for that.</p></div><div className="tool-search"><Search/><input ref={searchInput} type="search" aria-label="Search PDF tools" placeholder="What would you like to do?" value={query} onChange={(event) => setQuery(event.target.value)}/>{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X/></button> : <kbd>⌘ K</kbd>}</div></div>
      <div className="tool-filter-row"><div className="category-tabs" role="tablist" aria-label="Tool categories">{categories.map((item) => <button type="button" key={item.id} role="tab" aria-selected={category === item.id && !favoritesOnly} className={category === item.id && !favoritesOnly ? "active" : ""} onClick={() => { setCategory(item.id); setFavoritesOnly(false); }}>{item.label}</button>)}</div><button type="button" className={`favorites-filter ${favoritesOnly ? "active" : ""}`} onClick={() => { setFavoritesOnly((current) => !current); setCategory("all"); }} aria-pressed={favoritesOnly}><Bookmark/> Saved <span>{favorites.length}</span></button></div>
      <p className="search-status" aria-live="polite">{filteredTools.length} {favoritesOnly ? "saved " : ""}tools{query ? ` matching “${query}”` : category === "all" ? " · all on your device" : ` · ${categories.find((item) => item.id === category)?.label}`}</p>
      <div className="tool-grid">{filteredTools.map((tool) => <article className="tool-tile" key={tool.id}><Link prefetch={false} className="tool-card" href={toolPath(tool)}><ToolGlyph tool={tool}/><span className="tool-card-copy"><strong className="tool-title">{tool.name}</strong><small>{tool.short}</small></span><ArrowUpRight className="tool-arrow"/></Link><button type="button" className={`favorite-button ${favorites.includes(tool.id) ? "saved" : ""}`} onClick={() => toggleFavorite(tool.id)} aria-label={`${favorites.includes(tool.id) ? "Unsave" : "Save"} ${tool.name}`} aria-pressed={favorites.includes(tool.id)}><Bookmark/></button></article>)}</div>
      {!filteredTools.length && <div className="empty-search"><Search/><h3>{favoritesOnly ? "Your favorites belong here." : "Let’s try another search."}</h3><p>{favoritesOnly ? "Tap a bookmark on any tool to save it for next time." : "Try “merge”, “Word”, “password”, or “pages”."}</p><button type="button" className="subtle-button" onClick={() => { setQuery(""); setCategory("all"); setFavoritesOnly(false); }}>Show all tools <ArrowRight/></button></div>}
    </section>
    <section className="how-it-works" id="how-it-works"><span className="kicker">A SIMPLE NEXT STEP</span><h2>Pick a tool. Make it happen.</h2><div>{[["01", "Find your tool", "Choose what you need from the toolkit."], ["02", "Open your workspace", "Each tool has its own page, ready for your files."], ["03", "Make it yours", "Adjust the options and download your result."]].map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="trust-section" id="privacy"><div className="trust-heading"><span className="kicker">BUILT AROUND YOU</span><h2>Your files.<br/><em>Your business.</em></h2><p>Powerful tools shouldn’t come at the cost of your privacy. Your documents are processed right in your browser, on your own device.</p></div><div className="trust-grid"><article className="trust-card trust-card-large"><div className="privacy-illustration"><div className="privacy-ring"/><span><ShieldCheck/></span><i/><i/></div><div><span className="kicker">PRIVATE BY DEFAULT</span><h3>What’s yours<br/>stays yours.</h3><p>No document uploads. No conversion server. Just you and your browser.</p></div></article><article className="trust-card"><span className="trust-icon"><Zap/></span><h3>Less friction.<br/>More flow.</h3><p>No sign-up. No daily usage cap. Save favorite tools and reusable workflows on this device.</p><span className="micro-label"><Check/> Ready when you are</span></article><article className="trust-card"><span className="trust-icon"><Workflow/></span><h3>A little smarter.<br/>A lot simpler.</h3><p>Live previews, visual editing, and clear options help you get it right the first time.</p><a href="#tools" className="text-link">Find your next tool <ArrowRight/></a></article></div></section>
    <section className="closing-note"><span className="brand-mark"><Ghost/></span><h2>Make room for<br/>what matters.</h2><a className="primary-button" href="#tools">Let’s get it done <ArrowRight/></a><p>{tools.length} tools. One less thing to worry about.</p></section>
    <SiteFooter/>
  </main>;
}
