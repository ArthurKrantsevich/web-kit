import type { PlopTypes } from "@turbo/gen";

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("utility", {
    description: "Add a utility: an npm package plus its dashboard page",
    prompts: [
      {
        type: "input",
        name: "id",
        message: "Utility id (kebab-case, e.g. base64):",
        validate: (value: string) => KEBAB.test(value) || "Use kebab-case: lowercase letters, digits and dashes",
      },
      { type: "input", name: "title", message: "Title (e.g. Base64):" },
      { type: "list", name: "category", message: "Category:", choices: ["data", "generators", "media"] },
      { type: "input", name: "description", message: "One-line description:" },
    ],
    actions: [
      {
        type: "addMany",
        destination: "{{ turbo.paths.root }}/packages/{{ id }}",
        base: "templates/package",
        templateFiles: "templates/package/**/*.hbs",
        stripExtensions: ["hbs"],
      },
      {
        type: "addMany",
        destination: "{{ turbo.paths.root }}/apps/dashboard/src/tools/{{ id }}",
        base: "templates/tool",
        templateFiles: "templates/tool/*.hbs",
        stripExtensions: ["hbs"],
      },
      {
        type: "append",
        path: "{{ turbo.paths.root }}/apps/dashboard/src/registry.ts",
        pattern: "// generator:meta-imports",
        template: 'import { meta as {{ camelCase id }} } from "./tools/{{ id }}/meta";',
      },
      {
        type: "append",
        path: "{{ turbo.paths.root }}/apps/dashboard/src/registry.ts",
        pattern: "// generator:metas",
        template: "  {{ camelCase id }},",
      },
      {
        type: "append",
        path: "{{ turbo.paths.root }}/apps/dashboard/src/tools/demos.tsx",
        pattern: "// generator:demos",
        template: '  "{{ id }}": dynamic(() => import("./{{ id }}/demo")),',
      },
      {
        type: "modify",
        path: "{{ turbo.paths.root }}/apps/dashboard/package.json",
        pattern: /("dependencies": \{\n)/,
        template: '$1    "@web-kit/{{ id }}": "workspace:*",\n',
      },
    ],
  });
}
