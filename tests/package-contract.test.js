import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
test('public package preserves the original import subpaths without a server',async()=>{
  const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  assert.equal(pkg.name,'uix-preparatorio');
  assert.deepEqual(pkg.exports,{
    '.':'./src/app/main.js', './styles.css':'./src/web/assets/css/index.css',
    './base.css':'./src/web/assets/css/base.css', './lumino.css':'./src/web/assets/css/lumino.css',
    './components.css':'./src/web/assets/css/components.css', './virtual-layout':'./src/app/virtual-layout.js',
    './compact-layout':'./src/app/compact-layout.js', './logo.svg':'./src/web/assets/images/preparatorio.svg',
    './mark.svg':'./src/web/assets/images/preparatorio-mark.svg',
  });
  await Promise.all(Object.values(pkg.exports).map(p=>access(new URL(p,root))));
  assert.equal(pkg.type,'module');
  assert.equal(pkg.license,'MIT');
  assert.ok(!pkg.dependencies.vite && !pkg.devDependencies?.vite);
  assert.ok(!pkg.scripts.dev && !pkg.scripts.start && !pkg.scripts.serve);
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),['@lumino/application','@lumino/coreutils','@lumino/dragdrop','@lumino/virtualdom','@lumino/widgets']);
});
