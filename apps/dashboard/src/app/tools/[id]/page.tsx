import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToolTabs } from "@/components/ToolTabs";
import { getTool, tools } from "@/registry";

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
      <Link href="/" className="back">
        ← All utilities
      </Link>
      <header className="tool__header">
        <span className="badge">{tool.category}</span>
        <h1>{tool.title}</h1>
        <p>{tool.description}</p>
      </header>
      <ToolTabs tool={tool} />
    </article>
  );
}
