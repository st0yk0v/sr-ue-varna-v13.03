/* Independent cross-check: find hook calls (useState/useRef/useMemo/useCallback/
 * useEffect) whose SYNCHRONOUS argument is a bare Identifier that is a const/let
 * declared LATER in the same function scope (the canonical TDZ crash pattern).
 * This re-derives the result via a different code path to validate the main audit. */
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const TARGET = process.argv[2] || 'js/components.js';
const code = fs.readFileSync(TARGET, 'utf8');
const ast = parser.parse(code, { sourceType: 'unambiguous', allowReturnOutsideFunction: true, plugins: ['jsx'] });

const HOOKS = { useState: 0, useRef: 0, useMemo: 1, useCallback: 1, useEffect: 0 };
// synchronous-position indices per hook: the arg evaluated now (not an arrow body)
const hits = [];

traverse(ast, {
  CallExpression(p) {
    const callee = p.node.callee;
    const name = callee.type === 'Identifier' ? callee.name :
                 (callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : null);
    if (!(name in HOOKS)) return;
    const syncIdx = HOOKS[name];
    const arg = p.node.arguments[syncIdx];
    if (!arg || arg.type !== 'Identifier') return; // only bare-identifier synchronous args
    // find enclosing function scope block
    const fnPath = p.getFunctionParent();
    if (!fnPath) return;
    const block = fnPath.node;
    // find a const/let binding with this name declared later in THIS scope
    const scope = p.scope.getBinding(arg.name);
    if (!scope) return;
    if (scope.kind !== 'let' && scope.kind !== 'const') return;
    const declLine = scope.path.node.loc.start.line;
    const refLine = p.node.loc.start.line;
    if (refLine < declLine) {
      hits.push({ hook: name, line: refLine, identifier: arg.name, declLine, fnStart: block.loc.start.line });
    }
  },
});

console.log('CROSS-CHECK: canonical hook-arg forward const/let refs =', hits.length);
hits.forEach(h => console.log(`  L${h.line} ${h.hook}(${h.identifier}) decl@L${h.declLine} in fn@L${h.fnStart}`));
