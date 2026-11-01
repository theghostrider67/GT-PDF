import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tools } from "@/lib/tools";
import { toolSlug } from "@/lib/tool-routes";
import ToolWorkspace from "@/components/pdf/tool-workspace";

export const dynamicParams = false;
export function generateStaticParams() {
  return tools.map((tool) => ({ tool: toolSlug(tool) }));
}
export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = tools.find((item) => toolSlug(item) === slug);
  if (!tool) notFound();
  return { title: `${tool.name} — GHOST PDF`, description: tool.description };
}
export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params;
  const tool = tools.find((item) => toolSlug(item) === slug);
  if (!tool) notFound();
  return <ToolWorkspace key={tool.id} toolId={tool.id}/>;
}
