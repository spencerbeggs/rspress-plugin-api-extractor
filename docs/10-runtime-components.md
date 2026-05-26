# Runtime components

The plugin ships a set of React components under the `rspress-plugin-api-extractor/runtime` export. They render the pieces of an API page: signatures, member blocks, parameter tables, enum tables and example code blocks. The generated pages import them for you, so on most sites you never touch them directly. This guide covers what they are, how they render and the one feature you author by hand — live `with-api` code blocks.

## How rendering works

Every runtime component is dual-mode. In the browser it renders interactive UI — syntax-highlighted code with Twoslash hover tooltips, wrap and copy buttons, sortable tables. When RSPress builds the static markdown files used for LLM consumption, the same component emits clean markdown instead. One component, two outputs, chosen at build time. RSPress has to compile the components in both modes, so the `./runtime` export points at source and the package ships that source. That is what lets the dual-mode switch resolve correctly during the site build.

## The exported components

| Component | Renders |
| --- | --- |
| `SignatureBlock` | A signature code block with a heading and a wrap toggle. |
| `MemberSignature` | A class/interface member signature block. |
| `ExampleBlock` | An example code block with copy and wrap toggles. |
| `ApiSignature` / `ApiMember` / `ApiExample` | Dual-mode wrappers the generated pages use. |
| `ParametersTable` | A parameter documentation table. |
| `EnumMembersTable` | An enum member/value table. |

The `ApiSignature`, `ApiMember` and `ApiExample` wrappers expect a pre-highlighted code tree that the plugin injects into the generated MDX at build time. That injection happens in the generation pipeline, so you do not place these by hand in your own pages — the plugin emits them for you. The prop types are exported (`ApiSignatureProps`, `ApiMemberProps`, `ApiExampleProps`, `ParametersTableProps`, `Parameter`, `EnumMembersTableProps`, `EnumMember`, `SignatureBlockProps`, `MemberSignatureProps`, `ExampleBlockProps`) for typed customization if you wrap or extend them.

```ts
import type {
  ParametersTableProps,
  Parameter,
} from "rspress-plugin-api-extractor/runtime";
```

## Live examples in your own guides

The feature you write by hand is the `with-api` code block. Mark a TypeScript fence with `with-api` and, inside a hand-written guide, the plugin highlights it against your documented package's types, adds Twoslash hover tooltips and cross-links type references — the same treatment the generated pages get:

````markdown
```typescript with-api
import { Codecs, JsonSource } from "my-library";

const json = Codecs.json({ id: 1, name: "Alice" });
//    ^?

const source = new JsonSource("./data/records.json");
const stream = Codecs.streaming(source);
//    ^?
```
````

Inside a `with-api` block you can use the usual Twoslash directives:

- `//    ^?` on its own line reveals the inferred type of the expression above the caret.
- `// @highlight` marks the following line as highlighted.
- `// @errors: 2322` annotates expected compiler errors so an intentional error renders cleanly instead of failing the build.

Because the block is type-checked, an import or call that does not match your package's real API shows up as a Twoslash error during the build. That is the point: the examples in your prose stay honest as the API changes.

## Styling

The components theme through CSS custom properties, with light and dark variants. To restyle them, override those properties in your site's CSS rather than fork the components. The code-block colors follow the Shiki `theme` you set in the plugin config, so that `theme` field is the simplest lever.

## Next steps

- [Configuration](./02-configuration.md) — the `theme` option that drives code-block colors.
- [Single package](./04-single-package.md) — supplying `tsconfig` so `with-api` blocks type-check.
- [Troubleshooting](./11-troubleshooting.md) — what to do about Twoslash errors in examples.
