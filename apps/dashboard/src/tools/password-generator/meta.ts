import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "password-generator",
  title: "Password Generator",
  description: "Passwords, passphrases, PINs and pronounceable passwords from a secure random source, with their exact entropy.",
  preview: `passwordGenerator("…")
// → "…"`,
  category: "generators",
  tags: ["password-generator"],
  pkg: "@web-kit/password-generator",
  usage: `import { PasswordGenerator } from "@web-kit/password-generator";
import "@web-kit/password-generator/styles.css";

export function Page() {
  return <PasswordGenerator />;
}`,
  api: [
    {
      name: "passwordGenerator",
      signature: "passwordGenerator(input: string): Result<string>",
      description: "Passwords, passphrases, PINs and pronounceable passwords from a secure random source, with their exact entropy.",
    },
    {
      name: "PasswordGenerator",
      signature: "<PasswordGenerator initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
