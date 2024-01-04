import { bundle } from "./bundle/bundle"
import { createFileSystem, type FileSystem } from "./misc/fs"
import { Resolver } from "./resolve/resolve"
import { rainbowstrip, clr } from './misc/colors'
import { config } from './config'

async function compile(sourceFile: string, fs: FileSystem): Promise<string> {
  const resolver = new Resolver(fs)
  await resolver.resolve(sourceFile)
  return bundle(resolver.modules)
}

async function main() {
  const time = performance.now()

  const fs = await createFileSystem()
  const args = process.argv.slice(2)
  const sourceFile = args[0] ?? config.defaultTestFile
  const outFile = args[1]

  if (sourceFile === undefined) {
    console.error('Usage: poy <source-file> [output-file]')
    process.exit(1)
  }

  // -- header --
  console.log('Compiler started')
  console.clear() // clear doesnt work properly unless there's a console.log before it

  console.log(clr.gray('Compiling: ') + sourceFile)
  console.log(rainbowstrip(8))
  console.log()
  // -- header --

  const output = await compile(sourceFile, fs)

  if (outFile === undefined) {
    console.log(output)
  } else {
    await fs.writeFile(outFile, output)
  }

  // -- footer --
  console.log()
  console.log(clr.greenBright(`──────[ completed in ${((performance.now() - time).toFixed(2))} ms ]──────`))
}

main()
