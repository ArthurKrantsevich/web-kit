import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>web-kit</h1>
      <p>Small web utilities. Everything runs in your browser.</p>
      <Link href="/about/">About</Link>
    </main>
  );
}
