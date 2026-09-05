import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

// The home-page render never accesses D1. Provide the Workers env module
// when importing the built Worker under Node; API storage has separate tests.
register('data:text/javascript,' + encodeURIComponent(`
  export function resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') {
      return {url: 'data:text/javascript,export const env = {};', shortCircuit: true};
    }
    return nextResolve(specifier, context);
  }
`));

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /Бристоль/);
  assert.match(html, /assets\/background\.png/);
  assert.match(html, /lang="ru"/);
});
