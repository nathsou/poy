import { exec, execSync } from 'node:child_process'
import chokidar from 'chokidar'
import consola from 'consola'
import { colors } from 'consola/utils'

const EXAMPLES_EXT = '.poy' // it will remember the last file with this extension
const WATCH_PATTERN = [
  './build/**/*.js',
  './examples/*.poy',
]
const BUILD_WATCHER_COMMAND = 'npm run watch --silent'
const RUN_ON_CHANGE_COMMAND = 'node --enable-source-maps ./build/poy.js' // example file is appended to this command

consola.box('Compiler & Tests Watcher')
// ----------------------------------------------------------------------
consola.start(colors.gray('Watch starting'))
runRaw(BUILD_WATCHER_COMMAND, { async: true })
consola.ready('Watch started')
// ----------------------------------------------------------------------
watcher({
  pattern: WATCH_PATTERN,
  onSuccess: execute,
})

// ----------------------------------------------------------------------
let exampleFile = ''

function overrideLastLine() {
  process.stdout.moveCursor(0, -1) // up one line
  process.stdout.clearLine(1) // from cursor to end
}

function watcher({ pattern = '', onSuccess = () => { } }) {
  const opts = {
    ignored: /node_modules|\.git/,
    persistent: true,
    followSymlinks: false,
  }
  let firstRun = true, delayedExecute = false
  setTimeout(() => {
    firstRun = false
    if (delayedExecute) onSuccess()
  }, 2000)

  chokidar.watch(pattern, opts)
    .on('change', (event, path) => {
      // consola.log(event)
      if (event.endsWith(EXAMPLES_EXT)) exampleFile = event
      if (!firstRun) {
        overrideLastLine()
        consola.info(event)
        onSuccess()
      } else {
        delayedExecute = true
      }
    })
    .on('ready', () => {
      consola.ready('Chokidar ready')
      if (!firstRun) {
        onSuccess()
      } else {
        delayedExecute = true
      }
    }).on('error', (error) => {
      if (firstRun) delayedExecute = false
      consola.error(error)
    })
}

const run = debounce(runRaw, 100)

let building = false
function execute() {
  if (building) {
    overrideLastLine()
    consola.log(colors.gray('Skip due to building in progress...'))
    return
  }
  building = true
  overrideLastLine()
  consola.start('Running...', exampleFile)
  run(RUN_ON_CHANGE_COMMAND + ' ' + exampleFile, false, () => {
    building = false
  })
}

function runRaw(command, { async = false }, onExit = () => { }) {
  try {
    let proc
    if (async) {
      proc = exec(command, { stdio: 'inherit' })

      proc.on('close', (code) => {
        consola.success(command + `: exited with ${code}`)
        onExit()
      })
      proc.stdout.on('data', (x) => {
        overrideLastLine()
        process.stdout.write(x)
      })
      proc.stderr.on('data', (x) => {
        process.stderr.write(x)
      })
    } else {
      proc = execSync(command, { stdio: 'inherit' })
      onExit()
    }

    consola.success(colors.gray('Run finished: ' + command))
  } catch (e) {
    consola.fail('Run failed:', command)
    onExit()
  }
  consola.log(colors.gray('Waiting for changes...'))
}

function debounce(func, wait = 1000, immediate = false) {
  let timeout
  return function () {
    const context = this, args = arguments
    const later = function () {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(context, args)
  }
}
