import JestHasteMap from "jest-haste-map";
import { cpus } from 'os';
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolve } from "path";
import chalk from "chalk";
import yargs from "yargs";
import Resolver from "jest-resolve";
import fs from 'fs';


const options = yargs(process.argv).argv;
const entryPoint = resolve(process.cwd(), options.entryPoint);

const root = join(dirname(fileURLToPath(import.meta.url)), 'product');



const hasteMapOptions = {
    extensions: ['js'],
    maxWorkers: cpus().length,
    name: 'jest-bundler',
    platforms: [],
    rootDir: root,
    roots: [root],
}

const hasteMap = new JestHasteMap.default(hasteMapOptions);

await hasteMap.setupCachePath(hasteMapOptions);

const { hasteFS, moduleMap } = await hasteMap.build();

if (!hasteFS.exists(entryPoint)) {
    throw new Error(
        '`--entry-point` dose not exist. Please provide a path to a valid file'
    )
}
const resolver = new Resolver.default(moduleMap, {
    extensions: ['.js'],
    hasCoreModules: false,
    rootDir: root,
})





const seen = new Set();
const modules = new Map();
const queue = [entryPoint];

while (queue.length) {
    const module = queue.shift();

    // guard for cycles; 
    if (seen.has(module)) {
        // skip resolved dependencies rather than throw an error;
        continue;
    }

    seen.add(module);

    const dependencyMap = new Map(
        hasteFS
            .getDependencies(module)
            .map(dependencyName => [
                dependencyName,
                resolver.resolveModule(module, dependencyName)
            ])
    )
    console.log('dependencyMap', dependencyMap);
    const code = fs.readFileSync(module, 'utf8');

    const moduleBody = code.match(/module\.exports\s+=\s+(.*?);/)?.[1] || '';
    const metadata = {
        code: moduleBody || code,
        dependencyMap,
    };
    modules.set(module, metadata);
    queue.push(...dependencyMap.values());
}



console.log(chalk.bold(`❯ Building ${chalk.blue(entryPoint)}`))

console.log(chalk.bold(`❯ Serializing bundle`));
for (const [_, metadata] of Array.from(modules).reverse()) {
    let { code } = metadata;
    for (const [dependencyName, dependencyPath] of metadata.dependencyMap) {
        code = code.replace(
            new RegExp(
                // Escape `.` and `/`.
                `require\\(('|")${dependencyName.replace(/[\/.]/g, '\\$&')}\\1\\)`,
            ),
            modules.get(dependencyPath).code
        )
    }
    metadata.code = code;
}

console.log(modules.get(entryPoint).code)