import JestHasteMap from "jest-haste-map";
import { cpus } from 'os';
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolve } from "path";
import chalk from "chalk";
import yargs from "yargs";
import Resolver from "jest-resolve";
import fs from 'fs';
import { Worker } from "jest-worker";

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

let id = 0;

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
    const code = fs.readFileSync(module, 'utf8');

    const metadata = {
        id: id++,
        code,
        dependencyMap,
    };
    modules.set(module, metadata);
    queue.push(...dependencyMap.values());
}



console.log(chalk.bold(`❯ Building ${chalk.blue(entryPoint)}`))

console.log(chalk.bold(`❯ Serializing bundle`));
const wrapModule = (id, code) => `define(${id}, function(module, exports, require) {\n${code}});`;

const worker = new Worker(
    join(dirname(fileURLToPath(import.meta.url)), 'worker.js'),
    {
        enableWorkerThreads: true,
    }
)

const results = await Promise.all(
    Array.from(modules)
        .reverse()
        .map(async ([_, metadata]) => {
            let { id, code } = metadata;
            ({code} = await worker.transformFile(code));
            console.log('code', code)
            for (const [dependencyName, dependencyPath] of metadata.dependencyMap) {
                const dependency = modules.get(dependencyPath);
                code = code.replace(
                    new RegExp(
                        // Escape `.` and `/`.
                        `require\\(('|")${dependencyName.replace(/[\/.]/g, '\\$&')}\\1\\)`,
                    ),
                    `require(${dependency.id})`,
                )
            }

            return wrapModule(id, code);
        })
).catch(e=>{
    console.log(e)
})

worker.end()


const output = [
    fs.readFileSync('./require.js', 'utf8'),
    ...results,
    'requireModule(0);'
].join('\n')

if (options.output) {
    fs.writeFileSync(options.output, output);
}