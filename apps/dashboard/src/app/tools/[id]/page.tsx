import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToolTabs } from "@/components/ToolTabs";
import { CATEGORY_LABELS, getTool, tools } from "@/registry";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((tool) => ({ id: tool.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).id);
  return tool ? { title: `${tool.title} · web-kit`, description: tool.description } : {};
}

export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).id);
  if (!tool) notFound();

  return (
    <article className="tool">
      <ToolTabs
        tool={tool}
        header={
          <>
            <nav aria-label="Breadcrumb" className="crumbs">
              <ol>
                <li>
                  <Link href="/">Tools</Link>
                </li>
                {/* The category has no page of its own; the current page is the tool, named by the heading. */}
                <li>{CATEGORY_LABELS[tool.category]}</li>
              </ol>
            </nav>
            <h1>{tool.title}</h1>
          </>
        }
      />
    </article>
  );
}
