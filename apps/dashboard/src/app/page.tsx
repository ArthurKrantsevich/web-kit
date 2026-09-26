import { ToolGrid } from "@/components/ToolGrid";
import { tools, upcoming } from "@/registry";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Open-source utilities</p>
        <h1>Small, careful tools that run in your browser.</h1>
        <p className="hero__lead">
          Use them here, or add them to your app as React packages. The same tools are built with Flutter.
        </p>
      </section>
      <ToolGrid tools={tools} upcoming={upcoming} />
    </>
  );
}
