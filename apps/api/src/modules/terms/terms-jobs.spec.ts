import { readFileSync } from 'fs';
import { resolve } from 'path';
import ts from 'typescript';

import { TERMS_NOTICE_JOB_NAMES } from './terms-jobs';

describe('terms notice job registry contract', () => {
  it('keeps queue producers and explicit handlers aligned in both directions', () => {
    const files = ['terms.service.ts', 'terms-notice.processor.ts'];
    const producers = new Set<string>();
    const handlers = new Set<string>();
    const literals: string[] = [];
    const aliases: Record<string, string> = {
      SEND_TERMS_NOTICES_JOB: 'send_terms_notices',
      GENERATE_ACCEPTANCE_PDF_JOB: 'generate_acceptance_pdf',
      DEEMED_ACCEPTANCE_CRON_JOB: 'deemed_acceptance_sweep',
    };

    const resolveName = (node: ts.Expression, source: ts.SourceFile): string | undefined => {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(source) === 'TERMS_NOTICE_JOBS'
      ) {
        return node.name.text;
      }
      if (ts.isIdentifier(node)) return aliases[node.text];
      if (ts.isStringLiteral(node)) return node.text;
      return undefined;
    };

    for (const filename of files) {
      const path = resolve(__dirname, filename);
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'add' &&
            node.expression.expression.getText(source).endsWith('noticesQueue')
          ) {
            const argument = node.arguments[0];
            const name = argument && resolveName(argument, source);
            if (name) producers.add(name);
            if (argument && ts.isStringLiteral(argument)) literals.push(name!);
          }
          if (ts.isIdentifier(node.expression) && node.expression.text === 'Process') {
            const argument = node.arguments[0];
            const name = argument && resolveName(argument, source);
            if (name) handlers.add(name);
            if (argument && ts.isStringLiteral(argument)) literals.push(name!);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(literals).toEqual([]);
    expect([...producers].sort()).toEqual([...TERMS_NOTICE_JOB_NAMES].sort());
    expect([...handlers].sort()).toEqual([...TERMS_NOTICE_JOB_NAMES].sort());
  });
});
