import type { Tool } from "./tools";

export function toolSlug(tool: Pick<Tool, "name">) {
  return tool.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function toolPath(tool: Pick<Tool, "name">) {
  return `/tools/${toolSlug(tool)}/`;
}
