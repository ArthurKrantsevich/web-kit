import { EmptyState } from "@web-kit/ui";
import Link from "next/link";

/** The page for an unknown address (404.html in the export): short, so the footer sits at the bottom of the window. */
export default function NotFound() {
  return (
    <EmptyState
      icon="search"
      title="This page does not exist"
      action={
        <Link className="wk-ui-button wk-ui-button--outline" href="/">
          See all tools
        </Link>
      }
    >
      The address may be mistyped, or the page has moved.
    </EmptyState>
  );
}
