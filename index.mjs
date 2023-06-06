import JestHasteMap from "jest-haste-map";
import { cpus } from 'os';
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolve } from "path";
import chalk from "chalk";
import yargs from "yargs";
import Resolver from "jest-resolve";
import { DependencyResolver } from "jest-resolve-dependencies";

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

const dependencyResolver = new DependencyResolver(resolver, hasteFS);



console.log(dependencyResolver.resolve(entryPoint));


const allFiles = new Set();
const queue = [entryPoint];

while(queue.length){
    const module = queue.shift();
    
    // guard for cycles; 
    if(allFiles.has(module)){
        // skip resolved dependencies rather than throw an error;
        continue;
    }
    
    allFiles.add(module);
    queue.push(...dependencyResolver.resolve(module));
}


console.log(chalk.bold(`❯ Building ${chalk.blue(entryPoint)}`))
console.log(chalk.bold(`❯ Found ${chalk.blue(allFiles.size)} files`));
console.log(Array.from(allFiles));