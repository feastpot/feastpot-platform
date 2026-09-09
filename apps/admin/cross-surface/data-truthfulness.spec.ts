import { expect, test } from '@playwright/test';
import { parse } from '@typescript-eslint/parser';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');
const contracts = JSON.parse(source('scripts/cross-surface-consistency.manifest.json'))
  .truthfulness as {
  percentageConsumers: string[];
  percentageDisplayExclusions: Array<{ path: string; expression: string; reason: string }>;
  idDisplayExclusions: Array<{ path: string; expression: string; reason: string }>;
  auditActorExclusions: Array<{ action: string; reason: string }>;
};

type Node = {
  type?: string;
  range?: [number, number];
  loc?: { start: { line: number } };
  [key: string]: unknown;
};

function filesBelow(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(path) : entry.isFile() ? [path] : [];
  });
}

function ast(path: string): Node {
  return parse(source(path), {
    comment: false,
    jsx: true,
    loc: true,
    range: true,
    sourceType: 'module',
    filePath: path,
  }) as Node;
}

function children(node: Node): Node[] {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === 'parent' || key === 'tokens' || key === 'comments') return [];
    if (Array.isArray(value)) return value.filter((item): item is Node => !!item?.type);
    return value && typeof value === 'object' && 'type' in value ? [value as Node] : [];
  });
}

function descendants(node: Node): Node[] {
  return [node, ...children(node).flatMap(descendants)];
}

function text(path: string, node: Node): string {
  const range = node.range;
  return range ? source(path).slice(range[0], range[1]) : '';
}

function propertyName(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name as string;
  if (node.type === 'Literal') return String(node.value);
  return undefined;
}

function memberPath(node: Node | undefined): string[] {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name as string];
  if (node.type !== 'MemberExpression') return [];
  return [...memberPath(node.object as Node), propertyName(node.property as Node) ?? ''];
}

function objectProperty(object: Node | undefined, name: string): Node | undefined {
  if (object?.type !== 'ObjectExpression') return undefined;
  const property = (object.properties as Node[]).find(
    (candidate) => candidate.type === 'Property' && propertyName(candidate.key as Node) === name,
  );
  return property?.value as Node | undefined;
}

function formatRatioCalls(path: string): Node[] {
  return formatRatioCallsInNode(ast(path));
}

function formatRatioCallsInNode(node: Node): Node[] {
  return descendants(node).filter(
    (node) => node.type === 'CallExpression' && propertyName(node.callee as Node) === 'formatRatio',
  );
}

function auditCreates(path: string): Node[] {
  return descendants(ast(path)).filter((node) => {
    if (node.type !== 'CallExpression') return false;
    const callee = node.callee as Node;
    return (
      callee.type === 'MemberExpression' &&
      memberPath(callee).slice(-2).join('.') === 'auditLog.create'
    );
  });
}

function barePercentageDisplays(path: string): Array<{ expression: string; line?: number }> {
  const found: Array<{ expression: string; line?: number }> = [];
  for (const element of descendants(ast(path)).filter((node) => node.type === 'JSXElement')) {
    const elementChildren = element.children as Node[];
    for (let index = 0; index < elementChildren.length - 1; index += 1) {
      const container = elementChildren[index];
      const following = elementChildren[index + 1];
      if (
        container.type === 'JSXExpressionContainer' &&
        following.type === 'JSXText' &&
        /^\s*%/.test(String(following.value))
      ) {
        found.push({
          expression: text(path, container.expression as Node).replace(/\s+/g, ' '),
          line: container.loc?.start.line,
        });
      }
    }
  }
  for (const attribute of descendants(ast(path)).filter(
    (node) => node.type === 'JSXAttribute' && propertyName(node.name as Node) !== 'style',
  )) {
    const expression = (attribute.value as Node)?.expression as Node | undefined;
    if (
      expression?.type === 'TemplateLiteral' &&
      (expression.quasis as Node[]).some((quasi) =>
        String((quasi.value as Node)?.raw).includes('%'),
      )
    ) {
      found.push({
        expression: text(path, expression).replace(/\s+/g, ' '),
        line: attribute.loc?.start.line,
      });
    }
  }
  return found;
}

function literalAction(data: Node | undefined): string | undefined {
  const action = objectProperty(data, 'action');
  return action?.type === 'Literal' && typeof action.value === 'string' ? action.value : undefined;
}

test('D1: every rendered admin percentage has an explicit denominator contract', () => {
  const formatterPath = 'apps/admin/src/lib/format-ratio.ts';
  const formatterAst = ast(formatterPath);
  const formatterFunction = descendants(formatterAst).find(
    (node) =>
      node.type === 'FunctionDeclaration' && propertyName(node.id as Node) === 'formatRatio',
  );
  expect(formatterFunction, 'formatRatio must remain a parsed function declaration').toBeTruthy();

  const parameters = (formatterFunction!.params as Node[]).map(propertyName);
  expect(parameters.slice(0, 2)).toEqual(['numerator', 'denominator']);

  const discoveredConsumers = filesBelow('apps/admin/src')
    .filter((path) => path.endsWith('.tsx') && formatRatioCalls(path).length > 0)
    .sort();
  expect(contracts.percentageConsumers.slice().sort()).toEqual(discoveredConsumers);

  for (const consumer of discoveredConsumers) {
    for (const call of formatRatioCalls(consumer)) {
      const args = call.arguments as Node[];
      expect(
        args.length,
        `${consumer}:${call.loc?.start.line} omits its denominator`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        args[1]?.type,
        `${consumer}:${call.loc?.start.line} has no denominator expression`,
      ).toBeTruthy();
    }
  }

  const declaredExclusions = new Map(
    contracts.percentageDisplayExclusions.map(({ path, expression, reason }) => [
      `${path}::${expression}`,
      reason,
    ]),
  );
  for (const [display, reason] of declaredExclusions) {
    expect(reason.trim().length, `${display} needs a meaningful exclusion reason`).toBeGreaterThan(
      20,
    );
  }
  const seen = new Set<string>();
  const uncontracted: string[] = [];
  for (const path of filesBelow('apps/admin/src').filter((file) => file.endsWith('.tsx'))) {
    for (const display of barePercentageDisplays(path)) {
      const key = `${path}::${display.expression}`;
      if (declaredExclusions.has(key)) seen.add(key);
      else uncontracted.push(`${path}:${display.line} (${display.expression})`);
    }
  }
  expect(
    uncontracted,
    `bare percentage displays without a denominator:\n${uncontracted.join('\n')}`,
  ).toEqual([]);
  expect(
    [...declaredExclusions.keys()].filter((key) => !seen.has(key)),
    'stale percentage exclusions',
  ).toEqual([]);
});

test('D2: zero-denominator metrics render neutrally rather than green success', () => {
  const formatterPath = 'apps/admin/src/lib/format-ratio.ts';
  const functionNode = descendants(ast(formatterPath)).find(
    (node) =>
      node.type === 'FunctionDeclaration' && propertyName(node.id as Node) === 'formatRatio',
  )!;
  const zeroGuard = descendants(functionNode).find((node) => {
    if (node.type !== 'IfStatement') return false;
    const testNode = node.test as Node;
    const consequent = node.consequent as Node;
    return (
      testNode.type === 'BinaryExpression' &&
      memberPath(testNode.left as Node).join('.') === 'denominator' &&
      ['<=', '===', '=='].includes(testNode.operator as string) &&
      text(formatterPath, consequent).includes('No data yet')
    );
  });
  expect(
    zeroGuard,
    'formatRatio must return neutral copy for a non-positive denominator',
  ).toBeTruthy();
  const statusFunction = descendants(ast(formatterPath)).find(
    (node) =>
      node.type === 'FunctionDeclaration' && propertyName(node.id as Node) === 'ratioStatusClass',
  );
  const statusReturn = descendants(statusFunction!).find((node) => node.type === 'ReturnStatement');
  expect(
    statusReturn &&
      text(formatterPath, statusReturn).includes('denominator > 0') &&
      text(formatterPath, statusReturn).includes('neutralClass'),
    'ratioStatusClass must choose the success class only for a positive denominator',
  ).toBeTruthy();

  const unsafe: string[] = [];
  const percentageExclusions = new Set(
    contracts.percentageDisplayExclusions.map(({ path, expression }) => `${path}::${expression}`),
  );
  for (const path of filesBelow('apps/admin/src').filter((file) => file.endsWith('.tsx'))) {
    const fileAst = ast(path);
    const greenFunctions = new Set(
      descendants(fileAst)
        .filter(
          (node) =>
            ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
              node.type ?? '',
            ) && /\b(?:text|bg)-(?:green|emerald)-/.test(text(path, node)),
        )
        .map((node) => propertyName(node.id as Node))
        .filter((name): name is string => !!name),
    );

    for (const element of descendants(fileAst).filter((node) => node.type === 'JSXElement')) {
      const opening = element.openingElement as Node;
      const elementNodes = descendants(element);
      const ratioCalls = elementNodes.filter(
        (node) =>
          node.type === 'CallExpression' && propertyName(node.callee as Node) === 'formatRatio',
      );
      const percentStyle = descendants(opening).some(
        (node) =>
          node.type === 'JSXAttribute' &&
          propertyName(node.name as Node) === 'style' &&
          text(path, node).includes('%'),
      );
      const elementChildren = element.children as Node[];
      const directPercent = elementChildren.some((container, index) => {
        const following = elementChildren[index + 1];
        if (
          container.type !== 'JSXExpressionContainer' ||
          following?.type !== 'JSXText' ||
          !/^\s*%/.test(String(following.value))
        ) {
          return false;
        }
        const expression = text(path, container.expression as Node).replace(/\s+/g, ' ');
        return !percentageExclusions.has(`${path}::${expression}`);
      });
      if (ratioCalls.length === 0 && !percentStyle && !directPercent) continue;

      const openingText = text(path, opening);
      const invokesGreenFunction = descendants(opening).some(
        (node) =>
          node.type === 'CallExpression' &&
          greenFunctions.has(propertyName(node.callee as Node) ?? ''),
      );
      if (!/\b(?:text|bg)-(?:green|emerald)-/.test(openingText) && !invokesGreenFunction) {
        continue;
      }

      const statusCalls = descendants(opening).filter(
        (node) =>
          node.type === 'CallExpression' &&
          propertyName(node.callee as Node) === 'ratioStatusClass',
      );
      if (statusCalls.length !== 1) {
        unsafe.push(
          `${path}:${element.loc?.start.line} does not couple its green class to a ratio`,
        );
        continue;
      }

      const statusDenominator = (statusCalls[0].arguments as Node[])[0];
      const statusNames = [
        memberPath(statusDenominator).at(-1),
        ...descendants(statusDenominator)
          .filter((node) => node.type === 'MemberExpression')
          .map((node) => memberPath(node).at(-1)),
      ].filter((name): name is string => !!name);
      const expectedNames = ratioCalls.map(
        (call) =>
          memberPath((call.arguments as Node[])[1]).at(-1) ??
          text(path, (call.arguments as Node[])[1]),
      );

      if (percentStyle) {
        const styleIdentifiers = descendants(opening)
          .filter((node) => node.type === 'Identifier')
          .map((node) => String(node.name));
        const enclosingFunction = descendants(fileAst)
          .filter(
            (node) =>
              ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
                node.type ?? '',
              ) &&
              node.range![0] <= element.range![0] &&
              node.range![1] >= element.range![1],
          )
          .sort((a, b) => a.range![1] - a.range![0] - (b.range![1] - b.range![0]))[0];
        for (const declaration of descendants(enclosingFunction ?? fileAst).filter(
          (node) =>
            node.type === 'VariableDeclarator' &&
            styleIdentifiers.includes(propertyName(node.id as Node) ?? ''),
        )) {
          for (const division of descendants(declaration.init as Node).filter(
            (node) => node.type === 'BinaryExpression' && node.operator === '/',
          )) {
            expectedNames.push(
              memberPath(division.right as Node).at(-1) ?? text(path, division.right as Node),
            );
          }
        }
        // Server-provided percentages are paired with their displayed
        // formatRatio denominator in the nearest containing JSX section.
        if (expectedNames.length === 0) {
          const containing = descendants(fileAst)
            .filter(
              (node) =>
                node.type === 'JSXElement' &&
                node.range![0] <= element.range![0] &&
                node.range![1] >= element.range![1] &&
                formatRatioCallsInNode(node).length > 0,
            )
            .sort((a, b) => a.range![1] - a.range![0] - (b.range![1] - b.range![0]))[0];
          for (const call of containing ? formatRatioCallsInNode(containing) : []) {
            expectedNames.push(
              memberPath((call.arguments as Node[])[1]).at(-1) ??
                text(path, (call.arguments as Node[])[1]),
            );
          }
        }
      }

      if (!expectedNames.some((name) => statusNames.includes(name))) {
        unsafe.push(
          `${path}:${element.loc?.start.line} guards with ${statusNames.join('/')}, not ${expectedNames.join('/') || 'the metric denominator'}`,
        );
      }
    }
  }
  expect(
    unsafe,
    `green percentage metrics without a zero-denominator guard:\n${unsafe.join('\n')}`,
  ).toEqual([]);
});

test('D3: administrative records prefer a human name over an available UUID', () => {
  const failures: string[] = [];
  const exclusions = new Map(
    contracts.idDisplayExclusions.map(({ path, expression, reason }) => [
      `${path}::${expression}`,
      reason,
    ]),
  );
  for (const [display, reason] of exclusions) {
    expect(reason.trim().length, `${display} needs a meaningful exclusion reason`).toBeGreaterThan(
      20,
    );
  }
  const seenExclusions = new Set<string>();
  for (const path of filesBelow('apps/admin/src').filter((file) => file.endsWith('.tsx'))) {
    const fileAst = ast(path);
    const parents = new Map<Node, Node>();
    for (const node of descendants(fileAst)) {
      for (const child of children(node)) parents.set(child, node);
    }
    const allMembers = descendants(fileAst).filter((node) => node.type === 'MemberExpression');
    for (const container of descendants(fileAst).filter(
      (node) => node.type === 'JSXExpressionContainer',
    )) {
      const expression = container.expression as Node;
      // Collection callbacks commonly use an ID as a React key and render a
      // name in a separate descendant. Only inspect actual fallback choices.
      if (
        !['LogicalExpression', 'ConditionalExpression', 'TemplateLiteral'].includes(
          expression.type ?? '',
        ) ||
        descendants(expression).some((node) => node.type === 'JSXElement')
      ) {
        continue;
      }
      const properties = descendants(expression)
        .filter((node) => node.type === 'MemberExpression')
        .map((node) => ({ name: propertyName(node.property as Node), start: node.range![0] }));
      const id = properties.find(({ name }) =>
        /^(?:actor|customer|user|vendor)Id$/.test(name ?? ''),
      );
      const human = properties.find(({ name }) =>
        /^(?:businessName|displayName|fullName|name|email)$/.test(name ?? ''),
      );
      if (id && human && id.start < human.start) {
        failures.push(
          `${path}:${container.loc?.start.line} renders ${id.name} before ${human.name}`,
        );
      }

      const parent = parents.get(container);
      const isRenderedChild = parent?.type === 'JSXElement';
      const isRenderedValue =
        parent?.type === 'JSXAttribute' &&
        ['value', 'title', 'label', 'description'].includes(
          propertyName(parent.name as Node) ?? '',
        );
      if (!isRenderedChild && !isRenderedValue) continue;

      let standalone = expression;
      while (
        ['ChainExpression', 'TSAsExpression', 'TSNonNullExpression'].includes(standalone.type ?? '')
      ) {
        standalone = standalone.expression as Node;
      }
      if (
        standalone.type === 'CallExpression' &&
        propertyName((standalone.callee as Node)?.property as Node) === 'slice'
      ) {
        standalone = (standalone.callee as Node).object as Node;
      }
      if (standalone.type !== 'MemberExpression') continue;
      const idPath = memberPath(standalone);
      if (!/(?:Id|UUID|Uuid)$/.test(idPath.at(-1) ?? '')) continue;

      const key = `${path}::${text(path, expression).replace(/\s+/g, ' ')}`;
      const rootName = idPath[0];
      const humanAvailable = allMembers.some((member) => {
        const candidate = memberPath(member);
        return (
          candidate[0] === rootName &&
          /^(?:businessName|displayName|fullName|name|email)$/.test(candidate.at(-1) ?? '')
        );
      });
      if (exclusions.has(key) && !humanAvailable) {
        seenExclusions.add(key);
        continue;
      }
      failures.push(
        `${path}:${container.loc?.start.line} renders standalone ${text(path, expression)}${
          humanAvailable
            ? ' although a human-readable relation is available'
            : ' without an exclusion'
        }`,
      );
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
  expect([...exclusions.keys()].filter((key) => !seenExclusions.has(key))).toEqual([]);
});

test('D4: test-created records carry an isolated, distinguishable namespace', () => {
  const workflow = source('.github/workflows/ci.yml');
  const namespaces = [...workflow.matchAll(/TEST_FACTORY_NAMESPACE:\s*([^\n]+)/g)].map((match) =>
    match[1].trim(),
  );
  expect(namespaces.length, 'CI has no test-factory namespaces').toBeGreaterThan(0);
  for (const namespace of namespaces) {
    expect(namespace, `${namespace} is not isolated to a workflow attempt`).toMatch(
      /^[a-z][a-z-]*-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}$/,
    );
  }
  expect(new Set(namespaces).size, 'CI surfaces must not share a factory namespace').toBe(
    namespaces.length,
  );

  const factory = source('scripts/test-factory/index.ts');
  for (const identityFunction of ['stateEmail', 'slug', 'orderNumber', 'deterministicExternalId']) {
    const declaration = descendants(ast('scripts/test-factory/index.ts')).find(
      (node) =>
        node.type === 'FunctionDeclaration' && propertyName(node.id as Node) === identityFunction,
    );
    expect(declaration, `missing factory identity function ${identityFunction}`).toBeTruthy();
    const params = (declaration!.params as Node[]).map(propertyName);
    expect(params, `${identityFunction} must accept the namespace`).toContain('namespace');
    expect(text('scripts/test-factory/index.ts', declaration!), identityFunction).toContain(
      'safeKey(namespace)',
    );
  }
  expect(factory).toContain('@test.feastpot.co.uk');
});

test('D5: every privileged action writes its supplied actor to the audit log', () => {
  const apiFiles = filesBelow('apps/api/src')
    .filter(
      (path) =>
        path.endsWith('.ts') &&
        !path.endsWith('.spec.ts') &&
        !path.endsWith('.test.ts') &&
        auditCreates(path).length > 0,
    )
    .sort();
  const exclusions = new Map(
    contracts.auditActorExclusions.map(({ action, reason }) => [action, reason]),
  );
  for (const [action, reason] of exclusions) {
    expect(reason.trim().length, `audit exclusion ${action} needs a justification`).toBeGreaterThan(
      20,
    );
  }

  const seenExclusions = new Set<string>();
  const failures: string[] = [];
  for (const path of apiFiles) {
    for (const call of auditCreates(path)) {
      const options = (call.arguments as Node[])[0];
      const data = objectProperty(options, 'data');
      const actor = objectProperty(data, 'actorId');
      const action = literalAction(data);
      const location = `${path}:${call.loc?.start.line}`;
      if (!actor) {
        failures.push(`${location} has no actorId property`);
      } else if (actor.type === 'Literal' && actor.value === null) {
        if (action && exclusions.has(action)) seenExclusions.add(action);
        else failures.push(`${location} (${action ?? 'dynamic action'}) has a null actor`);
      } else if (
        actor.type === 'Identifier' &&
        ['undefined', 'null'].includes(String(actor.name))
      ) {
        failures.push(`${location} (${action ?? 'dynamic action'}) has no supplied actor`);
      }
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
  expect([...exclusions.keys()].filter((action) => !seenExclusions.has(action))).toEqual([]);
});
