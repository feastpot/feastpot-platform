#!/usr/bin/env ts-node
/**
 * Static link audit. This intentionally examines source only: it does not
 * start Next.js or make network requests, so CI can run it deterministically.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import * as ts from 'typescript';

export const ROOT = join(__dirname, '..');
export const APP_CONFIGS = [
  { name: 'web', dir: 'apps/web', hosts: ['feastpot.co.uk', 'www.feastpot.co.uk'] },
  { name: 'vendor', dir: 'apps/vendor', hosts: ['vendor.feastpot.co.uk'] },
  { name: 'admin', dir: 'apps/admin', hosts: ['admin.feastpot.co.uk'] },
] as const;

export interface LinkRef {
  href: string;
  file: string;
  line: number;
  kind: 'jsx' | 'navigation';
}

export interface RouteInfo {
  route: string;
  file: string;
  ids: Set<string>;
}

export interface AuditResult {
  routes: Map<string, RouteInfo>;
  broken: Array<LinkRef & { reason: string }>;
  externalWarnings: Array<LinkRef & { reason: string }>;
  mailboxes: LinkRef[];
  internalOk: number;
}

export type AppName = (typeof APP_CONFIGS)[number]['name'];
export type LiveBaseUrls = Record<AppName, string>;

export interface LiveCheck {
  url: string;
  finalUrl: string;
  status: number;
  error?: string;
}

export type FetchLike = (
  input: string,
  init: { redirect: 'manual'; signal: AbortSignal },
) => Promise<{ status: number; headers: { get(name: string): string | null } }>;

function walk(dir: string, predicate: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

function sourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function literalText(node: ts.Expression | ts.JsxAttributeValue | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node) && node.expression) return literalText(node.expression);
  return undefined;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function collectLiteralIds(source: ts.SourceFile): Set<string> {
  const ids = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'id') {
      const id = literalText(node.initializer);
      if (id) ids.add(id);
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source).replace(/['"]/g, '') === 'id' &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      ids.add(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return ids;
}

/** Discover App Router pages and the literal HTML ids declared in each page source. */
export function buildRouteMap(appDir: string, root = ROOT): Map<string, RouteInfo> {
  const appRoot = join(root, appDir, 'src', 'app');
  const routes = new Map<string, RouteInfo>();
  for (const file of walk(appRoot, (path) => /[/\\]page\.tsx?$/.test(path))) {
    let path = relative(appRoot, file)
      .replace(/\\/g, '/')
      .replace(/(^|\/)page\.tsx?$/, '');
    path = path
      .split('/')
      .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
      .join('/');
    const route = path ? `/${path}` : '/';
    const ids = new Set<string>();
    // Pages commonly render a sibling *-client component. Read literal ids
    // from that route directory without letting nested child routes leak in.
    for (const candidate of readdirSync(dirname(file), { withFileTypes: true })) {
      if (!candidate.isFile() || !/\.(?:ts|tsx)$/.test(candidate.name)) continue;
      const source = sourceFile(join(dirname(file), candidate.name));
      for (const id of collectLiteralIds(source)) ids.add(id);
    }
    routes.set(route, { route, file, ids });
  }
  return routes;
}

export function routeForPath(
  pathname: string,
  routes: Map<string, RouteInfo>,
): RouteInfo | undefined {
  const bare = pathname.split('?')[0]!.split('#')[0] || '/';
  const exact = routes.get(bare);
  if (exact) return exact;
  for (const [pattern, route] of routes) {
    if (!pattern.includes('[')) continue;
    const expression =
      '^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\[[^\]]+\]/g, '[^/]+') + '$';
    if (new RegExp(expression).test(bare)) return route;
  }
  return undefined;
}

/** Extract literal JSX Link/a href values plus router/window navigation calls. */
export function extractLinkRefs(appDir: string, root = ROOT): LinkRef[] {
  const srcDir = join(root, appDir, 'src');
  const refs: LinkRef[] = [];
  for (const file of walk(srcDir, (path) => /\.(?:ts|tsx)$/.test(path))) {
    const source = sourceFile(file);
    const add = (href: string, node: ts.Node, kind: LinkRef['kind']) =>
      refs.push({ href, file, line: lineOf(source, node), kind });
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningLikeElement(node)) {
        const tag = node.tagName.getText(source);
        if (tag === 'a' || tag === 'Link') {
          const href = node.attributes.properties.find(
            (attribute): attribute is ts.JsxAttribute =>
              ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'href',
          );
          const value = literalText(href?.initializer);
          if (value !== undefined) add(value, href!, 'jsx');
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression.getText(source);
        const method = node.expression.name.text;
        const isNavigation =
          (receiver === 'window' && method === 'open') ||
          (receiver === 'window.location' && ['assign', 'replace'].includes(method)) ||
          (receiver === 'router' && ['push', 'replace'].includes(method));
        const value = isNavigation ? literalText(node.arguments[0]) : undefined;
        if (value !== undefined) add(value, node.arguments[0]!, 'navigation');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return refs;
}

export function internalTarget(
  href: string,
  currentApp: AppName,
): { app: AppName; pathname: string; hash: string } | undefined {
  if (href.startsWith('/')) {
    const [pathname, hash = ''] = href.split('#');
    return { app: currentApp, pathname: pathname || '/', hash };
  }
  try {
    const url = new URL(href);
    const app = APP_CONFIGS.find((config) =>
      (config.hosts as readonly string[]).includes(url.hostname),
    )?.name;
    return app ? { app, pathname: url.pathname || '/', hash: url.hash.slice(1) } : undefined;
  } catch {
    return undefined;
  }
}

function flagValue(flag: string, args: readonly string[]): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * Live mode deliberately requires all three local bases. Production hosts are
 * never fetched: Feastpot hostnames are mapped to these supplied local bases.
 */
export function getLiveBaseUrls(
  env: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = process.argv,
): LiveBaseUrls {
  const value = (app: AppName, port: number) =>
    flagValue(`--${app}-base-url`, args) ??
    flagValue(`--${app}-url`, args) ??
    env[`LINK_AUDIT_${app.toUpperCase()}_BASE_URL`] ??
    env[`LINK_AUDIT_${app.toUpperCase()}_URL`] ??
    `http://127.0.0.1:${port}`;
  return {
    web: value('web', 3000),
    vendor: value('vendor', 3002),
    admin: value('admin', 3003),
  };
}

/** Convert an internal source href into its local live-server URL. */
export function resolveLiveUrl(
  href: string,
  currentApp: AppName,
  bases: LiveBaseUrls,
): string | undefined {
  const target = internalTarget(href, currentApp);
  if (!target) return undefined;
  const sourceUrl = href.startsWith('/')
    ? new URL(href, bases[target.app as AppName])
    : new URL(href);
  const local = new URL(bases[target.app as AppName]);
  local.pathname = sourceUrl.pathname;
  local.search = sourceUrl.search;
  local.hash = '';
  return local.toString();
}

function isAllowedLiveUrl(url: URL, bases: LiveBaseUrls): boolean {
  return Object.values(bases).some((base) => new URL(base).origin === url.origin);
}

/** Request one internal URL with a bounded, configured-origin-only redirect chain. */
export async function checkLiveUrl(
  url: string,
  bases: LiveBaseUrls,
  request: FetchLike = fetch as unknown as FetchLike,
  maxRedirects = 10,
): Promise<LiveCheck> {
  let current = new URL(url);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await request(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location)
          return {
            url,
            finalUrl: current.toString(),
            status: response.status,
            error: 'redirect has no Location header',
          };
        const next = new URL(location, current);
        if (!isAllowedLiveUrl(next, bases)) {
          return {
            url,
            finalUrl: next.toString(),
            status: response.status,
            error: 'redirect left configured internal bases',
          };
        }
        current = next;
        continue;
      }
      return response.status >= 400
        ? {
            url,
            finalUrl: current.toString(),
            status: response.status,
            error: `HTTP ${response.status}`,
          }
        : { url, finalUrl: current.toString(), status: response.status };
    } catch (error) {
      return {
        url,
        finalUrl: current.toString(),
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    url,
    finalUrl: current.toString(),
    status: 0,
    error: `too many redirects (>${maxRedirects})`,
  };
}

/** Gather unique local URLs for every statically extracted internal target. */
export function collectLiveTargets(
  root = ROOT,
  bases = getLiveBaseUrls(),
  appFilter?: AppName,
): string[] {
  const targets = new Set<string>();
  for (const app of APP_CONFIGS.filter((candidate) => !appFilter || candidate.name === appFilter)) {
    for (const ref of extractLinkRefs(app.dir, root)) {
      const url = resolveLiveUrl(ref.href, app.name, bases);
      if (url) targets.add(url);
    }
  }
  return [...targets].sort();
}

export async function auditLiveTargets(
  targets: readonly string[],
  bases: LiveBaseUrls,
  request?: FetchLike,
  concurrency = 3,
): Promise<LiveCheck[]> {
  const results = new Array<LiveCheck>(targets.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < targets.length) {
      const index = nextIndex++;
      results[index] = await checkLiveUrl(targets[index]!, bases, request);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), targets.length) }, () => worker()),
  );
  return results;
}

/**
 * Read sidebar destinations from the canonical vendor SideNav source instead
 * of maintaining a stale duplicate list. This includes nested destinations.
 */
export function getVendorSidebarTargets(root = ROOT): string[] {
  const file = join(root, 'apps/vendor/src/components/layout/side-nav.tsx');
  if (!existsSync(file)) return [];
  const source = sourceFile(file);
  const targets = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'href') {
      const value = literalText(node.initializer);
      if (value?.startsWith('/')) targets.add(value);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'href') {
      const value = literalText(node.initializer);
      if (value?.startsWith('/')) targets.add(value);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...targets].sort();
}

export function auditApp(
  app: (typeof APP_CONFIGS)[number],
  root = ROOT,
  appConfigs = APP_CONFIGS,
): AuditResult {
  const routeMaps = new Map(
    appConfigs.map((config) => [config.name, buildRouteMap(config.dir, root)]),
  );
  const result: AuditResult = {
    routes: routeMaps.get(app.name)!,
    broken: [],
    externalWarnings: [],
    mailboxes: [],
    internalOk: 0,
  };
  const appWideIds = new Set<string>();
  for (const file of walk(join(root, app.dir, 'src'), (path) => /\.(?:ts|tsx)$/.test(path))) {
    for (const id of collectLiteralIds(sourceFile(file))) appWideIds.add(id);
  }
  for (const ref of extractLinkRefs(app.dir, root)) {
    if (!ref.href) continue;
    if (ref.href.startsWith('#')) {
      const hash = decodeURIComponent(ref.href.slice(1));
      if (!hash || appWideIds.has(hash)) {
        result.internalOk++;
      } else {
        result.broken.push({ ...ref, reason: `no literal id="${hash}" in ${app.name} source` });
      }
      continue;
    }
    if (ref.href.startsWith('mailto:') || ref.href.startsWith('tel:')) {
      result.mailboxes.push(ref);
      continue;
    }
    const target = internalTarget(ref.href, app.name);
    if (!target) {
      if (/^https?:\/\//.test(ref.href)) {
        result.externalWarnings.push({
          ...ref,
          reason: 'external URL; static scan does not check runtime status',
        });
      }
      continue;
    }
    const route =
      routeMaps.get(target.app)?.get(target.pathname) ??
      routeForPath(target.pathname, routeMaps.get(target.app)!);
    if (!route) {
      result.broken.push({ ...ref, reason: `no ${target.app} route for ${target.pathname}` });
    } else if (target.hash && !route.ids.has(decodeURIComponent(target.hash))) {
      result.broken.push({
        ...ref,
        reason: `no literal id="${decodeURIComponent(target.hash)}" on target route`,
      });
    } else {
      result.internalOk++;
    }
  }
  if (app.name === 'vendor') {
    for (const href of getVendorSidebarTargets(root)) {
      if (!routeForPath(href, result.routes)) {
        result.broken.push({
          href,
          file: join(root, 'apps/vendor/src/components/layout/side-nav.tsx'),
          line: 1,
          kind: 'jsx',
          reason: 'vendor sidebar destination has no route',
        });
      }
    }
  }
  return result;
}

export async function runLinkAudit(
  options: { root?: string; app?: string; live?: boolean; bases?: LiveBaseUrls } = {},
): Promise<number> {
  const root = options.root ?? ROOT;
  const appFlagIndex = process.argv.indexOf('--app');
  const appFilter =
    options.app ?? (appFlagIndex === -1 ? undefined : process.argv[appFlagIndex + 1]);
  const live = options.live ?? process.argv.includes('--live');
  const apps = APP_CONFIGS.filter((app) => !appFilter || app.name === appFilter);
  let broken = 0;
  console.log('Feastpot static link audit (no HTTP/runtime checks)');
  for (const app of apps) {
    const result = auditApp(app, root);
    console.log(
      `\n[${app.name.toUpperCase()}] ${result.routes.size} routes, ${result.internalOk} internal links`,
    );
    for (const failure of result.broken) {
      console.log(
        `  ✗ ${relative(root, failure.file)}:${failure.line} → ${failure.href} (${failure.reason})`,
      );
    }
    if (result.mailboxes.length)
      console.log(`  ℹ ${result.mailboxes.length} mailto/tel link(s) skipped`);
    if (result.externalWarnings.length)
      console.log(`  ⚠ ${result.externalWarnings.length} external URL(s) reported, not fetched`);
    broken += result.broken.length;
  }
  if (live) {
    const bases = options.bases ?? getLiveBaseUrls();
    const checks = await auditLiveTargets(
      collectLiveTargets(root, bases, appFilter as AppName | undefined),
      bases,
    );
    const failures = checks.filter((check) => check.error);
    console.log(`\n[LIVE] requested ${checks.length} unique internal target(s)`);
    for (const failure of failures) {
      console.log(
        `  ✗ ${failure.url} → ${failure.finalUrl} (${failure.error ?? `HTTP ${failure.status}`})`,
      );
    }
    broken += failures.length;
  }
  console.log(
    broken
      ? `\n✗ FAIL: ${broken} broken internal link(s)`
      : live
        ? '\n✓ PASS: zero broken internal links (static and live)'
        : '\n✓ PASS: zero broken static links',
  );
  return broken;
}

if (require.main === module) {
  runLinkAudit().then((count) => {
    process.exitCode = count ? 1 : 0;
  });
}
