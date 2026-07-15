# Deploy

> **Stub.** This reference is a placeholder. The full deploy guides (GitHub Pages, Cloudflare) land in a later pass. What is here is the shared essential; the target-specific walk-throughs are not written yet.

## The shared essential

An RSPress site is a **static build**. `rspress build` writes plain HTML/CSS/JS to the configured `outDir` (default `dist/`); deploying is serving that directory from any static host. There is no server runtime to provision.

```bash
rspress build          # writes static output to outDir (dist/ by default)
```

Two site-wide settings matter before you deploy:

- **`base`** — set this in `rspress.config.ts` when the site is served from a sub-path (e.g. a project page at `https://user.github.io/repo/` needs `base: "/repo/"`). Getting it wrong is the usual cause of broken asset/link paths on a deployed site but not in local preview.
- **`siteUrl`** (if the plugin's Open Graph tags are in use) — the absolute site URL, set on the plugin options (see `plugin-config`), so OG/canonical URLs resolve.

## Planned targets (not yet written)

- **GitHub Pages** — build in CI, publish `outDir` to Pages; remember `base` for project pages.
- **Cloudflare** (Pages / Workers) — build command + output directory, custom domain.

Until these are filled in, deploy the built `outDir` the way you would any static site for your host, minding `base` for sub-path deploys.
