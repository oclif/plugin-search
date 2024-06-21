/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {Command, loadHelpClass, toConfiguredId, toStandardizedId, ux} from '@oclif/core'
import ansiEscapes from 'ansi-escapes'
import autocomplete from 'inquirer-autocomplete-standalone'
import readline from 'node:readline'

export default class Search extends Command {
  public static description = 'Once you select a command, hit enter and it will show the help for that command.'
  public static summary = 'Search for a command.'

  public async run(): Promise<unknown> {
    this.log(
      `Use ${ux.colorize('bold', '↑')} and ${ux.colorize('bold', '↓')} keys or type to search. Press ${ux.colorize('bold', 'ESC')} to exit.\n`,
    )
    const commandChoices = this.config.commands
      .filter((c) => !c.hidden && !c.aliases.includes(c.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => {
        const name = toConfiguredId(c.id, this.config)
        return {
          description: c.summary,
          name,
          value: name,
        }
      })

    const pageSize = Math.floor(process.stdout.rows < 20 ? process.stdout.rows / 2 : 10)
    const commandPromise = autocomplete<string>({
      emptyText: 'Nothing found!',
      message: 'Search for a command',
      pageSize,
      async source(input) {
        return input ? commandChoices.filter((c) => c.name.includes(input)) : commandChoices
      },
    })

    function cancel() {
      commandPromise.cancel()
      // erase the list of commands
      process.stdout.write(ansiEscapes.eraseLines(pageSize + 3))
    }

    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.on('keypress', (_, key) => {
      if (key.name === 'escape') cancel()

      if (key.name === 'c' && key.ctrl) cancel()
    })

    const command = await commandPromise
      .catch((error) => {
        if (error.message === 'Prompt was canceled') return
        throw error
      })
      .then((result) => result)

    if (!command) return

    const Help = await loadHelpClass(this.config)
    const help = new Help(this.config, this.config.pjson.oclif.helpOptions ?? this.config.pjson.helpOptions)
    return help.showHelp([toStandardizedId(command, this.config)])
  }
}
