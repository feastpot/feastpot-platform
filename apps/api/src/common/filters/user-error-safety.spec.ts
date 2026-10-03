import { readFileSync, readdirSync } from 'fs';
import { resolve, relative } from 'path';
import { runInNewContext } from 'vm';

import { HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

import {
  createUserErrorMapper,
  DEFAULT_ERROR_MESSAGE,
} from '../../../../../packages/ui/src/lib/user-error';
import { ErrorIncidentsService } from '../../modules/error-incidents/error-incidents.service';
import { UserErrorFieldsInterceptor } from '../interceptors/user-error-fields.interceptor';

import { HttpExceptionFilter } from './http-exception.filter';
import { PrismaExceptionFilter, PrismaValidationFilter } from './prisma-exception.filter';
import { ThrottlerExceptionFilter } from './throttler-exception.filter';

const root = resolve(__dirname, '../../../../..');
const providerText =
  'SUPABASE_UUID_FAILURE: relation private_accounts does not exist\n at /srv/private/provider.ts:42';
const ref = 'FP-ABCD-1234';
const surfaces: Array<[string, string]> = [];

function errorRenderer(
  app: string,
  error: unknown,
  message: string,
  mapper: ReturnType<typeof createUserErrorMapper>,
) {
  let state: string | undefined;
  let mounted = false;
  let effect: (() => void) | undefined;
  const module = {
    exports: {} as { UserError: (props: { error: unknown; message: string }) => ReactElement },
  };
  const source = ts.transpileModule(
    readFileSync(resolve(root, `apps/${app}/src/lib/user-error.tsx`), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  runInNewContext(source, {
    exports: module.exports,
    require: (path: string) => {
      if (path === 'react')
        return {
          useState: (initial: string) => [
            state ?? initial,
            (value: string) => {
              state = value;
            },
          ],
          useEffect: (callback: () => void) => {
            if (!mounted) effect = callback;
          },
        };
      if (path.includes('user-error-message')) return { userErrorMessage: mapper };
      if (path.includes('ui/user-error')) return { DEFAULT_ERROR_MESSAGE };
      if (path === 'react/jsx-runtime') return require('react/jsx-runtime');
      throw new Error(`Unexpected component import ${path}`);
    },
  });
  return {
    render: () => renderToStaticMarkup(module.exports.UserError({ error, message })),
    mount: () => {
      mounted = true;
      effect?.();
    },
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
for (const app of ['web', 'vendor', 'admin']) {
  for (const path of walk(resolve(root, `apps/${app}/src`))) {
    if (/\.test\.|\.spec\./.test(path)) continue;
    const file = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'UserError') {
        const message = node.attributes.properties.find(
          (prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === 'message',
        ) as ts.JsxAttribute | undefined;
        surfaces.push([
          `${relative(root, path)}:${file.getLineAndCharacterOfPosition(node.pos).line + 1}`,
          message?.initializer && ts.isStringLiteral(message.initializer)
            ? message.initializer.text
            : DEFAULT_ERROR_MESSAGE,
        ]);
      }
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'userErrorMessage') {
        const message = node.arguments[1];
        surfaces.push([
          `${relative(root, path)}:${file.getLineAndCharacterOfPosition(node.pos).line + 1}`,
          message && ts.isStringLiteral(message) ? message.text : DEFAULT_ERROR_MESSAGE,
        ]);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
}

describe('Every mapped frontend failure state', () => {
  it('covers all three applications and the confirmed menu, analytics and payout screens', () => {
    expect(surfaces.length).toBeGreaterThan(150);
    for (const name of ['menu-list-client', 'analytics-client', 'payouts-client']) {
      expect(surfaces.some(([path]) => path.includes(`apps/vendor/`) && path.includes(name))).toBe(
        true,
      );
    }
    for (const app of ['web', 'vendor', 'admin']) {
      expect(surfaces.some(([path]) => path.includes(`apps/${app}/`))).toBe(true);
    }
  });
  it.each(surfaces)(
    '%s exposes only its stable message and acknowledged reference',
    async (_path, message) => {
      const report = jest.fn().mockResolvedValue(ref);
      const mapper = createUserErrorMapper(report);
      const error = new Error(providerText);
      expect(await mapper(error, message)).toBe(`${message} Ref: ${ref}`);
      expect(await mapper(error, message)).not.toContain('SUPABASE_UUID_FAILURE');
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0].detail).toContain('/srv/private/provider.ts:42');
      const app = _path.split('/')[1];
      const renderer = errorRenderer(app, error, message, mapper);
      expect(renderer.render()).not.toContain('SUPABASE_UUID_FAILURE');
      renderer.mount();
      await new Promise<void>((done) => setImmediate(done));
      const html = renderer.render();
      expect(html).toContain(`Ref: ${ref}`);
      expect(html).not.toContain('/srv/private/provider.ts');
      expect(html).not.toContain('private_accounts');
    },
  );
  it.each([null, '4121942664', 'FP-FAKE-REF', 'unpersisted'])(
    'never fabricates a reference for %s',
    async (reported) => {
      const message = await createUserErrorMapper(async () => reported)(new Error(providerText));
      expect(message).toContain('Support reference unavailable');
      expect(message).not.toContain('Ref:');
      expect(message).not.toContain('private_accounts');
    },
  );
  it.each(['web', 'vendor', 'admin'])(
    '%s error widget exits the loading state when reporting fails',
    async (app) => {
      const renderer = errorRenderer(
        app,
        new Error(providerText),
        'Could not load this page.',
        createUserErrorMapper(async () => null),
      );
      renderer.render();
      renderer.mount();
      await new Promise<void>((done) => setImmediate(done));
      expect(renderer.render()).toContain('Support reference unavailable');
      expect(renderer.render()).not.toContain('Recording support reference');
    },
  );
  it('handles synchronous and asynchronous reporting failures without escaping another exception', async () => {
    for (const report of [
      () => {
        throw new Error('reporting failed');
      },
      async () => {
        throw new Error('reporting failed');
      },
    ]) {
      expect(await createUserErrorMapper(report)(new Error(providerText))).toContain(
        'Support reference unavailable',
      );
    }
  });
  it('handles circular provider objects and bigint diagnostics', async () => {
    const body: Record<string, unknown> = { id: BigInt(42) };
    body.self = body;
    const report = jest.fn().mockResolvedValue(ref);
    const message = await createUserErrorMapper(report)({ message: providerText, body });
    expect(message).toContain(ref);
    expect(report.mock.calls[0][0].detail).toContain('[circular]');
  });
  it('reuses the API persisted reference instead of losing the original provider log', async () => {
    const report = jest.fn().mockResolvedValue('FP-EEEE-FFFF');
    const mapper = createUserErrorMapper(report);
    const error = new Error(providerText);
    mapper.acknowledge(error, ref);
    expect(await mapper(error)).toContain(ref);
    expect(report).not.toHaveBeenCalled();
  });
  it('does not send successful empty responses to error rendering', () => {
    for (const app of ['web', 'vendor', 'admin']) {
      const source = readFileSync(resolve(root, `apps/${app}/src/lib/api/client.ts`), 'utf8');
      expect(source).toContain('if (res.status === 204) return undefined as T;');
      expect(source).not.toMatch(/(?:body|data)\.length\s*===?\s*0[\s\S]{0,40}throw/);
    }
  });
  it('prevents raw exception message or stack rendering from returning to any JSX surface', () => {
    const leaks: string[] = [];
    for (const app of ['web', 'vendor', 'admin']) {
      for (const path of walk(resolve(root, `apps/${app}/src`))) {
        if (!path.endsWith('.tsx')) continue;
        const file = ts.createSourceFile(
          path,
          readFileSync(path, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        const visit = (node: ts.Node) => {
          if (ts.isJsxExpression(node) && node.expression) {
            const text = node.expression.getText(file);
            if (!/UserError|errors[.?[]|formState|fieldState/.test(text)) {
              const inspect = (child: ts.Node) => {
                if (
                  ts.isPropertyAccessExpression(child) &&
                  /^(message|stack|stacktrace)$/.test(child.name.text) &&
                  /(?:error|err|cause|caught)\b/i.test(child.expression.getText(file))
                ) {
                  leaks.push(relative(root, path));
                }
                ts.forEachChild(child, inspect);
              };
              inspect(node.expression);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe('API error persistence and private diagnostics', () => {
  const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  afterAll(() => log.mockRestore());
  it.each([400, 401, 403, 404, 409, 422, 429, 500, 502, 503])(
    'sanitizes HTTP %i including provider text wrapped as an HttpException',
    async (status) => {
      const incidents = { create: jest.fn().mockResolvedValue({ ref }) };
      const response = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        getHeader: jest.fn(),
      };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({ method: 'GET', url: '/v1/compliance' }),
        }),
      };
      await new HttpExceptionFilter(incidents as never).catch(
        new HttpException({ code: 'UPLOAD_FAILED', message: providerText }, status),
        host as never,
      );
      const body = response.json.mock.calls[0][0];
      expect(body.statusCode).toBe(status);
      expect(body.ref).toBe(ref);
      expect(JSON.stringify(body)).not.toContain('private_accounts');
      expect(JSON.stringify(body)).not.toContain('/srv/private');
      expect(incidents.create.mock.calls[0][0].detail).toContain(providerText.split('\n')[0]);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ ref, event: 'http_exception' }));
    },
  );
  it('reports missing persistence honestly and avoids recursive incident failures', async () => {
    const incidents = { create: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/v1/orders' }),
      }),
    };
    await new HttpExceptionFilter(incidents as never).catch(new Error(providerText), host as never);
    expect(response.json.mock.calls[0][0].ref).toBeNull();
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('private_accounts');
  });
  it.each(['P2025', 'P2002', 'P2003', 'P2014', 'P2016', 'P9999'])(
    'persists Prisma %s without exposing metadata',
    async (code) => {
      const incidents = { create: jest.fn().mockResolvedValue({ ref }) };
      const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({ url: '/v1/orders' }),
        }),
      };
      await new PrismaExceptionFilter(incidents as never).catch(
        new Prisma.PrismaClientKnownRequestError(providerText, {
          code,
          clientVersion: '6',
          meta: { table: 'private_accounts' },
        }),
        host as never,
      );
      expect(response.json.mock.calls[0][0].ref).toBe(ref);
      expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('private_accounts');
      expect(incidents.create.mock.calls[0][0].detail).toContain('SUPABASE_UUID_FAILURE');
    },
  );
  it('persists Prisma validation and throttler errors, keeping Retry-After', async () => {
    const incidents = { create: jest.fn().mockResolvedValue({ ref }) };
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      getHeader: () => '17',
      setHeader: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/v1/orders' }),
      }),
    };
    await new PrismaValidationFilter(incidents as never).catch(
      new Prisma.PrismaClientValidationError(providerText, { clientVersion: '6' }),
      host as never,
    );
    expect(response.json.mock.calls[0][0].ref).toBe(ref);
    await new ThrottlerExceptionFilter(incidents as never).catch(
      new ThrottlerException(),
      host as never,
    );
    expect(response.json.mock.calls[1][0]).toMatchObject({ statusCode: 429, retryAfter: 17, ref });
  });
  it('logs full redacted detail with the same reference only after insertion and lookup stays safe', async () => {
    const prisma = {
      errorIncident: {
        create: jest.fn().mockImplementation(({ data }) => ({ ...data, createdAt: new Date() })),
        findUnique: jest.fn(),
      },
    };
    const service = new ErrorIncidentsService(prisma as never);
    const incident = await service.create(
      {
        app: 'vendor',
        route: '/menu',
        message: providerText,
        detail: `${providerText} {"client_secret":"hidden-credential"}`,
      },
      null,
    );
    expect(incident.ref).toMatch(/^FP-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(prisma.errorIncident.create.mock.invocationCallOrder[0]).toBeLessThan(
      log.mock.invocationCallOrder.at(-1)!,
    );
    const event = log.mock.calls.at(-1)![0] as { ref: string; detail: string };
    expect(event.ref).toBe(incident.ref);
    expect(event.detail).toContain('/srv/private/provider.ts:42');
    expect(event.detail).not.toContain('hidden-credential');
    prisma.errorIncident.findUnique.mockResolvedValue(incident);
    const found = await service.findByRef(incident.ref);
    expect(found?.ref).toBe(incident.ref);
    expect(found?.message).not.toContain('SUPABASE_UUID_FAILURE');
  });
  it('does not log a fabricated persisted reference when insertion fails', async () => {
    const prisma = {
      errorIncident: { create: jest.fn().mockRejectedValue(new Error('insert failed')) },
    };
    const before = log.mock.calls.length;
    await expect(
      new ErrorIncidentsService(prisma as never).create(
        { app: 'vendor', route: '/menu', message: providerText },
        null,
      ),
    ).rejects.toThrow('insert failed');
    expect(log.mock.calls.length).toBe(before);
  });
  it.each(['error', 'errorMessage', 'failedReason', 'lastError', 'failureReason'])(
    'sanitizes historical %s on successful API responses without losing its private reference',
    async (field) => {
      const incidents = { create: jest.fn().mockResolvedValue({ ref }) };
      const interceptor = new UserErrorFieldsInterceptor(incidents as never);
      const source = {
        [field]: providerText,
        stack: '/srv/private/provider.ts:42',
        stacktrace: ['private_accounts'],
      };
      const result = (await interceptor.sanitize(
        { rows: [source] },
        '/v1/admin/dead-letters',
        null,
      )) as { rows: Array<Record<string, unknown>> };
      expect(result.rows[0].errorRef).toBe(ref);
      expect(String(result.rows[0][field])).toContain(ref);
      expect(JSON.stringify(result)).not.toContain('private_accounts');
      expect(JSON.stringify(result)).not.toContain('stacktrace');
      expect(source.stack).toContain('/srv/private');
      expect(incidents.create.mock.calls[0][0].detail).toContain('/srv/private/provider.ts:42');
      await interceptor.sanitize(source, '/v1/admin/dead-letters', null);
      expect(incidents.create).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps empty datasets and null/empty failure fields as successful empty states with no incident', async () => {
    const incidents = { create: jest.fn() };
    const interceptor = new UserErrorFieldsInterceptor(incidents as never);
    for (const value of [
      [],
      null,
      { rows: [], lastError: null },
      { items: [], error: '', total: 0 },
    ]) {
      expect(await interceptor.sanitize(value, '/v1/vendors/menu', null)).toEqual(value);
    }
    expect(incidents.create).not.toHaveBeenCalled();
  });
  it('cannot claim a saved reference for historical failures when reporting is unavailable', async () => {
    const incidents = { create: jest.fn().mockRejectedValue(new Error('DB down')) };
    const result = await new UserErrorFieldsInterceptor(incidents as never).sanitize(
      { failedReason: providerText },
      '/v1/admin/dead-letters',
      null,
    );
    expect(JSON.stringify(result)).toContain('Support reference unavailable');
    expect(JSON.stringify(result)).not.toContain('SUPABASE_UUID_FAILURE');
  });
});
