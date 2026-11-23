// Compatibility gate for journal scripts. Two levels:
//   page - everything that must run on every phone, incl. old iPhones (Safari/WKWebView 14+):
//          journal.js, story-frames.js, dolina.js, inline scripts of index.html
//   3d   - live 3D code, which the light mode keeps off iOS below 16 (Safari 16.0+):
//          three.js, loaders, viewers
// Fails on syntax the level cannot parse (a parse error kills the whole file in the browser)
// and on built-ins it does not have. Usage: node compat_check.mjs <root> ; exit code 1 on problems.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const root = process.argv[2] || '.';
const LEVELS = {
  // Safari 14.0: no private class members, no top-level await, no static blocks, no lookbehind,
  // no regex /d, no Array#at, Object.hasOwn, structuredClone, findLast (15.4)
  page: {name: 'Safari 14', noPrivate: true, noTLA: true, apis: ['withResolvers', 'groupBy', 'fromAsync', 'isWellFormed', 'toWellFormed', 'structuredClone', 'findLast', 'findLastIndex', 'hasOwn', 'toSorted', 'toReversed', 'toSpliced'], atCalls: true, regexD: true},
  // Safari 16.0: no static blocks (16.4), no lookbehind (16.4), no regex /v (17), no Promise.withResolvers /
  // Object.groupBy / Map.groupBy (17.4), no Array.fromAsync (17), no String#isWellFormed (16.4)
  '3d': {name: 'Safari 16.0', apis: ['withResolvers', 'groupBy', 'fromAsync', 'isWellFormed', 'toWellFormed']}
};

function filesFor(level) {
  const L = [];
  const add = (p) => { const f = path.join(root, p); if (fs.existsSync(f)) L.push(f); };
  if (level === 'page') {
    ['js/journal.js', 'js/story-frames.js', 'js/dolina.js', 'wabi-sabi/page.js'].forEach(add);
  } else {
    const dir = path.join(root, 'js/viewer');
    const rec = d => fs.existsSync(d) && fs.readdirSync(d, {withFileTypes: true}).forEach(e => {
      const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else if (p.endsWith('.js')) L.push(p);
    });
    rec(dir);
    add('assets/dolina/review/viewer.js'); add('assets/dolina/review/drawings.js'); add('wabi-sabi/viewer.js');
  }
  return L;
}
function inlineScripts(htmlFile) {
  if (!fs.existsSync(htmlFile)) return [];
  const s = fs.readFileSync(htmlFile, 'utf8'), out = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(s))) {
    if (/type="(application\/(ld\+)?json|importmap)"/.test(m[1])) continue;
    const line = s.slice(0, m.index).split('\n').length;
    out.push({file: htmlFile + ':' + line, code: m[2], module: /type="module"/.test(m[1])});
  }
  return out;
}

function check(code, file, lv, module) {
  const L = LEVELS[lv], problems = [];
  let ast;
  try { ast = acorn.parse(code, {ecmaVersion: 'latest', sourceType: module ? 'module' : 'script', locations: true, allowHashBang: true}); }
  catch (e) { try { ast = acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module', locations: true}); } catch (e2) { return [`parse error: ${e2.message}`]; } }
  const at = n => `${file}:${n.loc.start.line}:${n.loc.start.column}`;
  walk.full(ast, n => {
    if (n.type === 'StaticBlock') problems.push(`${at(n)} class static block { } (Safari 16.4+)`);
    if (L.noPrivate && n.type === 'PrivateIdentifier') problems.push(`${at(n)} private class member #${n.name} (Safari 15+)`);
    if (n.type === 'Literal' && n.regex) {
      const {pattern, flags} = n.regex;
      if (/\(\?<[=!]/.test(pattern)) problems.push(`${at(n)} regex lookbehind (Safari 16.4+)`);
      if (flags.includes('v')) problems.push(`${at(n)} regex flag v (Safari 17+)`);
      if (L.regexD && flags.includes('d')) problems.push(`${at(n)} regex flag d (Safari 15+)`);
    }
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') {
      const p = n.property.name;
      if (L.apis.includes(p) && !(p === 'groupBy' && false)) problems.push(`${at(n)} .${p} (newer than ${L.name})`);
    }
    if (L.atCalls && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.name === 'at') problems.push(`${at(n)} .at() (Safari 15.4+)`);
    if (n.type === 'Identifier' && L.apis.includes(n.name) && n.name === 'structuredClone') problems.push(`${at(n)} structuredClone (Safari 15.4+)`);
  });
  if (L.noTLA) walk.ancestor(ast, {AwaitExpression(n, anc) { if (!anc.some(a => /Function/.test(a.type))) problems.push(`${at(n)} top-level await (Safari 15+)`); }});
  return problems;
}

let bad = 0, n = 0;
for (const lv of Object.keys(LEVELS)) {
  const jobs = filesFor(lv).map(f => ({file: f, code: fs.readFileSync(f, 'utf8'), module: true}));
  if (lv === 'page') jobs.push(...inlineScripts(path.join(root, 'index.html')));
  if (lv === '3d') jobs.push(...inlineScripts(path.join(root, 'assets/dolina/review/index.html')));
  for (const j of jobs) {
    n++;
    const p = check(j.code, path.relative(root, j.file) || j.file, lv, j.module);
    if (p.length) { bad += p.length; console.log(`✗ [${LEVELS[lv].name}] ${path.relative(root, j.file) || j.file}`); p.slice(0, 8).forEach(x => console.log('   ' + x)); if (p.length > 8) console.log(`   … and ${p.length - 8} more`); }
  }
}
console.log(bad ? `compat: ${bad} problem(s) in ${n} scripts` : `compat: ok, ${n} scripts`);
process.exit(bad ? 1 : 0);
