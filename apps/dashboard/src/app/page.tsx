import { ToolGrid } from "@/components/ToolGrid";
import { tools } from "@/registry";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>web-kit</h1>
        <p>Small web utilities as React + TypeScript packages. Use them here, or add them to your app.</p>
      </section>
      <ToolGrid tools={tools} />
    </>
  );
}
