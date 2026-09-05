import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

import ts from 'typescript';

import {
  NOTIFICATION_EVENT_NAMES,
  NOTIFICATION_EVENTS,
  TEMPLATE_NOTIFICATION_EVENT_NAMES,
} from './notification-events';
import { NotificationProcessor } from './notification.processor';
import { TEMPLATES } from './templates';

describe('notification event registry contract', () => {
  it('has one explicit registered handler for every accepted name', () => {
    expect(NOTIFICATION_EVENT_NAMES).toHaveLength(54);
    const processorSource = readFileSync(resolve(__dirname, 'notification.processor.ts'), 'utf8');
    expect(processorSource).toContain('for (const eventName of NOTIFICATION_EVENT_NAMES)');
    expect(processorSource).toContain('Process({ name: eventName, concurrency: 30 })');
    expect(processorSource).not.toMatch(/@Process\(\{\s*concurrency:\s*30\s*\}\)/);
  });

  it('keeps production producers, registry names, and handlers aligned in both directions', () => {
    const apiSource = resolve(__dirname, '../..');
    const files: string[] = [];
    const visitDirectory = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) visitDirectory(path);
        else if (entry.name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(entry.name)) {
          files.push(path);
        }
      }
    };
    visitDirectory(apiSource);

    const producerNames = new Set<string>();
    const literalProducers: string[] = [];
    const allowedDynamicBoundaries = new Set([
      'modules/admin/admin.controller.ts:dto.event',
      'modules/orders/orders.service.ts:name',
    ]);
    const dynamicBoundaries = new Set<string>();

    for (const file of files) {
      const sourceText = readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
      const relativeFile = file.slice(apiSource.length + 1);

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          const receiver = node.expression.expression.getText(source);
          let eventArgumentIndex: number | undefined;

          if (method === 'safeEnqueue') eventArgumentIndex = 0;
          else if (method === 'enqueue' && receiver.includes('notifications')) {
            eventArgumentIndex = 0;
          } else if (
            method === 'add' &&
            (receiver.includes('notifications') ||
              (relativeFile.endsWith('vendors/vendors.service.ts') && receiver.endsWith('queue')))
          ) {
            eventArgumentIndex = 0;
          } else if (
            method === 'createTransactionalOutbox' ||
            method === 'dispatchTransactionalOutbox'
          ) {
            eventArgumentIndex = 1;
          }

          if (eventArgumentIndex !== undefined) {
            const argument = node.arguments[eventArgumentIndex];
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            if (
              argument &&
              ts.isPropertyAccessExpression(argument) &&
              argument.expression.getText(source) === 'NotificationEvent'
            ) {
              producerNames.add(argument.name.text);
            } else if (argument && ts.isStringLiteral(argument)) {
              literalProducers.push(`${relativeFile}:${line}:${argument.text}`);
            } else if (argument) {
              dynamicBoundaries.add(`${relativeFile}:${argument.getText(source)}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    const expectedProductionProducers = NOTIFICATION_EVENT_NAMES.filter(
      (name) =>
        !('productionProducer' in NOTIFICATION_EVENTS[name]) ||
        NOTIFICATION_EVENTS[name].productionProducer !== false,
    ).sort();

    expect(literalProducers).toEqual([]);
    expect([...dynamicBoundaries].sort()).toEqual([...allowedDynamicBoundaries].sort());
    expect([...producerNames].sort()).toEqual(expectedProductionProducers);

    const registeredHandlers = new Set(
      Object.getOwnPropertyNames(NotificationProcessor.prototype)
        .filter((name) => name.startsWith('handle_'))
        .map((name) => name.slice('handle_'.length)),
    );
    expect([...registeredHandlers].sort()).toEqual([...NOTIFICATION_EVENT_NAMES].sort());
  });

  it('keeps template-backed registry entries and template renderers in lockstep', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...TEMPLATE_NOTIFICATION_EVENT_NAMES].sort());
    for (const name of NOTIFICATION_EVENT_NAMES) {
      expect(NOTIFICATION_EVENTS[name].templateBacked).toBe(name in TEMPLATES);
    }
  });
});
